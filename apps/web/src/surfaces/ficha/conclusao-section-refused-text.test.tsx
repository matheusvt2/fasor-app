import 'fake-indexeddb/auto';
import { composeConclusion, defaultBlockConfig, emptySheet, getDefinition, NO_VISIT_CONTEXT, type BlockRow, type Cell, type Sheet } from '@app/domain';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listDrafts } from '../../db/drafts.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { DraftProvider } from '../../state/drafts.tsx';
import type { SessionState } from '../../state/session.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import type { Build } from '../relatorio/relatorio-editor.ts';
import { ConclusaoSection } from './conclusao-section.tsx';
import type { FichaApi } from './ficha-api.ts';

/*
 * Fix batch e25x, "e25x A1" (and A10, A1's real caller): the conclusion text typed in the sheet and refused by the
 * store is not lost. Through `ConclusaoSection` and its real `confirmText` (no stand-in `onEdit`), with the real draft
 * store: the 500 ms pause writes the text and the write is refused; the field stays dirty, so a tab-hide writes its
 * draft and the blur writes the same text again. Fix batch e25x, "e25x A4": once that write succeeded, the draft row
 * the tab-hide left is dropped. This file has its own draft store, which `conclusao-section.test.tsx` stubs out.
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

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));

const ID = '019966b0-0e25-7000-8000-0000000000a1';
const OP = '019966b0-0e25-7000-8000-0000000000a2';
const SEC = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');
const AUTHOR = { id: 'u1', companyId: 'c1' };
const ROWS = { blocks: [], locations: [], allLocations: [], equipment: [] };

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });

function block(sheet: Partial<Sheet>): BlockRow {
  return {
    id: ID,
    relatorio_id: ID,
    location_id: null,
    equipment_id: ID,
    block_type: 'chave_seccionadora',
    config: defaultBlockConfig('v1', 'chave_seccionadora', { subtype: 'manual' }),
    seed_version: 'v1',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: { ...emptySheet(), ...sheet },
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

const pair = { result: cell('aprovado'), restriction: cell('sem_restricoes') };
const readings: Sheet['test'] = { isolacao: { cells: { '0': { '0': cell({ raw: '147', unit: 'GΩ', state: 'measured' }) } } } };

/** A concluded sheet whose text the engineer edited: the field is open for typing. */
function edited(): BlockRow {
  const basis = composeConclusion(block({ test: readings, conclusion: pair }), SEC, 'SEC-C05').basis;
  return block({ test: readings, conclusion: { ...pair, text: cell('Texto do engenheiro.'), text_status: cell('edited'), text_basis: cell(basis) } });
}

let counter = 0;

beforeEach(async () => {
  const user = `019966b0-0e25-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
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

describe('e25x A1 a refused conclusion text is written again, and is a draft meanwhile', () => {
  it('the 500 ms pause is refused: the tab-hide writes its draft, the blur writes the same text again, then the draft goes', async () => {
    const shown = edited();
    const edit = vi.fn<(build: Build) => Promise<string | null>>().mockRejectedValueOnce(new DOMException('refused', 'UnknownError')).mockResolvedValue('batch');
    const api: FichaApi = {
      relatorioId: ID,
      projectId: ID,
      blockId: ID,
      author: AUTHOR,
      commit: vi.fn(async () => undefined),
      edit,
      undoable: vi.fn(),
      announce: vi.fn(),
    };
    render(
      <>
        <ConclusaoSection api={api} block={shown} definition={SEC} tag="SEC-C05" className="ficha-step" onFocus={() => undefined} section9={{ ref: 'seção 5', prints: true, absent: 'não sai no documento: o relatório não tem a seção 5' }} visit={NO_VISIT_CONTEXT} />
        <button type="button">fora</button>
      </>,
      { wrapper: Wrapper },
    );
    const area = screen.getByRole('textbox', { name: 'Texto da conclusão' });
    await userEvent.type(area, ' Mais.');
    // The 500 ms pause writes the text, and the store refuses it.
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(1), { timeout: 3_000 });
    const typed = 'Texto do engenheiro. Mais.';
    const textOf = (call: number) => (edit.mock.calls[call]![0]([shown], AUTHOR, ROWS) ?? []).find((op) => op.path.endsWith('/text'))?.value;
    expect(textOf(0)).toBe(typed);
    // The refusal is seen: the error toast says so.
    expect(await screen.findByTestId('toast')).toBeInTheDocument();
    // Meanwhile the text is a draft: a tab-hide writes it.
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    await waitFor(async () => expect((await listDrafts(database!)).map((row) => row.value)).toEqual([typed]));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    // The blur writes the same text again.
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(2));
    expect(textOf(1)).toBe(typed);
    // e25x A4: that write succeeded, so the older draft row of the field is gone.
    await waitFor(async () => expect(await listDrafts(database!)).toEqual([]));
  });
});
