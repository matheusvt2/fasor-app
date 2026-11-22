import {
  ADMIN_ROLE_ROUTES,
  adminRoleCreateRequestSchema,
  adminRoleRemoveRequestSchema,
  adminRoleRenameRequestSchema,
  adminRoleSetPermissionsRequestSchema,
  permissionForRoute,
  type ErrorResponse,
} from '@app/domain';
import { type Context, Hono } from 'hono';
import type { z } from 'zod';
import { AdminRoleError, createAdminRolesService, type AdminRoleActor, type AdminRolesDeps } from '../admin/roles.ts';
import { type AppEnv, requirePermission } from './session.ts';

/*
 * Story 26.10 (AD-29): `/api/admin/roles`, behind the session middleware. Every handler asks
 * `roles.manage` first (`permissionForRoute('admin.roles')`: 403 `forbidden`, 401 for a user who is
 * not active), then parses the body with the kernel's schema (400 `invalid_request`), then calls
 * the service and answers its refusals as `{code, message, details?}`. Every answer that succeeds
 * is the whole list of roles as it now is (`{roles}`).
 */

export type AdminRolesRouteOptions = AdminRolesDeps;

const MESSAGES: Record<string, string> = {
  role_not_found: 'No such role in this company.',
  role_name_taken: 'Another role of this company already has this name.',
  role_locked: 'This role cannot be changed this way.',
  role_in_use: 'Users still hold this role.',
  role_name_invalid: 'The role name is empty or too long.',
};

const invalid = (issues: z.ZodError['issues']): ErrorResponse => ({
  code: 'invalid_request',
  message: 'The body does not match the route.',
  details: issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
});

export function createAdminRolesRoutes(options: AdminRolesRouteOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const service = createAdminRolesService(options);

  const actorOf = (c: Context<AppEnv>): AdminRoleActor => {
    const session = requirePermission(c, permissionForRoute('admin.roles'));
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

  /** Runs the service call, answering an `AdminRoleError` as the envelope. */
  async function answer(c: Context<AppEnv>, call: () => Promise<unknown>, status: 200 | 201 = 200): Promise<Response> {
    try {
      return c.json(await call(), status);
    } catch (error) {
      if (!(error instanceof AdminRoleError)) throw error;
      const body: ErrorResponse = { code: error.code, message: MESSAGES[error.code] ?? error.code, ...(error.details === undefined ? {} : { details: error.details }) };
      return c.json(body, error.httpStatus);
    }
  }

  app.get(ADMIN_ROLE_ROUTES.list.path, async (c) => {
    const actor = actorOf(c);
    return c.json(await service.listRoles(actor));
  });

  app.patch(ADMIN_ROLE_ROUTES.set_permissions.path, async (c) => {
    const actor = actorOf(c);
    const body = await bodyOf(c, adminRoleSetPermissionsRequestSchema);
    if (!body.ok) return body.response;
    return answer(c, () => service.setPermissions(actor, body.value));
  });

  app.post(ADMIN_ROLE_ROUTES.create.path, async (c) => {
    const actor = actorOf(c);
    const body = await bodyOf(c, adminRoleCreateRequestSchema);
    if (!body.ok) return body.response;
    return answer(c, () => service.createRole(actor, body.value), 201);
  });

  app.patch(ADMIN_ROLE_ROUTES.rename.path, async (c) => {
    const actor = actorOf(c);
    const body = await bodyOf(c, adminRoleRenameRequestSchema);
    if (!body.ok) return body.response;
    return answer(c, () => service.renameRole(actor, c.req.param('id') ?? '', body.value));
  });

  app.post(ADMIN_ROLE_ROUTES.remove.path, async (c) => {
    const actor = actorOf(c);
    const body = await bodyOf(c, adminRoleRemoveRequestSchema);
    if (!body.ok) return body.response;
    return answer(c, () => service.removeRole(actor, c.req.param('id') ?? ''));
  });

  return app;
}
