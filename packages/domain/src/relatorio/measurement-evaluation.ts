import { formatDecimalGroupedPtBr, INSULATION_UNITS } from '../parse/pt-br-number.ts';
import type { SubBlockKey } from '../schemas/block-config.ts';
import type { BlockRow, Cell, JsonValue } from '../schemas/entities.ts';
import { formatCriterionValue, scaleToUnit, SEEDED_CRITERIA } from '../seed/criteria.ts';
import type {
  ConfigField,
  InstrumentOf,
  MeasurementColumn,
  MeasurementCriterion,
  MeasurementKind,
  MeasurementOption,
  MeasurementRow,
  MeasurementTest,
  MeasurementTestKey,
  MeasurementValue,
  WhenConfig,
} from '../seed/measurement.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { readStored, type ReadingState, type ReadingVerdict } from './reading-cells.ts';
import { enabledSubBlocksOf } from './sheet-state.ts';

/*
 * Story 14.5 (seed v5): THE evaluation of a sheet's measurement tests, the tests of the
 * measurement-table grammar (`seed/measurement.ts`; today the six of the Chave de
 * transferência automática). It is to those tests what `evaluateSheetReadings` is to the four
 * seeded grammars, and the same consumers read both: `sheetProgress` counts what is missing
 * and out of criterion, `suggestConclusionPair` and `composeConclusion` read the out readings,
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
export function blockConfigWithSubBlock(config: unknown, key: SubBlockKey, enabled: boolean): JsonValue {
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
  /** The value as the cell shows it: "3.300", "Ligado", "-" (not measured), "—" (empty), the fixed text. */
  displayText: string;
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
  kind: MeasurementKind;
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
  /** Their wording joined ("≤ 50 % acima do menor do mesmo lado"). */
  criterionText: string;
  /** Their sources joined, each once. */
  sourceName: string;
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

function read(cell: Cell | undefined, kind: MeasurementKind, options: readonly MeasurementOption[]): Stored | null {
  return kind === 'choice' ? readChoice(cell, options) : readStored(cell);
}

function displayOf(stored: Stored | null, kind: MeasurementKind, options: readonly MeasurementOption[]): string {
  if (stored === null) return EMPTY;
  if (stored.state === 'not_measured') return NOT_MEASURED;
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
  unit: string | null;
  /** The limit alone, for the helper text ("≥ 100 MΩ", ">400 MΩ"). */
  text: string;
}

