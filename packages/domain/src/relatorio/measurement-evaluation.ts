import { formatDecimalGroupedPtBr, INSULATION_UNITS, parseOverRangePtBr, parseReadingPtBr, type ParsedReading } from '../parse/pt-br-number.ts';
import type { BlockRow, Cell, JsonValue } from '../schemas/entities.ts';
import { isBaseEquipmentBlockType, isEquipmentBlockType } from '../schemas/block-config.ts';
import { formatCriterionValue, scaleToUnit, SEEDED_CRITERIA } from '../seed/criteria.ts';
import type {
  ConfigField,
  InstrumentOf,
  MeasurementColumn,
  MeasurementCriterion,
  MeasurementKind,
  MeasurementValueKind,
  MeasurementOption,
  MeasurementRow,
  MeasurementTest,
  MeasurementTestKey,
  MeasurementValue,
  WhenConfig,
} from '../seed/measurement.ts';
import type { BlockDefinition, FieldDef } from '../seed/schema.ts';
import {
  isReadingValue,
  OVER_RANGE_ALLOWED,
  OVER_RANGE_COMPARED_REFUSAL,
  overRangeDisplay,
  overRangeMissingLimitText,
  overRangeVerdict,
  rangeInUnits,
  type InstrumentRange,
  type OverRangeAllowance,
} from './over-range.ts';
import { readStored, type ReadingState, type ReadingVerdict } from './reading-cells.ts';
import { testApplicability, type TestApplicability } from './applicability.ts';
import { enabledSubBlocksOf } from './sheet-state.ts';
import { formatDateOfInstant } from '../format/datetime.ts';
import { canonicalDecimal } from '../parse/pt-br-number.ts';
import { previousReadingsByAddress, readingAddressKey, type LastResultReading, type PreviousResults } from '../print/reading-slots.ts';
import { previousVisitDateText } from '../print/visit-date.ts';
import { seedRule } from '../seed/definitions.ts';
import {
  correctedRaw,
  correctedText,
  mediumOf,
  WINDING_DIGITS,
  WINDING_REFERENCE_C,
  windingFactor,
  windingMaterial,
  windingMaterialMissingText,
  windingTemperature,
  windingTemperatureView,
  type TestTemperatureView,
} from './temperature-correction.ts';
import { NO_VISIT_CONTEXT, type VisitContext } from './visit-context.ts';

/*
 * Story 14.5 (seed v5): THE evaluation of a sheet's measurement tests, the tests of the
 * measurement-table grammar (`seed/measurement.ts`; today the six of the Chave de
 * transferência automática). It is to those tests what `evaluateSheetReadings` is to the four
 * seeded grammars, and the same consumers read both: `sheetProgress` counts what is missing
 * and out of criterion, `conclusionFloor` (Story 22.4; formerly `suggestConclusionPair`) and `composeConclusion` read the out readings,
 * section 9 prints the tables. Nothing in `apps/*` judges a cell, hides a row or composes a
 * line of its own (AD-1/AD-13).
 *
 * Addressing is the op log's: `row` is the index in the test's `rows` and `col` in its
 * `columns`; a row the block's configuration hides keeps its index, is left out of the
 * evaluation (not shown, counted, judged or printed) and keeps whatever its cells hold.
 */

// --- the block's configuration ----------------------------------------------------------------

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * The option key of every configuration field of the definition: the one the block's config
 * holds (`BlockConfig.options[key]`) when it is an option of the field, else the field's
 * default. A definition with no configuration answers `{}`.
 */
export function configOptionsOf(block: Pick<BlockRow, 'config'>, definition: Pick<BlockDefinition, 'config_fields'>): Record<string, string> {
  const stored = record(record(block.config).options);
  const out: Record<string, string> = {};
  for (const field of definition.config_fields ?? []) {
    const value = stored[field.key];
    out[field.key] = typeof value === 'string' && field.options.some((option) => option.key === value) ? value : field.default;
  }
  return out;
}

/** One configuration field as the sheet draws and prints it: its options and the one in force. */
export interface ConfigFieldView {
  key: string;
  label: string;
  options: readonly MeasurementOption[];
  /** The option key in force: the stored one, else the default. */
  value: string;
  /** The label of the option in force ("BT", "4", "Chaveado"). */
  valueLabel: string;
}

/** The configuration fields of a sheet, in the definition's order; none for a type with no configuration. */
export function configFieldsOf(block: Pick<BlockRow, 'config'>, definition: Pick<BlockDefinition, 'config_fields'>): ConfigFieldView[] {
  const values = configOptionsOf(block, definition);
  return (definition.config_fields ?? []).map((field: ConfigField) => {
    const value = values[field.key]!;
    return { key: field.key, label: field.label, options: field.options, value, valueLabel: field.options.find((option) => option.key === value)?.label ?? value };
  });
}

/**
 * The block's config with one configuration field set: the value of the `block/{id}/config`
 * put the sheet's Configuração writes (structure: it never moves a Rascunho relatório). Every
 * other key of the config is kept as it is.
 */
export function blockConfigWithOption(config: unknown, fieldKey: string, optionKey: string): JsonValue {
  const base = record(config);
  return { ...base, options: { ...record(base.options), [fieldKey]: optionKey } } as JsonValue;
}

/**
 * The block's config with one sub-block switched: the value of the `block/{id}/config` put a
 * measurement test's switch writes (`sub_blocks[key].enabled`). Every other key is kept.
 */
export function blockConfigWithSubBlock(config: unknown, key: string, enabled: boolean): JsonValue {
  const base = record(config);
  const subBlocks = record(base.sub_blocks);
  return { ...base, sub_blocks: { ...subBlocks, [key]: { ...record(subBlocks[key]), enabled } } } as JsonValue;
}

function holds(when: WhenConfig | undefined, config: Readonly<Record<string, string>>): boolean {
  if (when === undefined) return true;
  const value = config[when.config];
  return value !== undefined && when.in.includes(value);
}

// --- the evaluation's shape -------------------------------------------------------------------

export interface MeasurementAddress {
  testKey: MeasurementTestKey;
  /** The index in the test's `rows` (the op path's `row`). */
  row: number;
  /** The index in the test's `columns` (the op path's `col`). */
  col: number;
}

export interface EvaluatedMeasurementColumn {
  col: number;
  key: string;
  label: string;
  /** The column's own kind and unit; a row may override them for its cells. */
  kind: MeasurementKind;
  unit: string | null;
  optional: boolean;
}

export interface EvaluatedMeasurementCell {
  address: MeasurementAddress;
  rowKey: string;
  columnKey: string;
  /** The column's label ("Lado Emergência"), for the cell's accessible name and the phone card. */
  column: string;
  kind: MeasurementKind;
  /** A fixed cell's text ("limite 10 s", "—"): drawn as text, never typed, never required. Null on a typed cell. */
  fixed: string | null;
  optional: boolean;
  state: ReadingState;
  /** The stored dot-decimal raw of a number, the option key of a choice; '' when nothing valid is stored. */
  raw: string;
  /** A number's unit: the stored one, else the previous row's, else the row's or the column's. Null on a choice and on a fixed cell. */
  unit: string | null;
  /** The units the unit slot may take: the insulation family (a tap-cycle) or the one fixed unit. */
  units: readonly string[];
  /** A choice's options; none on a number. */
  options: readonly MeasurementOption[];
  /** The value as the cell shows it: "3.300", "> 2.000" (over range), "Ligado", "-" (not measured), "—" (empty), the fixed text. */
  displayText: string;
  /**
   * Story 22.10: whether a number cell takes a reading above the instrument's limit, and the
   * refusal when not (a cell a `relative_to_lowest` or `equals_column` criterion in force
   * compares with others). A choice or a fixed cell never takes one.
   */
  overRange: OverRangeAllowance;
  verdict: ReadingVerdict | null;
  /** Why the cell is out of criterion ("62 % acima do menor do lado (39 µΩ) — critério ≤ 50 %"), else null. */
  helperText: string | null;
  /** The wording and the source of the criterion that put the cell out; null on any other cell. */
  criterionText: string | null;
  sourceName: string | null;
  /** How far beyond its criterion an out cell is (a ratio, for ranking the worst); 0 where no distance exists. */
  excess: number;
  /** Counted by `sheetProgress`: a typed, non-optional cell with nothing stored. */
  missing: boolean;
  /**
   * Epic 14 QA Q-3: a number cell a `relative_to_lowest` criterion in force judges takes only
   * a reading above zero (a zero or negative one has no percentage above the lowest). The
   * message the field shows when such a value is typed ("Informe um valor maior que zero: …"),
   * else null: the field refuses it at input (`parseMeasurementReadingPtBr`).
   */
  positiveOnlyText: string | null;
  /**
   * Epic 14 QA Q-3: a stored zero or negative reading on such a cell (an older op): no verdict,
   * a "Conferir" helper, and the sheet's suggestion withheld while it stands.
   */
  toCheck: boolean;
  /*
   * Seed v13, batch e23t (Stories 23.15 and 23.19). Present only on a cell of a test whose
   * definition carries the key the field names; absent on every cell of v5 to v12.
   */
  /**
   * Story 23.15 (`winding_correction`): the measured value corrected to 75 °C, in its own unit
   * ("1,17 Ω"); null without a temperature or a material, above the instrument's limit and on a
   * cell holding no reading.
   */
  corrected?: { raw: string; unit: string | null; text: string } | null;
  /**
   * Stories 23.15 and 23.19 (a `phase_deviation` criterion's restricted band, the history rule):
   * why the cell is restricted (`verdict` `restricted`): the short reason the points and the
   * conclusion name, and the helper's sentence after the screen's "Com restrição:".
   * Fix batch e23p (P3): `pointReason`, set when the history rule flags the cell, is `reason` with the
   * history finding followed by both corrected values ("variação de mais de 2 % desde a manutenção
   * anterior (de 2,3 Ω para 3,5 Ω, a 75 °C)"); only the derived point reads it.
   * Batch e24p (Story 24.16): `history`, set only when the history rule flags the cell, is that
   * rule's reason with both corrected values, which the history note under the printed table names.
   */
  restriction?: { reason: string; text: string; pointReason?: string; history?: string } | null;
  /**
   * Batch e24p (Story 24.16, review fix): on a cell already out by its criterion that the history
   * rule (the winding variation) also flags, the rule's reason with both corrected values, as
   * `restriction.history` holds it on a restricted cell. The verdict and `restriction` stay as they
   * were; only the history note reads it. Fix batch e24y (P4): also on a cell the deviation between
   * phases already restricted, whose own restriction carries no history.
   */
  historyOut?: string;
}

export interface EvaluatedMeasurementRow {
  /** The index in the test's `rows` (the op path's `row`). */
  row: number;
  key: string;
  label: string;
  cells: EvaluatedMeasurementCell[];
}

/** The row under the table that shows each column's lowest measured value (E1's "Menor do lado"). */
export interface MeasurementReference {
  label: string;
  /**
   * One entry per column, in column order: the lowest measured value as shown ("36") and its
   * unit, and the two together (`text`, "36 µΩ"); all null while the column holds no measured value.
   */
  cells: { columnKey: string; column: string; value: string | null; unit: string | null; text: string | null }[];
}

