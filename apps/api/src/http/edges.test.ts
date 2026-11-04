import type { S3Client } from '@aws-sdk/client-s3';
import { errorResponseSchema } from '@app/domain';
import { describe, expect, it, vi } from 'vitest';
import type { Auth } from '../auth/auth.ts';
import { isTrustedOrigin } from '../auth/trusted-origins.ts';
import type { Db } from '../db/client.ts';
import { AUTH_ROUTES, createApp } from './app.ts';
import { cachedProbe, CACHED_PROBE_TTL_MS, createHealthRoutes } from './health.ts';

/*
 * Story 20.13 (security pass S7, S8) through the real app with the auth and the database
 * stubbed: the better-auth allowlist, the cross-site write guard and the cached LibreOffice
 * probe. `edges.integration.test.ts` runs the same rows against the real auth and database.
 */

const up = async () => undefined;
const probes = { db: up, queue: up, storage: up, libreoffice: up };
const TRUSTED = ['http://localhost:5173', 'http://localhost:*', 'https://app.example.com'];

/** An auth whose handler answers 200 and records the path it was given; no session. */
function stubAuth(calls: string[]): Auth {
  return {
    handler: async (request: Request) => {
      calls.push(`${request.method} ${new URL(request.url).pathname}`);
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    },
    api: { getSession: async () => null },
  } as unknown as Auth;
}

function makeApp(calls: string[] = [], guard: 'off' | { trustedOrigins: readonly string[] } = { trustedOrigins: TRUSTED }) {
  return createApp({ probes, auth: stubAuth(calls), db: {} as Db, s3: {} as S3Client, bucket: 'test', originGuard: guard });
}

/** The headers of a JSON body, its length stated as a browser states it. */
const headersOf = (body: unknown, headers: Record<string, string> = {}): Record<string, string> => ({
  'content-type': 'application/json',
  'content-length': String(Buffer.byteLength(JSON.stringify(body))),
  ...headers,
});

interface Call {
  path: string;
  init: RequestInit & { method: string };
}

/** A request to `path` (POST unless `method` says otherwise), its headers given whole. */
function post(path: string, init: { headers?: Record<string, string>; body?: string; method?: string } = {}): Call {
  return { path, init: { method: init.method ?? 'POST', headers: init.headers ?? {}, ...(init.body === undefined ? {} : { body: init.body }) } };
}

describe('20.13-UNIT isTrustedOrigin', () => {
  it('takes exact origins and the wildcard patterns better-auth takes', () => {
    expect(isTrustedOrigin('http://localhost:5173', TRUSTED)).toBe(true);
    expect(isTrustedOrigin('http://localhost:5200', TRUSTED)).toBe(true);
    expect(isTrustedOrigin('https://app.example.com/', TRUSTED)).toBe(true);
    expect(isTrustedOrigin('HTTPS://APP.EXAMPLE.COM', TRUSTED)).toBe(true);
    expect(isTrustedOrigin('https://evil.example', TRUSTED)).toBe(false);
    expect(isTrustedOrigin('https://app.example.com.evil.example', TRUSTED)).toBe(false);
    expect(isTrustedOrigin('http://localhost.evil.example:80', TRUSTED)).toBe(false);
    expect(isTrustedOrigin('http://localhost:5173/x', ['http://localhost:*'])).toBe(false);
    expect(isTrustedOrigin('https://a.example.com', ['https://*.example.com'])).toBe(true);
    expect(isTrustedOrigin('null', ['null', ...TRUSTED])).toBe(false);
    expect(isTrustedOrigin('', TRUSTED)).toBe(false);
  });
});

