import { defaultBlockConfig, emptySheet, evaluateSheetReadings, getDefinition, type BlockRow, type Cell, type EvaluatedCell, type OpDraft } from '@app/domain';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncContext } from '../../state/sync.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { trackInputRefused } from '../../telemetry/hooks.ts';
import { makeSyncState } from '../../test/sync-state.ts';
import type { FichaApi } from './ficha-api.ts';
import { MeasurementField, ReadOnlyMeasurementField, SheetCellExtrasProvider, type SheetCellExtras } from './measurement-field.tsx';

/*
 * Story 22.10 and 22.12 in the one number cell: "OL" and "> 2 TΩ" typed, the Overflow's
 * "> limite", the refusals the kernel gives, and the previous visit's line under the cell.
 */

vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));
vi.mock('../../state/session.tsx', () => ({ useSession: () => ({ database: null, user: null, online: true }) }));
vi.mock('../../telemetry/hooks.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../telemetry/hooks.ts')>()),
  trackInputRefused: vi.fn(),
}));

const ID = '019966b0-2210-7000-8000-000000000011';
const OP = '019966b0-2210-7000-8000-000000000012';
const SEC = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');
const TP = getDefinition('v1', 'cabine_primaria', 'tp');

function block(type: 'chave_seccionadora' | 'tp', cells: Record<string, Record<string, Record<string, unknown>>> = {}): BlockRow {
  const sheet = emptySheet();
  for (const [testKey, rows] of Object.entries(cells)) {
    const out: Record<string, Record<string, Cell>> = {};
    for (const [row, cols] of Object.entries(rows)) {
      out[row] = Object.fromEntries(Object.entries(cols).map(([col, value]) => [col, { value: value as Cell['value'], source_suggestion_id: null, op_id: OP }]));
    }
    sheet.test[testKey] = { cells: out };
  }
  return {
    id: ID,
    relatorio_id: ID,
    location_id: null,
    equipment_id: ID,
    block_type: type,
    config: defaultBlockConfig('v1', type),
    seed_version: 'v1',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet,
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

afterEach(() => commit.mockClear());

/** The seccionadora's contato fechado Fase A insulation cell (GΩ family), as evaluated. */
function insulation(b = block('chave_seccionadora')): EvaluatedCell {
  return evaluateSheetReadings(b, SEC).find((t) => t.testKey === 'isolacao')!.tables.find((t) => t.key === 'contato_fechado')!.rows[0]!.cells[0]!;
}

/** The TP's first ratio capture. */
function ratio(): EvaluatedCell {
  return evaluateSheetReadings(block('tp'), TP).find((t) => t.testKey === 'relacao_transformacao')!.tables[0]!.rows[0]!.cells.find((c) => c.role === 'capture')!;
}

const RANGE: SheetCellExtras = { rangeOf: () => ({ raw: '2', unit: 'TΩ' }), previousOf: () => null };
const NO_RANGE: SheetCellExtras = { rangeOf: () => null, previousOf: () => null };

const wrap = (extras: SheetCellExtras, node: React.ReactNode) => (
  <SyncContext value={makeSyncState()}>
    <ToastProvider>
      <SheetCellExtrasProvider value={extras}>{node}</SheetCellExtrasProvider>
      <button type="button">fora</button>
    </ToastProvider>
  </SyncContext>
);

const written = () => commit.mock.calls.map((call) => call[0][0]!.value);

describe('Story 22.10: a reading above the instrument\'s limit', () => {
  it('"OL" with the picked megger\'s 2 TΩ stores {raw 2, unit TΩ, over_range} and shows "> 2"', async () => {
    render(wrap(RANGE, <MeasurementField api={api} cell={insulation()} label="Fase A" presentation="table" missing={false} onRun={() => false} />));
    const input = screen.getByRole('textbox', { name: 'Fase A' });
    await userEvent.type(input, 'OL');
    expect(screen.getByText('= > 2 TΩ')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(written()).toEqual([{ raw: '2', unit: 'TΩ', state: 'over_range' }]);
    expect(input).toHaveValue('> 2');
  });

  it('"> 2,5 g" stores the typed limit; a plain number stays a measured reading', async () => {
    render(wrap(NO_RANGE, <MeasurementField api={api} cell={insulation()} label="Fase A" presentation="table" missing={false} onRun={() => false} />));
    const input = screen.getByRole('textbox', { name: 'Fase A' });
    await userEvent.type(input, '> 2,5 g');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(written()).toEqual([{ raw: '2.5', unit: 'GΩ', state: 'over_range' }]);
  });

  it('"OL" with no instrument limit stores nothing and says why, in the cell\'s unit', async () => {
    render(wrap(NO_RANGE, <MeasurementField api={api} cell={insulation()} label="Fase A" presentation="table" missing={false} onRun={() => false} />));
    await userEvent.type(screen.getByRole('textbox', { name: 'Fase A' }), 'OL');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(written()).toEqual([]);
    expect(screen.getByText('Instrumento sem limite cadastrado: digite > e o limite (ex.: > 2 GΩ)')).toBeInTheDocument();
  });

  it('the Overflow\'s "> limite" writes the instrument limit at once', async () => {
    render(wrap(RANGE, <MeasurementField api={api} cell={insulation()} label="Fase A" presentation="table" missing={false} onRun={() => false} />));
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Fase A' }));
    expect(await screen.findByRole('menuitem', { name: 'Não medido' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: '> limite' }));
    expect(written()).toEqual([{ raw: '2', unit: 'TΩ', state: 'over_range' }]);
  });

  it('with no limit, "> limite" puts "> " in the input with the focus and the no-limit text under it', async () => {
    render(wrap(NO_RANGE, <MeasurementField api={api} cell={insulation()} label="Fase A" presentation="table" missing={false} onRun={() => false} />));
    const input = screen.getByRole('textbox', { name: 'Fase A' });
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Fase A' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: '> limite' }));
    expect(input).toHaveValue('> ');
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getByText('Instrumento sem limite cadastrado: digite > e o limite (ex.: > 2 GΩ)')).toBeInTheDocument();
    expect(written()).toEqual([]);
    await userEvent.type(input, '3T');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(written()).toEqual([{ raw: '3', unit: 'TΩ', state: 'over_range' }]);
  });

  it('"> limite" with no limit, then the field left holding only ">": the text is dropped, nothing committed, no refusal reported', async () => {
    vi.mocked(trackInputRefused).mockClear();
    render(wrap(NO_RANGE, <MeasurementField api={api} cell={insulation()} label="Fase A" presentation="table" missing={false} onRun={() => false} />));
    const input = screen.getByRole('textbox', { name: 'Fase A' });
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Fase A' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: '> limite' }));
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveValue('> ');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(input).toHaveValue('');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(written()).toEqual([]);
    expect(vi.mocked(trackInputRefused)).not.toHaveBeenCalled();
    expect(screen.queryByText(/Instrumento sem limite cadastrado/)).toBeNull();
  });

  it('a ratio cell refuses "OL" with the authored refusal, and its Overflow offers no "> limite"', async () => {
    render(wrap(RANGE, <MeasurementField api={api} cell={ratio()} label="Fase R" presentation="table" missing={false} onRun={() => false} />));
    await userEvent.type(screen.getByRole('textbox', { name: 'Fase R' }), 'OL');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(written()).toEqual([]);
    expect(screen.getByText('O ensaio de relação de transformação não aceita valor acima do limite: informe o valor medido.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Fase R' }));
    expect(await screen.findByRole('menuitem', { name: 'Não medido' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '> limite' })).toBeNull();
  });

  it('the unit slot cycled on a stored limit rewrites it in the new unit, still over range', async () => {
    const stored = insulation(block('chave_seccionadora', { isolacao: { '3': { '0': { raw: '2', unit: 'TΩ', state: 'over_range' } } } }));
    expect(stored).toMatchObject({ state: 'over_range', displayText: '> 2' });
    render(wrap(RANGE, <MeasurementField api={api} cell={stored} label="Fase A" presentation="table" missing={false} onRun={() => false} />));
    expect(screen.getByRole('textbox', { name: 'Fase A' })).toHaveValue('> 2');
    await userEvent.click(screen.getByRole('button', { name: /toque para alternar/ }));
    expect(written()).toEqual([{ raw: '2', unit: 'MΩ', state: 'over_range' }]);
  });
});

describe('Story 22.12: the previous visit\'s value under the cell', () => {
  const PREVIOUS: SheetCellExtras = { rangeOf: () => null, previousOf: (address) => (address.row === 3 ? 'Anterior: 4,9 GΩ (rev. 1, 05/10/2026)' : null) };

  it('shows the kernel\'s line as a neutral helper, never a live region, the cell left empty', () => {
    render(wrap(PREVIOUS, <MeasurementField api={api} cell={insulation()} label="Fase A" presentation="table" missing={false} onRun={() => false} />));
    const line = screen.getByText('Anterior: 4,9 GΩ (rev. 1, 05/10/2026)');
    expect(line).toHaveClass('mf-helper');
    expect(line).toHaveAttribute('data-tone', 'outlier');
    expect(line).not.toHaveAttribute('role');
    expect(screen.getByRole('textbox', { name: 'Fase A' })).toHaveValue('');
    expect(written()).toEqual([]);
  });

  it('the read-only cell shows a stored limit "> 2" and the previous line too', () => {
    const stored = insulation(block('chave_seccionadora', { isolacao: { '3': { '0': { raw: '2', unit: 'TΩ', state: 'over_range' } } } }));
    render(wrap(PREVIOUS, <ReadOnlyMeasurementField cell={stored} label="Fase A" />));
    expect(screen.getByRole('textbox', { name: 'Fase A' })).toHaveTextContent('> 2');
    expect(screen.getByText('Anterior: 4,9 GΩ (rev. 1, 05/10/2026)')).toBeInTheDocument();
  });
});
