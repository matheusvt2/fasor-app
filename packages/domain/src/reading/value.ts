import { structuringValueSchemaFor, type OcrToken } from '../contract/ocr.ts';
import { formatCalendarDate, normalizeDateValue } from '../format/datetime.ts';
import { parseDecimalPtBr } from '../parse/pt-br-number.ts';
import { parseVoltageClassKv } from '../registry/word-row.ts';
import type { JsonValue } from '../schemas/entities.ts';
import type { FieldDef } from '../seed/schema.ts';
import { normalizeRegistryName } from '../text/normalize-name.ts';
import { digitsOf, inTokenOrder } from './digits.ts';
import { convertReadingUnit, parseSiUnit } from './units.ts';

/*
 * Story 8.4: a structured value as the reading job emits it. The model's value is first
 * checked against its kind's shape (`structuringValueSchemaFor`), then normalized to what
 * the sheet stores (AD-11, the same shapes `parseFieldInput` writes for a typed value). A
 * value that does not normalize is dropped by the caller and logged, never emitted.
 *
 * AIR-1 and AIR-V1 (review 2026-10-08): a number printed in another unit of the field's
 * quantity ("13.800 V" on a kV field) is moved into the field's unit (`convertReadingUnit`),
 * the unit read from the cited tokens when the model gives none; the digit rule keeps reading
 * the value as printed (`printedText`). A plate date is kept exactly as precise as printed: a
 * bare year ("2012") is stored as is, the shape the typed path stores (Story 13.4).
 */

type ReadingField = Pick<FieldDef, 'kind' | 'unit' | 'options'>;

const NUMBER_RAW = /^-?\d+(\.\d+)?$/;
const ISO_DATE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;
const BARE_YEAR = /^\d{4}$/;
/** A printed number: digits with pt-BR or dot separators inside ("13.800", "1,5", "500"). */
const NUMBER_RUN = /\d(?:[\d.,]*\d)?/g;
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
 * `17,5`), anything else as the string it is.
 */
export function readingValueText(field: Pick<FieldDef, 'kind'>, value: unknown): string {
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
 * - the unit is the model's, else the one the tokens print; a model unit the tokens contradict asks for a check;
 * - a unit of the field's quantity is converted into the field's unit; another unit asks for a check.
 */
function normalizeNumber(field: ReadingField, model: { raw: string; unit: string | null }, cited: readonly CitedToken[]): NormalizedReadingValue {
  const fieldUnit = field.unit ?? null;
  const modelUnit = model.unit === null || model.unit.trim() === '' ? null : model.unit.trim();
  const printed = printedOf(cited);
  let verify = false;
  let raw = model.raw;
  if (printed.run !== null && printed.number !== null && digitsOf(printed.run) === digitsOf(model.raw) && Number(printed.number) !== Number(model.raw)) {
    raw = printed.number;
    verify = true;
  }
  if (modelUnit !== null && printed.unit !== null && !sameUnit(modelUnit, printed.unit)) verify = true;
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
 * The stored shape of a model value, by kind, `cited` being the OCR tokens it cites:
 * - `number`: `raw` must be a plain decimal (`-?\d+(\.\d+)?`); the unit becomes the field's
 *   (`field.unit ?? null`) and the value is moved into it from the model's unit, or from the
 *   unit the tokens print (`normalizeNumber`); a unit of another quantity asks for a check;
 *   the state becomes `measured`;
 * - `date`: a bare year (`2012`, as printed) or a valid ISO month or day;
 * - `select`: one of the options, matched ignoring case and accents, stored as the option;
 * - `voltage_class`: a kV number (`parseVoltageClassKv`, or a volt value moved into kV), stored as its kV text;
 * - `text` and `manufacturer`: whitespace collapsed, not empty.
 */
export function normalizeReadingValue(field: ReadingField, value: unknown, cited: readonly CitedToken[] = []): NormalizedReadingValue {
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
      if (typeof parsed !== 'string') return invalid;
      const wanted = normalizeRegistryName(parsed);
      const option = (field.options ?? []).find((candidate) => normalizeRegistryName(candidate) === wanted);
      return option === undefined ? invalid : { ok: true, value: option, verify: false };
    }
    case 'voltage_class': {
      if (typeof parsed !== 'string') return invalid;
      const kv = voltageClassKv(parsed);
      if (kv === null) return invalid;
      // A voltage moved into kV keeps its printed text for the digit rule.
      return parseVoltageClassKv(parsed) === null ? { ok: true, value: kv, verify: false, printedText: parsed } : { ok: true, value: kv, verify: false };
    }
    case 'text':
    case 'manufacturer': {
      if (typeof parsed !== 'string') return invalid;
      const text = collapse(parsed);
      return text === '' ? invalid : { ok: true, value: text, verify: false };
    }
  }
}
