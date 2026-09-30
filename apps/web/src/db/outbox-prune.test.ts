// @vitest-environment node
import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { makeOp, OUTBOX_ACKED_RETENTION_MS, syncCounts, type Op, type OpDraft, type OpInput } from '@app/domain';
import { BLOCK_1_ID, COMPANY_ID, RELATORIO_ID, replaySmall, USER_ID } from '@app/domain/fixtures/replay-small';
import { describe, expect, it } from 'vitest';
import { commitBatch, commitFileBatch, commitOps, lastAppliedOpId, opOf, undoBatch } from './commit.ts';
import { pendingUploads } from './file-store.ts';
import { editedSinceSnapshot, lastOpIdFor } from './generate-store.ts';
import { openDatabase, type AppDatabase } from './schema.ts';
import { applyPulled, markAcked, markDead, markSent, notTestedSynced, outboxRows, pruneOutbox, takePending } from './sync-store.ts';

/*
 * W-1 (full review 2026-09-30): the device outbox is pruned after every sync cycle. Only an
 * `acked` row the server log holds on this device (pulled back into `remote_ops`) and older
 * than the kernel's retention goes; every reader that looked at the outbox answers as it did
 * before the prune.
 */

const T0 = Date.parse('2026-09-21T15:00:00.000Z');
/** An hour after the commits: every row committed at T0 is past the retention. */
const LATER = new Date(T0 + 60 * 60 * 1000);
const FIELD = `sheet/${BLOCK_1_ID}/nameplate/fabricacao`;
const NOT_TESTED = `block/${BLOCK_1_ID}/not_tested`;
const FILE_ID = '019966b0-0000-7000-8000-0000000000f1';

