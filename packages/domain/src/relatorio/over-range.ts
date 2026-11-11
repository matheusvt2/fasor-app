import { canonicalDecimal, formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import { OHM_UNITS, scaleToUnit } from '../seed/criteria.ts';
import { shiftDecimal } from './reading-cells.ts';

/*
 * Story 22.10 (contract 32): a reading above the instrument's limit. A megger or a
 * micro-ohmmeter that shows OL has measured something above its top of range; the cell stores
 * that limit with the state `over_range` (`{raw: limit, unit, state: 'over_range'}`, AR-10's
 * number shape). This module is the one rule both evaluations (`reading-evaluation.ts`,
 * `measurement-evaluation.ts`) and every reader share: the text a cell shows and prints, the
 * verdict against a criterion, the refusals and the conversion of the instrument's limit into a
 * cell's units (AD-1/AD-13).
 *
 * The verdict, the conservative reading of Design Notes (open for Bruno): the true value is above
 * the limit, so a `>` or `>=` criterion is within only when the limit itself reaches it (a limit
 * below it cannot prove the criterion and is out), a `<` or `<=` criterion is out, and a `±` or a
 * relative criterion never takes the state (the cell refuses it at input).
 */

/** What every over-range text starts with: the cell shows "> 2", the document "> 2 TΩ". */
export const OVER_RANGE_TEXT_PREFIX = '> ';

/** The limit as the cell shows it, with no unit (its unit slot carries it): "> 2", "> 2.000". */
export function overRangeDisplay(raw: string): string {
  return `${OVER_RANGE_TEXT_PREFIX}${formatDecimalGroupedPtBr(raw)}`;
}

/** The limit with its unit, as a sentence, the conflict view and the document print it: "> 2 TΩ". */
export function overRangeText(raw: string, unit: string | null): string {
  const shown = overRangeDisplay(raw);
  return unit === null || unit === '' ? shown : `${shown} ${unit}`;
}

/** The echo line under a field while a limit is typed ("OL", "> 2T"): "= > 2 TΩ" (`numberEchoText`'s shape). */
export function overRangeEchoText(raw: string, unit: string | null): string {
  return `= ${overRangeText(raw, unit)}`;
}

/** A reading's state that holds a value: a number measured, or a limit the instrument passed. */
export function isReadingValue(state: string): state is 'measured' | 'over_range' {
  return state === 'measured' || state === 'over_range';
}

/** A positive dot-decimal raw, the only `raw` an over-range value holds. */
export const POSITIVE_DECIMAL = /^\d+(\.\d+)?$/;

/** True for a raw an over-range value may hold: a plain decimal above zero. */
export function isOverRangeRaw(raw: unknown): raw is string {
  return typeof raw === 'string' && POSITIVE_DECIMAL.test(raw) && Number(raw) > 0;
}

/** The criterion an over-range limit is judged by: its operator, value and unit (and a range's upper end). */
export interface OverRangeCriterion {
  operator: string;
  value: number;
  /** Fix batch e24x (C1): the upper end of a company criterion's `between` (a "nominal ± %" row reads as one). */
  value_max?: number | undefined;
  unit: string | null;
}

/**
 * The verdict of a limit the instrument passed against a criterion: `>`/`>=` within iff the limit
 * (in the criterion's unit) reaches the criterion's value, `<`/`<=` out; null when the units do not
 * compare or the operator is any other (a `±` never reaches here: its cells refuse the state).
 * Fix batch e24x (C1): a `between` (both ends within) is out when the limit is at or above its
 * upper end (the true value is above the limit, so above the range), and null otherwise: a limit
 * inside the range cannot tell, and the readers treat that reading as one to check.
 */
export function overRangeVerdict(limit: number, unit: string | null, criterion: OverRangeCriterion): 'within' | 'out' | null {
  if (criterion.operator === '<' || criterion.operator === '<=') return scaleToUnit(limit, unit, criterion.unit) === null ? null : 'out';
  if (criterion.operator === 'between') {
    if (criterion.value_max === undefined) return null;
    const scaled = scaleToUnit(limit, unit, criterion.unit);
    if (scaled === null) return null;
    // The same float allowance as below: a limit equal to the upper end is at it.
    return scaled >= criterion.value_max - Math.abs(criterion.value_max) * 1e-12 ? 'out' : null;
  }
  if (criterion.operator !== '>' && criterion.operator !== '>=') return null;
  const scaled = scaleToUnit(limit, unit, criterion.unit);
  if (scaled === null) return null;
  // Float noise of the Ω scale (0,4 GΩ in MΩ) never turns an equal limit out.
  return scaled >= criterion.value * (1 - 1e-12) ? 'within' : 'out';
}

// authored (Story 22.10, open for Bruno): the refusal of a ratio cell, capture or input.
/** Why a relação de transformação cell refuses a reading above the limit. */
export const OVER_RANGE_RATIO_REFUSAL = 'O ensaio de relação de transformação não aceita valor acima do limite: informe o valor medido.';

// authored (Story 22.10, open for Bruno): the refusal of a cell compared with the others of its table.
/** Why a cell a `relative_to_lowest` or `equals_column` criterion judges refuses a reading above the limit. */
export const OVER_RANGE_COMPARED_REFUSAL = 'Este valor é comparado com outros: informe o valor medido.';

/**
 * authored (Story 22.10, open for Bruno): "OL" typed with no instrument limit to fill in (no
 * instrument picked or its limit unset); the example in the cell's default unit.
 */
export function overRangeNoRangeText(unit: string | null): string {
  return `Instrumento sem limite cadastrado: digite > e o limite (ex.: > 2${unit === null || unit === '' ? '' : ` ${unit}`})`;
}

/**
 * authored (e22g, review S1, listed for Bruno): "OL" typed where the instrument's limit is set but
 * its unit cannot be read as one of the cell's (blank, "ohm?", or a TΩ limit on a µΩ cell): the
 * stored unit shown, the example in the cell's default unit.
 */
export function overRangeUnreadableUnitText(stored: string | null, unit: string | null): string {
  const shown = stored === null || stored.trim() === '' ? 'sem unidade' : `"${stored.trim()}"`;
  return `Limite do instrumento com unidade não reconhecida (${shown}): corrija em Cadastros ou digite > e o limite (ex.: > 2${unit === null || unit === '' ? '' : ` ${unit}`})`;
}

/**
 * e22g (review S1): why "OL" has no limit to take on a cell: the instrument has none
 * (`overRangeNoRangeText`), or has one whose unit cannot become one of the cell's units
 * (`overRangeUnreadableUnitText`); the example in `defaultUnit`, else the cell's first unit.
 */
export function overRangeMissingLimitText(range: InstrumentRange | null, units: readonly string[], defaultUnit: string | null): string {
  const example = defaultUnit ?? units[0] ?? null;
  return range === null || !isOverRangeRaw(range.raw) ? overRangeNoRangeText(example) : overRangeUnreadableUnitText(range.unit, example);
}

/** Spelled-out prefixes a typed limit unit may use, by the Ω table's prefix ("micro" -> "µ"). */
const PREFIX_WORDS: Readonly<Record<string, string>> = { micro: 'µ', mili: 'm', milli: 'm', kilo: 'k', quilo: 'k', mega: 'M', meg: 'M', giga: 'G', tera: 'T', kil: 'k' };
/** One-letter prefixes by the Ω table's prefix: the micro sign, the Greek mu and "u"; m and M kept apart by case. */
const PREFIX_LETTERS: Readonly<Record<string, string>> = { 'µ': 'µ', 'μ': 'µ', u: 'µ', U: 'µ', m: 'm', k: 'k', K: 'k', M: 'M', g: 'G', G: 'G', t: 'T', T: 'T' };

/**
 * e22g (review S1): an instrument limit's unit as typed in Cadastros, read as a key of the Ω
 * table (`OHM_UNITS`): "µΩ" (U+00B5), "μΩ" (U+03BC), "uΩ", "micro ohm" and "uohm" are µΩ; "T",
 * "TOhm", "tΩ" and "tera ohms" are TΩ; a bare prefix is the prefix's Ω unit ("G" is GΩ); m is
 * milli and M mega, by case. Null for a blank and for a text it cannot read ("ohm?", "V"); never
 * throws. Ω has no keyboard key, so a typed "ohm" and the ohm sign (U+2126) both read as Ω.
 */
export function normalizeOhmUnit(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null;
  const compact = text.trim().replace(/\s+/g, '');
  if (compact === '') return null;
  if (OHM_UNITS.includes(compact)) return compact;
  const ohm = /(\u03A9|\u2126|ohms?)$/iu.exec(compact);
  const prefix = ohm === null ? compact : compact.slice(0, ohm.index);
  if (prefix === '') return ohm === null ? null : 'Ω';
  const read = PREFIX_WORDS[prefix.toLocaleLowerCase('pt-BR')] ?? PREFIX_LETTERS[prefix] ?? null;
  if (read === null) return null;
  const unit = `${read}Ω`;
  return OHM_UNITS.includes(unit) ? unit : null;
}

/**
 * authored (e22g, review S1, listed for Bruno): Cadastros' helper under an instrument's limit
 * whose stored pair the cells cannot read; null when it reads (or nothing is stored).
 */
export function instrumentRangeHelperText(stored: { raw?: string | null; unit?: string | null } | null | undefined): string | null {
  const raw = stored?.raw?.trim() ?? '';
  const unit = stored?.unit?.trim() ?? '';
  if (raw === '' && unit === '') return null;
  if (raw !== '' && normalizeOhmUnit(unit) === null) return 'Unidade não reconhecida: use µΩ, mΩ, Ω, kΩ, MΩ, GΩ ou TΩ (ex.: 2 e TΩ).';
  return null;
}

/** Whether a cell takes a reading above the limit, and why not when it does not. */
export type OverRangeAllowance = { allowed: true } | { allowed: false; refusal: string };

export const OVER_RANGE_ALLOWED: OverRangeAllowance = Object.freeze({ allowed: true });

/** An instrument's limit for one test type, by value: a positive dot-decimal raw and its unit. */
export interface InstrumentRange {
  raw: string;
  unit: string | null;
}

/**
 * The instrument's limit in a cell's units: as it stands when its unit is one of them, else moved
 * into the cell's default unit (or its first) through the Ω scale (2 mΩ on a µΩ cell is 2.000 µΩ,
 * an exact decimal-point move); null when there is no limit or its unit cannot become one of the
 * cell's (a TΩ limit on a µΩ cell).
 */
export function rangeInUnits(range: InstrumentRange | null, units: readonly string[], defaultUnit: string | null): InstrumentRange | null {
  if (range === null || !isOverRangeRaw(range.raw)) return null;
  // A cell with no unit takes only a limit with none.
  if (units.length === 0) return range.unit === null ? range : null;
  if (range.unit !== null && units.includes(range.unit)) return range;
  const target = defaultUnit !== null && units.includes(defaultUnit) ? defaultUnit : units[0]!;
  const factor = scaleToUnit(1, range.unit, target);
  if (factor === null || !(factor > 0)) return null;
  const exp = Math.round(Math.log10(factor));
  if (Math.abs(10 ** exp - factor) > 1e-9 * factor) return null;
  const raw = canonicalDecimal(shiftDecimal(range.raw, exp));
  return isOverRangeRaw(raw) ? { raw, unit: target } : null;
}
