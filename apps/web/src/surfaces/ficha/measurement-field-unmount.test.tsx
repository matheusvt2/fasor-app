import { defaultBlockConfig, emptySheet, evaluateSheetReadings, getDefinition, type BlockRow, type EvaluatedCell, type OpDraft } from '@app/domain';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncContext } from '../../state/sync.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import type { FichaApi } from './ficha-api.ts';
import { MeasurementField, SheetCellExtrasProvider, type SheetCellExtras } from './measurement-field.tsx';

/*
 * Story 25.2 (M02): a reading typed and left with the sheet (the tree, "Voltar", the stepper: the cell unmounts with no
 * blur first) is committed as a blur commits it; text that is no number is written to the draft store at that moment
 * (offered on return); the lone ">" of "> limite" is dropped; "3.3", a pause, "00" is never committed mid-typing.
 */

// The draft writes the unmount asks for, with their options, and what the source read then.
const drafts = vi.hoisted(() => ({ writes: [] as { value: unknown; options: unknown }[] }));
vi.mock('../../state/drafts.tsx', () => ({
  useDraftSource: (source: { read: () => unknown }) => (options?: unknown) => {
    drafts.writes.push({ value: source.read(), options });
    return Promise.resolve();
  },
}));
vi.mock('../../state/session.tsx', () => ({ useSession: () => ({ database: null, user: null, online: true }) }));

const ID = '019966b0-2520-7000-8000-000000000011';
const SEC = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');

function block(): BlockRow {
  return {
    id: ID,
    relatorio_id: ID,
    location_id: null,
    equipment_id: ID,
    block_type: 'chave_seccionadora',
    config: defaultBlockConfig('v1', 'chave_seccionadora'),
    seed_version: 'v1',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: emptySheet(),
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

const commit = vi.fn<(drafts: OpDraft[]) => Promise<void>>(async () => undefined);
const api: FichaApi = {
  relatorioId: ID,
  projectId: ID,
  blockId: ID,
  author: { id: 'u1', companyId: 'c1' },
  commit,
  edit: vi.fn(async () => null),
  undoable: vi.fn(),
  announce: vi.fn(),
};

afterEach(() => {
  commit.mockClear();
  drafts.writes = [];
});

/** The seccionadora's contato fechado Fase A insulation cell, empty. */
function insulation(): EvaluatedCell {
  return evaluateSheetReadings(block(), SEC).find((t) => t.testKey === 'isolacao')!.tables.find((t) => t.key === 'contato_fechado')!.rows[0]!.cells[0]!;
}

const NO_RANGE: SheetCellExtras = { rangeOf: () => null, previousOf: () => null };

function cell() {
  return (
    <SyncContext value={makeSyncState()}>
      <ToastProvider>
        <SheetCellExtrasProvider value={NO_RANGE}>
          <MeasurementField api={api} cell={insulation()} label="Fase A" presentation="table" missing={false} onRun={() => false} />
        </SheetCellExtrasProvider>
      </ToastProvider>
    </SyncContext>
  );
}

const written = () => commit.mock.calls.map((call) => call[0][0]!.value);

describe('25.2-WEB a reading left with the sheet', () => {
  it('"548" typed, the focus still in the cell, the cell unmounts: 548 is committed once, with its unit, as a blur commits it', async () => {
    const { unmount } = render(cell());
    const input = screen.getByRole('textbox', { name: 'Fase A' });
    await userEvent.type(input, '548');
    expect(input).toHaveFocus();
    expect(written()).toEqual([]);
    unmount();
    expect(written()).toHaveLength(1);
    expect(written()[0]).toMatchObject({ raw: '548', state: 'measured' });
    // Its unit: the cell's own (the slot's), never none.
    expect(insulation().units).toContain((written()[0] as { unit: string | null }).unit);
    // No draft is written. Fix batch e25x (A4): once the commit succeeded, the field's older draft is dropped
    // (the source reads nothing typed then).
    await waitFor(() => expect(drafts.writes).toEqual([{ value: null, options: { committed: true, answersOffer: true } }]));
  });

  it('text that is no number is not committed; its draft is written at once and offered on return', async () => {
    const { unmount } = render(cell());
    await userEvent.type(screen.getByRole('textbox', { name: 'Fase A' }), 'abc');
    unmount();
    expect(written()).toEqual([]);
    expect(drafts.writes).toEqual([{ value: 'abc', options: { offerOnReturn: true } }]);
  });

  it('"3.3", a pause of two seconds, "00", then left: 3300 is committed once, no idle commit ran', async () => {
    const { unmount } = render(cell());
    const input = screen.getByRole('textbox', { name: 'Fase A' });
    await userEvent.type(input, '3.3');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 2_000)));
    expect(written()).toEqual([]);
    await userEvent.type(input, '00');
    unmount();
    expect(written()).toHaveLength(1);
    expect(written()[0]).toMatchObject({ raw: '3300', state: 'measured' });
  });

  it('the lone ">" a "> limite" with no instrument limit left is dropped: nothing committed, no draft', async () => {
    const { unmount } = render(cell());
    const input = screen.getByRole('textbox', { name: 'Fase A' });
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Fase A' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: '> limite' }));
    await waitFor(() => expect(input).toHaveValue('> '));
    unmount();
    expect(written()).toEqual([]);
    expect(drafts.writes).toEqual([]);
  });

  it('a reading committed on blur is not committed again when the cell unmounts', async () => {
    const { unmount } = render(
      <>
        {cell()}
        <button type="button">fora</button>
      </>,
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Fase A' }), '548');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(written()).toHaveLength(1);
    unmount();
    expect(written()).toHaveLength(1);
  });
});
