import { describe, expect, it } from 'vitest';
import { refusedMeasurementKind } from '../checks/input-refusal.ts';
import { conflictValueText } from '../merge/conflicts.ts';
import { parseOverRangePtBr } from '../parse/pt-br-number.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import { emptySheet, type BlockRow, type Cell, type Sheet } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { composeConclusion, conclusionFloor, effectiveConclusionPair } from './conclusion.ts';
import { instrumentRangeFor, instrumentRangeOf } from './instrument-pick.ts';
import { evaluateSheetMeasurements, measurementReadingRefusal, measurementStoredText, overRangeRefusal, parseMeasurementReadingPtBr, worstMeasurements } from './measurement-evaluation.ts';
import { colOf, ctaBlock, ctaDefinition, E1, E2, E4, num, rowOf } from './measurement-test-support.ts';
import {
  isReadingValue,
  OVER_RANGE_ALLOWED,
  OVER_RANGE_COMPARED_REFUSAL,
  OVER_RANGE_RATIO_REFUSAL,
  overRangeDisplay,
  overRangeEchoText,
  overRangeNoRangeText,
  overRangeText,
  overRangeVerdict,
  rangeInUnits,
} from './over-range.ts';
import { evaluatedCells, evaluateSheetReadings, unitTapNeedsEdit, worstReadings, type CellAddress } from './readings.ts';

/*
 * Story 22.10 (contract 32): a reading above the instrument's limit, every row of the spec's
 * I/O matrix: the parse, the stored state, the verdict against each criterion, the refusals, the
 * readers' texts and the floor of the conclusion.
 */

const ID = '019966b0-2210-7000-8000-000000000001';
const OP = '019966b0-2210-7000-8000-000000000002';
const INSTRUMENT = '019966b0-2210-7000-8000-000000000003';

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });
const limit = (raw: string, unit: string | null) => cell({ raw, unit, state: 'over_range' });

