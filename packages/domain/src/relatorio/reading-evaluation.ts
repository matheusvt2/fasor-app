import { canonicalDecimal, formatDecimalGroupedPtBr, INSULATION_UNITS, NOT_APPLICABLE_TEXT, parseReadingPtBr, readOverSqrt3Raw } from '../parse/pt-br-number.ts';
import type { BlockRow } from '../schemas/entities.ts';
import { compareCriterion, formatCriterionValue, scaleToUnit, SEEDED_CRITERIA, type CriterionSeed } from '../seed/criteria.ts';
import type { CriterionTableRow } from '../seed/criteria-tables.ts';
import { SELV_YES, type BandCriterion, type BlockDefinition, type ColumnDef, type PolarizationIndexRule, type TableDef, type TestDef } from '../seed/schema.ts';
import { parseVoltageClassKv } from '../registry/word-row.ts';
import { listPtBr } from '../text/plural.ts';
import { ACCURACY_CLASS_HELPER, accuracyClassDeviation, parseAccuracyClass } from './accuracy-class.ts';
import { isOverRangeRaw, OVER_RANGE_ALLOWED, OVER_RANGE_RATIO_REFUSAL, overRangeDisplay, overRangeVerdict, type OverRangeAllowance } from './over-range.ts';
import { ratedVoltsOf, rowTestVoltage, voltageColumnOf } from './row-voltage.ts';
import { isTestInForce, testApplicability, type TestApplicability } from './applicability.ts';
import { enabledSubBlocksOf } from './sheet-state.ts';
import { evaluatedTapOf, tapFailedRowLabel, tapRowLabel, tapRowRequired, tapRowsOf, type TapRowPlan } from './tap-rows.ts';
import { previousReadingsByAddress } from '../print/reading-slots.ts';
import { previousVisitDateText } from '../print/visit-date.ts';
import { seedRule } from '../seed/definitions.ts';
import { applyHistoryRise, applyRestrictions, prerequisiteFailure, type RestrictionPrevious } from './restriction.ts';
import { correctedRaw, correctedText, mediumOf, temperatureFactor, temperatureView, testTemperature } from './temperature-correction.ts';
import { NO_VISIT_CONTEXT, previousPlateMeasured, type VisitContext } from './visit-context.ts';
import {
  convertRatioUnit,
  DECIMAL,
  headerText,
  inputHeaderText,
  nameplateRatioFallback,
  nameplateTap,
  ratioGroupOf,
  RATIO_POWER,
  readingLabelText,
  readingRowLabel,
  readStored,
  sentenceCase,
  shiftDecimal,
  storedCell,
  unitsOf,
  type CellAddress,
  type ChoiceColumn,
  type EvaluatedCell,
  type EvaluatedChoice,
  type EvaluatedRow,
  type EvaluatedTable,
  type ManufacturerValue,
  type TestEvaluation,
  type TestKey,
  type VisibleColumn,
} from './reading-cells.ts';
import { VECTOR_GROUP_EMPTY_TEXT, VECTOR_GROUP_UNRECOGNIZED_TEXT, vectorGroupFieldLabel, vectorGroupMissingText, vectorGroupCaptureLabel, vectorGroupNeutralCaptureLabel, vectorGroupFactor, vectorGroupFormulaText, vectorGroupShortText } from './vector-group.ts';

/*
 * E9-A7: THE evaluation of a sheet's readings (see `reading-cells.ts` for the addressing) and
 * the lookups over it. `readings.ts` re-exports the public part.
 */

// --- the evaluation ------------------------------------------------------------------------

function criterionOf(test: TestDef): CriterionSeed {
  // Story 14.6: a company type's test carries its own criterion (the row of its type's criteria
  // table, `asBlockDefinition`), taken before the seeded one of the same key.
  if (test.criterion !== undefined) return test.criterion;
  const found = SEEDED_CRITERIA.find((criterion) => criterion.key === test.criterion_key);
  if (found === undefined) throw new Error(`readings: unknown criterion "${test.criterion_key}"`);
  return found;
}

/**
 * A nameplate number cell as a value in V (a stored kV is moved into V), or null when it holds no positive number.
 * Seed v13 (Story 23.7): a stored "N/√3" (an `over_sqrt3` field, the TP's TENSÃO NOMINAL) reads N/√3.
 */
export function voltsOf(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const cell = value as { raw?: unknown; unit?: unknown; state?: unknown };
  const sqrt3 = cell.state === 'measured' ? readOverSqrt3Raw(cell.raw) : null;
  if (sqrt3 !== null) return voltsOf({ raw: canonicalDecimal((Number(sqrt3) / Math.sqrt(3)).toFixed(6)), unit: cell.unit, state: 'measured' });
  if (cell.state !== 'measured' || typeof cell.raw !== 'string' || !DECIMAL.test(cell.raw)) return null;
  const number = Number(cell.raw);
  if (!Number.isFinite(number) || number <= 0) return null;
  if (cell.unit === 'kV') return number * 1000;
  return cell.unit === 'V' || cell.unit === null || cell.unit === undefined ? number : null;
}

/** A band as the criterion every reader takes, keyed and labelled as the test's seeded criterion. */
function bandAsCriterion(test: TestDef, band: BandCriterion): CriterionSeed {
  const seeded = criterionOf(test);
  return { key: seeded.key, label: seeded.label, operator: band.operator, value: band.value, unit: band.unit, type: 'absolute_min', source: band.source, usedBy: seeded.usedBy };
}

/**
 * Story 14.9 (seed v6, NBR 5410): the criterion a test with `criterion_bands` is judged by, from
 * the block's own plate: the SELV/PELV band when the mark reads SIM, else the first band whose
 * `up_to` the TENSÃO NOMINAL does not exceed; null (no verdict) when the voltage is empty, not
 * a positive number, or above the last band. Re-read on every evaluation, so editing the plate
 * re-judges the readings.
 */
export function bandCriterion(block: Pick<BlockRow, 'sheet'>, test: TestDef): CriterionSeed | null {
  const band = pickedBand(block, test);
  return band === null ? null : bandAsCriterion(test, band);
}

/**
 * The band `bandCriterion` judges by, as the seed declares it (Story 14.14 reads its
 * `test_voltage`): the SELV/PELV band on a SIM mark, else the voltage band; null as above.
 */
export function pickedBand(block: Pick<BlockRow, 'sheet'>, test: TestDef): BandCriterion | null {
  const bands = test.criterion_bands;
  if (bands === undefined) return null;
  if (bands.selv_field !== undefined && bands.selv !== undefined) {
    const mark = block.sheet.nameplate[bands.selv_field]?.value;
    if (typeof mark === 'string' && mark.trim() === SELV_YES) return bands.selv;
  }
  const volts = voltsOf(block.sheet.nameplate[bands.field]?.value);
  if (volts === null) return null;
  return bands.bands.find((candidate) => volts <= candidate.up_to) ?? null;
}

/**
 * The criterion a test of this sheet is judged by before any manufacturer's value: the seeded one
 * (Story 14.6: a company type's own), or the band the plate picks (Story 14.9, null when none
 * applies), or the seeded one at the deviation of the accuracy class the plate names (Story 22.9).
 */
function seededCriterion(block: Pick<BlockRow, 'sheet'>, test: TestDef): CriterionSeed | null {
  const banded = test.criterion_bands === undefined ? criterionOf(test) : bandCriterion(block, test);
  if (banded === null) return null;
  // Story 22.9 (seed v12): a test naming a class field is judged at its class's deviation; the
  // seeded criterion stands while the field names no class.
  const deviation = test.criterion_class_field === undefined ? null : accuracyClassDeviation(classOf(block, test));
  return deviation === null ? banded : { ...banded, value: deviation };
}

/**
 * E5-A4: the criterion a test of this sheet is judged by: the seed's (`seededCriterion`), or the
 * manufacturer's value when the sheet's `test.{key}.criterion_override` holds a well-formed one
 * (`manufacturerCriterion`, Story 23.3), which prevails on every row of the test. A malformed
 * override (any shape `manufacturerValueOf` refuses) is ignored and the seed stands; on a v13
 * sheet the fold refuses it (`applyOp`, contract 34).
 *
 * Story 14.9 (seed v6): a test with `criterion_bands` takes its band (`bandCriterion`) instead
 * of the seeded criterion, and null when none applies: every reader then gives no verdict.
 * Story 23.2: a test with a `criterion_table` is judged row by row (`rowCriterion`); this is
 * then the criterion of a row the table cannot judge.
 */
export function effectiveCriterion(block: Pick<BlockRow, 'sheet'>, test: TestDef): CriterionSeed | null {
  return manufacturerCriterion(block, test) ?? seededCriterion(block, test);
}

/** Story 22.9: the accuracy class the test's class field names on the plate, or null (no field, empty, unparsable). */
function classOf(block: Pick<BlockRow, 'sheet'>, test: TestDef): string | null {
  if (test.criterion_class_field === undefined) return null;
  return parseAccuracyClass(block.sheet.nameplate[test.criterion_class_field]?.value);
}

// --- batch e23a: Stories 23.2 to 23.4 (the row's criterion, the manufacturer's value, the instrument-limit note) ---

