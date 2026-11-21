import { isAdminRole, type RoleLike } from './can.ts';
import { activeUser, type UserStatus } from './user.ts';

/*
 * AD-29 (Story 26.2): no company is ever left without an active Admin. The Admin's routes
 * (Story 26.8) ask this before they pause, remove or give another role to a user.
 */

/** A user of the company with the role its `role_id` resolves to (null when none resolves). */
export interface LastAdminUser {
  id: string;
  status?: UserStatus | null | undefined;
  role: RoleLike | null;
}

/** One change to one user: a new status, a new role, or both. */
export interface LastAdminChange {
  user_id: string;
  status?: UserStatus;
  role?: RoleLike | null;
}

export type LastAdminVerdict = { ok: true } | { ok: false; reason: 'last_admin' };

function activeAdmin(user: { status?: UserStatus | null | undefined; role: RoleLike | null }): boolean {
  return activeUser(user) && isAdminRole(user.role);
}

/**
 * Refuses a change that would leave the company with no active Admin; allows every other one
 * (a company that already holds none is not made worse by a change, so it is allowed).
 */
export function lastAdminVerdict(users: readonly LastAdminUser[], change: LastAdminChange): LastAdminVerdict {
  const before = users.filter(activeAdmin).length;
  if (before === 0) return { ok: true };
  const after = users.filter((user) => {
    if (user.id !== change.user_id) return activeAdmin(user);
    return activeAdmin({
      status: change.status !== undefined ? change.status : user.status,
      role: change.role !== undefined ? change.role : user.role,
    });
  }).length;
  return after === 0 ? { ok: false, reason: 'last_admin' } : { ok: true };
}
