import { z } from 'zod';
import { uuidV7Schema } from '../ids.ts';
import { permissionKeySchema } from '../permissions/keys.ts';
import { systemRoleIdSchema } from '../permissions/roles.ts';

/*
 * Story 26.10 (2026-11-22, AD-29): the Admin's role routes behind Papéis e permissões. Online only,
 * every one behind `roles.manage` (`permissionForRoute('admin.roles')`), every one inside the
 * caller's company. A change is written by the server as the server-only ops of the role families
 * (`role/{id}` create, `role/{id}/{name|permissions|removed_at}` put, actor `system:admin`), so a
 * device sees it through the company pull like any other row. No op shape changes here, so no
 * contract number moves. Every write answers the whole list as it now is, so the grid redraws
 * from one answer. Every POST and PATCH takes a JSON body (`{}` for remove), as the origin guard asks.
 */

/** A route of the Admin's role routes: method and path, `:id` naming the role. */
export interface AdminRoleRoute {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
}

export const ADMIN_ROLE_ROUTES = {
  list: { method: 'GET', path: '/api/admin/roles' },
  set_permissions: { method: 'PATCH', path: '/api/admin/roles' },
  create: { method: 'POST', path: '/api/admin/roles' },
  rename: { method: 'PATCH', path: '/api/admin/roles/:id' },
  remove: { method: 'POST', path: '/api/admin/roles/:id/remove' },
} as const satisfies Record<string, AdminRoleRoute>;

export type AdminRoleRouteName = keyof typeof ADMIN_ROLE_ROUTES;

/** The path of one route for one role (`:id` filled in, URI-encoded). */
export function adminRoleRoutePath(route: AdminRoleRouteName, roleId?: string): string {
  const { path } = ADMIN_ROLE_ROUTES[route];
  return roleId === undefined ? path : path.replace(':id', encodeURIComponent(roleId));
}

/** What the Admin does to a role; one usage event per action that wrote (`AdminRoleEvent`). */
export const ADMIN_ROLE_ACTIONS = ['set_permissions', 'create', 'rename', 'remove'] as const;
export const adminRoleActionSchema = z.enum(ADMIN_ROLE_ACTIONS);
export type AdminRoleAction = z.infer<typeof adminRoleActionSchema>;

/** The most roles one save of the grid sends. */
export const ADMIN_ROLE_SAVE_MAX = 50;

/**
 * The longest name the body takes: the cap of a short text (`TEXT_CAPS.short`). The name's own
 * rule (empty, over 60 characters, taken) is the kernel's `roleNameIssue`, answered 409.
 */
export const ADMIN_ROLE_NAME_BODY_MAX_LENGTH = 200;

const nameSchema = z.string().max(ADMIN_ROLE_NAME_BODY_MAX_LENGTH);

/** One role as the grid shows it. */
export const adminRoleViewSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  /** The seeded role's identifier; null for a role the company created. */
  system: systemRoleIdSchema.nullable(),
  /** The keys the role holds, in the catalog's order (the Admin role: every key). */
  permissions: z.array(permissionKeySchema),
  /** The Admin role: its column is locked. */
  locked: z.boolean(),
  /** How many users hold it, removed users left out. */
  user_count: z.number().int().nonnegative(),
});
export type AdminRoleView = z.infer<typeof adminRoleViewSchema>;

/** The answer of every route: the company's live roles in the grid's column order (`orderRoles`). */
export const adminRoleListResponseSchema = z.object({ roles: z.array(adminRoleViewSchema) });
export type AdminRoleListResponse = z.infer<typeof adminRoleListResponseSchema>;

/** `PATCH /api/admin/roles`: the grid's one save, every changed role with its whole set, atomic. */
export const adminRoleSetPermissionsRequestSchema = z.object({
  roles: z
    .array(z.object({ id: uuidV7Schema, permissions: z.array(permissionKeySchema).max(64) }))
    .min(1)
    .max(ADMIN_ROLE_SAVE_MAX)
    .refine((roles) => new Set(roles.map((role) => role.id)).size === roles.length, { message: 'a role appears twice' }),
});
export type AdminRoleSetPermissionsRequest = z.infer<typeof adminRoleSetPermissionsRequestSchema>;

/** `POST /api/admin/roles`: a new role, born with `NEW_ROLE_PERMISSIONS`. */
export const adminRoleCreateRequestSchema = z.object({ name: nameSchema });
export type AdminRoleCreateRequest = z.infer<typeof adminRoleCreateRequestSchema>;

/** `PATCH /api/admin/roles/:id`: a custom role's new name. */
export const adminRoleRenameRequestSchema = z.object({ name: nameSchema });
export type AdminRoleRenameRequest = z.infer<typeof adminRoleRenameRequestSchema>;

/** `POST /api/admin/roles/:id/remove`. */
export const adminRoleRemoveRequestSchema = z.object({});

/**
 * The usage event of one Admin action on a role (the `admin_user_event` reading of Story 26.8):
 * one `admin_role_event` log line, ids only, never a name.
 */
export const adminRoleEventSchema = z.object({
  action: adminRoleActionSchema,
  actor_id: z.string().min(1),
  company_id: z.string().min(1),
  role_id: z.string().min(1),
});
export type AdminRoleEvent = z.infer<typeof adminRoleEventSchema>;
