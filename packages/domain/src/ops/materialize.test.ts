import { describe, expect, it } from 'vitest';
import { BLOCK_1_ID, CABINE_ID, deadOpIds, opLog, replaySmall } from '../../fixtures/replay-small/op-log.ts';
import type { BlockRow, LocationRow } from '../schemas/entities.ts';
import { entityKey, splitEntityKey, targetsOf } from './apply.ts';
import { materializeEntity } from './materialize.ts';
import type { Op } from './op.ts';
import { replay } from './replay.ts';

const FIELD = `sheet/${BLOCK_1_ID}/nameplate/fabricante`;

/** The fixture ops whose targets include the key, as the Dexie `*targets` index would return them. */
function targeting(key: string, log: readonly Op[]): Op[] {
  return log.filter((op) => targetsOf(op).some((ref) => ref.key === key));
}

describe('1.5-UNIT-001 materializeEntity', () => {
  it('remote-only equals replay() for every entity of the small fixture', () => {
    const reference = replay(opLog);
    expect(reference.size).toBeGreaterThan(5);
    for (const [key, row] of reference) {
      const ref = splitEntityKey(key);
      expect(materializeEntity(ref, targeting(key, opLog), [])).toEqual(row);
    }
  });

  it('is independent of the array order of the remote ops (seq wins)', () => {
    const key = entityKey('block', BLOCK_1_ID);
    const ordered = materializeEntity(splitEntityKey(key), targeting(key, opLog), []);
    const shuffled = materializeEntity(splitEntityKey(key), [...targeting(key, opLog)].reverse(), []);
    expect(shuffled).toEqual(ordered);
  });

  it('a local put wins over a remote put on the same path (rebase), and converges once pulled back', () => {
    const key = entityKey('block', BLOCK_1_ID);
    const remote = targeting(key, opLog);
    const template = remote.find((op) => op.path === FIELD)!;
    const local: Op = {
      ...template,
      op_id: '019966b0-0001-7000-8000-00000000ff01',
      value: 'LOCAL',
      prev_op_id: template.op_id,
      seq: undefined,
      client_ts: '2026-09-21T09:00:00.000Z',
    };
    const rebased = materializeEntity(splitEntityKey(key), remote, [local]) as BlockRow;
    expect(rebased.sheet.nameplate.fabricante?.value).toBe('LOCAL');
    expect(rebased.sheet.nameplate.fabricante?.op_id).toBe(local.op_id);

    // Pulled back (seq 1000) with another device's put applied after it (seq 1001): the server order decides.
    const pulledBack = { ...local, seq: 1000 };
    const other: Op = { ...template, op_id: '019966b0-0001-7000-8000-00000000ff02', value: 'OTHER', seq: 1001 };
    const converged = materializeEntity(splitEntityKey(key), [...remote, pulledBack, other], [local]) as BlockRow;
    expect(converged.sheet.nameplate.fabricante?.value).toBe('OTHER');
  });

  it('an op left out of local (dead) leaves no trace', () => {
    const key = entityKey('location', CABINE_ID);
    const remote = targeting(key, opLog).filter((op) => !deadOpIds.includes(op.op_id) && op.seq! < 55);
    const dead = opLog.find((op) => op.op_id === deadOpIds[0])!;
    const withDead = materializeEntity(splitEntityKey(key), remote, [{ ...dead, seq: undefined }]) as LocationRow;
    const without = materializeEntity(splitEntityKey(key), remote, []) as LocationRow;
    expect(withDead.name).toBe('MUST NOT APPEAR');
    expect(without.name).toBe('Cabine principal');
    expect(without).toEqual(replay(replaySmall.log, { deadOpIds }).get(key));
  });

  it('returns null for an entity no op creates', () => {
    const key = entityKey('block', BLOCK_1_ID);
    const puts = targeting(key, opLog).filter((op) => op.kind !== 'create');
    expect(materializeEntity(splitEntityKey(key), puts, [])).toBeNull();
    expect(materializeEntity({ entity: 'block', id: BLOCK_1_ID }, [], [])).toBeNull();
  });

  it('applies local ops in op_id order and skips those already among the remote ids', () => {
    const key = entityKey('block', BLOCK_1_ID);
    const remote = targeting(key, opLog);
    const template = remote.find((op) => op.path === FIELD)!;
    const a: Op = { ...template, op_id: '019966b0-0001-7000-8000-00000000ff01', value: 'A', seq: undefined };
    const b: Op = { ...template, op_id: '019966b0-0001-7000-8000-00000000ff02', value: 'B', seq: undefined };
    const row = materializeEntity(splitEntityKey(key), remote, [b, a]) as BlockRow;
    expect(row.sheet.nameplate.fabricante?.value).toBe('B');
    const acked = materializeEntity(splitEntityKey(key), [...remote, { ...b, seq: 1 }], [b, a]) as BlockRow;
    // b is now remote (seq 1, before every fixture op); a is the only local op and lands last.
    expect(acked.sheet.nameplate.fabricante?.value).toBe('A');
  });
});
