import {
  ADMIN_ROLE_ROUTES,
  adminRoleListResponseSchema,
  adminRoleRoutePath,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  errorResponseSchema,
  type AdminRoleView,
  type ErrorCode,
  type PermissionKey,
} from '@app/domain';

/*
 * Story 26.10 (AD-29): the network side of Papéis e permissões, here because only
 * `src/{sync,files,api}` may call `fetch` (AR-1). Online only: the grid reads the list route (the
 * counts of users live only on the server) and every write answers the whole list as it now is.
 * A refusal comes back as `{code, details}` for the surface to say with the kernel's sentence;
 * a request that never completed is `network`.
 */

export type AdminRolesResult = { ok: true; roles: AdminRoleView[] } | { ok: false; code: ErrorCode | 'network'; status: number; details?: unknown };

async function call(method: string, path: string, body?: unknown): Promise<AdminRolesResult> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    return { ok: false, code: 'network', status: 0 };
  }
  const json: unknown = await response.json().catch(() => null);
  if (response.ok) {
    const parsed = adminRoleListResponseSchema.safeParse(json);
    return parsed.success ? { ok: true, roles: parsed.data.roles } : { ok: false, code: 'internal_error', status: response.status };
  }
  const error = errorResponseSchema.safeParse(json);
  if (!error.success) return { ok: false, code: 'internal_error', status: response.status };
  return { ok: false, code: error.data.code, status: response.status, ...(error.data.details === undefined ? {} : { details: error.data.details }) };
}

/** `GET /api/admin/roles`: the company's live roles in the grid's column order. */
export function listRoles(): Promise<AdminRolesResult> {
  return call(ADMIN_ROLE_ROUTES.list.method, ADMIN_ROLE_ROUTES.list.path);
}

/** `PATCH /api/admin/roles`: the grid's one save, only the changed roles, each with its whole set. */
export function saveRolePermissions(roles: ReadonlyArray<{ id: string; permissions: readonly PermissionKey[] }>): Promise<AdminRolesResult> {
  return call(ADMIN_ROLE_ROUTES.set_permissions.method, ADMIN_ROLE_ROUTES.set_permissions.path, { roles });
}

/** `POST /api/admin/roles`: a new role, born with "Ver relatórios". */
export function createRole(name: string): Promise<AdminRolesResult> {
  return call(ADMIN_ROLE_ROUTES.create.method, ADMIN_ROLE_ROUTES.create.path, { name });
}

/** `PATCH /api/admin/roles/:id`: a custom role's new name. */
export function renameRole(id: string, name: string): Promise<AdminRolesResult> {
  return call(ADMIN_ROLE_ROUTES.rename.method, adminRoleRoutePath('rename', id), { name });
}

/** `POST /api/admin/roles/:id/remove`. */
export function removeRole(id: string): Promise<AdminRolesResult> {
  return call(ADMIN_ROLE_ROUTES.remove.method, adminRoleRoutePath('remove', id), {});
}
