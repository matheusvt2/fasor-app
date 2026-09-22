import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { databaseName, openDatabase } from './schema.ts';

/**
 * AD-9: sign-out closes the handle to `releng-{user_id}` and never deletes the
 * database, so the rows are still there when the same user signs in again.
 */
describe('sign-out and the device database', () => {
  it('is named releng-{user_id}', () => {
    expect(databaseName('user-42')).toBe('releng-user-42');
  });

  it('keeps the database and its rows after sign-out closes the handle', async () => {
    const userId = 'sign-out-user';
    const first = openDatabase(userId);
    await first.open();
    await first.local_prefs.put({ key: 'theme', value: 'dark' });
    await first.drafts.put({
      key: 'd-1',
      surface: 'sheet',
      entity_id: 'e-1',
      value: 'texto',
      saved_at: '2026-09-21T00:00:00.000Z',
    });

    // What sign-out does: close, never `delete()`.
    first.close();

    const names = (await indexedDB.databases()).map((info) => info.name);
    expect(names).toContain(databaseName(userId));

    const reopened = openDatabase(userId);
    await reopened.open();
    try {
      expect(reopened.tables.map((table) => table.name).sort()).toEqual([
        'drafts',
        'entities',
        'files',
        'local_prefs',
        'outbox',
        'sync_state',
      ]);
      expect(await reopened.local_prefs.get('theme')).toMatchObject({ value: 'dark' });
      expect(await reopened.drafts.get('d-1')).toMatchObject({ surface: 'sheet' });
      expect(await reopened.outbox.count()).toBe(0);
    } finally {
      reopened.close();
    }
  });

  it('gives two users two databases', async () => {
    const one = openDatabase('user-one');
    const two = openDatabase('user-two');
    await one.open();
    await two.open();
    try {
      await one.local_prefs.put({ key: 'theme', value: 'dark' });
      expect(await two.local_prefs.get('theme')).toBeUndefined();
    } finally {
      one.close();
      two.close();
    }
  });
});
