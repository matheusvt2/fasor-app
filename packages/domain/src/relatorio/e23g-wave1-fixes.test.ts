import { describe, expect, it } from 'vitest';
import { DEFINITION_1 } from '../../fixtures/company-types/op-log.ts';
import type { OcrReadResult, OcrToken } from '../contract/ocr.ts';
import { buildDisplaySuggestions, type BuildDisplaySuggestionsInput } from '../reading/display.ts';
import { displayCellTarget } from '../reading/target.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell, SuggestionRow } from '../schemas/entities.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition, SEED_VERSION } from '../seed/definitions.ts';
import type { FieldDef, TestDef } from '../seed/schema.ts';
import { TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import type { CompanyTypeDefinition } from '../types/definition.ts';
import { removeDraftEntry } from '../types/draft-edit.ts';
import { duplicateSeededType } from '../types/duplicate.ts';
import { validateTypeDraft } from '../types/validate.ts';
import { measurementConfirmAllCandidates, measurementTableVerifyCount } from './measurement-suggestions.ts';
import { evaluateSheetReadings, type EvaluatedRow } from './readings.ts';
import { sheetProgress } from './sheet-progress.ts';
import { isTapTable, tapRowOptional, tapTableLine, tapsLine, type EvaluatedTap } from './tap-rows.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * Fix batch e23g (the Epic 23 wave 1 integrated review, second pass, on 6be0a5ec): R2-1 "Ler visor"
 * on a v13 TTR's tap rows (the display kernel and "Confirmar todos" resolve rows through
 * `tapRowsOf`), R2-2 removing a nameplate field prunes the v13 keys naming it, R2-3 the group's
 * missing count takes only the required rows, R2-4 the tap line and the row predicates the TTR
 * reads are the kernel's. Sample values are invented (never Bruno's base).
 */

const id = (n: number) => `019966b0-0e23-7000-8000-${n.toString(16).padStart(12, '0')}`;
const OP = id(90_000);
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });
const TEST_KEY = 'relacao_transformacao';
const FIRST_CAPTURE = 3;

function sheet(type: EquipmentBlockType, seedVersion = 'v13', n = 1): BlockRow {
  return structuredClone(
    newEquipmentBlock({ definitions: EMPTY_DEFINITION_CONTEXT, blockId: id(n), equipmentId: id(100 + n), relatorioId: TEST_RELATORIO, projectId: TEST_PROJECT, locationId: id(999), type, tag: `T${n}`, seedVersion, orderKey: `a${n}` }).block,
  );
}

function withNameplate(block: BlockRow, values: Record<string, unknown>): BlockRow {
  for (const [key, value] of Object.entries(values)) block.sheet.nameplate[key] = cell(value);
  return block;
}

function withTest(block: BlockRow, cells: Record<string, unknown>): BlockRow {
  const test = block.sheet.test[TEST_KEY] ?? { cells: {} };
  for (const [address, value] of Object.entries(cells)) {
    const [row, col] = address.split('/') as [string, string];
    test.cells[row] = { ...test.cells[row], [col]: cell(value) };
  }
  block.sheet.test[TEST_KEY] = test;
  return block;
}

/** A v13 transformer with TAPS `taps` (kV), TAP ATUAL `atual` when given, no LIGAÇÃO SECUNDÁRIA unless `extra` says it. */
function transformer(taps = '13.8;13.2;12.6;12;11.4', atual: string | null = '12.6', extra: Record<string, unknown> = {}): BlockRow {
  return withNameplate(sheet('transformador_forca'), {
    taps: measured(taps, 'kV'),
    ...(atual === null ? {} : { tap_atual_kv: measured(atual, 'kV') }),
    tensao_nominal_at: measured('13.8', 'kV'),
    tensao_nominal_bt: measured('380', 'V'),
    ...extra,
  });
}

const V13 = getDefinition('v13', 'cabine_primaria', 'transformador_forca');
const TABLE_KEY = V13.tests.find((test) => test.key === TEST_KEY)!.tables[0]!.key;
const ratioRows = (block: BlockRow): EvaluatedRow[] => evaluateSheetReadings(block, V13).find((test) => test.testKey === TEST_KEY)!.tables[0]!.rows;

// --- the display reading -------------------------------------------------------------------------

