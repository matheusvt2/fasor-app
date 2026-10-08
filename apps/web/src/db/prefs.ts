import { keepScreenOnOf, keepScreenOnSchema, themePreferenceSchema, type KeepScreenOn, type ThemePreference } from '@app/domain';
import { LAST_SHEET_PREF, RECOVERY_NOTICE_PREF, REGISTRY_TAB_PREF, THEME_PREF, type AppDatabase } from './schema.ts';

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

/**
 * Story 4.8, "pode fechar": the generate this device asked for and still waits on, kept
 * device-locally so a dialog closed, a navigation or a reload does not lose the toast and
 * the `issue` status op when the revision arrives. Keyed per relatório; cleared once the
 * dialog has finished with it.
 */
export interface GenerateAwaiting {
  number: number;
  job_id: string;
}

const generateAwaitingKey = (relatorioId: string) => `generate_awaiting:${relatorioId}`;

export async function readGenerateAwaiting(db: AppDatabase, relatorioId: string): Promise<GenerateAwaiting | null> {
  const value = (await db.local_prefs.get(generateAwaitingKey(relatorioId)))?.value as Partial<GenerateAwaiting> | undefined;
  if (typeof value?.number !== 'number' || typeof value.job_id !== 'string') return null;
  return { number: value.number, job_id: value.job_id };
}

export async function writeGenerateAwaiting(db: AppDatabase, relatorioId: string, awaiting: GenerateAwaiting): Promise<void> {
  await db.local_prefs.put({ key: generateAwaitingKey(relatorioId), value: awaiting });
}

export async function clearGenerateAwaiting(db: AppDatabase, relatorioId: string): Promise<void> {
  await db.local_prefs.delete(generateAwaitingKey(relatorioId));
}

/** R4 (Story 7.5): every wait this device recorded, by relatório, for the app-level watcher. */
export async function readAllGenerateAwaiting(db: AppDatabase): Promise<(GenerateAwaiting & { relatorioId: string })[]> {
  const prefix = generateAwaitingKey('');
  const rows = await db.local_prefs.where('key').startsWith(prefix).toArray();
  const out: (GenerateAwaiting & { relatorioId: string })[] = [];
  for (const row of rows) {
    const value = row.value as Partial<GenerateAwaiting> | undefined;
    if (typeof value?.number !== 'number' || typeof value.job_id !== 'string') continue;
    out.push({ relatorioId: row.key.slice(prefix.length), number: value.number, job_id: value.job_id });
  }
  return out;
}

/**
 * AR-27, Story 4.3: the last sheet worked on this device, per relatório (`last_sheet:{id}`),
 * so an Em campo Sumário opens section 9 at the cabine that holds it. Written by the sheet
 * surface (Epic 5); read here. `null` when nothing is stored or the value is not a string.
 */
export async function readLastSheet(db: AppDatabase, relatorioId: string): Promise<string | null> {
  const row = await db.local_prefs.get(LAST_SHEET_PREF(relatorioId));
  return typeof row?.value === 'string' ? row.value : null;
}

export async function writeLastSheet(db: AppDatabase, relatorioId: string, blockId: string): Promise<void> {
  await db.local_prefs.put({ key: LAST_SHEET_PREF(relatorioId), value: blockId });
}

/**
 * E9 sweep B16: "Tentar novamente" on a failed plate reading, recorded per photo
 * (`reread_asked:{photo_id}`) with the photo's reading status op current at the press, so a
 * reload before the next status op arrives still shows the reading as asked for and never
 * offers a second run. A later status op makes the entry stale: it no longer matches.
 */
const rereadAskedKey = (photoId: string) => `reread_asked:${photoId}`;

/** The status op id current when the reread was asked (null: the photo's create), or `undefined` when none is recorded. */
export async function readRereadAsked(db: AppDatabase, photoId: string): Promise<string | null | undefined> {
  const value = (await db.local_prefs.get(rereadAskedKey(photoId)))?.value as { status_op_id?: unknown } | undefined;
  if (value === undefined || value === null || typeof value !== 'object') return undefined;
  const opId = value.status_op_id;
  return typeof opId === 'string' || opId === null ? opId : undefined;
}