/** The limit of an absolute criterion: its own, or the seeded criterion's it names. Null when it names none. */
function limitOf(criterion: Extract<MeasurementCriterion, { type: 'absolute' }>): Limit | null {
  if (criterion.seeded !== undefined) {
    const seeded = SEEDED_CRITERIA.find((candidate) => candidate.key === criterion.seeded);
    return seeded === undefined ? null : { operator: seeded.operator, value: seeded.value, unit: seeded.unit, text: formatCriterionValue(seeded) };
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
    default:
      return null;
  }
  return { within, excess: within || limit.value === 0 ? 0 : Math.abs(scaled - limit.value) / Math.abs(limit.value) };
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
function mark(cell: EvaluatedMeasurementCell, within: boolean, criterion: MeasurementCriterion, helperText: string, excess: number): void {
  if (within) {
    if (cell.verdict === null) cell.verdict = 'within';
    return;
  }
  if (cell.verdict === 'out' && cell.excess >= excess) return;
  cell.verdict = 'out';
  cell.helperText = helperText;
  cell.criterionText = criterionTextOf(criterion);
  cell.sourceName = criterion.source.name;
  cell.excess = excess;
}

function applyAbsolute(rows: readonly EvaluatedMeasurementRow[], criterion: Extract<MeasurementCriterion, { type: 'absolute' }>): void {
  const limit = limitOf(criterion);
  if (limit === null) return;
  // authored: the seeded tables' own helper wording (`reading-evaluation.ts`).
  const helper = limit.operator.startsWith('>') ? `Abaixo do aceitável (${limit.text})` : `Acima do aceitável (${limit.text})`;
  for (const row of rows) {
    if (criterion.rows !== undefined && !criterion.rows.includes(row.key)) continue;
    for (const cell of row.cells) {
      if (cell.kind !== 'number' || !judged(cell)) continue;
      if (criterion.columns !== undefined && !criterion.columns.includes(cell.columnKey)) continue;
      const answer = withinLimit(Number(cell.raw), cell.unit, limit);
      if (answer !== null) mark(cell, answer.within, criterion, helper, answer.excess);
    }
  }
}

/** The measured number cells of one column in the column's base unit, with the lowest of them; null with none or a lowest that is not positive. */
function columnLowest(rows: readonly EvaluatedMeasurementRow[], column: EvaluatedMeasurementColumn): { cells: { cell: EvaluatedMeasurementCell; value: number }[]; lowest: { cell: EvaluatedMeasurementCell; value: number } } | null {
  const cells = rows.flatMap((row) => {
    const cell = row.cells.find((candidate) => candidate.address.col === column.col);
    if (cell === undefined || cell.kind !== 'number' || !judged(cell)) return [];
    const value = scaleToUnit(Number(cell.raw), cell.unit, column.unit ?? cell.unit);
    return value === null ? [] : [{ cell, value }];
  });
  if (cells.length === 0) return null;
  const lowest = cells.reduce((least, entry) => (entry.value < least.value ? entry : least));
  return lowest.value > 0 ? { cells, lowest } : null;
}

function applyRelative(
  rows: readonly EvaluatedMeasurementRow[],
  columns: readonly EvaluatedMeasurementColumn[],
  criterion: Extract<MeasurementCriterion, { type: 'relative_to_lowest' }>,
): void {
  for (const column of columns) {
    if (column.kind !== 'number') continue;
    const found = columnLowest(rows, column);
    // Fewer than two measured cells: nothing to compare the one with.
    if (found === null || found.cells.length < 2) continue;
    const lowestText = withUnit(found.lowest.cell.displayText, found.lowest.cell.unit);
    for (const { cell, value } of found.cells) {
      const pct = roundPct(((value - found.lowest.value) / found.lowest.value) * 100);
      const within = pct <= criterion.max_percent;
      // authored: after `63-ficha-cta.html` ("62 % acima do menor do lado (39 µΩ) — critério ≤ 50 %").
      const helper = `${numberText(Math.round(pct))} % acima do ${lowerFirst(criterion.reference_label)} (${lowestText}) — critério ≤ ${numberText(criterion.max_percent)} %`;
      mark(cell, within, criterion, helper, within ? 0 : pct / criterion.max_percent - 1);
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
        optional: column.optional === true,
        state,
        raw: value?.raw ?? '',
        // A fixed cell is text: it has no unit slot.
        unit: kind === 'choice' || fixed !== null ? null : (value?.unit ?? defaultUnit),
        units: fixed === null ? unitsOf(defaultUnit) : [],
        options,
        displayText: fixed ?? displayOf(value, kind, options),
        verdict: null,
        helperText: null,
        criterionText: null,
        sourceName: null,
        excess: 0,
        missing: fixed === null && column.optional !== true && state === 'empty',
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
      previous = cell.unit;
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
    const unit = value.kind === 'choice' ? null : (held?.unit ?? value.unit ?? null);
    const depends = value.when === undefined ? undefined : (test.values ?? []).find((candidate) => candidate.key === value.when!.value);
    const shown = value.when === undefined || (depends !== undefined && heldBy(depends)?.state === 'measured' && heldBy(depends)!.raw === value.when.equals);
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
      displayText: value.kind === 'number' && state === 'measured' ? withUnit(text, unit) : text,
      missing: shown && value.optional !== true && state === 'empty',
    };
  });
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
    const parent = defs.get(value.key)?.when?.value;
    if (value.kind === 'number' && parent !== undefined && live.some((candidate) => candidate.key === parent && candidate.kind === 'choice')) continue;
    if (value.kind === 'number') {
      parts.push({ label: value.label, text: value.displayText, kind: 'number' });
      continue;
    }
    const details = live.filter((candidate) => candidate.kind === 'number' && defs.get(candidate.key)?.when?.value === value.key).map((candidate) => candidate.displayText);
    parts.push({ label: value.label, text: details.length === 0 ? phraseOf(value) : `${phraseOf(value)} (${details.join(', ')})`, kind: 'choice' });
  }
  return parts.length === 0 ? null : { parts, text: parts.map((part) => `${part.label}: ${part.text}`).join(' · ') };
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

