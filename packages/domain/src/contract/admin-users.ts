import { z } from 'zod';
import { isoTimestampSchema } from '../clock.ts';
import { uuidV7Schema } from '../ids.ts';
import { userStatusSchema } from '../permissions/user.ts';

/*
 * Story 26.8 (2026-11-21, AD-29): the Admin's user routes. Online only, every one behind
 * `users.manage` (`permissionForRoute('admin.users')`), every one inside the caller's company. A
 * state change is written by the server as ops (`user/{id}` create and `user/{id}/name` as
 * `system:identity`, `user/{id}/role_id` and `user/{id}/status` as `system:admin`), so a device
 * sees it through the company pull like any other row. No op shape changes here, so no contract
 * number moves. Every POST takes a JSON body (`{}` for the actions), as the origin guard asks.
 */

/** A route of the Admin's: method and path, `:id` naming the user. */
export interface AdminUserRoute {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
}

export const ADMIN_USER_ROUTES = {
  list: { method: 'GET', path: '/api/admin/users' },
  create: { method: 'POST', path: '/api/admin/users' },
  edit: { method: 'PATCH', path: '/api/admin/users/:id' },
  pause: { method: 'POST', path: '/api/admin/users/:id/pause' },
  reactivate: { method: 'POST', path: '/api/admin/users/:id/reactivate' },
  remove: { method: 'POST', path: '/api/admin/users/:id/remove' },
  resend_invitation: { method: 'POST', path: '/api/admin/users/:id/resend-invitation' },
  send_reset: { method: 'POST', path: '/api/admin/users/:id/password-reset' },
} as const satisfies Record<string, AdminUserRoute>;

export type AdminUserRouteName = keyof typeof ADMIN_USER_ROUTES;

/** The path of one route for one user (`:id` filled in, URI-encoded). */
export function adminUserRoutePath(route: AdminUserRouteName, userId?: string): string {
  const { path } = ADMIN_USER_ROUTES[route];
  return userId === undefined ? path : path.replace(':id', encodeURIComponent(userId));
}

/** What the Admin does to a user; one usage event per action (`AdminUserEvent`). */
export const ADMIN_USER_ACTIONS = ['create', 'edit', 'pause', 'reactivate', 'remove', 'resend_invitation', 'send_reset'] as const;
export const adminUserActionSchema = z.enum(ADMIN_USER_ACTIONS);
export type AdminUserAction = z.infer<typeof adminUserActionSchema>;

/** The longest e-mail address the routes take (RFC 5321's path limit). */
export const ADMIN_USER_EMAIL_MAX_LENGTH = 254;

/** The longest name the routes take: the cap of a short text in an op (`TEXT_CAPS.short`). */
export const ADMIN_USER_NAME_MAX_LENGTH = 200;

const nameSchema = z.string().trim().min(1).max(ADMIN_USER_NAME_MAX_LENGTH);
const emailSchema = z.string().trim().toLowerCase().max(ADMIN_USER_EMAIL_MAX_LENGTH).pipe(z.email());

/** One user as the list shows him. */
export const adminUserViewSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string(),
  /** The role his kernel row names, with its name; null when none resolves. */
  role: z.object({ id: z.string(), name: z.string() }).nullable(),
  status: userStatusSchema,
  /** When his latest session was opened; null for a user who never signed in. */
  last_sign_in: isoTimestampSchema.nullable(),
});
export type AdminUserView = z.infer<typeof adminUserViewSchema>;

/** `GET /api/admin/users`: the company's users, removed ones included, by name. */
export const adminUserListResponseSchema = z.object({ users: z.array(adminUserViewSchema) });
export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;

/** `POST /api/admin/users`: the user is born `invited` with the role, and the invitation is sent. */
export const adminUserCreateRequestSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role_id: uuidV7Schema,
});
export type AdminUserCreateRequest = z.infer<typeof adminUserCreateRequestSchema>;

/** `PATCH /api/admin/users/:id`: the name, the role or both; the e-mail never changes. */
export const adminUserEditRequestSchema = z
  .object({
    name: nameSchema.optional(),
    role_id: uuidV7Schema.optional(),
  })
  .refine((body) => body.name !== undefined || body.role_id !== undefined, { message: 'name or role_id is required' });
export type AdminUserEditRequest = z.infer<typeof adminUserEditRequestSchema>;

/** The body of every action route (pause, reactivate, remove, resend-invitation, password-reset). */
export const adminUserActionRequestSchema = z.object({});

/**
 * `POST /api/admin/users/:id/reactivate` (2026-11-22, e26s): an optional `role_id`. A user whose role
 * was removed cannot come back with it (`role_not_found`), so the Admin gives him a live role of the
 * company in the same request: the role change and the status change are one server batch. Without
 * it the route behaves as before.
 */
export const adminUserReactivateRequestSchema = z.object({ role_id: uuidV7Schema.optional() });
export type AdminUserReactivateRequest = z.infer<typeof adminUserReactivateRequestSchema>;

/** Whether an e-mail left: `failed` keeps the change (the user stays) and the Admin may resend. */
export const adminUserEmailOutcomeSchema = z.enum(['sent', 'failed']);
export type AdminUserEmailOutcome = z.infer<typeof adminUserEmailOutcomeSchema>;

/**
 * The answer of every write route: the user as he now is. `invitation` on create and
 * resend-invitation, `reset` on password-reset.
 */
export const adminUserResponseSchema = z.object({
  user: adminUserViewSchema,
  invitation: adminUserEmailOutcomeSchema.optional(),
  reset: adminUserEmailOutcomeSchema.optional(),
});
export type AdminUserResponse = z.infer<typeof adminUserResponseSchema>;

/**
 * The usage event of one Admin action (AD-28 reading: the device event schema needs a session and
 * a device uuid, so a server action writes its own `admin_user_event` log line). Ids only: never a
 * name or an address.
 */
export const adminUserEventSchema = z.object({
  action: adminUserActionSchema,
  actor_id: z.string().min(1),
  company_id: z.string().min(1),
  target_user_id: z.string().min(1),
  role_id: z.string().min(1).optional(),
});
export type AdminUserEvent = z.infer<typeof adminUserEventSchema>;
