import { activeUser, can, userStatusSchema, type ErrorResponse, type PermissionKey, type PermissionNeed, type RoleRow, type UserStatus } from '@app/domain';
import type { Context, MiddlewareHandler } from 'hono';
import type { Auth } from '../auth/auth.ts';
import type { Db } from '../db/client.ts';
import { asCompanyId, type CompanyId } from '../db/repositories/company-id.ts';
import { roleOfUser } from '../db/roles.ts';
import { logError } from '../log.ts';

/** Resolved once per request (AD-10) and the only place a `CompanyId` is minted. */
export interface SessionContext {
  userId: string;
  companyId: CompanyId;
  /**
   * Story 26.4 (AD-29): the actor's role, the `role/{id}` row the user's kernel row names, read
   * on every request (a role change takes effect on the next one); null when none resolves, which
   * holds no key. `status` is the user's, absent read as active (`activeUser`).
   */
  role: RoleRow | null;
  status: UserStatus | undefined;
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
export function sessionMiddleware(auth: Auth, db: Db): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    let resolved: SessionContext | null = null;
    try {
      const result = await auth.api.getSession({ headers: c.req.raw.headers });
      const companyId: unknown = result?.user.companyId;
      if (result !== null && typeof companyId === 'string' && companyId !== '') {
        const tenant = asCompanyId(companyId);
        // Story 26.4: the user's role and status, from the company's own rows.
        const { user, role } = await roleOfUser(db, tenant, result.user.id);
        const status = userStatusSchema.safeParse(user?.status);
        resolved = { userId: result.user.id, companyId: tenant, role, status: status.success ? status.data : undefined };
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
  // Story 26.4 (AD-29): a user who is not active (invited, paused, removed) acts on nothing; the
  // 401 keeps the device's outbox (its re-auth path), the code says why.
  if (!activeUser(session)) throw new UserInactiveError();
  return session;
}

/**
 * Story 26.4 (AD-29): guard for a route behind a key (`permissionForRoute`): the session, or the
 * 401 of `requireSession`, or `403 forbidden` when the actor's role does not hold the key.
 */
export function requirePermission(c: Context<AppEnv>, key: PermissionKey | PermissionNeed): SessionContext {
  const session = requireSession(c);
  if (key !== 'none' && !can(session.role, key)) throw new ForbiddenError();
  return session;
}

const userInactive: ErrorResponse = {
  code: 'user_inactive',
  message: 'This user is not active.',
};

const forbidden: ErrorResponse = {
  code: 'forbidden',
  message: 'The role of this user does not allow this route.',
};

/** Story 26.4: thrown by `requireSession` for a user who is not active; `http/app.ts` answers it 401. */
export class UserInactiveError extends Error {
  constructor() {
    super(userInactive.message);
    this.name = 'UserInactiveError';
  }
}

/** Story 26.4: thrown by `requirePermission`; `http/app.ts` answers it 403. */
export class ForbiddenError extends Error {
  constructor() {
    super(forbidden.message);
    this.name = 'ForbiddenError';
  }
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

export { unauthenticated as unauthenticatedError, sessionUnavailable as sessionUnavailableError, userInactive as userInactiveError, forbidden as forbiddenError };