// authored (Story 23.3, listed for Bruno): the source a manufacturer's value names.
/** The source name of a criterion typed from the manufacturer's data (decision G: one value per test). */
export const MANUFACTURER_SOURCE_NAME = 'Fabricante';
// authored (Story 23.3, listed for Bruno): the source line under the criterion while the value is set.
/** The source details of a test judged by the manufacturer's value. */
export const MANUFACTURER_SOURCE_LINE = 'Fabricante — digitado nesta ficha, vale para todas as linhas deste ensaio.';
// authored (Story 23.3, listed for Bruno): ACEITÁVEL's suffix in the document.
/** What section 9 appends to ACEITÁVEL when the manufacturer's value judges the test. */
export const MANUFACTURER_PRINT_SUFFIX = ' (fabricante)';
// authored (Story 23.2, listed for Bruno): the criterion caption of a test whose rows differ.
/** The criterion text of a test whose rows are judged by different criteria (the sheet's caption). */
export const CRITERION_PER_ROW_TEXT = 'por linha';
// authored (Story 23.3, listed for Bruno): the two refusals of a manufacturer's value.
/** A manufacturer's value that is no number above zero. */
export const MANUFACTURER_VALUE_REFUSAL = 'Valor do fabricante inválido: digite um número maior que zero.';
/** A manufacturer's value in a unit the test's criterion cannot be compared with. */
export function manufacturerUnitRefusal(unit: string | null): string {
  return `Unidade incompatível com o critério (${unit === null || unit.trim() === '' ? 'sem unidade' : unit}).`;
}

/**
 * Story 23.3: the unit a manufacturer's value must convert to, the unit the test's criterion is in:
 * a criterion table's (MΩ), the bands' (the QGBT), else the seeded (or company) criterion's.
 */
export function criterionUnitOf(test: TestDef): string | null {
  if (test.criterion_table !== undefined) return test.criterion_table.table.rows[0]!.unit;
  if (test.criterion_bands !== undefined) return test.criterion_bands.bands[0]!.unit;
  return criterionOf(test).unit;
}

/** The value of a stored manufacturer's value: `{raw, unit}`, raw a positive dot-decimal, a unit the criterion's converts to; null otherwise. */
export function manufacturerValueOf(block: Pick<BlockRow, 'sheet'> & Partial<Pick<BlockRow, 'seed_version'>>, test: TestDef): ManufacturerValue | null {
  const value = block.sheet.test[test.key]?.criterion_override?.value;
  if (value === null || value === undefined) return null;
  // Review fix (item 6): a v1 to v12 sheet reads a stored override as E5-A4 always did (a zero
  // accepted); only a v13 sheet, whose fold refuses a malformed one, takes the strict rule.
  const legacy = isLegacySeed(block.seed_version);
  const ok = legacy ? legacyOverrideOk(test, value) : manufacturerRefusal(test, value) === null;
  return ok ? (value as unknown as ManufacturerValue) : null;
}

/** A seed version before v13 ("v1" to "v12"); false for v13 on, and for a block whose version is not given. */
function isLegacySeed(version: string | undefined): boolean {
  if (version === undefined || !/^v\d+$/.test(version)) return false;
  return Number(version.slice(1)) < 13;
}