type Box = [number, number, number, number];
const tok = (i: number, text: string, bbox: Box, confidence = 0.95): OcrToken => ({ id: `t${i}`, text, bbox, confidence });
const read = (tokens: OcrToken[]): OcrReadResult => ({ image: { width: 1200, height: 900 }, tokens, preprocessing_applied: false });
/** The ratio meter's recorded read (`display-ttr.jpg`): one value, 34.512, no unit. */
const TTR = [tok(0, 'MODELOSINTETICO', [80, 64, 379, 91]), tok(1, '12/03/2026', [122, 194, 725, 294]), tok(2, 'RATIO=34.512', [121, 303, 956, 395], 0.9364)];
/** `n` values, one per row of the display, no unit. */
const values = (...raws: string[]) => raws.map((raw, i) => tok(i, raw, [100, 100 + i * 60, 400, 140 + i * 60]));

let next = 1000;
function build(block: BlockRow, tokens: OcrToken[], start: { row: number; col?: number }, overrides: Partial<BuildDisplaySuggestionsInput> = {}) {
  return buildDisplaySuggestions({
    relatorioId: TEST_RELATORIO,
    photoId: id(2),
    runId: id(3),
    target: displayCellTarget(block.id, block.block_type, TEST_KEY, { row: start.row, col: start.col ?? FIRST_CAPTURE }),
    block,
    location: null,
    ocr: read(tokens),
    image: { width: 1200, height: 900 },
    newId: () => id(next++),
    ...overrides,
  });
}
const unitOf = (row: SuggestionRow) => (row.value as { unit: string | null }).unit;
const path = (block: BlockRow, row: number, col = FIRST_CAPTURE) => `sheet/${block.id}/test/${TEST_KEY}/cell/${row}/${col}`;

