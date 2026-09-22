import 'fake-indexeddb/auto';
import { opLog } from '@app/domain/fixtures/replay-small';
import { describe, expect, it } from 'vitest';
import { databaseName, LATEST_VERSION, openDatabase, VERSIONS, type OutboxRow } from './schema.ts';

const USER = '019966b0-0009-7000-8000-000000000001';

describe('Dexie store', () => {
  it('is named releng-{user_id}', () => {
    expect(databaseName(USER)).toBe(`releng-${USER}`);
    const db = openDatabase(USER);
    expect(db.name).toBe(`releng-${USER}`);
    db.close();
  });

  it('declares append-only versions, each with an upgrade()', () => {
    expect(VERSIONS.map((v) => v.version)).toEqual([1, 2, 3]);
    expect(LATEST_VERSION).toBe(3);
    for (const v of VERSIONS) expect(typeof v.upgrade).toBe('function');
  });

  it('outbox rows written at version 2 gain their targets at version 3 and remote_ops exists', async () => {
    const user = '019966b0-0009-7000-8000-000000000004';
    const v2 = openDatabase(user, { upToVersion: 2 });
    const rows = opLog.slice(0, 3).map((op) => ({ ...op, status: 'pending' as const, error_code: null }));
    await v2.table('outbox').bulkAdd(rows);
    v2.close();

    const v3 = openDatabase(user);
    await v3.open();
    expect(v3.verno).toBe(3);
    expect(v3.tables.map((t) => t.name)).toContain('remote_ops');
    const kept = await v3.outbox.orderBy('client_ts').toArray();
    expect(kept.map((r) => r.op_id)).toEqual(rows.map((r) => r.op_id));
    for (const row of kept) expect(row.targets.length).toBeGreaterThan(0);
    expect(await v3.outbox.where('targets').equals(kept[0]!.targets[0]!).count()).toBe(1);
    expect(await v3.local_prefs.get('db_version')).toEqual({ key: 'db_version', value: 3 });
    v3.close();
  });

  it('stamps a freshly opened database with the latest version', async () => {
    const db = openDatabase('019966b0-0009-7000-8000-000000000003');
    await db.open();
    expect(await db.local_prefs.get('db_version')).toEqual({ key: 'db_version', value: LATEST_VERSION });
    db.close();
  });

  it('outbox rows written at version 1 survive reopening at version 2 and the upgrade ran', async () => {
    const user = '019966b0-0009-7000-8000-000000000002';
    const v1 = openDatabase(user, { upToVersion: 1 });
    // Version 1 rows carry no `targets`; the v3 upgrade fills them.
    const rows = opLog.slice(0, 5).map((op) => ({ ...op, status: 'pending', error_code: null }) as OutboxRow);
    await v1.outbox.bulkAdd(rows);
    await v1.entities.add({ entity: 'project', id: rows[0]!.op_id, relatorio_id: null, project_id: null, removed_at: null, row: { id: rows[0]!.op_id, client_id: null, name: 'p', site: null, removed_at: null } });
    expect(v1.verno).toBe(1);
    expect(await v1.local_prefs.get('db_version')).toEqual({ key: 'db_version', value: 1 });
    v1.close();

    const v2 = openDatabase(user, { upToVersion: 2 });
    await v2.open();
    expect(v2.verno).toBe(2);
    const kept = await v2.outbox.orderBy('client_ts').toArray();
    expect(kept.map((r) => r.op_id)).toEqual(rows.map((r) => r.op_id));
    expect(kept.map((r) => r.status)).toEqual(['pending', 'pending', 'pending', 'pending', 'pending']);
    expect(await v2.entities.count()).toBe(1);
    expect(await v2.local_prefs.get('db_version')).toEqual({ key: 'db_version', value: 2 });
    // The new batch_id index is usable on the migrated rows.
    expect(await v2.outbox.where('batch_id').equals(rows[0]!.batch_id ?? 'none').count()).toBe(0);
    v2.close();
  });
});