/** E5-A4's reading of an override, as it stood before batch e23a: `{raw, unit}`, raw a decimal not below zero, a unit the criterion's converts to. */
function legacyOverrideOk(test: TestDef, value: unknown): boolean {
  if (!manufacturerApplies(test) || typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const override = value as { raw?: unknown; unit?: unknown };
  if (typeof override.raw !== 'string' || !DECIMAL.test(override.raw)) return false;
  if (override.unit !== null && typeof override.unit !== 'string') return false;
  const number = Number(override.raw);
  return Number.isFinite(number) && number >= 0 && scaleToUnit(number, override.unit, criterionUnitOf(test)) !== null;
}

/**
 * Review fix (item 1): whether a test takes a manufacturer's value at all: not a company test
 * whose criterion is `between` (two bounds, one value cannot replace them) or `pass_fail` (no
 * number). Such a test shows no entry, and the fold and the entry refuse a value on it.
 */
export function manufacturerApplies(test: TestDef): boolean {
  if (test.criterion_table !== undefined || test.criterion_bands !== undefined) return true;
  const operator = criterionOf(test).operator;
  return operator !== 'between' && operator !== 'pass_fail';
}

// authored (review fix, listed for Bruno): a value on a test whose criterion has two bounds or none.
/** The refusal of a manufacturer's value on a test that takes none. */
export const MANUFACTURER_NOT_APPLICABLE_REFUSAL = 'Este ensaio não aceita valor do fabricante.';

/**
 * Story 23.3 ("refused, never ignored"): why a manufacturer's value cannot be stored on `test`, or
 * null when it can: null itself (the clear) or `{raw, unit}` with `raw` a positive dot-decimal and
 * `unit` a string or null that `scaleToUnit` converts to the test's criterion unit. The fold refuses
 * the put with this reason on a v13 sheet (`ops/apply.ts`); the sheet shows it inline.
 */
export function manufacturerRefusal(test: TestDef, value: unknown): string | null {
  if (value === null) return null;
  if (!manufacturerApplies(test)) return MANUFACTURER_NOT_APPLICABLE_REFUSAL;
  if (typeof value !== 'object' || Array.isArray(value)) return MANUFACTURER_VALUE_REFUSAL;
  const override = value as { raw?: unknown; unit?: unknown };
  if (!isOverRangeRaw(override.raw)) return MANUFACTURER_VALUE_REFUSAL;
  if (override.unit !== null && typeof override.unit !== 'string') return manufacturerUnitRefusal(null);
  if (scaleToUnit(Number(override.raw), override.unit, criterionUnitOf(test)) === null) return manufacturerUnitRefusal(override.unit);
  return null;
}

/** What the sheet's "Valor do fabricante" entry reads from a typed text: the value to store (null: clear), or why it refuses it. */
export type ParsedManufacturerValue = { value: ManufacturerValue | null } | { refusal: string };

/**
 * Story 23.3: the manufacturer's value typed on the sheet (pt-BR, "80", "5,5", "5G" on an Ω-scale
 * criterion) in the unit its slot shows: the value to store, null for an emptied entry, or the same
 * refusal the fold gives (a negative, a zero, no number, an unconvertible unit), so nothing refused
 * is ever written.
 */
export function parseManufacturerValue(test: TestDef, typed: string, unit: string | null): ParsedManufacturerValue {
  const parsed = parseReadingPtBr(typed, { units: manufacturerUnitsOf(test), defaultUnit: unit });
  if (parsed === null) return { value: null };
  if (parsed === 'invalid') return { refusal: MANUFACTURER_VALUE_REFUSAL };
  const value: ManufacturerValue = { raw: parsed.raw, unit: parsed.unit };
  const refusal = manufacturerRefusal(test, value);
  return refusal === null ? { value } : { refusal };
}

/** The units the manufacturer's value entry offers: the insulation family's cycle on an MΩ-scale criterion, else the criterion's one unit. */
export function manufacturerUnitsOf(test: TestDef): readonly string[] {
  const unit = criterionUnitOf(test);
  if (unit !== null && INSULATION_UNITS.includes(unit)) return INSULATION_UNITS;
  return unit === null ? [] : [unit];
}

/** The text a manufacturer's value prints as a criterion on a table test: "≥ 5 GΩ" (a NETA minimum, approved at it). */
function minimumText(raw: string, unit: string | null): string {
  return `≥ ${formatDecimalGroupedPtBr(raw)}${unit === null ? '' : ` ${unit}`}`;
}

/**
 * Story 23.3: the criterion a well-formed manufacturer's value makes: on a table test `>=` the
 * value (the NETA tables approve at their minimum), else the seeded criterion's operator (`>` on
 * insulation, `<` on contact, `±` on the ratio; the bands' with no band for the plate); always the
 * source `Fabricante`. Null when the sheet holds none.
 */
export function manufacturerCriterion(block: Pick<BlockRow, 'sheet'>, test: TestDef): CriterionSeed | null {
  const value = manufacturerValueOf(block, test);
  if (value === null) return null;
  const seeded = criterionOf(test);
  const source = { name: MANUFACTURER_SOURCE_NAME, edition: null };
  const number = Number(value.raw);
  if (test.criterion_table !== undefined) {
    return { key: seeded.key, label: seeded.label, operator: '>=', value: number, unit: value.unit, type: 'absolute_min', source, usedBy: seeded.usedBy, text: minimumText(value.raw, value.unit) };
  }
  const base = seededCriterion(block, test) ?? (test.criterion_bands === undefined ? seeded : bandAsCriterion(test, test.criterion_bands.bands[0]!));
  // A `between` or `pass_fail` test never reaches here (`manufacturerApplies`), so `value_max` is never dropped.
  const criterion: CriterionSeed = { ...base, value: number, unit: value.unit, source };
  delete criterion.text;
  return criterion;
}

/**
 * Story 23.3: a manufacturer's value as a criterion text ("<80 µΩ", "≥ 5 GΩ"), read off any sheet
 * (the Conflict view's two sides, AC "its two values read as criterion texts"); null when the value
 * is not a well-formed one. The operator is the test's own, the plate's class or band left aside.
 */
export function manufacturerValueText(test: TestDef, value: unknown): string | null {
  const sheet = { nameplate: {}, checklist: {}, test: { [test.key]: { cells: {}, criterion_override: { value } } } } as unknown as BlockRow['sheet'];
  const criterion = manufacturerCriterion({ sheet }, test);
  return criterion === null ? null : formatCriterionValue(criterion);
}

/** Story 23.2: the table and the row of `row` (counted across the test's tables) inside it. */
function homeOfRow(test: TestDef, row: number): { table: TableDef; r: number } | null {
  let offset = 0;
  for (const table of test.tables) {
    if (row >= offset && row < offset + table.rows.length) return { table, r: row - offset };
    offset += table.rows.length;
  }
  return null;
}

/** A dot-decimal kV raw in V, exact (a decimal-point move, never a float product). */
function kvRawToVolts(raw: string): number {
  return Number(shiftDecimal(raw, 3));
}

/**
 * Story 23.2: a plate field's rated voltage in V: a number field (its stored unit, else the field's,
 * V or kV; a two-level "380/220" reads its higher side, `ratedVoltsOf`), or a voltage class ("15",
 * "13,8", in kV); null when empty, not a positive number, or a field of another kind.
 */
export function plateVolts(definition: Pick<BlockDefinition, 'nameplate'>, block: Pick<BlockRow, 'sheet'>, key: string): number | null {
  const field = definition.nameplate.find((candidate) => candidate.key === key);
  const value = block.sheet.nameplate[key]?.value;
  if (field === undefined || value === null || value === undefined) return null;
  if (field.kind === 'voltage_class') {
    if (typeof value !== 'string') return null;
    const kv = parseVoltageClassKv(value);
    if (kv === null) return null;
    const volts = kvRawToVolts(kv.replace(',', '.'));
    return Number.isFinite(volts) && volts > 0 ? volts : null;
  }
  if (field.kind !== 'number' || typeof value !== 'object' || Array.isArray(value)) return null;
  const stored = value as { raw?: unknown; unit?: unknown; state?: unknown };
  // Fix batch e23w (B-4, Bruno 2026-11-09): a TP's "13,8/√3" is judged by its class voltage, the numerator (13,8 kV).
  const numerator = field.over_sqrt3 === true && stored.state === 'measured' ? readOverSqrt3Raw(stored.raw) : null;
  const cell = numerator === null ? stored : { ...stored, raw: numerator };
  const unit = typeof cell.unit === 'string' && cell.unit !== '' ? cell.unit : (field.unit ?? null);
  // A kV reading moved by the decimal point, so 5 kV is exactly the 5000 V bound.
  if (unit === 'kV' && cell.state === 'measured' && typeof cell.raw === 'string' && DECIMAL.test(cell.raw)) {
    const volts = kvRawToVolts(cell.raw);
    return volts > 0 ? volts : null;
  }
  return ratedVoltsOf({ ...cell, unit });
}

/** A rated voltage as a helper reads it: "13,8 kV" from 1000 V up, else "380 V". */
function voltsText(volts: number): string {
  return volts >= 1000 ? `${formatDecimalGroupedPtBr(canonicalDecimal(String(volts / 1000)))} kV` : `${formatDecimalGroupedPtBr(canonicalDecimal(String(volts)))} V`;
}

// Story 23.2's `mediumOf` (the oil or dry column the oil rule picks) lives in `temperature-correction.ts` since batch
// e23v, which reads it for the correction's factor too.

/** One row's criterion and the helper that names where it comes from (`rowCriterion`). */
export interface RowCriterion {
  /** Null only on a band test with no band for the plate (as `effectiveCriterion`). */
  criterion: CriterionSeed | null;
  /** The source details of the row: the table row, the fallback's request, the manufacturer's line; null on a plain test. */
  helper: string | null;
  kind: 'manufacturer' | 'table' | 'fallback' | 'test';
}

/**
 * Story 23.2 (seed v13): the criterion one row of `test` is judged by. In order: the manufacturer's
 * value when well formed (Story 23.3, every row of the test); else, on a test with a
 * `criterion_table`, the table row the plate's rated voltage (and medium) picks, approved at its
 * minimum (`>=`, NETA); with the rating or the medium unreadable, the seeded criterion with a helper
 * asking for the plate value; else the test's criterion (`effectiveCriterion`). Every reader takes a
 * row's verdict through this, never its own rule (AD-1).
 */
export function rowCriterion(block: Pick<BlockRow, 'sheet'>, definition: BlockDefinition, test: TestDef, row: number): RowCriterion {
  const manufacturer = manufacturerCriterion(block, test);
  if (manufacturer !== null) return { criterion: manufacturer, helper: MANUFACTURER_SOURCE_LINE, kind: 'manufacturer' };
  const pick = test.criterion_table;
  if (pick === undefined) return { criterion: seededCriterion(block, test), helper: null, kind: 'test' };
  const seeded = criterionOf(test);
  const fallbackText = formatCriterionValue(seeded);
  const name = pick.table.name;
  const medium = pick.medium === undefined ? null : mediumOf(definition, block);
  // authored (Story 23.2, listed for Bruno): the two requests of a row the table cannot judge yet.
  if (pick.medium !== undefined && medium === null) {
    return { criterion: seeded, helper: `Sem o tipo de isolação na placa, vale ${fallbackText}. Informe-o para julgar pela ${name}.`, kind: 'fallback' };
  }
  const home = homeOfRow(test, row);
  const key = pick.voltage === 'winding' ? (home?.table.voltage_rows?.[home.r]?.winding ?? null) : pick.voltage.field;
  const volts = key === null ? null : plateVolts(definition, block, key);
  if (volts === null) {
    return { criterion: seeded, helper: `Sem a tensão nominal na placa, vale ${fallbackText}. Informe-a para julgar pela ${name}.`, kind: 'fallback' };
  }
  const found: CriterionTableRow = pick.table.rows.find((candidate) => candidate.up_to_v === null || volts <= candidate.up_to_v) ?? pick.table.rows[pick.table.rows.length - 1]!;
  const minimum = medium === null ? found.min! : medium === 'oil' ? found.oil! : found.dry!;
  const edition = `${found.source.name}-${found.source.edition ?? ''}`.replace(/-$/, '');
  const text = minimumText(String(minimum), found.unit);
  const criterion: CriterionSeed = {
    key: seeded.key,
    label: seeded.label,
    operator: '>=',
    value: minimum,
    unit: found.unit,
    type: 'absolute_min',
    source: { name: `${edition}, ${name}`, edition: found.source.edition },
    usedBy: seeded.usedBy,
    text,
  };
  // authored (Story 23.2, listed for Bruno): the row's source line.
  const parts = [`${name} (${edition})`, ...(medium === null ? [] : [medium === 'oil' ? 'óleo' : 'seco']), voltsText(volts)];
  return { criterion, helper: `${parts.join(', ')}: ${text}`, kind: 'table' };
}

/**
 * Story 23.4: the standard observation of a test whose reading above the instrument's limit meets
 * its criterion (base rev08, decision F), the limit as the cell stores it: "Valores de resistência
 * de isolamento superiores a 2 TΩ, limite de leitura do instrumento."
 */
export function instrumentLimitNoteText(raw: string, unit: string | null): string {
  return `Valores de resistência de isolamento superiores a ${formatDecimalGroupedPtBr(raw)}${unit === null || unit === '' ? '' : ` ${unit}`}, limite de leitura do instrumento.`;
}

/** Story 23.4: the note of a test with `instrument_limit_note`: from its first reading above the limit judged within, else null. */
function limitNoteOf(tables: readonly EvaluatedTable[]): string | null {
  for (const table of tables) {
    for (const row of table.rows) {
      for (const cell of row.cells) if (cell.role === 'capture' && cell.state === 'over_range' && cell.verdict === 'within') return instrumentLimitNoteText(cell.raw, cell.unit);
    }
  }
  return null;
}

/**
 * Story 23.4 (print): a row of a test with `instrument_limit_note` whose capture holds a reading above
 * the limit has no polarization index to state: its POLARIZAÇÃO prints N/A.
 */
export function polarizationNotApplicable(test: TestDef, row: EvaluatedRow): boolean {
  return test.instrument_limit_note === true && row.cells.some((cell) => cell.role === 'capture' && cell.state === 'over_range');
}

/** The entry's operator sign: the two inclusive operators in their typographic form. */
const OPERATOR_SIGNS: Readonly<Record<string, string>> = { '>=': '≥', '<=': '≤' };

/** The view of the sheet's "Valor do fabricante" entry on one test (Story 23.3, every seed version). */
export interface ManufacturerValueView {
  /** The sign before the value (`.mfr-op`): ">", "<", "≥", "±". */
  operator: string;
  /** The stored well-formed value, or null. */
  value: ManufacturerValue | null;
  /** The stored value as the entry shows it ("80", "5,5"); '' when none. */
  text: string;
  /** The units its slot takes, and the one it shows now (the stored one, else the criterion's). */
  units: readonly string[];
  unit: string | null;
  /** `.mfr-note`, its criterion in bold: the lead, the criterion text, the tail. */
  note: { lead: string; criterion: string; tail: string };
}

/**
 * Story 23.3: the "Valor do fabricante" entry of `test` on this sheet: the operator a value would
 * take, the stored value, its units and the note naming what it prevails over (or what holds while
 * it is empty). The criterion it names is the one the rows take without it: on a table test the
 * table's minima (or the seeded criterion while the plate cannot pick a row), else the test's.
 */
export function manufacturerValueView(block: Pick<BlockRow, 'sheet'>, definition: BlockDefinition, test: TestDef): ManufacturerValueView | null {
  if (!manufacturerApplies(test)) return null;
  const value = manufacturerValueOf(block, test);
  const without = withoutManufacturer(block, test);
  const rows = test.tables.reduce((count, table) => count + table.rows.length, 0);
  const criteria = Array.from({ length: rows }, (_, row) => rowCriterion(without, definition, test, row));
  const table = test.criterion_table !== undefined && criteria.every((one) => one.kind === 'table');
  const texts = [...new Set(criteria.map((one) => (one.criterion === null ? CRITERION_NOT_EVALUATED : formatCriterionValue(one.criterion))))];
  const shown = listPtBr(texts);
  const seeded = seededCriterion(without, test) ?? (test.criterion_bands === undefined ? criterionOf(test) : bandAsCriterion(test, test.criterion_bands.bands[0]!));
  // Review fix (item 3): the sign as the sheet writes it, never the ASCII ">=".
  const operator = test.criterion_table !== undefined ? '≥' : (OPERATOR_SIGNS[seeded.operator] ?? seeded.operator);
  const units = manufacturerUnitsOf(test);
  // authored (Story 23.3, from the `60-ficha.html` frames, listed for Bruno): the note beside the entry.
  const note =
    value !== null
      ? table
        ? { lead: 'Prevalece sobre a tabela, que pede ', criterion: shown, tail: '.' }
        : { lead: 'Prevalece sobre o critério do ensaio, ', criterion: shown, tail: '.' }
      : table
        ? { lead: 'Opcional. Vazio, vale a tabela (', criterion: shown, tail: ').' }
        : { lead: 'Opcional. Vazio, vale ', criterion: shown, tail: ', o critério do ensaio.' };
  return { operator, value, text: value === null ? '' : formatDecimalGroupedPtBr(value.raw), units, unit: value?.unit ?? criterionUnitOf(test), note };
}

// authored (Story 14.9): what a test reads when no criterion applies (the QGBT with no TENSÃO NOMINAL, or above 1000 V).
/** The criterion text of a test judged by no criterion. */
export const CRITERION_NOT_EVALUATED = 'critério não avaliado';

/** The source a test names: its criterion's, else (no band applies) the source of its bands. */
function sourceNameOf(test: TestDef, criterion: CriterionSeed | null): string {
  if (criterion !== null) return criterion.source.name;
  return test.criterion_bands?.bands[0]?.source.name ?? criterionOf(test).source.name;
}

function outHelperText(criterion: CriterionSeed): string {
  const text = formatCriterionValue(criterion);
  if (criterion.operator === '>' || criterion.operator === '>=') return `Abaixo do aceitável (${text})`;
  if (criterion.operator === '<' || criterion.operator === '<=') return `Acima do aceitável (${text})`;
  return `Fora do aceitável (${text})`;
}

/**
 * Batch e23v (Story 23.5): the helper of a reading judged out at 20 °C, its corrected value named, so
 * a raw value that reads above the criterion is never shown out without why. authored (Story 23.5,
 * listed for Bruno): "Abaixo do aceitável a 20 °C: 4 GΩ (≥ 5.000 MΩ)".
 */
function correctedOutHelperText(criterion: CriterionSeed, corrected: string): string {
  const text = formatCriterionValue(criterion);
  if (criterion.operator === '>' || criterion.operator === '>=') return `Abaixo do aceitável a 20 °C: ${corrected} (${text})`;
  if (criterion.operator === '<' || criterion.operator === '<=') return `Acima do aceitável a 20 °C: ${corrected} (${text})`;
  return `Fora do aceitável a 20 °C: ${corrected} (${text})`;
}

/**
 * Batch e23v (Stories 23.5 and 23.6, seed v13): what a table's readings are judged with beyond its
 * criterion: whether the test is corrected and its factor (null without a temperature), and the
 * previous visit its history rule reads. `PLAIN_JUDGING` on every test without either key.
 */
interface TableJudging {
  corrected: boolean;
  factor: number | null;
  previous: RestrictionPrevious;
  /** Seed v13, batch e23t (Story 23.16): the unit's medium, which makes the IP required on a dry unit; null when unknown or unread. */
  medium?: 'oil' | 'dry' | null;
  /** Fix batch e23w (W2-3): set by a table where a restriction rule flags a reading already out. */
  stands?: { value: boolean };
}

const NO_PREVIOUS: RestrictionPrevious = { entry: null, byAddress: new Map() };
const PLAIN_JUDGING: TableJudging = { corrected: false, factor: null, previous: NO_PREVIOUS };

// --- the polarization index (seed v13, batch e23t, Story 23.16) -----------------------------------

/** "1,0", "2,0", "0,8": an index as its class and helper say it, one decimal at least. */
function indexText(value: number): string {
  const decimals = Math.max(1, (canonicalDecimal(String(value)).split('.')[1] ?? '').length);
  return formatDecimalGroupedPtBr(value.toFixed(decimals));
}

/** authored (Story 23.16, listed for Bruno): the IP criterion as the helper and the conclusion state it, "IP ≥ 1,0". */
export function polarizationCriterionText(rule: PolarizationIndexRule): string {
  return `IP ≥ ${indexText(rule.min)}`;
}

/** The base's source of the IP classes (Base rev08 TR-OL-03, TR-SE-03), as the conclusion names it. */
const IP_SOURCE = 'NETA MTS-2023 7.2.1/7.2.2';

/**
 * Story 23.16: each `index` cell of one row. The IP (`polarization_index.column`) is N/A on a row
 * whose capture is above the instrument's limit (a stored value ignored), else judged by class:
 * below `min` out, below `restricted_below` restricted, from it on within; an empty IP is missing
 * only on a unit of `required_on` whose row holds a measured capture. The DAR, and any index no rule
 * names, is captured: never judged, never missing.
 */
function judgeIndexCells(table: TableDef, test: TestDef, cells: EvaluatedCell[], medium: 'oil' | 'dry' | null | undefined): void {
  const rule = test.polarization_index;
  const capture = cells.find((cell) => cell.role === 'capture');
  for (const cell of cells) {
    if (cell.role !== 'index') continue;
    const label = table.value_columns[cell.address.col]?.label;
    const kind = rule !== undefined && label === rule.column ? 'ip' : rule !== undefined && label === rule.dar_column ? 'dar' : 'plain';
    cell.missing = false;
    if (kind !== 'ip' || rule === undefined) {
      cell.index = { kind, notApplicable: false, required: false };
      continue;
    }
    if (capture?.state === 'over_range') {
      cell.index = { kind, notApplicable: true, required: false };
      cell.verdict = null;
      cell.displayText = NOT_APPLICABLE_TEXT;
      continue;
    }
    const required = medium === rule.required_on && capture?.state === 'measured';
    cell.index = { kind, notApplicable: false, required };
    cell.missing = required && cell.state === 'empty';
    if (cell.state !== 'measured') continue;
    const value = Number(cell.raw);
    if (!Number.isFinite(value)) continue;
    // authored (Story 23.16, listed for Bruno): the helper of an IP out of its class, and the restricted class's reason and sentence.
    if (value < rule.min) {
      cell.verdict = 'out';
      cell.helperText = `Abaixo do aceitável (${polarizationCriterionText(rule)})`;
    } else if (value < rule.restricted_below) {
      cell.verdict = 'restricted';
      cell.restriction = {
        reason: `IP de ${formatDecimalGroupedPtBr(cell.raw)}, abaixo de ${indexText(rule.restricted_below)}`,
        text: `IP de ${formatDecimalGroupedPtBr(cell.raw)}, abaixo de ${indexText(rule.restricted_below)}: isolação a acompanhar; a conclusão sobe para Com restrições.`,
      };
    } else cell.verdict = 'within';
  }
}

/** Story 23.16: the IPs out of their class of a test with `polarization_index`, as the conclusion and the points name them. */
function indexOutOf(test: TestDef, tables: readonly EvaluatedTable[]): NonNullable<TestEvaluation['indexOut']> {
  const rule = test.polarization_index!;
  return tables.flatMap((table) =>
    table.rows.flatMap((row) =>
      row.cells.flatMap((cell) =>
        cell.role === 'index' && cell.index?.kind === 'ip' && cell.verdict === 'out'
          ? [{ where: row.connection.filter((text) => text !== '').slice(0, 2).join('–'), valueText: `IP de ${cell.displayText}`, criterionText: polarizationCriterionText(rule), sourceName: IP_SOURCE }]
          : [],
      ),
    ),
  );
}

/** The typed columns of a table, in column order (seed v13, batch e23t: an `index` column is typed too). */
function typedColumns(table: TableDef): { col: number; column: ColumnDef }[] {
  return table.value_columns.flatMap((column, col) => (column.role === 'capture' || column.role === 'input' || column.role === 'index' ? [{ col, column }] : []));
}

/**
 * Every typed cell address of a test, in table order then row then column (the op log's addressing).
 * Story 23.8 (seed v13): given the block, a `rows_from` table's rows are its plate's taps (the rows the
 * fold accepts, `tap-rows.ts`); without one, or with the list empty, the seeded rows as before.
 */
export function cellAddressesOf(definition: BlockDefinition, testKey: TestKey, block?: Pick<BlockRow, 'sheet'>): CellAddress[] {
  const test = definition.tests.find((t) => t.key === testKey);
  if (test === undefined) return [];
  const out: CellAddress[] = [];
  let offset = 0;
  for (const table of test.tables) {
    const plan = block === undefined ? null : tapRowsOf(block, definition, table, testKey);
    const rows = plan === null ? table.rows.map((_, r) => offset + r) : plan.filter((entry) => entry.kind !== 'off_plate').map((entry) => offset + entry.row);
    for (const row of rows) for (const { col } of typedColumns(table)) out.push({ testKey, row, col });
    offset += table.rows.length;
  }
  return out;
}

/** The deviation of a ratio reading from the calculated ratio, in %, rounded clear of float noise. */
export function deviationPct(measured: number, calculated: number): number {
  return Math.round((Math.abs(measured - calculated) / calculated) * 100 * 1e9) / 1e9;
}

/** A ratio deviation as the conclusion and the failed-ratio rows print it: "4,17" (append " %"). */
export function formatDeviation(value: number): string {
  return formatDecimalGroupedPtBr(canonicalDecimal(value.toFixed(2)));
}

function formatCalculated(value: number): string {
  return formatDecimalGroupedPtBr(value.toFixed(2));
}

/**
 * One table's evaluation. `rowCriteria` (batch e23a) holds each row's criterion, by the row's index
 * across the test's tables, on a test judged row by row (a criterion table or a manufacturer's
 * value); null on every other test, whose rows all take `criterion`.
 */
function evaluateTable(
  block: BlockRow,
  definition: BlockDefinition,
  test: TestDef,
  criterion: CriterionSeed | null,
  table: TableDef,
  offset: number,
  rowCriteria: readonly RowCriterion[] | null = null,
  judging: TableJudging = PLAIN_JUDGING,
): EvaluatedTable {
  const ratio = test.key === 'relacao_transformacao';
  // Story 21.1: the vector group of a transformer ratio table (seed v9 and later), read from its plate.
  const resolution = ratio ? ratioGroupOf(block, table.ratio_factor) : null;
  const group = resolution?.group ?? null;
  const groupMissing = resolution !== null && group === null;
  // U1/U2's multiplier: the group's k, 1 on a table with no factor, none while a v11 table has no group.
  const factor = resolution === null ? 1 : group === null ? null : vectorGroupFactor(group.k);
  const captureCols = table.value_columns.flatMap((c, i) => (c.role === 'capture' ? [i] : []));
  /**
   * A column's label: on a group's three captures the group's pair of that phase, else the seed's;
   * e21g D1: while a v11 table waits for its group, a capture reads "Fase N" by capture index.
   */
  const labelOf = (column: ColumnDef, col: number): string => {
    if (groupMissing && column.role === 'capture') return vectorGroupNeutralCaptureLabel(captureCols.indexOf(col));
    if (group === null || column.role !== 'capture' || captureCols.length !== group.phases.length) return column.label;
    return vectorGroupCaptureLabel(group, captureCols.indexOf(col)) ?? column.label;
  };
  const columns: VisibleColumn[] = [];
  const derived = table.value_columns.flatMap((c, i) => (c.role === 'derived' ? [i] : []));
  table.value_columns.forEach((column, col) => {
    // Story 22.8: the voltage column is the table's `voltageColumn`, never a value column; batch e23e (Story 23.18): the choice column its `choiceColumn`.
    if (column.role === 'print' || column.role === 'voltage' || column.role === 'choice') return;
    const label = labelOf(column, col);
    columns.push({
      col,
      label,
      header: column.role === 'input' ? inputHeaderText(column.label, column.unit) : headerText(label),
      role: column.role as VisibleColumn['role'],
      unit: column.unit,
      derivedKind: column.role !== 'derived' ? null : col === derived[derived.length - 1] && derived.length > 1 ? 'condicao' : 'calculated',
    });
  });
  const typed = typedColumns(table);
  const inputs = typed.filter(({ column }) => column.role === 'input');
  // Seed v13, batch e23e (Story 23.18): the table's choice column, never a typed reading column.
  const choiceColumn = choiceColumnView(table);
  // Story 23.8 (seed v13): a `rows_from` table's rows are the plate's taps (`tap-rows.ts`); null keeps the seeded rows (v1 to v12).
  const plan = tapRowsOf(block, definition, table, test.key);
  const listUnit = plan === null ? null : (definition.nameplate.find((field) => field.key === table.rows_from)?.unit ?? null);
  const specs: { row: number; connection: readonly string[]; entry: TapRowPlan | null }[] =
    plan === null
      ? table.rows.map((connection, r) => ({ row: offset + r, connection, entry: null }))
      : plan.map((entry) => ({ row: offset + entry.row, connection: table.rows[entry.row] ?? [''], entry }));

  const rows: EvaluatedRow[] = specs.map(({ row, connection, entry }) => {
    // Batch e23a: the row's own criterion where the test is judged row by row, else the test's. A tap
    // row (Story 23.8, its `row` the tap in V) takes its table's seeded row's: a rows_from table has one.
    const own = rowCriteria === null ? null : (rowCriteria[row] ?? (entry === null ? null : (rowCriteria[offset] ?? null)));
    const rowCriterionValue = own === null ? criterion : own.criterion;
    const helper = rowCriterionValue === null ? null : outHelperText(rowCriterionValue);
    // Story 22.10: a ratio cell (a ± criterion), capture or input, never takes a reading above the limit.
    const overRange: OverRangeAllowance = ratio || rowCriterionValue?.operator === '±' ? { allowed: false, refusal: OVER_RANGE_RATIO_REFUSAL } : OVER_RANGE_ALLOWED;
    // A tap row reads its own tap as V PRIMÁRIO; a seeded row, and row 0 kept off the plate, read the plate as on v12.
    const tapPrimary = entry !== null && entry.volts !== null && entry.raw !== null ? entry : null;
    // A row of a v12 table, or a seeded row while TAPS is empty, requires its cells as on v12; a tap row only when marked.
    const tap = entry === null ? null : evaluatedTapOf(entry, listUnit);
    const required = tapRowRequired({ tap });
    const cells: EvaluatedCell[] = [];
    // The ratio: the effective primário / secundário, each typed or from the nameplate.
    let calculated: EvaluatedRow['calculated'] = null;
    const effective: (number | null)[] = [];
    for (const { col, column } of typed) {
      const address: CellAddress = { testKey: test.key, row, col };
      const stored = readStored(storedCell(block, address));
      // Story 22.10: a stored limit where the cell refuses one (an op written by hand or an old path) reads invalid: "> 2", no verdict.
      const refusedLimit = stored?.state === 'over_range' && !overRange.allowed;
      const state = refusedLimit ? 'invalid' : (stored?.state ?? 'empty');
      const unit = stored?.unit ?? column.unit;
      const cell: EvaluatedCell = {
        address,
        role: column.role as 'capture' | 'input' | 'index',
        column: headerText(labelOf(column, col)),
        state,
        raw: stored?.raw ?? '',
        unit,
        units: unitsOf(column),
        displayText:
          state === 'measured'
            ? formatDecimalGroupedPtBr(stored!.raw)
            : state === 'over_range' || refusedLimit
              ? overRangeDisplay(stored!.raw)
              : state === 'not_measured'
                ? '-'
                : state === 'invalid'
                  ? stored!.raw
                  : '—',
        overRange,
        source: state === 'empty' ? null : 'typed',
        fallback: null,
        verdict: null,
        helperText: null,
        outlier: null,
        missing: false,
      };
      if (column.role === 'index') {
        // Seed v13, batch e23t (Story 23.16): judged after the row's captures (`judgeIndexCells`).
        cell.overRange = { allowed: false, refusal: '' };
        if (stored?.state === 'over_range') {
          cell.state = 'invalid';
          cell.displayText = overRangeDisplay(stored.raw);
        }
      } else if (column.role === 'input') {
        const index = inputs.findIndex((input) => input.col === col);
        let base: string | null = null;
        if (state === 'measured') base = convertRatioUnit(stored!.raw, unit, column.unit === null ? null : column.unit);
        else if (state === 'empty') {
          // Story 23.8: a tap row's V PRIMÁRIO is its tap, moved into the column's unit; every other input reads the plate.
          const tapRaw = index === 0 && tapPrimary !== null ? convertRatioUnit(tapPrimary.raw!, listUnit, column.unit) : null;
          const fromPlate = tapRaw !== null ? { raw: tapRaw, text: formatDecimalGroupedPtBr(tapRaw) } : nameplateRatioFallback(block, definition, index, column.unit);
          if (fromPlate !== null) {
            cell.fallback = fromPlate;
            cell.source = 'nameplate';
            base = fromPlate.raw;
          }
        }
        const power = column.unit === null ? 0 : (RATIO_POWER[column.unit] ?? 0);
        effective[index] = base === null ? null : Number(shiftDecimal(base, power));
        // Story 23.8: a tap row's inputs come from the plate, which counts its own missing fields.
        cell.missing = state === 'empty' && cell.fallback === null && tap === null;
      } else {
        cell.missing = state === 'empty' && required;
      }
      cells.push(cell);
    }
    if (ratio && inputs.length === 2) {
      const [primary, secondary] = effective;
      // VAL CALCULADO exists only for a positive primário and secundário: a zero or negative
      // side would give a zero ratio and an infinite deviation.
      if (factor !== null && primary !== null && primary !== undefined && secondary !== null && secondary !== undefined && primary > 0 && secondary > 0) {
        // Story 15.6 (seed v9): the transformador de força's table multiplies U1/U2 by √3; Story 21.1
        // (seed v11, and v9/v10 with a group on the plate): by its vector group's k.
        const value = (primary / secondary) * factor;
        const raw = canonicalDecimal(value.toFixed(6));
        if (Number.isFinite(value) && Number(raw) > 0) calculated = { raw, text: formatCalculated(value) };
      }
    }
    // The verdicts: every measured capture against the criterion; Story 22.10: a limit the instrument passed by `overRangeVerdict`.
    for (const cell of cells) {
      if (cell.role !== 'capture') continue;
      // Batch e23v (Story 23.5, seed v13): a measured capture of a corrected test is judged by its value
      // at 20 °C; none without a temperature, and never a limit the instrument passed (Story 23.4 rules it).
      if (judging.corrected) {
        const raw = cell.state === 'measured' && judging.factor !== null ? correctedRaw(Number(cell.raw), judging.factor) : null;
        cell.corrected = raw === null ? null : { raw, unit: cell.unit, text: correctedText(raw, cell.unit) };
      }
      if ((cell.state !== 'measured' && cell.state !== 'over_range') || rowCriterionValue === null) continue;
      const value = Number(cell.raw);
      const corrected = cell.corrected ?? null;
      let within: boolean | null;
      try {
        if (cell.state === 'over_range') {
          const verdict = overRangeVerdict(value, cell.unit, rowCriterionValue);
          within = verdict === null ? null : verdict === 'within';
        } else if (ratio) within = calculated === null ? null : compareCriterion({ value: deviationPct(value, Number(calculated.raw)), unit: '%' }, rowCriterionValue);
        else within = compareCriterion({ value: corrected === null ? value : Number(corrected.raw), unit: cell.unit }, rowCriterionValue);
      } catch {
        within = null;
      }
      if (within !== null) {
        cell.verdict = within ? 'within' : 'out';
        cell.helperText = within ? null : corrected === null ? helper : correctedOutHelperText(rowCriterionValue, corrected.text);
      }
    }
    // Seed v13, batch e23t (Story 23.16): the row's IP and DAR, after its captures.
    if (test.polarization_index !== undefined || table.value_columns.some((column) => column.role === 'index')) judgeIndexCells(table, test, cells, judging.medium);
    const captures = cells.filter((cell) => cell.role === 'capture');
    // F42: one capture out of the criterion fails the row; every capture within passes it; otherwise unjudged.
    // Batch e23v (Story 23.6): a restricted capture is within its criterion here (B-8: SATISFATÓRIO).
    let condicao: EvaluatedRow['condicao'] = null;
    if (ratio && calculated !== null && captures.length > 0) {
      if (captures.some((cell) => cell.verdict === 'out')) condicao = 'INSATISFATÓRIO';
      else if (captures.every((cell) => cell.verdict === 'within' || cell.verdict === 'restricted')) condicao = 'SATISFATÓRIO';
    }
    // Seed v13, batch e23e (Story 23.18): the row's choice cell (POLARIDADE); an option that fails puts the row out.
    const choice = choiceColumn === null ? null : evaluateChoice(block, test.key, row, choiceColumn, required);
    if (choice !== null && choice.verdict === 'out') condicao = 'INSATISFATÓRIO';
    const withChoice = <T extends EvaluatedRow>(evaluatedRow: T): T => (choice === null ? evaluatedRow : { ...evaluatedRow, choice });
    // F42: a typed connection the seed leaves blank (TAP Nº) reads the plate's TAP ATUAL as typed.
    // Story 23.8: a tap row's TAP Nº is its position on the plate; a tap no longer on it shows none.
    if (tap !== null && tapPrimary !== null) {
      const position = tap.position === null ? '' : String(tap.position);
      return withChoice({ row, connection: connection.map(() => position), label: tapRowLabel(tap), cells, calculated, condicao, voltage: null, tap });
    }
    const shown = connection.map((text) => (table.connection_typed && text.trim() === '' ? (nameplateTap(block) ?? '') : readingLabelText(text)));
    const evaluated: EvaluatedRow = withChoice({ row, connection: shown, label: shown[0] ?? '', cells, calculated, condicao, voltage: rowTestVoltage(block, test, row, definition), tap });
    if (own !== null) {
      evaluated.criterion = own.criterion;
      evaluated.criterionText = own.criterion === null ? CRITERION_NOT_EVALUATED : formatCriterionValue(own.criterion);
      evaluated.criterionHelper = own.helper;
    }
    return evaluated;
  });

  // The units an empty cell shows: the previous row's, else the column's (Story 5.5 AC 2).
  // e22g S2: a row above the instrument's limit is skipped, its unit the limit's (the top of
  // range, "2 TΩ"), not a reading's: the last measured row's unit carries, else the column's.
  for (const { col } of typed) {
    let previous: string | null = null;
    rows.forEach((row, r) => {
      const cell = row.cells.find((c) => c.address.col === col)!;
      if (cell.state === 'empty' && r > 0 && cell.units.length > 1 && previous !== null) cell.unit = previous;
      if (cell.state !== 'over_range') previous = cell.unit;
    });
  }

  markOutliers(rows, typed);
  // Batch e23v (Stories 23.6 and 23.14, seed v13): the test's restriction rules over this table, on readings already within.
  // Fix batch e23w (B-6): first a pole that rose past the share since the previous visit is out; (W2-3) the rules also run on
  // readings already out, which only records that the restriction stands.
  if (test.restriction !== undefined) {
    const captures = typed.filter(({ column }) => column.role === 'capture');
    applyHistoryRise(test, rows, captures, judging.previous);
    if (applyRestrictions(test, rows, captures, judging.previous) && judging.stands !== undefined) judging.stands.value = true;
  }

  return {
    key: table.key,
    title: table.title === undefined ? null : sentenceCase(table.title),
    connectionHeaders: table.connection_columns.map(headerText),
    columns,
    rows,
    ratio,
    formulaHelper: group === null ? null : vectorGroupFormulaText(group.k),
    shortHelper: group === null ? null : vectorGroupShortText(group),
    groupHelper: resolution === null ? null : groupMissing ? vectorGroupMissingText(vectorGroupFieldLabel(definition)) : resolution.assumed ? (resolution.blank ? VECTOR_GROUP_EMPTY_TEXT : VECTOR_GROUP_UNRECOGNIZED_TEXT) : null,
    vectorGroup: group?.code ?? null,
    groupMissing,
    voltageColumn: voltageColumnView(table),
    ...(choiceColumn === null ? {} : { choiceColumn }),
  };
}

// --- e23e: Story 23.18 (the choice column, seed v13) ---------------------------------------------

/** Story 23.18: a table's choice column as the sheet draws it, or null (every table of v1 to v12). */
function choiceColumnView(table: TableDef): ChoiceColumn | null {
  const col = table.value_columns.findIndex((column) => column.role === 'choice');
  const column = col === -1 ? undefined : table.value_columns[col];
  if (column === undefined) return null;
  const fails = column.fails_on ?? [];
  return { col, label: column.label, header: headerText(column.label), options: (column.options ?? []).map((value) => ({ value, label: readingLabelText(value), fails: fails.includes(value) })) };
}

/** Story 23.18: the value a choice cell's put stores for `option` (the shape the measurement grammar's choices share). */
export function choiceCellValue(option: string): { raw: string; unit: null; state: 'measured' } {
  return { raw: option, unit: null, state: 'measured' };
}

/** Story 23.18: the option a stored choice cell holds, or null (empty, or an option the column does not hold). */
function storedChoice(value: unknown, options: readonly string[]): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const cell = value as { raw?: unknown; state?: unknown };
  return cell.state === 'measured' && typeof cell.raw === 'string' && options.includes(cell.raw) ? cell.raw : null;
}

