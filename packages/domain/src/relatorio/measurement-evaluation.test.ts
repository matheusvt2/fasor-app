import { describe, expect, it } from 'vitest';
import { applyOp, entityKey } from '../ops/apply.ts';
import { blockFieldPath, sheetConclusionPath, sheetObservationsPath } from '../ops/path.ts';
import type { BlockRow, JsonValue } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import { composeConclusion, conclusionSuggestionText, conclusionTextOnConclude, suggestConclusionPair } from './conclusion.ts';
import {
  blockConfigWithOption,
  blockConfigWithSubBlock,
  choiceValue,
  configFieldsOf,
  configOptionsOf,
  evaluateSheetMeasurements,
  measurementCellLabel,
  measurementCells,
  measurementCounts,
  measurementStoredText,
  measurementTestTitle,
  measurementValueLabel,
  measurementValues,
  worstMeasurements,
  type EvaluatedMeasurementCell,
  type MeasurementTestEvaluation,
} from './measurement-evaluation.ts';
import {
  blockOf,
  choice,
  colOf,
  column,
  CTA,
  CTA_BLOCK,
  CTA_TAG,
  ctaBlock,
  ctaDefinition,
  ctaFilledWrites,
  ctaRows,
  ctaState,
  E1,
  E2,
  E3,
  E4,
  E5,
  E6,
  num,
  rawCell,
  rowOf,
  writeSheet,
  type SheetWrite,
} from './measurement-test-support.ts';
import { evaluateSheetReadings } from './readings.ts';
import { sheetMissingTotal, sheetProgress, sheetProgressText, sheetSummaryText, shownSheetSteps, stepMayCollapse } from './sheet-progress.ts';
import { sheetState } from './sheet-state.ts';

/*
 * Story 14.5: the evaluation of the measurement tests, one group of tests per row of the
 * spec's I/O matrix (relative limit, equality, absolute, choice result, config rows, fixed
 * cells, E5 options, test switched off), then what the existing consumers read of it: the
 * sheet's progress, the conclusion's suggestion and its text.
 */

const definition = ctaDefinition();
const evaluate = (block: BlockRow) => evaluateSheetMeasurements(block, definition);
const testOf = (block: BlockRow, key: string): MeasurementTestEvaluation => evaluate(block).find((test) => test.testKey === key)!;
const cellOf = (block: BlockRow, key: string, row: string, col: string): EvaluatedMeasurementCell =>
  testOf(block, key)
    .rows.find((candidate) => candidate.key === row)!
    .cells.find((candidate) => candidate.columnKey === col)!;
const verdicts = (block: BlockRow, key: string, col: string) => testOf(block, key).rows.map((row) => row.cells.find((cell) => cell.columnKey === col)!.verdict);

const micro = (raw: string) => num(raw, 'µΩ');
const NORMAL = column(E1, 'lado_normal', { polo_a: micro('38'), polo_b: micro('41'), polo_c: micro('36'), polo_n: micro('52') });
const EMERGENCIA = column(E1, 'lado_emergencia', { polo_a: micro('40'), polo_b: micro('39'), polo_c: micro('63'), polo_n: micro('42') });

describe('matrix "Relative limit": E1, at most 50 % above the lowest of the same side', () => {
  it('38, 41, 36, 52 are all within; with 40, 39, 63, 42 the 63 is out, 62 % above 39; the lowest of each column is the reference', () => {
    const first = ctaBlock({ polos: '4' }, NORMAL);
    expect(verdicts(first, E1, 'lado_normal')).toEqual(['within', 'within', 'within', 'within']);
    expect(verdicts(first, E1, 'lado_emergencia')).toEqual([null, null, null, null]);
    expect(testOf(first, E1).reference).toEqual({
      label: 'Menor do lado',
      cells: [
        { columnKey: 'lado_normal', column: 'Lado Normal', value: '36', unit: 'µΩ', text: '36 µΩ' },
        { columnKey: 'lado_emergencia', column: 'Lado Emergência', value: null, unit: null, text: null },
      ],
    });
    const both = ctaBlock({ polos: '4' }, [...NORMAL, ...EMERGENCIA]);
    expect(verdicts(both, E1, 'lado_normal')).toEqual(['within', 'within', 'within', 'within']);
    expect(verdicts(both, E1, 'lado_emergencia')).toEqual(['within', 'within', 'out', 'within']);
    const out = cellOf(both, E1, 'polo_c', 'lado_emergencia');
    expect(out).toMatchObject({
      address: { testKey: E1, row: 2, col: 1 },
      state: 'measured',
      raw: '63',
      unit: 'µΩ',
      displayText: '63',
      helperText: '62 % acima do menor do lado (39 µΩ) — critério ≤ 50 %',
      criterionText: '≤ 50 % acima do menor do mesmo lado',
      sourceName: 'NETA 7.22.3 (fonte secundária)',
    });
    expect(cellOf(both, E1, 'polo_a', 'lado_emergencia')).toMatchObject({ verdict: 'within', helperText: null, criterionText: null, sourceName: null, excess: 0 });
    expect(testOf(both, E1).reference!.cells.map((cell) => cell.text)).toEqual(['36 µΩ', '39 µΩ']);
    expect(measurementCounts(evaluate(both)).outOfLimit).toBe(1);
  });

  it('fewer than two measured cells in a column: no verdict, the one value still shown as the lowest', () => {
    const one = ctaBlock({ polos: '4' }, [{ test: E1, row: 'polo_a', col: 'lado_normal', value: micro('900') }]);
    expect(verdicts(one, E1, 'lado_normal')).toEqual([null, null, null, null]);
    expect(testOf(one, E1).reference!.cells[0]!.text).toBe('900 µΩ');
    const none = ctaBlock({ polos: '4' });
    expect(testOf(none, E1).reference!.cells.map((cell) => cell.text)).toEqual([null, null]);
  });

  it('exactly 50 % above is within; a "Não medido" cell is filled, never judged and never the lowest', () => {
    const edge = ctaBlock({ polos: '3' }, column(E1, 'lado_normal', { polo_a: micro('40'), polo_b: micro('60'), polo_c: micro('60.01') }));
    expect(verdicts(edge, E1, 'lado_normal')).toEqual(['within', 'within', 'out']);
    expect(cellOf(edge, E1, 'polo_c', 'lado_normal').helperText).toBe('50 % acima do menor do lado (40 µΩ) — critério ≤ 50 %');
    const notMeasured = ctaBlock({ polos: '3' }, column(E1, 'lado_normal', { polo_a: { raw: '', unit: 'µΩ', state: 'not_measured' }, polo_b: micro('40'), polo_c: micro('70') }));
    expect(cellOf(notMeasured, E1, 'polo_a', 'lado_normal')).toMatchObject({ state: 'not_measured', displayText: '-', verdict: null, missing: false });
    expect(verdicts(notMeasured, E1, 'lado_normal')).toEqual([null, 'within', 'out']);
    // A zero or negative lowest gives no percentage: nothing is judged.
    const zero = ctaBlock({ polos: '3' }, column(E1, 'lado_normal', { polo_a: micro('0'), polo_b: micro('40'), polo_c: micro('70') }));
    expect(verdicts(zero, E1, 'lado_normal')).toEqual([null, null, null]);
  });
});

