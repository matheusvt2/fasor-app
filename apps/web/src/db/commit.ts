import {
  advanceOnEdit,
  applyOp,
  clearedMarks,
  coalesce,
  inRelatorioStream,
  invertBatch,
  makeOp,
  putRelatorioStatusOp,
  readPath,
  referencedEquipmentIds,
  rowIndexColumns,
  rowRemovedAt,
  splitEntityKey,
  stampSeen,
  targetsOf,
  toIso,
  type Clock,
  type EntityKey,
  type EntityRow,
  type NewId,
  type Op,
  type OpDraft,
  type RelatorioRow,
  type RestoreMarks,
} from '@app/domain';
import { blockRowsOf, relatoriosOfProject } from './home-store.ts';
import { PHOTO_SEQ_PREF, targetKeysOf, type AppDatabase, type EntityRecord, type OutboxRow } from './schema.ts';
import { newId as mintId } from '../ids.ts';
import { deviceId } from './device-id.ts';

/*
 * AD-1, AD-3: the only write path of apps/web for user changes. Every op is
 * appended to the outbox and applied through `applyOp` in one `rw` transaction
 * over `entities` and `outbox`; a failure leaves both untouched. Pulled ops
 * arrive through `sync-store.ts`.
 */

export interface CommitDeps {
  newId: NewId;
  now: Clock;
}

export function toRecord(key: EntityKey, row: EntityRow): EntityRecord {
  const { entity, id } = splitEntityKey(key);
  return { entity, id, ...rowIndexColumns(entity, row), removed_at: rowRemovedAt(row), row };
}

const OUTBOX_ONLY_KEYS = ['status', 'error_code', 'prev_value', 'prev_marks', 'targets'] as const;

/** The op an outbox row carries, without the outbox-only columns. */
export function opOf(row: OutboxRow): Op {
  const op: Partial<OutboxRow> = { ...row };
  for (const key of OUTBOX_ONLY_KEYS) delete op[key];
  return op as Op;
}

/**
 * Applies one op to its rows and appends it to the outbox; returns the op as committed.
 * Stories 10.2/10.3: the op is first stamped with what this device's rows held
 * (`stampSeen`: the standing cell's op on a `sheet/*` put, the block's `last_modified_at`
 * on a `removed_at` write), read here, right before the apply, so a later op of the same
 * batch sees the earlier one; commits and undo inverses alike.
 */
async function applyOne(db: AppDatabase, input: Op): Promise<Op> {
  const refs = targetsOf(input);
  const records = await db.entities.bulkGet(refs.map((r) => [r.entity, r.id] as [typeof r.entity, string]));
  const state = new Map<EntityKey, EntityRow>();
  records.forEach((record, i) => {
    if (record) state.set(refs[i]!.key, record.row);
  });
  const op = stampSeen(input, state);
  const prev_value = readPath(state, op);
  const next = applyOp(state, op);
  // E10-Q2: the conflict marks this apply cleared, kept for the undo (`undoBatch`).
  const prev_marks = clearedMarks(state, op, next);
  const changed: EntityRecord[] = [];
  for (const [key, row] of next) if (row !== state.get(key)) changed.push(toRecord(key, row));
  if (changed.length > 0) await db.entities.bulkPut(changed);

  const targets = refs.map((r) => r.key);
  const last = await db.outbox.orderBy('client_ts').last();
  if (last?.status === 'pending') {
    const merged = coalesce(opOf(last), op);
    if (merged) {
      await db.outbox.delete(last.op_id);
      await db.outbox.put({
        ...merged,
        status: 'pending',
        error_code: null,
        targets: targetKeysOf(merged),
        ...('prev_value' in last ? { prev_value: last.prev_value } : {}),
        ...(last.prev_marks === undefined ? {} : { prev_marks: last.prev_marks }),
      });
      return op;
    }
  }
  await db.outbox.put({
    ...op,
    status: 'pending',
    error_code: null,
    targets,
    ...(prev_value === undefined ? {} : { prev_value }),
    ...(prev_marks === undefined ? {} : { prev_marks }),
  });
  return op;
}

/**
 * Commits ops in order: outbox append (or coalesce) plus `applyOp`, atomically. Every op
 * is stamped with this device's minted id first (AD-3), whatever `device_id` the caller
 * built it with, so no write path of apps/web chooses it. Returns the ops as committed.
 */
