/*
 * Batch e26t (2026-11-22): the session cookie is `Secure` (AD-9, Story 1.3) and the e2e origin is
 * plain http on localhost (`playwright.config.ts` `use.baseURL`). Chromium stores a `Secure` cookie
 * set over http on localhost; WebKit refuses it. So on the WebKit project a sign-in through the
 * Login form answers 200 and leaves the cookie jar as it was: the account read that follows goes out
 * with no session (or with whatever older cookie the harness had put there) and is answered 401,
 * which Login reads as "E-mail ou senha incorretos." On the HTTPS origin a real device sees, the
 * cookie is stored by every engine and replaces the older one of the same name.
 *
 * This is the one place that turns a `Set-Cookie` header into the cookie the harness adds by hand
 * (`context.addCookies`) on that plain http origin: the same name and value, `HttpOnly` and
 * `SameSite` as the server sent them, and no `Secure`. Nothing the server sees changes. Pure, so
 * the tooling tests read it (`scripts/e2e.test.ts`).
 */

/** The cookie shape `BrowserContext.addCookies` takes, for a plain http origin. */
export interface PlainHttpCookie {
  name: string;
  value: string;
  url: string;
  httpOnly: boolean;
  secure: false;
  sameSite: 'Strict' | 'Lax' | 'None';
}

const SAME_SITE: Record<string, PlainHttpCookie['sameSite']> = { strict: 'Strict', lax: 'Lax', none: 'None' };

/**
 * One `Set-Cookie` header value as the cookie to add on `origin`, without `Secure`. Null for a
 * header that names no cookie and for one that deletes it (`Max-Age=0` or an empty value), which
 * the harness must not turn into a cookie that is sent.
 */
export function plainHttpCookie(setCookie: string, origin: string): PlainHttpCookie | null {
  const [pair = '', ...attributes] = setCookie.split(';').map((part) => part.trim());
  const split = pair.indexOf('=');
  if (split <= 0) return null;
  const name = pair.slice(0, split);
  const value = pair.slice(split + 1);
  if (value === '') return null;
  let httpOnly = false;
  let sameSite: PlainHttpCookie['sameSite'] = 'Lax';
  for (const attribute of attributes) {
    const [rawKey = '', rawValue = ''] = attribute.split('=').map((part) => part.trim());
    const key = rawKey.toLowerCase();
    if (key === 'httponly') httpOnly = true;
    else if (key === 'samesite') sameSite = SAME_SITE[rawValue.toLowerCase()] ?? 'Lax';
    else if (key === 'max-age' && Number(rawValue) <= 0) return null;
  }
  return { name, value, url: origin, httpOnly, secure: false, sameSite };
}
