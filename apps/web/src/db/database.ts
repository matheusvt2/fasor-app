import Dexie, { type Table } from 'dexie';

/**
 * The per-user device database (AD-9). One database per signed-in user, so two people on
 * one tablet never share an outbox, and it is never dropped on sign-out.
 *
 * This story only declares the object stores. Their semantics — the op envelope, the
 * outbox states, draft keys, file blobs, sync cursors — belong to Stories 1.4, 1.5 and
 * 1.8 and are deliberately not encoded here.
 *
 * Versions are append-only with a mandatory `upgrade()` (Consistency Conventions >
 * Versioning): a new version is added below, never edited in place.
 */

export interface EntityRow {
  id: string;
  kind: string;
  [field: string]: unknown;
}

export interface OutboxRow {
  op_id: string;
  status: string;
  client_ts: string;
  [field: string]: unknown;
}

export interface DraftRow {
  key: string;
  surface: string;
  updated_at: string;
  [field: string]: unknown;
}

export interface FileRow {
  id: string;
  status: string;
  [field: string]: unknown;
}

export interface SyncStateRow {
  id: string;
  [field: string]: unknown;
}

export interface LocalPrefRow {
  key: string;
  value: unknown;
}

export class DeviceDatabase extends Dexie {
  declare entities: Table<EntityRow, string>;
  declare outbox: Table<OutboxRow, string>;
  declare drafts: Table<DraftRow, string>;
  declare files: Table<FileRow, string>;
  declare sync_state: Table<SyncStateRow, string>;
  declare local_prefs: Table<LocalPrefRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1)
      .stores({
        entities: 'id, kind',
        outbox: 'op_id, status, client_ts',
        drafts: 'key, surface, updated_at',
        files: 'id, status',
        sync_state: 'id',
        local_prefs: 'key',
      })
      .upgrade(() => {
        // Version 1 has nothing to migrate from; the hook exists so every later version
        // has one and the "outbox survives upgrade" test has something to assert.
      });
  }
}

/** Exactly `releng-{user_id}` (AD-9). */
export function deviceDatabaseName(userId: string): string {
  if (userId.trim() === '') throw new Error('user id is required for the device database');
  return `releng-${userId}`;
}

/** Opens (creating if needed) this user's database. */
export async function openDeviceDatabase(userId: string): Promise<DeviceDatabase> {
  const database = new DeviceDatabase(deviceDatabaseName(userId));
  await database.open();
  return database;
}

/**
 * Closes the handle on sign-out. It never deletes: `Dexie.delete` is not called anywhere
 * in the app, so the rows are still there when the same user signs in again.
 */
export function closeDeviceDatabase(database: DeviceDatabase): void {
  database.close();
}
