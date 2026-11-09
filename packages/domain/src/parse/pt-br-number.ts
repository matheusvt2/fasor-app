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

/** Groups the digits of an integer part by thousands with dots: "3300" -> "3.300". */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** One dot-decimal number as pt-BR shows it, or null when `text` is not one. */
function formatOneDecimal(text: string): string | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (match === null) return null;
  const [, sign, whole, fraction] = match;
  return `${sign}${groupThousands(whole!)}${fraction === undefined ? '' : `,${fraction}`}`;
}

/**
 * A dot-decimal `raw` as pt-BR shows a reading: thousands grouped with dots, the decimal
 * comma ("3300" -> "3.300", "1234.5" -> "1.234,5", "0.5" -> "0,5"). Fix batch fxpw G4: a
 * stored two-level voltage (`parseVoltagePairPtBr`) shows each side the same way
 * ("13.8/7.97" -> "13,8/7,97", "380/220" unchanged). Any other text is returned unchanged.
 */
export function formatDecimalGroupedPtBr(raw: string): string {
  const text = raw.trim();
  const single = formatOneDecimal(text);
  if (single !== null) return single;
  const pair = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(text);
  if (pair === null) return raw;
  return `${formatOneDecimal(pair[1]!)}/${formatOneDecimal(pair[2]!)}`;
}

/**
 * Fix batch fxpw G4: the two-level voltage FO.SERV-03 writes for a secondary ("380/220 V"):
 * two non-negative pt-BR numbers around one slash, spaces allowed, each side read by
 * `parseDecimalPtBr`; the dot-decimal sides joined by "/" ("13,8/7,97" -> "13.8/7.97",
 * " 380 / 220 " -> "380/220"). Null for anything else ("380/", "/220", "-380/220",
 * "380/220/127", a single number).
 */
export function parseVoltagePairPtBr(input: string): string | null {
  const sides = input.split('/');
  if (sides.length !== 2) return null;
  const out: string[] = [];
  for (const side of sides) {
    const text = side.trim();
    // A sign on either side is refused: a voltage pair is never negative, and "+" is never written.
    if (text === '' || text.startsWith('-') || text.startsWith('+')) return null;
    const raw = parseDecimalPtBr(text);
    if (raw === null) return null;
    out.push(raw);
  }
  return out.join('/');
}

/*
 * Seed v13 (Story 23.7, decision K): two more shapes of a nameplate number value, parsed here
 * only (AR-10) and stored in `raw` as typed, in canonical form:
 *
 * - a list of the plate's values in plate order (`FieldDef.list`, the transformer's TAPS):
 *   "13,8; 13,2; 12,6; 12; 11,4", the entries separated by ";", "·" or spaces, stored
 *   "13.8;13.2;12.6;12;11.4" and shown "13,8 · 13,2 · 12,6 · 12 · 11,4";
 * - a value over √3 (`FieldDef.over_sqrt3`, the TP's secondary): "115/√3", also "115/V3" or
 *   "115/raiz3" in any case, stored "115/√3".
 */

const LIST_SEPARATORS = /[;·\s]+/u;
/** A stored list entry: a positive plain decimal. */
const LIST_ENTRY = /^\d+(?:\.\d+)?$/;

/** Whether a positive dot-decimal value in `unit` is a whole number of volts (any value of another unit is). */
function wholeInVolts(raw: string, unit: string | null | undefined): boolean {
  const fraction = raw.split('.')[1] ?? '';
  if (unit === 'kV') return fraction.length <= 3;
  if (unit === 'V') return fraction === '';
  return true;
}

/**
 * Seed v13 (Story 23.7): a typed list of plate values, its dot-decimal entries joined by ";", or
 * null when it is no list: fewer than two entries, an entry that is no positive pt-BR number, a
 * value repeated (compared once canonical: "12" and "12,0" repeat), or, in V or kV, a value that
 * is not a whole number of volts (a tap is keyed by its volts, `relatorio/tap-rows.ts`).
 */
export function parseNumberListPtBr(input: string, options: { unit?: string | null } = {}): string | null {
  const parts = input
    .split(LIST_SEPARATORS)
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length < 2) return null;
  const out: string[] = [];
  for (const part of parts) {
    if (part.startsWith('-') || part.startsWith('+')) return null;
    const parsed = parseDecimalPtBr(part);
    if (parsed === null) return null;
    const raw = canonicalDecimal(parsed);
    if (!(Number(raw) > 0) || !wholeInVolts(raw, options.unit) || out.includes(raw)) return null;
    out.push(raw);
  }
  return out.join(';');
}

