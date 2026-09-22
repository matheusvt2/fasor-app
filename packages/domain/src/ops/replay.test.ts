import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CABINE_ID, deadOpIds, opLog, replaySmall } from '../../fixtures/replay-small/op-log.ts';
import type { LocationRow } from '../schemas/entities.ts';
import { buildSnapshot, relatorioSnapshotSchema, serializeSnapshot } from '../schemas/snapshot.ts';
import { entityKey } from './apply.ts';
import { orderLog, replay } from './replay.ts';

const goldenPath = new URL('../../fixtures/replay-small/snapshot.golden.json', import.meta.url);

describe('1.4-INT-001 replay byte-equality (kernel reference)', () => {
  it('replays the small fixture into the golden snapshot', () => {
    const state = replay(replaySmall.log, { deadOpIds: replaySmall.deadOpIds });
    const snapshot = buildSnapshot(state, replaySmall.relatorioId);
    const text = readFileSync(goldenPath, 'utf8');
    expect(serializeSnapshot(snapshot)).toBe(text.trimEnd());
  });

  it('keeps the golden file canonical', () => {
    const text = readFileSync(goldenPath, 'utf8');
    const parsed = relatorioSnapshotSchema.parse(JSON.parse(text));
    expect(serializeSnapshot(parsed) + '\n').toBe(text);
    expect(serializeSnapshot(relatorioSnapshotSchema.parse(replaySmall.golden))).toBe(text.trimEnd());
  });

  it('excludes dead op ids from the state', () => {
    expect(deadOpIds).toHaveLength(1);
    const withDead = replay(opLog);
    const withoutDead = replay(opLog, { deadOpIds });
    expect((withDead.get(entityKey('location', CABINE_ID)) as LocationRow).name).toBe('MUST NOT APPEAR');
    expect((withoutDead.get(entityKey('location', CABINE_ID)) as LocationRow).name).toBe('Cabine principal');
  });

  it('orders by seq, unsequenced ops last in array order', () => {
    const [a, b, c, d] = opLog;
    const ordered = orderLog([{ ...c!, seq: 3 }, { ...a!, seq: undefined }, { ...d!, seq: undefined }, { ...b!, seq: 1 }]);
    expect(ordered.map((op) => op.op_id)).toEqual([b!.op_id, c!.op_id, a!.op_id, d!.op_id]);
  });

  it('is independent of the array order when seq is present', () => {
    const shuffled = [...opLog].reverse();
    const a = serializeSnapshot(buildSnapshot(replay(shuffled, { deadOpIds }), replaySmall.relatorioId));
    const b = serializeSnapshot(buildSnapshot(replay(opLog, { deadOpIds }), replaySmall.relatorioId));
    expect(a).toBe(b);
  });
});