export interface EvaluatedMeasurementValue {
  key: string;
  label: string;
  /** Seed v14, batch e24s (Story 24.14): a value may be `text` (the oil sampling's "Descreva o motivo"), its `raw` the text as typed. */
  kind: MeasurementValueKind;
  unit: string | null;
  options: readonly MeasurementOption[];
  optional: boolean;
  /** The labelled row the value is gathered into after the table, or null. */
  group: string | null;
  /** False while the value it depends on says otherwise: then not drawn, not required and not printed. */
  shown: boolean;
  state: ReadingState;
  raw: string;
  /** "62 %", "Com carga", "—". */
  displayText: string;
  missing: boolean;
}

/** One criterion in force on the test, as its caption and the printed ACEITÁVEL line say it. */
export interface MeasurementCriterionLine {
  text: string;
  sourceName: string;
  sourceEdition: string | null;
}

/** Values gathered into one labelled row after the table ("Na Emergência, com carga": V, Hz, A). */
export interface MeasurementValueGroup {
  label: string;
  values: EvaluatedMeasurementValue[];
  /** The measured ones joined: "381 V · 60,1 Hz · 248 A"; '' while none is. */
  text: string;
}

/** One part of the values line: a value's label and what it holds ("Método", "Falta real por abertura do disjuntor"). */
export interface MeasurementLinePart {
  label: string;
  text: string;
  /** What `text` is: a choice's wording (printed in caps, as a label is) or a number with its unit (printed as written). */
  kind: MeasurementKind;
  /**
   * Seed v14, batch e24s (Story 24.14): the text of a `text` value shown under this choice, as typed, said after it
   * ("Motivo: Outro, <texto>"; printed "MOTIVO: OUTRO, <texto>", the text never in caps). Absent otherwise.
   */
  typed?: string;
}

export interface MeasurementTestEvaluation {
  testKey: MeasurementTestKey;
  /** 1-based position among the definition's measurement tests: the "E1" of the heading. */
  number: number;
  /** The seed's label ("Resistência de contato"). */
  label: string;
  /** The heading on the sheet and in the document ("E1 · Resistência de contato"). */
  title: string;
  /** Whether the test can be switched off on the sheet, and the note it shows while off. */
  switchable: boolean;
  offNote: string | null;
  /** False for a switchable test switched off: body hidden, nothing required, judged or printed. */
  enabled: boolean;
  /**
   * Story 23.9 (seed v13): the test's applicability from the nameplate (`testApplicability`). In
   * the `na` state it is a switched-off test for every reader (nothing required, judged or
   * printed) but the screen, which draws its band; `always` on every test of v1 to v12.
   */
  applicability: TestApplicability;
  /** True when the test's own value says it was not run (E5 "Não realizado"): its table is not required and not printed. */
  skipped: boolean;
  /** Whose registry instruments the picker offers; null for a test with no picker. */
  instrumentOf: InstrumentOf | null;
  rowHeader: string;
  columns: EvaluatedMeasurementColumn[];
  /** The rows the block's configuration shows, in the test's order. */
  rows: EvaluatedMeasurementRow[];
  reference: MeasurementReference | null;
  values: EvaluatedMeasurementValue[];
  /**
   * How the test was run, from its ungrouped values that hold something, in order: "Método:
   * Falta real por abertura do disjuntor · Carga: Com carga (62 %) · Fonte dos tempos:
   * Instrumento". The sheet shows it beside the times and the document prints it.
   */
  valuesLine: { parts: MeasurementLinePart[]; text: string } | null;
  groups: MeasurementValueGroup[];
  /** The criteria in force under the block's configuration. */
  criteria: MeasurementCriterionLine[];
  /** Their wording joined ("≤ 50 % acima do menor do mesmo lado"): the print's line. */
  criterionText: string;
  /** Story 24.9 (F17): the screen's line while the medium is unknown, each criterion read by medium named by it ("Óleo: … · Seco: …"); absent otherwise. */
  screenCriterionText?: string;
  /** Their sources joined, each once. */
  sourceName: string;
  /*
   * Seed v13, batch e23t. Present only where the key applies; absent on every test of v5 to v12.
   */
  /**
   * Story 23.15: the test of a definition with seeded tests (a FO.SERV-03 type) carries no "E{n} ·"
   * in its title, which is its label; the CTA's keep their numbers.
   */
  unnumbered?: true;
  /** Story 23.15 (`winding_correction`): the temperature line and print texts at 75 °C. */
  temperature?: TestTemperatureView;
  /** Stories 23.15 and 23.19: the kernel's requests under the table (the material, TIPO DE ISOLAÇÃO), in order. */
  notes?: string[];
  /*
   * Fix batch e23z. Both absent on every test of v5 to v12 (no rule there restricts, no test there judges by the
   * deviation between phases).
   */
  /**
   * W3-1 (the seeded W2-3 rule, `TestEvaluation.restrictionStands`): a restriction rule still flags a cell now out
   * of its criterion (the history rule's move, a deviation past the restricted band, a band table's level past its
   * restricted one), so a point written from the test's `restricao` entry is not "Origem resolvida".
   */
  restrictionStands?: true;
  /**
   * W3-2 (Epic 14 QA Q-3, Story 14.9): a live test judged by the deviation between phases holds a measured number
   * cell no criterion judged (a cell at zero or below, a group with one positive cell, every cell while the medium is
   * unknown): `conclusionFloor` withholds Aprovado · Sem restrições while it stands.
   */
  unjudged?: true;
}

// --- stored values -----------------------------------------------------------------------------

const EMPTY = '—';
const NOT_MEASURED = '-';

interface Stored {
  state: ReadingState;
  raw: string;
  unit: string | null;
}

/** A choice as stored (`{raw: optionKey, unit: null, state: 'measured'}`); an option key the list does not hold reads as unanswered. */
function readChoice(cell: Cell | undefined, options: readonly MeasurementOption[]): Stored | null {
  const value = cell?.value;
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as { raw?: unknown; state?: unknown };
  if (v.state === 'not_measured') return { state: 'not_measured', raw: '', unit: null };
  if (v.state !== 'measured' || typeof v.raw !== 'string' || !options.some((option) => option.key === v.raw)) return null;
  return { state: 'measured', raw: v.raw, unit: null };
}

/** Seed v14, batch e24s (Story 24.14): a text value as stored, a string; blank reads as unanswered. */
function readText(cell: Cell | undefined): Stored | null {
  const value = cell?.value;
  if (typeof value !== 'string' || value.trim() === '') return null;
  // As typed (the field echoes it); the line and the print trim it.
  return { state: 'measured', raw: value, unit: null };
}

function read(cell: Cell | undefined, kind: MeasurementValueKind, options: readonly MeasurementOption[]): Stored | null {
  if (kind === 'text') return readText(cell);
  return kind === 'choice' ? readChoice(cell, options) : readStored(cell);
}

function displayOf(stored: Stored | null, kind: MeasurementValueKind, options: readonly MeasurementOption[]): string {
  if (stored === null) return EMPTY;
  if (kind === 'text') return stored.raw.trim();
  if (stored.state === 'not_measured') return NOT_MEASURED;
  if (stored.state === 'over_range') return overRangeDisplay(stored.raw);
  if (stored.state === 'invalid') return stored.raw;
  if (kind === 'choice') return options.find((option) => option.key === stored.raw)?.label ?? EMPTY;
  return formatDecimalGroupedPtBr(stored.raw);
}

function unitsOf(unit: string | null): readonly string[] {
  if (unit === null) return [];
  return INSULATION_UNITS.includes(unit) ? INSULATION_UNITS : [unit];
}

/** A number and its unit ("39 µΩ"), the number alone without one. */
function withUnit(text: string, unit: string | null): string {
  return unit === null || unit === '' ? text : `${text} ${unit}`;
}

/** The value a choice cell or a choice test value stores for `optionKey` (the shape both cell families share). */
export function choiceValue(optionKey: string): JsonValue {
  return { raw: optionKey, unit: null, state: 'measured' };
}

// --- criteria ------------------------------------------------------------------------------------

const OPERATOR_SIGN: Readonly<Record<string, string>> = { '>': '>', '>=': '≥', '<': '<', '<=': '≤' };

/** A plain number in pt-BR ("0,5", "1.000"). */
function numberText(value: number): string {
  return formatDecimalGroupedPtBr(String(value));
}

interface Limit {
  operator: string;
  value: number;
  /** Story 14.6: the upper bound of a company criterion's `between`. */
  value_max?: number;
  unit: string | null;
  /** The limit alone, for the helper text ("≥ 100 MΩ", ">400 MΩ"). */
  text: string;
}

/** The limit of an absolute criterion: its own, or the seeded criterion's it names. Null when it names none. */
function limitOf(criterion: Extract<MeasurementCriterion, { type: 'absolute' }>): Limit | null {
  if (criterion.seeded !== undefined) {
    // Story 14.6: a company type's criterion carries the row of its type's criteria table it names, taken first.
    const seeded = criterion.seeded_criterion ?? SEEDED_CRITERIA.find((candidate) => candidate.key === criterion.seeded);
    if (seeded === undefined) return null;
    return { operator: seeded.operator, value: seeded.value, ...(seeded.value_max === undefined ? {} : { value_max: seeded.value_max }), unit: seeded.unit, text: formatCriterionValue(seeded) };
  }
  if (criterion.operator === undefined || criterion.value === undefined || criterion.unit === undefined) return null;
  const sign = OPERATOR_SIGN[criterion.operator] ?? criterion.operator;
  return { operator: criterion.operator, value: criterion.value, unit: criterion.unit, text: withUnit(`${sign} ${numberText(criterion.value)}`, criterion.unit) };
}

/** The criterion's wording: its own text, or the seeded criterion's value (">400 MΩ"). */
function criterionTextOf(criterion: MeasurementCriterion): string {
  if (criterion.type !== 'absolute') return criterion.text;
  return criterion.text ?? limitOf(criterion)?.text ?? '';
}

/** Whether `value` satisfies the limit; null when the units cannot be compared (never a throw into the surface). */
function withinLimit(value: number, unit: string | null, limit: Limit): { within: boolean; excess: number } | null {
  const scaled = scaleToUnit(value, unit, limit.unit);
  if (scaled === null) return null;
  let within: boolean;
  switch (limit.operator) {
    case '>':
      within = scaled > limit.value;
      break;
    case '>=':
      within = scaled >= limit.value;
      break;
    case '<':
      within = scaled < limit.value;
      break;
    case '<=':
      within = scaled <= limit.value;
      break;
    // Story 14.6: a company criterion's `between` (both bounds inclusive), `±` (a deviation) and `pass_fail` (1 passes).
    case 'between': {
      if (limit.value_max === undefined) return null;
      within = scaled >= limit.value && scaled <= limit.value_max;
      const bound = scaled < limit.value ? limit.value : limit.value_max;
      return { within, excess: within || bound === 0 ? 0 : Math.abs(scaled - bound) / Math.abs(bound) };
    }
    case '±':
      within = Math.abs(scaled) <= limit.value;
      return { within, excess: within || limit.value === 0 ? 0 : (Math.abs(scaled) - limit.value) / Math.abs(limit.value) };
    case 'pass_fail':
      return { within: scaled === 1, excess: scaled === 1 ? 0 : 1 };
    default:
      return null;
  }
  return { within, excess: within || limit.value === 0 ? 0 : Math.abs(scaled - limit.value) / Math.abs(limit.value) };
}

