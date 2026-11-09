import { canonicalDecimal, formatDecimalGroupedPtBr, INSULATION_UNITS, parseReadingPtBr } from '../parse/pt-br-number.ts';
import type { BlockRow } from '../schemas/entities.ts';
import { compareCriterion, formatCriterionValue, scaleToUnit, SEEDED_CRITERIA, type CriterionSeed } from '../seed/criteria.ts';
import type { CriterionTableRow } from '../seed/criteria-tables.ts';
import { SELV_YES, type BandCriterion, type BlockDefinition, type ColumnDef, type TableDef, type TestDef } from '../seed/schema.ts';
import { selectOptionFor } from '../seed/select-option.ts';
import { parseVoltageClassKv } from '../registry/word-row.ts';
import { listPtBr } from '../text/plural.ts';
import { ACCURACY_CLASS_HELPER, accuracyClassDeviation, parseAccuracyClass } from './accuracy-class.ts';
import { isOverRangeRaw, OVER_RANGE_ALLOWED, OVER_RANGE_RATIO_REFUSAL, overRangeDisplay, overRangeVerdict, type OverRangeAllowance } from './over-range.ts';
import { ratedVoltsOf, rowTestVoltage, voltageColumnOf } from './row-voltage.ts';
import { enabledSubBlocksOf } from './sheet-state.ts';
import {
  convertRatioUnit,
  DECIMAL,
  headerText,
  inputHeaderText,
  nameplateRatioInput,
  nameplateTap,
  ratioGroupOf,
  RATIO_POWER,
  readingLabelText,
  readStored,
  sentenceCase,
  shiftDecimal,
  storedCell,
  unitsOf,
  type CellAddress,
  type EvaluatedCell,
  type EvaluatedRow,
  type EvaluatedTable,
  type ManufacturerValue,
  type TestEvaluation,
  type TestKey,
  type VisibleColumn,
} from './reading-cells.ts';
import { VECTOR_GROUP_EMPTY_TEXT, VECTOR_GROUP_MISSING_TEXT, VECTOR_GROUP_UNRECOGNIZED_TEXT, vectorGroupCaptureLabel, vectorGroupNeutralCaptureLabel, vectorGroupFactor, vectorGroupFormulaText, vectorGroupShortText } from './vector-group.ts';

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

