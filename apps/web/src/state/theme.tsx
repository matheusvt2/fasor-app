import { themeAttribute, type ThemePreference } from '@app/domain';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readTheme, writeTheme } from '../db/prefs.ts';
import { useSession } from './session.tsx';

/*
 * UX-DR1: the theme override is per device and lives in the user's `local_prefs`, so it
 * applies as soon as the database opens — during Booting, before Home paints — and Login
 * follows `prefers-color-scheme` like any other page.
 *
 * "Sistema" removes the attribute rather than writing `data-theme="system"`; `tokens.css`
 * darkens through `:root:not([data-theme="light"])`, so any other value would pin light.
 */

export interface ThemeState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function applyTheme(theme: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const attribute = themeAttribute(theme);
  if (attribute === null) document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', attribute);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const db = session.database;
  const [theme, setThemeState] = useState<ThemePreference>('system');

  useEffect(() => {
    if (db === null) {
      // Signed out, or no database on this origin: the root element goes back to
      // following the operating system.
      setThemeState('system');
      applyTheme('system');
      return;
    }
    let cancelled = false;
    void readTheme(db).then(
      (stored) => {
        if (cancelled) return;
        setThemeState(stored);
        applyTheme(stored);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [db]);

  // Sign-out clears the database and the status in one commit, so this provider unmounts
  // and the `db === null` branch above never runs: without this cleanup the previous
  // user's forced theme would stay on the root element at Login until a full page load.
  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') document.documentElement.removeAttribute('data-theme');
    };
  }, []);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      // The attribute changes at once, with no reload and without waiting for Dexie.
      setThemeState(next);
      applyTheme(next);
      if (db !== null) void writeTheme(db, next).catch(() => {});
    },
    [db],
  );

  const value = useMemo<ThemeState>(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeState {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
