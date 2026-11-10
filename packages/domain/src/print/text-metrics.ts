/*
 * Fix batch e23p (P2): the advance widths of the sheet's face. The api renders with Liberation Sans
 * (`fc-match Arial` in its container), metric-compatible with Arial, so Arial's advance widths, in
 * thousandths of an em, measure a word as LibreOffice lays it out. Upper-case accented letters and
 * lower-case accents take their base letter's width (the accent sits above it).
 */

/** Arial's regular advance widths, in thousandths of an em. */
const REGULAR: Readonly<Record<string, number>> = {
  ' ': 278, '.': 278, ',': 278, ':': 278, ';': 278, '/': 278, '(': 333, ')': 333, '-': 333, '%': 889,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833,
  n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
};

/** Arial Bold's advance widths, in thousandths of an em. */
const BOLD: Readonly<Record<string, number>> = {
  ' ': 278, '.': 278, ',': 278, ':': 333, ';': 333, '/': 278, '(': 333, ')': 333, '-': 333, '%': 889,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889,
  n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
};

/** The signs the sheet prints beyond the alphabet, the same in both weights. */
const SIGNS: Readonly<Record<string, number>> = { '°': 400, Ω: 780, µ: 580, '≥': 550, '≤': 550, '·': 340 };

/** The accented letters the sheet prints, measured as their base letter. */
const BASE_LETTER: Readonly<Record<string, string>> = {
  Á: 'A', À: 'A', Â: 'A', Ã: 'A', É: 'E', Ê: 'E', Í: 'I', Ó: 'O', Ô: 'O', Õ: 'O', Ú: 'U', Ç: 'C',
  á: 'a', à: 'a', â: 'a', ã: 'a', é: 'e', ê: 'e', í: 'i', ó: 'o', ô: 'o', õ: 'o', ú: 'u', ç: 'c',
};

/**
 * The class estimate of a character outside the table (the one `section-9.ts` sized every column by
 * before this batch): narrow, slim, wide, upper case or other, bold about 7 % wider.
 */
function estimatedEm(ch: string, bold: boolean): number {
  let em: number;
  if (/[ilj.,:;'’|!Iíìï\s]/u.test(ch)) em = 0.28;
  else if (/[ftr/()[\]-]/u.test(ch)) em = 0.34;
  else if (/[mwMWΩ]/u.test(ch)) em = 0.84;
  else if (/\p{Lu}/u.test(ch)) em = 0.72;
  else em = 0.56;
  return bold ? em * 1.07 : em;
}

/** One character's advance width in ems. */
function charEm(ch: string, bold: boolean): number {
  const sign = SIGNS[ch];
  if (sign !== undefined) return sign / 1000;
  const table = bold ? BOLD : REGULAR;
  const known = table[BASE_LETTER[ch] ?? ch];
  return known === undefined ? estimatedEm(ch, bold) : known / 1000;
}

/** The advance width of a text in ems of Arial (Liberation Sans in the api's container), regular or bold. */
export function printTextEm(text: string, bold: boolean): number {
  let em = 0;
  for (const ch of text) em += charEm(ch, bold);
  return em;
}
