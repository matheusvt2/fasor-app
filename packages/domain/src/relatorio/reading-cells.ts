import { canonicalDecimal, INSULATION_UNITS, parseDecimalPtBr } from '../parse/pt-br-number.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import type { CriterionSeed } from '../seed/criteria.ts';
import type { BlockDefinition, ColumnDef, TableDef, TestDef } from '../seed/schema.ts';
import { screenAcronym } from './screen-label.ts';
import { isCellFilled } from './sheet-state.ts';
import type { OverRangeAllowance } from './over-range.ts';
import { DEFAULT_VECTOR_GROUP_CODE, parseVectorGroup, VECTOR_GROUP_FIELD, vectorGroupByCode, type VectorGroup } from './vector-group.ts';

/*
 * Stories 5.5-5.6 (FR-27, FR-28, UX-DR39/40): THE evaluation of a sheet's readings. The
 * Measurement table, `sheetProgress`, `conclusionFloor` (Story 22.4) and `composeConclusion` all read
 * `evaluateSheetReadings`, so "out of criterion" has exactly one rule and `compareCriterion`
 * is called for a sheet from nowhere else (AD-1/AD-13).
 *
 * Cell addressing, the op log's (`sheet/{b}/test/{t}/cell/{row}/{col}`, the Porto Seguro
 * fixture's `op-log.ts`): `row` counts the rows across the test's tables in table order
 * (contato aberto 0-2, contato fechado 3-5); `col` indexes that row's table
 * `value_columns` (the single insulation capture `1 MINUTO` is col 1; the TP ratio inputs
 * are cols 0 and 1, its capture col 3). `print` columns are neither shown nor required but
 * stay writable (the fixture writes them `not_measured`); `derived` columns are the
 * kernel's (VAL CALCULADO, CONDIÇÕES) and never written.
 */

/*
 * E9-A7: the readings' vocabulary -- the evaluation's types, the label and unit helpers, the
 * stored cell reader and the ratio inputs from the nameplate. `readings.ts` re-exports the
 * public part; the helpers exported here for `reading-evaluation.ts` stay out of the barrel.
 */

export type TestKey = TestDef['key'];

export interface CellAddress {
  testKey: TestKey;
  row: number;
  col: number;
}

/** Story 22.10: `over_range` is a reading above the instrument's limit, `raw` that limit (`over-range.ts`). */
export type ReadingState = 'empty' | 'measured' | 'not_measured' | 'over_range' | 'invalid';
export type ReadingVerdict = 'within' | 'out';
export type ReadingSource = 'typed' | 'nameplate' | 'derived';

/** A column the Measurement table draws (every value column but `print`). */
export interface VisibleColumn {
  col: number;
  /**
   * The seed's label, as FO.SERV-03 prints it ("1 MINUTO"). Story 21.1: a capture column of a
   * ratio table evaluated with a vector group reads that group's pair of its phase instead
   * ("H1-H3 / X1-X3" on a Yyn0), on screen and in print; storage stays addressed by `col`.
   */
  label: string;
  /** The header the table shows ("1 minuto", "Valor", "Calculado"). */
  header: string;
  role: 'capture' | 'input' | 'derived';
  unit: string | null;
  /** On a derived column: which of the two the kernel computes. */
  derivedKind: 'calculated' | 'condicao' | null;
}

export interface EvaluatedCell {
  address: CellAddress;
  role: 'capture' | 'input';
  /** The column's header ("1 minuto"), for the cell's accessible name. */
  column: string;
  state: ReadingState;
  /** The stored dot-decimal raw; '' when nothing is stored. */
  raw: string;
  /** The unit the cell shows: the stored one, else the previous row's, else the column's. */
  unit: string | null;
  /** The units the unit slot may take: the insulation family (a tap-cycle) or the one fixed unit. */
  units: readonly string[];
  /** The stored reading as the cell shows it: "3.300", "> 2" (over range), "-" (not measured), "—" (empty). */
  displayText: string;
  /**
   * Story 22.10: whether the cell takes a reading above the instrument's limit ("OL", "> 2 TΩ",
   * the "> limite" action), and the refusal it shows when not (every relação de transformação
   * cell, capture or input).
   */
  overRange: OverRangeAllowance;
  source: ReadingSource | null;
  /** A ratio input left untyped reads the nameplate: its value in the column's unit, as the cell's placeholder. */
  fallback: { raw: string; text: string } | null;
  verdict: ReadingVerdict | null;
  /** "Abaixo do aceitável (>400 MΩ)" when out of criterion. */
  helperText: string | null;
  outlier: { text: string } | null;
  /** Counted by `sheetProgress`: a capture not filled, or an input with no effective value. */
  missing: boolean;
}