/** Story 22.10: a limit the instrument passed against an absolute limit (`overRangeVerdict`), with the distance an out one stands from it. */
function overRangeAnswer(value: number, unit: string | null, limit: Limit): { within: boolean; excess: number } | null {
  const verdict = overRangeVerdict(value, unit, limit);
  const scaled = scaleToUnit(value, unit, limit.unit);
  if (verdict === null || scaled === null) return null;
  const within = verdict === 'within';
  return { within, excess: within || limit.value === 0 ? 0 : Math.abs(scaled - limit.value) / Math.abs(limit.value) };
}

/**
 * Story 22.10: each cell's `overRange`. A number cell takes a reading above the limit unless a
 * criterion in force compares it with other cells (`relative_to_lowest`, every number column;
 * `equals_column`, its column and its reference); a stored limit on a cell that refuses one (an
 * op written by hand or an old path) reads `invalid`, shown "> 2" and judged by nothing.
 */
function markOverRange(rows: readonly EvaluatedMeasurementRow[], criteria: readonly MeasurementCriterion[]): void {
  const relative = criteria.some((criterion) => criterion.type === 'relative_to_lowest');
  const compared = new Set(criteria.flatMap((criterion) => (criterion.type === 'equals_column' ? [criterion.column, criterion.reference] : [])));
  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.kind !== 'number' || cell.fixed !== null) continue;
      if (!relative && !compared.has(cell.columnKey)) continue;
      cell.overRange = { allowed: false, refusal: OVER_RANGE_COMPARED_REFUSAL };
      if (cell.state === 'over_range') cell.state = 'invalid';
    }
  }
}

/** A percentage clear of float noise (61,538461538). */
function roundPct(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase('pt-BR') + text.slice(1);
}

function judged(cell: EvaluatedMeasurementCell): boolean {
  return cell.fixed === null && cell.state === 'measured';
}

/** Marks `cell` with one criterion's answer: an `out` stands over a `within`, and the worst `out` keeps its words. */
function mark(cell: EvaluatedMeasurementCell, within: boolean, criterion: MeasurementCriterion, helperText: string, excess: number, criterionText: string = criterionTextOf(criterion)): void {
  if (within) {
    if (cell.verdict === null) cell.verdict = 'within';
    return;
  }
  if (cell.verdict === 'out' && cell.excess >= excess) return;
  cell.verdict = 'out';
  cell.helperText = helperText;
  cell.criterionText = criterionText;
  cell.sourceName = criterion.source.name;
  cell.excess = excess;
}

function applyAbsolute(rows: readonly EvaluatedMeasurementRow[], criterion: Extract<MeasurementCriterion, { type: 'absolute' }>): void {
  const limit = limitOf(criterion);
  if (limit === null) return;
  // authored: the seeded tables' own helper wording (`reading-evaluation.ts`); Story 14.6: "Fora do aceitável" for a company criterion with two sides.
  const helper = limit.operator.startsWith('>')
    ? `Abaixo do aceitável (${limit.text})`
    : limit.operator.startsWith('<')
      ? `Acima do aceitável (${limit.text})`
      : `Fora do aceitável (${limit.text})`;
  for (const row of rows) {
    if (criterion.rows !== undefined && !criterion.rows.includes(row.key)) continue;
    for (const cell of row.cells) {
      if (cell.kind !== 'number' || cell.fixed !== null || !isReadingValue(cell.state)) continue;
      if (criterion.columns !== undefined && !criterion.columns.includes(cell.columnKey)) continue;
      const answer = cell.state === 'over_range' ? overRangeAnswer(Number(cell.raw), cell.unit, limit) : withinLimit(Number(cell.raw), cell.unit, limit);
      if (answer !== null) mark(cell, answer.within, criterion, helper, answer.excess);
    }
  }
}

/**
 * The measured positive number cells of one column in the column's base unit, with the lowest of them; null with
 * none. A reading of zero or below is no reference and has no percentage above one, so it stays out and gets no
 * verdict, and the other cells of the column are still judged against the lowest positive one.
 */
function columnLowest(rows: readonly EvaluatedMeasurementRow[], column: EvaluatedMeasurementColumn): { cells: { cell: EvaluatedMeasurementCell; value: number }[]; lowest: { cell: EvaluatedMeasurementCell; value: number } } | null {
  const cells = rows.flatMap((row) => {
    const cell = row.cells.find((candidate) => candidate.address.col === column.col);
    if (cell === undefined || cell.kind !== 'number' || !judged(cell)) return [];
    const value = scaleToUnit(Number(cell.raw), cell.unit, column.unit ?? cell.unit);
    return value === null || !(value > 0) ? [] : [{ cell, value }];
  });
  if (cells.length === 0) return null;
  return { cells, lowest: cells.reduce((least, entry) => (entry.value < least.value ? entry : least)) };
}

function applyRelative(
  rows: readonly EvaluatedMeasurementRow[],
  columns: readonly EvaluatedMeasurementColumn[],
  criterion: Extract<MeasurementCriterion, { type: 'relative_to_lowest' }>,
): void {
  for (const column of columns) {
    if (column.kind !== 'number') continue;
    const found = columnLowest(rows, column);
    // Fewer than two measured positive cells: nothing to compare the one with.
    if (found === null || found.cells.length < 2) continue;
    const lowestText = withUnit(found.lowest.cell.displayText, found.lowest.cell.unit);
    for (const { cell, value } of found.cells) {
      const pct = roundPct(((value - found.lowest.value) / found.lowest.value) * 100);
      const within = pct <= criterion.max_percent;
      // authored: after `63-ficha-cta.html` ("62 % acima do menor do lado (39 µΩ) — critério ≤ 50 %").
      const helper = `${numberText(shownPercent(pct, criterion.max_percent, within))} % acima do ${lowerFirst(criterion.reference_label)} (${lowestText}) — critério ≤ ${numberText(criterion.max_percent)} %`;
      mark(cell, within, criterion, helper, within ? 0 : pct / criterion.max_percent - 1);
    }
  }
}

/**
 * Epic 14 QA Q-14: the percentage an E1 helper shows. Whole, as the mock draws it, unless the
 * rounding would read within the limit for a cell that is out (150,4 against 100 is 50,4 %,
 * never "50 %" under "critério ≤ 50 %"): then the fewest decimals that still read above it.
 */
function shownPercent(pct: number, maxPercent: number, within: boolean): number {
  if (within) return Math.round(pct);
  for (let decimals = 0; decimals <= 4; decimals += 1) {
    const factor = 10 ** decimals;
    const shown = Math.round(pct * factor) / factor;
    if (shown > maxPercent) return shown;
  }
  return Math.ceil(pct * 1e4) / 1e4;
}

/**
 * Epic 14 QA Q-3: the cells a `relative_to_lowest` criterion in force covers take only a
 * reading above zero (`positiveOnlyText`); on a test that counts, one already stored at zero
 * or below (an older op, a hand-written one) is marked to check: no verdict of its own (unless
 * another criterion put it out), the "Conferir" helper, and `conclusionFloor` withheld (Story 22.4; formerly `suggestConclusionPair`).
 */
function markPositiveOnly(rows: readonly EvaluatedMeasurementRow[], criterion: Extract<MeasurementCriterion, { type: 'relative_to_lowest' }>, live: boolean): void {
  const reference = lowerFirst(criterion.reference_label);
  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.kind !== 'number' || cell.fixed !== null) continue;
      // authored: Epic 14 QA Q-3 (open for Bruno).
      cell.positiveOnlyText = `Informe um valor maior que zero: o critério compara com o ${reference}`;
      if (!live || !judged(cell) || Number(cell.raw) > 0 || cell.verdict === 'out' || cell.verdict === 'restricted') continue;
      cell.toCheck = true;
      cell.verdict = null;
      // authored: Epic 14 QA Q-3 (open for Bruno).
      cell.helperText = `Conferir: valor zero ou negativo, sem comparação com o ${reference}`;
    }
  }
}

function referenceOf(
  rows: readonly EvaluatedMeasurementRow[],
  columns: readonly EvaluatedMeasurementColumn[],
  criterion: Extract<MeasurementCriterion, { type: 'relative_to_lowest' }>,
): MeasurementReference {
  return {
    label: criterion.reference_label,
    cells: columns.map((column) => {
      const lowest = column.kind === 'number' ? (columnLowest(rows, column)?.lowest.cell ?? null) : null;
      if (lowest === null) return { columnKey: column.key, column: column.label, value: null, unit: null, text: null };
      return { columnKey: column.key, column: column.label, value: lowest.displayText, unit: lowest.unit, text: withUnit(lowest.displayText, lowest.unit) };
    }),
  };
}

/** Two measured cells of one row hold the same thing: the same option, or the same number once in one unit. Null when the units cannot be compared. */
function sameValue(a: EvaluatedMeasurementCell, b: EvaluatedMeasurementCell): boolean | null {
  if (a.kind !== b.kind) return null;
  if (a.kind === 'choice') return a.raw === b.raw;
  const scaled = scaleToUnit(Number(a.raw), a.unit, b.unit);
  if (scaled === null) return null;
  const other = Number(b.raw);
  return Math.abs(scaled - other) <= 1e-9 * Math.max(1, Math.abs(scaled), Math.abs(other));
}

function applyEquals(rows: readonly EvaluatedMeasurementRow[], criterion: Extract<MeasurementCriterion, { type: 'equals_column' }>): void {
  for (const row of rows) {
    const cell = row.cells.find((candidate) => candidate.columnKey === criterion.column);
    const reference = row.cells.find((candidate) => candidate.columnKey === criterion.reference);
    // Either cell empty, fixed or not measured: no verdict.
    if (cell === undefined || reference === undefined || !judged(cell) || !judged(reference)) continue;
    const same = sameValue(cell, reference);
    if (same === null) continue;
    // authored: "Diferente de Projeto (5 min)".
    mark(cell, same, criterion, `Diferente de ${reference.column} (${withUnit(reference.displayText, reference.unit)})`, 0);
  }
}

function applyChoicePass(rows: readonly EvaluatedMeasurementRow[], criterion: Extract<MeasurementCriterion, { type: 'choice_pass' }>): void {
  for (const row of rows) {
    const cell = row.cells.find((candidate) => candidate.columnKey === criterion.column);
    if (cell === undefined || cell.kind !== 'choice' || !judged(cell)) continue;
    const pass = cell.options.filter((option) => criterion.pass.includes(option.key)).map((option) => option.label);
    // authored: the seeded tables' "Fora do aceitável (…)", with the options that pass.
    mark(cell, criterion.pass.includes(cell.raw), criterion, `Fora do aceitável (${pass.join(' ou ')})`, 0);
  }
}

// --- the deviation between phases (seed v13, batch e23t, Stories 23.15 and 23.19) -------------------

// authored (Stories 23.15 and 23.19, listed for Bruno): the helper and reason texts of the deviation between phases.
const RESTRICTED_CLOSING = 'a conclusão sobe para Com restrições.';
// authored (e24b, listed for Bruno): Story 24.9 (F17), the out helper's outcome, as the restricted helper ends with its own.
const OUT_CLOSING = 'a ficha fica Reprovado.';
const OPEN_CIRCUIT_HELPER = 'Acima do limite do instrumento: circuito aberto';

/** "2", "2,5". */
function pctText(pct: number): string {
  return formatDecimalGroupedPtBr(canonicalDecimal(String(pct)));
}

