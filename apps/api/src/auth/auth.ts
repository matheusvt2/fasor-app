import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordLinkAllowed,
  passwordResetEmail,
  PRODUTO,
  RESET_LINK_HOURS,
  setPasswordLink,
  userStatusPath,
  userStatusSchema,
} from '@app/domain';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { and, eq } from 'drizzle-orm';
import { PASSWORD_LINK_PREFIX, purgePasswordLinks } from '../admin/password-links.ts';
import { now } from '../clock.ts';
import type { Db } from '../db/client.ts';
import { asCompanyId, type CompanyId } from '../db/repositories/company-id.ts';
import { roleOp } from '../db/roles.ts';
import { entities, schema, user, verification } from '../db/schema.ts';
import { runEmailTask } from '../email/background.ts';
import { createFakeEmailProvider } from '../email/fake.ts';
import type { EmailProvider } from '../email/types.ts';
import { logError } from '../log.ts';
import { applyServerBatch, type Tx } from '../sync/apply.ts';

/**
 * Story 26.4 (AD-29): the statuses whose sign-in is refused. The kernel row's status is read
 * here, in the hook that creates the session, so no session is ever born for such a user.
 */
const SIGN_IN_REFUSED_STATUSES: ReadonlySet<unknown> = new Set(['paused', 'removed']);

/** 30-day sliding session (AD-9). */
export const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30;
/**
 * The cookie is refreshed on use once a day, which is what makes the 30 days sliding. Exported
 * (2026-11-22, e26r) for `http/session.ts`, which looks a session up without the refresh and asks
 * for it only when the user is active and the day elapsed.
 */
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

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
  /**
   * Story 26.6: where the reset e-mail of "Esqueci minha senha" goes. Absent, the `fake` provider
   * over `db` (every test that does not care); `main.ts` passes the one `EMAIL_PROVIDER` names.
   */
  email?: EmailProvider | undefined;
}

/** The kernel row of a user, read in the user's company (null when none). */
async function kernelUserOf(reader: Db | Tx, companyId: string, userId: string): Promise<{ name?: unknown; status?: unknown } | null> {
  const [kernel] = await reader
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'user'), eq(entities.id, userId)))
    .limit(1);
  return (kernel?.row as { name?: unknown; status?: unknown } | undefined) ?? null;
}

/** The kernel status of a row, absent or unreadable read as absent. */
const statusOf = (row: { status?: unknown } | null) => {
  const parsed = userStatusSchema.safeParse(row?.status);
  return parsed.success ? parsed.data : undefined;
};

/** Thrown under the company lock when the user is no longer `invited` (another sign-in activated him). */
class AlreadyActivated extends Error {}

/**
 * Story 26.8: an invited user who signs in (he set a password through his invitation) becomes
 * `active`, written as the server-only `user/{id}/status` put, decided again under the company lock
 * so two sign-ins at once write one put.
 */
async function activateInvited(db: Db, companyId: CompanyId, userId: string): Promise<void> {
  try {
    await applyServerBatch(db, companyId, [roleOp(companyId, { kind: 'put', path: userStatusPath(userId), value: 'active' })], {
      now,
      before: async (tx: Tx) => {
        if (statusOf(await kernelUserOf(tx, companyId, userId)) !== 'invited') throw new AlreadyActivated();
      },
    });
  } catch (error) {
    if (error instanceof AlreadyActivated) return;
    throw error;
  }
}

/**
 * Story 26.6: `emailAndPassword.sendResetPassword`, run by better-auth after it stored the link row of
 * `POST /api/auth/request-password-reset` (in the background, `advanced.backgroundTasks`). A paused
 * or removed user gets nothing and the row is dropped; anyone else loses his older links (an
 * invitation's included), the row gets his company, and the reset e-mail leaves. A provider error is
 * logged without the address and swallowed: the answer was already the same sentence for everyone.
 */