/**
 * Story 23.18: whether a stored value is one a choice column takes: null (the clear) or exactly one
 * of its options as `choiceCellValue` stores it. The fold refuses any other put on the column.
 */
export function isChoiceCellValue(value: unknown, options: readonly string[]): boolean {
  if (value === null) return true;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  const cell = value as Record<string, unknown>;
  return Object.keys(cell).length === 3 && cell.unit === null && storedChoice(value, options) !== null;
}

/** Story 23.18: one row's choice cell, judged by the column's `fails_on`; missing while empty on a required row. */
function evaluateChoice(block: BlockRow, testKey: TestKey, row: number, column: ChoiceColumn, required: boolean): EvaluatedChoice {
  const raw = storedChoice(storedCell(block, { testKey, row, col: column.col })?.value, column.options.map((option) => option.value));
  const option = raw === null ? undefined : column.options.find((candidate) => candidate.value === raw);
  if (option === undefined) return { col: column.col, raw: '', displayText: '—', verdict: null, missing: required, helperText: null, outText: null };
  if (!option.fails) return { col: column.col, raw: option.value, displayText: option.label, verdict: 'within', missing: false, helperText: null, outText: null };
  const text = `${column.header} ${option.label.toLocaleLowerCase('pt-BR')}`;
  // authored (Story 23.18, from the mock `60-ficha.html` #/ficha/TP-C16): the helper under a row whose polarity fails.
  // authored (e24h, listed for Bruno): "…: a ficha fica Reprovado." (was "…: a ficha fica Reprovado e gera um ponto de atenção.").
  // authored (e24y, corrected by Bruno 2026-11-11): "…: a ficha fica como Reprovado." (was "…: a ficha fica Reprovado.").
  return { col: column.col, raw: option.value, displayText: option.label, verdict: 'out', missing: false, helperText: `${text}: a ficha fica como Reprovado.`, outText: text.toLocaleLowerCase('pt-BR') };
}

