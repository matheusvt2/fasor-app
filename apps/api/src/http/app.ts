import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { SYNC_PUSH_MAX_BYTES, SYNC_ROUTES, TELEMETRY_ROUTE, type Clock, type ErrorResponse, type NewId } from '@app/domain';
import type { S3Client } from '@aws-sdk/client-s3';
import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { PgBoss } from 'pg-boss';
import type { Auth } from '../auth/auth.ts';
import { now as clock } from '../clock.ts';
import type { Db } from '../db/client.ts';
import { DEFAULT_DAILY_QUOTAS, type DailyQuotas } from '../db/repositories/ai-usage.ts';
import { newId as mintId } from '../ids.ts';
import type { AuditPayload } from '../jobs/audit/payload.ts';
import { enqueueAudit } from '../jobs/audit/worker.ts';
import type { GeneratePayload } from '../jobs/generate/job.ts';
import { enqueueGenerate } from '../jobs/generate/worker.ts';
import type { ReadingPayload } from '../jobs/reading/payload.ts';
import { enqueueReading } from '../jobs/reading/worker.ts';
import { log, logError } from '../log.ts';
import { stdoutSink, type TelemetrySink } from '../telemetry/sink.ts';
import { createSyncRoutes } from '../sync/routes.ts';
import { createAccountRoutes } from './account.ts';
import { createAuditRoutes } from './audit.ts';
import { createFileRoutes } from './files.ts';
import { createGenerateRoutes } from './generate.ts';
import { createHealthRoutes, type HealthProbes } from './health.ts';
import { originGuard, type OriginGuardOptions } from './origin-guard.ts';
import { createReadingRoutes } from './reading.ts';
import { createTelemetryRoutes } from './telemetry.ts';
import { pushRateLimit, signInRateLimit, type RateLimitRule } from './rate-limit.ts';
import { htmlContentSecurityPolicy, securityHeaders } from './security-headers.ts';
import { type AppEnv, sessionMiddleware, SessionUnavailableError, sessionUnavailableError, UnauthenticatedError, unauthenticatedError } from './session.ts';

