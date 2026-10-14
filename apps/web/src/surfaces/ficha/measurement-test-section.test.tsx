import {
  blockConfigWithOption,
  blockConfigWithSubBlock,
  choiceValue,
  evaluateSheetMeasurements,
  getDefinition,
  instrumentHeaderOf,
  measurementInstrumentHeaderOf,
  newEquipmentBlock,
  sheetTestCellPath,
  sheetTestValuePath,
  type BlockRow,
  type Cell,
  type InstrumentRow,
  type JsonValue,
  type OpDraft,
  type RelatorioSnapshot,
  type Sheet,
  type SubBlockKey,
} from '@app/domain';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../state/toast.tsx';
import { axe } from '../../test-axe.ts';
import type { Build } from '../relatorio/relatorio-editor.ts';
import type { FichaApi } from './ficha-api.ts';
import { MeasurementTests } from './measurement-test-section.tsx';
import { SheetReadOnlyProvider } from './sheet-read-only.tsx';

/*
 * Story 14.5: the measurement tests of the Chave de transferência automática as the sheet
 * draws them, data in and ops out. The rows, kinds, verdicts, helper texts and required
 * marks asserted here are the kernel's (`evaluateSheetMeasurements`); the tests check that
 * the surface draws them and writes the right path and value. jsdom applies no stylesheet,
 * so a table that stacks on phone has its cells twice in the document (table and cards).
 */

vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));

const id = (n: number) => `019966b0-0145-7000-8000-${n.toString(16).padStart(12, '0')}`;
const BLOCK = id(1);
const RELATORIO = id(4);
const OP = id(9);
const AUTHOR = { id: 'u1', companyId: 'c1' };
const CTA = 'chave_transferencia_automatica';
const DEFINITION = getDefinition('v5', 'cabine_primaria', CTA);
const E1 = 'cta_resistencia_contato';
const E2 = 'cta_isolamento_principal';
const E4 = 'cta_ajustes_controlador';
const E5 = 'cta_transferencia';
const E6 = 'cta_termografia';

const testOf = (key: string) => DEFINITION.measurement_tests!.find((test) => test.key === key)!;
const rowOf = (testKey: string, rowKey: string) => testOf(testKey).rows.findIndex((row) => row.key === rowKey);
const colOf = (testKey: string, columnKey: string) => testOf(testKey).columns.findIndex((column) => column.key === columnKey);
const stored = (value: JsonValue): Cell => ({ value, source_suggestion_id: null, op_id: OP });
const num = (raw: string, unit: string): JsonValue => ({ raw, unit, state: 'measured' });

type Cells = Record<string, Record<string, JsonValue>>;

/** The stored cells of one test, by row key then column key. */
function cellsOf(testKey: string, cells: Cells): Record<string, Record<string, Cell>> {
  const out: Record<string, Record<string, Cell>> = {};
  for (const [rowKey, columns] of Object.entries(cells)) {
    out[String(rowOf(testKey, rowKey))] = Object.fromEntries(Object.entries(columns).map(([columnKey, value]) => [String(colOf(testKey, columnKey)), stored(value)]));
  }
  return out;
}

interface Filled {
  options?: Record<string, string>;
  off?: SubBlockKey[];
  cells?: Record<string, Cells>;
  values?: Record<string, Record<string, JsonValue>>;
}

/** A CTA block as the palette creates it, with a configuration, tests switched off, cells and values. */
function cta({ options = {}, off = [], cells = {}, values = {} }: Filled = {}): BlockRow {
  const { block } = newEquipmentBlock({ blockId: BLOCK, equipmentId: id(2), relatorioId: RELATORIO, projectId: id(5), locationId: id(3), type: CTA, tag: 'CTA-GER', seedVersion: 'v5', orderKey: 'a0' });
  let config = block.config as JsonValue;
  for (const [key, value] of Object.entries(options)) config = blockConfigWithOption(config, key, value);
  for (const key of off) config = blockConfigWithSubBlock(config, key, false);
  const test: Sheet['test'] = {};
  for (const key of new Set([...Object.keys(cells), ...Object.keys(values)])) {
    test[key] = {
      cells: cellsOf(key, cells[key] ?? {}),
      ...(values[key] === undefined ? {} : { values: Object.fromEntries(Object.entries(values[key]).map(([valueKey, value]) => [valueKey, stored(value)])) }),
    };
  }
  return { ...block, config: config as BlockRow['config'], sheet: { ...block.sheet, test } };
}