/** Story 23.18: the choice cells out of a test's tables, as the conclusion and the points name them ("Fase R", "polaridade invertida"). */
function choiceOutOf(tables: readonly EvaluatedTable[]): NonNullable<TestEvaluation['choiceOut']> {
  return tables.flatMap((table) => table.rows.flatMap((row) => (row.choice?.verdict === 'out' && row.choice.outText !== null ? [{ where: readingRowLabel(table.rows, row) || row.label, text: row.choice.outText }] : [])));
}

/** Story 23.18: every choice cell of the evaluations, in test, table and row order. */
export function evaluatedChoices(evaluations: readonly TestEvaluation[]): EvaluatedChoice[] {
  return evaluations.flatMap((test) => test.tables.flatMap((table) => table.rows.flatMap((row) => (row.choice === undefined ? [] : [row.choice]))));
}

/** Story 23.18 (`notice_when`): the test's notice while the plate's select holds one of its values, else null. */
function noticeOf(block: BlockRow, test: TestDef): string | null {
  const notice = test.notice_when;
  if (notice === undefined) return null;
  const value = block.sheet.nameplate[notice.field]?.value;
  return typeof value === 'string' && notice.values.includes(value) ? notice.text : null;
}

/** Story 22.8: a table's voltage column as the sheet draws it, or null (no voltage column). */
function voltageColumnView(table: TableDef): EvaluatedTable['voltageColumn'] {
  const col = voltageColumnOf(table);
  const column = col === -1 ? undefined : table.value_columns[col];
  if (column === undefined) return null;
  return { col, header: inputHeaderText(column.label, column.unit), options: column.options ?? [], unit: column.unit ?? 'kV' };
}

