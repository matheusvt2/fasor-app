import { asBlockDefinition, choiceValue, emptySheet, evaluateSheetMeasurements, sheetTestRowCellPath, sheetTestRowPath, uuidV7Schema, type BlockRow, type Cell, type CompanyTypeDefinition, type JsonValue, type OpDraft, type RelatorioSnapshot, type Sheet } from '@app/domain';
import { ADDED_ROWS_BLOCK_ID, ADDED_ROWS_DEFINITION, ADDED_ROWS_RELATORIO_ID, addedRowId, addedRowsBlock, addedRowsVersionRow, BATTERIES_TEST, POINTS_TEST, reading } from '@app/domain/fixtures/added-rows';
import { cleanup, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../state/toast.tsx';
import { axe } from '../../test-axe.ts';
import type { Build } from '../relatorio/relatorio-editor.ts';
import type { FichaApi } from './ficha-api.ts';
import { MeasurementTests } from './measurement-test-section.tsx';
import { SheetReadOnlyProvider } from './sheet-read-only.tsx';

/*
 * Story 25.14 (batch e25s; `60-ficha.html` #/ficha/MA-02 and #/ficha/NB-02 `.e25-added`, `.e25-add-row`; DESIGN.md ›
 * Measurement table): the controls of a row the technician adds, at 390, 768 and 1280 px, data in and ops out. The
 * rows, names, verdicts, counts and words are the kernel's (`evaluateSheetMeasurements`, `relatorio/added-rows.ts`);
 * these tests check the surface draws them and writes the right path and value. jsdom applies no stylesheet, so a
 * table that stacks on phone has its rows twice in the document (table and cards): each width's case reads the rule
 * that decides which one shows there (`app.css`, `ficha.css`) and works the controls of that one. The definition is
 * the kernel's fixture company type (`@app/domain/fixtures/added-rows`): no seeded sheet takes added rows before
 * Story 25.16. Values invented.
 */

vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));

const AUTHOR = { id: 'u1', companyId: 'c1' };
const OP = '019a5c00-2517-7000-8000-0000000000aa';
const stored = (value: unknown): Cell => ({ value: value as JsonValue, source_suggestion_id: null, op_id: OP });

/** The fixture's type with a third column on the batteries' test (an optional current), so that table stacks into cards on phone. */
const STACKED: CompanyTypeDefinition = (() => {
  const out = structuredClone(ADDED_ROWS_DEFINITION);
  out.measurement_tests![1]!.columns.push({ key: 'corrente', label: 'Corrente', kind: 'number', unit: 'A', optional: true });
  return out;
})();
const definition = asBlockDefinition(addedRowsVersionRow(STACKED));

/** A sheet with added rows on `testKey` (`{id, name, cells}`), over `base`. */
function withRows(testKey: string, rows: { id: string; name: string | null; cells?: Record<number, unknown> }[], base: Sheet = emptySheet()): Sheet {
  const sheet = structuredClone(base);
  const entry = (sheet.test[testKey] ??= { cells: {} });
  entry.added_rows = Object.fromEntries(rows.map((row) => [row.id, { name: stored(row.name), cells: Object.fromEntries(Object.entries(row.cells ?? {}).map(([col, value]) => [col, stored(value)])) }]));
  return sheet;
}