function renderTests(block: BlockRow, { readOnly = false, instruments = [], others = [] }: { readOnly?: boolean; instruments?: InstrumentRow[]; others?: BlockRow[] } = {}) {
  const commits: OpDraft[][] = [];
  const edits: OpDraft[][] = [];
  const announced: string[] = [];
  const onRun = vi.fn(() => false);
  const api: FichaApi = {
    relatorioId: RELATORIO,
    projectId: id(5),
    blockId: BLOCK,
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
    undoable: vi.fn(),
    announce: vi.fn((text: string) => {
      announced.push(text);
    }),
  };
  const snapshot = { relatorio: { setup: { service_end: null, instrument_ids: [] } }, blocks: [block, ...others] } as unknown as RelatorioSnapshot;
  const view = render(
    <MemoryRouter>
      <ToastProvider>
        <SheetReadOnlyProvider value={readOnly}>
          <MeasurementTests api={api} snapshot={snapshot} block={block} evaluations={evaluateSheetMeasurements(block, DEFINITION)} instruments={instruments} onRun={onRun} />
        </SheetReadOnlyProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
  return { ...view, commits, edits, announced, onRun };
}

const section = (container: HTMLElement, testKey: string) => container.querySelector<HTMLElement>(`.lib-test[data-test-key="${testKey}"]`)!;
const rowLabels = (root: HTMLElement) => [...root.querySelectorAll('table tbody tr:not(.row-derived) td.cell-point')].map((cell) => cell.textContent);

afterEach(cleanup);

describe('14.5 MeasurementTests: what the sheet draws', () => {
  it('draws the six tests in order under their kernel titles, each with its criterion and source, with no accessibility violation', async () => {
    const { container } = renderTests(cta());
    expect(container.querySelector('.tests-stack')).not.toBeNull();
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'E1 · Resistência de contato',
      'E2 · Isolamento principal',
      'E3 · Isolamento do controle',
      'E4 · Ajustes do controlador',
      'E5 · Transferência',
      'E6 · Termografia sob carga',
    ]);
    const e1 = section(container, E1);
    expect(e1.querySelector('.mt-criterion')).toHaveTextContent('≤ 50 % acima do menor do mesmo lado');
    expect(e1.querySelector('.mt-source p')).toHaveTextContent('NETA 7.22.3 (fonte secundária)');
    expect(within(e1).getByRole('table', { name: 'E1 · Resistência de contato' })).toHaveClass('measurement-table', 'is-multi');
    expect([...e1.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Polo', 'Lado Normal', 'Lado Emergência']);
    // BT by default: the E2 criterion is the BT one.
    expect(section(container, E2).querySelector('.mt-criterion')).toHaveTextContent('1.000 Vcc · ≥ 100 MΩ');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows only the rows the configuration shows: no fase C at two poles, the neutral only at four; MT takes the seeded criterion', () => {
    const three = renderTests(cta());
    expect(rowLabels(section(three.container, E1))).toEqual(['Polo A', 'Polo B', 'Polo C']);
    expect(rowLabels(section(three.container, E2))).toEqual(['A-T', 'B-T', 'C-T', 'A-B', 'B-C', 'C-A', 'Linha-carga']);
    cleanup();
    const two = renderTests(cta({ options: { polos: '2' } }));
    expect(rowLabels(section(two.container, E1))).toEqual(['Polo A', 'Polo B']);
    expect(rowLabels(section(two.container, E2))).toEqual(['A-T', 'B-T', 'A-B', 'Linha-carga']);
    cleanup();
    const four = renderTests(cta({ options: { polos: '4', tensao: 'mt' } }));
    expect(rowLabels(section(four.container, E1))).toEqual(['Polo A', 'Polo B', 'Polo C', 'Polo N']);
    expect(rowLabels(section(four.container, E2))).toContain('N-T');
    expect(section(four.container, E2).querySelector('.mt-criterion')).toHaveTextContent('>400 MΩ');
  });

  it('a table of one or two value columns stays a table; one of more stacks into cards, a fixed cell being text in both', () => {
    const { container } = renderTests(cta());
    expect(section(container, E1).querySelector('.lib-cards')).toBeNull();
    expect(section(container, E1).querySelector('table')).not.toHaveClass('has-cards');
    expect(section(container, E5).querySelector('.lib-cards')).toBeNull();
    const e2 = section(container, E2);
    expect(e2.querySelector('table')).toHaveClass('is-multi', 'is-compact', 'has-cards');
    expect(e2.querySelectorAll('.lib-cards .measurement-card')).toHaveLength(7);
    // Linha-carga is measured with the switch open only: the two closed columns are fixed text.
    const row = e2.querySelector('tr[data-row-key="linha_carga"]')!;
    expect([...row.querySelectorAll('td.cell-dim')].map((cell) => cell.textContent)).toEqual(['—', '—']);
    expect(row.querySelectorAll('input')).toHaveLength(1);
    const card = e2.querySelector('.measurement-card[data-row-key="linha_carga"]')!;
    expect(card.querySelector('.card-dims')).toHaveTextContent('Normal fechada: — · Emergência fechada: —');
    expect(card.querySelectorAll('input')).toHaveLength(1);
    // E5: the Ajuste of "Até carga" is the seeded limit, never typed.
    expect(section(container, E5).querySelector('tr[data-row-key="ate_carga_na_emergencia"] td.cell-dim')).toHaveTextContent('limite 10 s');
  });

  it('marks the required empty cells and values as missing, never an optional column or a fixed cell', () => {
    const { container } = renderTests(cta());
    // E1 at three poles: six cells.
    expect(section(container, E1).querySelectorAll('[data-missing-field]')).toHaveLength(6);
    const e5 = section(container, E5);
    // Método, carga and fonte dos tempos, and the five Medido; the Ajuste column is optional.
    expect(e5.querySelectorAll('.test-options [data-missing-field]')).toHaveLength(3);
    expect(e5.querySelectorAll('table [data-missing-field]')).toHaveLength(5);
    expect(within(e5).getByRole('textbox', { name: 'Falha da Normal até partida, Ajuste' })).not.toHaveAttribute('data-missing-field');
  });
});

describe('14.5 MeasurementTests: number cells', () => {
  it('a typed reading is one put on the cell family, in the row and column of the seed, with the row unit', async () => {
    const { commits, container } = renderTests(cta());
    const input = within(section(container, E1)).getByRole('textbox', { name: 'Polo B, Lado Emergência' });
    await userEvent.type(input, '39{Enter}');
    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0]).toEqual([expect.objectContaining({ kind: 'put', path: sheetTestCellPath(BLOCK, E1, rowOf(E1, 'polo_b'), colOf(E1, 'lado_emergencia')), value: { raw: '39', unit: 'µΩ', state: 'measured' } })]);
    // E4: the unit is the row's (min), the column having none.
    const td3a = within(section(container, E4)).getAllByRole('textbox', { name: 'TD 3A · retransferência, Deixado' })[0]!;
    await userEvent.type(td3a, '5');
    await userEvent.tab();
    await waitFor(() => expect(commits).toHaveLength(2));
    expect(commits[1]).toEqual([expect.objectContaining({ path: sheetTestCellPath(BLOCK, E4, rowOf(E4, 'td_3a'), colOf(E4, 'deixado')), value: { raw: '5', unit: 'min', state: 'measured' } })]);
  });

  it('Enter asks the run for the next cell, from the address of the cell typed', async () => {
    const { onRun, container } = renderTests(cta());
    await userEvent.type(within(section(container, E1)).getByRole('textbox', { name: 'Polo A, Lado Normal' }), '38{Enter}');
    expect(onRun).toHaveBeenCalledWith({ testKey: E1, row: 0, col: 0 }, 'next');
  });

  it('a pole more than 50 % above the lowest of its side is amber with the kernel helper, and the lowest of each side is shown', () => {
    const micro = (raw: string) => num(raw, 'µΩ');
    const { container } = renderTests(
      cta({
        cells: {
          [E1]: {
            polo_a: { lado_normal: micro('38'), lado_emergencia: micro('40') },
            polo_b: { lado_normal: micro('41'), lado_emergencia: micro('39') },
            polo_c: { lado_normal: micro('36'), lado_emergencia: micro('63') },
          },
        },
      }),
    );
    const e1 = section(container, E1);
    const out = e1.querySelectorAll('.measurement-field[data-state="out-of-limit"]');
    expect(out).toHaveLength(1);
    expect(out[0]!.querySelector('input')).toHaveAccessibleName('Polo C, Lado Emergência');
    expect(e1.querySelector('.mf-helper')).toHaveTextContent('62 % acima do menor do lado (39 µΩ) — critério ≤ 50 %');
    expect(within(e1.querySelector('.mf-helper')!).getByRole('button', { name: 'Marcar Com restrições' })).toBeInTheDocument();
    const reference = e1.querySelector('tr.row-derived')!;
    expect(reference.querySelector('td.cell-point')).toHaveTextContent('Menor do lado');
    expect([...reference.querySelectorAll('td.cell-calc')].map((cell) => cell.textContent)).toEqual(['36 µΩ', '39 µΩ']);
  });

  it('Epic 14 QA Q-3: a stored zero on E1 is to check: the neutral "Conferir" helper, no amber state, no "Marcar Com restrições"', () => {
    const micro = (raw: string) => num(raw, 'µΩ');
    const { container } = renderTests(cta({ cells: { [E1]: { polo_a: { lado_normal: micro('0') }, polo_b: { lado_normal: micro('40') }, polo_c: { lado_normal: micro('41') } } } }));
    const e1 = section(container, E1);
    const zero = within(e1).getByRole('textbox', { name: 'Polo A, Lado Normal' }).closest('.ficha-cell')!;
    expect(zero.querySelector('.outlier-helper')).toHaveTextContent('Conferir: valor zero ou negativo, sem comparação com o menor do lado');
    expect(zero.querySelector('.measurement-field')).not.toHaveAttribute('data-state', 'out-of-limit');
    expect(e1.querySelector('.mf-helper')).toBeNull();
    expect(e1.querySelectorAll('.measurement-field[data-state="out-of-limit"]')).toHaveLength(0);
    expect(within(e1).queryByRole('button', { name: 'Marcar Com restrições' })).toBeNull();
  });

  it('"Não medido" in a cell Overflow writes the not-measured value on that cell', async () => {
    const { commits, container } = renderTests(cta());
    await userEvent.click(within(section(container, E1)).getAllByRole('button', { name: 'Mais opções de Polo A, Lado Normal' })[0]!);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Não medido' }));
    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0]).toEqual([expect.objectContaining({ path: sheetTestCellPath(BLOCK, E1, 0, 0), value: { raw: '', unit: 'µΩ', state: 'not_measured' } })]);
  });
});