/** The cells a `phase_deviation` criterion compares, by group: a row's number cells (`across: 'columns'`) or a column's (`'rows'`). */
function deviationGroups(rows: readonly EvaluatedMeasurementRow[], columns: readonly EvaluatedMeasurementColumn[], across: 'columns' | 'rows'): { row: EvaluatedMeasurementRow; cell: EvaluatedMeasurementCell }[][] {
  const numeric = (cell: EvaluatedMeasurementCell | undefined): cell is EvaluatedMeasurementCell => cell !== undefined && cell.kind === 'number' && cell.fixed === null;
  if (across === 'columns') return rows.map((row) => row.cells.filter(numeric).map((cell) => ({ row, cell })));
  return columns.map((column) =>
    rows.flatMap((row) => {
      const cell = row.cells[column.col];
      return numeric(cell) ? [{ row, cell }] : [];
    }),
  );
}

/** Where a cell of a group is, as a reference names it: its column ("Fase A") across columns, its row ("Fase A") across rows. */
function groupName(entry: { row: EvaluatedMeasurementRow; cell: EvaluatedMeasurementCell }, across: 'columns' | 'rows'): string {
  return across === 'columns' ? entry.cell.column : entry.row.label;
}

/**
 * Marks `cell` restricted (out > restricted > within): a cell already out keeps its verdict; a
 * restricted one keeps its first reason and gains the other's.
 */
function markRestricted(cell: EvaluatedMeasurementCell, criterion: MeasurementCriterion, reason: string, text: string, compared?: string, history = false): void {
  if (cell.verdict === 'out') return;
  // Fix batch e23p (P3): the point's reason, a comparison right after its own reason; merged as the reasons are.
  const point = compared === undefined ? reason : `${reason} (${compared})`;
  // Batch e24p (Story 24.16): a previous-visit rule's reason, kept apart for the history note.
  const own = history ? point : null;
  if (cell.verdict === 'restricted' && cell.restriction != null) {
    const merged = `${cell.restriction.reason}; ${reason}`;
    const pointReason = `${cell.restriction.pointReason ?? cell.restriction.reason}; ${point}`;
    const before = cell.restriction.history ?? null;
    const histories = [before, own].filter((one): one is string => one !== null).join('; ');
    cell.restriction = { reason: merged, text: `${cell.restriction.text} ${text}`, ...(pointReason === merged ? {} : { pointReason }), ...(histories === '' ? {} : { history: histories }) };
    return;
  }
  cell.verdict = 'restricted';
  cell.restriction = { reason, text, ...(point === reason ? {} : { pointReason: point }), ...(own === null ? {} : { history: own }) };
  cell.criterionText = criterionTextOf(criterion);
  cell.sourceName = criterion.source.name;
}

/**
 * Seed v13 (Stories 23.15 and 23.19): the deviation between phases. A group's measured cells above
 * zero, in the first one's unit, each against the lowest of them: at most `within_max_pct` within,
 * in the restricted band restricted, past it out (the bounds inclusive, clear of float noise). A
 * group with fewer than two such cells judges none; a cell at zero or below is no reference and is
 * left without a verdict.
 */
function applyPhaseDeviation(rows: readonly EvaluatedMeasurementRow[], columns: readonly EvaluatedMeasurementColumn[], criterion: Extract<MeasurementCriterion, { type: 'phase_deviation' }>): boolean {
  // Fix batch e23z (W3-1): a cell out past the restricted band passed through it, so the restriction stands.
  let stands = false;
  for (const group of deviationGroups(rows, columns, criterion.across)) {
    const measured = group.filter((entry) => judged(entry.cell));
    const unit = measured[0]?.cell.unit ?? null;
    const values = measured.flatMap((entry) => {
      const value = scaleToUnit(Number(entry.cell.raw), entry.cell.unit, unit);
      return value === null || !(value > 0) ? [] : [{ ...entry, value }];
    });
    if (values.length < 2) continue;
    const lowest = values.reduce((least, entry) => (entry.value < least.value ? entry : least));
    const lowestText = `${groupName(lowest, criterion.across)}: ${withUnit(lowest.cell.displayText, lowest.cell.unit)}`;
    for (const entry of values) {
      const pct = roundPct(((entry.value - lowest.value) / lowest.value) * 100);
      if (pct <= criterion.within_max_pct) {
        mark(entry.cell, true, criterion, '', 0);
        continue;
      }
      const restricted = criterion.restricted_max_pct !== undefined ? pct <= criterion.restricted_max_pct : criterion.above === 'restricted';
      if (restricted) {
        const shown = numberText(shownPercent(pct, criterion.within_max_pct, false));
        markRestricted(
          entry.cell,
          criterion,
          `desvio de ${shown} % sobre a menor fase`,
          `Desvio de ${shown} % sobre a menor fase (${lowestText}), acima de ${pctText(criterion.within_max_pct)} %: ${RESTRICTED_CLOSING}`,
        );
        continue;
      }
      const bound = criterion.restricted_max_pct ?? criterion.within_max_pct;
      // ~~`⟨pct⟩ % acima da menor fase (⟨lowest⟩) — critério ≤ ⟨bound⟩ %`~~ Story 24.9 (F17): built as the restricted helper is
      // (the deviation, the lowest phase with its value, the bound, then the outcome). Screen only: the print reads `criterionText`.
      const helper = `Desvio de ${numberText(shownPercent(pct, bound, false))} % sobre a menor fase (${lowestText}), acima de ${pctText(bound)} %: ${OUT_CLOSING}`;
      mark(entry.cell, false, criterion, helper, pct / bound - 1);
      if (criterion.restricted_max_pct !== undefined) stands = true;
    }
  }
  return stands;
}

/**
 * Seed v13 (Stories 23.15 and 23.19): a number cell of a test judged by the deviation between
 * phases that holds a reading above the instrument's limit is an open circuit: out, whatever the
 * medium, and out of every group (`judged` reads only measured cells).
 */
function markOpenCircuits(rows: readonly EvaluatedMeasurementRow[], criterion: MeasurementCriterion): void {
  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.kind === 'number' && cell.fixed === null && cell.state === 'over_range') mark(cell, false, criterion, OPEN_CIRCUIT_HELPER, 1);
    }
  }
}

// --- e23e: Stories 23.20 and 23.21 (band tables, a maximum from the plate) ------------------------

/** "Discrepância grave". */
function upperFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
}

/**
 * Seed v13, batch e23e (Story 23.20; NETA MTS-2023 Table 100.18): each measured cell of the
 * criterion's column takes the first band whose `up_to` it does not exceed (the last band past every
 * bound): within, restricted (its class and action the reason) or out (the helper names the class,
 * the bound it passed and the action). A cell at zero or below is within (no rise); a row's two
 * columns are judged apart, so the row reads the worse (out > restricted > within).
 */
function applyBands(rows: readonly EvaluatedMeasurementRow[], columns: readonly EvaluatedMeasurementColumn[], criterion: Extract<MeasurementCriterion, { type: 'bands' }>): boolean {
  const column = columns.find((candidate) => candidate.key === criterion.column);
  if (column === undefined || column.kind !== 'number') return false;
  // Fix batch e23z (W3-1): a cell out on a table holding a restricted level passed through it, so the restriction stands.
  const restrictedLevel = criterion.bands.some((band) => band.level === 'restricted');
  let stands = false;
  for (const row of rows) {
    const cell = row.cells[column.col];
    // Review fix: a reading above the instrument's limit ("> 150 °C") is above every bound, the last band's level.
    const over = cell !== undefined && cell.fixed === null && cell.state === 'over_range';
    if (cell === undefined || cell.kind !== 'number' || !(judged(cell) || over)) continue;
    const value = scaleToUnit(Number(cell.raw), cell.unit, column.unit ?? cell.unit);
    if (value === null) continue;
    const at = over ? criterion.bands.length - 1 : criterion.bands.findIndex((band) => band.up_to === undefined || roundPct(value) <= band.up_to);
    const band = criterion.bands[at === -1 ? criterion.bands.length - 1 : at]!;
    const shown = withUnit(cell.displayText, cell.unit);
    // authored (Story 23.20, listed for Bruno): the reason, the helper's sentence and the out helper of a thermography cell.
    if (band.level === 'within') mark(cell, true, criterion, '', 0);
    else if (band.level === 'restricted') {
      const action = band.action === undefined ? '' : `, ${band.action}`;
      markRestricted(cell, criterion, `${cell.column} de ${shown} (${band.class})`, `${cell.column} de ${shown}: ${band.class}${action}; ${RESTRICTED_CLOSING}`);
    } else {
      const bound = criterion.bands[(at === -1 ? criterion.bands.length - 1 : at) - 1]?.up_to ?? 0;
      const action = band.action === undefined ? '' : `: ${band.action}`;
      mark(cell, false, criterion, `${upperFirst(band.class)} (${shown}, acima de ${withUnit(numberText(bound), cell.unit)})${action}`, bound > 0 ? (value - bound) / bound : 1);
      if (restrictedLevel) stands = true;
    }
  }
  return stands;
}

/** Story 23.21: a plate number in the criterion's unit, or null (empty, an "N/A", not a positive number, no unit to compare). */
function plateNumber(block: Pick<BlockRow, 'sheet'>, nameplate: readonly FieldDef[], key: string, unit: string): number | null {
  const field = nameplate.find((candidate) => candidate.key === key);
  const value = block.sheet.nameplate[key]?.value;
  if (field === undefined || typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const stored = value as { raw?: unknown; unit?: unknown; state?: unknown };
  if (stored.state !== 'measured' || typeof stored.raw !== 'string' || !/^\d+(\.\d+)?$/.test(stored.raw)) return null;
  const number = Number(stored.raw);
  if (!(number > 0)) return null;
  return scaleToUnit(number, typeof stored.unit === 'string' && stored.unit !== '' ? stored.unit : (field.unit ?? null), unit);
}

/** Story 23.21: the limit a `max_field` criterion judges by on this sheet, and whether it is the default. */
function maxFieldLimit(block: Pick<BlockRow, 'sheet'>, nameplate: readonly FieldDef[], criterion: Extract<MeasurementCriterion, { type: 'max_field' }>): { limit: Limit; byDefault: boolean } {
  const plate = plateNumber(block, nameplate, criterion.field, criterion.unit);
  const value = plate ?? criterion.default;
  return { limit: { operator: '<=', value, unit: criterion.unit, text: withUnit(`≤ ${numberText(value)}`, criterion.unit) }, byDefault: plate === null };
}

/**
 * Fix batch e23p (P5, the behaviour pass's F7): a `max_field` criterion's wording on this sheet: with
 * the plate's value, the number it judges by ("≤ 3 Ω, valor de projeto");
 * without one, the seed's text, as before. The criterion line, an out cell's criterion (and so the
 * derived point and the conclusion) read it.
 */
function maxFieldCriterionText(criterion: Extract<MeasurementCriterion, { type: 'max_field' }>, limit: Limit, byDefault: boolean): string {
  // authored (e23p, listed for Bruno): the design value's number, "≤ 3 Ω, valor de projeto".
  return byDefault ? criterionTextOf(criterion) : `${limit.text}, valor de projeto`;
}

/**
 * Seed v13, batch e23e (Story 23.21; Base rev08 AT-01): every measured number cell at most the plate's
 * `field` (VALOR DE PROJETO), else at most the default; out above, its helper naming the limit and
 * whether it is the design value or the default. A reading above the instrument's limit is judged
 * as on an absolute criterion (`overRangeVerdict`).
 */
function applyMaxField(rows: readonly EvaluatedMeasurementRow[], criterion: Extract<MeasurementCriterion, { type: 'max_field' }>, limit: Limit, byDefault: boolean): void {
  // authored (Story 23.21, listed for Bruno): the out helper, naming where the limit comes from.
  const helper = `Acima do aceitável (${limit.text}, ${byDefault ? 'padrão sem valor de projeto' : 'valor de projeto'})`;
  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.kind !== 'number' || cell.fixed !== null || !isReadingValue(cell.state)) continue;
      const answer = cell.state === 'over_range' ? overRangeAnswer(Number(cell.raw), cell.unit, limit) : withinLimit(Number(cell.raw), cell.unit, limit);
      if (answer !== null) mark(cell, answer.within, criterion, helper, answer.excess, maxFieldCriterionText(criterion, limit, byDefault));
    }
  }
}

