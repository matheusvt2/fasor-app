import {
  blockFieldPath,
  companyStreamDownloaded,
  materializeEntity,
  mergeInfoOf,
  newRelatorioEquipmentReady,
  splitEntityKey,
  userFieldPath,
  userRowSchema,
  type BlockRow,
  type EntityKey,
  type EquipmentRow,
  type FileRow,
  type MergeInfo,
  type MergeInfoContext,
  type Op,
  type RelatorioSummary,
  type UserRow,
} from '@app/domain';
import { byClientTsThenOpId, opOf, toRecord } from './commit.ts';
import {
  COMPANY_STREAM,
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
      if (!row) continue;
      // The server may have logged this device's op on another row than the one it was
      // written against (a manufacturer/voltage_class create merged by name, and every
      // later op on the merged-away id, Epic 2 retro D-1). The row it was applied to here
      // is rebuilt too, so the pulled version replaces the local one (`rematerialize`).
      for (const key of row.targets) refs.add(key);
      if (row.status === 'acked') continue;
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
      // An outbox op the server log already holds is represented by the pulled version,
      // wherever the server applied it: usually the same row (`materializeEntity` drops it
      // by id), but a server merge logs it on the surviving row, and then the local copy
      // must stop resurrecting the merged-away one (Epic 2 retro D-1).
      const live = local.filter((r) => r.status !== 'dead');
      const pulled = await db.remote_ops.bulkGet(live.map((r) => r.op_id));
      const row = materializeEntity(
        ref,
        remote.sort(bySeq),
        live.filter((_, i) => pulled[i] === undefined).map(opOf),
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

/**
 * True once the company stream has been pulled to the end at least once on this device;
 * the kernel owns the rule (`companyStreamDownloaded`).
 */
export async function companyDownloaded(db: AppDatabase): Promise<boolean> {
  return companyStreamDownloaded(await db.sync_state.get(COMPANY_STREAM));
}

/**
 * The company pull's per-relatório summary kept on the `company` sync row (AD-8): every
 * relatório of the company, downloaded here or not. Empty before the first company pull.
 */
export async function companySummaries(db: AppDatabase): Promise<RelatorioSummary[]> {
  const row = await db.sync_state.get(COMPANY_STREAM);
  return row?.relatorios ?? [];
}

/**
 * Epic 4 retro item 17: whether this device holds enough of the obra's equipment to create
 * another relatório of it. The kernel decides (`newRelatorioEquipmentReady`) from the
 * company summary, the relatórios this device holds and the streams it downloaded.
 */
export async function equipmentReadyFor(db: AppDatabase, projectId: string): Promise<boolean> {
  const [states, relatorios] = await Promise.all([db.sync_state.toArray(), db.entities.where('entity').equals('relatorio').primaryKeys()]);
  return newRelatorioEquipmentReady({
    projectId,
    summaries: states.find((row) => row.id === COMPANY_STREAM)?.relatorios ?? [],
    heldRelatorioIds: relatorios.map(([, id]) => id),
    downloadedStreamIds: states.filter((row) => row.downloaded_at !== null).map((row) => row.id),
  });
}

/**
 * E9 sweep B15: what "Remover" of a sheet needs to know about the obra's relatórios this
 * device cannot see: whether the company stream was pulled to the end, the company summary,
 * the ids of the relatórios held here and the streams pulled to the end.
 */
export async function relatorioVisibility(db: AppDatabase): Promise<RelatorioVisibility> {
  const [states, relatorios] = await Promise.all([db.sync_state.toArray(), db.entities.where('entity').equals('relatorio').primaryKeys()]);
  const company = states.find((row) => row.id === COMPANY_STREAM);
  return {
    companyDownloaded: companyStreamDownloaded(company),
    summaries: company?.relatorios ?? [],
    heldRelatorioIds: relatorios.map(([, id]) => id),
    downloadedStreamIds: states.filter((row) => row.downloaded_at !== null).map((row) => row.id),
  };
}

export interface RelatorioVisibility {
  companyDownloaded: boolean;
  summaries: RelatorioSummary[];
  heldRelatorioIds: string[];
  downloadedStreamIds: string[];
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

/** The registration fields of the Account row, by their `user/{id}/{field}` names. */
export type UnsentRegistration = Partial<Record<'council' | 'registration_number' | 'title', unknown>>;

const REGISTRATION_FIELDS = new Set(['council', 'registration_number', 'title']);

/**
 * The registration values this device committed for the user and the server has not
 * acknowledged yet (`pending` or `sent`), the newest per field. A profile the server
 * returns at boot predates them, so they must stand over it until the push lands.
 */
export async function unsentRegistration(db: AppDatabase, userId: string): Promise<UnsentRegistration> {
  const fieldOfPath = new Map([...REGISTRATION_FIELDS].map((field) => [userFieldPath(userId, field), field]));
  const rows = await db.outbox.where('path').anyOf([...fieldOfPath.keys()]).toArray();
  const out: UnsentRegistration = {};
  for (const row of rows.filter((r) => r.status === 'pending' || r.status === 'sent').sort(byClientTsThenOpId)) {
    const field = fieldOfPath.get(row.path);
    if (row.kind === 'put' && field !== undefined) out[field as keyof UnsentRegistration] = row.value;
  }
  return out;
}

export async function remoteOpRows(db: AppDatabase): Promise<RemoteOpRow[]> {
  return db.remote_ops.toArray();
}

/**
 * Story 5.9's Desfazer gate: whether the sheet's own `block/{id}/not_tested` write is
 * synced (Design Notes: a per-write gate, not the whole relatório's backlog). True with
 * nothing local to wait on (no outbox row of this path at all) or once the latest one
 * (by `client_ts`) reads `acked`; false while it is still `pending`, `sent` or `dead`.
 */
export async function notTestedSynced(db: AppDatabase, blockId: string): Promise<boolean> {
  const rows = await db.outbox.where('path').equals(blockFieldPath(blockId, 'not_tested')).toArray();
  if (rows.length === 0) return true;
  const latest = rows.sort(byClientTsThenOpId).at(-1)!;
  return latest.status === 'acked';
}

// --- Story 10.1: merge information (engine memory, never stored) -----------

/**
 * What this device already holds of the log on the paths of a pulled page (the ops
 * `pulledMergePairs` compares the page with), read before the page is stored.
 */
export async function heldOpsOnPaths(db: AppDatabase, pulled: readonly Op[]): Promise<RemoteOpRow[]> {
  const paths = new Set(pulled.map((op) => op.path));
  const keys = new Set<string>();
  for (const op of pulled) {
    const key = targetKeysOf(op)[0];
    if (key !== undefined) keys.add(key);
  }
  const held: RemoteOpRow[] = [];
  for (const key of keys) {
    for (const row of await db.remote_ops.where('targets').equals(key).toArray()) if (paths.has(row.path)) held.push(row);
  }
  return held;
}

/** An op this device holds, pulled or its own. */
async function heldOp(db: AppDatabase, opId: string): Promise<Op | undefined> {
  const remote = await db.remote_ops.get(opId);
  if (remote !== undefined) return remote;
  const own = await db.outbox.get(opId);
  return own === undefined ? undefined : opOf(own);
}

/**
 * Story 10.1: the kernel's entry of each op pair, read against the rows this device now
 * holds (`mergeInfoOf`). A pair whose ops are not both here yet comes back unresolved.
 */
export async function resolveMergePairs(
  db: AppDatabase,
  pairs: readonly { op_id: string; over_op_id: string }[],
): Promise<{ infos: MergeInfo[]; unresolved: { op_id: string; over_op_id: string }[] }> {
  const infos: MergeInfo[] = [];
  const unresolved: { op_id: string; over_op_id: string }[] = [];
  for (const pair of pairs) {
    const [op, over] = await Promise.all([heldOp(db, pair.op_id), heldOp(db, pair.over_op_id)]);
    if (op === undefined || over === undefined) {
      unresolved.push(pair);
      continue;
    }
    const key = targetKeysOf(op)[0];
    const ref = key === undefined ? null : splitEntityKey(key as EntityKey);
    const record = ref === null ? undefined : await db.entities.get([ref.entity, ref.id]);
    const info = mergeInfoOf(op, over, record?.row ?? null);
    if (info !== null) infos.push(info);
  }
  return { infos, unresolved };
}

/** The rows the words of the merge entries are read from (`mergeInfoText`). */
export async function mergeTextContext(db: AppDatabase, merges: readonly MergeInfo[]): Promise<MergeInfoContext> {
  if (merges.length === 0) return { blocks: [], equipment: [], users: [], files: [] };
  const blockIds = [...new Set(merges.flatMap((m) => (m.block_id === null ? [] : [m.block_id])))];
  const relatorioIds = [...new Set(merges.flatMap((m) => (m.relatorio_id === null ? [] : [m.relatorio_id])))];
  const blockRecords = await db.entities.bulkGet(blockIds.map((id) => ['block', id] as ['block', string]));
  const blocks = blockRecords.flatMap((record) => (record === undefined ? [] : [record.row as BlockRow]));
  const equipmentIds = [...new Set(blocks.flatMap((block) => (block.equipment_id === null ? [] : [block.equipment_id])))];
  const equipmentRecords = await db.entities.bulkGet(equipmentIds.map((id) => ['equipment', id] as ['equipment', string]));
  const equipment = equipmentRecords.flatMap((record) => (record === undefined ? [] : [record.row as EquipmentRow]));
  const files =
    relatorioIds.length === 0
      ? []
      : (await db.entities.where('relatorio_id').anyOf(relatorioIds).toArray())
          .filter((record) => record.entity === 'file')
          .map((record) => record.row as FileRow);
  return { blocks, equipment, users: await localUsers(db), files };
}
