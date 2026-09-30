import type { ErrorResponse } from '@app/domain';
import type { Context, MiddlewareHandler } from 'hono';
import type { Auth } from '../auth/auth.ts';
import { asCompanyId, type CompanyId } from '../db/repositories/company-id.ts';
import { logError } from '../log.ts';

/** Resolved once per request (AD-10) and the only place a `CompanyId` is minted. */
export interface SessionContext {
  userId: string;
  companyId: CompanyId;
}

export interface AppEnv {
  Variables: {
    session: SessionContext | null;
    /** Set by the relatorio stream route so the request log carries `relatorio_id` (NFR-18). */
    relatorioId?: string;
    /**
     * A-13 (review 2026-09-30): true when the session lookup itself threw (the auth
     * database down), so `requireSession` answers a retriable 503 instead of a 401.
     */
    sessionUnavailable?: boolean;
  };
}

/**
 * Reads the session cookie once per request and puts `{userId, companyId}` on the
 * context. Never rejects: public routes (health) stay public and only `requireSession`
 * answers. A lookup that throws (the auth database down) is logged once and recorded on
 * the context, so a protected route answers 503 and the device retries, rather than 401
 * on every device, which would read as "signed out" (A-13).
 */
export function sessionMiddleware(auth: Auth): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    let resolved: SessionContext | null = null;
    try {
      const result = await auth.api.getSession({ headers: c.req.raw.headers });
      const companyId: unknown = result?.user.companyId;
      if (result !== null && typeof companyId === 'string' && companyId !== '') {
        resolved = { userId: result.user.id, companyId: asCompanyId(companyId) };
      }
    } catch (error) {
      logError('session lookup failed', { path: c.req.path, error: String(error) });
      c.set('sessionUnavailable', true);
    }
    c.set('session', resolved);
    await next();
  };
}

const unauthenticated: ErrorResponse = {
  code: 'unauthenticated',
  message: 'Sign in is required for this route.',
};

/**
 * A-13: the session could not be checked (the lookup threw). No new error code: the web
 * treats any status of 500 and above as "retry" (`apps/web/src/sync/policy.ts`), and the
 * contract's codes are the kernel's to add.
 */
const sessionUnavailable: ErrorResponse = {
  code: 'internal_error',
  message: 'The session could not be checked; retry.',
};

/**
 * Guard for an authenticated route: returns the session or throws the 401 response (the
 * 503 one when the session lookup itself failed). Call it as the first statement of the
 * handler.
 */
export function requireSession(c: Context<AppEnv>): SessionContext {
  const session = c.get('session');
  if (session === null) throw c.get('sessionUnavailable') === true ? new SessionUnavailableError() : new UnauthenticatedError();
  return session;
}

export class UnauthenticatedError extends Error {
  constructor() {
    super(unauthenticated.message);
    this.name = 'UnauthenticatedError';
  }
}

/** A-13: thrown by `requireSession` when the session lookup threw; `http/app.ts` answers it 503. */
export class SessionUnavailableError extends Error {
  constructor() {
    super(sessionUnavailable.message);
    this.name = 'SessionUnavailableError';
  }
}

export { unauthenticated as unauthenticatedError, sessionUnavailable as sessionUnavailableError };
