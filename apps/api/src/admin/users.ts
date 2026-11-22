import { randomBytes } from 'node:crypto';
import {
  canonicalJson,
  INVITATION_LINK_HOURS,
  invitationEmail,
  lastAdminVerdict,
  passwordLinkAllowed,
  passwordResetEmail,
  RESET_LINK_HOURS,
  roleRowSchema,
  setPasswordLink,
  userFieldPath,
  userRolePath,
  userStatusPath,
  userStatusSchema,
  uuidV7Schema,
  type AdminUserAction,
  type AdminUserCreateRequest,
  type AdminUserEditRequest,
  type AdminUserEmailOutcome,
  type AdminUserEvent,
  type AdminUserView,
  type Clock,
  type ErrorCode,
  type NewId,
  type Op,
  type RoleRow,
  type UserRow,
  type UserStatus,
} from '@app/domain';
import { and, eq, inArray, max } from 'drizzle-orm';
import type { Auth } from '../auth/auth.ts';
import type { Db } from '../db/client.ts';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { identityOp, roleOp } from '../db/roles.ts';
import { account, company, entities, session, user } from '../db/schema.ts';
import type { EmailProvider } from '../email/types.ts';
import { log, logError } from '../log.ts';
import { applyServerBatch, type Tx } from '../sync/apply.ts';
import { issuePasswordLink, purgePasswordLinks } from './password-links.ts';

/*
 * Story 26.8 (AD-29): the Admin's user service behind `/api/admin/users` (`http/admin-users.ts`).
 * Every state change is ONE `applyServerBatch` transaction under the company lock: its `before`
 * reads the company's users there (identity rows, kernel rows, roles), decides again what the
 * request does (the tenant, the status rule, the role, `lastAdminVerdict`), makes the table writes
 * (`user`, `account`, `session`, the `verification` link rows) and throws `AdminUserError` to roll
 * everything back; then the batch applies the server-only ops that carry the change to the devices.
 * A decision the lock shows stale (another request changed the user first) is taken again once.
 * Nothing is deleted: remove is a status, and the user's row, name and every `actor_id` stay.
 * E-mails leave after the commit; a provider error keeps the change and answers `failed`.
 */

export class AdminUserError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly httpStatus: 400 | 404 | 409,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = 'AdminUserError';
  }
}

export interface AdminUsersDeps {
  db: Db;
  auth: Auth;
  email: EmailProvider;
  /** Where each action's usage event goes; absent, one `admin_user_event` log line. */
  events?: ((event: AdminUserEvent) => void) | undefined;
  now: Clock;
  newId: NewId;
  /** The app's origin, the base of the set-password link. */
  appOrigin: string;
}

/** The actor of a request (from the session). */
export interface AdminActor {
  userId: string;
  companyId: CompanyId;
}

/** One user of the company as the service reads him. */
interface CompanyUser {
  id: string;
  name: string;
  email: string;
  kernel: Partial<UserRow> | null;
  status: UserStatus;
  role: RoleRow | null;
}

interface CompanyState {
  users: CompanyUser[];
  roles: Map<string, RoleRow>;
}

const statusOf = (kernel: Partial<UserRow> | null): UserStatus => {
  const parsed = userStatusSchema.safeParse(kernel?.status);
  return parsed.success ? parsed.data : 'active';
};

/** The company's users (identity and kernel rows) and its roles, read in `reader` (under the lock in a batch). */
export async function readCompanyUsers(reader: Db | Tx, companyId: CompanyId): Promise<CompanyState> {
  const identities = await reader.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.companyId, companyId));
  const rows = await reader
    .select({ id: entities.id, entity: entities.entity, row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), inArray(entities.entity, ['user', 'role'])));
  const roles = new Map<string, RoleRow>();
  const kernels = new Map<string, Partial<UserRow>>();
  for (const row of rows) {
    if (row.entity === 'role') {
      const parsed = roleRowSchema.safeParse(row.row);
      if (parsed.success) roles.set(row.id, parsed.data);
    } else kernels.set(row.id, row.row as Partial<UserRow>);
  }
  const users = identities.map((identity): CompanyUser => {
    const kernel = kernels.get(identity.id) ?? null;
    const roleId = kernel?.role_id;
    return {
      id: identity.id,
      name: typeof kernel?.name === 'string' && kernel.name !== '' ? kernel.name : identity.name,
      email: identity.email,
      kernel,
      status: statusOf(kernel),
      role: typeof roleId === 'string' ? (roles.get(roleId) ?? null) : null,
    };
  });
  return { users, roles };
}

