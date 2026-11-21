import { PERMISSION_KEYS, type PermissionKey } from './keys.ts';
import { ADMIN_ROLE_ID, type RoleRow } from './roles.ts';

/*
 * AD-29 (Story 26.2): the one verdict. `apps/api` and `apps/web` ask `can`; neither writes a role
 * name in a condition. `isAdminRole` is the one "Admin" condition of the codebase.
 */

/** The fields of a role the verdict reads. */
export type RoleLike = Pick<RoleRow, 'id' | 'permissions'> & Partial<Pick<RoleRow, 'system' | 'removed_at'>>;

/**
 * The locked Admin role: the seeded row (its constant id and its `system`). A custom role can
 * never be it, whatever it is named or holds.
 */
export function isAdminRole(role: RoleLike | null | undefined): boolean {
  return role !== null && role !== undefined && role.system === 'admin' && role.id === ADMIN_ROLE_ID;
}

/**
 * Whether a role holds a key. The Admin role answers yes to every key whatever is stored; no role
 * (an absent `role_id`, a role row the company does not hold) answers no to every key, so the
 * server fails closed; a removed role grants nothing.
 */
export function can(role: RoleLike | null | undefined, key: PermissionKey): boolean {
  if (role === null || role === undefined) return false;
  if (isAdminRole(role)) return true;
  if (role.removed_at !== null && role.removed_at !== undefined) return false;
  return role.permissions.includes(key);
}

/** Every key the role holds, in the catalog's order (what `can` answers yes to). */
export function keysOf(role: RoleLike | null | undefined): PermissionKey[] {
  return PERMISSION_KEYS.filter((key) => can(role, key));
}
