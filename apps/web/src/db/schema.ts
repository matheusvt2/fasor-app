import { targetsOf, type Entity, type EntityRow, type Op, type RelatorioSummary } from '@app/domain';
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

/**
 * Story 6.2: why an upload of this blob stopped, kept across reloads. `dead` is a server
 * verdict no retry can change (413, a sha mismatch): never retried on its own, only by the
 * tile's "Erro — Tentar novamente". `failed` is a transient failure whose retries ran out
 * this cycle: retried by the next cycle. Cleared when the server takes the bytes.
 */
export interface UploadError {
  state: 'dead' | 'failed';
  code: string;
  at: string;
}

/** AD-7: local originals and thumbs; `acked` marks the first eviction candidates. */
export interface FileBlobRow {
  id: string;
  variant: 'original' | 'thumb' | 'crop';
  blob: Blob;
  acked: boolean;
  created_at: string;
  /**
   * The name the file had on the device that picked it. Device-local and not indexed
   * (so no new Dexie version): the kernel `file` row has no name column, and the tile
   * falls back to the format and size on every other device (`fileTileLine`).
   */
  name?: string;
  /** Story 6.2: when this device learnt the server holds the bytes (the eviction order). Not indexed. */
  acked_at?: string;
  /** Story 6.2: the persisted upload failure, absent while none. Not indexed. */
  upload_error?: UploadError;
}

/**
 * Story 6.1/6.2 (AD-7): a photo's small picture, kept apart from its original so a tile
 * never needs the full bytes and eviction never touches it. `device` is the thumb made at
 * capture; the sync replaces it with the server's (`server`) once the variants exist.
 */
export interface ThumbRow {
  id: string;
  blob: Blob;
  source: 'device' | 'server';
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
  /**
   * AD-8: the company pull's per-relatório summary, kept on the `company` row only.
   * It is the only place a relatório the device never downloaded appears, so Home can
   * draw its "Não está neste aparelho" card. Not indexed, so no new Dexie version.
   */
  relatorios?: RelatorioSummary[];
}

/**
 * Device-local, never-synced state (Conventions).
 * Keys: `db_version`, `device_id`, `theme`, `recovery_notice_dismissed`, `registry_tab`,
 * `last_sheet:{relatorio_id}`, `photo_seq`, `geolocation_denied`, `caption_recents:{relatorio_id}`.
 */
export interface LocalPrefRow {
  key: string;
  value: unknown;
}

export const COMPANY_STREAM = 'company';
export const DEVICE_ID_PREF = 'device_id';
export const THEME_PREF = 'theme';
/** AD-8: the eviction-recovery screen is shown once per database, not once per launch. */
export const RECOVERY_NOTICE_PREF = 'recovery_notice_dismissed';
/** AR-27: the last selected Cadastros tab (Story 2.1 AC1), device-local like every other UI preference. */
export const REGISTRY_TAB_PREF = 'registry_tab';
/** Story 4.3: the block id of the last sheet worked on this device, per relatório. */
export const LAST_SHEET_PREF = (relatorioId: string): string => `last_sheet:${relatorioId}`;
/** Story 6.5: the Caption composer's recent words of one relatório on this device (never synced). */
export const CAPTION_RECENTS_PREF = (relatorioId: string): string => `caption_recents:${relatorioId}`;
/** Story 6.1 (AD-17): the per-device photo counter, bumped in the capture's own transaction. */
export const PHOTO_SEQ_PREF = 'photo_seq';
/**
 * Story 6.1: the browser refused the position. A device-local stand-in for "marks the
 * account row" (Epic 11's location switch surface reads it); never synced.
 */
export const GEOLOCATION_DENIED_PREF = 'geolocation_denied';

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
  {
    // Story 1.8: drafts are looked up by their owning surface and entity when a
    // surface mounts, so the pair is indexed; no row changes shape.
    version: 4,
    stores: { drafts: 'key, surface, [surface+entity_id]' },
    upgrade: stamp(4),
  },
  {
    // Story 6.1: photo thumbs in their own table, so a photo holds its original and its
    // thumb at once and eviction (originals only) never reaches a thumb.
    version: 5,
    stores: { thumbs: 'id' },
    upgrade: stamp(5),
  },
];

export const LATEST_VERSION = VERSIONS[VERSIONS.length - 1]!.version;

export class AppDatabase extends Dexie {
  /**
   * AD-8 eviction signal: true when this handle is the one that created the store.
   * The `populate` hook runs exactly once per database, on the open that brings it into
   * existence, so a session that resolves from the server cookie and finds this flag set
   * is looking at an origin whose storage was evicted (or at a device it never used).
   */
  createdFresh = false;

  entities!: Table<EntityRecord, [Entity, string]>;
  outbox!: Table<OutboxRow, string>;
  remote_ops!: Table<RemoteOpRow, string>;
  drafts!: Table<DraftRow, string>;
  files!: Table<FileBlobRow, string>;
  thumbs!: Table<ThumbRow, string>;
  sync_state!: Table<SyncStateRow, string>;
  local_prefs!: Table<LocalPrefRow, string>;

  constructor(name: string, upToVersion: number = LATEST_VERSION) {
    super(name);
    for (const def of VERSIONS) {
      if (def.version > upToVersion) break;
      this.version(def.version).stores(def.stores).upgrade(def.upgrade);
    }
    // A fresh database runs no upgrade(); populate stamps the version it was born at,
    // and records that this open is the one that created the store (AD-8).
    this.on('populate', (tx) => {
      this.createdFresh = true;
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
