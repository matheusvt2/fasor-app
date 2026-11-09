import { describe, expect, it } from 'vitest';
import { companyTypes, BLOCK_1_ID } from '../../fixtures/company-types/op-log.ts';
import { conflictValueText } from '../merge/conflicts.ts';
import { replay } from '../ops/replay.ts';
import type { CriterionSeed } from '../seed/criteria.ts';
import type { TestDef } from '../seed/schema.ts';
import { applyOp, entityKey, SeedPathError, type EntityState } from '../ops/apply.ts';
import { sheetTestPath } from '../ops/path.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { opFactory, TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import { duplicateSeededType } from '../types/duplicate.ts';
import { removeDraftEntry } from '../types/draft-edit.ts';
import { validateTypeDraft } from '../types/validate.ts';
import { conclusionFloor } from './conclusion.ts';
import { parseMeasurementReadingPtBr } from './measurement-evaluation.ts';
import {
  CRITERION_PER_ROW_TEXT,
  evaluateSheetReadings,
  evaluateTest,
  instrumentLimitNoteText,
  manufacturerApplies,
  manufacturerCriterion,
  MANUFACTURER_NOT_APPLICABLE_REFUSAL,
  MANUFACTURER_SOURCE_LINE,
  MANUFACTURER_VALUE_REFUSAL,
  manufacturerRefusal,
  manufacturerUnitRefusal,
  manufacturerValueView,
  parseManufacturerValue,
  polarizationNotApplicable,
  rowCriterion,
  worstReadings,
  type TestEvaluation,
} from './readings.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * Batch e23a (Stories 23.2 to 23.4, seed v13): the kernel over v13 sheets built by hand, one test per
 * row of the spec's I/O matrix: the NETA tables at their bounds, the fallbacks, each type, the
 * manufacturer's value on each grammar and its refusals, the instrument-limit rule and its note; and
 * the same sheets on v12, which read as before.
 */