describe('matrix "Equality": E4, Deixado equals Projeto', () => {
  const td3a = (projeto: JsonValue | null, deixado: JsonValue | null): SheetWrite[] => [
    ...(projeto === null ? [] : [{ test: E4, row: 'td_3a', col: 'projeto', value: projeto }]),
    ...(deixado === null ? [] : [{ test: E4, row: 'td_3a', col: 'deixado', value: deixado }]),
  ];

  it('Projeto 5 min and Deixado 30 min: out on Deixado; then Deixado 5 min: within', () => {
    const { state, f } = ctaState();
    const differs = writeSheet(state, f, td3a(num('5', 'min'), num('30', 'min')));
    expect(cellOf(blockOf(differs), E4, 'td_3a', 'deixado')).toMatchObject({
      verdict: 'out',
      displayText: '30',
      unit: 'min',
      helperText: 'Diferente de Projeto (5 min)',
      criterionText: 'Deixado = projeto',
      sourceName: 'manual do fabricante do controlador; ficha DTAC (RJ)',
    });
    // The reference column itself is never the one out.
    expect(cellOf(blockOf(differs), E4, 'td_3a', 'projeto').verdict).toBeNull();
    const equal = writeSheet(differs, f, td3a(null, num('5', 'min')));
    expect(cellOf(blockOf(equal), E4, 'td_3a', 'deixado')).toMatchObject({ verdict: 'within', helperText: null });
    // 5 and 5,0 are the same number.
    expect(cellOf(blockOf(writeSheet(equal, f, td3a(null, num('5.0', 'min')))), E4, 'td_3a', 'deixado').verdict).toBe('within');
  });

  it('a choice row compares option keys', () => {
    const row = (projeto: string, deixado: string) =>
      ctaBlock({}, [
        { test: E4, row: 'falta_de_fase', col: 'projeto', value: choice(projeto) },
        { test: E4, row: 'falta_de_fase', col: 'deixado', value: choice(deixado) },
      ]);
    expect(cellOf(row('ligado', 'desligado'), E4, 'falta_de_fase', 'deixado')).toMatchObject({ verdict: 'out', displayText: 'Desligado', helperText: 'Diferente de Projeto (Ligado)' });
    expect(cellOf(row('ligado', 'ligado'), E4, 'falta_de_fase', 'deixado').verdict).toBe('within');
    expect(cellOf(row('desligado', 'desligado'), E4, 'falta_de_fase', 'deixado')).toMatchObject({ kind: 'choice', raw: 'desligado', unit: null, units: [] });
    expect(cellOf(row('ligado', 'ligado'), E4, 'falta_de_fase', 'deixado').options.map((option) => option.key)).toEqual(['ligado', 'desligado']);
  });

  it('either cell empty: no verdict', () => {
    expect(cellOf(ctaBlock({}, td3a(num('5', 'min'), null)), E4, 'td_3a', 'deixado').verdict).toBeNull();
    expect(cellOf(ctaBlock({}, td3a(null, num('5', 'min'))), E4, 'td_3a', 'deixado').verdict).toBeNull();
    expect(cellOf(ctaBlock(), E4, 'td_3a', 'deixado').verdict).toBeNull();
    // Encontrado and Fábrica are recorded only: neither is compared with anything.
    const found = ctaBlock({}, [
      ...td3a(num('5', 'min'), num('5', 'min')),
      { test: E4, row: 'td_3a', col: 'encontrado', value: num('30', 'min') },
      { test: E4, row: 'td_3a', col: 'fabrica', value: num('30', 'min') },
    ]);
    expect(testOf(found, E4).rows.find((row) => row.key === 'td_3a')!.cells.map((cell) => cell.verdict)).toEqual([null, null, null, 'within']);
  });
});

