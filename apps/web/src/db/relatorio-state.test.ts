// @vitest-environment node
import 'fake-indexeddb/auto';
import { buildSnapshot, makeOp, serializeSnapshot, type EntityRow, type OpInput } from '@app/domain';
import { BLOCK_1_ID, COMPANY_ID, RELATORIO_ID, replaySmall, USER_ID } from '@app/domain/fixtures/replay-small';
import { describe, expect, it } from 'vitest';
import { commitOps, toRecord } from './commit.ts';
import { relatorioState } from './home-store.ts';
import { relatorioSnapshotOf } from './relatorio-snapshot.ts';
import { openDatabase, type AppDatabase } from './schema.ts';
import { toSnapshot } from './snapshot.ts';

/*
 * E7-A1/E8-A1: `relatorioState` reads the relatório's index once and keeps every row a
 * commit did not touch the same object across live-query runs (its per-write `rev`), so
 * the incremental snapshot builder shares them too. This is the gate spec the mutation run
 * reverts against.
 */

let counter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-00c1-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

let n = 0;
const deps = { newId: () => `019966b0-00c2-7000-8000-${(++n).toString(16).padStart(12, '0')}`, now: new Date('2026-09-28T12:00:00.000Z') };
const put = (path: string, value: OpInput['value']) =>
  makeOp({ kind: 'put', scope: 'relatorio', company_id: COMPANY_ID, relatorio_id: RELATORIO_ID, path, value, actor_id: USER_ID, device_id: 'tablet-a' }, deps);

async function seeded(): Promise<AppDatabase> {
  const db = await freshDb();
  await commitOps(db, replaySmall.log.filter((op) => !replaySmall.deadOpIds.includes(op.op_id)));
  return db;
}

describe('E9C1-UNIT-003 relatorioState keeps untouched rows identical across reads', () => {
  it('after a commit to one block, every other row of the state is the object the previous read returned', async () => {
    const db = await seeded();
    const before = (await relatorioState(db, RELATORIO_ID))!;
    await commitOps(db, [put(`sheet/${BLOCK_1_ID}/observations`, 'Observação nova.')]);
    const after = (await relatorioState(db, RELATORIO_ID))!;

    expect(after).not.toBe(before);
    const changed = `block:${BLOCK_1_ID}` as const;
    expect(after.get(changed)).not.toBe(before.get(changed));
    expect((after.get(changed) as { sheet: { observations: { value: unknown } } }).sheet.observations.value).toBe('Observação nova.');
    let shared = 0;
    for (const [key, row] of after) {
      if (key === changed) continue;
      expect(row, key).toBe(before.get(key));
      shared += 1;
    }
    expect(shared).toBeGreaterThan(5);

    // The shared incremental snapshot keeps the other blocks and the locations as they were,
    // and equals the full rebuild.
    const s1 = relatorioSnapshotOf(before, RELATORIO_ID);
    const s2 = relatorioSnapshotOf(after, RELATORIO_ID);
    for (const block of s2.blocks) if (block.id !== BLOCK_1_ID) expect(block).toBe(s1.blocks.find((b) => b.id === block.id));
    expect(s2.locations).toBe(s1.locations);
    expect(serializeSnapshot(s2)).toBe(serializeSnapshot(buildSnapshot(after, RELATORIO_ID)));
    expect(serializeSnapshot(s2)).toBe(serializeSnapshot((await toSnapshot(db, RELATORIO_ID))!));
    db.close();
  });

  it('a read that finds nothing changed returns the previous state itself', async () => {
    const db = await seeded();
    const first = await relatorioState(db, RELATORIO_ID);
    expect(await relatorioState(db, RELATORIO_ID)).toBe(first);
    db.close();
  });

  it('never serves a stale row: a record rewritten with new content is read anew', async () => {
    const db = await seeded();
    const first = (await relatorioState(db, RELATORIO_ID))!;
    const key = `block:${BLOCK_1_ID}` as const;
    const row = first.get(key) as EntityRow & { order_key: string };
    await db.entities.put(toRecord(key, { ...row, order_key: 'zz' } as EntityRow));
    const second = (await relatorioState(db, RELATORIO_ID))!;
    expect((second.get(key) as { order_key: string }).order_key).toBe('zz');
    db.close();
  });

  it('never serves a stale row: a write that copies a record, its old `rev` included, gets a fresh stamp and is read anew', async () => {
    const db = await seeded();
    const first = (await relatorioState(db, RELATORIO_ID))!;
    const record = (await db.entities.get(['relatorio', RELATORIO_ID]))!;
    await db.entities.put({ ...record, row: { ...(record.row as object), status: 'rascunho' } as never });
    expect((await db.entities.get(['relatorio', RELATORIO_ID]))!.rev).not.toBe(record.rev);
    const second = (await relatorioState(db, RELATORIO_ID))!;
    expect((second.get(`relatorio:${RELATORIO_ID}`) as { status: string }).status).toBe('rascunho');
    expect(second).not.toBe(first);
    db.close();
  });

  it('a record written before `rev` existed is parsed on every read (correct, just not shared)', async () => {
    const db = await seeded();
    const key = `block:${BLOCK_1_ID}` as const;
    const record = (await db.entities.get(['block', BLOCK_1_ID]))!;
    const legacy = { ...record };
    delete legacy.rev;
    // Written the way an older bundle did, below Dexie's middleware (which stamps every write).
    await new Promise<void>((resolve, reject) => {
      const tx = db.backendDB().transaction('entities', 'readwrite');
      tx.objectStore('entities').put(legacy);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    expect((await db.entities.get(['block', BLOCK_1_ID]))!.rev).toBeUndefined();
    const first = (await relatorioState(db, RELATORIO_ID))!;
    const second = (await relatorioState(db, RELATORIO_ID))!;
    expect(second.get(key)).toEqual(first.get(key));
    expect(second.get(key)).not.toBe(first.get(key));
    db.close();
  });
});
