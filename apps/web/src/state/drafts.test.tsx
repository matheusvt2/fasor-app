import 'fake-indexeddb/auto';
import { draftKey } from '@app/domain';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listDrafts, saveDraft } from '../db/drafts.ts';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { DraftProvider, useDraftSource, useDrafts } from './drafts.tsx';
import type { SessionState } from './session.tsx';
import { ToastOutlet, ToastProvider, useToast } from './toast.tsx';

/*
 * Test 1.8-E2E-001's unit half (FR-61, AD-2): one row per source on hide, an offer on
 * reopen that is never applied by itself, and a dismissal that keeps the row.
 */

let database: AppDatabase | null = null;

const session = (): SessionState => ({
  status: 'signed-in',
  user: { id: 'u1', name: 'Bruno', email: 'b@teste.local', companyId: 'c1', companyName: 'E', council: null, registrationNumber: null, title: null },
  online: true,
  reAuthRequired: false,
  recoveryNeeded: false,
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  dismissReAuth: vi.fn(),
  dismissRecovery: vi.fn(),
});

vi.mock('./session.tsx', () => ({ useSession: () => session() }));

const ENTITY = '019966b0-0040-7000-8000-000000000001';
const TARGET = { surface: 'ficha', entity_id: ENTITY, field: 'observacoes' };

let counter = 0;

