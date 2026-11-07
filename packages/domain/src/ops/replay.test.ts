import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { companyTypes, VERSION_1_ID, VERSION_2_ID, VERSION_3_ID } from '../../fixtures/company-types/op-log.ts';
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

describe('Story 14.6: the AD-3 log with company types (kernel reference)', () => {
  it('replays a type, its second version, a retired type and a block of each version into a snapshot naming the three versions', () => {
    const snapshot = buildSnapshot(replay(companyTypes.log), companyTypes.relatorioId);
    expect(snapshot.equipment_types?.map((row) => row.id)).toEqual([VERSION_1_ID, VERSION_2_ID, VERSION_3_ID]);
    expect(snapshot.blocks).toHaveLength(3);
    // The canonical text parses back to the same bytes, `equipment_types` included.
    const text = serializeSnapshot(snapshot);
    expect(serializeSnapshot(relatorioSnapshotSchema.parse(JSON.parse(text)))).toBe(text);
  });

  it('is independent of the array order when seq is present', () => {
    const shuffled = [...companyTypes.log].reverse();
    expect(serializeSnapshot(buildSnapshot(replay(shuffled), companyTypes.relatorioId))).toBe(serializeSnapshot(buildSnapshot(replay(companyTypes.log), companyTypes.relatorioId)));
  });
});
