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
 * No unit suffix is read here: that is Story 5.5's own extension of this module.
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
