import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { parsePath, sheetTestCellPath } from '../ops/path.ts';
import { replay } from '../ops/replay.ts';
import { opValueIssue } from '../ops/value-limits.ts';
import { section9Layout } from '../print/section-9.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, findDefinition, getDefinition } from '../seed/definitions.ts';
import { selectOptionFor } from '../seed/select-option.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, opFactory, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { accuracyClassDeviation, parseAccuracyClass } from './accuracy-class.ts';
import { composeConclusion } from './conclusion.ts';
import { instantiateTemplate } from './instantiate.ts';
import { instrumentRangeOf } from './instrument-pick.ts';
import { evaluateSheetMeasurements, overRangeRefusal, parseMeasurementReadingPtBr } from './measurement-evaluation.ts';
import { colOf, ctaDefinition, ctaRows, E2, rowOf } from './measurement-test-support.ts';
import { instrumentRangeHelperText, normalizeOhmUnit, OVER_RANGE_ALLOWED, overRangeMissingLimitText } from './over-range.ts';
import { composeParecer } from './parecer.ts';
import { readingRowLabel } from './reading-cells.ts';
import { cellAddressesOf } from './readings.ts';
import { ratingDefaultKv, rowTestVoltage } from './row-voltage.ts';
import { sheetReadings } from './sheet-evaluation.ts';

/*
 * e22g (Epic 22 wave B fix batch; `spec-e22g-wave-b-fixes.md`): the integrated review's S1, S2,
 * S4, S6 and N2 to N7, and Bruno's test base rev03 answers (items 8a to 8d of the launch brief).
 * B1 and N1 are measured in `print/print-fit.test.ts` and `print/last-results.test.ts`.
 */

const OP = '019966b0-e22a-7000-8000-000000000001';
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });
const measured = (raw: string, unit: string | null) => cell({ raw, unit, state: 'measured' });
const overRange = (raw: string, unit: string) => cell({ raw, unit, state: 'over_range' });

