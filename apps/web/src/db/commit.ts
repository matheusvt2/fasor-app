import {
  applyOp,
  coalesce,
  invertBatch,
  makeOp,
  readPath,
  rowIndexColumns,
  rowRemovedAt,
  splitEntityKey,
  targetsOf,
  type Clock,
  type EntityKey,
  type EntityRow,
  type NewId,
  type Op,
  type OpInput,
} from '@app/domain';
import { targetKeysOf, type AppDatabase, type EntityRecord, type OutboxRow } from './schema.ts';

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

const OUTBOX_ONLY_KEYS = ['status', 'error_code', 'prev_value', 'targets'] as const;

/** The op an outbox row carries, without the outbox-only columns. */
export function opOf(row: OutboxRow): Op {
  const op: Partial<OutboxRow> = { ...row };
  for (const key of OUTBOX_ONLY_KEYS) delete op[key];
  return op as Op;
}

async function applyOne(db: AppDatabase, op: Op): Promise<void> {
  const refs = targetsOf(op);
  const records = await db.entities.bulkGet(refs.map((r) => [r.entity, r.id] as [typeof r.entity, string]));
  const state = new Map<EntityKey, EntityRow>();
  records.forEach((record, i) => {
    if (record) state.set(refs[i]!.key, record.row);
  });
  const prev_value = readPath(state, op);
  const next = applyOp(state, op);
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
      });
      return;
    }
  }
  await db.outbox.put({
    ...op,
    status: 'pending',
    error_code: null,
    targets,
    ...(prev_value === undefined ? {} : { prev_value }),
  });
}

/** Commits ops in order: outbox append (or coalesce) plus `applyOp`, atomically. */
export async function commitOps(db: AppDatabase, ops: readonly Op[]): Promise<void> {
  await db.transaction('rw', db.entities, db.outbox, async () => {
    for (const op of ops) await applyOne(db, op);
  });
}

/** FR-32: N changes as one batch sharing a `batch_id` minted here. */
export async function commitBatch(
  db: AppDatabase,
  inputs: readonly OpInput[],
  deps: CommitDeps,
): Promise<{ batch_id: string; ops: Op[] }> {
  const batch_id = deps.newId();
  const now = deps.now();
  const ops = inputs.map((input) => makeOp({ ...input, batch_id }, { newId: deps.newId, now }));
  await commitOps(db, ops);
  return { batch_id, ops };
}

/** Undo: N inverse ops in a new batch, built from the outbox rows of the batch (dead rows never applied, AD-24). */
export async function undoBatch(db: AppDatabase, batchId: string, deps: CommitDeps): Promise<Op[]> {
  const rows = (await db.outbox.where('batch_id').equals(batchId).sortBy('client_ts')).filter((row) => row.status !== 'dead');
  const before = new Map<string, unknown>(rows.map((row) => [row.op_id, row.prev_value]));
  const inverses = invertBatch(rows.map(opOf), before, { newId: deps.newId, now: deps.now() });
  await commitOps(db, inverses);
  return inverses;
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
