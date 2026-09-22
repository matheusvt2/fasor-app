import { materializeEntity, splitEntityKey, userRowSchema, type EntityKey, type Op, type UserRow } from '@app/domain';
import { opOf, toRecord } from './commit.ts';
import {
  targetKeysOf,
  type AppDatabase,
  type OutboxRow,
  type RemoteOpRow,
  type SyncStateRow,
} from './schema.ts';

/*
 * AD-24 on the device: the only Dexie access of the sync engine. Pulled ops are
 * kept once in `remote_ops` (primary key `op_id`, the cross-stream dedupe) and
 * every touched entity is re-materialized as
 * `materializeEntity(ref, remote ops of the ref, non-dead outbox ops of the ref)`,
 * so rebase, dead-op exclusion, "Reenviar" and device/server convergence are
 * one function.
 */

export { deviceId } from './device-id.ts';

const byClientTsThenOpId = (a: OutboxRow, b: OutboxRow) =>
  a.client_ts < b.client_ts ? -1 : a.client_ts > b.client_ts ? 1 : a.op_id < b.op_id ? -1 : a.op_id > b.op_id ? 1 : 0;

/** Rows to push: `pending` plus `sent` (a request that never answered), in commit order. */
export async function takePending(db: AppDatabase): Promise<OutboxRow[]> {
  const rows = await db.outbox.where('status').anyOf(['pending', 'sent']).toArray();
  return rows.sort(byClientTsThenOpId);
}

export async function markSent(db: AppDatabase, opIds: readonly string[]): Promise<void> {
  await db.transaction('rw', db.outbox, async () => {
    for (const op_id of opIds) await db.outbox.update(op_id, { status: 'sent' });
  });
}

export async function markAcked(db: AppDatabase, acked: readonly { op_id: string; seq: number }[]): Promise<void> {
  await db.transaction('rw', db.outbox, async () => {
    for (const { op_id, seq } of acked) await db.outbox.update(op_id, { status: 'acked', seq });
  });
}

/** A rejected op: `dead` with its code, kept for "Reenviar", excluded from the materialized state. */
export async function markDead(db: AppDatabase, dead: readonly { op_id: string; code: string }[]): Promise<void> {
  await db.transaction('rw', db.outbox, db.remote_ops, db.entities, async () => {
    const refs = new Set<string>();
    for (const { op_id, code } of dead) {
      const row = await db.outbox.get(op_id);
      if (!row) continue;
      await db.outbox.update(op_id, { status: 'dead', error_code: code });
      for (const key of row.targets) refs.add(key);
    }
    await rematerialize(db, [...refs]);
  });
}

/**
 * Stores each pulled op once, acks the matching outbox rows and re-materializes every
 * touched entity, in one transaction. Routing is by the op itself (`applyOp` reads
 * `op.scope` and the path), never by the stream the op came from.
 */
export async function applyPulled(db: AppDatabase, pulled: readonly Op[]): Promise<void> {
  if (pulled.length === 0) return;
  await db.transaction('rw', db.remote_ops, db.entities, db.outbox, async () => {
    const refs = new Set<string>();
    const rows: RemoteOpRow[] = [];
    for (const op of pulled) {
      if (op.seq === undefined) throw new Error(`pulled op ${op.op_id} has no seq`);
      const targets = targetKeysOf(op);
      rows.push({ ...op, seq: op.seq, targets });
      for (const key of targets) refs.add(key);
    }
    await db.remote_ops.bulkPut(rows);
    const own = await db.outbox.bulkGet(rows.map((r) => r.op_id));
    for (const row of own) {
      if (!row || row.status === 'acked') continue;
      const seq = rows.find((r) => r.op_id === row.op_id)!.seq;
      await db.outbox.update(row.op_id, { status: 'acked', seq, error_code: null });
    }
    await rematerialize(db, [...refs]);
  });
}

const bySeq = (a: RemoteOpRow, b: RemoteOpRow) => a.seq - b.seq;

/**
 * Rewrites the `entities` row of each key from the server log plus the device's
 * non-dead outbox ops on that key; deletes the row when nothing creates it. Runs
 * inside the caller's transaction when there is one.
 */
export async function rematerialize(db: AppDatabase, keys: readonly string[]): Promise<void> {
  const run = async () => {
    for (const key of keys) {
      const ref = splitEntityKey(key as EntityKey);
      const [remote, local] = await Promise.all([
        db.remote_ops.where('targets').equals(key).toArray(),
        db.outbox.where('targets').equals(key).toArray(),
      ]);
      const row = materializeEntity(
        ref,
        remote.sort(bySeq),
        local.filter((r) => r.status !== 'dead').map(opOf),
      );
      if (row === null) await db.entities.delete([ref.entity, ref.id]);
      else await db.entities.put(toRecord(key as EntityKey, row));
    }
  };
  // Dexie reuses the ambient transaction when there is one; otherwise this opens its own.
  await db.transaction('rw', db.remote_ops, db.outbox, db.entities, run);
}

export async function readSyncState(db: AppDatabase, id: string): Promise<SyncStateRow | undefined> {
  return db.sync_state.get(id);
}

export async function writeSyncState(db: AppDatabase, row: SyncStateRow): Promise<void> {
  await db.sync_state.put(row);
}

/** "Reenviar": every dead row back to pending, its effect re-materialized. Returns how many. */
export async function resendDead(db: AppDatabase): Promise<number> {
  return db.transaction('rw', db.outbox, db.remote_ops, db.entities, async () => {
    const dead = await db.outbox.where('status').equals('dead').toArray();
    const refs = new Set<string>();
    for (const row of dead) {
      await db.outbox.update(row.op_id, { status: 'pending', error_code: null });
      for (const key of row.targets) refs.add(key);
    }
    await rematerialize(db, [...refs]);
    return dead.length;
  });
}

// --- live reads for `useLiveQuery` -----------------------------------------

export function outboxRows(db: AppDatabase): Promise<OutboxRow[]> {
  return db.outbox.toArray();
}

/**
 * AD-8 activation rule: how much work is still on its way to the server. `pending` plus
 * `sent` is exactly `takePending`'s set — the rows a push would carry — counted through
 * the `status` index rather than by reading the table, because the service-worker gate
 * asks for it on every launch.
 */
export function outboxBacklog(db: AppDatabase): Promise<number> {
  return db.outbox.where('status').anyOf(['pending', 'sent']).count();
}

export function syncStateRows(db: AppDatabase): Promise<SyncStateRow[]> {
  return db.sync_state.toArray();
}

/** The company's user rows on this device, for names on Sync status. */
export async function localUsers(db: AppDatabase): Promise<UserRow[]> {
  const records = await db.entities.where('entity').equals('user').toArray();
  return records.map((record) => record.row as UserRow);
}

/**
 * One user's kernel row on this device (the Account "Registro profissional" row), or null
 * until the company pull has brought it.
 */
export async function localUser(db: AppDatabase, userId: string): Promise<UserRow | null> {
  const record = await db.entities.get(['user', userId]);
  if (record === undefined) return null;
  const parsed = userRowSchema.safeParse(record.row);
  return parsed.success ? parsed.data : null;
}

export async function remoteOpRows(db: AppDatabase): Promise<RemoteOpRow[]> {
  return db.remote_ops.toArray();
}
