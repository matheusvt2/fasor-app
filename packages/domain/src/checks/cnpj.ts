/*
 * Story 2.4 AC1: "CNPJ (14 digits when present)". ~~Boundaries & Constraints is explicit --
 * only the literal length check, never a full CNPJ checksum (that is a later story's
 * concern, not this one's).~~ Story 27.2 (F5, 2026-11-21): the two check digits too, by the
 * standard modulo-11 rule, so 11.111.111/1111-11 is refused where it is typed.
 */

/** The modulo-11 check digit of `digits` under `weights` (a remainder below 2 gives 0). */
function cnpjCheckDigit(digits: readonly number[], weights: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) sum += digits[i]! * weights[i]!;
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

const FIRST_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const SECOND_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/**
 * True when `value` strips to exactly 14 digits (punctuation and spaces ignored) and, Story 27.2,
 * its two check digits match (modulo 11); a run of one repeated digit ("00000000000000"), which
 * the rule would pass, is not a CNPJ.
 */
export function isValidCnpjFormat(value: string): boolean {
  const text = value.replace(/\D/g, '');
  if (text.length !== 14 || /^(\d)\1{13}$/.test(text)) return false;
  const digits = [...text].map(Number);
  return digits[12] === cnpjCheckDigit(digits, FIRST_WEIGHTS) && digits[13] === cnpjCheckDigit(digits, SECOND_WEIGHTS);
}

/**
 * Canonicalizes a 14-digit CNPJ to the standard punctuated form (`00.000.000/0001-00`,
 * matching the mock) so two differently-punctuated entries of the same CNPJ never coexist.
 * Returns `value` unchanged when it does not strip to exactly 14 digits.
 */
export function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14) return value;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}
