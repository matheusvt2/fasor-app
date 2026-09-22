import type { ErrorResponse } from '@app/domain';
import type { Context, MiddlewareHandler } from 'hono';
import type { Auth } from '../auth/auth.ts';
import { asCompanyId, type CompanyId } from '../db/repositories/company-id.ts';

/** Resolved once per request (AD-10) and the only place a `CompanyId` is minted. */
export interface SessionContext {
  userId: string;
  companyId: CompanyId;
}

export interface AppEnv {
  Variables: { session: SessionContext | null };
}

/**
 * Reads the session cookie once per request and puts `{userId, companyId}` on the
 * context. Never rejects: public routes (health) stay public and only `requireSession`
 * answers 401.
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
    } catch {
      resolved = null;
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
 * Guard for an authenticated route: returns the session or throws the 401 response.
 * Call it as the first statement of the handler.
 */
export function requireSession(c: Context<AppEnv>): SessionContext {
  const session = c.get('session');
  if (session === null) throw new UnauthenticatedError();
  return session;
}

export class UnauthenticatedError extends Error {
  constructor() {
    super(unauthenticated.message);
    this.name = 'UnauthenticatedError';
  }
}

export { unauthenticated as unauthenticatedError };