/** Seed v13 (Story 23.7): a stored list's entries in plate order, or null when `raw` is not a list `parseNumberListPtBr` writes. */
export function readNumberListRaw(raw: unknown): string[] | null {
  if (typeof raw !== 'string') return null;
  const entries = raw.split(';');
  if (entries.length < 2 || !entries.every((entry) => LIST_ENTRY.test(entry) && Number(entry) > 0)) return null;
  return new Set(entries).size === entries.length ? entries : null;
}

/** Seed v13 (Story 23.7): a stored list as pt-BR shows and prints it, "13,8 · 13,2 · 12,6"; any other text unchanged. */
export function formatNumberListPtBr(raw: string): string {
  const entries = readNumberListRaw(raw);
  return entries === null ? raw : entries.map((entry) => formatDecimalGroupedPtBr(entry)).join(' · ');
}

/** "N/√3" as typed: the number, a slash and √3 spelled "√3", "V3" or "raiz3" (any case, spaces allowed). */
const OVER_SQRT3_TYPED = /^\s*(\S(?:.*\S)?)\s*\/\s*(?:√|v|raiz\s*)3\s*$/iu;
/** "N/√3" as stored. */
const OVER_SQRT3_STORED = /^(\d+(?:\.\d+)?)\/√3$/u;

/** Seed v13 (Story 23.7): a typed "N/√3" as stored, "115/√3" ("13,8/raiz3" -> "13.8/√3"); null for anything else ("/√3", "x/√2", a plain number). */
export function parseOverSqrt3PtBr(input: string): string | null {
  const match = OVER_SQRT3_TYPED.exec(input);
  if (match === null) return null;
  const text = match[1]!;
  if (text.startsWith('-') || text.startsWith('+')) return null;
  const parsed = parseDecimalPtBr(text);
  if (parsed === null) return null;
  const raw = canonicalDecimal(parsed);
  return Number(raw) > 0 ? `${raw}/√3` : null;
}

/** Seed v13 (Story 23.7): the numerator of a stored "N/√3" ("115/√3" -> "115"), or null when `raw` is not one. */
export function readOverSqrt3Raw(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return OVER_SQRT3_STORED.exec(raw)?.[1] ?? null;
}

/** Seed v13 (Story 23.7): a stored "N/√3" as pt-BR shows and prints it, "13,8/√3"; any other text unchanged. */
export function formatOverSqrt3PtBr(raw: string): string {
  const numerator = readOverSqrt3Raw(raw);
  return numerator === null ? raw : `${formatDecimalGroupedPtBr(numerator)}/√3`;
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
 * optional "Ω" or "ohm") sets the unit ("147G" -> 147 GΩ, "3.7T" -> 3,7 TΩ, "147 g"), but
 * a lowercase m with the ohm ("147 mΩ", "147 mohm") is milliohm and invalid (E5-Q7); a
 * suffix on any other field is invalid, since its unit is fixed. A reading is never
 * negative: a leading "-" (also "-5" typed over a "Não medido" dash) is invalid.
 */
export function parseReadingPtBr(input: string, options: ParseReadingOptions): ParsedReading | null | 'invalid' {
  const text = input.trim();
  if (text === '') return null;
  if (text.startsWith('-')) return 'invalid';
  const insulation = isInsulationFamily(options.units);
  const suffix = /^(.*\d)\s*([mgt])\s*(Ω|ohms?)?$/i.exec(text);
  if (suffix !== null) {
    if (!insulation) return 'invalid';
    // E5-Q7: a lowercase m followed by the ohm is milliohm ("147 mΩ"), never mega: refused.
    if (suffix[2] === 'm' && suffix[3] !== undefined) return 'invalid';
    const raw = parseDecimalPtBr(suffix[1]!);
    return raw === null ? 'invalid' : { raw: canonicalDecimal(raw), unit: SUFFIX_UNITS[suffix[2]!.toLowerCase()]! };
  }
  const bare = insulation ? text.replace(/\s*(?:Ω|ohms?)$/i, '') : text;
  const raw = parseDecimalPtBr(bare);
  return raw === null ? 'invalid' : { raw: canonicalDecimal(raw), unit: options.defaultUnit };
}

