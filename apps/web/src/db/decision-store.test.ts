// @vitest-environment node
import 'fake-indexeddb/auto';
import { entityKey, replay, type BlockRow, type RelatorioRow } from '@app/domain';
import { BLOCK_1_ID, BLOCK_2_ID, opLog, RELATORIO_ID, USER_ID } from '@app/domain/fixtures/replay-small';
import { describe, expect, it } from 'vitest';
import { toRecord } from './commit.ts';
import { heldDecisions } from './decision-store.ts';
import { openDatabase, type AppDatabase } from './schema.ts';

/*
 * W-5 (full review 2026-09-30): the held decisions read the blocks of the live relatórios
 * through `[entity+relatorio_id]`, grouped once, and skip a relatório with no conflict mark
 * and no duplicate TAG; what they return is unchanged.
 */

const OTHER = '019966b0-0077-7000-8000-000000000001';
const GONE = '019966b0-0077-7000-8000-000000000002';
const OTHER_BLOCK = '019966b0-0077-7000-8000-000000000003';
const GONE_BLOCK = '019966b0-0077-7000-8000-000000000004';

let counter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0078-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

const mark = { removed_by: USER_ID, removed_at: '2026-09-30T10:00:00.000Z', edited_by: USER_ID, edited_at: '2026-09-30T09:59:00.000Z' };

describe('W-5 heldDecisions', () => {
  it('lists only the live relatórios holding a decision, each with its own blocks', async () => {
    const db = await freshDb();
    const state = new Map(replay(opLog));
    const relatorio = state.get(entityKey('relatorio', RELATORIO_ID)) as RelatorioRow;
    const block1 = state.get(entityKey('block', BLOCK_1_ID)) as BlockRow;
    const block2 = state.get(entityKey('block', BLOCK_2_ID)) as BlockRow;
    // The fixture's relatório: one block removed while another device edited it.
    state.set(entityKey('block', BLOCK_1_ID), { ...block1, removed_at: mark.removed_at, removed_by: USER_ID, removal_conflict: mark });
    // Another live relatório of the project with a plain block, and a removed one with a mark.
    state.set(entityKey('relatorio', OTHER), { ...relatorio, id: OTHER });
    state.set(entityKey('block', OTHER_BLOCK), { ...block2, id: OTHER_BLOCK, relatorio_id: OTHER });
    state.set(entityKey('relatorio', GONE), { ...relatorio, id: GONE, removed_at: '2026-09-30T08:00:00.000Z' });
    state.set(entityKey('block', GONE_BLOCK), { ...block1, id: GONE_BLOCK, relatorio_id: GONE, removed_at: mark.removed_at, removal_conflict: mark });
    await db.entities.bulkPut([...state].map(([key, row]) => toRecord(key, row)));

    const held = await heldDecisions(db);
    expect(held.map((entry) => entry.relatorioId)).toEqual([RELATORIO_ID]);
    const [entry] = held;
    expect(entry!.decisions.map((decision) => [decision.kind, (decision as { block_id?: string }).block_id])).toEqual([['block_removal', BLOCK_1_ID]]);
    const own = [...state.values()].filter((row): row is BlockRow => 'sheet' in row && (row as BlockRow).relatorio_id === RELATORIO_ID);
    expect(entry!.blocks.map((block) => block.id).sort()).toEqual(own.map((block) => block.id).sort());
    db.close();
  });
});