function renderSheet(sheet: Sheet, { readOnly = false }: { readOnly?: boolean } = {}) {
  const block: BlockRow = addedRowsBlock(sheet, 'v16', STACKED);
  const commits: OpDraft[][] = [];
  const edits: OpDraft[][] = [];
  const announced: string[] = [];
  const undoable = vi.fn();
  const api: FichaApi = {
    relatorioId: ADDED_ROWS_RELATORIO_ID,
    projectId: ADDED_ROWS_RELATORIO_ID,
    blockId: ADDED_ROWS_BLOCK_ID,
    author: AUTHOR,
    commit: vi.fn(async (drafts: OpDraft[]) => {
      commits.push(drafts);
    }),
    // The build runs against the block the store holds, as the relatório's edit queue runs it.
    edit: vi.fn(async (build: Build) => {
      const drafts = build([block], AUTHOR, { blocks: [], locations: [], allLocations: [], equipment: [] });
      if (drafts === null) return null;
      edits.push(drafts);
      return 'batch';
    }),
    undoable,
    announce: vi.fn((text: string) => {
      announced.push(text);
    }),
  };
  const snapshot = { relatorio: { setup: { service_end: null, instrument_ids: [] } }, blocks: [block], files: [], equipment_types: [addedRowsVersionRow(STACKED)] } as unknown as RelatorioSnapshot;
  const view = render(
    <MemoryRouter>
      <ToastProvider>
        <SheetReadOnlyProvider value={readOnly}>
          <MeasurementTests api={api} snapshot={snapshot} block={block} definition={definition} evaluations={evaluateSheetMeasurements(block, definition)} instruments={[]} onRun={vi.fn(() => false)} />
        </SheetReadOnlyProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
  return { ...view, commits, edits, announced, undoable };
}

const sectionOf = (container: HTMLElement, testKey: string) => container.querySelector<HTMLElement>(`.lib-test[data-test-key="${testKey}"]`)!;
const tableOf = (root: HTMLElement) => root.querySelector<HTMLElement>('table.measurement-table')!;
const cardsOf = (root: HTMLElement) => root.querySelector<HTMLElement>('.lib-cards');

/** The stylesheet text without comments. */
const css = (path: string) => readFileSync(resolve(__dirname, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const PHONE_QUERY = '@media (max-width: 767.98px) {';
function phoneRules(): string {
  const text = css('../../styles/app.css');
  const start = text.indexOf(PHONE_QUERY);
  return text.slice(start, text.indexOf('\n}\n', start));
}

afterEach(cleanup);

const ROUTE = '[data-route="/relatorio/:id/ficha/:blockId"]';

describe('25.14 the frame\'s rules: an added row\'s name and remove action, the actions under the table', () => {
  it('ficha.css holds the frame\'s `.e25-added`, `.card-point.e25-card-added` and `.e25-add-row` declarations, route-wide (every width)', () => {
    const text = css('./ficha.css');
    for (const rule of [
      `${ROUTE} .e25-added { display: flex; align-items: center; gap: var(--sp-1); min-width: 0; }`,
      `${ROUTE} .e25-added .field { flex: 1; min-width: 0; }`,
      `${ROUTE} .e25-added .input { min-width: 0; }`,
      `${ROUTE} .measurement-table td.cell-point:has(.e25-added) { min-width: 220px; }`,
      `${ROUTE} .card-point.e25-card-added { margin-bottom: var(--sp-2); }`,
      `${ROUTE} .e25-add-row { margin-top: var(--sp-3); align-items: center; }`,
    ]) {
      expect(text).toContain(rule);
    }
  });
});

/*
 * Each width: which presentation shows a stacking table there (`app.css`'s phone rule: the cards below 768 px, the
 * table from 768 px), and the controls of that presentation for a row with no name, a named one and the actions.
 */
describe.each([
  { width: 390, shows: 'cards' as const },
  { width: 768, shows: 'table' as const },
  { width: 1280, shows: 'table' as const },
])('25.14 at $width px: the added row\'s controls', ({ width, shows }) => {
  it(`the stacking batteries' table shows its ${shows} there, a one-column table stays a table, and the added row's controls are in it`, () => {
    const phone = phoneRules();
    const cardsOnPhone = phone.includes('.screen[data-route="/relatorio/:id/ficha/:blockId"] .lib-cards { display: block; }') && phone.includes('.screen[data-route="/relatorio/:id/ficha/:blockId"] .measurement-table.has-cards { display: none; }');
    expect(cardsOnPhone).toBe(true);
    // Below the tablet breakpoint the phone rule applies; from 768 px it does not.
    expect(width < 768).toBe(shows === 'cards');

    const sheet = withRows(BATTERIES_TEST, [{ id: addedRowId(1), name: 'Bateria 1', cells: { 0: reading('13.6', 'V') } }, { id: addedRowId(2), name: null }]);
    const { container } = renderSheet(withRows(POINTS_TEST, [{ id: addedRowId(3), name: 'Quadro geral de baixa tensão' }], sheet));
    const batteries = sectionOf(container, BATTERIES_TEST);
    expect(tableOf(batteries)).toHaveClass('has-cards');
    const shown = shows === 'cards' ? cardsOf(batteries)! : tableOf(batteries);
    // The rows after the definition's: "Banco", then the two added ones in the order they were created.
    const rows = [...shown.querySelectorAll<HTMLElement>(shows === 'cards' ? '.measurement-card' : 'tbody tr')];
    expect(rows.map((row) => row.hasAttribute('data-added-row'))).toEqual([false, true, true]);
    const [, named, unnamed] = rows;
    // The name is a Field labelled by the kernel ("Nome da bateria"), required: the unnamed one is missing.
    expect(within(named!).getByRole('textbox', { name: 'Nome da bateria' })).toHaveValue('Bateria 1');
    expect(within(unnamed!).getByRole('textbox', { name: 'Nome da bateria' })).toHaveValue('');
    expect(within(unnamed!).getByRole('textbox', { name: 'Nome da bateria' })).toHaveAttribute('aria-invalid', 'true');
    expect(unnamed!.querySelector('.e25-added .field')).toHaveAttribute('data-missing-field');
    // The remove action beside it, named by the row (the frame's "Remover bateria Bateria 1").
    expect(within(named!).getByRole('button', { name: 'Remover bateria Bateria 1' })).toBeVisible();
    expect(within(unnamed!).getByRole('button', { name: 'Remover bateria Bateria sem nome' })).toBeVisible();
    // Its reading cells are the sheet's Measurement fields, named by the row and the column.
    expect(within(named!).getAllByRole('textbox', { name: 'Bateria 1, Tensão' })[0]).toHaveValue('13,6');
    if (shows === 'cards') expect(named!.querySelector('.card-point.e25-card-added .e25-added')).not.toBeNull();
    else expect(named!.querySelector('td.cell-point .e25-added')).not.toBeNull();
    // A one-column table stays a table at every width (EXPERIENCE.md › Measurement table): no cards.
    const points = sectionOf(container, POINTS_TEST);
    expect(cardsOf(points)).toBeNull();
    expect(within(tableOf(points)).getByRole('textbox', { name: 'Nome do ponto' })).toHaveValue('Quadro geral de baixa tensão');
    // The actions under the table, after the cards: "Adicionar ponto", "Adicionar bateria".
    expect(within(points).getByRole('button', { name: 'Adicionar ponto' })).toBeVisible();
    expect(within(batteries).getByRole('button', { name: 'Adicionar bateria' })).toBeVisible();
    expect(batteries.querySelector('.ficha-mt > .e25-add-row')).not.toBeNull();
  });

  it('typing a name commits it on the row\'s name path (trimmed); emptying it writes null; a name another row has is refused with the helper', async () => {
    const { container, commits } = renderSheet(withRows(BATTERIES_TEST, [{ id: addedRowId(1), name: 'Bateria 1' }, { id: addedRowId(2), name: null }]));
    const batteries = sectionOf(container, BATTERIES_TEST);
    const shown = shows === 'cards' ? cardsOf(batteries)! : tableOf(batteries);
    const fields = within(shown).getAllByRole('textbox', { name: 'Nome da bateria' });
    await userEvent.type(fields[1]!, '  Bateria reserva  {Enter}');
    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0]).toEqual([expect.objectContaining({ kind: 'put', path: sheetTestRowPath(ADDED_ROWS_BLOCK_ID, BATTERIES_TEST, addedRowId(2), 'name'), value: 'Bateria reserva' })]);
    // A name the other row has (case and spaces ignored): the helper, and nothing written.
    await userEvent.clear(fields[1]!);
    await userEvent.type(fields[1]!, 'bateria 1');
    expect(within(shown).getByText('Outra linha desta tabela já tem este nome.')).toBeVisible();
    expect(fields[1]).toHaveAttribute('aria-invalid', 'true');
    await userEvent.tab();
    expect(commits.every((batch) => batch.every((op) => op.value !== 'bateria 1'))).toBe(true);
    // Emptied: null (the row then counts as missing).
    await userEvent.clear(fields[0]!);
    await userEvent.tab();
    await waitFor(() => expect(commits.some((batch) => batch.some((op) => op.path === sheetTestRowPath(ADDED_ROWS_BLOCK_ID, BATTERIES_TEST, addedRowId(1), 'name') && op.value === null))).toBe(true));
  });

  it('a reading typed in an added row is one put on that row\'s cell path; a choice tapped writes the kernel\'s choice value there', async () => {
    const { container, commits, edits } = renderSheet(withRows(BATTERIES_TEST, [{ id: addedRowId(1), name: 'Bateria 1' }]));
    const batteries = sectionOf(container, BATTERIES_TEST);
    const shown = shows === 'cards' ? cardsOf(batteries)! : tableOf(batteries);
    await userEvent.type(within(shown).getByRole('textbox', { name: 'Bateria 1, Tensão' }), '13,7{Enter}');
    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0]).toEqual([expect.objectContaining({ kind: 'put', path: sheetTestRowCellPath(ADDED_ROWS_BLOCK_ID, BATTERIES_TEST, addedRowId(1), 0), value: { raw: '13.7', unit: 'V', state: 'measured' } })]);
    const choice = within(shown).getByRole('radiogroup', { name: 'Bateria 1, Estado' });
    await userEvent.click(within(choice).getByRole('radio', { name: 'FALHOU' }));
    expect(edits).toEqual([[expect.objectContaining({ kind: 'put', path: sheetTestRowCellPath(ADDED_ROWS_BLOCK_ID, BATTERIES_TEST, addedRowId(1), 1), value: choiceValue('falhou') })]]);
  });

  it('the remove action writes the row\'s removal, hands the focus to the action under the table and raises the toast with "Desfazer" (the frame\'s words), whose undo brings the focus back to the name', async () => {
    const { container, edits, undoable } = renderSheet(withRows(POINTS_TEST, [{ id: addedRowId(1), name: 'Quadro geral de baixa tensão', cells: { 0: reading('0.19', 'Ω') } }]));
    const points = sectionOf(container, POINTS_TEST);
    await userEvent.click(within(points).getByRole('button', { name: 'Remover ponto Quadro geral de baixa tensão' }));
    await waitFor(() => expect(undoable).toHaveBeenCalledWith('Ponto removido: Quadro geral de baixa tensão', 'batch', expect.any(Function)));
    expect(edits).toEqual([[expect.objectContaining({ kind: 'remove', path: sheetTestRowPath(ADDED_ROWS_BLOCK_ID, POINTS_TEST, addedRowId(1), 'removed_at'), value: null })]]);
    expect(within(points).getByRole('button', { name: 'Adicionar ponto' })).toHaveFocus();
    const focusAfterUndo = undoable.mock.calls[0]![2] as () => HTMLElement | null;
    expect(focusAfterUndo()).toBe(within(points).getByRole('textbox', { name: 'Nome do ponto' }));
  });

  it('"Adicionar ponto" adds one row with no name (a new UUIDv7 row id) and says so; "Adicionar bateria" names it with the stem\'s next number', async () => {
    const { container, edits, announced } = renderSheet(withRows(BATTERIES_TEST, [{ id: addedRowId(1), name: 'Bateria 1' }]));
    await userEvent.click(within(sectionOf(container, POINTS_TEST)).getByRole('button', { name: 'Adicionar ponto' }));
    await waitFor(() => expect(edits).toHaveLength(1));
    const [point] = edits[0]!;
    const rowId = point!.path.split('/')[5]!;
    expect(uuidV7Schema.safeParse(rowId).success).toBe(true);
    expect(point).toEqual(expect.objectContaining({ kind: 'put', path: sheetTestRowPath(ADDED_ROWS_BLOCK_ID, POINTS_TEST, rowId, 'name'), value: null }));
    await waitFor(() => expect(announced).toContain('Ponto acrescentado: dê um nome a ele'));
    await userEvent.click(within(sectionOf(container, BATTERIES_TEST)).getByRole('button', { name: 'Adicionar bateria' }));
    await waitFor(() => expect(edits).toHaveLength(2));
    expect(edits[1]).toEqual([expect.objectContaining({ kind: 'put', value: 'Bateria 2' })]);
    expect(edits[1]![0]!.path).toMatch(new RegExp(`^sheet/${ADDED_ROWS_BLOCK_ID}/test/${BATTERIES_TEST}/row/[0-9a-f-]+/name$`));
    await waitFor(() => expect(announced).toContain('Bateria acrescentada: Bateria 2'));
  });
});

