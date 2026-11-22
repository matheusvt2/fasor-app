import {
  cleanRoleName,
  isAdminRole,
  keysOf,
  NEW_ROLE_PERMISSIONS,
  normalizeKeys,
  orderRoles,
  roleChangeVerdict,
  roleFieldPath,
  roleHolders,
  rolePath,
  sameKeys,
  toIso,
  type AdminRoleAction,
  type AdminRoleEvent,
  type AdminRoleSetPermissionsRequest,
  type AdminRoleView,
  type Clock,
  type EditorUser,
  type ErrorCode,
  type NewId,
  type Op,
  type RoleChange,
  type RoleRow,
} from '@app/domain';
import type { Db } from '../db/client.ts';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { applyDecidedWrites } from '../db/roles.ts';
import { log } from '../log.ts';
import type { Tx } from '../sync/apply.ts';
import { readCompanyUsers } from './users.ts';

/*
 * Story 26.10 (AD-29): the Admin's role service behind `/api/admin/roles` (`http/admin-roles.ts`).
 * Every request is decided by the kernel's `roleChangeVerdict` over the company's roles and users
 * (`readCompanyUsers`), outside the company lock and again under it (`applyDecidedWrites`: one
 * `applyServerBatch` of `system:admin` ops, decided once more on a changed decision), so two
 * creates of one name at once give one 201 and one 409 `role_name_taken`. A request that changes
 * nothing writes no op and answers the list. Nothing is deleted: a removed role is a tombstone row
 * (`removed_at`), and `can` already grants nothing to it. Every answer is the whole list as it now is.
 */

export class AdminRoleError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly httpStatus: 400 | 404 | 409,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = 'AdminRoleError';
  }
}

export interface AdminRolesDeps {
  db: Db;
  /** Where each action's usage event goes; absent, one `admin_role_event` log line. */
  events?: ((event: AdminRoleEvent) => void) | undefined;
  now: Clock;
  newId: NewId;
}

/** The actor of a request (from the session). */
export interface AdminRoleActor {
  userId: string;
  companyId: CompanyId;
}

interface RoleState {
  roles: RoleRow[];
  users: EditorUser[];
}

type Write = { kind: Op['kind']; path: string; value: unknown };

async function readRoleState(reader: Db | Tx, companyId: CompanyId): Promise<RoleState> {
  const state = await readCompanyUsers(reader, companyId);
  return {
    roles: [...state.roles.values()],
    users: state.users.map((u): EditorUser => {
      const roleId: unknown = u.kernel?.role_id;
      return { id: u.id, name: u.name, role_id: typeof roleId === 'string' ? roleId : null, status: u.status };
    }),
  };
}

/** The kernel's refusal as the route's error: `role_not_found` 404, every other one 409. */
function refuse(roles: readonly RoleRow[], users: readonly EditorUser[], change: RoleChange): void {
  const verdict = roleChangeVerdict(roles, users, change);
  if (verdict.ok) return;
  if (verdict.reason === 'role_not_found') throw new AdminRoleError('role_not_found', 404);
  if (verdict.reason === 'role_name_taken') throw new AdminRoleError('role_name_taken', 409);
  throw new AdminRoleError(verdict.reason, 409, verdict.details);
}

const roleOf = (state: RoleState, roleId: string): RoleRow => {
  const role = state.roles.find((candidate) => candidate.id === roleId);
  // `refuse` ran first: the role is a live role of the company.
  if (role === undefined) throw new AdminRoleError('role_not_found', 404);
  return role;
};

