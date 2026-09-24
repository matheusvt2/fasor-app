import 'fake-indexeddb/auto';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import type { SessionState } from '../../state/session.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { useRelatorioEditor, type RelatorioEditor } from './relatorio-editor.ts';

/*
 * Epic 4 QA Q7 review: a move's `settle` waits for the render that draws it. A newer
 * edit's own toast or announcement must never be overtaken by that older pending one:
 * `undoable` and `announce` say the pending settle first.
 */

const USER = '019966c1-0060-7000-8000-000000000001';
const COMPANY = '019966c1-0060-7000-8000-000000000002';
const RELATORIO = '019966c1-0060-7000-8000-000000000003';
const PROJECT = '019966c1-0060-7000-8000-000000000004';
const BATCH_A = '019966c1-0060-7000-8000-00000000000a';
const BATCH_B = '019966c1-0060-7000-8000-00000000000b';

let database: AppDatabase | null = null;

const session = (): SessionState => ({
  status: 'signed-in',
  user: { id: USER, name: 'Bento Braga', email: 'b@teste.local', companyId: COMPANY, companyName: 'Empresa B de Teste', council: null, registrationNumber: null, title: null },
  online: true,
  reAuthRequired: false,
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  dismissReAuth: vi.fn(),
  recoveryNeeded: false,
  dismissRecovery: vi.fn(),
});

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));

let editor: RelatorioEditor | null = null;
function Probe() {
  editor = useRelatorioEditor(RELATORIO, PROJECT);
  return <p data-testid="announcer">{editor.announcement}</p>;
}

function renderEditor() {
  render(
    <ToastProvider>
      <Probe />
      <ToastOutlet />
    </ToastProvider>,
  );
}

afterEach(() => {
  database?.close();
  database = null;
  editor = null;
});

describe('Q7 useRelatorioEditor settle ordering', () => {
  it('an older pending settle toasts before a newer edit\'s own toast, so "Desfazer" stands for the newer batch', async () => {
    database = openDatabase('019966c1-0061-7000-8000-000000000001');
    renderEditor();
    // A move not drawn yet: its announcement and toast wait.
    act(() => editor!.settle(() => false, 'A movido', () => editor!.undoable('A movido', BATCH_A)));
    expect(screen.queryByTestId('toast')).toBeNull();
    // A newer edit toasts at once: the older one goes first, the newer stays.
    act(() => editor!.undoable('B removido', BATCH_B));
    expect(screen.getByTestId('toast')).toHaveTextContent('B removido');
    // Nothing of the older one lands later (its fallback timer was cleared).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    expect(screen.getByTestId('toast')).toHaveTextContent('B removido');
  });

  it('an older pending settle is said before a newer announcement, never after it', async () => {
    database = openDatabase('019966c1-0061-7000-8000-000000000002');
    renderEditor();
    act(() => editor!.settle(() => false, 'A movido', undefined));
    act(() => editor!.announce('B movido'));
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(screen.getByTestId('announcer')).toHaveTextContent('B movido');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    expect(screen.getByTestId('announcer')).toHaveTextContent('B movido');
  });

  it('settles in the render where the edit is drawn, well before the fallback', async () => {
    database = openDatabase('019966c1-0061-7000-8000-000000000003');
    renderEditor();
    let drawn = false;
    act(() => editor!.settle(() => drawn, 'C movido', () => editor!.undoable('C movido', BATCH_A)));
    expect(screen.queryByTestId('toast')).toBeNull();
    drawn = true;
    act(() => editor!.settleCheck());
    expect(screen.getByTestId('announcer')).toHaveTextContent('C movido');
    expect(screen.getByTestId('toast')).toHaveTextContent('C movido');
  });
});
