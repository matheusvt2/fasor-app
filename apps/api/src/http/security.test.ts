import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { S3Client } from '@aws-sdk/client-s3';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Auth } from '../auth/auth.ts';
import type { Db } from '../db/client.ts';
import { AUTH_BODY_LIMIT_BYTES, createApp, type AppOptions } from './app.ts';
import { clientAddress, FixedWindowLimiter } from './rate-limit.ts';
import { BASE_SECURITY_HEADERS, htmlContentSecurityPolicy, inlineScriptHashes, securityHeaders } from './security-headers.ts';

/*
 * Security review 2026-09-30 (E11-A5): the response headers, the HTML shell's CSP, the
 * body limits and the sign-in and push rate limits, through the real app with the auth
 * and the database stubbed (no route below reaches either).
 */

const up = async () => undefined;
const probes = { db: up, queue: up, storage: up, libreoffice: up };
const USER = { id: '01a0f3a3-1f51-730d-9ec4-976f95ae2ed2', companyId: '01a0f3a3-1e2c-7303-a018-a03b2707f82e' };

/** An auth whose sign-in always refuses the password and whose session is `signedIn`'s. */
function stubAuth(signedIn: boolean): Auth {
  return {
    handler: async () => new Response(JSON.stringify({ message: 'Invalid email or password' }), { status: 401 }),
    api: { getSession: async () => (signedIn ? { user: USER, session: {} } : null) },
  } as unknown as Auth;
}

function makeApp(overrides: Partial<AppOptions> = {}, signedIn = false) {
  return createApp({ probes, auth: stubAuth(signedIn), db: {} as Db, s3: {} as S3Client, bucket: 'test', ...overrides });
}

const signIn = (email: string, address: string) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': address },
  body: JSON.stringify({ email, password: 'wrong-password' }),
});

describe('security headers', () => {
  it('sets the base headers on an /api answer, a 404 and an auth answer, and no-store on /api', async () => {
    const app = makeApp();
    for (const path of ['/api/health', '/api/no-such-route']) {
      const res = await app.request(path);
      for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) expect(res.headers.get(name), `${path} ${name}`).toBe(value);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
    const auth = await app.request('/api/auth/sign-in/email', signIn('a@review.test', '10.0.0.1'));
    expect(auth.status).toBe(401);
    expect(auth.headers.get('x-frame-options')).toBe('DENY');
  });

  it('keeps a header the route set itself', async () => {
    const app = new Hono();
    app.use('*', securityHeaders());
    app.get('/api/x', (c) => c.body('pdf', 200, { 'cache-control': 'private, max-age=60', 'referrer-policy': 'same-origin' }));
    const res = await app.request('/api/x');
    expect(res.headers.get('cache-control')).toBe('private, max-age=60');
    expect(res.headers.get('referrer-policy')).toBe('same-origin');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  describe('the HTML shell', () => {
    const script = "\n      document.documentElement.setAttribute('data-theme', 'dark');\n    ";
    const html = `<!doctype html><head><script>${script}</script><script type="module" src="/assets/app.js"></script></head><body>shell</body>`;
    let staticDir: string;

    beforeEach(async () => {
      staticDir = await mkdtemp(join(tmpdir(), 'app-csp-'));
      await writeFile(join(staticDir, 'index.html'), html);
      await writeFile(join(staticDir, 'app.js'), 'console.log(1)');
    });
    afterEach(async () => {
      await rm(staticDir, { recursive: true, force: true });
    });

    it('hashes exactly the inline scripts, never an external one', () => {
      const expected = `'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`;
      expect(inlineScriptHashes(html)).toEqual([expected]);
      expect(htmlContentSecurityPolicy(html)).toContain(`script-src 'self' ${expected}`);
    });

    it('serves index.html with the CSP and a static asset without one, both with the base headers', async () => {
      const app = makeApp({ staticDir });
      const shell = await app.request('/some/client/route');
      const csp = shell.headers.get('content-security-policy') ?? '';
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain(inlineScriptHashes(html)[0]);
      expect(shell.headers.get('x-content-type-options')).toBe('nosniff');
      // The shell is not an /api answer: its caching stays the browser's (the service worker owns it).
      expect(shell.headers.get('cache-control')).toBeNull();
      const asset = await app.request('/app.js');
      expect(asset.headers.get('content-security-policy')).toBeNull();
      expect(asset.headers.get('x-frame-options')).toBe('DENY');
    });
  });
});

describe('body limits', () => {
  it('refuses a push body over the limit with 413 body_too_large, before the session check', async () => {
    const app = makeApp({ bodyLimitBytes: 1024 });
    const res = await app.request('/api/sync/ops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ops: ['x'.repeat(2048)] }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: 'body_too_large' });
  });

  it('counts a streamed body with no content-length too', async () => {
    const app = makeApp({ bodyLimitBytes: 1024 });
    const chunk = new TextEncoder().encode('x'.repeat(600));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const res = await app.request('/api/sync/ops', { method: 'POST', body, duplex: 'half' } as RequestInit);
    expect(res.status).toBe(413);
  });

  it('lets a body under the limit through to the route (401 without a session)', async () => {
    const app = makeApp({ bodyLimitBytes: 1024 });
    const res = await app.request('/api/sync/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"ops":[]}' });
    expect(res.status).toBe(401);
  });

  it('leaves the file upload to its own 25 MB cap', async () => {
    const app = makeApp({ bodyLimitBytes: 1024 });
    const res = await app.request('/api/files/01a0f3a3-fc83-71ef-a9c9-c54c67d4c9bf', { method: 'PUT', body: 'x'.repeat(4096) });
    expect(res.status).toBe(401);
  });

  it('caps /api/auth/* bodies at 64 KiB', async () => {
    const app = makeApp();
    const res = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@review.test', password: 'x'.repeat(AUTH_BODY_LIMIT_BYTES) }),
    });
    expect(res.status).toBe(413);
  });
});