describe('e23g R2-1: "Ler visor" on a v13 TTR lands on the tap rows', () => {
  it('one value on tap row 13800: one pending fill there', () => {
    const block = transformer();
    const { rows, dropped } = build(block, TTR, { row: 13800 });
    expect(dropped).toEqual([]);
    expect(rows.map((row) => [row.target_path, row.mode, row.status, row.value])).toEqual([[path(block, 13800), 'fill', 'pending', measured('34.512', null)]]);
  });

  it('values past a row walk the captures in table order (plate order), and past the last tap row are no_cell', () => {
    const block = transformer();
    const four = build(block, values('1', '2', '3', '4'), { row: 13200, col: 4 });
    expect(four.rows.map((row) => row.target_path)).toEqual([path(block, 13200, 4), path(block, 13200, 5), path(block, 12600, 3), path(block, 12600, 4)]);
    const late = build(block, values('1', '2', '3', '4', '5'), { row: 11400, col: 4 });
    expect(late.rows.map((row) => row.target_path)).toEqual([path(block, 11400, 4), path(block, 11400, 5)]);
    expect(late.dropped.map((drop) => drop.reason)).toEqual(['no_cell', 'no_cell', 'no_cell']);
  });

  it('the walk follows the plate order whether it ascends or descends', () => {
    const ascending = transformer('11.4;12;12.6', null);
    expect(build(ascending, values('1', '2', '3', '4'), { row: 11400 }).rows.map((row) => row.target_path)).toEqual([
      path(ascending, 11400, 3),
      path(ascending, 11400, 4),
      path(ascending, 11400, 5),
      path(ascending, 12000, 3),
    ]);
    const descending = transformer('13.8;13.2', null);
    expect(build(descending, values('1', '2', '3', '4'), { row: 13800, col: 5 }).rows.map((row) => row.target_path)).toEqual([path(descending, 13800, 5), path(descending, 13200, 3), path(descending, 13200, 4), path(descending, 13200, 5)]);
  });

  it('a start row the plate does not list, or a row off the plate, drops every value as no_cell', () => {
    const block = transformer();
    for (const row of [12345, 0]) {
      const built = build(block, values('1', '2'), { row });
      expect(built.rows, String(row)).toEqual([]);
      expect(built.dropped.map((drop) => drop.reason)).toEqual(['no_cell', 'no_cell']);
    }
    // 12,6 kV left TAPS after its reading: its row is off the plate, the fold refuses it, so does the reading.
    const off = withTest(transformer(), { '12600/3': measured('57.4', null) });
    off.sheet.nameplate.taps = cell(measured('13.8;13.2;12;11.4', 'kV'));
    expect(ratioRows(off).at(-1)!.tap?.onPlate).toBe(false);
    expect(build(off, values('1'), { row: 12600, col: 4 }).dropped).toEqual([{ key: '0:1', reason: 'no_cell' }]);
  });

  it('no printed unit: the previous row in table order lends its stored unit, never row - 1', () => {
    const block = withTest(transformer(), { '13800/3': measured('62.9', 'V/V'), '13199/3': measured('62.9', 'x'), '12600/3': measured('57.4', 'y') });
    const { rows } = build(block, values('60.1'), { row: 13200 });
    expect(rows.map((row) => [row.target_path, unitOf(row)])).toEqual([[path(block, 13200), 'V/V']]);
    // The first tap row has no previous one: the column's own unit.
    expect(unitOf(build(transformer(), values('60.1'), { row: 13800 }).rows[0]!)).toBeNull();
  });

  it('TAPS empty and a v12 transformer: the seeded row 0 as before; a tap row is no_cell there', () => {
    for (const block of [withNameplate(sheet('transformador_forca'), { tensao_nominal_at: measured('13.8', 'kV') }), sheet('transformador_forca', 'v12')]) {
      expect(build(block, TTR, { row: 0 }).rows.map((row) => row.target_path), block.seed_version).toEqual([path(block, 0)]);
      expect(build(block, values('1', '2', '3', '4'), { row: 0 }).dropped.map((drop) => drop.reason), block.seed_version).toEqual(['no_cell']);
      expect(build(block, TTR, { row: 13800 }).dropped, block.seed_version).toEqual([{ key: '0:34.512', reason: 'no_cell' }]);
    }
  });

  it('a company copy: the version tests and nameplate the job passes place the value as on the seeded type', () => {
    const copy = duplicateSeededType(SEED_VERSION, 'transformador_forca').draft;
    const block = { ...transformer(), block_type: `type:${id(77)}` } as BlockRow;
    const input = { tests: copy.tests as readonly TestDef[], nameplate: copy.nameplate as readonly FieldDef[] };
    expect(build(block, values('1', '2', '3', '4'), { row: 12600, col: 4 }, input).rows.map((row) => row.target_path)).toEqual([path(block, 12600, 4), path(block, 12600, 5), path(block, 12000, 3), path(block, 12000, 4)]);
  });

  it('"Confirmar todos" and its verify count see the tap rows; a pending fill on a row off the plate is in neither', () => {
    const block = transformer();
    const pending: SuggestionRow[] = [
      ...build(block, TTR, { row: 13800 }).rows,
      ...build(block, TTR, { row: 13200 }).rows,
      ...build(block, TTR, { row: 12600 }).rows,
      ...build(block, values('9'), { row: 12000, col: 4 }).rows.map((row) => ({ ...row, trust: 'verify' as const })),
    ];
    const confirmable = measurementConfirmAllCandidates(block, pending, TEST_KEY, TABLE_KEY, [], EMPTY_DEFINITION_CONTEXT);
    // In table order: 13800, 13200, 12600.
    expect(confirmable.map((row) => row.target_path)).toEqual([path(block, 13800), path(block, 13200), path(block, 12600)]);
    expect(measurementTableVerifyCount(block, pending, TEST_KEY, TABLE_KEY, [], EMPTY_DEFINITION_CONTEXT)).toBe(1);
    // 12,6 kV leaves TAPS while its row holds a reading: the fill pending on its empty capture is no longer offered.
    const off = withTest(structuredClone(block), { '12600/4': measured('57.4', null) });
    off.sheet.nameplate.taps = cell(measured('13.8;13.2;12;11.4', 'kV'));
    const offPending = [...pending, { ...pending[2]!, id: id(5000), target_path: path(off, 12600, 5), trust: 'verify' as const }];
    expect(measurementConfirmAllCandidates(off, offPending, TEST_KEY, TABLE_KEY, [], EMPTY_DEFINITION_CONTEXT).map((row) => row.target_path)).toEqual([path(off, 13800), path(off, 13200)]);
    expect(measurementTableVerifyCount(off, offPending, TEST_KEY, TABLE_KEY, [], EMPTY_DEFINITION_CONTEXT)).toBe(1);
  });

  it('a v12 table keeps its seeded range for "Confirmar todos"', () => {
    const block = sheet('transformador_forca', 'v12');
    const key = getDefinition('v12', 'cabine_primaria', 'transformador_forca').tests.find((test) => test.key === TEST_KEY)!.tables[0]!.key;
    const pending = build(block, TTR, { row: 0 }).rows;
    expect(measurementConfirmAllCandidates(block, pending, TEST_KEY, key, [], EMPTY_DEFINITION_CONTEXT).map((row) => row.target_path)).toEqual([path(block, 0)]);
  });
});