/** A nameplate number cell as a value in V (a stored kV is moved into V), or null when it holds no positive number. */
export function voltsOf(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const cell = value as { raw?: unknown; unit?: unknown; state?: unknown };
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
export function manufacturerValueOf(block: Pick<BlockRow, 'sheet'>, test: TestDef): ManufacturerValue | null {
  const value = block.sheet.test[test.key]?.criterion_override?.value;
  return manufacturerRefusal(test, value) === null && value !== null && value !== undefined ? (value as unknown as ManufacturerValue) : null;
}

/**
 * Story 23.3 ("refused, never ignored"): why a manufacturer's value cannot be stored on `test`, or
 * null when it can: null itself (the clear) or `{raw, unit}` with `raw` a positive dot-decimal and
 * `unit` a string or null that `scaleToUnit` converts to the test's criterion unit. The fold refuses
 * the put with this reason on a v13 sheet (`ops/apply.ts`); the sheet shows it inline.
 */
export function manufacturerRefusal(test: TestDef, value: unknown): string | null {
  if (value === null) return null;
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
  const criterion: CriterionSeed = { ...base, value: number, unit: value.unit, source };
  delete criterion.value_max;
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
function plateVolts(definition: BlockDefinition, block: Pick<BlockRow, 'sheet'>, key: string): number | null {
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
  const cell = value as { raw?: unknown; unit?: unknown; state?: unknown };
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

/** Story 23.2: the oil or dry column the definition's oil rule picks from the plate; null while its field is empty. */
function mediumOf(definition: BlockDefinition, block: Pick<BlockRow, 'sheet'>): 'oil' | 'dry' | null {
  const rule = definition.oil_rule;
  if (rule === undefined) return null;
  const value = block.sheet.nameplate[rule.field]?.value;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const field = definition.nameplate.find((candidate) => candidate.key === rule.field);
  const option = field === undefined ? value.trim() : (selectOptionFor(field, value) ?? value.trim());
  return rule.oil_values.includes(option) ? 'oil' : 'dry';
}

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
export function manufacturerValueView(block: Pick<BlockRow, 'sheet'>, definition: BlockDefinition, test: TestDef): ManufacturerValueView {
  const value = manufacturerValueOf(block, test);
  const without = withoutManufacturer(block, test);
  const rows = test.tables.reduce((count, table) => count + table.rows.length, 0);
  const criteria = Array.from({ length: rows }, (_, row) => rowCriterion(without, definition, test, row));
  const table = test.criterion_table !== undefined && criteria.every((one) => one.kind === 'table');
  const texts = [...new Set(criteria.map((one) => (one.criterion === null ? CRITERION_NOT_EVALUATED : formatCriterionValue(one.criterion))))];
  const shown = listPtBr(texts);
  const seeded = seededCriterion(without, test) ?? (test.criterion_bands === undefined ? criterionOf(test) : bandAsCriterion(test, test.criterion_bands.bands[0]!));
  const operator = test.criterion_table !== undefined ? '≥' : seeded.operator;
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

/** The typed columns of a table, in column order. */
function typedColumns(table: TableDef): { col: number; column: ColumnDef }[] {
  return table.value_columns.flatMap((column, col) => (column.role === 'capture' || column.role === 'input' ? [{ col, column }] : []));
}

/** Every typed cell address of a test, in table order then row then column (the op log's addressing). */
export function cellAddressesOf(definition: BlockDefinition, testKey: TestKey): CellAddress[] {
  const test = definition.tests.find((t) => t.key === testKey);
  if (test === undefined) return [];
  const out: CellAddress[] = [];
  let offset = 0;
  for (const table of test.tables) {
    for (let r = 0; r < table.rows.length; r++) for (const { col } of typedColumns(table)) out.push({ testKey, row: offset + r, col });
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
    // Story 22.8: the voltage column is the table's `voltageColumn`, never a value column.
    if (column.role === 'print' || column.role === 'voltage') return;
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
  const rows: EvaluatedRow[] = table.rows.map((connection, r) => {
    const row = offset + r;
    // Batch e23a: the row's own criterion where the test is judged row by row, else the test's.
    const own = rowCriteria === null ? null : (rowCriteria[row] ?? null);
    const rowCriterionValue = own === null ? criterion : own.criterion;
    const helper = rowCriterionValue === null ? null : outHelperText(rowCriterionValue);
    // Story 22.10: a ratio cell (a ± criterion), capture or input, never takes a reading above the limit.
    const overRange: OverRangeAllowance = ratio || rowCriterionValue?.operator === '±' ? { allowed: false, refusal: OVER_RANGE_RATIO_REFUSAL } : OVER_RANGE_ALLOWED;
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
        role: column.role as 'capture' | 'input',
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
      if (column.role === 'input') {
        const index = inputs.findIndex((input) => input.col === col);
        let base: string | null = null;
        if (state === 'measured') base = convertRatioUnit(stored!.raw, unit, column.unit === null ? null : column.unit);
        else if (state === 'empty') {
          const fromPlate = nameplateRatioInput(block, definition, index, column.unit);
          if (fromPlate !== null) {
            cell.fallback = { raw: fromPlate, text: formatDecimalGroupedPtBr(fromPlate) };
            cell.source = 'nameplate';
            base = fromPlate;
          }
        }
        const power = column.unit === null ? 0 : (RATIO_POWER[column.unit] ?? 0);
        effective[index] = base === null ? null : Number(shiftDecimal(base, power));
        cell.missing = state === 'empty' && cell.fallback === null;
      } else {
        cell.missing = state === 'empty';
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
      if (cell.role !== 'capture' || (cell.state !== 'measured' && cell.state !== 'over_range') || rowCriterionValue === null) continue;
      const value = Number(cell.raw);
      let within: boolean | null;
      try {
        if (cell.state === 'over_range') {
          const verdict = overRangeVerdict(value, cell.unit, rowCriterionValue);
          within = verdict === null ? null : verdict === 'within';
        } else if (ratio) within = calculated === null ? null : compareCriterion({ value: deviationPct(value, Number(calculated.raw)), unit: '%' }, rowCriterionValue);
        else within = compareCriterion({ value, unit: cell.unit }, rowCriterionValue);
      } catch {
        within = null;
      }
      if (within !== null) {
        cell.verdict = within ? 'within' : 'out';
        cell.helperText = within ? null : helper;
      }
    }
    const captures = cells.filter((cell) => cell.role === 'capture');
    // F42: one capture out of the criterion fails the row; every capture within passes it; otherwise unjudged.
    let condicao: EvaluatedRow['condicao'] = null;
    if (ratio && calculated !== null && captures.length > 0) {
      if (captures.some((cell) => cell.verdict === 'out')) condicao = 'INSATISFATÓRIO';
      else if (captures.every((cell) => cell.verdict === 'within')) condicao = 'SATISFATÓRIO';
    }
    // F42: a typed connection the seed leaves blank (TAP Nº) reads the plate's TAP ATUAL as typed.
    const shown = connection.map((text) => (table.connection_typed && text.trim() === '' ? (nameplateTap(block) ?? '') : readingLabelText(text)));
    const evaluated: EvaluatedRow = { row, connection: shown, label: shown[0] ?? '', cells, calculated, condicao, voltage: rowTestVoltage(block, test, row) };
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

  return {
    key: table.key,
    title: table.title === undefined ? null : sentenceCase(table.title),
    connectionHeaders: table.connection_columns.map(headerText),
    columns,
    rows,
    ratio,
    formulaHelper: group === null ? null : vectorGroupFormulaText(group.k),
    shortHelper: group === null ? null : vectorGroupShortText(group),
    groupHelper: resolution === null ? null : groupMissing ? VECTOR_GROUP_MISSING_TEXT : resolution.assumed ? (resolution.blank ? VECTOR_GROUP_EMPTY_TEXT : VECTOR_GROUP_UNRECOGNIZED_TEXT) : null,
    vectorGroup: group?.code ?? null,
    groupMissing,
    voltageColumn: voltageColumnView(table),
  };
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

/** One test sub-block's evaluation. */
export function evaluateTest(block: BlockRow, definition: BlockDefinition, test: TestDef): TestEvaluation {
  // Batch e23a: a test with a criterion table, or a manufacturer's value, is judged row by row.
  const manufacturer = manufacturerCriterion(block, test);
  const byRow = manufacturer !== null || test.criterion_table !== undefined;
  const rowCount = test.tables.reduce((count, table) => count + table.rows.length, 0);
  const rowCriteria = byRow ? Array.from({ length: rowCount }, (_, row) => rowCriterion(block, definition, test, row)) : null;
  const first = rowCriteria?.[0]?.criterion ?? null;
  const uniform = rowCriteria === null || rowCriteria.every((one) => sameCriterion(one.criterion, first));
  const criterion = rowCriteria === null ? effectiveCriterion(block, test) : first;
  const tables: EvaluatedTable[] = [];
  let offset = 0;
  for (const table of test.tables) {
    tables.push(evaluateTable(block, definition, test, criterion, table, offset, rowCriteria));
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
  }
  if (test.instrument_limit_note === true) evaluation.limitNote = limitNoteOf(tables);
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

/** THE evaluation: every enabled test of the sheet (AR-17: a disabled sub-block is ignored), in the definition's order. */
export function evaluateSheetReadings(block: BlockRow, definition: BlockDefinition): TestEvaluation[] {
  const enabled = enabledSubBlocksOf(block);
  return definition.tests.filter((test) => enabled.has(test.key)).map((test) => evaluateTest(block, definition, test));
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
  /** The worst out capture's deviation from VAL CALCULADO, as `worstReadings` prints it ("4,17 %"). */
  deviationText: string;
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
        if (row.condicao !== 'INSATISFATÓRIO' || row.calculated === null) continue;
        const calculated = Number(row.calculated.raw);
        let worst = -Infinity;
        for (const cell of row.cells) {
          if (cell.role === 'capture' && cell.verdict === 'out') worst = Math.max(worst, deviationPct(Number(cell.raw), calculated));
        }
        // authored (fx17r, R5): a connection row with no label is named by its 1-based position in its table
        const blank = row.label.trim() === '';
        const label = tap ? (blank ? 'TAP' : `TAP ${row.label}`) : blank ? `Linha ${index + 1}` : row.label;
        out.push({ testKey: 'relacao_transformacao', label, deviationText: `${formatDeviation(worst)} %` });
      }
    }
  }
  return out;
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
