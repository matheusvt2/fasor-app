import { TELEMETRY_ROUTE, type ErrorResponse } from '@app/domain';
import type { MiddlewareHandler } from 'hono';
import { isTrustedOrigin } from '../auth/trusted-origins.ts';

/*
 * Story 20.13 (security pass S8): the cross-site write guard of every mutating `/api` request
 * (POST, PUT, PATCH, DELETE). `SameSite=Lax` keeps the session cookie off a request another
 * site starts, but not off one a sibling subdomain of the same site starts, and a `text/plain`
 * form post needs no preflight. So a write passes only when:
 *
 * - its `Origin` is one of the trusted origins (the patterns better-auth gets), or it carries
 *   no `Origin` and the browser says `Sec-Fetch-Site: same-origin`; and
 * - its body is `application/json` (parameters allowed). Exempt from this rule only: the file
 *   upload (`PUT /api/files/:id`, the file's own type), the telemetry beacon
 *   (`POST /api/telemetry`, which `sendBeacon` may send as text) and a request with no body.
 *
 * Anything else answers `403 forbidden_origin` before any route runs, so nothing is applied.
 */

export interface OriginGuardOptions {
  /** The trusted origins: TRUSTED_ORIGINS and AUTH_BASE_URL's origin, as better-auth gets them (`main.ts`). */
  trustedOrigins: readonly string[];
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const forbiddenOrigin: ErrorResponse = {
  code: 'forbidden_origin',
  message: 'This request must come from the app itself, with a JSON body.',
};

function isFileUpload(method: string, path: string): boolean {
  return method === 'PUT' && path.startsWith('/api/files/');
}

/**
 * No body at all: a zero length, or no length, no chunked transfer and no body stream. A
 * browser's body-less `fetch` POST says `Content-Length: 0`; `@hono/node-server` gives every
 * POST a body stream, so one with neither header is still held to the JSON rule.
 */
function hasNoBody(request: { contentLength: string | undefined; transferEncoding: string | undefined; hasStream: () => boolean }): boolean {
  if (request.transferEncoding !== undefined && request.transferEncoding.trim() !== '') return false;
  if (request.contentLength !== undefined) return request.contentLength.trim() === '0';
  // Read last and only here: under `@hono/node-server` touching `raw.body` turns the incoming
  // body into a stream, which is then never drained when an early 413 answers, and the reset
  // socket reaches the client behind Caddy as a 502 (e20e, `app.ts` `bodyTooLarge`).
  return !request.hasStream();
}

function isJson(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  return contentType.split(';')[0]!.trim().toLowerCase() === 'application/json';
}

export function originGuard(options: OriginGuardOptions): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method;
    if (!MUTATING.has(method)) return next();
    const path = c.req.path;
    const origin = c.req.header('origin');
    const fromApp =
      origin === undefined ? c.req.header('sec-fetch-site')?.trim().toLowerCase() === 'same-origin' : isTrustedOrigin(origin, options.trustedOrigins);
    if (!fromApp) return c.json(forbiddenOrigin, 403);
    const exempt =
      isFileUpload(method, path) ||
      path === TELEMETRY_ROUTE.path ||
      hasNoBody({ contentLength: c.req.header('content-length'), transferEncoding: c.req.header('transfer-encoding'), hasStream: () => c.req.raw.body !== null });
    if (!exempt && !isJson(c.req.header('content-type'))) return c.json(forbiddenOrigin, 403);
    return next();
  };
}