describe('20.13-UNIT the better-auth allowlist (S7)', () => {
  it('routes only sign-in, sign-out and get-session to better-auth; every other path answers 404 not_found', async () => {
    const calls: string[] = [];
    const app = makeApp(calls, 'off');
    expect(AUTH_ROUTES.map((route) => `${route.method} ${route.path}`)).toEqual([
      'POST /api/auth/sign-in/email',
      'POST /api/auth/sign-out',
      'GET /api/auth/get-session',
    ]);
    for (const route of AUTH_ROUTES) {
      const res = await app.request(route.path, route.method === 'POST' ? post(route.path, { headers: headersOf({}), body: '{}' }).init : { method: 'GET' });
      expect(res.status, route.path).toBe(200);
    }
    expect(calls).toEqual(AUTH_ROUTES.map((route) => `${route.method} ${route.path}`));

    const refused: Array<[string, string]> = [
      ['POST', '/api/auth/update-user'],
      ['GET', '/api/auth/list-sessions'],
      ['POST', '/api/auth/revoke-other-sessions'],
      ['POST', '/api/auth/revoke-sessions'],
      ['POST', '/api/auth/change-password'],
      ['POST', '/api/auth/change-email'],
      ['POST', '/api/auth/sign-up/email'],
      ['POST', '/api/auth/delete-user'],
      ['GET', '/api/auth/sign-in/email'],
      ['POST', '/api/auth/get-session'],
      ['GET', '/api/auth/ok'],
    ];
    for (const [method, path] of refused) {
      const res = await app.request(path, method === 'POST' ? { method, headers: { 'content-type': 'application/json' }, body: '{"name":"X"}' } : { method });
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(errorResponseSchema.parse(await res.json()).code).toBe('not_found');
    }
    expect(calls).toHaveLength(AUTH_ROUTES.length);
  });
});

