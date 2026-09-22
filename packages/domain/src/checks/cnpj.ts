/*
 * Story 2.4 AC1: "CNPJ (14 digits when present)". Boundaries & Constraints is explicit —
 * only the literal length check, never a full CNPJ checksum (that is a later story's
 * concern, not this one's).
 */

/** True when `value` strips to exactly 14 digits (punctuation and spaces ignored). */
export function isValidCnpjFormat(value: string): boolean {
  return value.replace(/\D/g, '').length === 14;
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
