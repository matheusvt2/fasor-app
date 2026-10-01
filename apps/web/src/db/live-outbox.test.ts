// @vitest-environment node
import 'fake-indexeddb/auto';
import { makeOp, type OpInput } from '@app/domain';
import { COMPANY_ID, RELATORIO_ID, USER_ID } from '@app/domain/fixtures/replay-small';
import { liveQuery } from 'dexie';
import { describe, expect, it } from 'vitest';
import { commitOps } from './commit.ts';
import { openDatabase } from './schema.ts';
import { outboxRows } from './sync-store.ts';

/*
 * W-1 (full review 2026-09-30): the SyncProvider reads `outboxRows` (now a status-filtered
 * read) through a live query, so a row committed after the subscription must reach it.
 */
describe('W-1 outboxRows, live', () => {
  it('a row committed after the subscription reaches the live outbox read', async () => {
    const db = openDatabase('019966b0-0099-7000-8000-000000000001');
    await db.delete();
    await db.open();
    const seen: number[] = [];
    const subscription = liveQuery(() => outboxRows(db)).subscribe((rows) => seen.push(rows.length));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const input: OpInput = {
      kind: 'put',
      scope: 'relatorio',
      company_id: COMPANY_ID,
      relatorio_id: RELATORIO_ID,
      path: 'relatorio/setup/additional_info',
      value: 'x',
      actor_id: USER_ID,
      device_id: 'tablet-a',
    };
    let n = 0;
    const newId = () => `019966b0-0098-7000-8000-${(++n).toString(16).padStart(12, '0')}`;
    await commitOps(db, [makeOp(input, { newId, now: new Date('2026-09-21T15:00:00.000Z') })]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    subscription.unsubscribe();
    expect(seen.at(-1)).toBe(1);
    db.close();
  });
});
