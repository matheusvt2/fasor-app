import { z } from 'zod';

/*
 * UX-DR1, AR-27: the theme override is device-local state in `local_prefs`. The
 * kernel owns the vocabulary and the one rule that matters — what "Sistema" puts
 * on the root element.
 */

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

export const themePreferenceSchema = z.enum(THEME_PREFERENCES);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

/**
 * The value of `document.documentElement`'s `data-theme`, or null to remove it.
 *
 * "Sistema" is the absence of the attribute, never `data-theme="system"`:
 * `tokens.css` darkens through `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`,
 * so any unknown attribute value would silently pin the light palette.
 */
export function themeAttribute(pref: ThemePreference): 'light' | 'dark' | null {
  return pref === 'system' ? null : pref;
}