// --- removing a nameplate field -----------------------------------------------------------------

describe('e23g R2-2: removing a nameplate field of a v13 copy prunes every key naming it', () => {
  const copy = () => duplicateSeededType(SEED_VERSION, 'transformador_forca').draft;
  const indexOf = (draft: CompanyTypeDefinition, key: string) => draft.nameplate.findIndex((field) => field.key === key);
  const ratioTable = (draft: CompanyTypeDefinition) => draft.tests.find((test) => test.key === TEST_KEY)!.tables[0]!;

  it('the copy carries rows_from, pick_from and dry_fields, and publishes as it is', () => {
    const draft = copy();
    expect(ratioTable(draft).rows_from).toBe('taps');
    expect(draft.nameplate.find((field) => field.key === 'tap_atual_kv')!.pick_from).toBe('taps');
    expect(draft.oil_rule!.dry_fields).toEqual(['temperatura_enrolamento_c', 'classe_termica']);
    expect(validateTypeDraft(draft)).toEqual([]);
  });

  it('removing TAPS: the TTR loses rows_from, TAP ATUAL loses pick_from, still valid', () => {
    const draft = copy();
    const without = removeDraftEntry(draft, 'nameplate', indexOf(draft, 'taps')) as CompanyTypeDefinition;
    expect(ratioTable(without).rows_from).toBeUndefined();
    expect('rows_from' in ratioTable(without)).toBe(false);
    const plain = Object.fromEntries(Object.entries(draft.nameplate.find((field) => field.key === 'tap_atual_kv')!).filter(([key]) => key !== 'pick_from'));
    expect(without.nameplate.find((field) => field.key === 'tap_atual_kv')).toStrictEqual(plain);
    expect(validateTypeDraft(without)).toEqual([]);
  });

  it('removing the dry fields one by one: dry_fields loses each, then the key goes', () => {
    const draft = copy();
    const one = removeDraftEntry(draft, 'nameplate', indexOf(draft, 'temperatura_enrolamento_c')) as CompanyTypeDefinition;
    expect(one.oil_rule!.dry_fields).toEqual(['classe_termica']);
    expect(validateTypeDraft(one)).toEqual([]);
    const two = removeDraftEntry(one, 'nameplate', indexOf(one, 'classe_termica')) as CompanyTypeDefinition;
    expect(two.oil_rule).toBeDefined();
    expect('dry_fields' in two.oil_rule!).toBe(false);
    expect(two.oil_rule!.fields).toEqual(draft.oil_rule!.fields);
    expect(validateTypeDraft(two)).toEqual([]);
  });

  it('removing TAP ATUAL, the picker itself: nothing else changes, still valid', () => {
    const draft = copy();
    const without = removeDraftEntry(draft, 'nameplate', indexOf(draft, 'tap_atual_kv')) as CompanyTypeDefinition;
    expect(ratioTable(without).rows_from).toBe('taps');
    expect(without.oil_rule).toEqual(draft.oil_rule);
    expect(without.nameplate).toEqual(draft.nameplate.filter((field) => field.key !== 'tap_atual_kv'));
    expect(validateTypeDraft(without)).toEqual([]);
  });

  it('removing a field an applies_when names: both conditions go, the test applies always, initial_off kept', () => {
    const condition = { field: 'tensao_de_saida', op: 'above' as const, value: 100 };
    const draft = structuredClone({
      ...DEFINITION_1,
      tests: DEFINITION_1.tests.map((test) => ({ ...test, applies_when: condition })),
      measurement_tests: DEFINITION_1.measurement_tests!.map((test) => ({ ...test, switchable: { off_note: 'Não medido nesta visita.' }, initial_off: true as const, applies_when: condition })),
    }) as CompanyTypeDefinition;
    expect(validateTypeDraft(draft)).toEqual([]);
    const without = removeDraftEntry(draft, 'nameplate', indexOf(draft, 'tensao_de_saida')) as CompanyTypeDefinition;
    expect(without.tests.every((test) => !('applies_when' in test))).toBe(true);
    expect(without.measurement_tests!.every((test) => !('applies_when' in test))).toBe(true);
    expect(without.measurement_tests![0]!.initial_off).toBe(true);
    expect(validateTypeDraft(without)).toEqual([]);
    // A condition on another field stays.
    const kept = removeDraftEntry(draft, 'nameplate', indexOf(draft, 'modelo')) as CompanyTypeDefinition;
    expect(kept.tests[0]!.applies_when).toEqual(condition);
    expect(kept.measurement_tests![0]!.applies_when).toEqual(condition);
  });
});