describe('rate limits', () => {
  const rateLimits = { signIn: { max: 3, windowMs: 60_000 }, push: { max: 2, windowMs: 60_000 }, trustProxy: true };

  it('answers 429 rate_limited with retry-after once an address is over the sign-in rule', async () => {
    const app = makeApp({ rateLimits });
    for (let i = 0; i < 3; i++) expect((await app.request('/api/auth/sign-in/email', signIn(`u${i}@review.test`, '10.0.0.1'))).status).toBe(401);
    const res = await app.request('/api/auth/sign-in/email', signIn('u9@review.test', '10.0.0.1'));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: 'rate_limited' });
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    // Another address is not held back by this one.
    expect((await app.request('/api/auth/sign-in/email', signIn('u10@review.test', '10.0.0.2'))).status).toBe(401);
  });

  it('limits an e-mail guessed from many addresses, case-insensitively', async () => {
    const app = makeApp({ rateLimits });
    for (let i = 0; i < 3; i++) expect((await app.request('/api/auth/sign-in/email', signIn('Victim@review.test', `10.0.1.${i}`))).status).toBe(401);
    expect((await app.request('/api/auth/sign-in/email', signIn('victim@review.test', '10.0.1.99'))).status).toBe(429);
  });

  it('never limits get-session, and limits nothing when the limits are off', async () => {
    const limited = makeApp({ rateLimits });
    for (let i = 0; i < 10; i++) expect((await limited.request('/api/auth/get-session')).status).toBe(401);
    const open = makeApp();
    for (let i = 0; i < 10; i++) expect((await open.request('/api/auth/sign-in/email', signIn('u@review.test', '10.0.0.1'))).status).toBe(401);
  });

  it('limits pushes per signed-in user', async () => {
    const app = makeApp({ rateLimits }, true);
    const push = () =>
      app.request('/api/sync/ops', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-contract-version': '14' },
        body: '{"ops":[]}',
      });
    expect((await push()).status).toBe(200);
    expect((await push()).status).toBe(200);
    const refused = await push();
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: 'rate_limited' });
  });

  it('opens a new window once the old one ends', () => {
    let now = 0;
    const limiter = new FixedWindowLimiter({ max: 1, windowMs: 1000 }, () => now);
    expect(limiter.consume('k').allowed).toBe(true);
    expect(limiter.consume('k')).toEqual({ allowed: false, retryAfterSeconds: 1 });
    now = 1000;
    expect(limiter.consume('k').allowed).toBe(true);
  });

  it('reads the client address from the last X-Forwarded-For entry only behind a trusted proxy', async () => {
    const app = new Hono();
    app.get('/ip/:trust', (c) => c.text(clientAddress(c, c.req.param('trust') === '1')));
    const headers = { 'x-forwarded-for': '6.6.6.6, 203.0.113.7' };
    expect(await (await app.request('/ip/1', { headers })).text()).toBe('203.0.113.7');
    expect(await (await app.request('/ip/0', { headers })).text()).toBe('unknown');
  });
});
