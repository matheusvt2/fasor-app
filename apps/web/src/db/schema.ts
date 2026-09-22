import { targetsOf, type Entity, type EntityRow, type Op } from '@app/domain';
import Dexie, { type Table, type Transaction } from 'dexie';

/*
 * AD-9: one Dexie database per user, `releng-{user_id}`, never dropped on
 * sign-out. Versions are append-only, each with an `upgrade()` (Conventions).
 * Writes go only through `commit.ts` and `sync-store.ts`; reads only through
 * `useLiveQuery`.
 */

export interface EntityRecord {
  entity: Entity;
  id: string;
  relatorio_id: string | null;
  project_id: string | null;
  removed_at: string | null;
  row: EntityRow;
}

export type OutboxStatus = 'pending' | 'sent' | 'acked' | 'dead';

export interface OutboxRow extends Op {
  status: OutboxStatus;
  /** AD-24 rejection code when `status = dead`. */
  error_code: string | null;
  /** The value the op replaced, for `undoBatch`; absent for creates. */
  prev_value?: unknown;
  /** Entity keys (`entity:id`) of `targetsOf(op)`: the multi-entry index re-materialization reads. */
  targets: string[];
}

/** AD-24: one pulled op, kept so an entity can always be re-materialized from the server log. */
export interface RemoteOpRow extends Op {
  seq: number;
  targets: string[];
}

/** AD-1: uncommitted field text and unsaved dialog state, keyed by surface and entity. */
export interface DraftRow {
  key: string;
  surface: string;
  entity_id: string;
  value: unknown;
  saved_at: string;
}

/** AD-7: local originals and thumbs; `acked` marks the first eviction candidates. */
export interface FileBlobRow {
  id: string;
  variant: 'original' | 'thumb' | 'crop';
  blob: Blob;
  acked: boolean;
  created_at: string;
}

/** AD-8: one row per stream (`company` or a relatorio id). */
export interface SyncStateRow {
  id: string;
  cursor_seq: number;
  complete: boolean;
  files_pending: number;
  downloaded_at: string | null;
  last_sync_at: string | null;
  last_push_at: { user_id: string; device_id: string; at: string }[];
}

/** Device-local, never-synced state (Conventions). Keys: `db_version`, `device_id`, ... */
export interface LocalPrefRow {
  key: string;
  value: unknown;
}

export const COMPANY_STREAM = 'company';
export const DEVICE_ID_PREF = 'device_id';

interface VersionDef {
  version: number;
  stores: Record<string, string>;
  upgrade: (tx: Transaction) => Promise<void>;
}

const stamp = (version: number) => async (tx: Transaction) => {
  await tx.table('local_prefs').put({ key: 'db_version', value: version });
};

/** The entity keys an op targets; empty when the stored row no longer parses (nothing to index). */
export function targetKeysOf(op: Op): string[] {
  try {
    return targetsOf(op).map((ref) => ref.key);
  } catch {
    return [];
  }
}

/** Append-only. A new version adds an entry; it never edits an older one. */
export const VERSIONS: readonly VersionDef[] = [
  {
    version: 1,
    stores: {
      entities: '[entity+id], entity, relatorio_id, project_id',
      outbox: 'op_id, status, path, client_ts',
      drafts: 'key, surface',
      files: 'id, acked',
      sync_state: 'id',
      local_prefs: 'key',
    },
    upgrade: stamp(1),
  },
  {
    // Batch lookup for undo.
    version: 2,
    stores: { outbox: 'op_id, status, path, client_ts, batch_id' },
    upgrade: stamp(2),
  },
  {
    // Story 1.5: the server log per entity, and the outbox indexed by target for re-materialization.
    version: 3,
    stores: {
      outbox: 'op_id, status, path, client_ts, batch_id, *targets, seq',
      remote_ops: 'op_id, seq, *targets, relatorio_id, project_id',
    },
    upgrade: async (tx) => {
      await tx
        .table('outbox')
        .toCollection()
        .modify((row: OutboxRow) => {
          row.targets = targetKeysOf(row);
        });
      await stamp(3)(tx);
    },
  },
];

export const LATEST_VERSION = VERSIONS[VERSIONS.length - 1]!.version;

export class AppDatabase extends Dexie {
  entities!: Table<EntityRecord, [Entity, string]>;
  outbox!: Table<OutboxRow, string>;
  remote_ops!: Table<RemoteOpRow, string>;
  drafts!: Table<DraftRow, string>;
  files!: Table<FileBlobRow, string>;
  sync_state!: Table<SyncStateRow, string>;
  local_prefs!: Table<LocalPrefRow, string>;

  constructor(name: string, upToVersion: number = LATEST_VERSION) {
    super(name);
    for (const def of VERSIONS) {
      if (def.version > upToVersion) break;
      this.version(def.version).stores(def.stores).upgrade(def.upgrade);
    }
    // A fresh database runs no upgrade(); populate stamps the version it was born at.
    this.on('populate', (tx) => {
      void tx.table('local_prefs').put({ key: 'db_version', value: upToVersion });
    });
  }
}

export function databaseName(userId: string): string {
  return `releng-${userId}`;
}

/** Opens (creating or upgrading) the user's database; `upToVersion` exists for the upgrade test only. */
export function openDatabase(userId: string, options: { upToVersion?: number } = {}): AppDatabase {
  return new AppDatabase(databaseName(userId), options.upToVersion ?? LATEST_VERSION);
}