describe('matrix "Absolute": E2 by tensão, E3 and the E5 limit', () => {
  const aT = (value: JsonValue, options: Record<string, string> = {}) => cellOf(ctaBlock(options, [{ test: E2, row: 'a_t', col: 'aberta', value }]), E2, 'a_t', 'aberta');

  it('BT: at least 100 MΩ, GΩ scaled through the Ω table', () => {
    expect(aT(num('99.9', 'MΩ'))).toMatchObject({ verdict: 'out', helperText: 'Abaixo do aceitável (≥ 100 MΩ)', criterionText: '1.000 Vcc · ≥ 100 MΩ', sourceName: 'NETA tabela 100.1 (fonte secundária)' });
    expect(aT(num('100', 'MΩ')).verdict).toBe('within');
    expect(aT(num('12.4', 'GΩ')).verdict).toBe('within');
    expect(aT(num('0.09', 'GΩ')).verdict).toBe('out');
    expect(aT(num('1', 'TΩ'))).toMatchObject({ verdict: 'within', unit: 'TΩ', units: ['MΩ', 'GΩ', 'TΩ'] });
    expect(testOf(ctaBlock(), E2).criteria).toEqual([{ text: '1.000 Vcc · ≥ 100 MΩ', sourceName: 'NETA tabela 100.1 (fonte secundária)', sourceEdition: null }]);
  });

  it('MT: the firm\'s seeded isolação criterion, more than 400 MΩ', () => {
    const mt = { tensao: 'mt' };
    expect(aT(num('400', 'MΩ'), mt)).toMatchObject({ verdict: 'out', helperText: 'Abaixo do aceitável (>400 MΩ)', criterionText: '>400 MΩ', sourceName: 'aceitável na ficha' });
    expect(aT(num('401', 'MΩ'), mt).verdict).toBe('within');
    expect(aT(num('147', 'GΩ'), mt).verdict).toBe('within');
    // 150 MΩ passes in BT and fails in MT: the criterion follows the configuration.
    expect(aT(num('150', 'MΩ')).verdict).toBe('within');
    expect(aT(num('150', 'MΩ'), mt).verdict).toBe('out');
    const test = testOf(ctaBlock(mt), E2);
    expect(test.criteria).toEqual([{ text: '>400 MΩ', sourceName: 'aceitável na ficha', sourceEdition: null }]);
    expect(test.criterionText).toBe('>400 MΩ');
    expect(test.sourceName).toBe('aceitável na ficha');
  });

  it('E3: at least 2 MΩ', () => {
    const e3 = (value: JsonValue) => cellOf(ctaBlock({}, [{ test: E3, row: 'fiacao_terra', col: 'valor', value }]), E3, 'fiacao_terra', 'valor');
    expect(e3(num('850', 'MΩ')).verdict).toBe('within');
    expect(e3(num('2', 'MΩ')).verdict).toBe('within');
    expect(e3(num('1.9', 'MΩ'))).toMatchObject({ verdict: 'out', helperText: 'Abaixo do aceitável (≥ 2 MΩ)' });
    expect(e3(num('1500', 'kΩ')).verdict).toBe('out');
  });

  it('E5: only "Até carga na Emergência" is judged, at most 10 s', () => {
    const e5 = (row: string, value: JsonValue) => cellOf(ctaBlock({}, [{ test: E5, row, col: 'medido', value }]), E5, row, 'medido');
    expect(e5('ate_carga_na_emergencia', num('8.4', 's'))).toMatchObject({ verdict: 'within', displayText: '8,4', unit: 's', units: ['s'] });
    expect(e5('ate_carga_na_emergencia', num('10', 's')).verdict).toBe('within');
    expect(e5('ate_carga_na_emergencia', num('10.5', 's'))).toMatchObject({
      verdict: 'out',
      helperText: 'Acima do aceitável (≤ 10 s)',
      criterionText: 'Assumir a carga ≤ 10 s',
      sourceName: 'NFPA 110 nível 1; OVG, SEDI Goiás, BCB e NFPA 70B A.39.2',
    });
    // The deviation from the setting is recorded only: no other step has a limit.
    for (const row of ['falha_da_normal_ate_partida', 'retransferencia', 'resfriamento', 'falha_da_emergencia']) expect(e5(row, num('999', 's')).verdict, row).toBeNull();
    expect(e5('retransferencia', num('5.0', 'min'))).toMatchObject({ unit: 'min', units: ['min'], displayText: '5,0' });
  });

  it('an incompatible unit gives no verdict and never throws into the surface', () => {
    const e5 = cellOf(ctaBlock({}, [{ test: E5, row: 'ate_carga_na_emergencia', col: 'medido', value: num('8', 'min') }]), E5, 'ate_carga_na_emergencia', 'medido');
    expect(e5).toMatchObject({ state: 'measured', unit: 'min', verdict: null, helperText: null, missing: false });
    expect(aT(num('15', 'kV'))).toMatchObject({ state: 'measured', verdict: null });
    // A number stored with no unit reads in its column's, as on the seeded tables.
    expect(aT(num('15', null))).toMatchObject({ state: 'measured', verdict: 'out', unit: 'MΩ' });
    // A stored value that is not a number at all is shown as invalid, filled and unjudged.
    const invalid = aT({ raw: 'doze', unit: 'MΩ', state: 'measured' });
    expect(invalid).toMatchObject({ state: 'invalid', displayText: 'doze', verdict: null, missing: false });
  });
});

describe('matrix "Choice result": E6, the class', () => {
  const classe = (value: JsonValue) => cellOf(ctaBlock({}, [{ test: E6, row: 'normal_a', col: 'classe', value }]), E6, 'normal_a', 'classe');

  it('Normal is within, any other class is out', () => {
    expect(classe(choice('normal'))).toMatchObject({ verdict: 'within', displayText: 'Normal', helperText: null });
    for (const [key, label] of [
      ['possivel_deficiencia', 'Possível deficiência'],
      ['provavel_deficiencia', 'Provável deficiência'],
      ['grave', 'Grave'],
    ] as const) {
      expect(classe(choice(key)), key).toMatchObject({ verdict: 'out', displayText: label, helperText: 'Fora do aceitável (Normal)', sourceName: 'NETA tabela 100.18 (fonte secundária)' });
    }
  });

  it('an unknown option key reads as unanswered', () => {
    for (const value of [choice('critica'), choice(''), { raw: 'normal', unit: null, state: 'empty' }, 'normal', 3, null] as JsonValue[]) {
      expect(classe(value), JSON.stringify(value)).toMatchObject({ state: 'empty', raw: '', displayText: '—', verdict: null, missing: true });
    }
    // The typed ΔT columns are optional and judged by nothing.
    const deltas = ctaBlock({}, [
      { test: E6, row: 'normal_a', col: 'delta_t_similares', value: num('20', '°C') },
      { test: E6, row: 'normal_a', col: 'delta_t_ambiente', value: num('45', '°C') },
    ]);
    expect(cellOf(deltas, E6, 'normal_a', 'delta_t_similares')).toMatchObject({ optional: true, verdict: null, missing: false });
    expect(cellOf(ctaBlock(), E6, 'normal_a', 'delta_t_ambiente')).toMatchObject({ optional: true, state: 'empty', missing: false });
  });
});