describe('14.5 MeasurementTests: choice cells', () => {
  it('a two-option row is a Segmented control per column; a tap writes the option key as the kernel choice value', async () => {
    const { edits, container } = renderTests(cta());
    const e4 = section(container, E4);
    const row = e4.querySelector('tr[data-row-key="falta_de_fase"]')!;
    expect(row.querySelectorAll('td.cell-yn')).toHaveLength(4);
    const projeto = within(row as HTMLElement).getByRole('radiogroup', { name: 'Falta de fase, Projeto' });
    expect(within(projeto).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Ligado', 'Desligado']);
    await userEvent.click(within(projeto).getByRole('radio', { name: 'Ligado' }));
    expect(edits).toEqual([[expect.objectContaining({ kind: 'put', path: sheetTestCellPath(BLOCK, E4, rowOf(E4, 'falta_de_fase'), colOf(E4, 'projeto')), value: choiceValue('ligado') })]]);
  });

  it('Deixado different from Projeto shows the kernel helper on the cell; "Marcar Com restrições" writes the conclusion', async () => {
    const { container, edits, announced } = renderTests(cta({ cells: { [E4]: { falta_de_fase: { projeto: choiceValue('ligado'), deixado: choiceValue('desligado') } } } }));
    const row = section(container, E4).querySelector<HTMLElement>('tr[data-row-key="falta_de_fase"]')!;
    const deixado = within(row).getByRole('radiogroup', { name: 'Falta de fase, Deixado' });
    expect(within(deixado).getByRole('radio', { name: 'Desligado' })).toHaveAttribute('aria-checked', 'true');
    const helper = row.querySelector('.mf-helper')!;
    expect(helper).toHaveTextContent('Diferente de Projeto (Ligado)');
    await userEvent.click(within(helper as HTMLElement).getByRole('button', { name: 'Marcar Com restrições' }));
    await waitFor(() => expect(announced).toEqual(['Com restrições marcado na conclusão']));
    expect(edits[0]).toEqual([expect.objectContaining({ path: `sheet/${BLOCK}/conclusion/restriction`, value: 'com_restricoes' })]);
  });

  it('the Overflow of a two-option cell marks it not measured and clears it', async () => {
    const { edits, container } = renderTests(cta({ cells: { [E4]: { falta_de_fase: { projeto: choiceValue('ligado') } } } }));
    const row = section(container, E4).querySelector<HTMLElement>('tr[data-row-key="falta_de_fase"]')!;
    const path = sheetTestCellPath(BLOCK, E4, rowOf(E4, 'falta_de_fase'), colOf(E4, 'projeto'));
    await userEvent.click(within(row).getByRole('button', { name: 'Mais opções de Falta de fase, Projeto' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Limpar' }));
    await waitFor(() => expect(edits).toHaveLength(1));
    expect(edits[0]).toEqual([expect.objectContaining({ path, value: null })]);
    await userEvent.click(within(row).getByRole('button', { name: 'Mais opções de Falta de fase, Projeto' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Não medido' }));
    await waitFor(() => expect(edits).toHaveLength(2));
    expect(edits[1]).toEqual([expect.objectContaining({ path, value: { raw: '', unit: null, state: 'not_measured' } })]);
  });

  it('a choice of more than two options is a select: an option, "Não medido" and the empty option each write their value', async () => {
    const { edits, container } = renderTests(cta({ cells: { [E6]: { normal_a: { classe: choiceValue('grave') } } } }));
    const row = section(container, E6).querySelector<HTMLElement>('tr[data-row-key="normal_a"]')!;
    const select = within(row).getByRole('combobox', { name: 'Normal · A, Classe' });
    expect(select).toHaveValue('grave');
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['Selecione', 'Normal', 'Possível deficiência', 'Provável deficiência', 'Grave', 'Não medido']);
    // Grave is out of the criterion (Classe Normal).
    expect(row.querySelector('.mf-helper')).toHaveTextContent('Fora do aceitável (Normal)');
    const path = sheetTestCellPath(BLOCK, E6, rowOf(E6, 'normal_a'), colOf(E6, 'classe'));
    await userEvent.selectOptions(select, 'Normal');
    await userEvent.selectOptions(select, 'Não medido');
    await userEvent.selectOptions(select, 'Selecione');
    expect(edits.map((drafts) => drafts[0])).toEqual([
      expect.objectContaining({ path, value: choiceValue('normal') }),
      expect.objectContaining({ path, value: { raw: '', unit: null, state: 'not_measured' } }),
      expect.objectContaining({ path, value: null }),
    ]);
  });
});

describe('14.5 MeasurementTests: the values of a test (E5 options)', () => {
  it('método is a radiogroup of option rows, carga and fonte dos tempos Segmented controls; each choice is one put on the value family', async () => {
    const { edits, container } = renderTests(cta());
    const e5 = section(container, E5);
    const metodo = within(e5).getByRole('radiogroup', { name: 'Método' });
    expect(metodo).toHaveClass('cta-options');
    expect(within(metodo).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Falta real por abertura do disjuntor', 'Botão de teste do controlador', 'Não realizado']);
    expect(metodo.querySelectorAll('.option-row .radio')).toHaveLength(3);
    await userEvent.click(within(metodo).getByRole('radio', { name: 'Botão de teste do controlador' }));
    expect(within(e5).getByRole('radiogroup', { name: 'Carga' })).toHaveClass('segmented');
    await userEvent.click(within(within(e5).getByRole('radiogroup', { name: 'Carga' })).getByRole('radio', { name: 'Com carga' }));
    const fonte = within(e5).getByRole('radiogroup', { name: 'Fonte dos tempos' });
    expect(fonte).toHaveClass('segmented', 'is-wrap');
    await userEvent.click(within(fonte).getByRole('radio', { name: 'Registro do controlador' }));
    expect(edits.map((drafts) => drafts[0])).toEqual([
      expect.objectContaining({ kind: 'put', path: sheetTestValuePath(BLOCK, E5, 'metodo'), value: choiceValue('botao_teste') }),
      expect.objectContaining({ kind: 'put', path: sheetTestValuePath(BLOCK, E5, 'carga'), value: choiceValue('com_carga') }),
      expect.objectContaining({ kind: 'put', path: sheetTestValuePath(BLOCK, E5, 'fonte_tempos'), value: choiceValue('registro_controlador') }),
    ]);
  });

  it('the option rows follow the radiogroup keyboard: one tab stop, the arrows move the choice', async () => {
    const { edits, container } = renderTests(cta({ values: { [E5]: { metodo: choiceValue('falta_real') } } }));
    const rows = within(within(section(container, E5)).getByRole('radiogroup', { name: 'Método' })).getAllByRole('radio');
    expect(rows.map((row) => row.tabIndex)).toEqual([0, -1, -1]);
    expect(rows[0]).toHaveAttribute('aria-checked', 'true');
    rows[0]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(rows[1]).toHaveFocus();
    expect(edits[0]).toEqual([expect.objectContaining({ path: sheetTestValuePath(BLOCK, E5, 'metodo'), value: choiceValue('botao_teste') })]);
  });

  it('the % and the V, Hz, A group show only with "com carga"; a typed value is one put with its unit; the method line is the kernel sentence', async () => {
    const without = renderTests(cta({ values: { [E5]: { metodo: choiceValue('falta_real'), carga: choiceValue('sem_carga') } } }));
    expect(within(section(without.container, E5)).queryByRole('textbox', { name: 'Carga no ensaio' })).toBeNull();
    expect(section(without.container, E5).querySelector('.np-group')).toBeNull();
    cleanup();
    const { container, commits } = renderTests(
      cta({ values: { [E5]: { metodo: choiceValue('falta_real'), carga: choiceValue('com_carga'), carga_percentual: num('62', '%'), fonte_tempos: choiceValue('instrumento') } } }),
    );
    const e5 = section(container, E5);
    expect(within(e5).getByTestId('measurement-values-line')).toHaveTextContent('Método: Falta real por abertura do disjuntor · Carga: Com carga (62 %) · Fonte dos tempos: Instrumento');
    expect(within(e5).getByRole('textbox', { name: 'Carga no ensaio' })).toHaveValue('62');
    expect(e5.querySelector('.test-fields .np-group')).toHaveTextContent('Na Emergência, com carga');
    await userEvent.type(within(e5).getByRole('textbox', { name: 'Tensão' }), '381');
    await userEvent.tab();
    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0]).toEqual([expect.objectContaining({ kind: 'put', path: sheetTestValuePath(BLOCK, E5, 'tensao'), value: { raw: '381', unit: 'V', state: 'measured' } })]);
  });

  it('"não realizado" marks the test as not run: nothing of its table is missing and the section says so to the stylesheet', () => {
    const { container } = renderTests(cta({ values: { [E5]: { metodo: choiceValue('nao_realizado') } } }));
    const e5 = section(container, E5);
    expect(e5).toHaveAttribute('data-skipped');
    expect(e5.querySelectorAll('[data-missing-field]')).toHaveLength(0);
    expect(within(e5).getByTestId('measurement-values-line')).toHaveTextContent('Método: Não realizado');
    expect(section(container, E4)).not.toHaveAttribute('data-skipped');
  });

  it('E6 carries the ambient temperature above its table', async () => {
    const { container, commits } = renderTests(cta());
    const e6 = section(container, E6);
    const field = within(e6.querySelector<HTMLElement>('.lib-test-body > .test-fields')!).getByRole('textbox', { name: 'Temperatura ambiente' });
    expect(field).toHaveAttribute('data-missing-field');
    await userEvent.type(field, '27');
    await userEvent.tab();
    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0]).toEqual([expect.objectContaining({ path: sheetTestValuePath(BLOCK, E6, 'temperatura_ambiente'), value: { raw: '27', unit: '°C', state: 'measured' } })]);
  });
});

describe('14.5 MeasurementTests: a test switched off, the instrument, a sheet not tested', () => {
  it('E1, E2, E3 and E6 carry a switch, E4 and E5 none; switching one off is one block config put that keeps the rest of the config', async () => {
    const block = cta({ options: { polos: '4' } });
    const { container, edits } = renderTests(block);
    const switches = screen.getAllByRole('switch');
    expect(switches.map((toggle) => toggle.getAttribute('aria-label'))).toEqual([
      'E1 · Resistência de contato nesta ficha',
      'E2 · Isolamento principal nesta ficha',
      'E3 · Isolamento do controle nesta ficha',
      'E6 · Termografia sob carga nesta ficha',
    ]);
    expect(switches.every((toggle) => toggle.classList.contains('lib-test-switch') && toggle.getAttribute('aria-checked') === 'true')).toBe(true);
    expect(within(section(container, E4)).queryByRole('switch')).toBeNull();
    await userEvent.click(switches[0]!);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toEqual([expect.objectContaining({ kind: 'put', path: `block/${BLOCK}/config`, value: blockConfigWithSubBlock(block.config, E1, false) })]);
    const value = edits[0]![0]!.value as { options: Record<string, string>; sub_blocks: Record<string, { enabled: boolean }> };
    expect(value.options.polos).toBe('4');
    expect(value.sub_blocks[E1]!.enabled).toBe(false);
    expect(value.sub_blocks[E2]!.enabled).toBe(true);
  });

  it('a test switched off draws its switch off and its note, no body; switching it on again writes the config', async () => {
    const block = cta({ off: [E1] });
    const { container, edits } = renderTests(block);
    const e1 = section(container, E1);
    expect(e1).toHaveAttribute('data-off');
    expect(e1.querySelector('.lib-test-body')).toBeNull();
    expect(e1.querySelector('.lib-off-note')).toHaveTextContent('Desligado — marque NA quando a chave não pode ser desenergizada.');
    const toggle = within(e1).getByRole('switch', { name: 'E1 · Resistência de contato nesta ficha' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(edits[0]).toEqual([expect.objectContaining({ path: `block/${BLOCK}/config`, value: blockConfigWithSubBlock(block.config, E1, true) })]);
    // A test that is on keeps its note in the document for the stylesheet, and draws its body.
    expect(section(container, E2).querySelector('.lib-test-body')).not.toBeNull();
    expect(section(container, E2)).not.toHaveAttribute('data-off');
  });

  it('the Instrument picker is drawn where the seed names whose instruments it offers: E1 to E3, never E4 to E6', () => {
    const { container } = renderTests(cta());
    expect([E1, E2, 'cta_isolamento_controle', E4, E5, E6].map((key) => section(container, key).querySelector('.instrument-picker') !== null)).toEqual([true, true, true, false, false, false]);
  });

  it('a pick on E1 or E2 is one put on the test\'s instrument with the registry header and no test parameter', async () => {
    // A registry default for both kinds: neither is copied onto a measurement test.
    const row = {
      id: id(20),
      kind: 'instrument',
      code: '3M',
      name: 'Microhmímetro',
      manufacturer: 'Hi-Tech',
      model: 'HTMO-10',
      serial: 'G282926',
      cert_number: '37276/26',
      laboratory: null,
      calibrated_at: '2026-08-28',
      calibration_interval_months: 12,
      rbc_accredited: true,
      test_isolacao: { raw: '5', unit: 'kV' },
      test_resistencia_contato: { raw: '10', unit: 'A' },
      test_relacao_transformacao: null,
      certificate_file_id: null,
      removed_at: null,
    } as InstrumentRow;
    const { container, edits } = renderTests(cta(), { instruments: [row] });
    for (const key of [E1, E2]) {
      const picker = within(section(container, key));
      await userEvent.click(picker.getByRole('button', { name: 'Instrumento Selecione o instrumento' }));
      await userEvent.click(picker.getByRole('radio', { name: /3M/ }));
    }
    const header = { ...instrumentHeaderOf(row, 'resistencia_contato'), test_parameter: null };
    expect(instrumentHeaderOf(row, 'resistencia_contato').test_parameter).toBe('10 A');
    expect(measurementInstrumentHeaderOf(row)).toEqual(header);
    expect(edits).toEqual([
      [expect.objectContaining({ kind: 'put', path: `sheet/${BLOCK}/test/${E1}/instrument`, value: header })],
      [expect.objectContaining({ kind: 'put', path: `sheet/${BLOCK}/test/${E2}/instrument`, value: header })],
    ]);
  });

  it('E1 to E3 show the instrument last used for their kind in the relatório as "Sugerido", like a seeded test', () => {
    const row = { id: id(20), kind: 'instrument', code: '3M', name: 'Microhmímetro', manufacturer: null, model: null, serial: null, cert_number: null, laboratory: null, calibrated_at: null, calibration_interval_months: null, rbc_accredited: false, test_isolacao: null, test_resistencia_contato: null, test_relacao_transformacao: null, certificate_file_id: null, removed_at: null } as unknown as InstrumentRow;
    const { block: other } = newEquipmentBlock({ blockId: id(30), equipmentId: id(31), relatorioId: RELATORIO, projectId: id(5), locationId: id(3), type: 'chave_seccionadora', tag: 'SEC-C05', seedVersion: 'v5', orderKey: 'a1' });
    const used: BlockRow = { ...other, sheet: { ...other.sheet, test: { resistencia_contato: { cells: {}, instrument: stored(instrumentHeaderOf(row, 'resistencia_contato') as unknown as JsonValue) } } } };
    const { container } = renderTests(cta(), { instruments: [row], others: [used] });
    const e1 = section(container, E1).querySelector('.instrument-picker')!;
    expect(e1).toHaveAttribute('data-state', 'suggested');
    expect(e1).toHaveClass('suggestion-field');
    expect(e1.querySelector('.suggested-pill')).toHaveTextContent('Sugerido');
    expect(within(e1 as HTMLElement).getByRole('button')).toHaveAccessibleName('Instrumento 3M — Microhmímetro');
    // Nothing was used for isolação: E2 suggests none.
    expect(section(container, E2).querySelector('.instrument-picker')).not.toHaveAttribute('data-state');
  });

  it('on a sheet marked not tested every test is read-only: no switch, no input, the stored values as text', () => {
    const { container } = renderTests(
      cta({ cells: { [E1]: { polo_a: { lado_normal: num('38', 'µΩ') } }, [E4]: { falta_de_fase: { projeto: choiceValue('ligado') } } }, values: { [E5]: { metodo: choiceValue('botao_teste') } } }),
      { readOnly: true },
    );
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(container.querySelectorAll('input, select')).toHaveLength(0);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(section(container, E1)).toHaveClass('is-readonly');
    expect(within(section(container, E1)).getByRole('textbox', { name: 'Polo A, Lado Normal' })).toHaveTextContent('38');
    expect(within(section(container, E4)).getAllByRole('textbox', { name: 'Falta de fase, Projeto' })[0]).toHaveTextContent('Ligado');
    expect(within(section(container, E5)).getByRole('textbox', { name: 'Método' })).toHaveTextContent('Botão de teste do controlador');
  });

  it('draws nothing for a block type with no measurement test', () => {
    const seccionadora = getDefinition('v5', 'cabine_primaria', 'chave_seccionadora');
    const { block } = newEquipmentBlock({ blockId: BLOCK, equipmentId: id(2), relatorioId: RELATORIO, projectId: id(5), locationId: id(3), type: 'chave_seccionadora', tag: 'SEC-C05', seedVersion: 'v5', orderKey: 'a0' });
    const evaluations = evaluateSheetMeasurements(block, seccionadora);
    expect(evaluations).toEqual([]);
    const { container } = render(
      <MeasurementTests api={{} as FichaApi} snapshot={{} as RelatorioSnapshot} block={block} evaluations={evaluations} instruments={[]} onRun={() => false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
