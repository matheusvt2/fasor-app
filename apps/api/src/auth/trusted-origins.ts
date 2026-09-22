/** Splits the comma-separated TRUSTED_ORIGINS variable, dropping blanks. */
export function parseTrustedOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
}