export async function commitOps(
  db: AppDatabase,
  ops: readonly Op[],
  deps: { newId: NewId } = { newId: mintId },
): Promise<Op[]> {
  const device_id = await deviceId(db, deps.newId);
  const stamped = ops.map((op) => ({ ...op, device_id }));
  const committed: Op[] = [];
  await db.transaction('rw', db.entities, db.outbox, async () => {
    for (const op of stamped) committed.push(await applyOne(db, op));
  });
  return committed;
}

/** Commit order of this device's ops: `client_ts`, then `op_id` for a tie. The one comparator of `src/db`. */
export const byClientTsThenOpId = (a: { client_ts: string; op_id: string }, b: { client_ts: string; op_id: string }) =>
  a.client_ts < b.client_ts ? -1 : a.client_ts > b.client_ts ? 1 : a.op_id < b.op_id ? -1 : a.op_id > b.op_id ? 1 : 0;

/**
 * AD-3's `prev_op_id`: the last op this device applied on the op's path, or null when
 * none. The device's own ops the server log does not hold yet (pending, sent, or acked but
 * not pulled back) were applied on top of that log, so the newest of them wins; otherwise
 * the pulled op with the highest `seq`. Dead ops were never applied (AD-24). Like the
 * server's check, an op that names a relatorio compares only ops of that relatorio, since
 * the implicit-relatorio families share one path string.
 */
export async function lastAppliedOpId(db: AppDatabase, op: Op): Promise<string | null> {
  const sameSlot = (other: { path: string; relatorio_id?: string | null }) =>
    other.path === op.path && (!op.relatorio_id || other.relatorio_id === op.relatorio_id);
  const key = targetKeysOf(op)[0];
  const remote = key === undefined ? [] : (await db.remote_ops.where('targets').equals(key).toArray()).filter(sameSlot);
  const pulled = new Set(remote.map((row) => row.op_id));
  const local = (await db.outbox.where('path').equals(op.path).toArray()).filter(
    (row) => row.status !== 'dead' && sameSlot(row) && !pulled.has(row.op_id),
  );
  if (local.length > 0) return local.sort(byClientTsThenOpId).at(-1)!.op_id;
  if (remote.length > 0) return remote.sort((a, b) => a.seq - b.seq).at(-1)!.op_id;
  return null;
}

/**
 * FR-32: N changes as one batch sharing a `batch_id` minted here. Every op carries this
 * device's minted id (AD-3): callers never choose `device_id`, and one passed anyway at
 * runtime is overwritten. A put or remove the caller left without `prev_op_id` gets the
 * last op this device applied on its path (`lastAppliedOpId`, or the earlier op of this
 * batch on the same path), so the server reports `superseded` only when another device
 * really wrote in between (AD-24).
 */
export async function commitBatch(
  db: AppDatabase,
  inputs: readonly OpDraft[],
  deps: CommitDeps,
): Promise<{ batch_id: string; ops: Op[] }> {
  return db.transaction('rw', batchTables(db), async () => {
    // `buildBatch` stamped every op with this device's id; they are applied right here, in
    // this transaction, rather than through `commitOps` and a nested one.
    const { batch_id, ops } = await buildBatch(db, inputs, deps);
    return { batch_id, ops: await applyAll(db, ops) };
  });
}

/** Applies a built batch in order; returns the ops as committed (stamped). */
async function applyAll(db: AppDatabase, ops: readonly Op[]): Promise<Op[]> {
  const committed: Op[] = [];
  for (const op of ops) committed.push(await applyOne(db, op));
  return committed;
}

/**
 * E9-Q13: `commitBatch` for a write decided from rows read before it (the device's own sweep
 * after a pull): `stillValid` re-reads them inside the commit's transaction, and when it says
 * no, nothing is written and null is returned. A batch the engineer tapped meanwhile (the
 * same suggestion confirmed, the same cell typed) lands wholly before the check or wholly after
 * the write, never between them.
 */
export async function commitBatchIf(
  db: AppDatabase,
  stillValid: () => Promise<boolean>,
  inputs: readonly OpDraft[],
  deps: CommitDeps,
): Promise<{ batch_id: string; ops: Op[] } | null> {
  return db.transaction('rw', batchTables(db), async () => {
    if (!(await stillValid())) return null;
    const { batch_id, ops } = await buildBatch(db, inputs, deps);
    return { batch_id, ops: await applyAll(db, ops) };
  });
}

