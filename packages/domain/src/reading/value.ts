import { structuringValueSchemaFor, type OcrToken } from '../contract/ocr.ts';
import { formatCalendarDate, normalizeDateValue } from '../format/datetime.ts';
import { canonicalDecimal, isNotApplicableNumber, parseDecimalPtBr, parseNumberListPtBr, parseOverSqrt3PtBr } from '../parse/pt-br-number.ts';
import { parseVoltageClassKv } from '../registry/word-row.ts';
import type { JsonValue } from '../schemas/entities.ts';
import type { FieldDef } from '../seed/schema.ts';
import { selectOptionFor } from '../seed/select-option.ts';
import { digitsOf, inTokenOrder } from './digits.ts';
import { convertReadingUnit, parseSiUnit } from './units.ts';

/*
 * Story 8.4: a structured value as the reading job emits it. The model's value is first
 * checked against its kind's shape (`structuringValueSchemaFor`; a bare-year date is the one
 * exception, accepted before that check, see below), then normalized to what
 * the sheet stores (AD-11, the same shapes `parseFieldInput` writes for a typed value). A
 * value that does not normalize is dropped by the caller and logged, never emitted.
 *
 * AIR-1 and AIR-V1 (review 2026-10-08): a number printed in another unit of the field's
 * quantity ("13.800 V" on a kV field) is moved into the field's unit (`convertReadingUnit`),
 * the unit read from the cited tokens when the model gives none; the digit rule keeps reading
 * the value as printed (`printedText`). A plate date is kept exactly as precise as printed: a
 * bare year ("2012") is stored as is, the shape the typed path stores (Story 13.4). The OCR
 * contract's date shape (`structuringValueSchemaFor('date')`, `YYYY-MM[-DD]`) does not hold
 * the bare year yet; it gains `YYYY` at the next contract change (`deferred-work.md`).
 */

type ReadingField = Pick<FieldDef, 'kind' | 'unit' | 'options' | 'option_aliases'> & Partial<Pick<FieldDef, 'list' | 'over_sqrt3'>>;

const NUMBER_RAW = /^-?\d+(\.\d+)?$/;
const ISO_DATE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;
const BARE_YEAR = /^\d{4}$/;
/** A printed number: digits with pt-BR or dot separators inside ("13.800", "1,5", "500"). */
const NUMBER_RUN = /\d(?:[\d.,]*\d)?/g;
/** A number alone, with pt-BR or dot separators inside ("13800", "13.800", "17,5"). */
const BARE_NUMBER = /^\d(?:[\d.,]*\d)?$/;
/** A voltage printed with a unit other than kV: the number, then the unit ("13.800 V", "13800V"). */
const NUMBER_WITH_UNIT = /^(\d(?:[\d.,]*\d)?)\s*([^\d\s].*)$/;