export async function writeRereadAsked(db: AppDatabase, photoId: string, statusOpId: string | null): Promise<void> {
  await db.local_prefs.put({ key: rereadAskedKey(photoId), value: { status_op_id: statusOpId } });
}

export async function clearRereadAsked(db: AppDatabase, photoId: string): Promise<void> {
  await db.local_prefs.delete(rereadAskedKey(photoId));
}

/**
 * Story 13.5 (WAIT-1): "Cancelar" on a pending plate or display reading, recorded per photo
 * (`reading_cancelled:{photo_id}`) with the moment it was tapped. The photo stays; the
 * post-pull sweep discards every pending suggestion that reading produces, now or later
 * (`discardCancelledReadings`). "Tentar novamente" clears the record before asking again.
 * Device-local by design: the discard ops it produces are what other devices see.
 */
const readingCancelledKey = (photoId: string) => `reading_cancelled:${photoId}`;

/** When this device cancelled the photo's reading, or `undefined` when it did not. */
export async function readReadingCancelled(db: AppDatabase, photoId: string): Promise<string | undefined> {
  const value = (await db.local_prefs.get(readingCancelledKey(photoId)))?.value as { at?: unknown } | undefined;
  return value !== undefined && value !== null && typeof value === 'object' && typeof value.at === 'string' ? value.at : undefined;
}

export async function writeReadingCancelled(db: AppDatabase, photoId: string, at: string): Promise<void> {
  await db.local_prefs.put({ key: readingCancelledKey(photoId), value: { at } });
}

export async function clearReadingCancelled(db: AppDatabase, photoId: string): Promise<void> {
  await db.local_prefs.delete(readingCancelledKey(photoId));
}

/**
 * Epic 13 re-check N-1: "Ler de novo" after a cancel, recorded per photo (`reread_at:{photo_id}`)
 * with the moment it was pressed, so the wait line counts from the press (`readingStartedAt`'s
 * `reread_at`) instead of from the capture or the earlier status op until the server's next one
 * is pulled. The kernel takes the newest instant, so an old record never holds the count back.
 */
const rereadAtKey = (photoId: string) => `reread_at:${photoId}`;

/** When "Ler de novo" was last pressed for the photo on this device, or `undefined`. */
export async function readRereadAt(db: AppDatabase, photoId: string): Promise<string | undefined> {
  const value = (await db.local_prefs.get(rereadAtKey(photoId)))?.value as { at?: unknown } | undefined;
  return value !== undefined && value !== null && typeof value === 'object' && typeof value.at === 'string' ? value.at : undefined;
}

export async function writeRereadAt(db: AppDatabase, photoId: string, at: string): Promise<void> {
  await db.local_prefs.put({ key: rereadAtKey(photoId), value: { at } });
}

/** Every photo whose reading this device cancelled (the sweep's input). */
export async function readAllReadingCancelled(db: AppDatabase): Promise<string[]> {
  const prefix = readingCancelledKey('');
  const rows = await db.local_prefs.where('key').startsWith(prefix).toArray();
  return rows.map((row) => row.key.slice(prefix.length)).filter((id) => id !== '');
}

/**
 * Review 2026-10-08 (FLD-1): "Manter a tela ligada" in Conta, device-local (`keep_screen_on`).
 * On when nothing (or nothing valid) is stored; the kernel's schema reads and writes it.
 */
const KEEP_SCREEN_ON_PREF = 'keep_screen_on';

export async function readKeepScreenOn(db: AppDatabase): Promise<KeepScreenOn> {
  return keepScreenOnOf((await db.local_prefs.get(KEEP_SCREEN_ON_PREF))?.value);
}

export async function writeKeepScreenOn(db: AppDatabase, on: KeepScreenOn): Promise<void> {
  await db.local_prefs.put({ key: KEEP_SCREEN_ON_PREF, value: keepScreenOnSchema.parse(on) });
}