// `apps/web/dist` is bind-mounted alongside the api source; api commands run
// with cwd = apps/api (pnpm --filter cds into the package), so the built web
// bundle sits one directory up, under `web/dist`.
const DEFAULT_STATIC_DIR = resolve(process.cwd(), '..', 'web', 'dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

/** The app-shell service worker (AD-8); it is the only response that gets a cache header. */
const SERVICE_WORKER_PATH = '/sw.js';

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function isApiPath(path: string): boolean {
  return path === '/api' || path.startsWith('/api/');
}

/**
 * Resolves the file to serve for a request path under `staticDir`, exported
 * so its path-traversal guard can be unit-tested directly with a raw
 * string -- bypassing the URL-parsing layer's own `..` normalization, which
 * would otherwise make the guard unreachable through `Hono`/`fetch`. Falls
 * back to `index.html` (the SPA shell) both for unknown paths and for any
 * candidate that would resolve outside `staticDir`.
 */
export async function resolveStaticTarget(staticDir: string, requestPath: string): Promise<string> {
  const indexPath = join(staticDir, 'index.html');
  const candidate = resolve(staticDir, `.${requestPath}`);
  const isInsideStaticDir = candidate === staticDir || candidate.startsWith(staticDir + sep);
  return isInsideStaticDir && (await fileExists(candidate)) ? candidate : indexPath;
}

export interface AppOptions {
  probes: HealthProbes;
  auth: Auth;
  db: Db;
  /** The object store the file routes read and write (AD-7). */
  s3: S3Client;
  bucket: string;
  /** Overridable for tests; defaults to the bind-mounted `apps/web/dist`. */
  staticDir?: string;
  /** Overridable for tests; defaults to the process clock. */
  now?: Clock;
  /** Overridable for tests; defaults to the process id minter. */
  newId?: NewId;
  /** Story 4.8: the queue the generate route sends to; absent in unit tests (the route then fails its enqueue). */
  boss?: PgBoss;
  /** Test override of the send to the queue; wins over `boss` when given. */
  enqueueGenerate?: (payload: GeneratePayload) => Promise<void>;
  /**
   * Story 8.4: test override of the send to the `reading` queue; wins over `boss`. With
   * neither, file receipt leaves a plate photo `queued` and the reread route answers 500.
   */
  enqueueReading?: (payload: ReadingPayload) => Promise<void>;
  /** Story 13.8: test override of the send to the `audit` queue; wins over `boss`. With neither, the audit route answers 500 after failing its run. */
  enqueueAudit?: (payload: AuditPayload) => Promise<void>;
  /** Story 11.8 follow-up: `config.AI_FEATURES === 'on'`; absent reads as on (every existing test). */
  aiFeatures?: boolean;
  /**
   * Security review 2026-09-30 (E11-A5): the sign-in and push limits (`rate-limit.ts`);
   * absent, no request is limited (every existing test, and the gates outside production).
   */
  rateLimits?: { signIn: RateLimitRule; push: RateLimitRule; trustProxy: boolean };
  /** The body cap of the JSON routes; absent, `DEFAULT_API_BODY_LIMIT_BYTES`. */
  bodyLimitBytes?: number;
  /**
   * Epic 18 (AD-28): where `POST /api/telemetry` writes (absent, `stdoutSink`), and its
   * per-device limit (absent, `TELEMETRY_RATE_LIMIT`; always on) with the limiter's clock.
   */
  telemetry?: { sink?: TelemetrySink; limit?: RateLimitRule; userLimit?: RateLimitRule; limitNow?: () => number };
  /**
   * Story 20.12 (security pass S6): the per-company daily ceilings of readings (rereads
   * included) and audits; absent, `DEFAULT_DAILY_QUOTAS` (400 and 30).
   */
  quotas?: DailyQuotas;
  /**
   * Story 20.13 (security pass S8): the cross-site write guard (`origin-guard.ts`). Required, so
   * every app states it: the trusted origins in production and in every test of the guard,
   * `'off'` in an in-process test that is about something else.
   */
  originGuard: OriginGuardOptions | 'off';
}

/** `config.API_BODY_LIMIT_BYTES`'s default: far above the largest push (500 ops), far below a memory exhaustion. */
export const DEFAULT_API_BODY_LIMIT_BYTES = 16 * 1024 * 1024;
/** Sign-in and get-session bodies are an e-mail and a password. */
export const AUTH_BODY_LIMIT_BYTES = 64 * 1024;
/**
 * E18-A1 (R-A7): `POST /api/telemetry` takes at most 200 events of a few hundred bytes each
 * (about 120 KB at every field's maximum), so its body is capped far below the shared limit.
 */
export const TELEMETRY_BODY_LIMIT_BYTES = 256 * 1024;

/**
 * e20e (the e20s note on Caddy): a declared `Content-Length` over the cap is answered from the
 * header alone, before anything touches `c.req.raw.body`. Hono's `bodyLimit` reads `raw.body`
 * first, which under `@hono/node-server` makes the incoming body a stream that is never drained;
 * the socket was then reset under Caddy's still-writing proxy, which relayed a 502 instead of
 * this 413. Measured without and with this check: `.scratch-e20e/caddy/check413-session.mjs`.
 * A chunked body still goes through `bodyLimit`.
 */
function bodyTooLarge(maxSize: number): MiddlewareHandler {
  const tooLarge = (c: Context) => c.json({ code: 'body_too_large', message: `The request body is over the ${maxSize} byte limit.` } satisfies ErrorResponse, 413);
  const streamed = bodyLimit({ maxSize, onError: tooLarge });
  return async (c, next) => {
    const declared = Number(c.req.header('content-length'));
    if (Number.isFinite(declared) && declared > maxSize) return tooLarge(c);
    return streamed(c, next);
  };
}

/** `PUT /api/files/:id` reads its body under its own 25 MB cap (`files.ts`), never under the JSON one. */
function isFileUpload(method: string, path: string): boolean {
  return method === 'PUT' && path.startsWith('/api/files/');
}

const notFoundBody: ErrorResponse = { code: 'not_found', message: 'No such route.' };

/**
 * Story 20.13 (security pass S7): the only better-auth endpoints the app uses. Every other path
 * under `/api/auth/` (update-user, list-sessions, revoke-other-sessions, change-password, ...)
 * answers `404 not_found` and never reaches better-auth.
 */
export const AUTH_ROUTES: ReadonlyArray<{ method: 'GET' | 'POST'; path: string }> = [
  { method: 'POST', path: '/api/auth/sign-in/email' },
  { method: 'POST', path: '/api/auth/sign-out' },
  { method: 'GET', path: '/api/auth/get-session' },
];

function isAuthRoute(method: string, path: string): boolean {
  return AUTH_ROUTES.some((route) => route.method === method && route.path === path);
}

export function createApp(options: AppOptions): Hono<AppEnv> {
  const staticDir = options.staticDir ?? DEFAULT_STATIC_DIR;
  const app = new Hono<AppEnv>();

  // Outermost after the request log: every answer carries the headers, errors included.
  app.use('*', securityHeaders());

  app.use('*', async (c, next) => {
    const start = Date.now();
    try {
      await next();
    } finally {
      log('http_request', {
        method: c.req.method,
        path: c.req.path,
        // `next()` may have thrown before a response was assigned.
        status: c.res?.status ?? 500,
        duration_ms: Date.now() - start,
        // Resolved by the session middleware for authenticated /api routes; null elsewhere.
        company_id: c.get('session')?.companyId ?? null,
        // Filled by the relatorio stream route; null elsewhere.
        relatorio_id: c.get('relatorioId') ?? null,
      });
    }
  });

  app.onError((error, c) => {
    if (error instanceof UnauthenticatedError) return c.json(unauthenticatedError, 401);
    if (error instanceof SessionUnavailableError) return c.json(sessionUnavailableError, 503);
    logError('unhandled route error', { path: c.req.path, error: String(error) });
    const body: ErrorResponse = { code: 'internal_error', message: 'Unexpected server error.' };
    return c.json(body, 500);
  });

  // Story 20.13: before any body is read and before any route, a mutating `/api` request must
  // come from a trusted origin with a JSON body (`origin-guard.ts`).
  if (options.originGuard !== 'off') app.use('/api/*', originGuard(options.originGuard));

  // better-auth owns /api/auth/*: sign-in, sign-out and get-session, and nothing else
  // (Story 20.13, `AUTH_ROUTES`). Sign-up is refused by the emailAndPassword config too.
  app.use('/api/auth/*', bodyTooLarge(AUTH_BODY_LIMIT_BYTES));
  const jsonBodyLimit = bodyTooLarge(options.bodyLimitBytes ?? DEFAULT_API_BODY_LIMIT_BYTES);
  const telemetryBodyLimit = bodyTooLarge(TELEMETRY_BODY_LIMIT_BYTES);
  // e20e (the e20s note on Caddy): the push's 4 MiB cap is also checked here, before the
  // session read. Answered after it, the unread body was cut and Caddy relayed a 502 instead
  // of this JSON 413 (`.scratch-e20e/caddy/check413-session.mjs`); the route keeps its own cap.
  const pushBodyLimit = bodyTooLarge(Math.min(options.bodyLimitBytes ?? DEFAULT_API_BODY_LIMIT_BYTES, SYNC_PUSH_MAX_BYTES));
  app.use('/api/*', async (c, next) => {
    if (c.req.path.startsWith('/api/auth/') || isFileUpload(c.req.method, c.req.path)) return next();
    if (c.req.path === TELEMETRY_ROUTE.path) return telemetryBodyLimit(c, next);
    if (c.req.method === SYNC_ROUTES.pushOps.method && c.req.path === SYNC_ROUTES.pushOps.path) return pushBodyLimit(c, next);
    return jsonBodyLimit(c, next);
  });
  const limits = options.rateLimits;
  if (limits !== undefined) app.use('/api/auth/sign-in/*', signInRateLimit({ rule: limits.signIn, trustProxy: limits.trustProxy }));
  app.on(['GET', 'POST'], '/api/auth/*', (c) => (isAuthRoute(c.req.method, c.req.path) ? options.auth.handler(c.req.raw) : c.json(notFoundBody, 404)));

  app.route('/', createHealthRoutes(options.probes));

  app.use('/api/*', sessionMiddleware(options.auth));
  if (limits !== undefined) app.use('/api/sync/ops', pushRateLimit({ rule: limits.push }));
  const aiFeatures = options.aiFeatures ?? true;
  const quotas = options.quotas ?? DEFAULT_DAILY_QUOTAS;
  app.route('/', createAccountRoutes(options.db, { aiFeatures }));
  const boss = options.boss;
  const sendReading =
    options.enqueueReading ?? (boss === undefined ? undefined : (payload: ReadingPayload) => enqueueReading(boss, payload));
  // Story 9.2: a push that re-targets an uploaded photo's reading sends it.
  app.route(
    '/',
    createSyncRoutes(options.db, {
      now: options.now ?? clock,
      newId: options.newId ?? mintId,
      ...(sendReading === undefined ? {} : { enqueueReading: sendReading }),
      aiFeatures,
      readingDailyQuota: quotas.readings,
    }),
  );
  // AD-7: mounted after the sync routes so it sits behind the same `/api/*` session
  // middleware; every handler resolves its company from the session (AD-10).
  app.route(
    '/',
    createFileRoutes(options.db, options.s3, options.bucket, {
      now: options.now ?? clock,
      ...(sendReading === undefined ? {} : { enqueueReading: sendReading }),
      aiFeatures,
      readingDailyQuota: quotas.readings,
    }),
  );
  // Story 8.4: the reread route, behind the same session middleware.
  app.route(
    '/',
    createReadingRoutes(options.db, {
      now: options.now ?? clock,
      newId: options.newId ?? mintId,
      ...(sendReading === undefined ? {} : { enqueueReading: sendReading }),
      aiFeatures,
      readingDailyQuota: quotas.readings,
    }),
  );
  // AD-15: the generate barrier and the revision download, behind the same session middleware.
  const enqueue = options.enqueueGenerate ?? (boss === undefined ? undefined : (payload: GeneratePayload) => enqueueGenerate(boss, payload));
  app.route(
    '/',
    createGenerateRoutes(options.db, options.s3, options.bucket, {
      now: options.now ?? clock,
      newId: options.newId ?? mintId,
      ...(enqueue === undefined ? {} : { enqueue }),
    }),
  );

  // Story 13.8: the emission audit, behind the same session middleware and barrier.
  const sendAudit = options.enqueueAudit ?? (boss === undefined ? undefined : (payload: AuditPayload) => enqueueAudit(boss, payload));
  app.route(
    '/',
    createAuditRoutes(options.db, {
      now: options.now ?? clock,
      newId: options.newId ?? mintId,
      ...(sendAudit === undefined ? {} : { enqueue: sendAudit }),
      aiFeatures,
      dailyQuota: quotas.audits,
    }),
  );

  // Epic 18 (AD-28): usage events, behind the same session middleware; never an op.
  app.route(
    '/',
    createTelemetryRoutes({
      sink: options.telemetry?.sink ?? stdoutSink,
      now: options.now ?? clock,
      ...(options.telemetry?.limit === undefined ? {} : { limit: options.telemetry.limit }),
      ...(options.telemetry?.userLimit === undefined ? {} : { userLimit: options.telemetry.userLimit }),
      ...(options.telemetry?.limitNow === undefined ? {} : { limitNow: options.telemetry.limitNow }),
    }),
  );

  // Every /api answer, including "no such route", is the ErrorResponse envelope.
  app.notFound((c) =>
    isApiPath(c.req.path) ? c.json(notFoundBody, 404) : c.text('Not found', 404),
  );

  // Static bundle serving + SPA fallback. Re-checked per request (not once
  // at app-creation time) so building `apps/web/dist` after the api
  // container has already started is picked up without a restart, and so
  // an interrupted/partial build (dist present, index.html missing) still
  // 404s gracefully instead of the SPA fallback throwing on a missing file.
  app.get('*', async (c) => {
    if (isApiPath(c.req.path)) return c.notFound();

    const indexPath = join(staticDir, 'index.html');
    if (!(await fileExists(indexPath))) return c.notFound();

    const target = await resolveStaticTarget(staticDir, c.req.path);
    const body = await readFile(target);
    const contentType = MIME_TYPES[extname(target)] ?? 'application/octet-stream';
    return c.body(body, 200, {
      'content-type': contentType,
      // Security review 2026-09-30: the shell's own policy, its inline theme script hashed.
      ...(extname(target) === '.html' ? { 'content-security-policy': htmlContentSecurityPolicy(body.toString('utf8')) } : {}),
      // AD-8: the shell activates a new version on the next launch, which only happens
      // if the browser notices there is one. A cached worker script would pin the old
      // shell; every other response keeps its default caching.
      ...(c.req.path === SERVICE_WORKER_PATH ? { 'cache-control': 'no-cache' } : {}),
    });
  });

  return app;
}