function collapse(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A valid ISO month (`2024-08`) or day (`2024-08-31`). */
function isValidIsoDate(text: string): boolean {
  const match = ISO_DATE.exec(text);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return false;
  if (match[3] === undefined) return true;
  const day = Number(match[3]);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= days;
}

/**
 * The text the digit rule reads from a value: a number's `raw`, a date's pt-BR display
 * (`2024-08` -> `08/2024`, the order a plate prints it), a voltage class's kV text (`15`,
 * `17,5`), anything else as the string it is; '' for an "N/A" (Story 16.4: no digits to read).
 */
export function readingValueText(field: Pick<FieldDef, 'kind'>, value: unknown): string {
  if (isNotApplicableNumber(value)) return '';
  if (field.kind === 'number' && isRecord(value) && typeof value.raw === 'string') return value.raw;
  if (typeof value !== 'string') return value === null || value === undefined ? '' : JSON.stringify(value);
  if (field.kind === 'date') return formatCalendarDate(value) || value;
  if (field.kind === 'voltage_class') return parseVoltageClassKv(value) ?? value;
  return value;
}

export type NormalizedReadingValue =
  | {
      ok: true;
      value: JsonValue;
      /** True when normalization alone already asks for a check (a number whose unit is not the field's). */
      verify: boolean;
      /**
       * The text the digit rule reads when it is not the stored value's (`readingValueText`): the
       * model's raw before a unit conversion, a voltage as given before it became kV. Absent when
       * the stored value prints as read.
       */
      printedText?: string;
    }
  | { ok: false; reason: 'invalid_shape' };

const invalid: NormalizedReadingValue = { ok: false, reason: 'invalid_shape' };

type CitedToken = Pick<OcrToken, 'id' | 'text'>;

interface Printed {
  /** The run of the one number the cited tokens print, as printed ("13.800"); null for none or several. */
  run: string | null;
  /** That run read the pt-BR way (`parseDecimalPtBr`: "13.800" -> "13800", "1,5" -> "1.5"). */
  number: string | null;
  /** The one unit the cited tokens print besides the number ("V", "kVA"); null for none, several or unknown. */
  unit: string | null;
}

/** What the cited tokens print: their one number and their one unit, read in token order. */
function printedOf(cited: readonly CitedToken[]): Printed {
  const text = inTokenOrder(cited)
    .map((token) => token.text)
    .join(' ');
  const runs = text.match(NUMBER_RUN) ?? [];
  const run = runs.length === 1 ? runs[0]! : null;
  const units = new Map<string, string>();
  for (const word of text.replace(NUMBER_RUN, ' ').split(/\s+/)) {
    const unit = parseSiUnit(word);
    if (unit !== null) units.set(`${unit.power}:${unit.base}`, word.trim().replace(/\.$/, ''));
  }
  return { run, number: run === null ? null : parseDecimalPtBr(run), unit: units.size === 1 ? [...units.values()][0]! : null };
}

function sameUnit(a: string, b: string): boolean {
  const left = parseSiUnit(a);
  const right = parseSiUnit(b);
  if (left === null || right === null) return a.trim().toLowerCase() === b.trim().toLowerCase();
  return left.power === right.power && left.base === right.base;
}

/**
 * A number field's model value against what its cited tokens print:
 * - a raw whose digits are the printed number's but whose value differs (the model kept a
 *   pt-BR thousands dot, "13.800" read as 13.8) takes the printed pt-BR number, and asks for a check;
 * - the unit is the model's, else the one the tokens print; a model unit the tokens contradict asks for a check,
 *   and so does a model unit the tokens do not print whose power is not the field's (a factor nothing printed grounds);
 * - a unit of the field's quantity is converted into the field's unit; another unit asks for a check.
 */
function normalizeNumber(field: ReadingField, model: { raw: string; unit: string | null }, cited: readonly CitedToken[]): NormalizedReadingValue {
  const fieldUnit = field.unit ?? null;
  const modelUnit = model.unit === null || model.unit.trim() === '' ? null : model.unit.trim();
  const printed = printedOf(cited);
  let verify = false;
  let raw = model.raw;
  // The printed run carries no sign: compare magnitudes and keep the model's sign.
  const sign = model.raw.startsWith('-') ? '-' : '';
  if (printed.run !== null && printed.number !== null && digitsOf(printed.run) === digitsOf(model.raw) && Number(printed.number) !== Math.abs(Number(model.raw))) {
    raw = `${sign}${printed.number}`;
    verify = true;
  }
  // Model and print disagree on the unit: neither is grounded, so the model pair is kept and checked.
  if (modelUnit !== null && printed.unit !== null && !sameUnit(modelUnit, printed.unit)) verify = true;
  // A model unit the cited tokens do not print, of another power than the field's: the factor of
  // its conversion rests on the model alone (Story 8.5: trust is never the model's), so it is checked.
  if (modelUnit !== null && printed.unit === null && fieldUnit !== null && !sameUnit(modelUnit, fieldUnit)) verify = true;
  const unit = modelUnit ?? printed.unit;
  let stored = raw;
  if (unit !== null) {
    const converted = fieldUnit === null ? null : convertReadingUnit(raw, unit, fieldUnit);
    if (converted !== null) stored = converted;
    else if (fieldUnit === null || unit.toLowerCase() !== fieldUnit.toLowerCase()) verify = true;
  }
  return {
    ok: true,
    value: { raw: stored, unit: fieldUnit, state: 'measured' },
    verify,
    ...(stored === model.raw ? {} : { printedText: model.raw }),
  };
}

// --- seed v13 (Story 23.7): a list of taps and a value over √3, as printed ---------------------------

/** The text a model value prints: the string itself, or a number object's raw (a list or "N/√3" given there); null for anything else. */
function printedTextOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  return isRecord(value) && typeof value.raw === 'string' ? value.raw : null;
}