/**
 * Story 23.21: the helper a test judged by a `max_field` shows while its plate field is empty
 * ("Sem VALOR DE PROJETO na placa, vale ≤ 5 Ω."); authored (Story 23.21, listed for Bruno).
 */
export function maxFieldDefaultText(label: string, limitText: string): string {
  return `Sem ${label} na placa, vale ${limitText}.`;
}

// --- the winding at 75 °C and its history (seed v13, batch e23t, Story 23.15) ----------------------

/** What a test's evaluation reads beyond its block and configuration: the definition's plate and oil rule, the visit context. */
interface MeasurementContext {
  definition: Pick<BlockDefinition, 'nameplate' | 'oil_rule' | 'tests' | 'measurement_tests'>;
  visit: VisitContext;
  /** `measurementTestsUnnumbered` of the definition. */
  unnumbered: boolean;
  /** Batch e24p (Story 24.15): the block's seed version, which dates the history text (`previousVisitDateText`); absent, the issue date. */
  seedVersion?: string;
}

/**
 * Batch e23t (Story 23.15, seed v13): whether a definition's measurement tests carry no "E{n} ·": a
 * seeded FO.SERV-03 type (a seeded equipment type with seeded tests). The CTA (no seeded tests) and
 * every company type (a copy that adds a measurement table included) keep their numbers. The one rule
 * of the title, the conflict view, the merge line and the conclusion's criteria line.
 */
export function measurementTestsUnnumbered(definition: { block_type?: string | undefined; base_block_type?: string | undefined; tests?: readonly unknown[] | undefined } | null | undefined): boolean {
  if (definition === null || definition === undefined || (definition.tests ?? []).length === 0) return false;
  // Fix batch e23z (W3-3): a company copy of one of the eight (`base_block_type`) keeping seeded tests reads as its base.
  if (definition.base_block_type !== undefined && isBaseEquipmentBlockType(definition.base_block_type)) return true;
  return definition.block_type !== undefined && isEquipmentBlockType(definition.block_type);
}

/** Each measured number cell's value at 75 °C (`corrected`), null on every other cell; the test's temperature view and requests. */
function applyWindingCorrection(block: Pick<BlockRow, 'sheet'>, test: MeasurementTest, rows: readonly EvaluatedMeasurementRow[], context: MeasurementContext): { view: TestTemperatureView; notes: string[] } | null {
  const keys = test.winding_correction;
  if (keys === undefined) return null;
  const definition = { nameplate: context.definition.nameplate, ...(context.definition.oil_rule === undefined ? {} : { oil_rule: context.definition.oil_rule }) };
  const temperature = windingTemperature(block, definition, keys, context.visit);
  const material = windingMaterial(block, definition, keys);
  const factor = windingFactor(temperature, material);
  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.kind !== 'number' || cell.fixed !== null) continue;
      const raw = cell.state === 'measured' && factor !== null ? correctedRaw(Number(cell.raw), factor, WINDING_DIGITS) : null;
      cell.corrected = raw === null ? null : { raw, unit: cell.unit, text: correctedText(raw, cell.unit) };
    }
  }
  const notes: string[] = [];
  if (material === null) {
    const label = context.definition.nameplate.find((field) => field.key === keys.material_field)?.label ?? keys.material_field;
    notes.push(windingMaterialMissingText(label));
  }
  return { view: windingTemperatureView(keys, temperature, mediumOf(definition, block)), notes };
}

/**
 * Story 23.15 (TR-OL-05 history): a corrected cell within its criterion that moved more than
 * `history_deviation_pct` from the previous visit's corrected value of the same cell is restricted;
 * judged only when both carry a corrected value (a previous visit on v12 or uncorrected is shown,
 * never judged).
 */
function applyHistory(block: Pick<BlockRow, 'sheet'>, test: MeasurementTest, rows: readonly EvaluatedMeasurementRow[], context: MeasurementContext, criterion: MeasurementCriterion): boolean {
  const pct = test.history_deviation_pct;
  const entry: PreviousResults | null = context.visit.previous;
  if (pct === undefined || entry === null) return false;
  // Fix batch e24y (P5, seed v14 `history_needs_like_with_like`): a winding corrected from the cabine's ambient, standing in for
  // a plate temperature not typed (TEMPERATURA DO ÓLEO, or DO ENROLAMENTO on a dry unit, which "Copiar da última visita" never
  // copies), is not like the previous visit's value, corrected from its plate: nothing is compared.
  if (test.winding_correction !== undefined && context.seedVersion !== undefined && seedRule(context.seedVersion, 'history_needs_like_with_like')) {
    const plate = { nameplate: context.definition.nameplate, ...(context.definition.oil_rule === undefined ? {} : { oil_rule: context.definition.oil_rule }) };
    const temperature = windingTemperature(block, plate, test.winding_correction, context.visit);
    if (!('missing' in temperature) && temperature.source === 'ambient') return false;
  }
  // Fix batch e23z (W3-1): the rule also reads a cell out by its criterion (its verdict unchanged); true when it flags one.
  let stands = false;
  const slots = { tests: context.definition.tests ?? [], measurement_tests: context.definition.measurement_tests ?? [], nameplate: context.definition.nameplate };
  const byAddress: ReadonlyMap<string, LastResultReading> = previousReadingsByAddress(entry, slots, block);
  // Batch e24p (Story 24.15): the previous visit's date as the block's seed names it (the visit's date on v14).
  const dateText = context.seedVersion === undefined ? formatDateOfInstant(entry.issued_at) : previousVisitDateText(entry, context.seedVersion);
  for (const row of rows) {
    for (const cell of row.cells) {
      const now = cell.corrected ?? null;
      // Like every restriction rule, it runs only on a cell already judged (never an unjudged one: medium unknown, a lone
      // phase); an open circuit holds no corrected value, so it never counts. Fix batch e24y (P4): a cell another rule
      // already restricted (the deviation between phases) is read too, for the note only.
      if (now === null || (cell.verdict !== 'within' && cell.verdict !== 'out' && cell.verdict !== 'restricted')) continue;
      const before = byAddress.get(readingAddressKey(cell.address))?.corrected ?? null;
      if (before === null) continue;
      const was = scaleToUnit(Number(before.raw), before.unit, now.unit);
      if (was === null || !(was > 0)) continue;
      const moved = roundPct((Math.abs(Number(now.raw) - was) / was) * 100);
      if (!(moved > pct)) continue;
      if (cell.verdict === 'out' || cell.verdict === 'restricted') {
        if (cell.verdict === 'out') stands = true;
        // Batch e24p (Story 24.16, review fix): an out cell the variation rule flags keeps its verdict; the note names it.
        // Fix batch e24y (P4): so does a cell the deviation between phases already restricted: its restriction, its reason
        // and its verdict stay as they are (no v1 to v13 text moves), and the note line reads the variation here.
        // authored (Story 23.15 and e23p, listed for Bruno): the rule's reason with both corrected values, as on a restricted cell.
        cell.historyOut = `variação de mais de ${pctText(pct)} % desde a manutenção anterior (de ${correctedText(before.raw, before.unit)} para ${correctedText(now.raw, now.unit)}, a ${WINDING_REFERENCE_C} °C)`;
        continue;
      }
      // authored (Story 23.15, listed for Bruno): the history rule's reason and helper.
      markRestricted(
        cell,
        criterion,
        `variação de mais de ${pctText(pct)} % desde a manutenção anterior`,
        `Variou mais de ${pctText(pct)} % desde a manutenção anterior (${correctedText(before.raw, before.unit)} a ${WINDING_REFERENCE_C} °C, rev. ${entry.revision_number}, ${dateText}): ${RESTRICTED_CLOSING}`,
        // authored (e23p, listed for Bruno): both corrected values, as the derived point names them.
        `de ${correctedText(before.raw, before.unit)} para ${correctedText(now.raw, now.unit)}, a ${WINDING_REFERENCE_C} °C`,
        true,
      );
    }
  }
  return stands;
}

// --- the evaluation -------------------------------------------------------------------------------

function columnsOf(test: MeasurementTest): EvaluatedMeasurementColumn[] {
  return test.columns.map((column: MeasurementColumn, col) => ({ col, key: column.key, label: column.label, kind: column.kind, unit: column.unit ?? null, optional: column.optional === true }));
}

function evaluateRows(block: Pick<BlockRow, 'sheet'>, test: MeasurementTest, config: Readonly<Record<string, string>>): EvaluatedMeasurementRow[] {
  const stored = block.sheet.test[test.key]?.cells ?? {};
  const rows: EvaluatedMeasurementRow[] = [];
  test.rows.forEach((row: MeasurementRow, index) => {
    if (!holds(row.when, config)) return;
    const cells = test.columns.map((column, col): EvaluatedMeasurementCell => {
      const kind = row.kind ?? column.kind;
      const options = kind === 'choice' ? ((row.kind === undefined ? column.options : row.options) ?? []) : [];
      const defaultUnit = kind === 'choice' ? null : ((row.kind === undefined ? column.unit : row.unit) ?? null);
      const fixed = row.fixed?.[column.key] ?? null;
      const value = fixed === null ? read(stored[String(index)]?.[String(col)], kind, options) : null;
      const state: ReadingState = value?.state ?? 'empty';
      return {
        address: { testKey: test.key, row: index, col },
        rowKey: row.key,
        columnKey: column.key,
        column: column.label,
        kind,
        fixed,
        optional: column.optional === true || row.optional === true,
        state,
        raw: value?.raw ?? '',
        // A fixed cell is text: it has no unit slot.
        unit: kind === 'choice' || fixed !== null ? null : (value?.unit ?? defaultUnit),
        units: fixed === null ? unitsOf(defaultUnit) : [],
        options,
        displayText: fixed ?? displayOf(value, kind, options),
        // Never shown: no number field draws a choice or a fixed cell (`markOverRange` narrows the number cells).
        overRange: kind === 'number' && fixed === null ? OVER_RANGE_ALLOWED : { allowed: false, refusal: '' },
        verdict: null,
        helperText: null,
        criterionText: null,
        sourceName: null,
        excess: 0,
        // Seed v13 (batch e23t, Story 23.15): an optional row's cells are never missing either.
        missing: fixed === null && column.optional !== true && row.optional !== true && state === 'empty',
        positiveOnlyText: null,
        toCheck: false,
      };
    });
    rows.push({ row: index, key: row.key, label: row.label, cells });
  });
  // The unit an empty cell of a tap-cycle column shows: the previous shown row's (Story 5.5 AC 2).
  test.columns.forEach((_, col) => {
    let previous: string | null = null;
    rows.forEach((row, at) => {
      const cell = row.cells[col]!;
      if (cell.fixed !== null || cell.kind !== 'number') return;
      if (cell.state === 'empty' && at > 0 && cell.units.length > 1 && previous !== null && cell.units.includes(previous)) cell.unit = previous;
      // e22g S2: a limit's unit (the instrument's top of range) never carries to the next row.
      if (cell.state !== 'over_range') previous = cell.unit;
    });
  });
  return rows;
}