function block(type: EquipmentBlockType, sheet: Partial<Sheet> = {}, seedVersion = 'v1'): BlockRow {
  return {
    id: ID,
    relatorio_id: ID,
    location_id: null,
    equipment_id: ID,
    block_type: type,
    config: defaultBlockConfig(seedVersion, type) as BlockRow['config'],
    seed_version: seedVersion,
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

/** A sheet whose `test` holds the given cells of one test, and optionally its instrument. */
function test(testKey: string, cells: [number, number, Cell][], instrumentId?: string): Pick<Sheet, 'test'> {
  const out: Record<string, Record<string, Cell>> = {};
  for (const [row, col, c] of cells) out[String(row)] = { ...out[String(row)], [String(col)]: c };
  const instrument = instrumentId === undefined ? {} : { instrument: cell({ instrument_id: instrumentId, code: 'MEG-10', manufacturer: null, model: null, serial: null, cert_number: null, calibrated_at: null, valid_until: null, test_parameter: '10 kV' }) };
  return { test: { [testKey]: { cells: out, ...instrument } } };
}

const INSULATION = { units: ['MΩ', 'GΩ', 'TΩ'], defaultUnit: 'MΩ' } as const;
const MICRO = { units: ['µΩ'], defaultUnit: 'µΩ' } as const;
const cellOf = (b: BlockRow, address: CellAddress) => evaluatedCells(evaluateSheetReadings(b, getDefinition(b.seed_version, 'cabine_primaria', b.block_type))).find((c) => c.address.testKey === address.testKey && c.address.row === address.row && c.address.col === address.col)!;

// The para-raios insulation: "1 MINUTO" (col 1, MΩ) on four rows; the seccionadora's contact resistance (µΩ) and its GΩ insulation; the TP's ratio.
const PR_INS = (row: number): CellAddress => ({ testKey: 'isolacao', row, col: 1 });
const SEC_RC = (row: number): CellAddress => ({ testKey: 'resistencia_contato', row, col: 0 });

describe('22.10-UNIT parseOverRangePtBr (AR-10: one parse home)', () => {
  it('"OL" and "0L" in any case and spacing name the instrument limit', () => {
    for (const text of ['OL', 'ol', '0L', '0l', ' O L ', 'oL']) expect(parseOverRangePtBr(text, INSULATION)).toEqual({ kind: 'ol' });
  });

  it('">" then a reading reads the limit, the insulation suffix and the slot unit included', () => {
    expect(parseOverRangePtBr('>2T', INSULATION)).toEqual({ kind: 'limit', raw: '2', unit: 'TΩ' });
    expect(parseOverRangePtBr('> 2 TΩ', INSULATION)).toEqual({ kind: 'limit', raw: '2', unit: 'TΩ' });
    expect(parseOverRangePtBr('> 2,5 g', INSULATION)).toEqual({ kind: 'limit', raw: '2.5', unit: 'GΩ' });
    expect(parseOverRangePtBr('>2000', MICRO)).toEqual({ kind: 'limit', raw: '2000', unit: 'µΩ' });
    expect(parseOverRangePtBr('> 2.000', MICRO)).toEqual({ kind: 'limit', raw: '2000', unit: 'µΩ' });
  });

  it('">" alone, zero, a negative, no number or the milliohm rule (E5-Q7) are invalid', () => {
    for (const text of ['>', '> 0', '> -1', '> abc', '> 147 mΩ', '>>2']) expect(parseOverRangePtBr(text, INSULATION)).toBe('invalid');
  });

  it('a plain reading or an empty text is no over-range syntax', () => {
    expect(parseOverRangePtBr('147', INSULATION)).toBeNull();
    expect(parseOverRangePtBr('', INSULATION)).toBeNull();
    expect(parseOverRangePtBr('147G', INSULATION)).toBeNull();
  });
});

describe('22.10-UNIT the texts and the verdict rule (over-range.ts)', () => {
  it('shows "> 2" in the cell, prints "> 2 TΩ" and echoes "= > 2 TΩ"', () => {
    expect(overRangeDisplay('2000')).toBe('> 2.000');
    expect(overRangeText('2', 'TΩ')).toBe('> 2 TΩ');
    expect(overRangeText('2.5', null)).toBe('> 2,5');
    expect(overRangeEchoText('2', 'TΩ')).toBe('= > 2 TΩ');
    expect(isReadingValue('over_range')).toBe(true);
    expect(isReadingValue('measured')).toBe(true);
    expect(isReadingValue('not_measured')).toBe(false);
  });

  it('a > criterion: within iff the limit reaches it (400 MΩ, 0,4 GΩ within; 399 MΩ out); units that do not compare: none', () => {
    const criterion = { operator: '>', value: 400, unit: 'MΩ' };
    expect(overRangeVerdict(400, 'MΩ', criterion)).toBe('within');
    expect(overRangeVerdict(0.4, 'GΩ', criterion)).toBe('within');
    expect(overRangeVerdict(399, 'MΩ', criterion)).toBe('out');
    expect(overRangeVerdict(2, 'TΩ', criterion)).toBe('within');
    expect(overRangeVerdict(2, 'V', criterion)).toBeNull();
    expect(overRangeVerdict(100, 'MΩ', { operator: '>=', value: 100, unit: 'MΩ' })).toBe('within');
  });

  it('a < criterion is always out (the true value is above the limit); a ± one has no verdict', () => {
    expect(overRangeVerdict(2000, 'µΩ', { operator: '<', value: 250, unit: 'µΩ' })).toBe('out');
    expect(overRangeVerdict(1, 'µΩ', { operator: '<=', value: 250, unit: 'µΩ' })).toBe('out');
    expect(overRangeVerdict(5, '%', { operator: '±', value: 0.5, unit: '%' })).toBeNull();
  });

  it('the instrument limit in the cell units: as it stands, moved exactly through the Ω scale, or none', () => {
    expect(rangeInUnits({ raw: '2', unit: 'TΩ' }, INSULATION.units, 'MΩ')).toEqual({ raw: '2', unit: 'TΩ' });
    expect(rangeInUnits({ raw: '2', unit: 'mΩ' }, MICRO.units, 'µΩ')).toEqual({ raw: '2000', unit: 'µΩ' });
    expect(rangeInUnits({ raw: '2', unit: 'TΩ' }, MICRO.units, 'µΩ')).toEqual({ raw: '2000000000000000000', unit: 'µΩ' });
    expect(rangeInUnits({ raw: '2', unit: 'kV' }, MICRO.units, 'µΩ')).toBeNull();
    expect(rangeInUnits({ raw: '2', unit: null }, MICRO.units, 'µΩ')).toBeNull();
    expect(rangeInUnits(null, MICRO.units, 'µΩ')).toBeNull();
    expect(rangeInUnits({ raw: '0', unit: 'µΩ' }, MICRO.units, 'µΩ')).toBeNull();
  });
});

describe('22.10-UNIT the registry range (instrumentRangeOf, instrumentRangeFor)', () => {
  const row = { id: INSTRUMENT, range_isolacao: { raw: '2', unit: 'TΩ' }, range_resistencia_contato: { raw: '2.000', unit: ' µΩ ' } };

  it('reads the typed range the pt-BR way, per test type; none for the ratio or an unset one', () => {
    expect(instrumentRangeOf(row, 'isolacao')).toEqual({ raw: '2', unit: 'TΩ' });
    expect(instrumentRangeOf(row, 'resistencia_contato')).toEqual({ raw: '2000', unit: 'µΩ' });
    expect(instrumentRangeOf(row, 'relacao_transformacao')).toBeNull();
    expect(instrumentRangeOf({ range_isolacao: null, range_resistencia_contato: undefined }, 'isolacao')).toBeNull();
    expect(instrumentRangeOf({ range_isolacao: { raw: '-2', unit: 'TΩ' }, range_resistencia_contato: null }, 'isolacao')).toBeNull();
    expect(instrumentRangeOf({ range_isolacao: { raw: 'abc', unit: 'TΩ' }, range_resistencia_contato: null }, 'isolacao')).toBeNull();
  });

  it('a sheet test reads the range of the instrument picked on it, live from the registry', () => {
    const picked = block('para_raio', test('isolacao', [], INSTRUMENT));
    expect(instrumentRangeFor(picked, [row], 'isolacao')).toEqual({ raw: '2', unit: 'TΩ' });
    expect(instrumentRangeFor(picked, [], 'isolacao')).toBeNull();
    expect(instrumentRangeFor(block('para_raio'), [row], 'isolacao')).toBeNull();
  });
});

describe('22.10-UNIT the input parse of a cell (parseMeasurementReadingPtBr)', () => {
  const insulation = cellOf(block('para_raio'), PR_INS(0));
  const contact = cellOf(block('chave_seccionadora'), SEC_RC(0));

  it('OL with the instrument range stores it; the 10 kV megger of the AC: {raw 2, unit TΩ, over_range}', () => {
    expect(insulation.overRange).toEqual(OVER_RANGE_ALLOWED);
    expect(parseMeasurementReadingPtBr('OL', insulation, 'MΩ', { raw: '2', unit: 'TΩ' })).toEqual({ raw: '2', unit: 'TΩ', state: 'over_range' });
    expect(parseMeasurementReadingPtBr('>2T', insulation, 'MΩ')).toEqual({ raw: '2', unit: 'TΩ', state: 'over_range' });
    expect(parseMeasurementReadingPtBr('>2000', contact, 'µΩ')).toEqual({ raw: '2000', unit: 'µΩ', state: 'over_range' });
    expect(parseMeasurementReadingPtBr('147', insulation, 'MΩ')).toEqual({ raw: '147', unit: 'MΩ' });
  });

  it('OL without a range (none, unset, or a unit the cell cannot take) stores nothing and says why, in the cell unit', () => {
    expect(parseMeasurementReadingPtBr('OL', insulation, 'MΩ', null)).toBe('invalid');
    expect(parseMeasurementReadingPtBr('OL', contact, 'µΩ', { raw: '2', unit: 'TΩ' })).toEqual({ raw: '2000000000000000000', unit: 'µΩ', state: 'over_range' });
    expect(parseMeasurementReadingPtBr('OL', contact, 'µΩ', { raw: '2', unit: 'kV' })).toBe('invalid');
    expect(measurementReadingRefusal('OL', insulation, 'MΩ', null)).toBe(overRangeNoRangeText('MΩ'));
    expect(overRangeNoRangeText('TΩ')).toBe('Instrumento sem limite cadastrado: digite > e o limite (ex.: > 2 TΩ)');
    expect(refusedMeasurementKind('OL', insulation, 'MΩ', null)).toBe('out_of_range');
  });

  it('a malformed limit is the field\'s usual invalid text', () => {
    for (const text of ['>', '> 0', '> -1', '> abc', '> 147 mΩ']) {
      expect(parseMeasurementReadingPtBr(text, insulation, 'MΩ')).toBe('invalid');
      expect(measurementReadingRefusal(text, insulation, 'MΩ')).toBeNull();
      expect(refusedMeasurementKind(text, insulation, 'MΩ')).toBe('not_a_number');
    }
  });

  it('every ratio cell, capture or input, refuses it with the authored ratio refusal', () => {
    const tp = block('tp');
    for (const col of [0, 1, 3]) {
      const ratio = cellOf(tp, { testKey: 'relacao_transformacao', row: 0, col });
      expect(ratio.overRange).toEqual({ allowed: false, refusal: OVER_RANGE_RATIO_REFUSAL });
      expect(parseMeasurementReadingPtBr('OL', ratio, ratio.unit, { raw: '2', unit: 'TΩ' })).toBe('invalid');
      expect(parseMeasurementReadingPtBr('>5', ratio, ratio.unit)).toBe('invalid');
      expect(measurementReadingRefusal('OL', ratio, ratio.unit)).toBe(OVER_RANGE_RATIO_REFUSAL);
      expect(overRangeRefusal('>5', ratio, ratio.unit)).toBe(OVER_RANGE_RATIO_REFUSAL);
    }
    expect(OVER_RANGE_RATIO_REFUSAL).toBe('O ensaio de relação de transformação não aceita valor acima do limite: informe o valor medido.');
  });

  it('a cell with no overRange given never takes one', () => {
    expect(parseMeasurementReadingPtBr('>2T', { units: INSULATION.units }, 'MΩ')).toBe('invalid');
  });
});

describe('22.10-UNIT the seeded evaluation of a stored limit', () => {
  it('OL with range: "> 2" and TΩ on screen, within > 400 MΩ, "> 2 TΩ" in the worst reading and the conclusion', () => {
    const b = block('para_raio', test('isolacao', [[0, 1, limit('2', 'TΩ')]]));
    const c = cellOf(b, PR_INS(0));
    expect(c).toMatchObject({ state: 'over_range', raw: '2', unit: 'TΩ', displayText: '> 2', verdict: 'within', helperText: null, missing: false, source: 'typed' });
    expect(worstReadings(evaluateSheetReadings(b, getDefinition('v1', 'cabine_primaria', 'para_raio')))[0]).toMatchObject({ valueText: '> 2 TΩ', verdict: 'within' });
    expect(composeConclusion(b, getDefinition('v1', 'cabine_primaria', 'para_raio'), 'PR-1').text).toContain('dentro dos critérios');
  });

  it('a limit equal to, below and above the > criterion', () => {
    const at = (raw: string, unit: string) => cellOf(block('para_raio', test('isolacao', [[0, 1, limit(raw, unit)]])), PR_INS(0));
    expect(at('400', 'MΩ').verdict).toBe('within');
    expect(at('0.4', 'GΩ').verdict).toBe('within');
    expect(at('399', 'MΩ')).toMatchObject({ verdict: 'out', helperText: 'Abaixo do aceitável (>400 MΩ)' });
  });

  it('a stored limit at zero, negative or not a number reads invalid with no verdict, never throwing', () => {
    for (const raw of ['0', '-1', 'abc', '']) {
      const c = cellOf(block('para_raio', test('isolacao', [[0, 1, limit(raw, 'MΩ')]])), PR_INS(0));
      expect(c.state).toBe('invalid');
      expect(c.verdict).toBeNull();
    }
  });

  it('contact resistance "> limite" with a 2.000 µΩ range is out of < 250 µΩ, and the floor is Reprovado · Com restrições (Story 22.4)', () => {
    const b = block('chave_seccionadora', test('resistencia_contato', [[0, 0, limit('2000', 'µΩ')]]));
    expect(cellOf(b, SEC_RC(0))).toMatchObject({ state: 'over_range', displayText: '> 2.000', verdict: 'out', helperText: 'Acima do aceitável (<250 µΩ)' });
    expect(conclusionFloor(b)?.pair).toEqual({ result: 'reprovado', restriction: 'com_restricoes' });
    expect(effectiveConclusionPair(b)).toEqual({ result: 'reprovado', restriction: 'com_restricoes' });
  });

  it('a limit stored on a ratio cell (an op written by hand) reads invalid: "> 5", no verdict', () => {
    const b = block('tp', test('relacao_transformacao', [[0, 3, limit('5', null)]]));
    const c = cellOf(b, { testKey: 'relacao_transformacao', row: 0, col: 3 });
    expect(c).toMatchObject({ state: 'invalid', displayText: '> 5', verdict: null });
  });

  it('a concluded sheet guards the unit tap of a limit as of a measured value (DB-2)', () => {
    const b = { ...block('para_raio', test('isolacao', [[0, 1, limit('2', 'TΩ')]])), concluded_by: { actor_id: ID, at: '2026-11-06T12:00:00.000Z' } };
    expect(unitTapNeedsEdit(b, { state: 'over_range' })).toBe(true);
  });

  it('the conflict view names a limit "> 2 TΩ"', () => {
    expect(conflictValueText({ path: `sheet/${ID}/test/isolacao/cell/0/1` }, { raw: '2', unit: 'TΩ', state: 'over_range' })).toBe('> 2 TΩ');
  });
});

describe('22.10-UNIT the measurement tests (measurement-evaluation.ts)', () => {
  const definition = ctaDefinition();
  const cellAt = (b: BlockRow, testKey: string, rowKey: string, colKey: string) =>
    evaluateSheetMeasurements(b, definition)
      .find((t) => t.testKey === testKey)!
      .rows.find((r) => r.row === rowOf(testKey, rowKey))!
      .cells.find((c) => c.address.col === colOf(testKey, colKey))!;
  const over = (raw: string, unit: string) => ({ raw, unit, state: 'over_range' as const });

  it('a number cell under an absolute criterion takes it and is judged by the same rule (≥ 100 MΩ in BT)', () => {
    const b = ctaBlock({}, [{ test: E2, row: 'a_t', col: 'normal_fechada', value: over('2', 'GΩ') }, { test: E2, row: 'b_t', col: 'normal_fechada', value: over('50', 'MΩ') }]);
    expect(cellAt(b, E2, 'a_t', 'normal_fechada')).toMatchObject({ state: 'over_range', displayText: '> 2', overRange: OVER_RANGE_ALLOWED, verdict: 'within' });
    expect(cellAt(b, E2, 'b_t', 'normal_fechada')).toMatchObject({ state: 'over_range', verdict: 'out' });
    expect(worstMeasurements(evaluateSheetMeasurements(b, definition)).find((w) => w.testKey === E2)?.valueText).toBe('> 50 MΩ');
    expect(measurementStoredText(definition, E2, { row: rowOf(E2, 'a_t'), col: colOf(E2, 'normal_fechada') }, over('2', 'GΩ'))).toBe('> 2 GΩ');
  });

  it('a cell a relative or an equals criterion compares refuses it, and a stored one reads invalid', () => {
    const b = ctaBlock({}, [
      { test: E1, row: 'polo_a', col: 'lado_normal', value: over('2000', 'µΩ') },
      { test: E4, row: 'td_3a', col: 'deixado', value: over('5', 'min') },
    ]);
    const relative = cellAt(b, E1, 'polo_a', 'lado_normal');
    expect(relative).toMatchObject({ state: 'invalid', displayText: '> 2.000', verdict: null, overRange: { allowed: false, refusal: OVER_RANGE_COMPARED_REFUSAL } });
    expect(cellAt(b, E4, 'td_3a', 'deixado')).toMatchObject({ state: 'invalid', verdict: null, overRange: { allowed: false, refusal: OVER_RANGE_COMPARED_REFUSAL } });
    expect(cellAt(b, E4, 'td_3a', 'projeto').overRange.allowed).toBe(false);
    expect(parseMeasurementReadingPtBr('OL', relative, 'µΩ', { raw: '2', unit: 'mΩ' })).toBe('invalid');
    expect(measurementReadingRefusal('>5', relative, 'µΩ')).toBe('Este valor é comparado com outros: informe o valor medido.');
    expect(cellAt(b, E2, 'a_t', 'normal_fechada').overRange.allowed).toBe(true);
  });

  it('a choice cell never takes one', () => {
    const choiceCell = evaluateSheetMeasurements(ctaBlock(), definition)
      .flatMap((t) => t.rows.flatMap((r) => r.cells))
      .find((c) => c.kind === 'choice')!;
    expect(choiceCell.overRange.allowed).toBe(false);
  });

  it('a plain measured number keeps reading as before', () => {
    const b = ctaBlock({}, [{ test: E2, row: 'a_t', col: 'normal_fechada', value: num('12.4', 'GΩ') }]);
    expect(cellAt(b, E2, 'a_t', 'normal_fechada')).toMatchObject({ state: 'measured', displayText: '12,4', verdict: 'within' });
  });
});