/**
 * E5-Q15: the power of ten nearest `ratio` on a log scale (970 reads 1000, not 100), never
 * below 100, the outlier threshold itself.
 */
function nearestPowerOfTen(ratio: number): number {
  return Math.max(100, 10 ** Math.round(Math.log10(ratio)));
}

/** The others' labels with the prefix they share with the row dropped: "Fase A", "Fase B" -> "A", "B". */
function othersText(label: string, others: string[]): string {
  const first = label.split(' ')[0];
  const shared = first !== undefined && label.includes(' ') && others.every((other) => other.startsWith(`${first} `));
  return listPtBr(shared ? others.map((other) => other.slice(first!.length + 1)) : others);
}

/**
 * FR-28: a measured capture at least 100x below (or above) every other measured capture of
 * the same table and column, with at least two others to compare: "Fase C 1000× abaixo de
 * A e B. Conferir?". A hint for the field, never a verdict.
 */
function markOutliers(rows: EvaluatedRow[], typed: { col: number; column: ColumnDef }[]): void {
  for (const { col, column } of typed) {
    if (column.role !== 'capture') continue;
    const measured = rows.flatMap((row) => {
      const cell = row.cells.find((c) => c.address.col === col)!;
      if (cell.state !== 'measured') return [];
      const value = scaleToUnit(Number(cell.raw), cell.unit, column.unit);
      return value === null ? [] : [{ row, cell, value }];
    });
    if (measured.length < 3 || measured.some((m) => !(m.value > 0))) continue;
    for (const target of measured) {
      const others = measured.filter((m) => m !== target);
      const below = Math.min(...others.map((m) => m.value / target.value));
      const above = Math.min(...others.map((m) => target.value / m.value));
      const direction = below >= 100 * (1 - 1e-9) ? 'abaixo' : above >= 100 * (1 - 1e-9) ? 'acima' : null;
      if (direction === null) continue;
      const factor = nearestPowerOfTen(direction === 'abaixo' ? below : above);
      const names = othersText(target.row.label, others.map((m) => m.row.label));
      target.cell.outlier = { text: `${target.row.label} ${factor}× ${direction} de ${names}. Conferir?` };
    }
  }
}