let userCounter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0071-7000-8000-${(++userCounter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

function ids(prefix = '019966b0-0072-7000-8000-') {
  let n = 0;
  return () => `${prefix}${(++n).toString(16).padStart(12, '0')}`;
}

function put(path: string, value: OpInput['value']): OpInput {
  return { kind: 'put', scope: 'relatorio', company_id: COMPANY_ID, relatorio_id: RELATORIO_ID, path, value, actor_id: USER_ID, device_id: 'tablet-a' };
}

/** The fixture log up to and including the first block create, as the server's pulled log. */
async function seed(db: AppDatabase): Promise<void> {
  const upTo = replaySmall.log.findIndex((op) => op.path === `block/${BLOCK_1_ID}` && op.kind === 'create');
  await applyPulled(db, replaySmall.log.slice(0, upTo + 1));
}

let serverSeq = 10_000;

/** Pushes every pending row (acked by the server) and, unless `pullBack` is false, pulls them back. */
async function push(db: AppDatabase, options: { pullBack?: boolean } = {}): Promise<Op[]> {
  const pending = await takePending(db);
  await markSent(db, pending.map((row) => row.op_id));
  const acked = pending.map((row) => ({ op_id: row.op_id, seq: ++serverSeq }));
  await markAcked(db, acked);
  const logged = pending.map((row, i) => ({ ...opOf(row), seq: acked[i]!.seq }));
  if (options.pullBack !== false) await applyPulled(db, logged);
  return logged;
}

async function commitAt(db: AppDatabase, input: OpInput, at: number, newId: () => string): Promise<Op> {
  const [op] = await commitOps(db, [makeOp(input, { newId, now: new Date(at) })], { newId });
  return op!;
}

describe('W-1 pruneOutbox', () => {
  it('deletes an acked row pulled back and older than the retention; keeps pending, sent, dead and young rows', async () => {
    const db = await freshDb();
    const newId = ids();
    await seed(db);
    const old = await commitAt(db, put(FIELD, 'A'), T0, newId);
    await push(db);
    const young = await commitAt(db, put(FIELD, 'B'), LATER.getTime() - 60_000, newId);
    await push(db);
    const sent = await commitAt(db, put(FIELD, 'C'), T0 + 1000, newId);
    await markSent(db, [sent.op_id]);
    const dead = await commitAt(db, put(FIELD, 'D'), T0 + 2000, newId);
    await markDead(db, [{ op_id: dead.op_id, code: 'op_invalid' }]);
    const pending = await commitAt(db, put(FIELD, 'E'), T0 + 3000, newId);

    expect(await pruneOutbox(db, LATER)).toBe(1);
    const kept = (await db.outbox.toArray()).map((row) => row.op_id).sort();
    expect(kept).toEqual([young.op_id, sent.op_id, dead.op_id, pending.op_id].sort());
    expect(await db.outbox.get(old.op_id)).toBeUndefined();
    // The pulled copy stays: the server log is the device's record of the op.
    expect(await db.remote_ops.get(old.op_id)).toBeDefined();
    db.close();
  });

  it('keeps an acked row the server log does not hold on this device yet, however old (the pulled-back guard)', async () => {
    const db = await freshDb();
    const newId = ids();
    await seed(db);
    const acked = await commitAt(db, put(FIELD, 'A'), T0, newId);
    await push(db, { pullBack: false });
    expect((await db.outbox.get(acked.op_id))?.status).toBe('acked');
    expect(await pruneOutbox(db, new Date(T0 + 10 * OUTBOX_ACKED_RETENTION_MS))).toBe(0);
    expect((await db.outbox.get(acked.op_id))?.status).toBe('acked');
    db.close();
  });

  it('the readers answer as before the prune: counts, lastAppliedOpId, notTestedSynced, editedSinceSnapshot, lastOpIdFor', async () => {
    const db = await freshDb();
    const newId = ids();
    await seed(db);
    const snapshotSeq = serverSeq;
    // An older not-tested mark the server refused, then a newer one it took (pulled back).
    const refused = await commitAt(db, put(NOT_TESTED, { reason: 'outro', text: 'x', at: new Date(T0).toISOString(), by: USER_ID }), T0, newId);
    await markDead(db, [{ op_id: refused.op_id, code: 'op_invalid' }]);
    await commitAt(db, put(NOT_TESTED, null), T0 + 1000, newId);
    await commitAt(db, put(FIELD, 'WEG'), T0 + 2000, newId);
    await commitAt(db, put(FIELD, 'WEG S.A.'), T0 + 3000, newId);
    await push(db);
    // One edit still waiting to be sent.
    const waiting = await commitAt(db, put(`sheet/${BLOCK_1_ID}/nameplate/tipo`, 'X'), T0 + 4000, newId);

    const readAll = async () => ({
      counts: syncCounts(await outboxRows(db)),
      prev: await lastAppliedOpId(db, makeOp(put(FIELD, 'next'), { newId, now: LATER })),
      prevWaiting: await lastAppliedOpId(db, makeOp(put(waiting.path, 'next'), { newId, now: LATER })),
      notTested: await notTestedSynced(db, BLOCK_1_ID),
      editedSince: await editedSinceSnapshot(db, RELATORIO_ID, snapshotSeq),
      editedSinceHead: await editedSinceSnapshot(db, RELATORIO_ID, serverSeq),
      lastOp: await lastOpIdFor(db, RELATORIO_ID),
    });
    const before = await readAll();
    // The live read shows every row but the acked ones, and counts as the whole outbox does.
    expect(before.counts).toEqual(syncCounts(await db.outbox.toArray()));
    expect(before.notTested).toBe(true);
    expect(await pruneOutbox(db, LATER)).toBe(3);
    expect(await readAll()).toEqual(before);
    db.close();
  });

  it('undoBatch finds every row of a batch younger than the retention', async () => {
    const db = await freshDb();
    const newId = ids();
    await seed(db);
    const now = () => new Date(T0);
    const { batch_id, ops } = await commitBatch(db, [put(FIELD, 'WEG'), put(`sheet/${BLOCK_1_ID}/nameplate/tipo`, 'X')], { newId, now });
    await push(db);
    // The undo toast lasts 6 s: a cycle then prunes nothing of the batch.
    expect(await pruneOutbox(db, new Date(T0 + 6000))).toBe(0);
    const inverses = await undoBatch(db, batch_id, { newId, now: () => new Date(T0 + 6000) });
    expect(inverses).toHaveLength(ops.length);
    db.close();
  });

  it('pendingUploads still lists a file whose acked create op the prune removed', async () => {
    const db = await freshDb();
    const newId = ids();
    const base: Omit<OpDraft, 'kind' | 'path' | 'value'> = {
      scope: 'company',
      company_id: COMPANY_ID,
      project_id: null,
      relatorio_id: null,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: USER_ID,
    };
    const create: OpDraft = {
      ...base,
      kind: 'create',
      path: `file/${FILE_ID}`,
      value: {
        id: FILE_ID,
        company_id: COMPANY_ID,
        relatorio_id: null,
        kind: 'certificate',
        sha256: 'deadbeef',
        mime: 'application/pdf',
        size: 4,
        uploaded_at: null,
        variants: null,
        removed_at: null,
      } as never,
    };
    await commitFileBatch(db, { ops: [create], blob: new NodeBlob(['abcd']) as unknown as Blob, fileId: FILE_ID }, { newId, now: () => new Date(T0) });
    await push(db);
    const before = (await pendingUploads(db)).map((upload) => upload.id);
    expect(before).toEqual([FILE_ID]);
    expect(await pruneOutbox(db, LATER)).toBe(1);
    expect(await db.outbox.count()).toBe(0);
    expect((await pendingUploads(db)).map((upload) => upload.id)).toEqual(before);
    db.close();
  });
});
