import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { readTheme, writeTheme } from './prefs.ts';
import { openDatabase, THEME_PREF, type AppDatabase } from './schema.ts';

let counter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0020-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

describe('theme preference in local_prefs', () => {
  it('is "system" on a device that never chose one', async () => {
    const db = await freshDb();
    expect(await readTheme(db)).toBe('system');
    db.close();
  });

  it('round-trips a choice', async () => {
    const db = await freshDb();
    await writeTheme(db, 'dark');
    expect(await readTheme(db)).toBe('dark');
    expect(await db.local_prefs.get(THEME_PREF)).toEqual({ key: THEME_PREF, value: 'dark' });
    await writeTheme(db, 'system');
    expect(await db.local_prefs.get(THEME_PREF)).toEqual({ key: THEME_PREF, value: 'system' });
    db.close();
  });

  it('falls back to "system" for an unparseable stored value and rewrites it', async () => {
    const db = await freshDb();
    await db.local_prefs.put({ key: THEME_PREF, value: 'sepia' });
    expect(await readTheme(db)).toBe('system');
    expect(await db.local_prefs.get(THEME_PREF)).toEqual({ key: THEME_PREF, value: 'system' });
    db.close();
  });

  it('leaves the other preference keys alone', async () => {
    const db = await freshDb();
    await db.local_prefs.put({ key: 'device_id', value: 'tablet-1' });
    await writeTheme(db, 'light');
    expect(await db.local_prefs.get('device_id')).toEqual({ key: 'device_id', value: 'tablet-1' });
    db.close();
  });
});