beforeEach(async () => {
  const user = `019966b0-0041-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const stale = openDatabase(user);
  await stale.delete();
  database = openDatabase(user);
  await database.open();
});

afterEach(() => {
  database?.close();
  database = null;
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

/** A surface with one uncommitted value, exactly as Epic 5's sheets will register one. */
function Field({ committed = '', withOtherToast = false }: { committed?: string; withOtherToast?: boolean }) {
  const [text, setText] = useState('');
  const { draftFound } = useDrafts();
  const { showToast, dismissToast } = useToast();
  useDraftSource({
    surface: TARGET.surface,
    entityId: TARGET.entity_id,
    field: TARGET.field,
    read: () => (text === committed ? null : text),
    apply: (value) => setText(String(value)),
  });
  return (
    <>
      <input aria-label="texto" value={text} onChange={(e) => setText(e.target.value)} />
      <span data-testid="draft-found">{String(draftFound)}</span>
      {withOtherToast ? (
        <>
          <button type="button" onClick={() => showToast('Outra mensagem')}>
            outro aviso
          </button>
          <button type="button" onClick={() => dismissToast()}>
            dispensar
          </button>
        </>
      ) : null}
    </>
  );
}

/** One registered source, so a test can mount several of them side by side. */
function OneField({ label, field }: { label: string; field: string }) {
  const [text, setText] = useState('');
  useDraftSource({
    surface: TARGET.surface,
    entityId: TARGET.entity_id,
    field,
    read: () => (text === '' ? null : text),
    apply: (value) => setText(String(value)),
  });
  return <input aria-label={label} value={text} onChange={(e) => setText(e.target.value)} />;
}

function ThreeFields() {
  return (
    <>
      <OneField label="um" field="a" />
      <OneField label="dois" field="b" />
      <OneField label="tres" field="c" />
    </>
  );
}

async function hide(): Promise<void> {
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
  });
}

describe('persisting on tab hide', () => {
  it('writes one row per source under its draft key', async () => {
    render(<Field />, { wrapper: Wrapper });
    await userEvent.type(screen.getByLabelText('texto'), 'meia frase');
    await hide();
    await waitFor(async () => {
      expect(await listDrafts(database!)).toHaveLength(1);
    });
    const [row] = await listDrafts(database!);
    expect(row).toMatchObject({ key: draftKey(TARGET), surface: 'ficha', entity_id: ENTITY, value: 'meia frase' });
    expect(row!.saved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('writes nothing when the source holds the committed value', async () => {
    render(<Field committed="igual" />, { wrapper: Wrapper });
    await userEvent.type(screen.getByLabelText('texto'), 'igual');
    await hide();
    await act(async () => {
      await Promise.resolve();
    });
    expect(await listDrafts(database!)).toHaveLength(0);
  });

  // The failure this table exists to prevent: an iOS tab discarded part-way through the
  // hide keeping the first draft and losing the rest.
  it('writes every registered source of one pagehide, not just the first', async () => {
    render(<ThreeFields />, { wrapper: Wrapper });
    for (const label of ['um', 'dois', 'tres']) {
      await userEvent.type(screen.getByLabelText(label), `texto ${label}`);
    }
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      await Promise.resolve();
    });
    await waitFor(async () => {
      expect(await listDrafts(database!)).toHaveLength(3);
    });
    const rows = await listDrafts(database!);
    expect(rows.map((row) => row.value).sort()).toEqual(['texto dois', 'texto tres', 'texto um']);
  });

  it('also persists on pagehide, the event iOS Safari fires when it discards the tab', async () => {
    render(<Field />, { wrapper: Wrapper });
    await userEvent.type(screen.getByLabelText('texto'), 'x');
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      await Promise.resolve();
    });
    await waitFor(async () => {
      expect(await listDrafts(database!)).toHaveLength(1);
    });
  });
});

describe('offering a draft on reopen', () => {
  it('shows the persistent toast and applies nothing until it is pressed', async () => {
    await saveDraft(database!, TARGET, 'do dia anterior', new Date('2026-09-21T10:00:00.000Z'));
    render(<Field />, { wrapper: Wrapper });

    const toast = await screen.findByTestId('toast');
    expect(toast).toHaveTextContent('Rascunho encontrado');
    // Nothing has been applied: the input is still empty and the row is still there.
    expect(screen.getByLabelText('texto')).toHaveValue('');
    expect(await listDrafts(database!)).toHaveLength(1);
    expect(screen.getByTestId('draft-found')).toHaveTextContent('true');

    await userEvent.click(screen.getByRole('button', { name: 'Recuperar' }));
    expect(screen.getByLabelText('texto')).toHaveValue('do dia anterior');
    await waitFor(async () => {
      expect(await listDrafts(database!)).toHaveLength(0);
    });
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('keeps the row when the toast is dismissed, so the next launch offers it again', async () => {
    await saveDraft(database!, TARGET, 'guardado', new Date('2026-09-21T10:00:00.000Z'));
    const first = render(<Field />, { wrapper: Wrapper });
    await screen.findByTestId('toast');
    // The toast carries an action, so it never expires by itself; dismissing is the
    // user closing the page or navigating away.
    first.unmount();
    expect(await listDrafts(database!)).toHaveLength(1);

    render(<Field />, { wrapper: Wrapper });
    expect(await screen.findByTestId('toast')).toHaveTextContent('Rascunho encontrado');
  });

  it('keeps the row and the offer when the owning surface is not mounted', async () => {
    await saveDraft(database!, { surface: 'outra', entity_id: ENTITY }, 'de outra tela', new Date());
    render(<Field />, { wrapper: Wrapper });
    await screen.findByTestId('toast');
    await userEvent.click(screen.getByRole('button', { name: 'Recuperar' }));
    // Nothing to apply it to: the row survives and the offer comes back.
    expect(await listDrafts(database!)).toHaveLength(1);
    expect(await screen.findByTestId('toast')).toHaveTextContent('Rascunho encontrado');
  });

  it('a second tab-hide keeps the row that is still on offer', async () => {
    await saveDraft(database!, TARGET, 'do dia anterior', new Date('2026-09-21T10:00:00.000Z'));
    render(<Field />, { wrapper: Wrapper });
    await screen.findByTestId('toast');

    // Backgrounding the app (the camera switch) while the offer stands: the surface holds
    // the committed value, so its `read()` is null — and that must not delete the draft.
    await hide();
    await hide();
    expect(await listDrafts(database!)).toHaveLength(1);
    expect(await screen.findByTestId('toast')).toHaveTextContent('Rascunho encontrado');

    await userEvent.click(screen.getByRole('button', { name: 'Recuperar' }));
    expect(screen.getByLabelText('texto')).toHaveValue('do dia anterior');
  });

  it('hands back the newest text when a tab-hide rewrote the offered row', async () => {
    await saveDraft(database!, TARGET, 'antigo', new Date('2026-09-21T10:00:00.000Z'));
    render(<Field />, { wrapper: Wrapper });
    await screen.findByTestId('toast');

    await userEvent.type(screen.getByLabelText('texto'), 'mais novo');
    await hide();
    await waitFor(async () => {
      expect((await listDrafts(database!))[0]?.value).toBe('mais novo');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Recuperar' }));
    await waitFor(() => {
      expect(screen.getByLabelText('texto')).toHaveValue('mais novo');
    });
  });

  it('comes back after another toast takes the single slot', async () => {
    await saveDraft(database!, TARGET, 'guardado', new Date('2026-09-21T10:00:00.000Z'));
    render(<Field withOtherToast />, { wrapper: Wrapper });
    await screen.findByTestId('toast');

    // Any other toast replaces it — the offline line, a refused-write error.
    await userEvent.click(screen.getByRole('button', { name: 'outro aviso' }));
    expect(screen.getByTestId('toast')).toHaveTextContent('Outra mensagem');
    expect(screen.queryByRole('button', { name: 'Recuperar' })).toBeNull();

    // When the slot frees, the offer is raised again: the draft-found banner carries no
    // action, so this is the only way back to "Recuperar" short of a reload.
    await userEvent.click(screen.getByRole('button', { name: 'dispensar' }));
    expect(await screen.findByTestId('toast')).toHaveTextContent('Rascunho encontrado');
    expect(screen.getByRole('button', { name: 'Recuperar' })).toBeVisible();
  });

  it('offers nothing when the table is empty', async () => {
    render(<Field />, { wrapper: Wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('toast')).toBeNull();
    expect(screen.getByTestId('draft-found')).toHaveTextContent('false');
  });
});