describe('matrix "Config rows": the rows follow the polos', () => {
  const rows = (block: BlockRow, key: string) => testOf(block, key).rows.map((row) => row.key);
  const indexes = (block: BlockRow, key: string) => testOf(block, key).rows.map((row) => row.row);

  it('rows C are hidden at 2, rows N only at 4, and a row never changes its index', () => {
    const two = ctaBlock({ polos: '2' });
    const three = ctaBlock({ polos: '3' });
    const four = ctaBlock({ polos: '4' });
    expect(rows(two, E1)).toEqual(['polo_a', 'polo_b']);
    expect(rows(three, E1)).toEqual(['polo_a', 'polo_b', 'polo_c']);
    expect(rows(four, E1)).toEqual(['polo_a', 'polo_b', 'polo_c', 'polo_n']);
    expect(rows(two, E2)).toEqual(['a_t', 'b_t', 'a_b', 'linha_carga']);
    expect(rows(three, E2)).toEqual(['a_t', 'b_t', 'c_t', 'a_b', 'b_c', 'c_a', 'linha_carga']);
    expect(rows(four, E2)).toEqual(['a_t', 'b_t', 'c_t', 'n_t', 'a_b', 'b_c', 'c_a', 'linha_carga']);
    expect(indexes(two, E2)).toEqual([0, 1, 4, 7]);
    expect(indexes(three, E2)).toEqual([0, 1, 2, 4, 5, 6, 7]);
    expect(indexes(four, E2)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(rows(two, E6)).toEqual(['normal_a', 'normal_b', 'emergencia_a', 'emergencia_b', 'carga_a', 'carga_b']);
    expect(rows(four, E6)).toHaveLength(9);
    // The default is three poles, and the tests that have no pole rows never change.
    expect(rows(ctaBlock(), E1)).toEqual(rows(three, E1));
    for (const key of [E3, E4, E5]) expect(rows(two, key), key).toEqual(rows(four, key));
  });

  it('a hidden row is not shown, counted or judged, and its stored cell stays', () => {
    // Typed at four poles: Polo N at 300 µΩ is far out of the criterion.
    const { state, f } = ctaState({ polos: '4' });
    const typed = writeSheet(state, f, [...NORMAL.slice(0, 3), { test: E1, row: 'polo_n', col: 'lado_normal', value: micro('300') }]);
    expect(verdicts(blockOf(typed), E1, 'lado_normal')).toEqual(['within', 'within', 'within', 'out']);
    const missingAtFour = measurementCounts(evaluate(blockOf(typed))).missing;
    // Back to three poles: the row leaves the evaluation, with its verdict and its required cells.
    const three = applyOp(typed, f.op({ path: blockFieldPath(CTA_BLOCK, 'config'), value: blockConfigWithOption(blockOf(typed).config, 'polos', '3') }));
    const block = blockOf(three);
    expect(testOf(block, E1).rows.map((row) => row.key)).toEqual(['polo_a', 'polo_b', 'polo_c']);
    expect(measurementCounts(evaluate(block)).outOfLimit).toBe(0);
    // Hidden at three: Polo N's other cell (1) and N-T's three.
    expect(measurementCounts(evaluate(block)).missing).toBe(missingAtFour - 1 - 3);
    expect(block.sheet.test[E1]!.cells['3']!['0']!.value).toEqual({ raw: '300', unit: 'µΩ', state: 'measured' });
    expect(measurementCells(evaluate(block)).some((cell) => cell.rowKey === 'polo_n')).toBe(false);
  });
});

describe('matrix "Fixed cells"', () => {
  it('E2 Linha-carga under the two closed columns, and the E5 Ajuste of two steps, are text: never typed, never required', () => {
    const block = ctaBlock({ polos: '4' });
    const linha = testOf(block, E2).rows.find((row) => row.key === 'linha_carga')!;
    expect(linha.cells.map((cell) => [cell.columnKey, cell.fixed, cell.displayText, cell.missing])).toEqual([
      ['normal_fechada', '—', '—', false],
      ['emergencia_fechada', '—', '—', false],
      ['aberta', null, '—', true],
    ]);
    const e5 = testOf(block, E5);
    expect(e5.rows.map((row) => [row.label, row.cells[0]!.fixed])).toEqual([
      ['Falha da Normal até partida', null],
      ['Até carga na Emergência', 'limite 10 s'],
      ['Retransferência', null],
      ['Resfriamento', null],
      ['Falha da Emergência', '—'],
    ]);
    // A fixed cell is in no count and no list of typed cells.
    expect(measurementCells(evaluate(block)).some((cell) => cell.fixed !== null)).toBe(false);
    // A value the fold would refuse, held by hand: a fixed cell still reads as its text.
    const forged: BlockRow = { ...block, sheet: { ...block.sheet, test: { [E2]: { cells: { [String(rowOf(E2, 'linha_carga'))]: { '0': rawCell(num('1', 'MΩ')) } } } } } };
    expect(cellOf(forged, E2, 'linha_carga', 'normal_fechada')).toMatchObject({ fixed: '—', state: 'empty', displayText: '—', verdict: null, missing: false });
  });

  it('an optional column is typed when known and never missing: Fábrica and the E5 Ajuste', () => {
    const block = ctaBlock();
    expect(testOf(block, E4).columns.map((col) => [col.key, col.optional])).toEqual([
      ['fabrica', true],
      ['projeto', false],
      ['encontrado', false],
      ['deixado', false],
    ]);
    expect(cellOf(block, E4, 'td_1c', 'fabrica')).toMatchObject({ optional: true, missing: false, unit: 's' });
    expect(cellOf(block, E4, 'td_1c', 'projeto')).toMatchObject({ optional: false, missing: true, unit: 's' });
    expect(cellOf(block, E5, 'retransferencia', 'ajuste')).toMatchObject({ optional: true, missing: false, fixed: null, unit: 'min' });
  });
});

describe('matrix "E5 options": método, carga and fonte dos tempos are sheet values', () => {
  const e5 = (values: Record<string, JsonValue>, cells: SheetWrite[] = []) => testOf(ctaBlock({}, [...Object.entries(values).map(([key, value]) => ({ test: E5, key, value })), ...cells]), E5);
  const shown = (test: MeasurementTestEvaluation) => test.values.filter((value) => value.shown).map((value) => value.key);

  it('the % and V, Hz, A show only with "com carga"', () => {
    expect(shown(e5({}))).toEqual(['metodo', 'carga', 'fonte_tempos']);
    expect(shown(e5({ carga: choice('sem_carga') }))).toEqual(['metodo', 'carga', 'fonte_tempos']);
    expect(shown(e5({ carga: choice('com_carga') }))).toEqual(['metodo', 'carga', 'carga_percentual', 'fonte_tempos', 'tensao', 'frequencia', 'corrente']);
    // A % typed with load and then "sem carga": the value stays stored and is no longer shown.
    const hidden = e5({ carga: choice('sem_carga'), carga_percentual: num('62', '%') });
    expect(hidden.values.find((value) => value.key === 'carga_percentual')).toMatchObject({ shown: false, state: 'measured', missing: false });
    expect(hidden.valuesLine!.text).toBe('Carga: Sem carga');
    expect(hidden.groups).toEqual([]);
  });

  it('método, carga and fonte dos tempos are required, the % with load too; V, Hz and A never', () => {
    const missing = (test: MeasurementTestEvaluation) => test.values.filter((value) => value.missing).map((value) => value.key);
    expect(missing(e5({}))).toEqual(['metodo', 'carga', 'fonte_tempos']);
    expect(missing(e5({ metodo: choice('falta_real'), carga: choice('com_carga') }))).toEqual(['carga_percentual', 'fonte_tempos']);
    expect(missing(e5({ metodo: choice('falta_real'), carga: choice('com_carga'), carga_percentual: num('62', '%'), fonte_tempos: choice('instrumento') }))).toEqual([]);
    expect(missing(e5({ metodo: choice('botao_teste'), carga: choice('sem_carga'), fonte_tempos: choice('registro_controlador') }))).toEqual([]);
    // An option key the value does not list reads as unanswered.
    expect(missing(e5({ metodo: choice('manual') }))).toContain('metodo');
  });

  it('the values line says how the test was run, the % with the carga; V, Hz and A gather in their own row', () => {
    const full = e5({
      metodo: choice('falta_real'),
      carga: choice('com_carga'),
      carga_percentual: num('62', '%'),
      fonte_tempos: choice('instrumento'),
      tensao: num('381', 'V'),
      frequencia: num('60.1', 'Hz'),
      corrente: num('248', 'A'),
    });
    expect(full.valuesLine).toEqual({
      parts: [
        { label: 'Método', text: 'Falta real por abertura do disjuntor', kind: 'choice' },
        { label: 'Carga', text: 'Com carga (62 %)', kind: 'choice' },
        { label: 'Fonte dos tempos', text: 'Instrumento', kind: 'choice' },
      ],
      text: 'Método: Falta real por abertura do disjuntor · Carga: Com carga (62 %) · Fonte dos tempos: Instrumento',
    });
    expect(full.groups).toHaveLength(1);
    expect(full.groups[0]).toMatchObject({ label: 'Na Emergência, com carga', text: '381 V · 60,1 Hz · 248 A' });
    expect(full.groups[0]!.values.map((value) => value.key)).toEqual(['tensao', 'frequencia', 'corrente']);
    // A test started from the controller skips the engine-start delay, and the line says so.
    expect(e5({ metodo: choice('botao_teste') }).valuesLine!.text).toBe('Método: Botão de teste do controlador (sem TD 1C)');
    expect(e5({ carga: choice('com_carga'), tensao: num('381', 'V') }).groups[0]!.text).toBe('381 V');
    expect(e5({ carga: choice('com_carga') }).groups[0]!.text).toBe('');
    expect(e5({}).valuesLine).toBeNull();
  });

  it('"não realizado" skips the table: nothing of E5 is required, judged or said beyond the method', () => {
    const late = { test: E5, row: 'ate_carga_na_emergencia', col: 'medido', value: num('25', 's') };
    const run = e5({ metodo: choice('falta_real') }, [late]);
    expect(run.skipped).toBe(false);
    expect(run.rows[1]!.cells[1]!.verdict).toBe('out');
    const skipped = e5({ metodo: choice('nao_realizado'), carga: choice('com_carga'), carga_percentual: num('62', '%'), tensao: num('381', 'V') }, [late]);
    expect(skipped).toMatchObject({ enabled: true, skipped: true, switchable: false, offNote: null });
    expect(skipped.rows.flatMap((row) => row.cells).every((cell) => !cell.missing && cell.verdict === null)).toBe(true);
    expect(skipped.values.every((value) => !value.missing)).toBe(true);
    expect(skipped.valuesLine!.text).toBe('Método: Não realizado');
    expect(skipped.groups).toEqual([]);
    // The cell typed before keeps its value on the row.
    expect(skipped.rows[1]!.cells[1]).toMatchObject({ state: 'measured', raw: '25' });
    const block = ctaBlock({}, [{ test: E5, key: 'metodo', value: choice('nao_realizado') }, late]);
    expect(measurementCells(evaluate(block)).some((cell) => cell.address.testKey === E5)).toBe(false);
    expect(measurementCounts(evaluate(block)).outOfLimit).toBe(0);
  });

  it('E6 carries the ambient temperature as its one value, said on its line', () => {
    const e6 = testOf(ctaBlock({}, [{ test: E6, key: 'temperatura_ambiente', value: num('27', '°C') }]), E6);
    expect(e6.values).toEqual([
      { key: 'temperatura_ambiente', label: 'Temperatura ambiente', kind: 'number', unit: '°C', options: [], optional: false, group: null, shown: true, state: 'measured', raw: '27', displayText: '27 °C', missing: false },
    ]);
    expect(e6.valuesLine).toEqual({ parts: [{ label: 'Temperatura ambiente', text: '27 °C', kind: 'number' }], text: 'Temperatura ambiente: 27 °C' });
    expect(testOf(ctaBlock(), E6).values[0]).toMatchObject({ state: 'empty', displayText: '—', missing: true });
  });
});

describe('matrix "Test switched off"', () => {
  const off = (block: BlockRow, key: string): BlockRow => ({ ...block, config: blockConfigWithSubBlock(block.config, key as never, false) });

  it('E1, E2, E3 and E6 can be switched off, with their note; E4 and E5 cannot', () => {
    const tests = evaluate(ctaBlock());
    expect(tests.map((test) => [test.title, test.switchable, test.enabled])).toEqual([
      ['E1 · Resistência de contato', true, true],
      ['E2 · Isolamento principal', true, true],
      ['E3 · Isolamento do controle', true, true],
      ['E4 · Ajustes do controlador', false, true],
      ['E5 · Transferência', false, true],
      ['E6 · Termografia sob carga', true, true],
    ]);
    expect(tests.map((test) => test.offNote)).toEqual([
      'Desligado — marque NA quando a chave não pode ser desenergizada.',
      'Desligado — marque NA quando a chave não pode ser desenergizada.',
      'Desligado — marque NA quando a chave não pode ser desenergizada.',
      null,
      null,
      'Desligado — marque NA quando não há carga para a termografia.',
    ]);
    expect(tests.map((test) => test.instrumentOf)).toEqual(['resistencia_contato', 'isolacao', 'isolacao', null, null, null]);
    expect(tests.map((test) => test.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(tests.map((test) => test.rowHeader)).toEqual(['Polo', 'Medição', 'Medição', 'Ajuste', 'Etapa', 'Terminal × fase']);
    // A config that says E4 or E5 is off does not switch them off.
    const forced = off(off(ctaBlock(), E4), E5);
    expect(evaluate(forced).map((test) => test.enabled)).toEqual([true, true, true, true, true, true]);
  });

  it('a test switched off requires nothing and judges nothing; switched on again it reads what it held', () => {
    const typed = ctaBlock({ polos: '4' }, [...NORMAL, ...EMERGENCIA]);
    expect(measurementCounts(evaluate(typed)).outOfLimit).toBe(1);
    const before = measurementCounts(evaluate(ctaBlock({ polos: '4' }))).missing;
    const switched = off(typed, E1);
    const e1 = testOf(switched, E1);
    expect(e1).toMatchObject({ enabled: false, switchable: true });
    expect(e1.rows.flatMap((row) => row.cells).every((cell) => !cell.missing && cell.verdict === null)).toBe(true);
    expect(measurementCounts(evaluate(switched)).outOfLimit).toBe(0);
    expect(measurementCells(evaluate(switched)).some((cell) => cell.address.testKey === E1)).toBe(false);
    // The eight cells of E1 at four poles are no longer asked for.
    expect(measurementCounts(evaluate(off(ctaBlock({ polos: '4' }), E1))).missing).toBe(before - 8);
    // E6 off: its 9 temperatures, 9 classes and the ambient temperature.
    expect(measurementCounts(evaluate(off(ctaBlock({ polos: '4' }), E6))).missing).toBe(before - 19);
    expect(measurementValues(evaluate(off(ctaBlock(), E6))).some((value) => value.key === 'temperatura_ambiente')).toBe(false);
    const on: BlockRow = { ...switched, config: blockConfigWithSubBlock(switched.config, E1 as never, true) };
    expect(verdicts(on, E1, 'lado_emergencia')).toEqual(['within', 'within', 'out', 'within']);
  });
});

describe('the configuration of a sheet', () => {
  it('reads the stored options, the defaults where the config holds none, and ignores what is not an option', () => {
    expect(configOptionsOf(ctaBlock(), definition)).toEqual({ tensao: 'bt', polos: '3', neutro: 'solido', transicao: 'aberta', bypass: 'nao' });
    expect(configOptionsOf(ctaBlock({ tensao: 'mt', polos: '4', neutro: 'chaveado' }), definition)).toEqual({ tensao: 'mt', polos: '4', neutro: 'chaveado', transicao: 'aberta', bypass: 'nao' });
    const odd: BlockRow = { ...ctaBlock(), config: { block_type: CTA, sub_blocks: {}, na_defaults: [], options: { polos: '5', tensao: 3, cor: 'cinza' } } as JsonValue };
    expect(configOptionsOf(odd, definition)).toEqual({ tensao: 'bt', polos: '3', neutro: 'solido', transicao: 'aberta', bypass: 'nao' });
    for (const config of [null, 'x', [], {}] as JsonValue[]) expect(configOptionsOf({ config }, definition).polos, JSON.stringify(config)).toBe('3');
    // A type with no configuration has none.
    const sec = getDefinition('v5', 'cabine_primaria', 'chave_seccionadora');
    expect(configOptionsOf(ctaBlock(), sec)).toEqual({});
    expect(configFieldsOf(ctaBlock(), sec)).toEqual([]);
  });

  it('lists the five fields with their options and the one in force', () => {
    const fields = configFieldsOf(ctaBlock({ polos: '4', neutro: 'chaveado' }), definition);
    expect(fields.map((field) => [field.key, field.label, field.value, field.valueLabel])).toEqual([
      ['tensao', 'Tensão', 'bt', 'BT'],
      ['polos', 'Polos', '4', '4'],
      ['neutro', 'Neutro', 'chaveado', 'Chaveado'],
      ['transicao', 'Transição', 'aberta', 'Aberta'],
      ['bypass', 'Bypass-isolation', 'nao', 'Não'],
    ]);
    expect(fields[2]!.options.map((option) => option.label)).toEqual(['Sólido', 'Chaveado', 'Sobreposto']);
  });

  it('blockConfigWithOption and blockConfigWithSubBlock change one key and keep every other', () => {
    const config = ctaRows().block.config as { sub_blocks: Record<string, unknown>; na_defaults: unknown[] };
    const withPolos = blockConfigWithOption(config, 'polos', '4') as typeof config & { options: Record<string, string> };
    expect(withPolos.options).toEqual({ polos: '4' });
    expect(withPolos.sub_blocks).toEqual(config.sub_blocks);
    expect(config).not.toHaveProperty('options');
    const both = blockConfigWithOption(withPolos, 'tensao', 'mt') as typeof withPolos;
    expect(both.options).toEqual({ polos: '4', tensao: 'mt' });
    const off = blockConfigWithSubBlock(both, 'cta_termografia', false) as typeof withPolos;
    expect(off.sub_blocks.cta_termografia).toEqual({ enabled: false });
    expect(off.sub_blocks.cta_resistencia_contato).toEqual({ enabled: true });
    expect(off.options).toEqual({ polos: '4', tensao: 'mt' });
    expect(blockConfigWithSubBlock(null, 'cta_termografia', false)).toEqual({ sub_blocks: { cta_termografia: { enabled: false } } });
    expect(choiceValue('mt')).toEqual({ raw: 'mt', unit: null, state: 'measured' });
  });
});

describe('the evaluation as a whole', () => {
  it('answers none for a block type with no measurement test, and the seeded evaluation none for the CTA', () => {
    const sec = getDefinition('v5', 'cabine_primaria', 'chave_seccionadora');
    expect(evaluateSheetMeasurements(ctaBlock(), sec)).toEqual([]);
    expect(evaluateSheetReadings(ctaBlock(), definition)).toEqual([]);
    expect(measurementCounts([])).toEqual({ missing: 0, outOfLimit: 0 });
    expect(worstMeasurements([])).toEqual([]);
  });

  it('an empty cell of a tap-cycle column shows the unit of the row above it', () => {
    const block = ctaBlock({ polos: '3' }, [{ test: E2, row: 'a_t', col: 'aberta', value: num('12.4', 'GΩ') }]);
    const aberta = testOf(block, E2).rows.map((row) => row.cells[colOf(E2, 'aberta')]!.unit);
    expect(aberta).toEqual(['GΩ', 'GΩ', 'GΩ', 'GΩ', 'GΩ', 'GΩ', 'GΩ']);
    expect(testOf(block, E2).rows.map((row) => row.cells[0]!.unit)).toEqual(['MΩ', 'MΩ', 'MΩ', 'MΩ', 'MΩ', 'MΩ', null]);
    expect(cellOf(block, E2, 'b_t', 'aberta')).toMatchObject({ state: 'empty', unit: 'GΩ', units: ['MΩ', 'GΩ', 'TΩ'], displayText: '—' });
    expect(cellOf(block, E1, 'polo_a', 'lado_normal')).toMatchObject({ unit: 'µΩ', units: ['µΩ'] });
  });

  it('names a test, a cell and a value by address, and reads a stored value as text', () => {
    expect(measurementTestTitle(definition, E1)).toBe('E1 · Resistência de contato');
    expect(measurementTestTitle(definition, E6)).toBe('E6 · Termografia sob carga');
    expect(measurementTestTitle(definition, 'isolacao')).toBeNull();
    expect(measurementTestTitle(null, E1)).toBeNull();
    expect(measurementCellLabel(definition, E1, 2, 1)).toBe('Polo C · Lado Emergência');
    expect(measurementCellLabel(definition, E4, rowOf(E4, 'td_3a'), colOf(E4, 'deixado'))).toBe('TD 3A · retransferência · Deixado');
    expect(measurementCellLabel(definition, E1, 9, 0)).toBeNull();
    expect(measurementValueLabel(definition, E5, 'fonte_tempos')).toBe('Fonte dos tempos');
    expect(measurementValueLabel(definition, E5, 'nenhum')).toBeNull();
    expect(measurementStoredText(definition, E5, { valueKey: 'metodo' }, choice('botao_teste'))).toBe('Botão de teste do controlador');
    expect(measurementStoredText(definition, E5, { valueKey: 'carga_percentual' }, num('62', '%'))).toBe('62 %');
    expect(measurementStoredText(definition, E1, { row: 2, col: 1 }, num('63', 'µΩ'))).toBe('63 µΩ');
    expect(measurementStoredText(definition, E4, { row: rowOf(E4, 'falta_de_fase'), col: 3 }, choice('ligado'))).toBe('Ligado');
    expect(measurementStoredText(definition, E4, { row: rowOf(E4, 'td_3a'), col: 3 }, num('5', null))).toBe('5 min');
    expect(measurementStoredText(definition, E5, { valueKey: 'metodo' }, choice('manual'))).toBeNull();
    expect(measurementStoredText(definition, E5, { valueKey: 'metodo' }, null)).toBeNull();
    expect(measurementStoredText(definition, 'isolacao', { row: 0, col: 0 }, num('1', 'MΩ'))).toBeNull();
  });

  it('worstMeasurements: one reading per test with an out cell, the furthest beyond its criterion', () => {
    const block = ctaBlock({ polos: '4' }, [
      ...NORMAL,
      ...EMERGENCIA,
      // A second out pole, further out than the 63: 80 is 105 % above 39.
      { test: E1, row: 'polo_n', col: 'lado_emergencia', value: micro('80') },
      { test: E4, row: 'td_3a', col: 'projeto', value: num('5', 'min') },
      { test: E4, row: 'td_3a', col: 'deixado', value: num('30', 'min') },
      { test: E6, row: 'carga_a', col: 'classe', value: choice('grave') },
      { test: E3, row: 'fiacao_terra', col: 'valor', value: num('850', 'MΩ') },
    ]);
    expect(worstMeasurements(evaluate(block))).toEqual([
      {
        testKey: E1,
        title: 'E1 · Resistência de contato',
        label: 'Resistência de contato',
        where: 'Polo N, Lado Emergência',
        valueText: '80 µΩ',
        criterionText: '≤ 50 % acima do menor do mesmo lado',
        sourceName: 'NETA 7.22.3 (fonte secundária)',
        helperText: '105 % acima do menor do lado (39 µΩ) — critério ≤ 50 %',
      },
      {
        testKey: E4,
        title: 'E4 · Ajustes do controlador',
        label: 'Ajustes do controlador',
        where: 'TD 3A · retransferência, Deixado',
        valueText: '30 min',
        criterionText: 'Deixado = projeto',
        sourceName: 'manual do fabricante do controlador; ficha DTAC (RJ)',
        helperText: 'Diferente de Projeto (5 min)',
      },
      {
        testKey: E6,
        title: 'E6 · Termografia sob carga',
        label: 'Termografia sob carga',
        where: 'Carga · A, Classe',
        valueText: 'Grave',
        criterionText: 'Classe Normal (ΔT entre similares: 1 a 3 °C possível deficiência, 4 a 15 °C provável, acima de 15 °C grave)',
        sourceName: 'NETA tabela 100.18 (fonte secundária)',
        helperText: 'Fora do aceitável (Normal)',
      },
    ]);
    // A one-column table names the row alone.
    const e3 = ctaBlock({}, [{ test: E3, row: 'fiacao_terra', col: 'valor', value: num('1', 'MΩ') }]);
    expect(worstMeasurements(evaluate(e3))[0]).toMatchObject({ where: 'Fiação × terra', valueText: '1 MΩ' });
  });
});

// --- what the sheet's own consumers read ------------------------------------------------------------

describe('sheetProgress counts the measurement tests in the Ensaios step', () => {
  const progressOf = (block: BlockRow) => sheetProgress({ blocks: [block] }, block.id);

  it('a new sheet at three poles asks for 95 readings: 6, 19, 1, 42, 8 and 19', () => {
    const block = ctaBlock();
    const perTest = evaluate(block).map((test) => measurementCounts([test]).missing);
    expect(perTest).toEqual([6, 19, 1, 42, 8, 19]);
    const progress = progressOf(block);
    expect(progress.steps.ensaios).toEqual({ missing: 95, outOfLimit: 0 });
    expect(progress.steps.placa.missing).toBe(15);
    expect(progress.steps.verificacoes.missing).toBe(17);
    expect(progress.steps.conclusao.missing).toBe(2);
    expect(shownSheetSteps(block)).toEqual(['placa', 'verificacoes', 'ensaios', 'conclusao']);
    expect(sheetProgressText(progress)).toBe('129 obrigatórios faltando');
    // Four poles add Polo N (2), N-T (3); two poles take Polo C (2), the three C rows of E2 (9) and of E6 (6).
    expect(progressOf(ctaBlock({ polos: '4' })).steps.ensaios.missing).toBe(100);
    expect(progressOf(ctaBlock({ polos: '2' })).steps.ensaios.missing).toBe(78);
    expect(sheetState(block)).toBe('vazia');
  });

  it('the counter falls to zero on a filled sheet, the out readings staying in view', () => {
    const { state, f } = ctaState({ polos: '4' });
    const filled = writeSheet(state, f, ctaFilledWrites());
    const block = blockOf(filled);
    const progress = progressOf(block);
    expect(progress.steps.placa.missing).toBe(0);
    expect(progress.steps.verificacoes.missing).toBe(0);
    // One pole out of the relative limit and one setting left different from the project.
    expect(progress.steps.ensaios).toEqual({ missing: 0, outOfLimit: 2 });
    expect(stepMayCollapse(progress, 'ensaios')).toBe(false);
    expect(progress.steps.conclusao.missing).toBe(2);
    expect(sheetSummaryText(progress, shownSheetSteps(block))).toBe('Placa, verificações e leituras prontas · falta a conclusão');
    expect(sheetState(block)).toBe('em_preenchimento');
    // With the pair set (Com restrições asks for the sheet observation) nothing is missing.
    let done = applyOp(filled, f.op({ path: sheetConclusionPath(CTA_BLOCK, 'result'), value: 'aprovado' }));
    done = applyOp(done, f.op({ path: sheetConclusionPath(CTA_BLOCK, 'restriction'), value: 'com_restricoes' }));
    expect(sheetMissingTotal(progressOf(blockOf(done)))).toBe(1);
    done = applyOp(done, f.op({ path: sheetObservationsPath(CTA_BLOCK), value: 'Polo C do lado Emergência a investigar.' }));
    expect(progressOf(blockOf(done))).toMatchObject({ complete: true, firstIncompleteStep: null });
    expect(sheetProgressText(progressOf(blockOf(done)))).toBe('Completa');
  });

  it('a sheet marked not tested asks for nothing', () => {
    const block: BlockRow = { ...ctaBlock(), not_tested: { reason: 'impossibilidade_desligamento', text: null, at: '2026-09-21T12:00:00.000Z', by: ctaRows().block.created_by ?? '019966b0-0003-7000-8000-000000000002' } };
    expect(progressOf(block)).toMatchObject({ complete: true });
    expect(suggestConclusionPair(block)).toBeNull();
  });

  it('a value counts as a filled cell of its test: the sheet is "em preenchimento" from the first one, unless the test is off', () => {
    const { state, f } = ctaState();
    const one = blockOf(writeSheet(state, f, [{ test: E6, key: 'temperatura_ambiente', value: num('27', '°C') }]));
    expect(sheetState(one)).toBe('em_preenchimento');
    expect(sheetState({ ...one, config: blockConfigWithSubBlock(one.config, 'cta_termografia', false) })).toBe('vazia');
  });
});

describe('the conclusion reads the measurement tests', () => {
  const filled = () => {
    const { state, f } = ctaState({ polos: '4' });
    return { state: writeSheet(state, f, ctaFilledWrites()), f };
  };

  it('suggests "Aprovado · Com restrições?" with an out reading or an NC item, "Sem restrições?" with neither, nothing on an untouched sheet', () => {
    expect(suggestConclusionPair(ctaBlock())).toBeNull();
    const within = ctaBlock({ polos: '4' }, NORMAL);
    expect(conclusionSuggestionText(suggestConclusionPair(within)!)).toBe('Aprovado · Sem restrições?');
    const out = ctaBlock({ polos: '4' }, [...NORMAL, ...EMERGENCIA]);
    expect(conclusionSuggestionText(suggestConclusionPair(out)!)).toBe('Aprovado · Com restrições?');
    // A choice out of its criterion restricts too, and so does a setting left different.
    expect(suggestConclusionPair(ctaBlock({}, [{ test: E6, row: 'normal_a', col: 'classe', value: choice('grave') }]))).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
    // A test value alone is not a measurement: nothing is suggested yet.
    expect(suggestConclusionPair(ctaBlock({}, [{ test: E5, key: 'metodo', value: choice('falta_real') }]))).toBeNull();
    // An out reading of a test switched off, or of one not run, restricts nothing.
    const off: BlockRow = { ...out, config: blockConfigWithSubBlock(out.config, 'cta_resistencia_contato', false) };
    expect(suggestConclusionPair(off)).toBeNull();
    expect(conclusionSuggestionText(suggestConclusionPair(blockOf(filled().state))!)).toBe('Aprovado · Com restrições?');
  });

  it('the composed text names the NC item and each out reading with its criterion and source', () => {
    const block = blockOf(filled().state);
    const composed = composeConclusion(block, definition, CTA_TAG);
    expect(composed.text).toBe(
      'A chave de transferência automática CTA-GER (valor fabricante, 400 V, 400 A) apresentou ' +
        'resistência de contato fora do critério em Polo C, Lado Emergência (63 µΩ; critério: ≤ 50 % acima do menor do mesmo lado, NETA 7.22.3 (fonte secundária)) e ' +
        'ajustes do controlador fora do critério em TD 3A · retransferência, Deixado (30 min; critério: Deixado = projeto, manual do fabricante do controlador; ficha DTAC (RJ)) e ' +
        'Aviso de transferência manual ausente na tampa frontal (item 3, NC).',
    );
    expect(composed.criteriaItems).toEqual([
      'E1 Polo C, Lado Emergência 63 µΩ · critério ≤ 50 % acima do menor do mesmo lado',
      'E4 TD 3A · retransferência, Deixado 30 min · critério Deixado = projeto',
      'item 3 NC',
    ]);
    expect(composed.text).not.toMatch(/asco/i);
  });

  it('with every reading within its criterion the text says so, and the basis follows every cell the text was composed from', () => {
    const { state, f } = filled();
    const fixed = writeSheet(state, f, [
      { test: E1, row: 'polo_c', col: 'lado_emergencia', value: micro('41') },
      { test: E4, row: 'td_3a', col: 'deixado', value: num('5', 'min') },
    ]);
    const before = composeConclusion(blockOf(state), definition, CTA_TAG);
    const after = composeConclusion(blockOf(fixed), definition, CTA_TAG);
    expect(after.text).toBe(
      'A chave de transferência automática CTA-GER (valor fabricante, 400 V, 400 A) apresentou valores medidos dentro dos critérios de aceitação e Aviso de transferência manual ausente na tampa frontal (item 3, NC).',
    );
    expect(after.criteriaItems).toEqual(['item 3 NC']);
    expect(after.basis).not.toBe(before.basis);
    // The same sheet composes the same basis; a cell that only moves inside its criterion still moves it.
    expect(composeConclusion(blockOf(fixed), definition, CTA_TAG).basis).toBe(after.basis);
    const moved = writeSheet(fixed, f, [{ test: E3, row: 'fiacao_terra', col: 'valor', value: num('900', 'MΩ') }]);
    expect(composeConclusion(blockOf(moved), definition, CTA_TAG).basis).not.toBe(after.basis);
    const skipped = writeSheet(fixed, f, [{ test: E5, key: 'metodo', value: choice('nao_realizado') }]);
    expect(composeConclusion(blockOf(skipped), definition, CTA_TAG).basis).not.toBe(after.basis);
  });

  it('"Concluir ficha" confirms the composed text with the pair, as on a seeded sheet', () => {
    const { state, f } = filled();
    let done = applyOp(state, f.op({ path: sheetConclusionPath(CTA_BLOCK, 'result'), value: 'aprovado' }));
    expect(conclusionTextOnConclude(blockOf(done), definition, CTA_TAG)).toBeNull();
    done = applyOp(done, f.op({ path: sheetConclusionPath(CTA_BLOCK, 'restriction'), value: 'com_restricoes' }));
    const text = conclusionTextOnConclude(blockOf(done), definition, CTA_TAG)!;
    expect(text.text).toMatch(/^A chave de transferência automática CTA-GER .* Recomenda-se a correção dos pontos indicados antes da próxima manutenção\.$/);
    expect(text.basis).toBe(composeConclusion(blockOf(done), definition, CTA_TAG).basis);
    expect(done.get(entityKey('block', CTA_BLOCK))).toBe(blockOf(done));
  });

  it('a sheet with nothing measured and nothing answered still composes, naming only its identity', () => {
    expect(composeConclusion(ctaBlock(), definition, '').text).toBe('A chave de transferência automática não apresentou valores medidos nem itens verificados registrados.');
  });
});
