/** Splits the comma-separated TRUSTED_ORIGINS variable, dropping blanks. */
export function parseTrustedOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
}

/** An origin as the `Origin` header writes it: lower case, no trailing slash. */
function normalized(origin: string): string {
  return origin.trim().replace(/\/+$/, '').toLowerCase();
}

function escaped(text: string): string {
  return text.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/**
 * Story 20.13 (security pass S8): whether an `Origin` header names one of the trusted origins,
 * with the patterns better-auth takes from the same list: an exact origin, or one whose `*`
 * stands for any run of characters but `/` (`http://localhost:*` is every port of localhost)
 * and whose `?` stands for one. The literal `null` origin of an opaque context is never trusted.
 */
export function isTrustedOrigin(origin: string, trusted: readonly string[]): boolean {
  const candidate = normalized(origin);
  if (candidate === '' || candidate === 'null') return false;
  return trusted.some((pattern) => {
    const wanted = normalized(pattern);
    if (!/[*?]/.test(wanted)) return wanted === candidate;
    const regex = new RegExp(`^${wanted.split('*').map((part) => escaped(part).replace(/\?/g, '[^/]')).join('[^/]*')}$`);
    return regex.test(candidate);
  });
}