/** A volt unit printed at the end of a value ("... 11,4 kV", "13800V"), split from it. */
const TRAILING_VOLT_UNIT = /^(.*?)\s*(kV|V)\s*$/iu;

function splitVoltUnit(text: string): { body: string; unit: string | null } {
  const match = TRAILING_VOLT_UNIT.exec(text.trim());
  if (match === null) return { body: text.trim(), unit: null };
  return { body: match[1]!, unit: match[2]!.toLowerCase() === 'kv' ? 'kV' : 'V' };
}

/** The separators a plate prints between its taps ("13800/13200", "13,8 - 13,2", "13.8 | 13.2"), read as the list's ";". */
const PLATE_LIST_SEPARATORS = /[/|–—-]/gu;

/**
 * A `list` field's model value (the transformer's TAPS), given as printed: the entries in plate
 * order, separated as the plate separates them, with or without a trailing V or kV. Stored as
 * `parseNumberListPtBr` stores a typed list, in the field's unit; a list printed in another volt
 * unit is moved into it (the digit rule reads it as printed), and one printed with no unit is
 * read in the field's and asks for a check (which unit the plate means is the ambiguous part). A
 * value that is no list of two or more distinct values, whole in V, is dropped.
 */
function normalizeListValue(field: ReadingField, value: unknown): NormalizedReadingValue {
  const text = printedTextOf(value);
  if (text === null) return invalid;
  const fieldUnit = field.unit ?? null;
  const { body, unit } = splitVoltUnit(text);
  const printedUnit = unit ?? fieldUnit;
  const list = parseNumberListPtBr(body.replace(PLATE_LIST_SEPARATORS, ';'), { unit: printedUnit });
  if (list === null) return invalid;
  let raw = list;
  if (printedUnit !== null && fieldUnit !== null && printedUnit !== fieldUnit) {
    const moved: string[] = [];
    for (const entry of list.split(';')) {
      const converted = convertReadingUnit(entry, printedUnit, fieldUnit);
      if (converted === null) return invalid;
      moved.push(canonicalDecimal(converted));
    }
    const again = parseNumberListPtBr(moved.join(';'), { unit: fieldUnit });
    if (again === null) return invalid;
    raw = again;
  }
  return { ok: true, value: { raw, unit: fieldUnit, state: 'measured' }, verify: unit === null, ...(raw === list ? {} : { printedText: text }) };
}

/** Whether the cited tokens print a √3 ("√3", "V3", "raiz3"), so a value read over √3 is grounded on the plate. */
function printsSqrt3(cited: readonly CitedToken[]): boolean {
  return /(?:√|\bv|raiz)\s*3/iu.test(cited.map((token) => token.text).join(' '));
}

/**
 * An `over_sqrt3` field's model value (the TP's "115/√3"), given as printed: stored as typed
 * (`parseOverSqrt3PtBr`, "115/√3"), its numerator moved into the field's unit when the plate prints
 * another volt unit. A value over √3 its cited tokens do not print asks for a check. Null when the
 * value is no "N/√3", which reads as any number of the field.
 */
function normalizeOverSqrt3Value(field: ReadingField, value: unknown, cited: readonly CitedToken[]): NormalizedReadingValue | null {
  const text = printedTextOf(value);
  if (text === null) return null;
  const { body, unit } = splitVoltUnit(text);
  const typed = parseOverSqrt3PtBr(body);
  if (typed === null) return null;
  const fieldUnit = field.unit ?? null;
  let raw = typed;
  if (unit !== null && fieldUnit !== null && unit !== fieldUnit) {
    const numerator = convertReadingUnit(typed.slice(0, -'/√3'.length), unit, fieldUnit);
    if (numerator === null) return invalid;
    raw = `${canonicalDecimal(numerator)}/√3`;
  }
  return { ok: true, value: { raw, unit: fieldUnit, state: 'measured' }, verify: !printsSqrt3(cited), ...(raw === typed ? {} : { printedText: text }) };
}

/** A voltage class as kV text: the kV forms `parseVoltageClassKv` reads, or a number in another volt unit moved into kV. */
function voltageClassKv(text: string): string | null {
  const kv = parseVoltageClassKv(text);
  if (kv !== null) return kv;
  const match = NUMBER_WITH_UNIT.exec(text.trim());
  if (match === null) return null;
  const number = parseDecimalPtBr(match[1]!);
  const unit = parseSiUnit(match[2]!);
  if (number === null || unit === null || unit.base !== 'V') return null;
  const converted = convertReadingUnit(number, match[2]!, 'kV');
  return converted === null ? null : parseVoltageClassKv(converted);
}

