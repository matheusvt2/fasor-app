import {
  ADMIN_USER_ROUTES,
  adminUserActionRequestSchema,
  adminUserReactivateRequestSchema,
  adminUserCreateRequestSchema,
  adminUserEditRequestSchema,
  permissionForRoute,
  type ErrorResponse,
} from '@app/domain';
import { type Context, Hono } from 'hono';
import type { z } from 'zod';
import { AdminUserError, createAdminUsersService, type AdminActor, type AdminUsersDeps } from '../admin/users.ts';
import { FixedWindowLimiter, tooMany, type RateLimitRule } from './rate-limit.ts';
import { type AppEnv, requirePermission } from './session.ts';

/*
 * Story 26.8 (AD-29): `/api/admin/users`, behind the session middleware. Every handler asks
 * `users.manage` first (`permissionForRoute('admin.users')`: 403 `forbidden`, 401 for a user who is
 * not active), then the shared limit of the three e-mail routes (create, resend-invitation,
 * password-reset, per Admin), then parses the body with the kernel's schema (400
 * `invalid_request`), then calls the service and answers its refusals as `{code, message, details?}`.
 */

export interface AdminUsersRouteOptions extends AdminUsersDeps {
  /** The create, resend-invitation and password-reset routes, together, per Admin. */
  emailLimit: RateLimitRule;
  limitNow?: () => number;
}

const MESSAGES: Record<string, string> = {
  user_not_found: 'No such user in this company.',
  user_email_taken: 'This e-mail already belongs to a user.',
  last_admin: 'The company would be left with no active Admin.',
  role_not_found: 'No such role in this company.',
  user_state_invalid: 'This action does not apply to the user in his status.',
};

const invalid = (issues: z.ZodError['issues']): ErrorResponse => ({
  code: 'invalid_request',
  message: 'The body does not match the route.',
  details: issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
});

export function createAdminUsersRoutes(options: AdminUsersRouteOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const service = createAdminUsersService(options);
  const emailLimiter = new FixedWindowLimiter(options.emailLimit, options.limitNow);

  const actorOf = (c: Context<AppEnv>): AdminActor => {
    const session = requirePermission(c, permissionForRoute('admin.users'));
    return { userId: session.userId, companyId: session.companyId };
  };

  /** The body parsed with `schema`, or null after answering 400 (a body that is not JSON included). */
  async function bodyOf<T>(c: Context<AppEnv>, schema: z.ZodType<T>): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return { ok: false, response: c.json({ code: 'invalid_request', message: 'The body is not JSON.' } satisfies ErrorResponse, 400) };
    }
    const parsed = schema.safeParse(raw);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, response: c.json(invalid(parsed.error.issues), 400) };
  }

  /** Runs the service call, answering an `AdminUserError` as the envelope. */
  async function answer(c: Context<AppEnv>, call: () => Promise<unknown>, status: 200 | 201 = 200): Promise<Response> {
    try {
      return c.json(await call(), status);
    } catch (error) {
      if (!(error instanceof AdminUserError)) throw error;
      const body: ErrorResponse = { code: error.code, message: MESSAGES[error.code] ?? error.code, ...(error.details === undefined ? {} : { details: error.details }) };
      return c.json(body, error.httpStatus);
    }
  }

  /** The shared limit of the e-mail routes, per Admin; a Response when over it. */
  const overEmailLimit = (c: Context<AppEnv>, actor: AdminActor): Response | null => {
    const decision = emailLimiter.consume(actor.userId);
    return decision.allowed ? null : tooMany(c, decision.retryAfterSeconds);
  };

  app.get(ADMIN_USER_ROUTES.list.path, async (c) => {
    const actor = actorOf(c);
    return c.json({ users: await service.listUsers(actor) });
  });

  app.post(ADMIN_USER_ROUTES.create.path, async (c) => {
    const actor = actorOf(c);
    const limited = overEmailLimit(c, actor);
    if (limited !== null) return limited;
    const body = await bodyOf(c, adminUserCreateRequestSchema);
    if (!body.ok) return body.response;
    return answer(c, () => service.createUser(actor, body.value), 201);
  });

  app.patch(ADMIN_USER_ROUTES.edit.path, async (c) => {
    const actor = actorOf(c);
    const body = await bodyOf(c, adminUserEditRequestSchema);
    if (!body.ok) return body.response;
    return answer(c, () => service.editUser(actor, c.req.param('id'), body.value));
  });

  const action = (path: string, call: (actor: AdminActor, id: string) => Promise<unknown>, limited = false) =>
    app.post(path, async (c) => {
      const actor = actorOf(c);
      if (limited) {
        const over = overEmailLimit(c, actor);
        if (over !== null) return over;
      }
      const body = await bodyOf(c, adminUserActionRequestSchema);
      if (!body.ok) return body.response;
      return answer(c, () => call(actor, c.req.param('id') ?? ''));
    });

  action(ADMIN_USER_ROUTES.pause.path, service.pauseUser);
  // Reactivate takes an optional `role_id` (2026-11-22, e26s): the role change and the status change are one batch.
  app.post(ADMIN_USER_ROUTES.reactivate.path, async (c) => {
    const actor = actorOf(c);
    const body = await bodyOf(c, adminUserReactivateRequestSchema);
    if (!body.ok) return body.response;
    return answer(c, () => service.reactivateUser(actor, c.req.param('id') ?? '', body.value));
  });
  action(ADMIN_USER_ROUTES.remove.path, service.removeUser);
  action(ADMIN_USER_ROUTES.resend_invitation.path, service.resendInvitation, true);
  action(ADMIN_USER_ROUTES.send_reset.path, service.sendPasswordReset, true);

  return app;
}
