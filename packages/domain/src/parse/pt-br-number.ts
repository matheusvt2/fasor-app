/*
 * AR-10, AD-11: parsing happens only here, at the input boundary. A number field's value
 * stores `raw` as a dot-decimal string; this turns what the engineer typed the Brazilian
 * way into that string (EXPERIENCE.md › Measurement field, Parsing):
 *
 * - the comma is the decimal separator ("13,8" -> "13.8");
 * - a dot followed by exactly three digits, with no comma anywhere, is a thousands
 *   separator ("3.300" -> "3300", "1.234.567" -> "1234567");
 * - any other dot is a decimal ("3.7" -> "3.7").
 *
 * Story 5.5 extends it for the Measurement field: `parseReadingPtBr` reads a unit suffix
 * ("147G" -> 147 GΩ) on the insulation family only, `formatDecimalGroupedPtBr` shows a raw
 * value back with its thousands grouped ("3300" -> "3.300") and `numberEchoText` is the
 * echo line under a field while typing ("= 3.300 MΩ").
 */

// The leading group never starts with 0: nobody writes "0.500" to mean five hundred, so a
// leading zero falls through to PLAIN below and reads as the decimal it looks like (0,5).
const THOUSANDS_ONLY = /^[1-9]\d{0,2}(\.\d{3})+$/;
const PLAIN = /^\d+(\.\d+)?$/;

/** The dot-decimal string of a pt-BR typed number, or null when the text holds no number. */
export function parseDecimalPtBr(input: string): string | null {
  let text = input.trim().replace(/\s+/g, '');
  if (text === '') return null;
  let sign = '';
  if (text.startsWith('-') || text.startsWith('+')) {
    sign = text.startsWith('-') ? '-' : '';
    text = text.slice(1);
  }
  let normalized: string;
  if (text.includes(',')) {
    // With a comma, the comma is the decimal and every dot a thousands separator.
    const [whole, fraction, ...rest] = text.split(',');
    if (rest.length > 0 || whole === undefined || fraction === undefined) return null;
    if (whole.includes('.') && !THOUSANDS_ONLY.test(whole)) return null;
    const digits = whole.replace(/\./g, '');
    if (!/^\d*$/.test(digits) || !/^\d+$/.test(fraction)) return null;
    normalized = `${digits === '' ? '0' : digits}.${fraction}`;
  } else if (THOUSANDS_ONLY.test(text)) {
    normalized = text.replace(/\./g, '');
  } else if (PLAIN.test(text)) {
    normalized = text;
  } else {
    return null;
  }
  return `${sign}${normalized}`;
}

/** A dot-decimal `raw` as pt-BR shows it again: "13.8" -> "13,8". */
export function formatDecimalPtBr(raw: string): string {
  return raw.replace('.', ',');
}

/** Groups the digits of an integer part by thousands with dots: "3300" -> "3.300". */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * A dot-decimal `raw` as pt-BR shows a reading: thousands grouped with dots, the decimal
 * comma ("3300" -> "3.300", "1234.5" -> "1.234,5", "0.5" -> "0,5"). Text that is not a
 * dot-decimal number is returned unchanged.
 */
export function formatDecimalGroupedPtBr(raw: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw.trim());
  if (match === null) return raw;
  const [, sign, whole, fraction] = match;
  return `${sign}${groupThousands(whole!)}${fraction === undefined ? '' : `,${fraction}`}`;
}

/** The insulation family: the only units a typed suffix or the unit tap-cycle may set. */
export const INSULATION_UNITS: readonly string[] = ['MΩ', 'GΩ', 'TΩ'];

const SUFFIX_UNITS: Readonly<Record<string, string>> = { m: 'MΩ', g: 'GΩ', t: 'TΩ' };

export interface ParsedReading {
  raw: string;
  unit: string | null;
}

export interface ParseReadingOptions {
  /** The units the field accepts; a suffix is read only when this is the insulation family. */
  units: readonly string[];
  /** The unit a value typed without a suffix takes (the unit slot's current unit). */
  defaultUnit: string | null;
}

/** True for a unit list made only of insulation units (the fields with a unit tap-cycle). */
export function isInsulationFamily(units: readonly string[]): boolean {
  return units.length > 0 && units.every((unit) => INSULATION_UNITS.includes(unit));
}

/**
 * Story 5.5: a typed reading. `null` for an empty field, `'invalid'` for text that is no
 * number. On the insulation family a trailing M, G or T (any case, an optional space, an
 * optional "Ω" or "ohm") sets the unit ("147G" -> 147 GΩ, "3.7T" -> 3,7 TΩ, "147 g"); a
 * suffix on any other field is invalid, since its unit is fixed. A reading is never
 * negative: a leading "-" (also "-5" typed over a "Não medido" dash) is invalid.
 */
export function parseReadingPtBr(input: string, options: ParseReadingOptions): ParsedReading | null | 'invalid' {
  const text = input.trim();
  if (text === '') return null;
  if (text.startsWith('-')) return 'invalid';
  const insulation = isInsulationFamily(options.units);
  const suffix = /^(.*\d)\s*([mgt])\s*(?:Ω|ohms?)?$/i.exec(text);
  if (suffix !== null) {
    if (!insulation) return 'invalid';
    const raw = parseDecimalPtBr(suffix[1]!);
    return raw === null ? 'invalid' : { raw: canonicalDecimal(raw), unit: SUFFIX_UNITS[suffix[2]!.toLowerCase()]! };
  }
  const bare = insulation ? text.replace(/\s*(?:Ω|ohms?)$/i, '') : text;
  const raw = parseDecimalPtBr(bare);
  return raw === null ? 'invalid' : { raw: canonicalDecimal(raw), unit: options.defaultUnit };
}

/**
 * A reading's `raw` in one spelling, so the same value always compares and prints the
 * same: no redundant leading zeros, no trailing fraction zeros ("0.500" -> "0.5",
 * "007" -> "7", "120.00" -> "120", "-0" -> "0").
 */
export function canonicalDecimal(raw: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (match === null) return raw;
  const whole = match[2]!.replace(/^0+(?=\d)/, '');
  const fraction = (match[3] ?? '').replace(/0+$/, '');
  const body = fraction === '' ? whole : `${whole}.${fraction}`;
  return body === '0' ? '0' : `${match[1]}${body}`;
}

/** The echo line under a field while typing: "= 3.300 MΩ" ("= 3.300" with no unit). */
export function numberEchoText(raw: string, unit: string | null): string {
  const value = formatDecimalGroupedPtBr(raw);
  return unit === null || unit === '' ? `= ${value}` : `= ${value} ${unit}`;
}
