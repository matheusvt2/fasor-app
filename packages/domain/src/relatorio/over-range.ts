import { canonicalDecimal, formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import { scaleToUnit } from '../seed/criteria.ts';
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

/** The criterion an over-range limit is judged by: its operator, value and unit. */
export interface OverRangeCriterion {
  operator: string;
  value: number;
  unit: string | null;
}

/**
 * The verdict of a limit the instrument passed against a criterion: `>`/`>=` within iff the limit
 * (in the criterion's unit) reaches the criterion's value, `<`/`<=` out; null when the units do not
 * compare or the operator is any other (a `±` never reaches here: its cells refuse the state).
 */
export function overRangeVerdict(limit: number, unit: string | null, criterion: OverRangeCriterion): 'within' | 'out' | null {
  if (criterion.operator === '<' || criterion.operator === '<=') return scaleToUnit(limit, unit, criterion.unit) === null ? null : 'out';
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
 * instrument picked, its limit unset, or in a unit the cell cannot take); the example in the
 * cell's default unit.
 */
export function overRangeNoRangeText(unit: string | null): string {
  return `Instrumento sem limite cadastrado: digite > e o limite (ex.: > 2${unit === null || unit === '' ? '' : ` ${unit}`})`;
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
