/*
 * Story 22.9 (seed v12; Bruno's item 28, the class lists the coordinator's reading from NBR 6856
 * and NBR 6855, listed for Bruno): the ratio criterion of a TC or a TP follows the accuracy class
 * its EXATIDÃO names (`TestDef.criterion_class_field`). A measurement class (0,3, 0,6, 1,2, 3) is
 * judged at ± the class %, a protection class (5P, 10P) at ± 3 %, and with no class the seeded
 * ± 0,5 % stands and the sheet asks for the class. The transformador de força names no class
 * field and keeps ± 0,5 % (NBR 5356). Only v12 definitions name the field: v1 to v11 keep ± 0,5 %.
 *
 * A printed class carries its burden ("0,6C25", "10P20", "1,2P75"): a leading 5 or 10 followed by
 * P is a protection class, otherwise the leading number is the measurement class and the rest is
 * the burden, ignored. The parser never throws.
 */

/** The protection classes a P follows, and the deviation they are judged at in %. */
const PROTECTION_CLASSES: Readonly<Record<string, number>> = { '5': 3, '10': 3 };

const CLASS_TEXT = /^\s*(?:cl(?:asse)?\.?\s*)?(\d+(?:[.,]\d+)?)\s*(p)?/i;

/**
 * The class a printed or stored EXATIDÃO names, as the select offers it: "0,6C25" -> "0,6",
 * "10P20" -> "10P", "1,2P75" -> "1,2", "0.3" -> "0,3", "5P10" -> "5P"; null for a text that
 * names none ("C25", "", a non-string).
 */
export function parseAccuracyClass(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const match = CLASS_TEXT.exec(text);
  if (match === null) return null;
  const number = Number(match[1]!.replace(',', '.'));
  if (!Number.isFinite(number) || number <= 0) return null;
  const digits = String(number);
  if (match[2] !== undefined && Object.hasOwn(PROTECTION_CLASSES, digits)) return `${digits}P`;
  return digits.replace('.', ',');
}

/** The ratio deviation in % a class is judged at: the class itself for a measurement class, 3 for 5P and 10P; null for no class. */
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
