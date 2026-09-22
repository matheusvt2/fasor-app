import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { schema, user } from '../db/schema.ts';

/** 30-day sliding session (AD-9). */
export const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30;
/** The cookie is refreshed on use once a day, which is what makes the 30 days sliding. */
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

export interface AuthOptions {
  db: Db;
  secret: string;
  /**
   * The origin better-auth considers its own (AUTH_BASE_URL). Pinned, never derived
   * from the request's Host header, so the trusted-origin allowlist cannot float with
   * whatever Host a client sends. Defaults to the first trusted origin.
   */
  baseURL?: string | undefined;
  /** Origins allowed to post to /api/auth/*; wildcards such as `http://localhost:*` are accepted. */
  trustedOrigins: string[];
}

/**
 * Email + password at /api/auth/* with sign-up disabled: accounts are provisioned by
 * `scripts/seed-users.ts`, there is no signup route and no outbound e-mail (AD-9, FR-6).
 *
 * `useSecureCookies: false` only means "do not add the __Secure- cookie-name prefix";
 * `defaultCookieAttributes` still sets `Secure`, so the cookie is httpOnly,
 * SameSite=Lax and Secure as the spine requires while the local stack is plain http
 * (Chromium treats localhost as a secure context). Story 1.7 puts it behind HTTPS.
 */
export function createAuth(options: AuthOptions) {
  const baseURL = options.baseURL ?? options.trustedOrigins[0];
  if (baseURL === undefined) throw new Error('auth needs AUTH_BASE_URL or one trusted origin');
  return betterAuth({
    appName: 'PRODUTO',
    baseURL,
    basePath: '/api/auth',
    secret: options.secret,
    trustedOrigins: options.trustedOrigins,
    database: drizzleAdapter(options.db, { provider: 'pg', schema, usePlural: false }),
    emailAndPassword: { enabled: true, disableSignUp: true, autoSignIn: false },
    telemetry: { enabled: false },
    advanced: {
      useSecureCookies: false,
      cookiePrefix: 'releng',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: true, path: '/' },
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      additionalFields: {
        companyId: { type: 'string', required: false, input: false },
      },
    },
    user: {
      additionalFields: {
        companyId: { type: 'string', required: true, input: false },
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Stamp the tenant on the session row so every table carries company_id (AD-10).
          before: async (createdSession) => {
            const rows = await options.db
              .select({ companyId: user.companyId })
              .from(user)
              .where(eq(user.id, createdSession.userId))
              .limit(1);
            const companyId = rows[0]?.companyId;
            if (companyId === undefined) return;
            return { data: { ...createdSession, companyId } };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
