import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readLastSheet,
  readRecoveryNotice,
  readTheme,
  readThemeMirror,
  THEME_MIRROR_KEY,
  writeLastSheet,
  writeRecoveryNotice,
  writeTheme,
} from './prefs.ts';
import { LAST_SHEET_PREF, openDatabase, RECOVERY_NOTICE_PREF, THEME_PREF, type AppDatabase } from './schema.ts';

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

/*
 * AD-8's one-time eviction screen. `createdFresh` is true for exactly one launch, so the
 * durable state is what actually decides: a reload made before the user presses the
 * screen's action must still show it.
 */
describe('eviction-recovery notice in local_prefs', () => {
  it('is null on a database that never saw an eviction', async () => {
    const db = await freshDb();
    expect(await readRecoveryNotice(db)).toBeNull();
    db.close();
  });

  it('survives a reopen while it is pending, and stops once dismissed', async () => {
    const user = `019966b0-0021-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
    await openDatabase(user).delete();

    // The launch that found the store missing: `createdFresh`, and it records the debt.
    const born = openDatabase(user);
    await born.open();
    expect(born.createdFresh).toBe(true);
    await writeRecoveryNotice(born, 'pending');
    expect(await born.local_prefs.get(RECOVERY_NOTICE_PREF)).toEqual({ key: RECOVERY_NOTICE_PREF, value: 'pending' });
    born.close();

    // The reload the user makes before pressing the action: no longer `createdFresh`,
    // and the screen is still owed to them.
    const reopened = openDatabase(user);
    await reopened.open();
    expect(reopened.createdFresh).toBe(false);
    expect(await readRecoveryNotice(reopened)).toBe('pending');

    await writeRecoveryNotice(reopened, 'dismissed');
    expect(await readRecoveryNotice(reopened)).toBe('dismissed');
    reopened.close();
  });

  it('is null for a stored value that is neither state', async () => {
    const db = await freshDb();
    await db.local_prefs.put({ key: RECOVERY_NOTICE_PREF, value: true });
    expect(await readRecoveryNotice(db)).toBeNull();
    db.close();
  });

  it('leaves the other preference keys alone', async () => {
    const db = await freshDb();
    await writeTheme(db, 'dark');
    await writeRecoveryNotice(db, 'pending');
    expect(await readTheme(db)).toBe('dark');
    db.close();
  });
});

/*
 * Story 1.6 left the theme flash open: `ThemeProvider` mounts inside `RequireSession`,
 * so `data-theme` landed after the first paint. The mirror is what `index.html`'s
 * blocking boot script reads; Dexie stays the source of truth.
 */
describe('theme mirror for the boot script', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('is written beside the Dexie row and read back', async () => {
    const db = await freshDb();
    await writeTheme(db, 'dark');
    expect(localStorage.getItem(THEME_MIRROR_KEY)).toBe('dark');
    expect(readThemeMirror()).toBe('dark');
    await writeTheme(db, 'system');
    expect(localStorage.getItem(THEME_MIRROR_KEY)).toBe('system');
    expect(readThemeMirror()).toBe('system');
    db.close();
  });

  it('reads null when nothing is mirrored or the value does not parse', () => {
    expect(readThemeMirror()).toBeNull();
    localStorage.setItem(THEME_MIRROR_KEY, 'sepia');
    expect(readThemeMirror()).toBeNull();
  });

  it('never throws when the origin refuses site data', async () => {
    const db = await freshDb();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    await expect(writeTheme(db, 'light')).resolves.toBeUndefined();
    // Dexie still holds the choice: only the pre-paint shortcut is lost.
    expect(await db.local_prefs.get(THEME_PREF)).toEqual({ key: THEME_PREF, value: 'light' });
    expect(readThemeMirror()).toBeNull();
    db.close();
  });
});

describe('last sheet per relatório in local_prefs (Story 4.3)', () => {
  const RELATORIO = '019966b0-0020-7000-8000-0000000000aa';
  const BLOCK = '019966b0-0020-7000-8000-0000000000bb';

  it('is null until written, then round-trips under its own key', async () => {
    const db = await freshDb();
    expect(await readLastSheet(db, RELATORIO)).toBeNull();
    await writeLastSheet(db, RELATORIO, BLOCK);
    expect(await readLastSheet(db, RELATORIO)).toBe(BLOCK);
    expect(await db.local_prefs.get(LAST_SHEET_PREF(RELATORIO))).toEqual({ key: `last_sheet:${RELATORIO}`, value: BLOCK });
    expect(await readLastSheet(db, '019966b0-0020-7000-8000-0000000000cc')).toBeNull();
    db.close();
  });

  it('ignores a stored value that is not a string', async () => {
    const db = await freshDb();
    await db.local_prefs.put({ key: LAST_SHEET_PREF(RELATORIO), value: { kind: 'relatorio' } });
    expect(await readLastSheet(db, RELATORIO)).toBeNull();
    db.close();
  });
});
