import 'fake-indexeddb/auto';
import { parseReadingPtBr } from '@app/domain';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listDrafts } from '../db/drafts.ts';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { DraftProvider } from '../state/drafts.tsx';
import type { SessionState } from '../state/session.tsx';
import { ToastOutlet, ToastProvider } from '../state/toast.tsx';
import { useNumberInput, type ParsedNumber } from './number-input.tsx';

/*
 * Fix batch e25x, "e25x A3" and "e25x A4", the number input over the real draft store (`number-input.test.tsx` stubs the
 * store out). A4: an older draft row of the field (a tab-hide while typing) is dropped once a valid value is committed,
 * on blur or as the field leaves the screen; a refused commit keeps it. A3: a reading's draft offered on return is
 * answered by a valid value typed in that field: the row goes, the toast goes, and no later load offers it.
 */

let database: AppDatabase | null = null;

const session = (): SessionState => ({
  status: 'signed-in',
  user: { id: 'u1', name: 'Bruno', email: 'b@teste.local', companyId: 'c1', companyName: 'E', council: null, registrationNumber: null, title: null },
  online: true,
  reAuthRequired: false,
  aiFeatures: true,
  recoveryNeeded: false,
  settled: true,
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  savePhotoLocation: vi.fn(async () => {}),
  dismissRecovery: vi.fn(),
});

vi.mock('../state/session.tsx', () => ({ useSession: () => session() }));

const ENTITY = '019966b0-0e25-7000-8000-0000000000b1';

let counter = 0;

beforeEach(async () => {
  const user = `019966b0-0e26-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const stale = openDatabase(user);
  await stale.delete();
  database = openDatabase(user);
  await database.open();
});

afterEach(() => {
  database?.close();
  database = null;
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <DraftProvider>
        {children}
        <ToastOutlet />
      </DraftProvider>
    </ToastProvider>
  );
}

/** A reading field, as the sheet's: committed on blur, Enter or leaving the screen; text that does not parse is a draft. */
function Reading({ commit }: { commit: (value: ParsedNumber | null) => Promise<void> }) {
  const [raw, setRaw] = useState<string | null>(null);
  const number = useNumberInput({
    storedText: raw ?? '',
    storedRaw: raw,
    parse: (text) => parseReadingPtBr(text, { units: ['A', 'mA'], defaultUnit: 'A' }),
    commit: async (value) => {
      await commit(value);
      setRaw(value?.raw ?? null);
    },
    draft: { surface: 'ficha', entityId: ENTITY, field: 'leitura' },
    flushOnUnmount: true,
  });
  return <input aria-label="Corrente" {...number.inputProps} />;
}

function Sheet({ commit }: { commit: (value: ParsedNumber | null) => Promise<void> }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      {open ? <Reading commit={commit} /> : <span>outra ficha</span>}
      <button type="button" onClick={() => setOpen((value) => !value)}>
        alternar
      </button>
      <button type="button">fora</button>
    </>
  );
}

async function hide(): Promise<void> {
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
  });
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
}

const values = async () => (await listDrafts(database!)).map((row) => row.value);

describe('e25x A4 a saved reading drops its older draft', () => {
  it('a row written at a tab-hide while typing, then the value committed on blur: no row is left', async () => {
    const commit = vi.fn(async () => undefined);
    render(<Sheet commit={commit} />, { wrapper: Wrapper });
    await userEvent.type(screen.getByRole('textbox', { name: 'Corrente' }), '12');
    await hide();
    await waitFor(async () => expect(await values()).toEqual(['12']));
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(commit).toHaveBeenCalledTimes(1);
    await waitFor(async () => expect(await values()).toEqual([]));
  });

  it('a row written at a tab-hide while typing, then the sheet left with the focus in the field: the commit drops it', async () => {
    const commit = vi.fn(async () => undefined);
    render(<Sheet commit={commit} />, { wrapper: Wrapper });
    const input = screen.getByRole('textbox', { name: 'Corrente' });
    await userEvent.type(input, '12');
    await hide();
    await waitFor(async () => expect(await values()).toEqual(['12']));
    expect(input).toHaveFocus();
    // The stepper's tap: the field leaves the screen with no blur first.
    act(() => {
      screen.getByRole('button', { name: 'alternar' }).click();
    });
    expect(commit).toHaveBeenCalledTimes(1);
    await waitFor(async () => expect(await values()).toEqual([]));
  });

  it('a refused commit keeps the row', async () => {
    const commit = vi.fn(async () => {
      throw Object.assign(new Error('refused'), { name: 'QuotaExceededError' });
    });
    render(<Sheet commit={commit} />, { wrapper: Wrapper });
    await userEvent.type(screen.getByRole('textbox', { name: 'Corrente' }), '12');
    await hide();
    await waitFor(async () => expect(await values()).toEqual(['12']));
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(commit).toHaveBeenCalledTimes(1);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(await values()).toEqual(['12']);
  });
});

describe('e25x A3 a reading offered on return, answered by typing', () => {
  it('a valid value typed in the field and blurred: the row and the toast go, and a later load offers nothing', async () => {
    const commit = vi.fn(async () => undefined);
    const first = render(<Sheet commit={commit} />, { wrapper: Wrapper });
    await userEvent.type(screen.getByRole('textbox', { name: 'Corrente' }), 'abc');
    // Left with the sheet: not a number, so a draft offered on return.
    await userEvent.click(screen.getByRole('button', { name: 'alternar' }));
    await waitFor(async () => expect(await values()).toEqual(['abc']));
    await userEvent.click(screen.getByRole('button', { name: 'alternar' }));
    expect(await screen.findByTestId('toast')).toHaveTextContent('Rascunho encontrado');
    // The technician types a valid value instead of "Recuperar".
    await userEvent.type(screen.getByRole('textbox', { name: 'Corrente' }), '5');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(commit).toHaveBeenCalledTimes(1);
    await waitFor(async () => expect(await values()).toEqual([]));
    await waitFor(() => expect(screen.queryByTestId('toast')).toBeNull());
    first.unmount();
    render(<Sheet commit={commit} />, { wrapper: Wrapper });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});