/**
 * Every table `buildBatch` reads (`local_prefs` for the device id, `entities` for the
 * relatórios it advances, `outbox` and `remote_ops` for `prev_op_id`) plus the ones the
 * apply writes. Building and applying under one `rw` transaction over them serializes
 * overlapping commits, so a second batch on a path sees the first one's op and chains on
 * it, and a pull cannot land between the lookup and the write.
 */
function batchTables(db: AppDatabase) {
  return [db.entities, db.outbox, db.remote_ops, db.local_prefs];
}

/** The ops of a batch, chained and stamped, before anything is written. Runs inside the caller's transaction. */
async function buildBatch(
  db: AppDatabase,
  inputs: readonly OpDraft[],
  deps: CommitDeps,
): Promise<{ batch_id: string; ops: Op[] }> {
  const device_id = await deviceId(db, deps.newId);
  const batch_id = deps.newId();
  const now = deps.now();
  const built = inputs.map((input) => makeOp({ ...input, batch_id, device_id }, { newId: deps.newId, now }));

  // AD-22: append the Emitido→Em revisão transition once per relatório this batch touches
  // (`advanceOnEdit`), computed here and nowhere else -- the one place every relatório-scoped
  // write path (setup fields, the Sumário's reorders, the tree, sheets) gets covered without
  // any surface deciding a status transition of its own (AD-1, AD-13). A project-scope
  // equipment op (a TAG rename, Epic 4 retro Q15) also touches every relatório of this device
  // whose live blocks reference that equipment: the kernel's stream rule (`inRelatorioStream`)
  // says which, the same one the generate barrier reads.
  const byRelatorio = new Map<string, Op[]>();
  const touch = (relatorioId: string, op: Op) => {
    const list = byRelatorio.get(relatorioId);
    if (list) list.push(op);
    else byRelatorio.set(relatorioId, [op]);
  };
  for (const op of built) if (op.relatorio_id != null) touch(op.relatorio_id, op);
  // Only equipment lives in project scope (AD-5), so the scan runs only for a batch that writes one.
  const equipmentOps = built.filter((op) => op.scope === 'project' && op.project_id != null);
  for (const projectId of new Set(equipmentOps.map((op) => op.project_id!))) {
    for (const relatorio of await relatoriosOfProject(db, projectId)) {
      const stream = { relatorioId: relatorio.id, equipmentIds: referencedEquipmentIds(await blockRowsOf(db, relatorio.id)) };
      for (const op of equipmentOps) if (op.project_id === projectId && inRelatorioStream(op, stream)) touch(relatorio.id, op);
    }
  }
  for (const [relatorioId, relatorioOps] of byRelatorio) {
    if (relatorioOps.some((op) => op.path === 'relatorio/status')) continue;
    const record = await db.entities.get(['relatorio', relatorioId]);
    const row = record?.row as RelatorioRow | undefined;
    if (row === undefined) continue;
    const next = advanceOnEdit(row.status, relatorioOps);
    if (next === null) continue;
    const trigger = relatorioOps[0]!;
    const draft = putRelatorioStatusOp({ id: trigger.actor_id, companyId: trigger.company_id }, relatorioId, next);
    built.push(makeOp({ ...draft, device_id, batch_id }, { newId: deps.newId, now }));
  }

  const ops: Op[] = [];
  const lastInBatch = new Map<string, string>();
  for (const op of built) {
    const slot = `${op.relatorio_id ?? ''}|${op.path}`;
    const chained =
      op.kind === 'create' || op.prev_op_id != null
        ? op
        : { ...op, prev_op_id: lastInBatch.get(slot) ?? (await lastAppliedOpId(db, op)) };
    lastInBatch.set(slot, chained.op_id);
    ops.push(chained);
  }
  return { batch_id, ops };
}

export interface FileBatchInput {
  /** The `file/{id}` create op and the owner's `_file_id` op, in that order. */
  ops: readonly OpDraft[];
  /** The bytes, written to `files` in the same transaction as the ops. */
  blob: Blob;
  fileId: string;
  /** The picked file's name, kept device-locally for the tile line. */
  fileName?: string;
}