function evaluateValues(block: Pick<BlockRow, 'sheet'>, test: MeasurementTest): EvaluatedMeasurementValue[] {
  const stored = block.sheet.test[test.key]?.values ?? {};
  const heldBy = (value: MeasurementValue) => read(stored[value.key], value.kind, value.options ?? []);
  return (test.values ?? []).map((value): EvaluatedMeasurementValue => {
    const held = heldBy(value);
    const state: ReadingState = held?.state ?? 'empty';
    const unit = value.kind === 'number' ? (held?.unit ?? value.unit ?? null) : null;
    const shown = value.when === undefined || shownUnder(value.when, test, heldBy, block);
    const text = displayOf(held, value.kind, value.options ?? []);
    return {
      key: value.key,
      label: value.label,
      kind: value.kind,
      unit,
      options: value.options ?? [],
      optional: value.optional === true,
      group: value.group ?? null,
      shown,
      state,
      raw: held?.raw ?? '',
      displayText: value.kind === 'number' && isReadingValue(state) ? withUnit(text, unit) : text,
      missing: shown && value.optional !== true && state === 'empty',
    };
  });
}

/**
 * Whether the value `when` names holds its option: another test value's, or (seed v13, batch e23t) a choice cell's of the table.
 * Batch e24s (Story 24.14): the chain is followed, so a value under a value that is itself hidden is hidden (the oil
 * sampling's text under Motivo "Outro", Motivo under Amostra "Não coletado"), whatever the hidden one still stores.
 */
function shownUnder(
  when: NonNullable<MeasurementValue['when']>,
  test: MeasurementTest,
  heldBy: (value: MeasurementValue) => Stored | null,
  block: Pick<BlockRow, 'sheet'>,
  depth = 0,
): boolean {
  if ('cell' in when) {
    const r = test.rows.findIndex((row) => row.key === when.cell.row);
    const c = test.columns.findIndex((column) => column.key === when.cell.column);
    const row = test.rows[r];
    const column = test.columns[c];
    if (row === undefined || column === undefined) return false;
    const options = (row.kind === undefined ? column.options : row.options) ?? [];
    const held = readChoice(block.sheet.test[test.key]?.cells[String(r)]?.[String(c)], options);
    return held !== null && held.state === 'measured' && held.raw === when.equals;
  }
  const depends = (test.values ?? []).find((candidate) => candidate.key === when.value);
  const held = depends === undefined ? null : heldBy(depends);
  if (held === null || held.state !== 'measured' || held.raw !== when.equals) return false;
  // A chain longer than the values is a cycle: hidden.
  if (depends!.when === undefined) return true;
  return depth < (test.values ?? []).length && shownUnder(depends!.when, test, heldBy, block, depth + 1);
}

/** A choice's wording inside the values line: the option's `phrase`, else its label. */
function phraseOf(value: EvaluatedMeasurementValue): string {
  const option = value.options.find((candidate) => candidate.key === value.raw);
  return option?.phrase ?? option?.label ?? value.displayText;
}

/**
 * The values line: every ungrouped, shown value that holds something, in order, as "label:
 * value". A measured number shown under a choice of the line is said with that choice
 * ("Carga: Com carga (62 %)") instead of as a part of its own.
 */
function valuesLineOf(test: MeasurementTest, values: readonly EvaluatedMeasurementValue[], skipped: boolean): MeasurementTestEvaluation['valuesLine'] {
  const defs = new Map((test.values ?? []).map((value) => [value.key, value]));
  // A test that was not run says only that: nothing else about how it was run is in force.
  const live = values.filter((value) => value.group === null && value.shown && value.state === 'measured' && (!skipped || value.key === test.skip_when?.value));
  const parts: MeasurementLinePart[] = [];
  for (const value of live) {
    const when = defs.get(value.key)?.when;
    const parent = when === undefined || 'cell' in when ? undefined : when.value;
    if (value.kind === 'number' && parent !== undefined && live.some((candidate) => candidate.key === parent && candidate.kind === 'choice')) continue;
    if (value.kind === 'number') {
      parts.push({ label: value.label, text: value.displayText, kind: 'number' });
      continue;
    }
    // Batch e24s (Story 24.14): a text value under a choice of the line is said after it, never as a part of its own.
    if (value.kind === 'text' && parent !== undefined && live.some((candidate) => candidate.key === parent && candidate.kind === 'choice')) continue;
    const under = (candidate: EvaluatedMeasurementValue) => {
      const when = defs.get(candidate.key)?.when;
      return when !== undefined && !('cell' in when) && when.value === value.key;
    };
    const details = live.filter((candidate) => candidate.kind === 'number' && under(candidate)).map((candidate) => candidate.displayText);
    const typed = live.filter((candidate) => candidate.kind === 'text' && under(candidate)).map((candidate) => candidate.raw.trim());
    parts.push({
      label: value.label,
      text: details.length === 0 ? phraseOf(value) : `${phraseOf(value)} (${details.join(', ')})`,
      kind: 'choice',
      ...(typed.length === 0 ? {} : { typed: typed.join(', ') }),
    });
  }
  return parts.length === 0 ? null : { parts, text: parts.map((part) => `${part.label}: ${part.text}${part.typed === undefined ? '' : `, ${part.typed}`}`).join(' · ') };
}

function groupsOf(values: readonly EvaluatedMeasurementValue[], skipped: boolean): MeasurementValueGroup[] {
  const groups: MeasurementValueGroup[] = [];
  for (const value of values) {
    if (value.group === null || !value.shown || skipped) continue;
    let group = groups.find((candidate) => candidate.label === value.group);
    if (group === undefined) {
      group = { label: value.group, values: [], text: '' };
      groups.push(group);
    }
    group.values.push(value);
  }
  for (const group of groups) {
    group.text = group.values
      .filter((value) => value.state === 'measured')
      .map((value) => value.displayText)
      .join(' · ');
  }
  return groups;
}

// authored (e24f, listed for Bruno): the helper of a measured cell the deviation between phases could not judge (a
// value at zero or below, a phase with no other measured in its group, every cell while the insulating medium is unknown).
/** Fix batch e24f (R-1): the helper of a measured cell a deviation-between-phases test left with no verdict. */
export const UNJUDGED_DEVIATION_HELPER = 'Conferir: leitura sem comparação com as outras fases, sem critério aplicado';

function evaluate(
  block: Pick<BlockRow, 'config' | 'sheet'>,
  test: MeasurementTest,
  number: number,
  config: Readonly<Record<string, string>>,
  applicability: TestApplicability,
  context: MeasurementContext,
): MeasurementTestEvaluation {
  const enabled = test.switchable === undefined || enabledSubBlocksOf(block).has(test.key);
  const columns = columnsOf(test);
  const rows = evaluateRows(block, test, config);
  const values = evaluateValues(block, test);
  const skipValue = test.skip_when === undefined ? undefined : values.find((value) => value.key === test.skip_when!.value);
  const skipped = skipValue !== undefined && skipValue.state === 'measured' && skipValue.raw === test.skip_when!.equals;
  // Story 23.9: a test the nameplate makes not applicable is not live, as a switched-off one is not.
  const live = enabled && !skipped && applicability.state !== 'na';
  const criteria = test.criteria.filter((criterion) => holds(criterion.when, config));
  markOverRange(rows, criteria);

  let reference: MeasurementReference | null = null;
  // Fix batch e23z (W3-1): whether a restriction rule flags a cell now out.
  let stands = false;
  // Seed v13 (batch e23t, Story 23.15): the values at 75 °C, the temperature line and the material's request.
  const winding = applyWindingCorrection(block, test, rows, context);
  const notes: string[] = [...(winding?.notes ?? [])];
  if (live) {
    // Seed v13, batch e23e (Story 23.21): the default of a maximum read from the plate, said while the field is empty (only on a live test).
    for (const criterion of criteria) {
      if (criterion.type !== 'max_field') continue;
      const { limit, byDefault } = maxFieldLimit(block, context.definition.nameplate, criterion);
      if (byDefault) notes.push(maxFieldDefaultText(context.definition.nameplate.find((field) => field.key === criterion.field)?.label ?? criterion.field, limit.text));
    }
    // Seed v13 (batch e23t, Stories 23.15 and 23.19): a criterion read by medium judges only the medium the oil rule reads.
    const medium = criteria.some((criterion) => criterion.type === 'phase_deviation' && criterion.medium !== undefined) ? mediumOf({ nameplate: context.definition.nameplate, ...(context.definition.oil_rule === undefined ? {} : { oil_rule: context.definition.oil_rule }) }, block) : null;
    const deviation = criteria.find((criterion) => criterion.type === 'phase_deviation' && (criterion.medium === undefined || criterion.medium === medium)) ?? criteria.find((criterion) => criterion.type === 'phase_deviation');
    if (deviation !== undefined) markOpenCircuits(rows, deviation);
    for (const criterion of criteria) {
      if (criterion.type === 'absolute') applyAbsolute(rows, criterion);
      else if (criterion.type === 'relative_to_lowest') applyRelative(rows, columns, criterion);
      else if (criterion.type === 'equals_column') applyEquals(rows, criterion);
      else if (criterion.type === 'phase_deviation') {
        if ((criterion.medium === undefined || criterion.medium === medium) && applyPhaseDeviation(rows, columns, criterion)) stands = true;
      } else if (criterion.type === 'bands') {
        if (applyBands(rows, columns, criterion)) stands = true;
      }
      else if (criterion.type === 'max_field') {
        const { limit, byDefault } = maxFieldLimit(block, context.definition.nameplate, criterion);
        applyMaxField(rows, criterion, limit, byDefault);
      } else applyChoicePass(rows, criterion);
    }
    if (deviation !== undefined && medium === null && criteria.some((criterion) => criterion.type === 'phase_deviation' && criterion.medium !== undefined) && !criteria.some((criterion) => criterion.type === 'phase_deviation' && criterion.medium === undefined)) {
      const rule = context.definition.oil_rule;
      const label = rule === undefined ? null : (context.definition.nameplate.find((field) => field.key === rule.field)?.label ?? null);
      // authored (Story 23.15, listed for Bruno): the medium unknown, so no deviation between phases is judged.
      if (label !== null) notes.push(`Informe o campo ${label} na placa para julgar o desvio entre fases.`);
    }
    // The criterion in force for the block's medium (the deviation judging's pick) names the restriction, else the first in force.
    const named = deviation ?? criteria[0];
    if (named !== undefined && applyHistory(block, test, rows, context, named)) stands = true;
  } else {
    // A test switched off or not run requires nothing: its cells keep what they hold and are neither missing nor judged.
    for (const row of rows) for (const cell of row.cells) cell.missing = false;
  }
  const relative = criteria.find((criterion) => criterion.type === 'relative_to_lowest');
  if (relative !== undefined && relative.type === 'relative_to_lowest') {
    reference = referenceOf(rows, columns, relative);
    markPositiveOnly(rows, relative, live);
  }
  for (const value of values) {
    // The value that says the test was not run is the one thing a skipped test still asks for; it is filled by definition.
    if (!enabled || skipped || applicability.state === 'na') value.missing = false;
  }
  // Fix batch e23z (W3-2): a live test judged by the deviation between phases with a measured number cell left with no
  // verdict (and not to check) is unjudged: the floor withholds Aprovado · Sem restrições.
  const unjudgedCells =
    live && criteria.some((criterion) => criterion.type === 'phase_deviation')
      ? rows.flatMap((row) => row.cells.filter((cell) => cell.kind === 'number' && cell.fixed === null && cell.state === 'measured' && cell.verdict === null && !cell.toCheck))
      : [];
  const unjudged = unjudgedCells.length > 0;
  // Fix batch e24f (R-1): each such cell says why it has no verdict (its verdict stays null, it is not `toCheck`).
  for (const cell of unjudgedCells) {
    // authored (e24f, listed for Bruno): a measured cell the deviation between phases could not judge.
    if (cell.helperText === null) cell.helperText = UNJUDGED_DEVIATION_HELPER;
  }

  // Seed v13 (batch e23t): a criterion read by medium is in force only on that medium (both while it is unknown).
  const medium = criteria.some((criterion) => criterion.type === 'phase_deviation' && criterion.medium !== undefined) ? mediumOf({ nameplate: context.definition.nameplate, ...(context.definition.oil_rule === undefined ? {} : { oil_rule: context.definition.oil_rule }) }, block) : null;
  const inForce = criteria.filter((criterion) => criterion.type !== 'phase_deviation' || criterion.medium === undefined || medium === null || criterion.medium === medium);
  const lines: MeasurementCriterionLine[] = inForce.map((criterion) => {
    // Fix batch e23p (P5): a maximum read from the plate states its number when the plate gives one.
    if (criterion.type !== 'max_field') return { text: criterionTextOf(criterion), sourceName: criterion.source.name, sourceEdition: criterion.source.edition };
    const { limit, byDefault } = maxFieldLimit(block, context.definition.nameplate, criterion);
    return { text: maxFieldCriterionText(criterion, limit, byDefault), sourceName: criterion.source.name, sourceEdition: criterion.source.edition };
  });
  // Story 24.9 (F17): while the medium is unknown both criteria read by medium stand; on screen each is named by its medium.
  const mediumWords: Readonly<Record<string, string>> = { oil: 'Óleo', dry: 'Seco' };
  const byMedium = medium === null && inForce.some((criterion) => criterion.type === 'phase_deviation' && criterion.medium !== undefined);
  // authored (e24b, listed for Bruno): "Óleo: … · Seco: …".
  const screenCriterion = byMedium
    ? inForce
        .map((criterion, i) => (criterion.type === 'phase_deviation' && criterion.medium !== undefined ? `${mediumWords[criterion.medium] ?? criterion.medium}: ${lines[i]!.text}` : lines[i]!.text))
        .join(' · ')
    : null;
  // Story 23.15: a FO.SERV-03 type's measurement test is titled by its label alone (the CTA's keep "E{n} ·").
  const unnumbered = context.unnumbered;
  return {
    testKey: test.key,
    number,
    label: test.label,
    title: unnumbered ? test.label : `E${number} · ${test.label}`,
    switchable: test.switchable !== undefined,
    offNote: test.switchable?.off_note ?? null,
    enabled,
    applicability,
    skipped,
    instrumentOf: test.instrument_of ?? null,
    rowHeader: test.row_header,
    columns,
    rows,
    reference,
    values,
    valuesLine: valuesLineOf(test, values, skipped),
    groups: groupsOf(values, skipped),
    criteria: lines,
    criterionText: lines.map((line) => line.text).join('; '),
    // Story 24.9 (F17): with the medium unknown, the screen names each criterion by its medium; the print keeps `criterionText`.
    ...(screenCriterion === null ? {} : { screenCriterionText: screenCriterion }),
    sourceName: [...new Set(lines.map((line) => line.sourceName))].join('; '),
    ...(unnumbered ? { unnumbered: true as const } : {}),
    ...(winding === null ? {} : { temperature: winding.view }),
    ...(notes.length === 0 ? {} : { notes }),
    ...(live && stands ? { restrictionStands: true as const } : {}),
    ...(unjudged ? { unjudged: true as const } : {}),
  };
}