export interface EvaluatedRow {
  /** The row index across the test's tables (the op path's `row`). */
  row: number;
  /**
   * The connection cells as the table shows them ("Fase A", "Massa", ""). A typed connection
   * the seed leaves blank (the transformer ratio's `TAP Nº`) reads the plate's TAP ATUAL
   * verbatim ("5"), '' when the plate holds none (UX pass 2026-10-22, F42).
   */
  connection: string[];
  /** The row's name: its first connection cell, sentence-cased ("Fase C"). */
  label: string;
  cells: EvaluatedCell[];
  /** Ratio rows: VAL CALCULADO, computed from the effective primary and secondary. */
  calculated: { raw: string; text: string } | null;
  /**
   * Ratio rows: "INSATISFATÓRIO" when any capture of the row is out of the criterion, else
   * "SATISFATÓRIO" when every capture is within it; null while a capture is still unjudged
   * (UX pass 2026-10-22, F42).
   */
  condicao: 'SATISFATÓRIO' | 'INSATISFATÓRIO' | null;
}

export interface EvaluatedTable {
  key: string;
  /** The seed table's title sentence-cased ("Seccionadora contato aberto"), or null. */
  title: string | null;
  connectionHeaders: string[];
  columns: VisibleColumn[];
  rows: EvaluatedRow[];
  /** A ratio (TTR) table: stacked into cards below 768 px. */
  ratio: boolean;
  /**
   * Story 15.6 (seed v9): the sentence under a ratio table whose VAL CALCULADO applies a factor
   * ("Calculado: U1 · √3 / U2"), on the sheet only, never printed; null on every other table.
   * Story 21.1: the formula of the vector group the table evaluates with ("Calculado: U1 / U2" on a
   * Yyn0); null while a v11 table has no group.
   */
  formulaHelper: string | null;
  /**
   * Story 21.1: the windings the TTR short-circuits per phase on a group that shorts any
   * ("Curto-circuitar H3-H2 na fase A, H1-H3 na B e H2-H1 na C"), on the sheet only; else null.
   */
  shortHelper: string | null;
  /**
   * Story 21.1: on a v11 table with no group, "Informe a LIGAÇÃO SECUNDÁRIA na placa para
   * calcular"; on a v9/v10 table whose LIGAÇÃO SECUNDÁRIA names no group, "Ligação não
   * reconhecida: calculado como Dyn1"; null otherwise. On the sheet only. e21g D2: on a v9/v10
   * table whose LIGAÇÃO SECUNDÁRIA is empty, "LIGAÇÃO SECUNDÁRIA vazia: calculado como Dyn1".
   */
  groupHelper: string | null;
  /** Story 21.1: the code of the vector group the table evaluates with ("Yyn0"), null on a table without one. */
  vectorGroup: string | null;
  /** Story 21.1: a v11 ratio table with no group: no VAL CALCULADO, and each row counts one missing in Ensaios. */
  groupMissing: boolean;
}

export interface TestEvaluation {
  testKey: TestKey;
  /** The test's heading ("Ensaio de isolação"). */
  title: string;
  /** Story 14.9: null when no criterion applies (a band test with no band for the plate): no verdict on any reading. */
  criterion: CriterionSeed | null;
  /** The criterion value alone, as the caption shows it (">400 MΩ"); `CRITERION_NOT_EVALUATED` with no criterion. */
  criterionText: string;
  /** The criterion's source ("aceitável na ficha"). */
  sourceName: string;
  tables: EvaluatedTable[];
}