/** A role the Admin may give: a live role row of the company. */
function liveRole(state: CompanyState, roleId: string): RoleRow {
  const role = state.roles.get(roleId);
  if (role === undefined || (role.removed_at !== undefined && role.removed_at !== null)) throw new AdminUserError('role_not_found', 404);
  return role;
}

/** The target user of the company, or `user_not_found` (another company's user included: the tenant refusal). */
function targetOf(state: CompanyState, userId: string): CompanyUser {
  const target = uuidV7Schema.safeParse(userId).success ? state.users.find((candidate) => candidate.id === userId) : undefined;
  if (target === undefined || target.kernel === null) throw new AdminUserError('user_not_found', 404);
  return target;
}

function refuseLastAdmin(state: CompanyState, change: { user_id: string; status?: UserStatus; role?: RoleRow | null }): void {
  const verdict = lastAdminVerdict(
    state.users.map((u) => ({ id: u.id, status: u.status, role: u.role })),
    change,
  );
  if (!verdict.ok) throw new AdminUserError('last_admin', 409);
}

const stateInvalid = (status: UserStatus) => new AdminUserError('user_state_invalid', 409, { status });

/** What one request writes, decided from the company's state. */
interface Plan {
  ops: Array<{ kind: Op['kind']; path: string; value: unknown; actor: 'identity' | 'admin' }>;
  /** The table writes, run inside the batch's transaction. */
  write?: (tx: Tx) => Promise<void>;
  /** Compared across the two reads: what the plan depends on. */
  signature: unknown;
}

/** Thrown under the lock when the plan decided outside it is stale. */
class PlanChanged extends Error {}

