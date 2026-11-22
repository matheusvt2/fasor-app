import {
  ADMIN_USER_ROUTES,
  adminUserListResponseSchema,
  adminUserResponseSchema,
  adminUserRoutePath,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  errorResponseSchema,
  type AdminUserCreateRequest,
  type AdminUserEditRequest,
  type AdminUserReactivateRequest,
  type AdminUserResponse,
  type AdminUserView,
} from '@app/domain';

/*
 * Story 26.9 (AD-29): the network side of the Usuários screen, here because only
 * `src/{sync,files,api}` may call `fetch` (AR-1). The Admin's routes of Story 26.8
 * (`packages/domain/src/contract/admin-users.ts`): online only, the server is the authority. Every
 * call resolves to a result, never rejects: `offline` is a request that never got an answer,
 * `server` an answer the screen cannot read (a 5xx, a body that is not the contract's), `refused`
 * the contract's error envelope with its code (409 `user_email_taken`, `last_admin`, ...).
 */

export type AdminUsersFailure =
  | { kind: 'offline' }
  | { kind: 'server'; status: number }
  | { kind: 'refused'; status: number; code: string; details?: unknown };

export type AdminUsersResult<T> = { ok: true; value: T } | { ok: false; failure: AdminUsersFailure };

/** The action routes, each a POST with the body `{}`. */
export type AdminUserActionRoute = 'pause' | 'reactivate' | 'remove' | 'resend_invitation' | 'send_reset';

async function call<T>(method: string, path: string, body: unknown, read: (json: unknown) => T): Promise<AdminUsersResult<T>> {
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
    return { ok: false, failure: { kind: 'offline' } };
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (response.ok) {
    try {
      return { ok: true, value: read(json) };
    } catch {
      return { ok: false, failure: { kind: 'server', status: response.status } };
    }
  }
  const envelope = errorResponseSchema.safeParse(json);
  if (envelope.success) {
    return {
      ok: false,
      failure: { kind: 'refused', status: response.status, code: envelope.data.code, ...(envelope.data.details === undefined ? {} : { details: envelope.data.details }) },
    };
  }
  // A 429 from a limiter in front of the route still says what it is.
  if (response.status === 429) return { ok: false, failure: { kind: 'refused', status: 429, code: 'rate_limited' } };
  return { ok: false, failure: { kind: 'server', status: response.status } };
}

/** `GET /api/admin/users`: the company's users, removed ones included. */
export function listAdminUsers(): Promise<AdminUsersResult<AdminUserView[]>> {
  const route = ADMIN_USER_ROUTES.list;
  return call(route.method, adminUserRoutePath('list'), undefined, (json) => adminUserListResponseSchema.parse(json).users);
}

/** `POST /api/admin/users`: the user is born invited with the role, and the invitation leaves. */
export function createAdminUser(body: AdminUserCreateRequest): Promise<AdminUsersResult<AdminUserResponse>> {
  const route = ADMIN_USER_ROUTES.create;
  return call(route.method, adminUserRoutePath('create'), body, (json) => adminUserResponseSchema.parse(json));
}

/** `PATCH /api/admin/users/:id`: the name, the role or both. */
export function editAdminUser(userId: string, body: AdminUserEditRequest): Promise<AdminUsersResult<AdminUserResponse>> {
  const route = ADMIN_USER_ROUTES.edit;
  return call(route.method, adminUserRoutePath('edit', userId), body, (json) => adminUserResponseSchema.parse(json));
}

/**
 * `POST /api/admin/users/:id/{pause|reactivate|remove|resend-invitation|password-reset}` with `{}`;
 * `reactivate` may carry a `role_id` (2026-11-22, e26s), the role the user comes back with.
 */
export function adminUserAction(action: AdminUserActionRoute, userId: string, body: AdminUserReactivateRequest = {}): Promise<AdminUsersResult<AdminUserResponse>> {
  const route = ADMIN_USER_ROUTES[action];
  return call(route.method, adminUserRoutePath(action, userId), body, (json) => adminUserResponseSchema.parse(json));
}
