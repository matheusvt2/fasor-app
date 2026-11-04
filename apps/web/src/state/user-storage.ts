/*
 * e20f (2026-11-04, QA N3): the browser-storage keys the app keeps that name a relatório or a
 * block of the signed-in user, outside the per-user database. Story 20.11 says a sign-out leaves
 * nothing of the user on the device, so `doSignOut` clears these too (`clearUserStorage`). The
 * device-wide keys stay: the clock offset (`clock.ts`), the theme mirror (`db/prefs.ts`) and
 * the pending wipes (`last-session.ts`).
 */

/** localStorage: the altitude the device answered for a relatório, by its id (`altitude-reading.ts`). */
export const ALTITUDE_KEY_PREFIX = 'relatorio-altitude-asked:';

/** Every localStorage key prefix that names a relatório of the user. */
const USER_LOCAL_PREFIXES = ['relatorio-'] as const;

/** sessionStorage: the block whose checklist opened the legend in this session (`checklist-section.tsx`). */
export const LEGEND_KEY = 'ficha:legend-first';

/** Removes every key above; storage that cannot be read is left as it is. */
export function clearUserStorage(): void {
  try {
    const local = globalThis.localStorage;
    if (local !== undefined) {
      const keys: string[] = [];
      for (let i = 0; i < local.length; i++) {
        const key = local.key(i);
        if (key !== null && USER_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.push(key);
      }
      for (const key of keys) local.removeItem(key);
    }
  } catch {
    // Blocked storage holds nothing the app wrote.
  }
  try {
    globalThis.sessionStorage?.removeItem(LEGEND_KEY);
  } catch {
    // As above.
  }
}
