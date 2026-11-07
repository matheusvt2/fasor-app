/*
 * Story 22.9 (seed v12; Bruno's item 28, the class lists the coordinator's reading from NBR 6856
 * and NBR 6855, listed for Bruno): the ratio criterion of a TC or a TP follows the accuracy class
 * its EXATIDÃO names (`TestDef.criterion_class_field`). A measurement class (0,3, 0,6, 1,2, 3) is
 * judged at ± the class %, a protection class at its ratio error at rated current, and with no
 * class the seeded ± 0,5 % stands and the sheet asks for the class. The transformador de força
 * names no class field and keeps ± 0,5 % (NBR 5356). Only v12 definitions name the field: v1 to
 * v11 keep ± 0,5 %.
 *
 * 2026-11-07, e22g (Bruno's test base rev03, his answers to the coordinator's readings of Stories
 * 22.9 and 22.8; until then every protection class was judged at ± 3 %): the protection classes
 * follow IEC 61869-2 for the TC (5P ± 1 %, 10P ± 3 %) and IEC 61869-3 for the TP (3P ± 3 %,
 * 6P ± 6 %); the measurement class 3 stays ± 3 %. The TP gains 3P and 6P (seed v12, in place).
 *
 * A printed class carries its burden, in either notation, and the reader keeps the class alone:
 *
 * - the old NBR notation: "0,6C25" (TC, measurement class 0,6, burden C25), "10B100" (TC,
 *   protection 10 % error, low-reactance B, 100 V; an A is the high-reactance class) and
 *   "0,3P75" (TP, measurement class 0,3, burden P75: a P after a measurement class is a burden);
 * - the IEC notation: "25VA 5P20" (burden, protection class 5P, accuracy limit factor 20),
 *   "12,5VA 0,3" and "10P20". A burden in VA is dropped wherever it stands.
 *
 * A leading 3, 5, 6 or 10 followed by P is a protection class (3P and 6P only a TP offers, 5P and
 * 10P only a TC: the select's options decide what lands), a leading 5 or 10 followed by A or B is
 * the NBR protection class of the same error, otherwise the leading number is the measurement
 * class and the rest is the burden, ignored. The parser never throws.
 */

/** The field whose select options are accuracy classes (the TC's and TP's EXATIDÃO from seed v12). */
export const ACCURACY_CLASS_FIELD = 'exatidao';

/** The protection classes a P follows, and the ratio deviation in % they are judged at (e22g, Bruno's test base rev03). */
const PROTECTION_CLASSES: Readonly<Record<string, number>> = { '3': 3, '5': 1, '6': 6, '10': 3 };
/** The old NBR protection classes (an A or a B after the error %): the IEC P class of the same error. */
const NBR_PROTECTION_CLASSES: readonly string[] = ['5', '10'];

/** A burden in VA, in front of or behind the class ("25VA", "12,5 VA"). */
const BURDEN_VA = /\d+(?:[.,]\d+)?\s*va(?![a-z])/gi;
const CLASS_TEXT = /^[\s;,/-]*(?:cl(?:asse)?\.?\s*)?(\d+(?:[.,]\d+)?)\s*([pab])?/i;

/**
 * The class a printed or stored EXATIDÃO names, as the select offers it: "0,6C25" -> "0,6",
 * "10P20" -> "10P", "1,2P75" -> "1,2", "0.3" -> "0,3", "5P10" -> "5P", "25VA 5P20" -> "5P",
 * "12,5VA 0,3" -> "0,3", "10B100" -> "10P", "6P" -> "6P"; null for a text that names none ("C25",
 * "", "25VA", a non-string).
 */
export function parseAccuracyClass(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const match = CLASS_TEXT.exec(text.replace(BURDEN_VA, ' '));
  if (match === null) return null;
  const number = Number(match[1]!.replace(',', '.'));
  if (!Number.isFinite(number) || number <= 0) return null;
  const digits = String(number);
  const letter = match[2]?.toLowerCase();
  if (letter === 'p' && Object.hasOwn(PROTECTION_CLASSES, digits)) return `${digits}P`;
  // An A or B after 5 or 10 is the NBR protection class; after any other number the number is the measurement class.
  if ((letter === 'a' || letter === 'b') && NBR_PROTECTION_CLASSES.includes(digits)) return `${digits}P`;
  return digits.replace('.', ',');
}

/** The ratio deviation in % a class is judged at: the class itself for a measurement class, the protection table's for a P class; null for no class. */
export function accuracyClassDeviation(cls: string | null | undefined): number | null {
  if (typeof cls !== 'string') return null;
  const protection = /^(\d+)P$/.exec(cls);
  if (protection !== null) return PROTECTION_CLASSES[protection[1]!] ?? null;
  const number = Number(cls.replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? number : null;
}

// authored (Story 22.9, listed for Bruno): under a ratio test whose EXATIDÃO is empty.
/** The helper a ratio test judged by a class shows while its EXATIDÃO is empty. */
export const ACCURACY_CLASS_HELPER = 'Informe a EXATIDÃO na placa: sem a classe, a relação é julgada a ±0,5 %.';