/**
 * A voltage class the model gives as a bare number, read in the volt unit its cited tokens print
 * when that unit is not kV and the number is the one printed ("13800" beside "13.800" "V" is
 * "13800 V"), the way `normalizeNumber` takes a unit the model dropped (AIR-1); otherwise the
 * model's text as given.
 */
function withPrintedVoltUnit(text: string, cited: readonly CitedToken[]): string {
  const bare = text.trim();
  if (!BARE_NUMBER.test(bare)) return text;
  const printed = printedOf(cited);
  if (printed.unit === null || printed.run === null || digitsOf(printed.run) !== digitsOf(bare)) return text;
  if (parseSiUnit(printed.unit)?.base !== 'V' || sameUnit(printed.unit, 'kV')) return text;
  return `${bare} ${printed.unit}`;
}

/**
 * The stored shape of a model value, by kind, `cited` being the OCR tokens it cites:
 * - `number`: `raw` must be a plain decimal (`-?\d+(\.\d+)?`); the unit becomes the field's
 *   (`field.unit ?? null`) and the value is moved into it from the model's unit, or from the
 *   unit the tokens print (`normalizeNumber`); a unit of another quantity asks for a check;
 *   the state becomes `measured`;
 * - `date`: a bare year (`2012`, as printed) or a valid ISO month or day;
 * - `select`: one of the options, matched ignoring case and accents, stored as the option (or
 *   an alias of one, seed v7, `selectOptionFor`);
 * - `voltage_class`: a kV number (`parseVoltageClassKv`, or a volt value moved into kV, the volt unit
 *   read from the cited tokens when the model gives a bare number), stored as its kV text;
 * - `text` and `manufacturer`: whitespace collapsed, not empty.
 */
export function normalizeReadingValue(field: ReadingField, value: unknown, cited: readonly CitedToken[] = []): NormalizedReadingValue {
  // Seed v13 (Story 23.7): a list (TAPS) is read only as a list; a value over √3 as printed, else as any number.
  if (field.kind === 'number' && field.list === true) return normalizeListValue(field, value);
  if (field.kind === 'number' && field.over_sqrt3 === true) {
    const over = normalizeOverSqrt3Value(field, value, cited);
    if (over !== null) return over;
  }
  // AIR-V1: a plate that prints only the year is suggested as printed; no month is invented.
  if (field.kind === 'date' && typeof value === 'string' && BARE_YEAR.test(value.trim())) return { ok: true, value: value.trim(), verify: false };
  // E78-Q3: a model date in `mm/aaaa` or `dd/mm/aaaa` is read in the canonical shape first.
  const shaped = structuringValueSchemaFor(field.kind).safeParse(field.kind === 'date' ? normalizeDateValue(value) : value);
  if (!shaped.success) return invalid;
  const parsed = shaped.data as unknown;
  switch (field.kind) {
    case 'number': {
      if (!isRecord(parsed) || typeof parsed.raw !== 'string' || !NUMBER_RAW.test(parsed.raw)) return invalid;
      return normalizeNumber(field, { raw: parsed.raw, unit: typeof parsed.unit === 'string' ? parsed.unit : null }, cited);
    }
    case 'date':
      return typeof parsed === 'string' && isValidIsoDate(parsed) ? { ok: true, value: parsed, verify: false } : invalid;
    case 'select': {
      // Story 14.14: an older spelling the plate prints ("SF6", "ÓLEO (PVO)") is suggested as the option it now reads as.
      const option = selectOptionFor(field, parsed);
      return option === null ? invalid : { ok: true, value: option, verify: false };
    }
    case 'voltage_class': {
      if (typeof parsed !== 'string') return invalid;
      const given = withPrintedVoltUnit(parsed, cited);
      const kv = voltageClassKv(given);
      if (kv === null) return invalid;
      // A voltage moved into kV keeps its printed text for the digit rule.
      return parseVoltageClassKv(given) === null ? { ok: true, value: kv, verify: false, printedText: parsed } : { ok: true, value: kv, verify: false };
    }
    case 'text':
    case 'manufacturer': {
      if (typeof parsed !== 'string') return invalid;
      const text = collapse(parsed);
      return text === '' ? invalid : { ok: true, value: text, verify: false };
    }
  }
}
