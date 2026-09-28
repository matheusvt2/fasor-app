import { structuringValueSchemaFor } from '../contract/ocr.ts';
import { formatCalendarDate, normalizeDateValue } from '../format/datetime.ts';
import { parseVoltageClassKv } from '../registry/word-row.ts';
import type { JsonValue } from '../schemas/entities.ts';
import type { FieldDef } from '../seed/schema.ts';
import { normalizeRegistryName } from '../text/normalize-name.ts';

/*
 * Story 8.4: a structured value as the reading job emits it. The model's value is first
 * checked against its kind's shape (`structuringValueSchemaFor`), then normalized to what
 * the sheet stores (AD-11, the same shapes `parseFieldInput` writes for a typed value). A
 * value that does not normalize is dropped by the caller and logged, never emitted.
 */

type ReadingField = Pick<FieldDef, 'kind' | 'unit' | 'options'>;

const NUMBER_RAW = /^-?\d+(\.\d+)?$/;
const ISO_DATE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

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
    }
  | { ok: false; reason: 'invalid_shape' };

const invalid: NormalizedReadingValue = { ok: false, reason: 'invalid_shape' };

/**
 * The stored shape of a model value, by kind:
 * - `number`: `raw` must be a plain decimal (`-?\d+(\.\d+)?`) and is kept as given; the
 *   unit becomes the field's (`field.unit ?? null`) and a model unit that differs from it
 *   (ignoring case) asks for a check; the state becomes `measured`;
 * - `date`: a valid ISO month or day;
 * - `select`: one of the options, matched ignoring case and accents, stored as the option;
 * - `voltage_class`: a kV number (`parseVoltageClassKv`), stored as its kV text;
 * - `text` and `manufacturer`: whitespace collapsed, not empty.
 */
export function normalizeReadingValue(field: ReadingField, value: unknown): NormalizedReadingValue {
  // E78-Q3: a model date in `mm/aaaa` or `dd/mm/aaaa` is read in the canonical shape first.
  const shaped = structuringValueSchemaFor(field.kind).safeParse(field.kind === 'date' ? normalizeDateValue(value) : value);
  if (!shaped.success) return invalid;
  const parsed = shaped.data as unknown;
  switch (field.kind) {
    case 'number': {
      if (!isRecord(parsed) || typeof parsed.raw !== 'string' || !NUMBER_RAW.test(parsed.raw)) return invalid;
      const unit = field.unit ?? null;
      const modelUnit = typeof parsed.unit === 'string' ? parsed.unit : null;
      const unitDiffers = modelUnit !== null && (unit === null || modelUnit.trim().toLowerCase() !== unit.toLowerCase());
      return { ok: true, value: { raw: parsed.raw, unit, state: 'measured' }, verify: unitDiffers };
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
      const kv = parseVoltageClassKv(parsed);
      return kv === null ? invalid : { ok: true, value: kv, verify: false };
    }
    case 'text':
    case 'manufacturer': {
      if (typeof parsed !== 'string') return invalid;
      const text = collapse(parsed);
      return text === '' ? invalid : { ok: true, value: text, verify: false };
    }
  }
}