export function createAdminRolesService(deps: AdminRolesDeps) {
  const events = deps.events ?? ((event: AdminRoleEvent) => log('admin_role_event', { ...event }));

  /** The company's live roles in the grid's column order, each with its keys and its holders' count. */
  async function listRoles(actor: AdminRoleActor): Promise<{ roles: AdminRoleView[] }> {
    const state = await readRoleState(deps.db, actor.companyId);
    return {
      roles: orderRoles(state.roles).map(
        (role): AdminRoleView => ({
          id: role.id,
          name: role.name,
          system: role.system ?? null,
          permissions: keysOf(role),
          locked: isAdminRole(role),
          user_count: roleHolders(state.users, role.id).length,
        }),
      ),
    };
  }

  /**
   * Decides with `decide` outside the lock and again under it, writes what it answers as one server
   * batch, emits one event per role written (after the commit), and answers the list.
   */
  async function change(actor: AdminRoleActor, action: AdminRoleAction, decide: (state: RoleState) => { writes: Write[]; roleIds: string[] }, what: string) {
    const decided: { roleIds: string[] } = { roleIds: [] };
    const written = await applyDecidedWrites(
      deps.db,
      actor.companyId,
      async (reader) => {
        const plan = decide(await readRoleState(reader, actor.companyId));
        decided.roleIds = plan.roleIds;
        return plan.writes;
      },
      what,
    );
    if (written > 0) for (const roleId of decided.roleIds) events({ action, actor_id: actor.userId, company_id: actor.companyId, role_id: roleId });
    return listRoles(actor);
  }

  /** The grid's one save: every listed role's whole set; a role whose set is unchanged writes nothing. */
  function setPermissions(actor: AdminRoleActor, body: AdminRoleSetPermissionsRequest) {
    return change(
      actor,
      'set_permissions',
      (state) => {
        const writes: Write[] = [];
        const roleIds: string[] = [];
        for (const item of body.roles) {
          const permissions = normalizeKeys(item.permissions);
          refuse(state.roles, state.users, { kind: 'permissions', role_id: item.id, permissions });
          if (sameKeys(roleOf(state, item.id).permissions, permissions)) continue;
          writes.push({ kind: 'put', path: roleFieldPath(item.id, 'permissions'), value: permissions });
          roleIds.push(item.id);
        }
        return { writes, roleIds };
      },
      'the roles\' keys',
    );
  }

  /** A new custom role, born with `NEW_ROLE_PERMISSIONS`. */
  function createRole(actor: AdminRoleActor, body: { name: string }) {
    // One id and one name for both decisions (the signature compares the writes).
    const roleId = deps.newId();
    const name = cleanRoleName(body.name);
    return change(
      actor,
      'create',
      (state) => {
        refuse(state.roles, state.users, { kind: 'create', name });
        const row: RoleRow = { id: roleId, name, permissions: [...NEW_ROLE_PERMISSIONS], removed_at: null };
        return { writes: [{ kind: 'create', path: rolePath(roleId), value: row }], roleIds: [roleId] };
      },
      'a new role',
    );
  }

  /** A custom role's new name; its own name again writes nothing. */
  function renameRole(actor: AdminRoleActor, roleId: string, body: { name: string }) {
    const name = cleanRoleName(body.name);
    return change(
      actor,
      'rename',
      (state) => {
        refuse(state.roles, state.users, { kind: 'rename', role_id: roleId, name });
        if (roleOf(state, roleId).name === name) return { writes: [], roleIds: [] };
        return { writes: [{ kind: 'put', path: roleFieldPath(roleId, 'name'), value: name }], roleIds: [roleId] };
      },
      'a role\'s name',
    );
  }

  /** A custom role no user holds: its tombstone. */
  function removeRole(actor: AdminRoleActor, roleId: string) {
    // One instant for both decisions.
    const at = toIso(deps.now());
    return change(
      actor,
      'remove',
      (state) => {
        refuse(state.roles, state.users, { kind: 'remove', role_id: roleId });
        return { writes: [{ kind: 'put', path: roleFieldPath(roleId, 'removed_at'), value: at }], roleIds: [roleId] };
      },
      'a role\'s removal',
    );
  }

  return { listRoles, setPermissions, createRole, renameRole, removeRole };
}

export type AdminRolesService = ReturnType<typeof createAdminRolesService>;
