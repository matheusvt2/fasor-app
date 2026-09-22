import { themePreferenceSchema, type ThemePreference } from '@app/domain';
import { RECOVERY_NOTICE_PREF, REGISTRY_TAB_PREF, THEME_PREF, type AppDatabase } from './schema.ts';

/*
 * AR-27: device-local preferences live in `local_prefs`. This is the only access to
 * that table outside `sync-store.ts`'s `device_id`, so every read goes through the
 * kernel schema and every write stores a value that schema accepts.
 *
 * Dexie is the source of truth. `localStorage` carries a mirror of the theme and
 * nothing else, because opening IndexedDB is asynchronous and the root element has to
 * carry `data-theme` before the first paint: `index.html`'s blocking boot script reads
 * this mirror, and the provider corrects it from Dexie a few frames later.
 */

/** The mirror key the boot script in `index.html` reads. Both must be changed together. */
export const THEME_MIRROR_KEY = 'releng.theme';

/**
 * The stored theme, or `system` when nothing is stored or the stored value does not
 * parse — and then the bad value is rewritten, so the fallback happens once.
 */
export async function readTheme(db: AppDatabase): Promise<ThemePreference> {
  const row = await db.local_prefs.get(THEME_PREF);
  if (row === undefined) return 'system';
  const parsed = themePreferenceSchema.safeParse(row.value);
  if (parsed.success) return parsed.data;
  await writeTheme(db, 'system');
  return 'system';
}

export async function writeTheme(db: AppDatabase, pref: ThemePreference): Promise<void> {
  const value = themePreferenceSchema.parse(pref);
  await db.local_prefs.put({ key: THEME_PREF, value });
  // A private window or blocked site data refuses this; the theme still works, it just
  // lands one frame later on the next cold open.
  try {
    globalThis.localStorage?.setItem(THEME_MIRROR_KEY, value);
  } catch {
    /* no mirror on this origin */
  }
}

/**
 * The mirrored theme, or null when there is none or it does not parse. Only the boot
 * path uses it; every other read goes to Dexie through `readTheme`.
 */
export function readThemeMirror(): ThemePreference | null {
  let stored: string | null;
  try {
    stored = globalThis.localStorage?.getItem(THEME_MIRROR_KEY) ?? null;
  } catch {
    return null;
  }
  const parsed = themePreferenceSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

/**
 * AD-8's one-time eviction screen, as a durable state in `local_prefs`.
 *
 * `AppDatabase.createdFresh` only says "this open created the store", which is true for
 * exactly one launch: a reload before the user pressed the action would otherwise lose
 * the screen and the explanation with it. So the fresh open records `pending`, every
 * boot reads this, and the action records `dismissed`. The flag lives in the database,
 * so an origin evicted a second time gets a new one and legitimately sees the screen
 * again — which is the correct behaviour, not a bug.
 */
export type RecoveryNotice = 'pending' | 'dismissed';

/** `null` when there is nothing recorded, or when the store cannot be read. */
export async function readRecoveryNotice(db: AppDatabase): Promise<RecoveryNotice | null> {
  try {
    const value = (await db.local_prefs.get(RECOVERY_NOTICE_PREF))?.value;
    return value === 'pending' || value === 'dismissed' ? value : null;
  } catch {
    return null;
  }
}

export async function writeRecoveryNotice(db: AppDatabase, notice: RecoveryNotice): Promise<void> {
  await db.local_prefs.put({ key: RECOVERY_NOTICE_PREF, value: notice });
}

/**
 * AR-27: the last selected Cadastros tab, device-local (Story 2.1 AC1 "remembered per
 * session" — a session here means this device's own database, the same durability every
 * other `local_prefs` entry gets, not a `sessionStorage` window that a reload would
 * forget). `null` when nothing is stored or the stored value is not a string; the
 * caller (which knows the valid tab ids) decides what to do with an unrecognized one.
 */
export async function readRegistryTab(db: AppDatabase): Promise<string | null> {
  const row = await db.local_prefs.get(REGISTRY_TAB_PREF);
  return typeof row?.value === 'string' ? row.value : null;
}

export async function writeRegistryTab(db: AppDatabase, tabId: string): Promise<void> {
  await db.local_prefs.put({ key: REGISTRY_TAB_PREF, value: tabId });
}