function evaluate(block: Pick<BlockRow, 'config' | 'sheet'>, test: MeasurementTest, number: number, config: Readonly<Record<string, string>>): MeasurementTestEvaluation {
  const enabled = test.switchable === undefined || enabledSubBlocksOf(block).has(test.key);
  const columns = columnsOf(test);
  const rows = evaluateRows(block, test, config);
  const values = evaluateValues(block, test);
  const skipValue = test.skip_when === undefined ? undefined : values.find((value) => value.key === test.skip_when!.value);
  const skipped = skipValue !== undefined && skipValue.state === 'measured' && skipValue.raw === test.skip_when!.equals;
  const live = enabled && !skipped;
  const criteria = test.criteria.filter((criterion) => holds(criterion.when, config));

  let reference: MeasurementReference | null = null;
  if (live) {
    for (const criterion of criteria) {
      if (criterion.type === 'absolute') applyAbsolute(rows, criterion);
      else if (criterion.type === 'relative_to_lowest') applyRelative(rows, columns, criterion);
      else if (criterion.type === 'equals_column') applyEquals(rows, criterion);
      else applyChoicePass(rows, criterion);
    }
  } else {
    // A test switched off or not run requires nothing: its cells keep what they hold and are neither missing nor judged.
    for (const row of rows) for (const cell of row.cells) cell.missing = false;
  }
  const relative = criteria.find((criterion) => criterion.type === 'relative_to_lowest');
  if (relative !== undefined && relative.type === 'relative_to_lowest') reference = referenceOf(rows, columns, relative);
  for (const value of values) {
    // The value that says the test was not run is the one thing a skipped test still asks for; it is filled by definition.
    if (!enabled || skipped) value.missing = false;
  }

  const lines: MeasurementCriterionLine[] = criteria.map((criterion) => ({ text: criterionTextOf(criterion), sourceName: criterion.source.name, sourceEdition: criterion.source.edition }));
  return {
    testKey: test.key,
    number,
    label: test.label,
    title: `E${number} · ${test.label}`,
    switchable: test.switchable !== undefined,
    offNote: test.switchable?.off_note ?? null,
    enabled,
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
    sourceName: [...new Set(lines.map((line) => line.sourceName))].join('; '),
  };
}

const NONE: readonly MeasurementTestEvaluation[] = Object.freeze([]);

/**
 * THE evaluation: every measurement test of the sheet, in the definition's order, a switched
 * off one included (`enabled: false`: the sheet draws its switch and its off note). A block
 * type with no measurement test (every FO.SERV-03 type) answers none.
 */
export function evaluateSheetMeasurements(block: Pick<BlockRow, 'config' | 'sheet'>, definition: Pick<BlockDefinition, 'measurement_tests' | 'config_fields'>): readonly MeasurementTestEvaluation[] {
  const tests = definition.measurement_tests;
  if (tests === undefined) return NONE;
  const config = configOptionsOf(block, definition);
  return tests.map((test, index) => evaluate(block, test, index + 1, config));
}

/** The tests that count: switched on and run. */
function liveTests(evaluations: readonly MeasurementTestEvaluation[]): MeasurementTestEvaluation[] {
  return evaluations.filter((test) => test.enabled && !test.skipped);
}

/** Every typed cell (never a fixed one) of the tests that are switched on and were run, in sheet order. */
export function measurementCells(evaluations: readonly MeasurementTestEvaluation[]): EvaluatedMeasurementCell[] {
  return liveTests(evaluations).flatMap((test) => test.rows.flatMap((row) => row.cells.filter((cell) => cell.fixed === null)));
}

/** Every shown value of the tests that are switched on, in sheet order. */
export function measurementValues(evaluations: readonly MeasurementTestEvaluation[]): EvaluatedMeasurementValue[] {
  return evaluations.filter((test) => test.enabled).flatMap((test) => test.values.filter((value) => value.shown));
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
export function measurementTestTitle(definition: Pick<BlockDefinition, 'measurement_tests'> | null, testKey: string): string | null {
  const found = testOf(definition, testKey);
  return found === null ? null : `E${found.number} · ${found.test.label}`;
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
  let kind: MeasurementKind;
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
  return kind === 'number' && stored.state === 'measured' ? withUnit(text, stored.unit ?? unit) : text;
}