async function sendReset(options: AuthOptions, email: EmailProvider, origin: string, input: { user: { id: string; name: string; email: string }; token: string }): Promise<void> {
  const [identity] = await options.db.select({ companyId: user.companyId }).from(user).where(eq(user.id, input.user.id)).limit(1);
  if (identity === undefined) return;
  const kernel = await kernelUserOf(options.db, identity.companyId, input.user.id);
  if (!passwordLinkAllowed({ status: statusOf(kernel) })) {
    await purgePasswordLinks(options.db, input.user.id);
    return;
  }
  await purgePasswordLinks(options.db, input.user.id, input.token);
  await options.db
    .update(verification)
    .set({ companyId: identity.companyId })
    .where(eq(verification.identifier, `${PASSWORD_LINK_PREFIX}${input.token}`));
  const name = typeof kernel?.name === 'string' && kernel.name !== '' ? kernel.name : input.user.name;
  const content = passwordResetEmail({ name, link: setPasswordLink(origin, input.token) });
  try {
    await email.send({ to: input.user.email, ...content, purpose: 'reset' });
  } catch (error) {
    logError('password reset e-mail failed', { company_id: identity.companyId, error: error instanceof Error ? error.name : 'unknown' });
  }
}

/**
 * Email + password at /api/auth/* with sign-up disabled: accounts are provisioned by
 * `scripts/seed-users.ts`, there is no signup route and no outbound e-mail (AD-9, FR-6).
 * *(2026-11-21, Story 26.6: the Admin's routes provision users too, and the password reset by
 * e-mail is open: `sendResetPassword`, the links of `admin/password-links.ts`.)*
 *
 * `useSecureCookies: false` only means "do not add the __Secure- cookie-name prefix";
 * `defaultCookieAttributes` still sets `Secure`, so the cookie is httpOnly,
 * SameSite=Lax and Secure as the spine requires while the local stack is plain http
 * (Chromium treats localhost as a secure context). Story 1.7 puts it behind HTTPS.
 */
export function createAuth(options: AuthOptions) {
  const baseURL = options.baseURL ?? options.trustedOrigins[0];
  if (baseURL === undefined) throw new Error('auth needs AUTH_BASE_URL or one trusted origin');
  const email = options.email ?? createFakeEmailProvider(options.db);
  return betterAuth({
    appName: PRODUTO,
    baseURL,
    basePath: '/api/auth',
    secret: options.secret,
    trustedOrigins: options.trustedOrigins,
    database: drizzleAdapter(options.db, { provider: 'pg', schema, usePlural: false }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      autoSignIn: false,
      // Story 26.6: the rule of today's seed, named by the kernel.
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      // Story 26.6: "Esqueci minha senha" stores a 1-hour link and sends the reset e-mail; setting a
      // password ends every session of the user (coordinator's reading of Story 26.6).
      resetPasswordTokenExpiresIn: RESET_LINK_HOURS * 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: (input) => sendReset(options, email, baseURL, input),
    },
    telemetry: { enabled: false },
    advanced: {
      // Story 26.6: the reset e-mail leaves after the answer, so its time says nothing of the address.
      backgroundTasks: { handler: runEmailTask },
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
            // Story 26.4 (AD-29): a paused or removed user does not sign in; the code is the one
            // every other request of such a user answers (`user_inactive`), so the Login can name it.
            const [kernel] = await options.db
              .select({ row: entities.row })
              .from(entities)
              .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'user'), eq(entities.id, createdSession.userId)))
              .limit(1);
            if (SIGN_IN_REFUSED_STATUSES.has((kernel?.row as { status?: unknown } | undefined)?.status)) {
              throw new APIError('UNAUTHORIZED', { code: 'user_inactive', message: 'This user is not active.' });
            }
            // Story 26.8: an invited user's first sign-in makes him active before his session exists.
            if ((kernel?.row as { status?: unknown } | undefined)?.status === 'invited') {
              await activateInvited(options.db, asCompanyId(companyId), createdSession.userId);
            }
            return { data: { ...createdSession, companyId } };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