/**
 * One test sub-block's evaluation. Batch e23v (Stories 23.5 and 23.6): `visit` is the sheet's
 * `VisitContext` (the cabine's ambient, the previous visit), which only a v13 test with
 * `temperature_correction` or `restriction` reads; every other test evaluates the same with any.
 */
export function evaluateTest(block: BlockRow, definition: BlockDefinition, test: TestDef, visit: VisitContext = NO_VISIT_CONTEXT): TestEvaluation {
  // Batch e23a: a test with a criterion table, or a manufacturer's value, is judged row by row.
  const manufacturer = manufacturerCriterion(block, test);
  const byRow = manufacturer !== null || test.criterion_table !== undefined;
  const rowCount = test.tables.reduce((count, table) => count + table.rows.length, 0);
  const rowCriteria = byRow ? Array.from({ length: rowCount }, (_, row) => rowCriterion(block, definition, test, row)) : null;
  const first = rowCriteria?.[0]?.criterion ?? null;
  const uniform = rowCriteria === null || rowCriteria.every((one) => sameCriterion(one.criterion, first));
  const criterion = rowCriteria === null ? effectiveCriterion(block, test) : first;
  // Batch e23v (Stories 23.5 and 23.6, seed v13): the test's temperature, and the previous visit its history rule reads.
  const temperature = testTemperature(block, definition, test, visit);
  // Fix batch e24y (P5, Y1, seed v14 `history_needs_like_with_like`): readings corrected from the cabine's ambient (the plate's
  // temperature not typed) while the previous visit was corrected from its plate's are not alike, so the drop rule compares
  // none of them. Both from the ambient, both from the plate, or a previous visit whose plate is not known: compared, as v13.
  const unlike =
    temperature !== null &&
    !('missing' in temperature) &&
    temperature.source === 'ambient' &&
    seedRule(block.seed_version, 'history_needs_like_with_like') &&
    previousPlateMeasured(visit, temperature.medium === 'oil' ? test.temperature_correction?.oil_field : test.temperature_correction?.dry_field) === true;
  const judging: TableJudging =
    test.temperature_correction === undefined && test.restriction === undefined
      ? PLAIN_JUDGING
      : {
          corrected: test.temperature_correction !== undefined,
          factor: temperatureFactor(temperature),
          previous:
            (test.restriction?.history_drop_pct === undefined && test.restriction?.history_rise_out_pct === undefined) || visit.previous === null
              ? NO_PREVIOUS
              : // Batch e24p (Story 24.15): the history texts name the visit's date on a seed that turns `previous_visit_date` on.
                {
                  entry: visit.previous,
                  byAddress: previousReadingsByAddress(visit.previous, definition, block),
                  dateText: previousVisitDateText(visit.previous, block.seed_version),
                  ...(unlike ? { uncomparable: true as const } : {}),
                },
          stands: { value: false },
        };
  // Seed v13, batch e23t (Story 23.16): the IP is required on a unit of the medium its rule names.
  const judgingWithIndex: TableJudging = test.polarization_index === undefined ? judging : { ...judging, medium: mediumOf(definition, block) };
  const tables: EvaluatedTable[] = [];
  let offset = 0;
  for (const table of test.tables) {
    tables.push(evaluateTable(block, definition, test, criterion, table, offset, rowCriteria, judgingWithIndex));
    offset += table.rows.length;
  }
  const evaluation: TestEvaluation = {
    testKey: test.key,
    title: sentenceCase(test.label),
    criterion,
    criterionText: !uniform ? CRITERION_PER_ROW_TEXT : criterion === null ? CRITERION_NOT_EVALUATED : formatCriterionValue(criterion),
    sourceName: sourceNameOf(test, criterion),
    tables,
    classHelper: test.criterion_class_field !== undefined && classOf(block, test) === null ? ACCURACY_CLASS_HELPER : null,
  };
  if (!uniform) evaluation.perRow = true;
  if (manufacturer !== null) evaluation.manufacturer = { value: manufacturerValueOf(block, test)!, criterion: manufacturer, criterionText: formatCriterionValue(manufacturer) };
  if (rowCriteria !== null) {
    // Story 23.3: under the manufacturer's line, what the table would ask without it (a reminder).
    const underneath = manufacturer !== null && test.criterion_table !== undefined ? tableHelpersWithout(block, definition, test, rowCount) : [];
    evaluation.sourceLines = [...new Set([...rowCriteria.flatMap((one) => (one.helper === null ? [] : [one.helper])), ...underneath])];
    // Story 24.9 (F16): the fallback's request ("Sem o tipo de isolação na placa, vale …") shows under the criterion, not only in "Fonte do critério".
    const fallback = [...new Set(rowCriteria.flatMap((one) => (one.kind === 'fallback' && one.helper !== null ? [one.helper] : [])))];
    if (fallback.length > 0) evaluation.fallbackLines = fallback;
  }
  if (test.instrument_limit_note === true) evaluation.limitNote = limitNoteOf(tables);
  // Batch e23v (Stories 23.5 and 23.6, seed v13): the temperature's texts, and a prerequisite the plate fails.
  const view = temperatureView(test, temperature);
  if (view !== null) evaluation.temperature = view;
  if (test.restriction?.prerequisite !== undefined) evaluation.prerequisite = prerequisiteFailure(block, definition, test);
  // Seed v13, batch e23t (Story 23.16): the IPs out of their class.
  if (test.polarization_index !== undefined) evaluation.indexOut = indexOutOf(test, tables);
  // Fix batch e23w (W2-3): a rule flags a reading now out, so a stored `restricao` point does not read resolved.
  if (judging.stands?.value === true) evaluation.restrictionStands = true;
  // Seed v13, batch e23e (Story 23.18): the choice cells out, the plate's notice and the print note.
  if (tables.some((table) => table.choiceColumn !== undefined)) evaluation.choiceOut = choiceOutOf(tables);
  if (test.notice_when !== undefined) evaluation.notice = noticeOf(block, test);
  if (test.print_note !== undefined) evaluation.printNote = test.print_note;
  return evaluation;
}