const NONE: readonly MeasurementTestEvaluation[] = Object.freeze([]);

/**
 * THE evaluation: every measurement test of the sheet, in the definition's order, a switched
 * off one included (`enabled: false`: the sheet draws its switch and its off note). A block
 * type with no measurement test (every FO.SERV-03 type) answers none.
 */
export function evaluateSheetMeasurements(
  block: Pick<BlockRow, 'config' | 'sheet'> & Partial<Pick<BlockRow, 'seed_version'>>,
  definition: Pick<BlockDefinition, 'measurement_tests' | 'config_fields'> & Partial<Pick<BlockDefinition, 'nameplate' | 'tests' | 'oil_rule' | 'block_type'>>,
  visit: VisitContext = NO_VISIT_CONTEXT,
): readonly MeasurementTestEvaluation[] {
  const tests = definition.measurement_tests;
  if (tests === undefined) return NONE;
  const config = configOptionsOf(block, definition);
  // Story 23.9: a test's applicability reads the plate; a caller that hands no nameplate reads every test as applicable.
  const plate = { nameplate: definition.nameplate ?? [], tests: definition.tests ?? [], measurement_tests: tests };
  // Batch e23t (Stories 23.15 to 23.19): the plate, the oil rule and (batch e23v's) visit context a v13 test reads.
  const context: MeasurementContext = { definition: { ...plate, ...(definition.oil_rule === undefined ? {} : { oil_rule: definition.oil_rule }) }, visit, unnumbered: measurementTestsUnnumbered(definition), ...(block.seed_version === undefined ? {} : { seedVersion: block.seed_version }) };
  return tests.map((test, index) => evaluate(block, test, index + 1, config, testApplicability(block, plate, test.key), context));
}

/** Story 22.10: a typed reading of a cell, a limit the instrument passed carrying `state: 'over_range'`. */
export type ParsedCellReading = ParsedReading & { state?: 'over_range' };

/** What the cell parse reads of a cell: its units, the positive-only message and (Story 22.10) whether it takes a limit. */
export interface ReadingCellInput {
  units: readonly string[];
  positiveOnlyText?: string | null;
  /** Absent: the cell takes no reading above the limit (a caller that never offers one). */
  overRange?: OverRangeAllowance;
}

/**
 * Epic 14 QA Q-3: a typed reading of a measurement cell, read as `parseReadingPtBr` reads it,
 * and refused (`'invalid'`) at or below zero on a cell that takes only a positive reading
 * (`positiveOnlyText`), so nothing is committed for it. Story 22.10: THE input parse of every
 * number cell, seeded or measurement: "OL" or "0L" takes `range` (the picked instrument's limit
 * for the test, `instrumentRangeFor`) in the cell's units, "> 2 TΩ" the typed limit, both as
 * `state: 'over_range'`; refused (`'invalid'`) on a cell whose `overRange` refuses it, for an
 * "OL" with no limit to take, and for a malformed limit ("> 0", "> abc").
 */
export function parseMeasurementReadingPtBr(text: string, cell: ReadingCellInput, defaultUnit: string | null, range: InstrumentRange | null = null): ParsedCellReading | null | 'invalid' {
  const over = parseOverRangePtBr(text, { units: cell.units, defaultUnit });
  if (over !== null) {
    if (cell.overRange?.allowed !== true || over === 'invalid') return 'invalid';
    if (over.kind === 'limit') return { raw: over.raw, unit: over.unit, state: 'over_range' };
    const limit = rangeInUnits(range, cell.units, defaultUnit);
    return limit === null ? 'invalid' : { raw: limit.raw, unit: limit.unit, state: 'over_range' };
  }
  const parsed = parseReadingPtBr(text, { units: cell.units, defaultUnit });
  if (parsed === null || parsed === 'invalid') return parsed;
  return (cell.positiveOnlyText ?? null) !== null && !(Number(parsed.raw) > 0) ? 'invalid' : parsed;
}

/**
 * Story 22.10: why a typed over-range text is refused: the cell's own refusal when it takes no
 * limit (a ratio cell, a compared cell), the no-limit text for an "OL" with no instrument limit
 * in the cell's units (the example in `defaultUnit`); null for a text that is no over-range
 * syntax, a limit that parses, or a malformed one (the field's generic message).
 */
export function overRangeRefusal(text: string, cell: ReadingCellInput, defaultUnit: string | null, range: InstrumentRange | null = null): string | null {
  const over = parseOverRangePtBr(text, { units: cell.units, defaultUnit });
  if (over === null) return null;
  if (cell.overRange !== undefined && !cell.overRange.allowed) return cell.overRange.refusal === '' ? null : cell.overRange.refusal;
  if (over === 'invalid' || over.kind === 'limit') return null;
  // e22g (review S1): a limit set in a unit the cell cannot read says so, not "sem limite cadastrado".
  return rangeInUnits(range, cell.units, defaultUnit) === null ? overRangeMissingLimitText(range, cell.units, defaultUnit) : null;
}

/**
 * Epic 14 QA Q-3: why a typed reading is refused when it is a number at or below zero on a
 * positive-only cell (the cell's `positiveOnlyText`, "-5" included); null for any other text,
 * where the field shows its generic "not a number" message. Story 22.10: an over-range text
 * refused says why first (`overRangeRefusal`).
 */
export function measurementReadingRefusal(text: string, cell: ReadingCellInput, defaultUnit: string | null, range: InstrumentRange | null = null): string | null {
  const over = overRangeRefusal(text, cell, defaultUnit, range);
  if (over !== null) return over;
  const message = cell.positiveOnlyText ?? null;
  if (message === null) return null;
  const trimmed = text.trim();
  const negative = trimmed.startsWith('-');
  const parsed = parseReadingPtBr(negative ? trimmed.slice(1) : trimmed, { units: cell.units, defaultUnit });
  if (parsed === null || parsed === 'invalid') return null;
  return negative || !(Number(parsed.raw) > 0) ? message : null;
}

/** Epic 14 QA Q-3: whether a counted measurement cell holds a zero or negative reading to check (`toCheck`). */
export function anyMeasurementToCheck(evaluations: readonly MeasurementTestEvaluation[]): boolean {
  return measurementCells(evaluations).some((cell) => cell.toCheck);
}

/** The tests that count: switched on and run, and (Story 23.9) not made not applicable by the nameplate. */
function liveTests(evaluations: readonly MeasurementTestEvaluation[]): MeasurementTestEvaluation[] {
  return evaluations.filter((test) => test.enabled && !test.skipped && test.applicability.state !== 'na');
}

/** Every typed cell (never a fixed one) of the tests that are switched on and were run, in sheet order. */
export function measurementCells(evaluations: readonly MeasurementTestEvaluation[]): EvaluatedMeasurementCell[] {
  return liveTests(evaluations).flatMap((test) => test.rows.flatMap((row) => row.cells.filter((cell) => cell.fixed === null)));
}

/** Every shown value of the tests that are switched on, in sheet order. */
export function measurementValues(evaluations: readonly MeasurementTestEvaluation[]): EvaluatedMeasurementValue[] {
  return evaluations.filter((test) => test.enabled && test.applicability.state !== 'na').flatMap((test) => test.values.filter((value) => value.shown));
}

/** What `sheetProgress` adds to the Ensaios step: the required cells and values still empty, and the cells out of criterion. */
export function measurementCounts(evaluations: readonly MeasurementTestEvaluation[]): { missing: number; outOfLimit: number } {
  const cells = measurementCells(evaluations);
  return {
    missing: cells.filter((cell) => cell.missing).length + measurementValues(evaluations).filter((value) => value.missing).length,
    outOfLimit: cells.filter((cell) => cell.verdict === 'out').length,
  };
}