// --- the group's missing count ------------------------------------------------------------------

describe('e23g R2-3: a v13 TTR waiting for its vector group counts only its required rows', () => {
  const ensaios = (block: BlockRow) => sheetProgress({ blocks: [block] }, block.id).steps.ensaios;

  it('five taps, TAP ATUAL the third: the group is 3 (rows 1, 3 and 5)', () => {
    expect(ensaios(transformer()).group).toBe(3);
  });

  it('no TAP ATUAL: the extremes alone, 2; a row off the plate with readings adds nothing', () => {
    expect(ensaios(transformer(undefined, null)).group).toBe(2);
    const off = withTest(transformer(undefined, null), { '12600/3': measured('57.4', null), '12600/4': measured('57.4', null), '12600/5': measured('57.4', null) });
    off.sheet.nameplate.taps = cell(measured('13.8;13.2;12;11.4', 'kV'));
    expect(ratioRows(off).map((row) => row.tap?.onPlate)).toEqual([true, true, true, true, false]);
    expect(ensaios(off).group).toBe(2);
  });

  it('a display reading confirmed on three tap rows lowers the missing count by the required rows it filled (2: 13200 is unmarked)', () => {
    const before = ensaios(transformer());
    const after = ensaios(withTest(transformer(), { '13800/3': measured('34.512', null), '13200/3': measured('34.512', null), '12600/3': measured('34.512', null) }));
    expect(after.missing).toBe(before.missing - 2);
    expect(after.group).toBe(3);
  });

  it('with the group typed: no group count at all', () => {
    expect(ensaios(transformer(undefined, '12.6', { ligacao_secundaria: 'Dyn1' })).group).toBeUndefined();
  });

  it('v12 and TAPS empty on v13: one per seeded row, as before', () => {
    expect(ensaios(sheet('transformador_forca', 'v12')).group).toBe(1);
    expect(ensaios(sheet('transformador_forca')).group).toBe(1);
  });
});

// --- the tap line -------------------------------------------------------------------------------

describe('e23g R2-4: the tap line and the row predicates of a tap table are the kernel\'s', () => {
  const tap = (onPlate: boolean, mark: EvaluatedTap['mark'] = null): { tap: EvaluatedTap } => ({ tap: { position: onPlate ? 1 : null, volts: 13800, mark, onPlate, name: '1' } });

  it('a table with no on-plate tap has no line; one tap, five taps count them; rows off the plate never count', () => {
    expect(tapTableLine([])).toBeNull();
    expect(tapTableLine([{ tap: null }])).toBeNull();
    expect(tapTableLine([tap(false)])).toBeNull();
    expect(tapTableLine([tap(true, 'atual')])).toEqual(tapsLine(1));
    const five = ratioRows(transformer());
    expect(tapTableLine(five)).toEqual(tapsLine(5));
    const off = withTest(transformer(), { '12600/3': measured('57.4', null) });
    off.sheet.nameplate.taps = cell(measured('13.8;13.2;12;11.4', 'kV'));
    expect(tapTableLine(ratioRows(off))).toEqual(tapsLine(4));
    expect(tapTableLine(ratioRows(sheet('transformador_forca', 'v12')))).toBeNull();
  });

  it('isTapTable and tapRowOptional: an unmarked on-plate tap is optional, a marked, an off-plate or a v12 row is not', () => {
    const rows = ratioRows(transformer());
    expect(isTapTable(rows)).toBe(true);
    expect(rows.map((row) => tapRowOptional(row))).toEqual([false, true, false, true, false]);
    expect(tapRowOptional(tap(false))).toBe(false);
    expect(tapRowOptional({ tap: null })).toBe(false);
    expect(isTapTable(ratioRows(sheet('transformador_forca', 'v12')))).toBe(false);
  });
});