export function createAdminUsersService(deps: AdminUsersDeps) {
  const events = deps.events ?? ((event: AdminUserEvent) => log('admin_user_event', { ...event }));

  /**
   * Decides with `decide` outside the lock, applies the plan's ops in one server batch whose
   * `before` decides again under the lock (refusing as it refuses) and runs the table writes.
   */
  async function run(companyId: CompanyId, decide: (state: CompanyState) => Plan): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      const plan = decide(await readCompanyUsers(deps.db, companyId));
      const signature = canonicalJson([plan.ops.map((op) => [op.kind, op.path, op.value]), plan.signature]);
      // One batch id when the plan writes several ops.
      const batchId = plan.ops.length > 1 ? deps.newId() : null;
      const ops = plan.ops.map((step) =>
        step.actor === 'identity'
          ? identityOp(companyId, { kind: step.kind, path: step.path, value: step.value, batchId })
          : roleOp(companyId, { kind: step.kind, path: step.path, value: step.value, batchId }),
      );
      try {
        await applyServerBatch(deps.db, companyId, ops, {
          now: deps.now,
          before: async (tx: Tx) => {
            const locked = decide(await readCompanyUsers(tx, companyId));
            if (canonicalJson([locked.ops.map((op) => [op.kind, op.path, op.value]), locked.signature]) !== signature) throw new PlanChanged();
            await locked.write?.(tx);
          },
        });
        return;
      } catch (error) {
        if (error instanceof PlanChanged && attempt === 1) continue;
        if (error instanceof PlanChanged) throw new Error(`could not change a user of company ${companyId}: another request changed it twice while this one ran`, { cause: error });
        throw error;
      }
    }
  }

  async function view(companyId: CompanyId, userId: string): Promise<AdminUserView> {
    const views = await listUsers({ userId, companyId }, userId);
    const found = views[0];
    if (found === undefined) throw new AdminUserError('user_not_found', 404);
    return found;
  }

  /** The company's users, removed ones included, by name (or the one `only` names). */
  async function listUsers(actor: AdminActor, only?: string): Promise<AdminUserView[]> {
    const state = await readCompanyUsers(deps.db, actor.companyId);
    const ids = state.users.map((u) => u.id);
    const signIns =
      ids.length === 0
        ? []
        : await deps.db
            .select({ userId: session.userId, last: max(session.createdAt) })
            .from(session)
            .where(inArray(session.userId, only === undefined ? ids : [only]))
            .groupBy(session.userId);
    const lastOf = new Map(signIns.map((row) => [row.userId, row.last]));
    return state.users
      .filter((u) => only === undefined || u.id === only)
      .map((u): AdminUserView => {
        const last = lastOf.get(u.id) ?? null;
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role === null ? null : { id: u.role.id, name: u.role.name },
          status: u.status,
          last_sign_in: last === null ? null : last.toISOString(),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
  }

  function emit(action: AdminUserAction, actor: AdminActor, targetUserId: string, roleId?: string): void {
    events({ action, actor_id: actor.userId, company_id: actor.companyId, target_user_id: targetUserId, ...(roleId === undefined ? {} : { role_id: roleId }) });
  }

  /** Sends one e-mail after the commit; a provider error is logged without the address. */
  async function deliver(actor: AdminActor, message: Parameters<EmailProvider['send']>[0]): Promise<AdminUserEmailOutcome> {
    try {
      await deps.email.send(message);
      return 'sent';
    } catch (error) {
      logError('admin e-mail failed', { company_id: actor.companyId, purpose: message.purpose, error: error instanceof Error ? error.name : 'unknown' });
      return 'failed';
    }
  }

  async function companyName(companyId: CompanyId): Promise<string> {
    const [row] = await deps.db.select({ name: company.name }).from(company).where(eq(company.id, companyId)).limit(1);
    return row?.name ?? '';
  }

  async function sendInvitation(actor: AdminActor, target: { id: string; name: string; email: string; role: RoleRow | null }, token: string): Promise<AdminUserEmailOutcome> {
    const state = await readCompanyUsers(deps.db, actor.companyId);
    const inviter = state.users.find((u) => u.id === actor.userId)?.name ?? '';
    const content = invitationEmail({
      name: target.name,
      inviter_name: inviter,
      company_name: await companyName(actor.companyId),
      role_name: target.role?.name ?? '',
      email: target.email,
      link: setPasswordLink(deps.appOrigin, token),
    });
    return deliver(actor, { to: target.email, ...content, purpose: 'invitation' });
  }

  async function sendReset(actor: AdminActor, target: { name: string; email: string }, token: string): Promise<AdminUserEmailOutcome> {
    const content = passwordResetEmail({ name: target.name, link: setPasswordLink(deps.appOrigin, token) });
    return deliver(actor, { to: target.email, ...content, purpose: 'reset' });
  }

  /**
   * What a pause or a remove clears: the user's password links (a pending invitation or reset). His
   * sessions stay (2026-11-22, Matheus, Story 26.11): every route answers `401 user_inactive` for a
   * user who is not active (`requireSession`, and the get-session guard of `http/app.ts`), so a kept
   * session is inert, and it is how the device learns the cause and keeps its unsent work. A
   * reactivation ends those kept sessions (`startAccess`): the user signs in again with the same
   * password, and the device's unsent work goes through its re-auth path (2026-11-22, e26r).
   */
  const endAccess = (userId: string) => async (tx: Tx) => {
    await purgePasswordLinks(tx, userId);
  };

  /**
   * What a reactivation clears (2026-11-22, e26r, review of Epic 26): every session of the user, the
   * inert ones a pause or a remove kept, so an old cookie never comes back to life by itself. The
   * device answers the 401 with its re-auth path (the Login over the kept outbox).
   */
  const startAccess = (companyId: CompanyId, userId: string) => async (tx: Tx) => {
    await tx.delete(session).where(and(eq(session.userId, userId), eq(session.companyId, companyId)));
  };

  async function createUser(actor: AdminActor, body: AdminUserCreateRequest): Promise<{ user: AdminUserView; invitation: AdminUserEmailOutcome }> {
    const userId = deps.newId();
    const email = body.email.trim().toLowerCase();
    const name = body.name.trim();
    const context = await deps.auth.$context;
    // A random secret nobody holds: the credential account exists, no password signs in until the link sets one.
    const unusable = await context.password.hash(randomBytes(32).toString('base64url'));
    const at = deps.now();
    const decided: { token: string; role: RoleRow | null } = { token: '', role: null };
    try {
      await run(actor.companyId, (state) => {
        const role = liveRole(state, body.role_id);
        decided.role = role;
        const row: UserRow = {
          id: userId,
          name,
          email,
          council: null,
          registration_number: null,
          title: null,
          photo_location_enabled: true,
          role_id: role.id,
          status: 'invited',
        };
        return {
          ops: [{ kind: 'create', path: `user/${userId}`, value: row, actor: 'identity' }],
          signature: null,
          write: async (tx) => {
            const [taken] = await tx.select({ id: user.id, companyId: user.companyId }).from(user).where(eq(user.email, email)).limit(1);
            if (taken !== undefined) throw await emailTaken(tx, actor.companyId, taken);
            await tx.insert(user).values({ id: userId, companyId: actor.companyId, name, email, emailVerified: false, createdAt: at, updatedAt: at });
            await tx.insert(account).values({
              id: deps.newId(),
              companyId: actor.companyId,
              userId,
              accountId: userId,
              providerId: 'credential',
              password: unusable,
              createdAt: at,
              updatedAt: at,
            });
            decided.token = await issuePasswordLink(tx, { companyId: actor.companyId, userId, hours: INVITATION_LINK_HOURS, now: at, newId: deps.newId });
          },
        };
      });
    } catch (error) {
      if (isEmailUniqueViolation(error)) throw new AdminUserError('user_email_taken', 409);
      throw error;
    }
    emit('create', actor, userId, body.role_id);
    const invitation = await sendInvitation(actor, { id: userId, name, email, role: decided.role }, decided.token);
    return { user: await view(actor.companyId, userId), invitation };
  }

  async function editUser(actor: AdminActor, userId: string, body: AdminUserEditRequest): Promise<{ user: AdminUserView }> {
    const at = deps.now();
    const decided: { roleChanged: string | undefined } = { roleChanged: undefined };
    await run(actor.companyId, (state) => {
      const target = targetOf(state, userId);
      if (target.status === 'removed') throw stateInvalid(target.status);
      const ops: Plan['ops'] = [];
      const name = body.name?.trim();
      const renamed = name !== undefined && name !== target.name;
      if (renamed) ops.push({ kind: 'put', path: userFieldPath(userId, 'name'), value: name, actor: 'identity' });
      decided.roleChanged = undefined;
      if (body.role_id !== undefined && body.role_id !== target.kernel?.role_id) {
        const role = liveRole(state, body.role_id);
        refuseLastAdmin(state, { user_id: userId, role });
        ops.push({ kind: 'put', path: userRolePath(userId), value: role.id, actor: 'admin' });
        decided.roleChanged = role.id;
      } else if (body.role_id !== undefined) liveRole(state, body.role_id);
      return {
        ops,
        signature: null,
        ...(renamed ? { write: async (tx: Tx) => void (await tx.update(user).set({ name, updatedAt: at }).where(and(eq(user.id, userId), eq(user.companyId, actor.companyId)))) } : {}),
      };
    });
    emit('edit', actor, userId, decided.roleChanged);
    return { user: await view(actor.companyId, userId) };
  }

  /**
   * A status change: `from` the statuses it applies to; `endAccess` for pause and remove,
   * `startAccess` for reactivate, which also needs the user's role to be live (2026-11-22, e26r:
   * the same `role_not_found` as create and edit, so the Admin picks a role first).
   */
  async function setStatus(actor: AdminActor, userId: string, action: 'pause' | 'reactivate' | 'remove', to: UserStatus, from: readonly UserStatus[]): Promise<{ user: AdminUserView }> {
    await run(actor.companyId, (state) => {
      const target = targetOf(state, userId);
      if (!from.includes(target.status)) throw stateInvalid(target.status);
      if (to === 'active') {
        const roleId = target.kernel?.role_id;
        if (typeof roleId !== 'string') throw new AdminUserError('role_not_found', 404);
        liveRole(state, roleId);
      } else refuseLastAdmin(state, { user_id: userId, status: to });
      return {
        ops: [{ kind: 'put', path: userStatusPath(userId), value: to, actor: 'admin' }],
        signature: target.status,
        write: to === 'active' ? startAccess(actor.companyId, userId) : endAccess(userId),
      };
    });
    emit(action, actor, userId);
    return { user: await view(actor.companyId, userId) };
  }

  /** A new link for the user (no op: the user's rows do not change), under the company lock. */
  async function newLink(actor: AdminActor, userId: string, allowed: (status: UserStatus) => boolean, hours: number): Promise<{ target: CompanyUser; token: string }> {
    const decided: { token: string; target: CompanyUser | null } = { token: '', target: null };
    await run(actor.companyId, (state) => {
      const target = targetOf(state, userId);
      if (!allowed(target.status)) throw stateInvalid(target.status);
      decided.target = target;
      return {
        ops: [],
        signature: target.status,
        write: async (tx) => {
          decided.token = await issuePasswordLink(tx, { companyId: actor.companyId, userId, hours, now: deps.now(), newId: deps.newId });
        },
      };
    });
    if (decided.target === null) throw new AdminUserError('user_not_found', 404);
    return { target: decided.target, token: decided.token };
  }

  async function resendInvitation(actor: AdminActor, userId: string): Promise<{ user: AdminUserView; invitation: AdminUserEmailOutcome }> {
    const { target, token } = await newLink(actor, userId, (status) => status === 'invited', INVITATION_LINK_HOURS);
    emit('resend_invitation', actor, userId);
    const invitation = await sendInvitation(actor, target, token);
    return { user: await view(actor.companyId, userId), invitation };
  }

  async function sendPasswordReset(actor: AdminActor, userId: string): Promise<{ user: AdminUserView; reset: AdminUserEmailOutcome }> {
    const { target, token } = await newLink(actor, userId, (status) => passwordLinkAllowed({ status }), RESET_LINK_HOURS);
    emit('send_reset', actor, userId);
    const reset = await sendReset(actor, target, token);
    return { user: await view(actor.companyId, userId), reset };
  }

  return {
    listUsers: (actor: AdminActor) => listUsers(actor),
    createUser,
    editUser,
    pauseUser: (actor: AdminActor, userId: string) => setStatus(actor, userId, 'pause', 'paused', ['active']),
    reactivateUser: (actor: AdminActor, userId: string) => setStatus(actor, userId, 'reactivate', 'active', ['paused', 'removed']),
    removeUser: (actor: AdminActor, userId: string) => setStatus(actor, userId, 'remove', 'removed', ['active', 'invited', 'paused']),
    resendInvitation,
    sendPasswordReset,
  };
}

export type AdminUsersService = ReturnType<typeof createAdminUsersService>;

/** The duplicate refusal: `details` names the user only when he is of the caller's company. */
async function emailTaken(tx: Tx, companyId: CompanyId, taken: { id: string; companyId: string }): Promise<AdminUserError> {
  if (taken.companyId !== companyId) return new AdminUserError('user_email_taken', 409);
  const [kernel] = await tx
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'user'), eq(entities.id, taken.id)))
    .limit(1);
  return new AdminUserError('user_email_taken', 409, { user_id: taken.id, status: statusOf((kernel?.row as Partial<UserRow> | undefined) ?? null) });
}

/** A unique violation of `user_email_unique` (two creates of one address racing), however the driver wraps it. */
function isEmailUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error; current !== undefined && current !== null; current = (current as { cause?: unknown }).cause) {
    const candidate = current as { code?: unknown; constraint_name?: unknown; constraint?: unknown };
    if (candidate.code === '23505' && (candidate.constraint_name === 'user_email_unique' || candidate.constraint === 'user_email_unique')) return true;
    if (current === (current as { cause?: unknown }).cause) break;
  }
  return false;
}