describe('20.13-UNIT the cross-site write guard (S8)', () => {
  const opsBody = JSON.stringify({ ops: [] });
  const opsHeaders = headersOf({ ops: [] });

  async function codeOf(res: Response): Promise<string | null> {
    if (res.status !== 403) return null;
    return errorResponseSchema.parse(await res.json()).code;
  }

  it('refuses a foreign Origin, a missing one without Sec-Fetch-Site: same-origin, and a body that is not JSON', async () => {
    const calls: string[] = [];
    const app = makeApp(calls);
    const cases: Array<[string, Call]> = [
      ['foreign origin', post('/api/sync/ops', { headers: { ...opsHeaders, origin: 'https://evil.example' }, body: opsBody })],
      ['sibling subdomain', post('/api/sync/ops', { headers: { ...opsHeaders, origin: 'https://evil.app.example.com' }, body: opsBody })],
      ['no origin', post('/api/sync/ops', { headers: opsHeaders, body: opsBody })],
      ['no origin, cross-site', post('/api/sync/ops', { headers: { ...opsHeaders, 'sec-fetch-site': 'cross-site' }, body: opsBody })],
      ['no origin, same-site', post('/api/sync/ops', { headers: { ...opsHeaders, 'sec-fetch-site': 'same-site' }, body: opsBody })],
      ['text/plain', post('/api/sync/ops', { headers: { origin: 'http://localhost:5173', 'content-type': 'text/plain', 'content-length': String(opsBody.length) }, body: opsBody })],
      ['multipart', post('/api/sync/ops', { headers: { origin: 'http://localhost:5173', 'content-type': 'multipart/form-data; boundary=x', 'content-length': '10' }, body: '--x--\r\n\r\n' })],
      ['form', post('/api/sync/ops', { headers: { origin: 'http://localhost:5173', 'content-type': 'application/x-www-form-urlencoded', 'content-length': '3' }, body: 'a=1' })],
      ['no content-type', post('/api/sync/ops', { headers: { origin: 'http://localhost:5173', 'content-length': String(opsBody.length) }, body: opsBody })],
      ['a body with no length header', post('/api/sync/ops', { headers: { origin: 'http://localhost:5173', 'content-type': 'text/plain' }, body: opsBody })],
      ['sign-in from a foreign origin', post('/api/auth/sign-in/email', { headers: { ...headersOf({}), origin: 'https://evil.example' }, body: '{}' })],
      ['sign-in as text/plain', post('/api/auth/sign-in/email', { headers: { origin: 'http://localhost:5173', 'content-type': 'text/plain', 'content-length': '2' }, body: '{}' })],
      ['PUT', post('/api/account/registration', { method: 'PUT', headers: { ...opsHeaders, origin: 'https://evil.example' }, body: opsBody })],
      ['PATCH', post('/api/anything', { method: 'PATCH', headers: { ...opsHeaders, origin: 'https://evil.example' }, body: opsBody })],
      ['DELETE', post('/api/anything', { method: 'DELETE', headers: { origin: 'https://evil.example', 'content-length': '0' } })],
      ['the file upload from a foreign origin', post('/api/files/x', { method: 'PUT', headers: { origin: 'https://evil.example', 'content-type': 'image/jpeg', 'content-length': '1' }, body: 'x' })],
      ['the beacon from a foreign origin', post('/api/telemetry', { headers: { origin: 'https://evil.example', 'content-type': 'text/plain', 'content-length': '2' }, body: '[]' })],
    ];
    for (const [name, call] of cases) {
      const res = await app.request(call.path, call.init);
      expect(await codeOf(res), name).toBe('forbidden_origin');
    }
    // Nothing reached better-auth.
    expect(calls).toEqual([]);
  });

  it("lets the app's own requests through: a trusted Origin with JSON, Sec-Fetch-Site same-origin, the exempt routes, body-less posts and reads", async () => {
    const calls: string[] = [];
    const app = makeApp(calls);
    const passes: Array<[string, Call]> = [
      ['trusted origin, JSON', post('/api/auth/sign-in/email', { headers: { ...headersOf({}), origin: 'http://localhost:5200' }, body: '{}' })],
      ['JSON with a charset', post('/api/auth/sign-in/email', { headers: { origin: 'https://app.example.com', 'content-type': 'application/json; charset=utf-8', 'content-length': '2' }, body: '{}' })],
      ['no origin, same-origin fetch', post('/api/auth/sign-in/email', { headers: { ...headersOf({}), 'sec-fetch-site': 'same-origin' }, body: '{}' })],
      ['body-less sign-out', post('/api/auth/sign-out', { headers: { origin: 'http://localhost:5173', 'content-length': '0' } })],
      ['body-less post with no length', post('/api/auth/sign-out', { headers: { origin: 'http://localhost:5173' } })],
    ];
    for (const [name, call] of passes) {
      const res = await app.request(call.path, call.init);
      expect(res.status, name).toBe(200);
    }
    expect(calls).toHaveLength(passes.length);

    // The file upload and the beacon keep their own types; a read is never guarded.
    const upload = await app.request('/api/files/x', post('/api/files/x', { method: 'PUT', headers: { origin: 'http://localhost:5173', 'content-type': 'image/jpeg', 'content-length': '1' }, body: 'x' }).init);
    expect(upload.status).toBe(401);
    const beacon = await app.request('/api/telemetry', post('/api/telemetry', { headers: { origin: 'http://localhost:5173', 'content-type': 'text/plain;charset=UTF-8', 'content-length': '2' }, body: '[]' }).init);
    expect(beacon.status).toBe(401);
    const read = await app.request('/api/account', { method: 'GET', headers: { origin: 'https://evil.example' } });
    expect(read.status).toBe(401);
    const health = await app.request('/api/health', { method: 'GET' });
    expect(health.status).toBe(200);
  });

  it('off: nothing is guarded (the in-process tests about something else)', async () => {
    const app = makeApp([], 'off');
    const call = post('/api/auth/sign-in/email', { headers: { origin: 'https://evil.example', 'content-type': 'text/plain' }, body: '{}' });
    const res = await app.request(call.path, call.init);
    expect(res.status).toBe(200);
  });
});

describe('20.13-UNIT the cached LibreOffice probe', () => {
  it('runs at most once per minute, whatever the health route is asked; a failure is cached too', async () => {
    let clock = 1_000_000;
    let fail = false;
    const probe = vi.fn(async () => {
      if (fail) throw new Error('soffice gone');
    });
    const libreoffice = cachedProbe(probe, CACHED_PROBE_TTL_MS, () => clock);
    const app = createHealthRoutes({ ...probes, libreoffice });
    for (let i = 0; i < 10; i++) {
      expect((await app.request('/api/health')).status).toBe(200);
      clock += 5_000;
    }
    expect(probe).toHaveBeenCalledTimes(1);
    expect(CACHED_PROBE_TTL_MS).toBe(60_000);

    clock += 15_000;
    fail = true;
    expect((await app.request('/api/health')).status).toBe(503);
    expect(probe).toHaveBeenCalledTimes(2);
    fail = false;
    expect((await app.request('/api/health')).status).toBe(503);
    expect(probe).toHaveBeenCalledTimes(2);
    clock += CACHED_PROBE_TTL_MS;
    expect((await app.request('/api/health')).status).toBe(200);
    expect(probe).toHaveBeenCalledTimes(3);
  });
});
