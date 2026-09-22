import { themePreferenceSchema, type ThemePreference } from '@app/domain';
import { THEME_PREF, type AppDatabase } from './schema.ts';

/*
 * AR-27: device-local preferences live in `local_prefs`. This is the only access to
 * that table outside `sync-store.ts`'s `device_id`, so every read goes through the
 * kernel schema and every write stores a value that schema accepts.
 */

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
  await db.local_prefs.put({ key: THEME_PREF, value: themePreferenceSchema.parse(pref) });
}