/**
 * AR-6, AD-7: a file batch is one transaction over `entities`, `outbox` **and** `files`.
 * The `file/{id}` create op, the owner's `_file_id` op and the Blob land together or not
 * at all -- an op without its bytes would upload nothing forever, and bytes without an op
 * would never be uploaded at all.
 */
export async function commitFileBatch(
  db: AppDatabase,
  input: FileBatchInput,
  deps: CommitDeps,
): Promise<{ batch_id: string; ops: Op[] }> {
  return db.transaction('rw', [...batchTables(db), db.files], async () => {
    // `buildBatch` already stamped every op with this device's id (Epic 2 retro D-8).
    const { batch_id, ops: built } = await buildBatch(db, input.ops, deps);
    const created_at = toIso(deps.now());
    const ops = await applyAll(db, built);
    await db.files.put({
      id: input.fileId,
      variant: 'original',
      blob: input.blob,
      acked: false,
      created_at,
      ...(input.fileName === undefined ? {} : { name: input.fileName }),
    });
    return { batch_id, ops };
  });
}

export interface PhotoBatchInput {
  /** The photo's `file/{id}` create op; its `local_seq` is set inside the transaction. */
  create: OpDraft;
  fileId: string;
  /** The re-encoded original, written to `files`. */
  original: Blob;
  /** The device's own thumb, written to `thumbs`. */
  thumb: Blob;
}

/**
 * Story 6.1 (AR-6, AD-17): one shot is one transaction over `entities`, `outbox`, `files`,
 * `thumbs` and `local_prefs`. The per-device `photo_seq` counter is read and bumped inside
 * it and stamped on the create op's `local_seq`, so two shots can never share a number and
 * a shot that fails leaves the counter, the op, the original and the thumb all unwritten.
 */
export async function commitPhotoBatch(
  db: AppDatabase,
  input: PhotoBatchInput,
  deps: CommitDeps,
): Promise<{ batch_id: string; ops: Op[]; localSeq: number }> {
  const createPath = `file/${input.fileId}`;
  return db.transaction('rw', [...batchTables(db), db.files, db.thumbs], async () => {
    const { batch_id, ops: built } = await buildBatch(db, [input.create], deps);
    const created_at = toIso(deps.now());
    const pref = await db.local_prefs.get(PHOTO_SEQ_PREF);
    const localSeq = typeof pref?.value === 'number' && Number.isInteger(pref.value) && pref.value >= 0 ? pref.value + 1 : 1;
    await db.local_prefs.put({ key: PHOTO_SEQ_PREF, value: localSeq });
    const ops = built.map((op) =>
      op.kind === 'create' && op.path === createPath ? { ...op, value: { ...(op.value as Record<string, unknown>), local_seq: localSeq } as Op['value'] } : op,
    );
    const committed = await applyAll(db, ops);
    await db.files.put({ id: input.fileId, variant: 'original', blob: input.original, acked: false, created_at });
    await db.thumbs.put({ id: input.fileId, blob: input.thumb, source: 'device', created_at });
    return { batch_id, ops: committed, localSeq };
  });
}

/** Undo: N inverse ops in a new batch, built from the outbox rows of the batch (dead rows never applied, AD-24). */
export async function undoBatch(db: AppDatabase, batchId: string, deps: CommitDeps): Promise<Op[]> {
  const rows = (await db.outbox.where('batch_id').equals(batchId).sortBy('client_ts')).filter((row) => row.status !== 'dead');
  const before = new Map<string, unknown>(rows.map((row) => [row.op_id, row.prev_value]));
  const marks = new Map<string, RestoreMarks>(rows.flatMap((row) => (row.prev_marks === undefined ? [] : [[row.op_id, row.prev_marks] as const])));
  const inverses = invertBatch(rows.map(opOf), before, { newId: deps.newId, now: deps.now() }, marks);
  return commitOps(db, inverses, deps);
}

/**
 * The `client_ts` of the oldest op still on its way to the server, for the
 * unsynced-for-days check (AD-8). `pending` and `sent` only: an `acked` op has arrived
 * and a `dead` one was refused, and neither is work waiting to be sent.
 */
export async function oldestPendingClientTs(db: AppDatabase): Promise<string | null> {
  const waiting = await db.outbox.where('status').anyOf(['pending', 'sent']).sortBy('client_ts');
  return waiting[0]?.client_ts ?? null;
}
