import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readTheme, writeTheme } from '../db/prefs.ts';
import { openDatabase, THEME_PREF, type AppDatabase } from '../db/schema.ts';
import type { SessionState } from './session.tsx';
import { ThemeProvider, useTheme } from './theme.tsx';

/*
 * UX-DR1: the override lives in the user's `local_prefs`, applies to the root element
 * with no reload, and survives a remount (which is what a page reload is here).
 */

let database: AppDatabase | null = null;

const session = (): SessionState => ({
  status: 'signed-in',
  user: null,
  online: true,
  reAuthRequired: false,
  aiFeatures: true,
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  savePhotoLocation: vi.fn(async () => {}),
  recoveryNeeded: false,
  dismissRecovery: vi.fn(),
});

vi.mock('./session.tsx', () => ({ useSession: () => session() }));

/*
 * E13-A2: the provider's first read of `local_prefs` can land after a press (it did on
 * every loaded unit run: "expected null to be 'dark'"). `readGate.hold` holds the read
 * after it has read the old value, so a test can press first and land the read after;
 * `reads` counts the reads that have returned.
 */
const readGate = vi.hoisted(() => ({ hold: null as Promise<void> | null, reads: 0 }));
vi.mock('../db/prefs.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/prefs.ts')>();
  return {
    ...actual,
    readTheme: async (db: AppDatabase) => {
      const stored = await actual.readTheme(db);
      if (readGate.hold !== null) await readGate.hold;
      readGate.reads += 1;
      return stored;
    },
  };
});

let counter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0023-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

function Probe() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={() => setTheme('dark')}>
        escuro
      </button>
      <button type="button" onClick={() => setTheme('system')}>
        sistema
      </button>
    </>
  );
}

const renderTheme = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

afterEach(() => {
  readGate.hold = null;
  readGate.reads = 0;
  document.documentElement.removeAttribute('data-theme');
  database?.close();
  database = null;
});

describe('ThemeProvider', () => {
  it('starts on "system" with no attribute on the root element', async () => {
    database = await freshDb();
    renderTheme();
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('system'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('sets the attribute at once and writes the choice to local_prefs', async () => {
    database = await freshDb();
    renderTheme();
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('system'));

    await userEvent.click(screen.getByText('escuro'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await waitFor(async () => expect(await database!.local_prefs.get(THEME_PREF)).toMatchObject({ value: 'dark' }));

    await userEvent.click(screen.getByText('sistema'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    await waitFor(async () => expect(await readTheme(database!)).toBe('system'));
  });

  it('a choice made before the stored one is read wins over the late read (E13-A2)', async () => {
    database = await freshDb();
    let release: () => void = () => undefined;
    readGate.hold = new Promise((resolve) => {
      release = resolve;
    });
    renderTheme();
    await userEvent.click(screen.getByText('escuro'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(readGate.reads).toBe(0);

    // The read of the old value ("system", nothing stored) lands after the press.
    release();
    await waitFor(() => expect(readGate.reads).toBe(1));
    await act(async () => {});
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    await waitFor(async () => expect(await readTheme(database!)).toBe('dark'));
  });

  it('reads the stored choice back on the next mount (a reload)', async () => {
    database = await freshDb();
    await writeTheme(database, 'dark');
    renderTheme();
    // Both assertions sit inside the same `waitFor`: `applyTheme` writes the attribute
    // synchronously inside the `.then()`, before React flushes `setThemeState`, so an
    // assertion on the rendered value outside the wait is a race.
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    });
  });

  it('falls back to "system" for a value it cannot parse', async () => {
    database = await freshDb();
    await database.local_prefs.put({ key: THEME_PREF, value: 42 });
    renderTheme();
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('system'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('with no database (signed out) the root element follows the operating system', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    database = null;
    renderTheme();
    await waitFor(() => expect(document.documentElement.hasAttribute('data-theme')).toBe(false));
  });
});