// --- text helpers ------------------------------------------------------------------------

const VOWEL = /[aeiouáéíóúâêôãõà]/i;

/**
 * A seed label as the table shows it: "FASE A" -> "Fase A", "1 MINUTO" -> "1 minuto", "H1-H2 / X1-X2"
 * kept, and a `SCREEN_LABEL_ACRONYMS` word in its screen form ("KV" -> "kV") as `screenLabel` has it.
 */
export function readingLabelText(label: string): string {
  const words = label.split(' ').map((word) => {
    const acronym = screenAcronym(word);
    if (acronym !== null) return acronym;
    if (word.length <= 2 || /[\d']/.test(word) || !VOWEL.test(word)) return word;
    return word.toLocaleLowerCase('pt-BR');
  });
  const text = words.join(' ');
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
}

/** A title sentence-cased: "ENSAIO DE ISOLAÇÃO" -> "Ensaio de isolação"; `SCREEN_LABEL_ACRONYMS` words keep their screen form. */
export function sentenceCase(text: string): string {
  const lower = text
    .split(' ')
    .map((word) => screenAcronym(word) ?? word.toLocaleLowerCase('pt-BR'))
    .join(' ');
  return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
}

/**
 * The accessible name of a Measurement cell ("Fase A, 1 minuto"); a row with no label yet (the
 * transformer's TAP Nº before TAP atual is typed) names the cell by its column alone (QA G2).
 */
export function measurementCellName(rowLabel: string, column: string): string {
  return rowLabel.trim() === '' ? column : `${rowLabel}, ${column}`;
}

/** The Measurement table's column headers where FO.SERV-03's own label reads badly on screen (`60-ficha.html`). */
const HEADER_TEXT: Readonly<Record<string, string>> = {
  VALORES: 'Valor',
  'VAL CALCULADO': 'Calculado',
  CONDIÇÕES: 'Condição',
};

/** A value column's header as the Measurement table shows it ("VALORES" -> "Valor", "1 MINUTO" -> "1 minuto"). */
export function headerText(label: string): string {
  return HEADER_TEXT[label] ?? readingLabelText(label);
}

/**
 * UX pass 2026-10-22 (F42): the header a ratio input column shows on screen, its unit named
 * ("V primário (kV)"), so a primary typed in V into a kV column is caught before it computes.
 * The printed header keeps FO.SERV-03's wording.
 */
export function inputHeaderText(label: string, unit: string | null): string {
  const text = headerText(label);
  return unit === null ? text : `${text} (${unit})`;
}

/**
 * The Condição a ratio row shows on screen: the mock's "Satisfatório" (`60-ficha.html`, a
 * `td.cell-dim`), one word in sentence case, so the column keeps the width DC-1 fixed at 1280 px;
 * the printed sheet keeps FO.SERV-03's uppercase value (`EvaluatedRow.condicao`). "—" while unjudged.
 */
export function condicaoScreenText(condicao: EvaluatedRow['condicao']): string {
  if (condicao === null) return '—';
  return condicao === 'SATISFATÓRIO' ? 'Satisfatório' : 'Insatisfatório';
}

/**
 * Story 15.6: the formula helper of a ratio table by its seed `ratio_factor` alone: `sqrt3` reads
 * the Dyn1 formula ("Calculado: U1 · √3 / U2"); no factor (the plain U1/U2) and `vector_group`
 * (the formula is the group's, `EvaluatedTable.formulaHelper`) read null.
 */
export function ratioFormulaHelperText(factor: TableDef['ratio_factor']): string | null {
  return factor === 'sqrt3' ? 'Calculado: U1 · √3 / U2' : null;
}

/** Story 21.1: the vector group a ratio table evaluates with. */
export interface RatioGroupResolution {
  /** The group; null on a v11 table whose LIGAÇÃO SECUNDÁRIA names none (no VAL CALCULADO). */
  group: VectorGroup | null;
  /** True on a v9/v10 table whose LIGAÇÃO SECUNDÁRIA names no group: Dyn1 is assumed, as Story 15.6 fixed it. */
  assumed: boolean;
  /** e21g D2: the LIGAÇÃO SECUNDÁRIA value is null, missing or a string blank after trim (the `isCellFilled` rule). */
  blank: boolean;
}

/**
 * Story 21.1: the vector group of a ratio table with a seed `ratio_factor`, read from the block's
 * LIGAÇÃO SECUNDÁRIA (`parseVectorGroup`); null for a table without one (TP, TC, seeds v1 to v8),
 * which keeps the plain U1/U2. `vector_group` (v11): the parsed group, else none. `sqrt3` (v9, v10):
 * the parsed group, else Dyn1, assumed.
 */
export function ratioGroupOf(block: Pick<BlockRow, 'sheet'>, factor: TableDef['ratio_factor']): RatioGroupResolution | null {
  if (factor === undefined) return null;
  const value = block.sheet.nameplate[VECTOR_GROUP_FIELD]?.value;
  // e21a (P-4): the `isCellFilled` rule itself, so a cell holding `{ state: 'empty' }` is blank too.
  const blank = !isCellFilled(block.sheet.nameplate[VECTOR_GROUP_FIELD]);
  const parsed = parseVectorGroup(value);
  if (parsed !== null) return { group: parsed, assumed: false, blank };
  if (factor === 'vector_group') return { group: null, assumed: false, blank };
  return { group: vectorGroupByCode(DEFAULT_VECTOR_GROUP_CODE), assumed: true, blank };
}

// --- units ---------------------------------------------------------------------------------

/** The unit tap-cycle: MΩ -> GΩ -> TΩ -> MΩ; any other unit stays as it is. */
export function nextUnit(unit: string | null): string | null {
  const at = unit === null ? -1 : INSULATION_UNITS.indexOf(unit);
  if (at === -1) return unit;
  return INSULATION_UNITS[(at + 1) % INSULATION_UNITS.length]!;
}

export function unitsOf(column: ColumnDef): readonly string[] {
  if (column.unit !== null && INSULATION_UNITS.includes(column.unit)) return INSULATION_UNITS;
  return column.unit === null ? [] : [column.unit];
}

/** Powers of ten of the ratio test's input units, relative to V and A. */
export const RATIO_POWER: Readonly<Record<string, number>> = { V: 0, kV: 3, A: 0, kA: 3 };

/** `raw` times 10^exp, exact (a decimal-point move, never a float product). */
export function shiftDecimal(raw: string, exp: number): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (match === null) return raw;
  let digits = match[2]! + (match[3] ?? '');
  let point = match[2]!.length + exp;
  if (point <= 0) {
    digits = '0'.repeat(1 - point) + digits;
    point = 1;
  }
  if (point > digits.length) digits += '0'.repeat(point - digits.length);
  const fraction = digits.slice(point);
  return canonicalDecimal(`${match[1]}${digits.slice(0, point)}${fraction === '' ? '' : `.${fraction}`}`);
}

/** A ratio input value moved from `from` into `to` (kV <-> V, kA <-> A); null when either unit is unknown. */
export function convertRatioUnit(raw: string, from: string | null, to: string | null): string | null {
  if (from === to) return raw;
  if (from === null || to === null || !(from in RATIO_POWER) || !(to in RATIO_POWER)) return null;
  return shiftDecimal(raw, RATIO_POWER[from]! - RATIO_POWER[to]!);
}

// --- stored cells --------------------------------------------------------------------------

export const DECIMAL = /^-?\d+(\.\d+)?$/;

export interface StoredReading {
  state: ReadingState;
  raw: string;
  unit: string | null;
}

export function readStored(cell: Cell | undefined): StoredReading | null {
  const value = cell?.value;
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return { state: 'invalid', raw: String(value), unit: null };
  const v = value as { raw?: unknown; unit?: unknown; state?: unknown };
  const unit = typeof v.unit === 'string' ? v.unit : null;
  const raw = typeof v.raw === 'string' ? v.raw : '';
  if (v.state === 'empty') return null;
  if (v.state === 'not_measured') return { state: 'not_measured', raw: '', unit };
  if (v.state === 'measured' && DECIMAL.test(raw)) return { state: 'measured', raw, unit };
  // Story 22.10: a limit the instrument passed is a positive plain decimal (`over-range.ts` `isOverRangeRaw`).
  if (v.state === 'over_range' && DECIMAL.test(raw) && !raw.startsWith('-') && Number(raw) > 0) return { state: 'over_range', raw, unit };
  return { state: 'invalid', raw, unit };
}

export function storedCell(block: BlockRow, address: CellAddress): Cell | undefined {
  return block.sheet.test[address.testKey]?.cells[String(address.row)]?.[String(address.col)];
}

// --- the ratio test's inputs from the nameplate ------------------------------------------

function nameplateNumber(block: BlockRow, key: string): { raw: string; unit: string | null } | null {
  const value = block.sheet.nameplate[key]?.value;
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as { raw?: unknown; unit?: unknown; state?: unknown };
  if (v.state !== 'measured' || typeof v.raw !== 'string' || !DECIMAL.test(v.raw)) return null;
  return { raw: v.raw, unit: typeof v.unit === 'string' ? v.unit : null };
}

/** The leading number of a plate text: "380/220" -> "380", "380 V" -> "380", "13,8 kV" -> "13,8"; a sign ("-380/220") matches nothing. */
const LEADING_NUMBER = /^\s*(\d[\d.,]*)/;

/**
 * Story 15.6: the BT side of a plate whose measured raw is not one number ("380/220", "380 V",
 * typed or read so): its first number, the line voltage the ratio divides by. The strict
 * `nameplateNumber` answers first; a raw with no leading number answers null as before.
 */
function nameplateFirstNumber(block: BlockRow, key: string): { raw: string; unit: string | null } | null {
  const strict = nameplateNumber(block, key);
  if (strict !== null) return strict;
  const value = block.sheet.nameplate[key]?.value;
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as { raw?: unknown; unit?: unknown; state?: unknown };
  if (v.state !== 'measured' || typeof v.raw !== 'string') return null;
  const match = LEADING_NUMBER.exec(v.raw);
  const parsed = match === null ? null : parseDecimalPtBr(match[1]!.replace(/[.,]$/, ''));
  if (parsed === null) return null;
  return { raw: canonicalDecimal(parsed), unit: typeof v.unit === 'string' ? v.unit : null };
}

/**
 * UX pass 2026-10-22 (F42): the plate's TAP ATUAL ("5", "12"), the transformer ratio row's
 * `TAP Nº` when the seed leaves that connection blank. Only a tap number counts, an integer of
 * up to three digits: a voltage typed there ("13200", the Porto Seguro plates) or any other
 * text answers null, so TAP Nº prints "-".
 */
export function nameplateTap(block: BlockRow): string | null {
  const value = block.sheet.nameplate.tap_atual?.value;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return /^\d{1,3}$/.test(text) ? text : null;
}

/**
 * Story 5.6 AC 3 (open question 1: an untyped input reads the nameplate): the TP's and the
 * transformer's TENSÃO NOMINAL AT (kV) and BT (V), the TC's RELAÇÃO ("200/5"), for the
 * ratio table's first (primário) and second (secundário) input column.
 */
export function nameplateRatioInput(block: BlockRow, definition: BlockDefinition, index: number, columnUnit: string | null): string | null {
  if (definition.nameplate.some((field) => field.key === 'relacao')) {
    const text = block.sheet.nameplate.relacao?.value;
    if (typeof text !== 'string') return null;
    const parts = text.split(/[/:]/);
    if (parts.length !== 2) return null;
    const raw = parseDecimalPtBr(parts[index]!);
    return raw === null ? null : canonicalDecimal(raw);
  }
  const key = index === 0 ? 'tensao_nominal_at' : 'tensao_nominal_bt';
  const field = definition.nameplate.find((f) => f.key === key);
  const value = index === 0 ? nameplateNumber(block, key) : nameplateFirstNumber(block, key);
  if (field === undefined || value === null) return null;
  return convertRatioUnit(value.raw, value.unit ?? field.unit ?? null, columnUnit);
}