/** Where a cell is, as a sentence names it: "Polo C, Lado Emergência"; the row alone on a one-column table. */
export function measurementWhere(test: Pick<MeasurementTestEvaluation, 'columns'>, row: Pick<EvaluatedMeasurementRow, 'label'>, cell: Pick<EvaluatedMeasurementCell, 'column'>): string {
  return test.columns.length > 1 ? `${row.label}, ${cell.column}` : row.label;
}

/** One measurement test's worst reading out of its criterion. */
export interface WorstMeasurement {
  testKey: MeasurementTestKey;
  /** "E1 · Resistência de contato". */
  title: string;
  /** "Resistência de contato". */
  label: string;
  /** "Polo C, Lado Emergência". */
  where: string;
  /** "63 µΩ", "30 min", "Grave". */
  valueText: string;
  criterionText: string;
  sourceName: string;
  /** "62 % acima do menor do lado (39 µΩ) — critério ≤ 50 %". */
  helperText: string;
}

/**
 * The worst out-of-criterion reading of every measurement test that holds one (the furthest
 * beyond its criterion; the first in sheet order where no distance exists), in test order. A
 * test with every judged cell within its criterion gives none: unlike the seeded grammars,
 * a table of settings or classes has no "worst within" to name.
 */
export function worstMeasurements(evaluations: readonly MeasurementTestEvaluation[]): WorstMeasurement[] {
  const out: WorstMeasurement[] = [];
  for (const test of liveTests(evaluations)) {
    let worst: { row: EvaluatedMeasurementRow; cell: EvaluatedMeasurementCell } | null = null;
    for (const row of test.rows) {
      for (const cell of row.cells) {
        if (cell.fixed !== null || cell.verdict !== 'out') continue;
        if (worst === null || cell.excess > worst.cell.excess) worst = { row, cell };
      }
    }
    if (worst === null) continue;
    const { row, cell } = worst;
    out.push({
      testKey: test.testKey,
      title: test.title,
      label: test.label,
      where: measurementWhere(test, row, cell),
      valueText: withUnit(cell.displayText, cell.unit),
      criterionText: cell.criterionText ?? test.criterionText,
      sourceName: cell.sourceName ?? test.sourceName,
      helperText: cell.helperText ?? '',
    });
  }
  return out;
}

/** Seed v13 (batch e23t, Stories 23.15 and 23.19): one measurement test's restricted cells, each named with its reason. */
export interface RestrictedMeasurement {
  testKey: MeasurementTestKey;
  /** The test's heading ("Resistência ôhmica dos enrolamentos"). */
  title: string;
  label: string;
  /** "AT, tap atual, Fase C: desvio de 3 % sobre a menor fase", in sheet order. */
  items: string[];
  /**
   * Fix batch e23p (P3): `items` as the derived point names them, a history restriction followed by
   * both corrected values ("…: variação de mais de 10 % desde a manutenção anterior (de 2,3 Ω para
   * 3,5 Ω, a 75 °C)"); the same as `items` where no cell carries a comparison.
   */
  pointItems: string[];
  /** Whether the test also holds a cell out of its criterion (its `reading` entry then speaks for it). */
  hasOut: boolean;
}

/** Every live measurement test holding a restricted cell, in test order (none on v5 to v12: no rule there restricts). */
export function restrictedMeasurements(evaluations: readonly MeasurementTestEvaluation[]): RestrictedMeasurement[] {
  const out: RestrictedMeasurement[] = [];
  for (const test of liveTests(evaluations)) {
    const restricted = test.rows.flatMap((row) => row.cells.flatMap((cell) => (cell.fixed === null && cell.verdict === 'restricted' && cell.restriction != null ? [{ row, cell, restriction: cell.restriction }] : [])));
    if (restricted.length === 0) continue;
    const items = restricted.map(({ row, cell, restriction }) => `${measurementWhere(test, row, cell)}: ${restriction.reason}`);
    const pointItems = restricted.map(({ row, cell, restriction }) => `${measurementWhere(test, row, cell)}: ${restriction.pointReason ?? restriction.reason}`);
    const hasOut = test.rows.some((row) => row.cells.some((cell) => cell.fixed === null && cell.verdict === 'out'));
    out.push({ testKey: test.testKey, title: test.title, label: test.label, items, pointItems, hasOut });
  }
  return out;
}

// --- the continuous Enter run ---------------------------------------------------------------------

function sameMeasurementAddress(a: MeasurementAddress, b: MeasurementAddress): boolean {
  return a.testKey === b.testKey && a.row === b.row && a.col === b.col;
}

/** One column of one test, its typed number cells in the rows shown: the run's unit of "down". A choice or a fixed cell is never a stop. */
function measurementRunBlocks(evaluations: readonly MeasurementTestEvaluation[]): EvaluatedMeasurementCell[][] {
  const blocks: EvaluatedMeasurementCell[][] = [];
  for (const test of liveTests(evaluations)) {
    for (const column of test.columns) {
      const cells = test.rows.flatMap((row) => {
        const cell = row.cells[column.col];
        return cell !== undefined && cell.fixed === null && cell.kind === 'number' ? [cell] : [];
      });
      if (cells.length > 0) blocks.push(cells);
    }
  }
  return blocks;
}

/**
 * The continuous Enter run over a sheet's measurement tests, the rule `runTarget` holds for
 * the seeded tables (EXPERIENCE.md › Measurement table, Keyboard): `next` moves down the
 * column and, after its last typed row, to the first empty typed cell of what follows (the
 * table's next column, then the next tests), `'end'` when nothing empty follows (the primary
 * action takes the focus); `previous` goes back one cell; `right` is the next typed cell of
 * the same row. Only number cells of the tests switched on and run are stops. Null where
 * there is nowhere to go, or when `from` is no stop.
 */
export function measurementRunTarget(
  evaluations: readonly MeasurementTestEvaluation[],
  from: MeasurementAddress,
  direction: 'next' | 'previous' | 'right',
): MeasurementAddress | 'end' | null {
  const blocks = measurementRunBlocks(evaluations);
  const b = blocks.findIndex((block) => block.some((cell) => sameMeasurementAddress(cell.address, from)));
  if (b === -1) return null;
  const block = blocks[b]!;
  const at = block.findIndex((cell) => sameMeasurementAddress(cell.address, from));
  if (direction === 'right') {
    const next = blocks.slice(b + 1).find((later) => later[0]!.address.testKey === from.testKey && later.some((cell) => cell.address.row === from.row));
    return next?.find((cell) => cell.address.row === from.row)?.address ?? null;
  }
  if (direction === 'previous') {
    if (at > 0) return block[at - 1]!.address;
    const before = blocks[b - 1];
    return before === undefined ? null : before[before.length - 1]!.address;
  }
  if (at < block.length - 1) return block[at + 1]!.address;
  for (const later of blocks.slice(b + 1)) {
    const empty = later.find((cell) => cell.state === 'empty');
    if (empty !== undefined) return empty.address;
  }
  return 'end';
}

/** The first stop of the measurement run, empty or not; null when no test switched on and run has a typed number cell. */
export function measurementRunStart(evaluations: readonly MeasurementTestEvaluation[]): MeasurementAddress | null {
  return measurementRunBlocks(evaluations)[0]?.[0]?.address ?? null;
}

/** The first empty stop of the measurement run (where Enter lands coming from the seeded tables), or null when every stop holds a value. */
export function firstMeasurementRunCell(evaluations: readonly MeasurementTestEvaluation[]): MeasurementAddress | null {
  for (const block of measurementRunBlocks(evaluations)) {
    const empty = block.find((cell) => cell.state === 'empty');
    if (empty !== undefined) return empty.address;
  }
  return null;
}

/** The mobile keyboard's Enter key label of a run cell (`runEnterKeyHint`'s rule): `next` while Enter moves to another cell, else `done`. */
export function measurementRunEnterKeyHint(evaluations: readonly MeasurementTestEvaluation[], address: MeasurementAddress): 'next' | 'done' {
  const target = measurementRunTarget(evaluations, address, 'next');
  return target === null || target === 'end' ? 'done' : 'next';
}

// --- lookups by address (the Conflict view, the fold's refusals share the geometry) ------------------

function testOf(definition: Pick<BlockDefinition, 'measurement_tests'> | null, testKey: string): { test: MeasurementTest; number: number } | null {
  const tests = definition?.measurement_tests ?? [];
  const at = tests.findIndex((test) => test.key === testKey);
  return at === -1 ? null : { test: tests[at]!, number: at + 1 };
}

/** A measurement test's heading ("E1 · Resistência de contato"), or null when the definition has no such test. */
export function measurementTestTitle(definition: (Pick<BlockDefinition, 'measurement_tests'> & Partial<Pick<BlockDefinition, 'tests' | 'block_type'>>) | null, testKey: string): string | null {
  const found = testOf(definition, testKey);
  if (found === null) return null;
  // Story 23.15 (seed v13): a seeded FO.SERV-03 type's measurement test is named by its label alone.
  return measurementTestsUnnumbered(definition) ? found.test.label : `E${found.number} · ${found.test.label}`;
}

/** A table cell's name ("Polo C · Lado Emergência"), or null when the address is outside the test. */
export function measurementCellLabel(definition: Pick<BlockDefinition, 'measurement_tests'> | null, testKey: string, row: number, col: number): string | null {
  const test = testOf(definition, testKey)?.test;
  const rowDef = test?.rows[row];
  const column = test?.columns[col];
  return rowDef === undefined || column === undefined ? null : `${rowDef.label} · ${column.label}`;
}

/** A test value's name ("Método"), or null when the test declares no such value. */
export function measurementValueLabel(definition: Pick<BlockDefinition, 'measurement_tests'> | null, testKey: string, valueKey: string): string | null {
  return (testOf(definition, testKey)?.test.values ?? []).find((value) => value.key === valueKey)?.label ?? null;
}

/**
 * How a measurement test's stored value reads in a sentence or the Conflict view: a choice by
 * its option label, a number with its unit; null when the address is not a cell or a value of
 * the test, or the value is none the kind reads.
 */
export function measurementStoredText(
  definition: Pick<BlockDefinition, 'measurement_tests'> | null,
  testKey: string,
  at: { row: number; col: number } | { valueKey: string },
  value: unknown,
): string | null {
  const test = testOf(definition, testKey)?.test;
  if (test === undefined) return null;
  let kind: MeasurementValueKind;
  let options: readonly MeasurementOption[];
  let unit: string | null;
  if ('valueKey' in at) {
    const def = (test.values ?? []).find((candidate) => candidate.key === at.valueKey);
    if (def === undefined) return null;
    ({ kind } = def);
    options = def.options ?? [];
    unit = def.unit ?? null;
  } else {
    const row = test.rows[at.row];
    const column = test.columns[at.col];
    if (row === undefined || column === undefined) return null;
    kind = row.kind ?? column.kind;
    options = (row.kind === undefined ? column.options : row.options) ?? [];
    unit = (row.kind === undefined ? column.unit : row.unit) ?? null;
  }
  const stored = read({ value } as Cell, kind, options);
  if (stored === null || stored.state === 'invalid') return null;
  const text = displayOf(stored, kind, options);
  return kind === 'number' && isReadingValue(stored.state) ? withUnit(text, stored.unit ?? unit) : text;
}
