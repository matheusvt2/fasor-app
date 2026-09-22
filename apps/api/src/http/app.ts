import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import type { ErrorResponse } from '@app/domain';
import { Hono } from 'hono';
import type { Auth } from '../auth/auth.ts';
import type { Db } from '../db/client.ts';
import { log, logError } from '../log.ts';
import { createAccountRoutes } from './account.ts';
import { createHealthRoutes, type HealthProbes } from './health.ts';
import { type AppEnv, sessionMiddleware, UnauthenticatedError, unauthenticatedError } from './session.ts';

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
  /** Overridable for tests; defaults to the bind-mounted `apps/web/dist`. */
  staticDir?: string;
}

const notFoundBody: ErrorResponse = { code: 'not_found', message: 'No such route.' };

export function createApp(options: AppOptions): Hono<AppEnv> {
  const staticDir = options.staticDir ?? DEFAULT_STATIC_DIR;
  const app = new Hono<AppEnv>();

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
        relatorio_id: null,
      });
    }
  });

  app.onError((error, c) => {
    if (error instanceof UnauthenticatedError) return c.json(unauthenticatedError, 401);
    logError('unhandled route error', { path: c.req.path, error: String(error) });
    const body: ErrorResponse = { code: 'internal_error', message: 'Unexpected server error.' };
    return c.json(body, 500);
  });

  // better-auth owns /api/auth/*: sign-in, sign-out and get-session. Sign-up is refused
  // by the emailAndPassword config, not by a route that is missing here.
  app.on(['GET', 'POST'], '/api/auth/*', (c) => options.auth.handler(c.req.raw));

  app.route('/', createHealthRoutes(options.probes));

  app.use('/api/*', sessionMiddleware(options.auth));
  app.route('/', createAccountRoutes(options.db));

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
    return c.body(body, 200, { 'content-type': contentType });
  });

  return app;
}