/** The row helpers of a table test as they read with no manufacturer's value. */
function tableHelpersWithout(block: BlockRow, definition: BlockDefinition, test: TestDef, rowCount: number): string[] {
  const without = withoutManufacturer(block, test);
  return Array.from({ length: rowCount }, (_, row) => rowCriterion(without, definition, test, row).helper).filter((helper): helper is string => helper !== null);
}

/** The sheet as it reads with the test's manufacturer's value cleared. */
function withoutManufacturer<T extends Pick<BlockRow, 'sheet'>>(block: T, test: TestDef): T {
  return { ...block, sheet: { ...block.sheet, test: { ...block.sheet.test, [test.key]: { cells: {}, ...block.sheet.test[test.key], criterion_override: null } } } };
}

/** Two row criteria judge alike: the same operator, value, unit and text. */
function sameCriterion(a: CriterionSeed | null, b: CriterionSeed | null): boolean {
  if (a === null || b === null) return a === b;
  return a.operator === b.operator && a.value === b.value && a.unit === b.unit && (a.text ?? null) === (b.text ?? null) && a.source.name === b.source.name;
}

/**
 * THE evaluation: every enabled test of the sheet (AR-17: a disabled sub-block is ignored), in the definition's order.
 * Story 23.9 (seed v13): a test the nameplate makes not applicable is ignored too (`isTestInForce`), as a
 * switched-off sub-block is, by every reader of this evaluation; the screen draws its band from `testApplicability`.
 */
export function evaluateSheetReadings(block: BlockRow, definition: BlockDefinition, visit: VisitContext = NO_VISIT_CONTEXT): TestEvaluation[] {
  const enabled = enabledSubBlocksOf(block);
  return definition.tests.filter((test) => enabled.has(test.key) && isTestInForce(block, definition, test.key)).map((test) => evaluateTest(block, definition, test, visit));
}

/** Story 23.9: one enabled test of the seeded grammars as the sheet draws it, in the definition's order. */
export interface SheetTestSection {
  testKey: TestKey;
  /** The test's heading ("Ensaio de resistência ôhmica de contato"). */
  title: string;
  applicability: TestApplicability;
  /** Its evaluation (`evaluateSheetReadings`'s), null while the nameplate makes it not applicable: the sheet draws its band alone. */
  evaluation: TestEvaluation | null;
}

/**
 * Story 23.9 (seed v13): the Ensaios step's sections, every enabled test with its applicability,
 * an NA test without an evaluation; the evaluations it holds are `evaluateSheetReadings`'s, in the
 * same order, so the screen's run and cells read the one evaluation.
 */
export function sheetTestSections(block: BlockRow, definition: BlockDefinition, visit: VisitContext = NO_VISIT_CONTEXT): SheetTestSection[] {
  const enabled = enabledSubBlocksOf(block);
  return definition.tests
    .filter((test) => enabled.has(test.key))
    .map((test) => {
      const applicability = testApplicability(block, definition, test.key);
      return { testKey: test.key, title: sentenceCase(test.label), applicability, evaluation: applicability.state === 'na' ? null : evaluateTest(block, definition, test, visit) };
    });
}

/** Every evaluated cell of the sheet, test by test, table by table, row by row. */
export function evaluatedCells(evaluations: readonly TestEvaluation[]): EvaluatedCell[] {
  return evaluations.flatMap((test) => test.tables.flatMap((table) => table.rows.flatMap((row) => row.cells)));
}

/** Story 17.5: one ratio row whose CONDIÇÃO reads INSATISFATÓRIO. */
export interface FailedRatioRow {
  testKey: 'relacao_transformacao';
  /** The row's name as a person reads it: "Fase R"; on a typed TAP table "TAP 5", or "TAP" when blank. */
  label: string;
  /** The worst out capture's deviation from VAL CALCULADO, as `worstReadings` prints it ("4,17 %"); batch e23e: '' on a row failed by its choice alone. */
  deviationText: string;
  /** Batch e23e (Story 23.18): the row's failed choice ("polaridade invertida"); absent on a row it does not fail. */
  choiceText?: string;
}

/**
 * Story 17.5 (F42, E15-A2): THE reader of the ratio verdict. One entry per ratio row whose
 * `condicao` is INSATISFATÓRIO, in table order; the conclusion suggestion, its restriction
 * warning, the pre-issue stale row (through the conclusion basis) and the parecer read the
 * failed ratio only through it. Empty for a sheet with no ratio table, no capture, no VAL
 * CALCULADO or every capture within (a deviation exactly at the limit is within).
 */
export function failedRatioRows(evaluations: readonly TestEvaluation[]): FailedRatioRow[] {
  const out: FailedRatioRow[] = [];
  for (const test of evaluations) {
    if (test.testKey !== 'relacao_transformacao') continue;
    for (const table of test.tables) {
      // A typed TAP connection (the transformer) reads "TAP 5", or "TAP" alone when blank.
      const tap = table.connectionHeaders[0]?.toUpperCase().startsWith('TAP') === true;
      for (const [index, row] of table.rows.entries()) {
        // Batch e23e (Story 23.18): a row failed by its choice (a polarity INVERTIDA) fails with or without VAL CALCULADO.
        const choiceText = row.choice?.verdict === 'out' ? (row.choice.outText ?? undefined) : undefined;
        if (row.condicao !== 'INSATISFATÓRIO' || (row.calculated === null && choiceText === undefined)) continue;
        const deviationText = row.calculated !== null && row.cells.some((cell) => cell.role === 'capture' && cell.verdict === 'out') ? `${formatDeviation(worstDeviation(row))} %` : '';
        const extra = choiceText === undefined ? {} : { choiceText };
        // Story 23.8: a tap row is named by its tap ("TAP 3", "TAP 13,2 kV").
        if (row.tap !== null) {
          out.push({ testKey: 'relacao_transformacao', label: tapFailedRowLabel(row.tap), deviationText, ...extra });
          continue;
        }
        // authored (fx17r, R5): a connection row with no label is named by its 1-based position in its table
        const blank = row.label.trim() === '';
        const label = tap ? (blank ? 'TAP' : `TAP ${row.label}`) : blank ? `Linha ${index + 1}` : row.label;
        out.push({ testKey: 'relacao_transformacao', label, deviationText, ...extra });
      }
    }
  }
  return out;
}

/**
 * Batch e23e (Story 23.18, review fix): when every failed ratio row fails by its choice alone (a polarity INVERTIDA, no
 * capture out of its deviation), the choices' texts as the floor's reason and the parecer name the failure ("polaridade
 * invertida"); null when any row is out by its deviation, or none failed (every v1 to v12 sheet).
 */
export function choiceOnlyFailureText(rows: readonly FailedRatioRow[]): string | null {
  if (rows.length === 0 || !rows.every((row) => row.choiceText !== undefined && row.deviationText === '')) return null;
  return listPtBr([...new Set(rows.map((row) => row.choiceText!))]);
}

/** A ratio row's worst out capture's deviation from its VAL CALCULADO, in %. */
function worstDeviation(row: EvaluatedRow): number {
  const calculated = Number(row.calculated!.raw);
  let worst = -Infinity;
  for (const cell of row.cells) {
    if (cell.role === 'capture' && cell.verdict === 'out') worst = Math.max(worst, deviationPct(Number(cell.raw), calculated));
  }
  return worst;
}

export function sameAddress(a: CellAddress, b: CellAddress): boolean {
  return a.testKey === b.testKey && a.row === b.row && a.col === b.col;
}

/** Story 5.5 AC 2: the unit a cell's slot shows before it holds a value: the previous row's, else the column's. */
export function unitDefaultFor(evaluation: TestEvaluation, address: CellAddress): string | null {
  for (const table of evaluation.tables) {
    const at = table.rows.findIndex((row) => row.row === address.row);
    if (at === -1) continue;
    const column = table.columns.find((c) => c.col === address.col);
    if (at > 0) {
      const previous = table.rows[at - 1]!.cells.find((cell) => cell.address.col === address.col);
      if (previous !== undefined) return previous.unit;
    }
    return column?.unit ?? null;
  }
  return null;
}
