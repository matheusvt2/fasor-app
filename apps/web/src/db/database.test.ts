import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  closeDeviceDatabase,
  deviceDatabaseName,
  openDeviceDatabase,
} from './database.ts';

describe('device database', () => {
  it('is named releng-{user_id}', () => {
    expect(deviceDatabaseName('user-42')).toBe('releng-user-42');
    expect(() => deviceDatabaseName(' ')).toThrow();
  });

  it('declares every object store at version 1', async () => {
    const database = await openDeviceDatabase('stores');
    try {
      expect(database.tables.map((table) => table.name).sort()).toEqual([
        'drafts',
        'entities',
        'files',
        'local_prefs',
        'outbox',
        'sync_state',
      ]);
      expect(database.verno).toBe(1);
    } finally {
      closeDeviceDatabase(database);
    }
  });

  it('keeps the database and its rows after a sign-out closes it', async () => {
    const userId = 'sign-out-user';
    const first = await openDeviceDatabase(userId);
    await first.outbox.put({ op_id: 'op-1', status: 'pending', client_ts: '2026-09-21T00:00:00Z' });
    await first.entities.put({ id: 'e-1', kind: 'relatorio' });
    await first.local_prefs.put({ key: 'theme', value: 'dark' });

    // Sign-out closes the handle; it must never delete the database.
    closeDeviceDatabase(first);

    const names = (await indexedDB.databases()).map((info) => info.name);
    expect(names).toContain(deviceDatabaseName(userId));

    const reopened = await openDeviceDatabase(userId);
    try {
      expect(await reopened.outbox.get('op-1')).toMatchObject({ status: 'pending' });
      expect(await reopened.entities.get('e-1')).toMatchObject({ kind: 'relatorio' });
      expect(await reopened.local_prefs.get('theme')).toMatchObject({ value: 'dark' });
      expect(await reopened.drafts.count()).toBe(0);
      expect(await reopened.files.count()).toBe(0);
      expect(await reopened.sync_state.count()).toBe(0);
    } finally {
      closeDeviceDatabase(reopened);
    }
  });

  it('gives two users two databases', async () => {
    const one = await openDeviceDatabase('user-one');
    const two = await openDeviceDatabase('user-two');
    try {
      await one.outbox.put({ op_id: 'a', status: 'pending', client_ts: 'x' });
      expect(await two.outbox.count()).toBe(0);
    } finally {
      closeDeviceDatabase(one);
      closeDeviceDatabase(two);
    }
  });
});