/** Batch e24a (Story 24.4): on seed v13, whose summary sentences these tests pin. */
function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-e22a-7000-8000-0000000000a1', seedVersion: 'v13' }),
    { id: TEST_PROJECT },
    { service_start: '2026-11-07', service_end: '2026-11-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966b0-e22a-7001-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-e22a-7002-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

const first = (snapshot: RelatorioSnapshot, type: string) => snapshot.blocks.find((block) => block.block_type === type)!;
const withBlock = (snapshot: RelatorioSnapshot, block: BlockRow): RelatorioSnapshot => ({ ...snapshot, blocks: snapshot.blocks.map((b) => (b.id === block.id ? block : b)) });
const withCells = (block: BlockRow, testKey: string, cells: Record<string, Cell>): BlockRow => {
  const test = structuredClone(block.sheet.test[testKey] ?? { cells: {} });
  for (const [address, value] of Object.entries(cells)) {
    const [row, col] = address.split('/') as [string, string];
    test.cells[row] = { ...test.cells[row], [col]: value };
  }
  return { ...block, sheet: { ...block.sheet, test: { ...block.sheet.test, [testKey]: test } } };
};
const withPlate = (block: BlockRow, plate: Record<string, unknown>): BlockRow => ({
  ...block,
  sheet: { ...block.sheet, nameplate: { ...block.sheet.nameplate, ...Object.fromEntries(Object.entries(plate).map(([key, value]) => [key, cell(value)])) } },
});

describe('e22g S1: the instrument limit unit read the way it is typed', () => {
  it('reads every spelling of the Ω table as its key; m and M stay apart; a blank or a text it cannot read is null', () => {
    const cases: [string, string | null][] = [
      ['µΩ', 'µΩ'],
      ['μΩ', 'µΩ'],
      ['uΩ', 'µΩ'],
      ['micro ohm', 'µΩ'],
      ['uohm', 'µΩ'],
      ['mΩ', 'mΩ'],
      ['mohm', 'mΩ'],
      ['MΩ', 'MΩ'],
      ['Mohm', 'MΩ'],
      ['mega ohms', 'MΩ'],
      ['G', 'GΩ'],
      ['gΩ', 'GΩ'],
      ['T', 'TΩ'],
      ['TOhm', 'TΩ'],
      ['tΩ', 'TΩ'],
      ['tera', 'TΩ'],
      ['megohm', 'MΩ'],
      ['kilohm', 'kΩ'],
      ['k', 'kΩ'],
      ['Ω', 'Ω'],
      ['Ω', 'Ω'],
      ['ohm', 'Ω'],
      ['  GΩ ', 'GΩ'],
      ['', null],
      ['   ', null],
      ['ohm?', null],
      ['V', null],
      ['xΩ', null],
    ];
    for (const [typed, read] of cases) expect(normalizeOhmUnit(typed), typed).toBe(read);
    expect(normalizeOhmUnit(null)).toBeNull();
  });

  it('a limit registered as "2.000" and "uΩ" fills "OL" on a µΩ cell; one in "ohm?" says its unit is unreadable, not "sem limite cadastrado"', () => {
    const cellInput = { units: ['µΩ'], overRange: OVER_RANGE_ALLOWED };
    const micro = instrumentRangeOf({ range_isolacao: null, range_resistencia_contato: { raw: '2.000', unit: 'uΩ' } } as never, 'resistencia_contato');
    expect(micro).toEqual({ raw: '2000', unit: 'µΩ' });
    expect(parseMeasurementReadingPtBr('OL', cellInput, 'µΩ', micro)).toEqual({ raw: '2000', unit: 'µΩ', state: 'over_range' });
    expect(overRangeRefusal('OL', cellInput, 'µΩ', micro)).toBeNull();

    const odd = instrumentRangeOf({ range_isolacao: null, range_resistencia_contato: { raw: '2.000', unit: 'ohm?' } } as never, 'resistencia_contato');
    expect(odd).toEqual({ raw: '2000', unit: 'ohm?' });
    expect(parseMeasurementReadingPtBr('OL', cellInput, 'µΩ', odd)).toBe('invalid');
    expect(overRangeRefusal('OL', cellInput, 'µΩ', odd)).toBe('Limite do instrumento com unidade não reconhecida ("ohm?"): corrija em Cadastros ou digite > e o limite (ex.: > 2 µΩ)');
    // A blank unit, and a TΩ limit on a µΩ cell, are unreadable for the cell too.
    expect(overRangeMissingLimitText({ raw: '2', unit: null }, ['µΩ'], 'µΩ')).toBe('Limite do instrumento com unidade não reconhecida (sem unidade): corrija em Cadastros ou digite > e o limite (ex.: > 2 µΩ)');
    expect(overRangeMissingLimitText({ raw: '2', unit: 'TΩ' }, ['µΩ'], 'µΩ')).toContain('("TΩ")');
    // No limit at all: the text as before.
    expect(overRangeRefusal('OL', cellInput, 'µΩ', null)).toBe('Instrumento sem limite cadastrado: digite > e o limite (ex.: > 2 µΩ)');
  });

  it('Cadastros: the helper shows for a set limit whose unit cannot be read, never for a readable one or an empty pair', () => {
    expect(instrumentRangeHelperText({ raw: '2', unit: 'TΩ' })).toBeNull();
    expect(instrumentRangeHelperText({ raw: '2', unit: 'T' })).toBeNull();
    expect(instrumentRangeHelperText(null)).toBeNull();
    expect(instrumentRangeHelperText({ raw: '', unit: '' })).toBeNull();
    expect(instrumentRangeHelperText({ raw: '2', unit: 'ohm?' })).toBe('Unidade não reconhecida: use µΩ, mΩ, Ω, kΩ, MΩ, GΩ ou TΩ (ex.: 2 e TΩ).');
    expect(instrumentRangeHelperText({ raw: '2', unit: '' })).not.toBeNull();
  });
});

describe('e22g S2: a row above the limit never lends its unit to the next row', () => {
  const definition = getDefinition('v12', 'cabine_primaria', 'transformador_forca');
  const capture = cellAddressesOf(definition, 'isolacao')[0]!.col;
  const unitsOf = (block: BlockRow) => sheetReadings(block, definition).find((test) => test.testKey === 'isolacao')!.tables[0]!.rows.map((row) => row.cells.find((c) => c.address.col === capture)!.unit);
  const base = first(fresh(), 'transformador_forca');

  it('"OL" (2 TΩ) on the first row: the empty second row shows the column\'s unit, not TΩ', () => {
    const column = unitsOf(base)[1];
    expect(column).not.toBe('TΩ');
    expect(unitsOf(withCells(base, 'isolacao', { [`0/${capture}`]: overRange('2', 'TΩ') }))[1]).toBe(column);
  });

  it('a measured row above an over-range one still carries: the last measured row\'s unit', () => {
    const block = withCells(base, 'isolacao', { [`0/${capture}`]: measured('1.5', 'TΩ'), [`1/${capture}`]: overRange('2', 'TΩ') });
    expect(unitsOf(block)[2]).toBe('TΩ');
    const mixed = withCells(base, 'isolacao', { [`0/${capture}`]: measured('800', 'MΩ'), [`1/${capture}`]: overRange('2', 'TΩ') });
    expect(unitsOf(mixed)[2]).toBe('MΩ');
  });
});

describe('e22g S2 on a measurement test (the CTA\'s E2, seed v5)', () => {
  it('"OL" (2 TΩ) on A-T: the next row\'s empty cell shows the column\'s MΩ; a measured TΩ row still carries', () => {
    const col = colOf(E2, 'normal_fechada');
    const first = rowOf(E2, 'a_t');
    const unitBelow = (value: Cell) => {
      const block = withCells(ctaRows().block, E2, { [`${first}/${col}`]: value });
      const test = evaluateSheetMeasurements(block, ctaDefinition()).find((one) => one.testKey === E2)!;
      const at = test.rows.findIndex((row) => row.row === first);
      return test.rows[at + 1]!.cells[col]!.unit;
    };
    expect(unitBelow(overRange('2', 'TΩ'))).toBe('MΩ');
    expect(unitBelow(measured('1.5', 'TΩ'))).toBe('TΩ');
  });
});

describe('e22g S4: over_range is a test cell\'s alone', () => {
  const f = opFactory();
  const issue = (path: string, value: unknown) => opValueIssue(f.op({ path, value: value as never }), parsePath(path)!);
  const BLOCK = '019966b0-e22a-7000-8000-0000000000b1';

  it('refuses it on a nameplate number and a measurement test value; the same numbers measured, and a test cell over range, pass', () => {
    expect(issue(`sheet/${BLOCK}/nameplate/tensao_nominal_at`, { raw: '13.8', unit: 'kV', state: 'over_range' })).toMatch(/over_range is a test cell's alone/);
    expect(issue(`sheet/${BLOCK}/test/cta_resistencia_contato/value/corrente_ensaio`, { raw: '100', unit: 'A', state: 'over_range' })).toMatch(/over_range is a test cell's alone/);
    expect(issue(`sheet/${BLOCK}/nameplate/tensao_nominal_at`, { raw: '13.8', unit: 'kV', state: 'measured' })).toBeNull();
    expect(issue(`sheet/${BLOCK}/test/cta_resistencia_contato/value/corrente_ensaio`, { raw: '100', unit: 'A', state: 'measured' })).toBeNull();
    expect(issue(`sheet/${BLOCK}/nameplate/fabricacao`, 'WEG')).toBeNull();
    expect(issue(sheetTestCellPath(BLOCK, 'isolacao', 0, 1), { raw: '2', unit: 'TΩ', state: 'over_range' })).toBeNull();
  });
});

describe('e22g S6 and Bruno\'s test base rev03 (8a to 8c): the accuracy classes', () => {
  const tc = getDefinition('v12', 'cabine_primaria', 'tc').nameplate.find((field) => field.key === 'exatidao')!;
  const tp = getDefinition('v12', 'cabine_primaria', 'tp').nameplate.find((field) => field.key === 'exatidao')!;

  it('a select whose options are bare numbers but whose key is not EXATIDÃO never reads through the class parser', () => {
    const fases = { key: 'numero_de_fases', options: ['1', '2', '3'] };
    expect(selectOptionFor(fases, '3F')).toBeNull();
    expect(selectOptionFor(fases, '2 polos')).toBeNull();
    expect(selectOptionFor(fases, '3')).toBe('3');
    // The same options on the EXATIDÃO key do.
    expect(selectOptionFor({ ...fases, key: 'exatidao' }, '3F')).toBe('3');
  });

  it('5P is judged at ± 1 %, 10P at ± 3 %, 3P at ± 3 %, 6P at ± 6 %; the measurement classes at the class', () => {
    expect(accuracyClassDeviation('5P')).toBe(1);
    expect(accuracyClassDeviation('10P')).toBe(3);
    expect(accuracyClassDeviation('3P')).toBe(3);
    expect(accuracyClassDeviation('6P')).toBe(6);
    expect(accuracyClassDeviation('3')).toBe(3);
    expect(accuracyClassDeviation('0,3')).toBe(0.3);
    expect(accuracyClassDeviation('1,2')).toBe(1.2);
    expect(accuracyClassDeviation(null)).toBeNull();
  });

  it('the TP offers 3P and 6P after its measurement classes; the TC keeps its six', () => {
    expect(tp.options).toEqual(['0,3', '0,6', '1,2', '3P', '6P']);
    expect(tc.options).toEqual(['0,3', '0,6', '1,2', '3', '5P', '10P']);
  });

  it('reads the old NBR notation and the IEC notation onto the select\'s options', () => {
    const read: [string, string | null][] = [
      ['0,6C25', '0,6'],
      ['0,3C12,5', '0,3'],
      ['10B100', '10P'],
      ['10A400', '10P'],
      ['5B200', '5P'],
      ['2,5B100', '2,5'],
      ['0,6A', '0,6'],
      ['25VA5P20', '5P'],
      ['15VA0,3', '0,3'],
      ['0,3P75', '0,3'],
      ['1,2P200', '1,2'],
      ['25VA 5P20', '5P'],
      ['12,5VA 0,3', '0,3'],
      ['12,5 VA 0,6', '0,6'],
      ['10P20', '10P'],
      ['5P10 15VA', '5P'],
      ['3P', '3P'],
      ['6P', '6P'],
      ['C25', null],
      ['25VA', null],
      ['', null],
    ];
    for (const [text, cls] of read) expect(parseAccuracyClass(text), text).toBe(cls);
    expect(selectOptionFor(tc, '25VA 5P20')).toBe('5P');
    expect(selectOptionFor(tc, '10B100')).toBe('10P');
    expect(selectOptionFor(tc, '12,5VA 0,3')).toBe('0,3');
    expect(selectOptionFor(tp, '0,3P75')).toBe('0,3');
    expect(selectOptionFor(tp, '25VA 3P')).toBe('3P');
    expect(selectOptionFor(tp, '6P')).toBe('6P');
    // A class one select does not offer stays out.
    expect(selectOptionFor(tp, '5P20')).toBeNull();
    expect(selectOptionFor(tc, '6P')).toBeNull();
  });
});

describe('e22g 8d: the transformer\'s high-voltage rows start from the plate\'s TENSÃO NOMINAL AT', () => {
  const definition = getDefinition('v12', 'cabine_primaria', 'transformador_forca');
  const test = definition.tests.find((one) => one.key === 'isolacao')!;
  const base = first(fresh(), 'transformador_forca');
  const at = (raw: string | null, unit = 'V') => (raw === null ? base : withPlate(base, { tensao_nominal_at: { raw, unit, state: 'measured' } }));
  const kvs = (block: BlockRow) => [0, 1, 2].map((row) => rowTestVoltage(block, test, row)!.kv);

  it('601 V to 5000 V: 2,5 kV; above 5000 V: 5 kV; the SECUNDÁRIO/MASSA row keeps 1 kV', () => {
    expect(kvs(at('601'))).toEqual(['2.5', '2.5', '1']);
    expect(kvs(at('2400'))).toEqual(['2.5', '2.5', '1']);
    expect(kvs(at('5000'))).toEqual(['2.5', '2.5', '1']);
    expect(kvs(at('5001'))).toEqual(['5', '5', '1']);
    expect(kvs(at('13.8', 'kV'))).toEqual(['5', '5', '1']);
    expect(rowTestVoltage(at('13.8', 'kV'), test, 0)!.source).toBe('default');
  });

  it('review loop: an AT rated 601 V to 1000 V starts at 2,5 kV with no notice; a voltage typed on it still warns', () => {
    const low = at('800');
    expect(kvs(low)).toEqual(['2.5', '2.5', '1']);
    expect(rowTestVoltage(low, test, 0)!.notice).toBeNull();
    expect(rowTestVoltage(low, test, 1)!.notice).toBeNull();
    const voltageCol = rowTestVoltage(base, test, 0)!.col;
    expect(rowTestVoltage(withCells(low, 'isolacao', { [`0/${voltageCol}`]: measured('2.5', 'kV') }), test, 0)!.notice).toBe('Tensão de ensaio acima do suportado pelo enrolamento Primário (800 V): use 0,5 ou 1 kV.');
  });

  it('a rating at most 600 V, empty or unreadable gives no default: the instrument\'s TENSÃO ENSAIO, else none, as before', () => {
    expect(ratingDefaultKv(at('600'), 'tensao_nominal_at')).toBeNull();
    expect(ratingDefaultKv(at(null), 'tensao_nominal_at')).toBeNull();
    expect(ratingDefaultKv(withPlate(base, { tensao_nominal_at: { raw: 'abc', unit: 'V', state: 'measured' } }), 'tensao_nominal_at')).toBeNull();
    expect(ratingDefaultKv(at('13.8', 'kV'), null)).toBeNull();
    expect(kvs(at(null))).toEqual([null, null, '1']);
    const megger = { instrument_id: '019966b0-e22a-7000-8000-0000000000c1', code: 'MEG', manufacturer: null, model: null, serial: null, cert_number: null, calibrated_at: null, valid_until: null, test_parameter: '10 kV' };
    const withMegger = (block: BlockRow): BlockRow => ({ ...block, sheet: { ...block.sheet, test: { ...block.sheet.test, isolacao: { ...(block.sheet.test.isolacao ?? { cells: {} }), instrument: cell(megger) } } } });
    expect(kvs(withMegger(at(null)))).toEqual(['10', '10', '1']);
    expect(kvs(withMegger(at('600')))).toEqual(['10', '10', '1']);
    // The plate wins over the megger once it is known; a typed row wins over both.
    expect(kvs(withMegger(at('13.8', 'kV')))).toEqual(['5', '5', '1']);
    const voltageCol = rowTestVoltage(base, test, 0)!.col;
    expect(kvs(withCells(withMegger(at('13.8', 'kV')), 'isolacao', { [`0/${voltageCol}`]: measured('10', 'kV') }))).toEqual(['10', '5', '1']);
  });
});

describe('e22g N2, N4, N5: the composed texts', () => {
  it('N2: an over-range contact reading out of criterion reads "acima de … (limite do instrumento)", never "de > …"', () => {
    const snapshot = fresh();
    const sec = first(snapshot, 'chave_seccionadora');
    const definition = findDefinition(sec.seed_version, sec.block_type)!;
    const [address] = cellAddressesOf(definition, 'resistencia_contato');
    const block = withCells(sec, 'resistencia_contato', { [`${address!.row}/${address!.col}`]: overRange('2000', 'µΩ') });
    const text = composeConclusion(block, definition, 'SEC-01').text;
    expect(text).toContain('resistência de contato máxima acima de 2.000 µΩ (limite do instrumento) em');
    expect(text).not.toContain('de > ');
  });

  it('N4: a sheet Não ensaiado for a defect is reprovada "por defeito no equipamento" in the summary, never "outro motivo"', () => {
    const snapshot = fresh();
    const tr = first(snapshot, 'transformador_forca');
    const notTested: BlockRow = { ...tr, not_tested: { reason: 'defeito_no_equipamento', text: null, at: '2026-11-07T12:00:00.000Z', by: TEST_USER } };
    const text = composeParecer(withBlock(snapshot, notTested)).text;
    expect(text).toMatch(/1 ficha foi reprovada por defeito no equipamento \(/);
    expect(text).not.toContain('outro motivo');
  });

  it('N5: the Inspeção de QGBT, a type with nothing to measure, never says "sem valores medidos registrados"; a Quadro elétrico still does', () => {
    const inspection = getDefinition('v12', 'cabine_primaria', 'inspecao_qgbt');
    expect(inspection.tests).toEqual([]);
    const block = { ...first(fresh(), 'transformador_forca'), block_type: 'inspecao_qgbt', sheet: { ...first(fresh(), 'transformador_forca').sheet, test: {}, checklist: { [inspection.checklist![0]!.key]: { result: cell('NC') } } } } as BlockRow;
    const text = composeConclusion(block, inspection, 'QGBT-C17').text;
    expect(text).toContain('(item 1, NC)');
    expect(text).not.toContain('sem valores medidos registrados');
    const quadro = getDefinition('v12', 'cabine_primaria', 'quadro_eletrico');
    const board = { ...block, block_type: 'quadro_eletrico', sheet: { ...block.sheet, checklist: { [quadro.checklist![0]!.key]: { result: cell('NC') } } } } as BlockRow;
    expect(composeConclusion(board, quadro, 'QD-C17').text).toContain('sem valores medidos registrados');
  });
});

describe('e22g N3 and N7', () => {
  it('N3: the Inspeção de QGBT prints its own title, INSPEÇÃO DE QGBT', () => {
    expect(getDefinition('v12', 'cabine_primaria', 'inspecao_qgbt').print_title).toBe('INSPEÇÃO DE QGBT');
    expect(getDefinition('v12', 'cabine_primaria', 'quadro_eletrico').print_title).toBe("QGBT/QD's");
    const snapshot = fresh();
    const tr = first(snapshot, 'transformador_forca');
    const inspection: BlockRow = { ...tr, block_type: 'inspecao_qgbt', sheet: { ...tr.sheet, test: {} } };
    const titles = section9Layout(withBlock(snapshot, inspection), 9, 'RELATÓRIOS DOS ENSAIOS')!
      .subsections.flatMap((s) => s.sheets)
      .map((sheet) => sheet.title);
    expect(titles.some((title) => title.startsWith('INSPEÇÃO DE QGBT '))).toBe(true);
  });

  it('N7: the transformer\'s two PRIMÁRIO rows are named apart; a label no other row repeats is unchanged', () => {
    const definition = getDefinition('v12', 'cabine_primaria', 'transformador_forca');
    const rows = sheetReadings(first(fresh(), 'transformador_forca'), definition).find((test) => test.testKey === 'isolacao')!.tables[0]!.rows;
    expect(rows.map((row) => readingRowLabel(rows, row))).toEqual(['Primário/Massa', 'Primário/Secundário', 'Secundário']);
    const fases = [
      { label: 'Fase A', connection: ['Fase A', 'Massa'] },
      { label: 'Fase B', connection: ['Fase B', 'Massa'] },
    ];
    expect(fases.map((row) => readingRowLabel(fases, row))).toEqual(['Fase A', 'Fase B']);
    expect(readingRowLabel([{ label: '', connection: ['', ''] }], { label: '', connection: ['', ''] })).toBe('');
  });
});