const id = (n: number) => `019966b0-0230-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(50_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });
const overRange = (raw: string, unit: string) => ({ raw, unit, state: 'over_range' as const });

function sheet(type: EquipmentBlockType, seedVersion = 'v13'): BlockRow {
  return newEquipmentBlock({
    definitions: EMPTY_DEFINITION_CONTEXT,
    blockId: id(1),
    equipmentId: id(2),
    relatorioId: TEST_RELATORIO,
    projectId: TEST_PROJECT,
    locationId: id(4),
    type,
    tag: 'T1',
    seedVersion,
    orderKey: 'a0',
  }).block;
}

const definitionOf = (block: BlockRow): BlockDefinition => getDefinition(block.seed_version, 'cabine_primaria', block.block_type);

function plate(block: BlockRow, values: Record<string, unknown>): BlockRow {
  for (const [key, value] of Object.entries(values)) block.sheet.nameplate[key] = cell(value);
  return block;
}

function readings(block: BlockRow, testKey: string, cells: Record<string, unknown>): BlockRow {
  const test = block.sheet.test[testKey] ?? { cells: {} };
  for (const [address, value] of Object.entries(cells)) {
    const [row, col] = address.split('/') as [string, string];
    test.cells[row] = { ...test.cells[row], [col]: cell(value) };
  }
  block.sheet.test[testKey] = test;
  return block;
}

function manufacturer(block: BlockRow, testKey: string, value: unknown): BlockRow {
  block.sheet.test[testKey] = { cells: {}, ...block.sheet.test[testKey], criterion_override: cell(value) };
  return block;
}

function evaluation(block: BlockRow, testKey: string): TestEvaluation {
  const definition = definitionOf(block);
  return evaluateTest(block, definition, definition.tests.find((test) => test.key === testKey)!);
}

const rowTexts = (test: TestEvaluation) => test.tables.flatMap((table) => table.rows.map((row) => row.criterionText));
const verdicts = (test: TestEvaluation) => test.tables.flatMap((table) => table.rows.map((row) => row.cells.find((c) => c.role === 'capture')!.verdict));

const transformer = (medium: string | null, at: unknown, bt: unknown, seedVersion = 'v13') =>
  plate(sheet('transformador_forca', seedVersion), { ...(medium === null ? {} : { tipo_de_isolacao: medium }), ...(at === null ? {} : { tensao_nominal_at: at }), ...(bt === null ? {} : { tensao_nominal_bt: bt }) });

describe('23.2-UNIT Table 100.5 on the transformador de força (by winding, by medium)', () => {
  it('a dry unit (EPÓXI) at 13,8 kV / 380 V: AT rows ≥ 25.000 MΩ, BT row ≥ 500 MΩ, each helper naming the table, its edition and the column', () => {
    const test = evaluation(transformer('EPÓXI', measured('13.8', 'kV'), measured('380', 'V')), 'isolacao');
    expect(rowTexts(test)).toEqual(['≥ 25.000 MΩ', '≥ 25.000 MΩ', '≥ 500 MΩ']);
    const helpers = test.tables[0]!.rows.map((row) => row.criterionHelper);
    expect(helpers).toEqual([
      'Tabela 100.5 (ANSI/NETA MTS-2023), seco, 13,8 kV: ≥ 25.000 MΩ',
      'Tabela 100.5 (ANSI/NETA MTS-2023), seco, 13,8 kV: ≥ 25.000 MΩ',
      'Tabela 100.5 (ANSI/NETA MTS-2023), seco, 380 V: ≥ 500 MΩ',
    ]);
    expect(test.perRow).toBe(true);
    expect(test.criterionText).toBe(CRITERION_PER_ROW_TEXT);
    expect(test.criterion).toMatchObject({ operator: '>=', value: 25000, unit: 'MΩ', source: { name: 'ANSI/NETA MTS-2023, Tabela 100.5', edition: '2023' } });
    expect(test.sourceLines).toEqual([helpers[0], helpers[2]]);
  });

  it('Á SECO is dry too; ÓLEO MINERAL takes the oil column (5.000 and 100), and a copied ÓLEO reads as ÓLEO MINERAL', () => {
    expect(rowTexts(evaluation(transformer('Á SECO', measured('13.8', 'kV'), measured('380', 'V')), 'isolacao'))).toEqual(['≥ 25.000 MΩ', '≥ 25.000 MΩ', '≥ 500 MΩ']);
    const oil = evaluation(transformer('ÓLEO MINERAL', measured('13.8', 'kV'), measured('380', 'V')), 'isolacao');
    expect(rowTexts(oil)).toEqual(['≥ 5.000 MΩ', '≥ 5.000 MΩ', '≥ 100 MΩ']);
    expect(oil.tables[0]!.rows[2]!.criterionHelper).toBe('Tabela 100.5 (ANSI/NETA MTS-2023), óleo, 380 V: ≥ 100 MΩ');
    expect(rowTexts(evaluation(transformer('ÓLEO', measured('13.8', 'kV'), measured('380', 'V')), 'isolacao'))).toEqual(['≥ 5.000 MΩ', '≥ 5.000 MΩ', '≥ 100 MΩ']);
  });

  it('bounds: 5000 V takes the 5000 row and 5001 V the next; 600 V the 600 row and 601 V the next', () => {
    expect(rowTexts(evaluation(transformer('EPÓXI', measured('5', 'kV'), measured('600', 'V')), 'isolacao'))).toEqual(['≥ 5.000 MΩ', '≥ 5.000 MΩ', '≥ 500 MΩ']);
    expect(rowTexts(evaluation(transformer('EPÓXI', measured('5.001', 'kV'), measured('601', 'V')), 'isolacao'))).toEqual(['≥ 25.000 MΩ', '≥ 25.000 MΩ', '≥ 5.000 MΩ']);
    // A two-level secondary reads its higher side.
    expect(rowTexts(evaluation(transformer('EPÓXI', measured('13.8', 'kV'), measured('380/220', 'V')), 'isolacao'))[2]).toBe('≥ 500 MΩ');
  });

  it('a missing or unreadable rating keeps the v12 criterion on its rows, the helper asking for it', () => {
    for (const at of [null, measured('', 'kV'), measured('0', 'kV'), measured('-13.8', 'kV')]) {
      const test = evaluation(transformer('EPÓXI', at, measured('380', 'V')), 'isolacao');
      expect(rowTexts(test)).toEqual(['>400 MΩ', '>400 MΩ', '≥ 500 MΩ']);
      expect(test.tables[0]!.rows[0]!.criterionHelper).toBe('Sem a tensão nominal na placa, vale >400 MΩ. Informe-a para julgar pela Tabela 100.5.');
      expect(test.tables[0]!.rows[0]!.criterion).toMatchObject({ operator: '>', value: 400, source: { name: 'aceitável na ficha' } });
    }
  });

  it('a missing TIPO DE ISOLAÇÃO keeps the v12 criterion on every row, the helper asking for it', () => {
    const test = evaluation(transformer(null, measured('13.8', 'kV'), measured('380', 'V')), 'isolacao');
    expect(rowTexts(test)).toEqual(['>400 MΩ', '>400 MΩ', '>400 MΩ']);
    expect(test.perRow).toBeUndefined();
    expect(test.criterionText).toBe('>400 MΩ');
    expect(test.sourceLines).toEqual(['Sem o tipo de isolação na placa, vale >400 MΩ. Informe-o para julgar pela Tabela 100.5.']);
  });

  it('judges each row by its own minimum: 30 GΩ within AT, 400 MΩ out of BT; the worst reading is the BT one, named by its criterion', () => {
    const block = readings(transformer('EPÓXI', measured('13.8', 'kV'), measured('380', 'V')), 'isolacao', { '0/1': measured('30', 'GΩ'), '1/1': measured('26', 'GΩ'), '2/1': measured('400', 'MΩ') });
    const test = evaluation(block, 'isolacao');
    expect(verdicts(test)).toEqual(['within', 'within', 'out']);
    expect(test.tables[0]!.rows[2]!.cells[0]!.helperText).toBe('Abaixo do aceitável (≥ 500 MΩ)');
    const worst = worstReadings(evaluateSheetReadings(block, definitionOf(block))).find((reading) => reading.testKey === 'isolacao')!;
    expect(worst).toMatchObject({ valueText: '400 MΩ', verdict: 'out', criterionText: '≥ 500 MΩ', sourceName: 'ANSI/NETA MTS-2023, Tabela 100.5' });
    expect(conclusionFloor(block)?.pair).toEqual({ result: 'reprovado', restriction: 'com_restricoes' });
  });

  it('with every row within, the worst is the one closest to its own minimum, not the lowest number', () => {
    const block = readings(transformer('EPÓXI', measured('13.8', 'kV'), measured('380', 'V')), 'isolacao', { '0/1': measured('26', 'GΩ'), '1/1': measured('40', 'GΩ'), '2/1': measured('5', 'GΩ') });
    const worst = worstReadings(evaluateSheetReadings(block, definitionOf(block))).find((reading) => reading.testKey === 'isolacao')!;
    expect(worst).toMatchObject({ valueText: '26 GΩ', verdict: 'within', criterionText: '≥ 25.000 MΩ' });
  });

  it('the same plate on a v12 sheet reads as v12 did: one criterion, no per-row keys, no note', () => {
    const block = readings(transformer('EPÓXI', measured('13.8', 'kV'), measured('380', 'V'), 'v12'), 'isolacao', { '2/1': measured('450', 'MΩ') });
    const test = evaluation(block, 'isolacao');
    expect(test.criterionText).toBe('>400 MΩ');
    expect(test.sourceName).toBe('aceitável na ficha');
    expect('perRow' in test || 'sourceLines' in test || 'limitNote' in test || 'manufacturer' in test).toBe(false);
    expect(test.tables[0]!.rows.every((row) => !('criterion' in row) && !('criterionText' in row))).toBe(true);
    expect(verdicts(test)[2]).toBe('within');
  });
});

describe('23.2-UNIT the TC, the disjuntor, the seccionadora, the para-raio; the TP and the cables as v12', () => {
  it('a v13 TC Á SECO at 13,8 kV: every row ≥ 25.000 MΩ by its primary voltage', () => {
    const test = evaluation(plate(sheet('tc'), { tipo_de_isolacao: 'Á SECO', tensao_nominal_at: measured('13.8', 'kV') }), 'isolacao');
    expect(rowTexts(test)).toEqual(['≥ 25.000 MΩ', '≥ 25.000 MΩ', '≥ 25.000 MΩ']);
    expect(test.perRow).toBeUndefined();
    expect(test.criterionText).toBe('≥ 25.000 MΩ');
    expect(test.sourceName).toBe('ANSI/NETA MTS-2023, Tabela 100.5');
  });

  it.each([
    ['15', '≥ 5.000 MΩ'],
    ['15,001', '≥ 10.000 MΩ'],
    ['24,2', '≥ 10.000 MΩ'],
    ['36,2', '≥ 100.000 MΩ'],
    ['1', '≥ 100 MΩ'],
    ['1,001', '≥ 500 MΩ'],
  ])('a v13 disjuntor of class %s kV: every row by Table 100.1 (%s)', (kv, text) => {
    const test = evaluation(plate(sheet('disjuntor_mt'), { tensao_nominal: kv }), 'isolacao');
    expect(new Set(rowTexts(test))).toEqual(new Set([text]));
    expect(test.criterionText).toBe(text);
    expect(test.tables[0]!.rows[0]!.criterionHelper).toBe(`Tabela 100.1 (ANSI/NETA MTS-2023), ${kv.replace(/^1$/, '1')} kV: ${text}`);
  });

  it('the seccionadora reads TENSÃO DE PLACA and the para-raio TENSÃO NOMINAL; with none, the v12 criterion and the request', () => {
    expect(evaluation(plate(sheet('chave_seccionadora'), { tensao_de_placa: '15' }), 'isolacao').criterionText).toBe('≥ 5.000 MΩ');
    expect(evaluation(plate(sheet('para_raio'), { tensao_nominal: '24,2' }), 'isolacao').criterionText).toBe('≥ 10.000 MΩ');
    const bare = evaluation(sheet('para_raio'), 'isolacao');
    expect(bare.criterionText).toBe('>400 MΩ');
    expect(bare.sourceLines).toEqual(['Sem a tensão nominal na placa, vale >400 MΩ. Informe-a para julgar pela Tabela 100.1.']);
  });

  it('a v13 TP and the cables keep > 400 MΩ with no per-row keys; the QGBT keeps its bands', () => {
    for (const type of ['tp', 'cabos_entrada', 'cabos_saida'] as const) {
      const test = evaluation(plate(sheet(type), type === 'tp' ? { tipo_de_isolacao: 'EPÓXI', tensao_nominal_at: measured('13.8', 'kV') } : {}), 'isolacao');
      expect(test.criterionText, type).toBe('>400 MΩ');
      expect(test.tables[0]!.rows.every((row) => !('criterion' in row)), type).toBe(true);
      expect(test.limitNote, type).toBeNull();
    }
    const qgbt = evaluation(plate(sheet('quadro_eletrico'), { tensao_nominal: measured('220', 'V') }), 'isolacao');
    expect(qgbt.criterion).toMatchObject({ value: 0.5, unit: 'MΩ' });
    expect('limitNote' in qgbt).toBe(false);
  });
});

describe('23.3-UNIT the manufacturer\'s value prevails on every row of its test', () => {
  it('a v13 disjuntor contact at 80 µΩ: every row < 80 µΩ, source Fabricante; clearing it brings < 250 µΩ back', () => {
    const base = readings(plate(sheet('disjuntor_mt'), { tensao_nominal: '15' }), 'resistencia_contato', { '0/0': measured('100', 'µΩ'), '1/0': measured('70', 'µΩ'), '2/0': measured('79', 'µΩ') });
    const set = evaluation(manufacturer(structuredClone(base), 'resistencia_contato', { raw: '80', unit: 'µΩ' }), 'resistencia_contato');
    expect(set.criterionText).toBe('<80 µΩ');
    expect(set.sourceName).toBe('Fabricante');
    expect(set.manufacturer).toMatchObject({ value: { raw: '80', unit: 'µΩ' }, criterionText: '<80 µΩ' });
    expect(set.sourceLines).toEqual([MANUFACTURER_SOURCE_LINE]);
    expect(rowTexts(set)).toEqual(['<80 µΩ', '<80 µΩ', '<80 µΩ']);
    expect(verdicts(set)).toEqual(['out', 'within', 'within']);
    const cleared = evaluation(manufacturer(structuredClone(base), 'resistencia_contato', null), 'resistencia_contato');
    expect(cleared.criterionText).toBe('<250 µΩ');
    expect(verdicts(cleared)).toEqual(['within', 'within', 'within']);
    expect('manufacturer' in cleared).toBe(false);
  });

  it('on a dry transformer 5 GΩ replaces every row\'s minimum; the table\'s show beside it as the reminder', () => {
    const block = manufacturer(readings(transformer('EPÓXI', measured('13.8', 'kV'), measured('380', 'V')), 'isolacao', { '0/1': measured('6', 'GΩ'), '2/1': measured('4', 'GΩ') }), 'isolacao', { raw: '5', unit: 'GΩ' });
    const test = evaluation(block, 'isolacao');
    expect(rowTexts(test)).toEqual(['≥ 5 GΩ', '≥ 5 GΩ', '≥ 5 GΩ']);
    expect(test.criterionText).toBe('≥ 5 GΩ');
    expect(test.perRow).toBeUndefined();
    expect(verdicts(test)).toEqual(['within', null, 'out']);
    expect(test.sourceLines![0]).toBe(MANUFACTURER_SOURCE_LINE);
    expect(test.sourceLines).toContain('Tabela 100.5 (ANSI/NETA MTS-2023), seco, 13,8 kV: ≥ 25.000 MΩ');
    const definition = definitionOf(block);
    const view = manufacturerValueView(block, definition, definition.tests.find((t) => t.key === 'isolacao')!)!;
    expect(view).toMatchObject({ operator: '≥', value: { raw: '5', unit: 'GΩ' }, text: '5', unit: 'GΩ', units: ['MΩ', 'GΩ', 'TΩ'] });
    expect(view.note).toEqual({ lead: 'Prevalece sobre a tabela, que pede ', criterion: '≥ 25.000 MΩ e ≥ 500 MΩ', tail: '.' });
  });

  it('the ratio test takes ± its value; the QGBT band test its band\'s operator, even with no band for the plate', () => {
    const tp = evaluation(manufacturer(sheet('tp'), 'relacao_transformacao', { raw: '1', unit: '%' }), 'relacao_transformacao');
    expect(tp.criterionText).toBe('±1 %');
    expect(tp.criterion).toMatchObject({ operator: '±', value: 1, source: { name: 'Fabricante' } });
    const qgbt = evaluation(manufacturer(sheet('quadro_eletrico'), 'isolacao', { raw: '2', unit: 'MΩ' }), 'isolacao');
    expect(qgbt.criterion).toMatchObject({ operator: '>=', value: 2, unit: 'MΩ', source: { name: 'Fabricante' } });
  });

  it('the entry\'s note says what holds while it is empty, on a plain test and on a table test', () => {
    const disjuntor = plate(sheet('disjuntor_mt'), { tensao_nominal: '15' });
    const definition = definitionOf(disjuntor);
    const contact = manufacturerValueView(disjuntor, definition, definition.tests.find((t) => t.key === 'resistencia_contato')!)!;
    expect(contact).toMatchObject({ operator: '<', value: null, text: '', unit: 'µΩ', units: ['µΩ'] });
    expect(contact.note).toEqual({ lead: 'Opcional. Vazio, vale ', criterion: '<250 µΩ', tail: ', o critério do ensaio.' });
    const insulation = manufacturerValueView(disjuntor, definition, definition.tests.find((t) => t.key === 'isolacao')!)!;
    expect(insulation.note).toEqual({ lead: 'Opcional. Vazio, vale a tabela (', criterion: '≥ 5.000 MΩ', tail: ').' });
    const set = manufacturerValueView(manufacturer(structuredClone(disjuntor), 'resistencia_contato', { raw: '80', unit: 'µΩ' }), definition, definition.tests.find((t) => t.key === 'resistencia_contato')!)!;
    expect(set.note).toEqual({ lead: 'Prevalece sobre o critério do ensaio, ', criterion: '<250 µΩ', tail: '.' });
  });

  it('parses what the entry types the pt-BR way, and refuses a negative, a zero, no number or a unit the criterion cannot take', () => {
    const definition = getDefinition('v13', 'cabine_primaria', 'disjuntor_mt');
    const contact = definition.tests.find((t) => t.key === 'resistencia_contato')!;
    const insulation = definition.tests.find((t) => t.key === 'isolacao')!;
    expect(parseManufacturerValue(contact, '80', 'µΩ')).toEqual({ value: { raw: '80', unit: 'µΩ' } });
    expect(parseManufacturerValue(contact, '82,5', 'µΩ')).toEqual({ value: { raw: '82.5', unit: 'µΩ' } });
    expect(parseManufacturerValue(insulation, '5G', 'MΩ')).toEqual({ value: { raw: '5', unit: 'GΩ' } });
    expect(parseManufacturerValue(contact, '  ', 'µΩ')).toEqual({ value: null });
    for (const typed of ['-3', '0', 'abc', '0,0']) expect(parseManufacturerValue(contact, typed, 'µΩ'), typed).toEqual({ refusal: MANUFACTURER_VALUE_REFUSAL });
    expect(parseManufacturerValue(contact, '80', 'V')).toEqual({ refusal: manufacturerUnitRefusal('V') });
    expect(manufacturerRefusal(contact, null)).toBeNull();
    expect(manufacturerRefusal(contact, { raw: '80', unit: 'mΩ' })).toBeNull();
    expect(manufacturerRefusal(contact, { raw: '80', unit: 'V' })).toBe('Unidade incompatível com o critério (V).');
    for (const bad of [{ raw: '-3', unit: 'µΩ' }, { raw: '0', unit: 'µΩ' }, { raw: 'abc', unit: 'µΩ' }, { unit: 'µΩ' }, 80, '80', [80]]) {
      expect(manufacturerRefusal(contact, bad), JSON.stringify(bad)).toBe(MANUFACTURER_VALUE_REFUSAL);
    }
  });

  it('rowCriterion names its kind: manufacturer, table, fallback, test', () => {
    const block = transformer('EPÓXI', null, measured('380', 'V'));
    const definition = definitionOf(block);
    const iso = definition.tests.find((t) => t.key === 'isolacao')!;
    expect([0, 2].map((row) => rowCriterion(block, definition, iso, row).kind)).toEqual(['fallback', 'table']);
    expect(rowCriterion(block, definition, definition.tests.find((t) => t.key === 'relacao_transformacao')!, 0).kind).toBe('test');
    expect(rowCriterion(manufacturer(block, 'isolacao', { raw: '1', unit: 'GΩ' }), definition, iso, 0)).toMatchObject({ kind: 'manufacturer', helper: MANUFACTURER_SOURCE_LINE });
  });
});

describe('23.3-UNIT the fold refuses a malformed manufacturer\'s value on a v13 sheet (contract 34)', () => {
  const f = opFactory();
  const stateWith = (block: BlockRow): EntityState => new Map([[entityKey('block', block.id), block]]);
  const put = (block: BlockRow, value: unknown) => f.op({ path: sheetTestPath(block.id, 'resistencia_contato', 'criterion_override'), value: value as never });
  const stored = (state: EntityState, block: BlockRow) => (state.get(entityKey('block', block.id)) as BlockRow).sheet.test.resistencia_contato?.criterion_override?.value;

  it('stores a well-formed value and a null clear', () => {
    const block = sheet('disjuntor_mt');
    const set = put(block, { raw: '80', unit: 'µΩ' });
    let state = applyOp(stateWith(block), set);
    expect(stored(state, block)).toEqual({ raw: '80', unit: 'µΩ' });
    state = applyOp(state, f.op({ path: sheetTestPath(block.id, 'resistencia_contato', 'criterion_override'), value: null, prev_op_id: set.op_id }));
    expect(stored(state, block)).toBeNull();
  });

  it.each([
    ['a negative', { raw: '-3', unit: 'µΩ' }],
    ['a zero', { raw: '0', unit: 'µΩ' }],
    ['no number', { raw: 'abc', unit: 'µΩ' }],
    ['a unit the criterion cannot take', { raw: '80', unit: 'V' }],
    ['a bare number', 80],
  ])('refuses %s as SeedPathError and stores nothing', (_name, value) => {
    const block = sheet('disjuntor_mt');
    expect(() => applyOp(stateWith(block), put(block, value))).toThrow(SeedPathError);
  });

  it('a v12 (or older) sheet folds any value as before: replay safety', () => {
    const block = sheet('disjuntor_mt', 'v12');
    const state = applyOp(stateWith(block), put(block, { raw: '-3', unit: 'µΩ' }));
    expect(stored(state, block)).toEqual({ raw: '-3', unit: 'µΩ' });
    // ...and the readers ignore it, as they always did.
    expect(evaluation(state.get(entityKey('block', block.id)) as BlockRow, 'resistencia_contato').criterionText).toBe('<250 µΩ');
  });

  it('the Conflict view reads both sides as criterion texts', () => {
    const block = sheet('disjuntor_mt');
    const path = { path: sheetTestPath(block.id, 'resistencia_contato', 'criterion_override') };
    expect(conflictValueText(path, { raw: '80', unit: 'µΩ' }, block, EMPTY_DEFINITION_CONTEXT)).toBe('<80 µΩ');
    expect(conflictValueText(path, { raw: '120', unit: 'µΩ' }, block, EMPTY_DEFINITION_CONTEXT)).toBe('<120 µΩ');
    const iso = { path: sheetTestPath(block.id, 'isolacao', 'criterion_override') };
    expect(conflictValueText(iso, { raw: '5', unit: 'GΩ' }, block, EMPTY_DEFINITION_CONTEXT)).toBe('≥ 5 GΩ');
  });
});

describe('23.4-UNIT a reading above the instrument\'s limit under the table criteria', () => {
  // DESLOCAMENTO ANGULAR set, so the ratio table waits for no vector group (e21g D6) and the floor can read Sem restrições.
  const atLimit = (medium: string, value: object) => readings(plate(transformer(medium, measured('13.8', 'kV'), measured('380', 'V')), { ligacao_secundaria: 'Dyn1' }), 'isolacao', { '0/1': value });

  it('a dry AT row (≥ 25.000 MΩ) with a 2 TΩ limit: within, the note under the table, its POLARIZAÇÃO N/A, the floor Sem restrições', () => {
    const block = atLimit('EPÓXI', overRange('2', 'TΩ'));
    const test = evaluation(block, 'isolacao');
    expect(verdicts(test)[0]).toBe('within');
    expect(test.limitNote).toBe('Valores de resistência de isolamento superiores a 2 TΩ, limite de leitura do instrumento.');
    expect(instrumentLimitNoteText('2000', 'GΩ')).toBe('Valores de resistência de isolamento superiores a 2.000 GΩ, limite de leitura do instrumento.');
    const definition = definitionOf(block);
    const iso = definition.tests.find((t) => t.key === 'isolacao')!;
    expect(test.tables[0]!.rows.map((row) => polarizationNotApplicable(iso, row))).toEqual([true, false, false]);
    expect(conclusionFloor(block)?.pair).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
  });

  it('an oil AT row (≥ 5.000 MΩ): a limit equal to the criterion is within, one unit below it out (no note for that cell)', () => {
    const equal = evaluation(atLimit('ÓLEO MINERAL', overRange('5', 'GΩ')), 'isolacao');
    expect(verdicts(equal)[0]).toBe('within');
    expect(equal.limitNote).toBe('Valores de resistência de isolamento superiores a 5 GΩ, limite de leitura do instrumento.');
    const below = evaluation(atLimit('ÓLEO MINERAL', overRange('4999', 'MΩ')), 'isolacao');
    expect(verdicts(below)[0]).toBe('out');
    expect(below.limitNote).toBeNull();
    const oneGiga = evaluation(atLimit('ÓLEO MINERAL', overRange('1', 'GΩ')), 'isolacao');
    expect(verdicts(oneGiga)[0]).toBe('out');
    expect(oneGiga.limitNote).toBeNull();
  });

  it('"OL" with no instrument limit is refused at input (nothing to store)', () => {
    const test = evaluation(transformer('EPÓXI', measured('13.8', 'kV'), measured('380', 'V')), 'isolacao');
    const target = test.tables[0]!.rows[0]!.cells[0]!;
    expect(parseMeasurementReadingPtBr('OL', target, 'MΩ', null)).toBe('invalid');
    expect(parseMeasurementReadingPtBr('OL', target, 'MΩ', { raw: '2', unit: 'TΩ' })).toEqual({ raw: '2', unit: 'TΩ', state: 'over_range' });
  });

  it('a v12 sheet has no note and no N/A: the rule of PR #268 alone', () => {
    const block = readings(transformer('EPÓXI', measured('13.8', 'kV'), measured('380', 'V'), 'v12'), 'isolacao', { '0/1': overRange('2', 'TΩ') });
    const test = evaluation(block, 'isolacao');
    expect(verdicts(test)[0]).toBe('within');
    expect('limitNote' in test).toBe(false);
    const iso = definitionOf(block).tests.find((t) => t.key === 'isolacao')!;
    expect(polarizationNotApplicable(iso, test.tables[0]!.rows[0]!)).toBe(false);
  });
});

describe('23.2-UNIT a company copy carries the v13 keys', () => {
  it('"Duplicar" on a v13 type carries criterion_table and instrument_limit_note; removing the field the table reads drops it', () => {
    const copy = duplicateSeededType('v13', 'disjuntor_mt');
    const iso = copy.draft.tests.find((test) => test.key === 'isolacao')!;
    expect(iso.criterion_table?.table.name).toBe('Tabela 100.1');
    expect(iso.instrument_limit_note).toBe(true);
    expect(validateTypeDraft(copy.draft)).toEqual([]);
    const at = copy.draft.nameplate.findIndex((field) => field.key === 'tensao_nominal');
    const removed = removeDraftEntry(copy.draft, 'nameplate', at) as unknown as { tests: { key: string; criterion_table?: unknown; instrument_limit_note?: true }[] };
    const after = removed.tests.find((test) => test.key === 'isolacao')!;
    expect(after.criterion_table).toBeUndefined();
    expect(after.instrument_limit_note).toBe(true);
  });

  it('removing the oil rule\'s field drops a table read by the medium; a draft naming a field that is not a voltage says so in pt-BR', () => {
    const copy = duplicateSeededType('v13', 'transformador_forca');
    const at = copy.draft.nameplate.findIndex((field) => field.key === 'tipo_de_isolacao');
    const removed = removeDraftEntry(copy.draft, 'nameplate', at) as unknown as { tests: { key: string; criterion_table?: unknown }[] };
    expect(removed.tests.find((test) => test.key === 'isolacao')!.criterion_table).toBeUndefined();
    const disjuntor = duplicateSeededType('v13', 'disjuntor_mt').draft;
    const iso = disjuntor.tests.find((test) => test.key === 'isolacao')!;
    iso.criterion_table = { ...iso.criterion_table!, voltage: { field: 'corrente_nominal' } };
    const issues = validateTypeDraft(disjuntor);
    expect(issues.map((issue) => issue.message)).toContain(
      'ENSAIO DE ISOLAÇÃO: o critério da tabela NETA é escolhido pela tensão nominal da placa; mantenha esse campo como um número em V ou kV, ou uma classe de tensão.',
    );
  });
});

describe('e23a review fixes (E14-A5 boundary tests)', () => {
  const paraRaio = getDefinition('v13', 'cabine_primaria', 'para_raio');
  const companyTest = (criterion: Partial<CriterionSeed>): TestDef => ({
    ...structuredClone(paraRaio.tests[0]!),
    criterion_table: undefined,
    criterion: { key: 'isolacao', label: 'Isolação', operator: '>', value: 1, unit: 'MΩ', type: 'absolute_min', source: { name: 'Manual', edition: null }, usedBy: 'tipo', ...criterion },
  });
  const withOverride = (seedVersion: string, testKey: string, value: unknown) => manufacturer(sheet('para_raio', seedVersion), testKey, value);

  it('item 1: a company test judged "between" or "pass_fail" takes no manufacturer value: no view, refused, no criterion, value_max kept', () => {
    for (const criterion of [{ operator: 'between', value: 118, value_max: 132, unit: 'Vcc', type: 'deviation_between' as const }, { operator: 'pass_fail', value: 1, unit: null, type: 'pass_fail' as const }]) {
      const test = companyTest(criterion);
      expect(manufacturerApplies(test), criterion.operator).toBe(false);
      expect(manufacturerRefusal(test, { raw: '120', unit: 'Vcc' })).toBe(MANUFACTURER_NOT_APPLICABLE_REFUSAL);
      expect(manufacturerRefusal(test, null)).toBeNull();
      expect(parseManufacturerValue(test, '120', 'Vcc')).toEqual({ refusal: MANUFACTURER_NOT_APPLICABLE_REFUSAL });
      for (const version of ['v13', 'v12']) expect(manufacturerCriterion(withOverride(version, 'isolacao', { raw: '120', unit: 'Vcc' }), test), version).toBeNull();
      expect(manufacturerValueView(sheet('para_raio'), paraRaio, test)).toBeNull();
      expect(test.criterion!.value_max).toBe(criterion.operator === 'between' ? 132 : undefined);
    }
    expect(manufacturerApplies(companyTest({ operator: '<' }))).toBe(true);
  });

  it('item 3: the entry\'s sign is ≥ or ≤ for an inclusive operator, never ">=" or "<="', () => {
    const block = sheet('para_raio');
    expect(manufacturerValueView(block, paraRaio, companyTest({ operator: '>=' }))!.operator).toBe('≥');
    expect(manufacturerValueView(block, paraRaio, companyTest({ operator: '<=' }))!.operator).toBe('≤');
    expect(manufacturerValueView(block, paraRaio, companyTest({ operator: '>' }))!.operator).toBe('>');
    expect(manufacturerValueView(block, paraRaio, paraRaio.tests[0]!)!.operator).toBe('≥');
  });

  it('item 4: TIPO DE ISOLAÇÃO read through its options and aliases; a value that is no option falls back, never judged dry', () => {
    expect(rowTexts(evaluation(transformer('óleo mineral', measured('13.8', 'kV'), measured('380', 'V')), 'isolacao'))).toEqual(['≥ 5.000 MΩ', '≥ 5.000 MΩ', '≥ 100 MΩ']);
    expect(rowTexts(evaluation(transformer('epoxi', measured('13.8', 'kV'), measured('380', 'V')), 'isolacao'))).toEqual(['≥ 25.000 MΩ', '≥ 25.000 MΩ', '≥ 500 MΩ']);
    const unknown = evaluation(transformer('PAPEL', measured('13.8', 'kV'), measured('380', 'V')), 'isolacao');
    expect(rowTexts(unknown)).toEqual(['>400 MΩ', '>400 MΩ', '>400 MΩ']);
    expect(unknown.sourceLines).toEqual(['Sem o tipo de isolação na placa, vale >400 MΩ. Informe-o para julgar pela Tabela 100.5.']);
  });

  it('item 5: removing the windings until no row names one drops a table read by winding; one winding left keeps it', () => {
    const copy = duplicateSeededType('v13', 'transformador_forca').draft;
    const at = copy.nameplate.findIndex((field) => field.key === 'tensao_nominal_at');
    const once = removeDraftEntry(copy, 'nameplate', at) as unknown as typeof copy;
    expect(once.tests.find((test) => test.key === 'isolacao')!.criterion_table).toBeDefined();
    const bt = once.nameplate.findIndex((field) => field.key === 'tensao_nominal_bt');
    const twice = removeDraftEntry(once, 'nameplate', bt) as unknown as typeof copy;
    expect(twice.tests.find((test) => test.key === 'isolacao')!.criterion_table).toBeUndefined();
    expect(validateTypeDraft(twice)).toEqual([]);
  });

  it('item 6: a v12 sheet reads an override of "0" as E5-A4 did (accepted, every reading within); a v13 sheet ignores it', () => {
    const v12 = readings(withOverride('v12', 'isolacao', { raw: '0', unit: 'MΩ' }), 'isolacao', { '0/1': measured('100', 'MΩ') });
    const old = evaluation(v12, 'isolacao');
    expect(old.criterion).toMatchObject({ operator: '>', value: 0, unit: 'MΩ' });
    expect(verdicts(old)[0]).toBe('within');
    const v13 = readings(withOverride('v13', 'isolacao', { raw: '0', unit: 'MΩ' }), 'isolacao', { '0/1': measured('100', 'MΩ') });
    expect('manufacturer' in evaluation(v13, 'isolacao')).toBe(false);
    // A negative override stays ignored on v12, as before.
    expect(evaluation(withOverride('v12', 'isolacao', { raw: '-5', unit: 'MΩ' }), 'isolacao').criterionText).toBe('>400 MΩ');
  });

  it('item 7b: a malformed override on a v13 company block is refused by the fold; a well-formed one is stored', () => {
    const replayed = replay(companyTypes.log);
    const key = entityKey('block', BLOCK_1_ID);
    const block = { ...(replayed.get(key) as BlockRow), seed_version: 'v13' };
    const state: EntityState = new Map([...replayed.entries(), [key, block]]);
    const f = opFactory();
    const path = sheetTestPath(BLOCK_1_ID, 'isolacao', 'criterion_override');
    expect(() => applyOp(state, f.op({ relatorio_id: block.relatorio_id, path, value: { raw: '-3', unit: 'MΩ' } }))).toThrow(SeedPathError);
    expect(() => applyOp(state, f.op({ relatorio_id: block.relatorio_id, path, value: { raw: '5', unit: 'V' } }))).toThrow(SeedPathError);
    const next = applyOp(state, f.op({ relatorio_id: block.relatorio_id, path, value: { raw: '500', unit: 'MΩ' } }));
    expect((next.get(key) as BlockRow).sheet.test.isolacao?.criterion_override?.value).toEqual({ raw: '500', unit: 'MΩ' });
  });

  it('item 7d: with the contact judged by < 80 µΩ the worst reading of 70 and 79 µΩ is 79', () => {
    const block = manufacturer(readings(sheet('disjuntor_mt'), 'resistencia_contato', { '0/0': measured('70', 'µΩ'), '1/0': measured('79', 'µΩ') }), 'resistencia_contato', { raw: '80', unit: 'µΩ' });
    const worst = worstReadings(evaluateSheetReadings(block, definitionOf(block))).find((reading) => reading.testKey === 'resistencia_contato')!;
    expect(worst).toMatchObject({ valueText: '79 µΩ', verdict: 'within', criterionText: '<80 µΩ', sourceName: 'Fabricante' });
  });
});