/** Story 22.10: what `parseOverRangePtBr` reads from a typed reading above the instrument's limit. */
export type ParsedOverRange = { kind: 'limit'; raw: string; unit: string | null } | { kind: 'ol' };

// "OL" or "0L" (a zero for the letter O, as some displays draw it), any case, whitespace anywhere.
const OL_SPELLING = /^[O0]L$/;

/**
 * Story 22.10 (AR-10: the one parse home): a typed reading above the instrument's limit. "OL"
 * or "0L" in any case (whitespace anywhere) answers `{kind: 'ol'}`, the instrument's own limit
 * to be filled in by the caller; ">" followed by a reading read by `parseReadingPtBr`'s rules
 * (the insulation suffix, the milliohm refusal E5-Q7, no sign) answers `{kind: 'limit'}` with
 * that raw and unit, the limit above zero. `'invalid'` for ">" with nothing, zero, a negative
 * or no number after it ("> 147 mΩ" included); null when the text is no over-range syntax at
 * all (a plain reading, which `parseReadingPtBr` reads).
 */
export function parseOverRangePtBr(input: string, options: ParseReadingOptions): ParsedOverRange | null | 'invalid' {
  const text = input.trim();
  if (OL_SPELLING.test(text.replace(/\s+/g, '').toUpperCase())) return { kind: 'ol' };
  if (!text.startsWith('>')) return null;
  const parsed = parseReadingPtBr(text.slice(1), options);
  if (parsed === null || parsed === 'invalid' || !(Number(parsed.raw) > 0)) return 'invalid';
  return { kind: 'limit', raw: parsed.raw, unit: parsed.unit };
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

/*
 * Story 16.4 (contract 26): "N/A" in a nameplate or cabine number field. The AD-11 number
 * value's fourth state, `not_applicable`, says the plate carries no such value. This leaf
 * module, which imports nothing of the kernel, is its one home (AD-1): the text every reader
 * shows and prints, the spellings the input accepts, the stored value and its guard.
 * Story 17.3: the text is "N/A" (it was "N.A"); the stored state carries no spelling, so a
 * value typed as "N.A" before reads "N/A" too, with no contract bump.
 */

/** What a `not_applicable` number value shows and prints, with no unit. */
export const NOT_APPLICABLE_TEXT = 'N/A';

// The accepted spellings once whitespace is stripped and the text uppercased:
// "N.A", "N.A.", "NA" and "N/A".
const NOT_APPLICABLE_SPELLING = /^(N\.A\.?|NA|N\/A)$/;

/** True when the typed text is one of the accepted "N/A" spellings (any case, whitespace anywhere). */
export function isNotApplicableText(typed: string): boolean {
  return NOT_APPLICABLE_SPELLING.test(typed.replace(/\s+/g, '').toUpperCase());
}

// Story 22.2: the spellings a text value prints as "N/A", trimmed and in any case: "NA",
// "N.A", "N.A.", "NA." and "N/A". Narrower than the input's (no inner whitespace): a text field
// keeps what was typed unless it is plainly one of them.
const NOT_APPLICABLE_PRINTED = /^(n\.?a\.?|n\/a)$/i;

/**
 * Story 22.2 (Bruno, 2026-11-06): a text as the document prints it, one "N/A" for every N/A
 * spelling ("na", "N.A.", "n/a"), any other text as given ("-" stays "-"). Shared by the text
 * and the number fields of the nameplate, the cabine and a configuration.
 */
export function printNotApplicable(text: string): string {
  return NOT_APPLICABLE_PRINTED.test(text.trim()) ? NOT_APPLICABLE_TEXT : text;
}

/** The stored `not_applicable` number value (a type alias, so it is a JSON value as it stands). */
export type NotApplicableNumber = {
  readonly raw: '';
  readonly unit: null;
  readonly state: 'not_applicable';
};

/** The one `not_applicable` value a nameplate or cabine number field commits. */
export const NOT_APPLICABLE_NUMBER: NotApplicableNumber = Object.freeze({
  raw: '',
  unit: null,
  state: 'not_applicable',
});

/** True for a stored number value in the `not_applicable` state (any other value answers false). */
export function isNotApplicableNumber(value: unknown): value is NotApplicableNumber {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { state?: unknown }).state === 'not_applicable'
  );
}