describe('25.14 from the plate\'s count, the maximum, a read-only sheet', () => {
  it('a plate that reads 4 with one battery added offers the three missing in one action, its count beside it; nothing is added by itself', async () => {
    const sheet = withRows(BATTERIES_TEST, [{ id: addedRowId(1), name: 'Bateria 1' }]);
    sheet.nameplate.baterias_quantidade = stored(reading('4', ''));
    const { container, edits, announced } = renderSheet(sheet);
    const batteries = sectionOf(container, BATTERIES_TEST);
    expect(edits).toEqual([]);
    const action = within(batteries).getByRole('button', { name: 'Adicionar as 3 baterias que faltam' });
    expect(action).toHaveClass('btn', 'btn-secondary');
    expect(within(batteries).getByText('A placa diz 4 baterias.')).toHaveClass('btn-reason');
    await userEvent.click(action);
    await waitFor(() => expect(edits).toHaveLength(1));
    expect(edits[0]!.map((op) => op.value)).toEqual(['Bateria 2', 'Bateria 3', 'Bateria 4']);
    // Three rows, three ids, in the order they were minted (the order they show in).
    const ids = edits[0]!.map((op) => op.path.split('/')[5]!);
    expect(new Set(ids).size).toBe(3);
    expect([...ids].sort()).toEqual(ids);
    await waitFor(() => expect(announced).toContain('3 baterias acrescentadas: Bateria 2, Bateria 3 e Bateria 4'));
  });

  it('at the test\'s maximum the action is off with its reason and writes nothing', async () => {
    const sheet = withRows(BATTERIES_TEST, Array.from({ length: 12 }, (_, i) => ({ id: addedRowId(i + 1), name: `Bateria ${i + 1}` })));
    sheet.nameplate.baterias_quantidade = stored(reading('20', ''));
    const { container, edits } = renderSheet(sheet);
    const batteries = sectionOf(container, BATTERIES_TEST);
    const action = within(batteries).getByRole('button', { name: 'Adicionar bateria' });
    expect(action).toHaveAttribute('aria-disabled', 'true');
    expect(within(batteries).getByText('Máximo de 12 baterias nesta tabela.')).toBeVisible();
    expect(within(batteries).queryByRole('button', { name: /que faltam/ })).toBeNull();
    await userEvent.click(action);
    expect(edits).toEqual([]);
  });

  it('a read-only sheet shows an added row\'s name as text, with no remove action and no action under the table', () => {
    const { container } = renderSheet(withRows(POINTS_TEST, [{ id: addedRowId(1), name: 'Quadro geral de baixa tensão' }]), { readOnly: true });
    const points = sectionOf(container, POINTS_TEST);
    expect(within(points).queryByRole('textbox', { name: 'Nome do ponto' })).toBeNull();
    expect(points.querySelector('tr[data-added-row] td.cell-point')).toHaveTextContent('Quadro geral de baixa tensão');
    expect(within(points).queryByRole('button', { name: /Remover ponto/ })).toBeNull();
    expect(points.querySelector('.e25-add-row')).toBeNull();
  });

  it('the controls draw with no accessibility violation', async () => {
    const sheet = withRows(BATTERIES_TEST, [{ id: addedRowId(1), name: 'Bateria 1' }, { id: addedRowId(2), name: null }]);
    sheet.nameplate.baterias_quantidade = stored(reading('4', ''));
    const { container } = renderSheet(withRows(POINTS_TEST, [{ id: addedRowId(3), name: 'Quadro geral' }], sheet));
    expect(await axe(container)).toHaveNoViolations();
  }, 60_000);
});

describe('25.14 a definition row\'s cell keeps its own path', () => {
  it('a reading of the batteries\' "Banco" row is still `sheet/{b}/test/{t}/cell/0/0`', async () => {
    const { container, commits } = renderSheet(emptySheet());
    const batteries = sectionOf(container, BATTERIES_TEST);
    await userEvent.type(within(tableOf(batteries)).getByRole('textbox', { name: 'Banco, Tensão' }), '54,6{Enter}');
    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0]![0]!.path).toBe(`sheet/${ADDED_ROWS_BLOCK_ID}/test/${BATTERIES_TEST}/cell/0/0`);
  });
});
