import type { ErrorResponse } from '@app/domain';
import { Hono } from 'hono';
import type { Auth } from '../auth/auth.ts';
import type { Database } from '../db/client.ts';
import { createAccountRoutes } from './account.ts';
import { createHealthRoutes, type HealthProbes } from './health.ts';
import { type AppEnv, sessionMiddleware, UnauthenticatedError, unauthenticatedError } from './session.ts';

export interface AppOptions {
  probes: HealthProbes;
  auth: Auth;
  db: Database;
}

export function createApp(options: AppOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.notFound((c) => {
    const body: ErrorResponse = { code: 'not_found', message: 'No such route.' };
    return c.json(body, 404);
  });

  app.onError((error, c) => {
    if (error instanceof UnauthenticatedError) return c.json(unauthenticatedError, 401);
    console.error(JSON.stringify({ msg: 'unhandled route error', error: String(error) }));
    const body: ErrorResponse = { code: 'internal_error', message: 'Unexpected server error.' };
    return c.json(body, 500);
  });

  // better-auth owns /api/auth/*: sign-in, sign-out and get-session. Sign-up is refused
  // by the emailAndPassword config, not by a route that is missing here.
  app.on(['GET', 'POST'], '/api/auth/*', (c) => options.auth.handler(c.req.raw));

  app.route('/', createHealthRoutes(options.probes));

  app.use('/api/*', sessionMiddleware(options.auth));
  app.route('/', createAccountRoutes(options.db));

  return app;
}
