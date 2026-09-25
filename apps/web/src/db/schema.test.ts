// @vitest-environment node
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
    expect(VERSIONS.map((v) => v.version)).toEqual([1, 2, 3, 4, 5]);
    expect(LATEST_VERSION).toBe(5);
    for (const v of VERSIONS) expect(typeof v.upgrade).toBe('function');
  });

  it('outbox rows written at version 2 gain their targets at version 3 and remote_ops exists', async () => {
    const user = '019966b0-0009-7000-8000-000000000004';
    const v2 = openDatabase(user, { upToVersion: 2 });
    const rows = opLog.slice(0, 3).map((op) => ({ ...op, status: 'pending' as const, error_code: null }));
    await v2.table('outbox').bulkAdd(rows);
    v2.close();

    const v3 = openDatabase(user, { upToVersion: 3 });
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

  it('a version 3 store gains the drafts [surface+entity_id] index at version 4, outbox intact', async () => {
    const user = '019966b0-0009-7000-8000-000000000005';
    const v3 = openDatabase(user, { upToVersion: 3 });
    const rows = opLog.slice(0, 2).map((op) => ({ ...op, status: 'pending' as const, error_code: null, targets: [] }));
    await v3.outbox.bulkAdd(rows);
    await v3.drafts.put({ key: 'ficha/a1', surface: 'ficha', entity_id: 'a1', value: 'texto', saved_at: '2026-09-22T12:00:00.000Z' });
    v3.close();

    const v4 = openDatabase(user, { upToVersion: 4 });
    await v4.open();
    expect(v4.verno).toBe(4);
    expect(await v4.outbox.count()).toBe(2);
    // The row written before the index existed is reachable through it.
    expect(await v4.drafts.where('[surface+entity_id]').equals(['ficha', 'a1']).count()).toBe(1);
    expect(await v4.local_prefs.get('db_version')).toEqual({ key: 'db_version', value: 4 });
    v4.close();
  });

  it('6.1 a version 4 store gains the thumbs table at version 5, outbox and files intact', async () => {
    const user = '019966b0-0009-7000-8000-000000000007';
    const v4 = openDatabase(user, { upToVersion: 4 });
    const rows = opLog.slice(0, 3).map((op) => ({ ...op, status: 'pending' as const, error_code: null, targets: [] }));
    await v4.outbox.bulkAdd(rows);
    await v4.files.put({ id: 'f1', variant: 'original', blob: new Blob(['abcd']), acked: false, created_at: '2026-09-25T12:00:00.000Z' });
    expect(v4.tables.map((t) => t.name)).not.toContain('thumbs');
    v4.close();

    const v5 = openDatabase(user);
    await v5.open();
    expect(v5.verno).toBe(5);
    expect(v5.tables.map((t) => t.name)).toContain('thumbs');
    const kept = await v5.outbox.orderBy('client_ts').toArray();
    expect(kept.map((r) => r.op_id)).toEqual(rows.map((r) => r.op_id));
    expect(kept.every((r) => r.status === 'pending')).toBe(true);
    expect(await v5.files.get('f1')).toMatchObject({ acked: false, variant: 'original' });
    await v5.thumbs.put({ id: 'f1', blob: new Blob(['t']), source: 'device', created_at: '2026-09-25T12:00:00.000Z' });
    expect(await v5.thumbs.count()).toBe(1);
    expect(await v5.local_prefs.get('db_version')).toEqual({ key: 'db_version', value: 5 });
    v5.close();
  });

  // AD-8's eviction signal: only the open that brings the store into existence says so.
  it('reports createdFresh on the open that created the store, and not afterwards', async () => {
    const user = '019966b0-0009-7000-8000-000000000006';
    const first = openDatabase(user);
    await first.delete();
    const born = openDatabase(user);
    await born.open();
    expect(born.createdFresh).toBe(true);
    born.close();

    const again = openDatabase(user);
    await again.open();
    expect(again.createdFresh).toBe(false);
    again.close();
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
