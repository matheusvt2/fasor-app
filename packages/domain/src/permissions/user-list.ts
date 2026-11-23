import { INVITATION_LINK_HOURS } from '../email/links.ts';
import { calendarDateOfInstant, formatShortDateTime, formatTimeOfDay } from '../format/datetime.ts';
import { plural } from '../text/plural.ts';
import { isAdminRole, keysOf, type RoleLike } from './can.ts';
import { PERMISSION_MODULES, permissionKeysOf, permissionModuleName, type PermissionModule } from './keys.ts';
import { lastAdminVerdict } from './last-admin.ts';
import { systemRoleRows, type RoleRow } from './roles.ts';
import { userStatusOf, type UserStatus } from './user.ts';

/*
 * Story 26.9 (AD-29; `mockups/prototype/screens/92-usuarios.html`): the derived words and rules of
 * the Usuários screen. The pill words, the Situação filter, the count line, the row menu by status,
 * the line under each name, the role options' module line and the Toast that says when a change
 * takes effect are computed here once; `apps/web` renders them. The kernel's own status word
 * (`userStatusLabel`, "Convidado" for `invited`) is kept as it is: the screen's pill says
 * "Convite pendente" (MOCK-GUIDE § 2026-11-21, frame 2), which is this file's `userStatusPillLabel`.
 */

/** The `data-status` of the user Status pill and of its row (the frame's page CSS names these four). */
export type UserPillId = 'ativo' | 'convite' | 'pausado' | 'removido';

const PILLS: Readonly<Record<UserStatus, { id: UserPillId; label: string }>> = {
  active: { id: 'ativo', label: 'Ativo' },
  invited: { id: 'convite', label: 'Convite pendente' },
  paused: { id: 'pausado', label: 'Pausado' },
  removed: { id: 'removido', label: 'Removido' },
};

/** The pill's `data-status` of a user's status. */
export function userStatusPillId(status: UserStatus): UserPillId {
  return PILLS[status].id;
}

/** The pill's word of a user's status: Ativo, Convite pendente, Pausado, Removido (frame 92). */
export function userStatusPillLabel(status: UserStatus): string {
  return PILLS[status].label;
}

/** The Situação filter: "Todos" (the removed left out) or one status. */
export type UserStatusFilter = 'todos' | UserPillId;

export interface UserStatusFilterOption {
  id: UserStatusFilter;
  label: string;
}

/** The Situação chips in the frame's order; "Todos" is the default and leaves the removed out. */
export const USER_STATUS_FILTERS: readonly UserStatusFilterOption[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'ativo', label: PILLS.active.label },
  { id: 'convite', label: PILLS.invited.label },
  { id: 'pausado', label: PILLS.paused.label },
  { id: 'removido', label: PILLS.removed.label },
];

/** One user as the screen lists him: the device's row overlaid by the Admin route's view. */
export interface UserListEntry {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  role_id: string | null;
  /** The role's name, null when no role resolves. */
  role_name: string | null;
  /** When his latest session was opened (the route's), null when unknown or never. */
  last_sign_in: string | null;
}

/** The two filters of the screen: Situação and Papel (null: "Todos os papéis"). */
export interface UserListFilter {
  status: UserStatusFilter;
  roleId: string | null;
}

function matchesStatus(status: UserStatus, filter: UserStatusFilter): boolean {
  if (filter === 'todos') return status !== 'removed';
  return userStatusPillId(status) === filter;
}

/** The entries the two filters keep, in their order. "Todos" leaves the removed users out. */
export function filterUserList<T extends Pick<UserListEntry, 'status' | 'role_id'>>(entries: readonly T[], filter: UserListFilter): T[] {
  return entries.filter((entry) => matchesStatus(entry.status, filter.status) && (filter.roleId === null || entry.role_id === filter.roleId));
}

/**
 * The count line under the list (frame 92): "7 usuários · 1 removido, no filtro Removido", and under
 * the Removido chip "1 usuário removido. O nome continua nos relatórios que ele preencheu ou assinou.".
 * `shown` is the rows the filters keep; `removed` the removed users the Papel filter keeps.
 */
export function userListCountText({ filter, shown, removed }: { filter: UserStatusFilter; shown: number; removed: number }): string {
  if (filter === 'removido') {
    return shown === 1
      ? `${plural(shown, 'usuário removido', 'usuários removidos')}. O nome continua nos relatórios que ele preencheu ou assinou.`
      : // authored (Story 26.9): the plural of the frame's sentence.
        `${plural(shown, 'usuário removido', 'usuários removidos')}. Os nomes continuam nos relatórios que eles preencheram ou assinaram.`;
  }
  const main = plural(shown, 'usuário', 'usuários');
  return removed === 0 ? main : `${main} · ${plural(removed, 'removido', 'removidos')}, no filtro Removido`;
}

/** What the row's Overflow menu offers. */
export const USER_ROW_ACTIONS = ['edit', 'send_reset', 'pause', 'reactivate', 'resend_invitation', 'remove'] as const;
export type UserRowAction = (typeof USER_ROW_ACTIONS)[number];

const ROW_ACTION_LABELS: Readonly<Record<UserRowAction, string>> = {
  edit: 'Editar',
  send_reset: 'Enviar redefinição de senha',
  pause: 'Pausar',
  reactivate: 'Reativar',
  resend_invitation: 'Reenviar convite',
  remove: 'Remover',
};

/**
 * The row menu's items by status, in the frame's order (Remover last, the destructive one): an
 * active user Editar, Enviar redefinição de senha, Pausar, Remover (the signed-in Admin himself
 * without the reset); an invited one Editar, Reenviar convite, Remover; a paused one Editar,
 * Reativar, Remover; a removed one Reativar alone.
 */
export function userRowActions(status: UserStatus, { isSelf }: { isSelf: boolean }): UserRowAction[] {
  switch (status) {
    case 'active':
      return isSelf ? ['edit', 'pause', 'remove'] : ['edit', 'send_reset', 'pause', 'remove'];
    case 'invited':
      return ['edit', 'resend_invitation', 'remove'];
    case 'paused':
      return ['edit', 'reactivate', 'remove'];
    case 'removed':
      return ['reactivate'];
  }
}

/** The menu word of an action. */
export function userRowActionLabel(action: UserRowAction): string {
  return ROW_ACTION_LABELS[action];
}

/** Whether the action is the destructive one (drawn last, in red). */
export function userRowActionDestructive(action: UserRowAction): boolean {
  return action === 'remove';
}

/** When a pause or a removal reaches the person's device (frame 92's confirmations and Toasts). */
export const USER_STOP_EFFECT_TEXT = 'O aparelho dele para na próxima vez que falar com o servidor.';

/** When a new role reaches the person's device (frame 92's edit Toast). */
export const USER_ROLE_EFFECT_TEXT = 'O aparelho dele segue o novo papel na próxima sincronização.';

/** What the Admin did, for its Toast. */
export type UserDoneAction = 'create' | 'edit' | 'pause' | 'reactivate' | 'remove' | 'resend_invitation' | 'send_reset';

/**
 * The success Toast of an action, the frame's words: each says when the change takes effect (the
 * device's next contact with the server) where the frame does.
 */
export function userActionDoneText(action: UserDoneAction, { name, email, roleChanged = false }: { name: string; email: string; roleChanged?: boolean }): string {
  switch (action) {
    case 'create':
      return `Convite enviado para ${email}. Vale por ${INVITATION_LINK_HOURS} horas.`;
    case 'edit':
      return roleChanged ? `${name} alterado. ${USER_ROLE_EFFECT_TEXT}` : 'Nome salvo.';
    case 'pause':
      return `${name} pausado. ${USER_STOP_EFFECT_TEXT}`;
    case 'remove':
      return `${name} removido. ${USER_STOP_EFFECT_TEXT}`;
    case 'reactivate':
      return `${name} reativado. Ele já pode entrar.`;
    case 'resend_invitation':
      return `Convite reenviado para ${email}. Vale por ${INVITATION_LINK_HOURS} horas.`;
    case 'send_reset':
      return `Link enviado para ${email}.`;
  }
}

/** How long a link lives, in words ("1 hora", "72 horas"), for the confirmations. */
export function linkLifeText(hours: number): string {
  return plural(hours, 'hora', 'horas');
}

/**
 * The last access of the line under a name: "último acesso hoje 08:12" on the day it happened,
 * "último acesso 19/11 16:40" before (America/Sao_Paulo); '' when unknown or never.
 */
export function userLastAccessText(lastSignIn: string | null, now: Date): string {
  if (lastSignIn === null) return '';
  const at = Date.parse(lastSignIn);
  if (Number.isNaN(at)) return '';
  if (calendarDateOfInstant(new Date(at)) === calendarDateOfInstant(now)) return `último acesso hoje ${formatTimeOfDay(lastSignIn)}`;
  return `último acesso ${formatShortDateTime(lastSignIn)}`;
}

/** The line under a user's e-mail: his role and his last access ("Admin · último acesso hoje 08:12"). */
export function userRowDetailText(entry: Pick<UserListEntry, 'role_name' | 'last_sign_in'>, now: Date): string {
  return [entry.role_name ?? '', userLastAccessText(entry.last_sign_in, now)].filter((part) => part !== '').join(' · ');
}

/** The screen's name of a module: the module of `template.edit` reads "Templates" (MOCK-GUIDE § 2026-11-21, question 2). */
function screenModuleName(module: PermissionModule): string {
  return module === 'modelos' ? 'Templates' : permissionModuleName(module);
}

/**
 * The line under a role in the user dialog: the modules it opens, "(em parte)" beside one it opens
 * only some keys of ("Relatórios (em parte) · Preenchimento em campo"); the Admin "Todas as
 * permissões".
 */
export function roleModulesText(role: RoleLike): string {
  if (isAdminRole(role)) return 'Todas as permissões';
  const held = new Set(keysOf(role));
  const parts: string[] = [];
  for (const module of PERMISSION_MODULES) {
    const keys = permissionKeysOf(module);
    const count = keys.filter((key) => held.has(key)).length;
    if (count === 0) continue;
    parts.push(count === keys.length ? screenModuleName(module) : `${screenModuleName(module)} (em parte)`);
  }
  // authored (Story 26.9): a role that opens no module.
  return parts.length === 0 ? 'Nenhuma permissão' : parts.join(' · ');
}

/** The Papel option's note of a role the company created (frame 92: "criado pela empresa"); null for a seeded one. */
export function roleOriginText(role: Pick<RoleRow, 'system'>): string | null {
  return role.system === undefined ? 'criado pela empresa' : null;
}

function liveRole(role: RoleRow): boolean {
  return role.removed_at === null || role.removed_at === undefined;
}

/**
 * Whether a reactivation must ask the Admin for a role first (2026-11-22, e26s): the user holds none
 * (`roleId` null) or the device already knows the role he holds was removed. A role the device does
 * not hold at all (not pulled yet) is not judged here: the route is asked and its `role_not_found`
 * is the authority.
 */
export function reactivateNeedsRole(roleId: string | null, localRoles: readonly RoleRow[]): boolean {
  if (roleId === null) return true;
  const row = localRoles.find((role) => role.id === roleId);
  return row !== undefined && !liveRole(row);
}

/**
 * The roles the screen offers (the Papel filter, the user dialog): the five seeded ones in the
 * table's order, each as the device holds it (or as seeded until the pull brings it), then the
 * company's own live roles by name.
 */
export function userDirectoryRoles(local: readonly RoleRow[]): RoleRow[] {
  const byId = new Map(local.map((role) => [role.id, role]));
  const seeded = systemRoleRows().map((row) => byId.get(row.id) ?? row);
  const seededIds = new Set(seeded.map((row) => row.id));
  const custom = local
    .filter((role) => !seededIds.has(role.id) && liveRole(role))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
  return [...seeded, ...custom];
}

/** A user row as the device holds it (the fields the list reads). */
export interface UserDirectoryRow {
  id: string;
  name: string;
  email: string;
  status?: UserStatus | null | undefined;
  role_id?: string | null | undefined;
}

/** A user as the Admin route answers him (`adminUserViewSchema`). */
export interface UserDirectoryView {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  role: { id: string; name: string } | null;
  last_sign_in: string | null;
}

/**
 * The list the screen shows: every user row of the device, overlaid by the route's view of the
 * same id (its status, role and name are fresher, and only it knows the last sign-in); a user the
 * route lacks keeps the device's row; a user only the route knows (created a moment ago, not pulled
 * yet) is listed from the view. By name, then id.
 */
export function userDirectory(users: readonly UserDirectoryRow[], roles: readonly RoleRow[], views: readonly UserDirectoryView[]): UserListEntry[] {
  const roleName = new Map(roles.map((role) => [role.id, role.name]));
  const viewOf = new Map(views.map((view) => [view.id, view]));
  const entries: UserListEntry[] = users.map((user) => {
    const view = viewOf.get(user.id);
    const localRoleId = typeof user.role_id === 'string' ? user.role_id : null;
    const roleId = view?.role?.id ?? localRoleId;
    return {
      id: user.id,
      name: view?.name ?? user.name,
      email: view?.email ?? user.email,
      status: view?.status ?? userStatusOf(user),
      role_id: roleId,
      role_name: view?.role?.name ?? (roleId === null ? null : (roleName.get(roleId) ?? null)),
      last_sign_in: view?.last_sign_in ?? null,
    };
  });
  const known = new Set(users.map((user) => user.id));
  for (const view of views) {
    if (known.has(view.id)) continue;
    entries.push({ id: view.id, name: view.name, email: view.email, status: view.status, role_id: view.role?.id ?? null, role_name: view.role?.name ?? null, last_sign_in: view.last_sign_in });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
}

/**
 * Whether a change to one user would leave the company with no active Admin, judged over the rows
 * the screen holds (`lastAdminVerdict`): the screen says so before asking; the route's 409 stays
 * the authority.
 */
export function userChangeLeavesNoAdmin(
  entries: readonly Pick<UserListEntry, 'id' | 'status' | 'role_id'>[],
  roles: readonly RoleRow[],
  change: { user_id: string; status?: UserStatus; role_id?: string },
): boolean {
  const roleOf = (id: string | null) => (id === null ? null : (roles.find((role) => role.id === id) ?? null));
  const users = entries.map((entry) => ({ id: entry.id, status: entry.status, role: roleOf(entry.role_id) }));
  const verdict = lastAdminVerdict(users, {
    user_id: change.user_id,
    ...(change.status === undefined ? {} : { status: change.status }),
    ...(change.role_id === undefined ? {} : { role: roleOf(change.role_id) }),
  });
  return !verdict.ok;
}

/**
 * The last-Admin sentence (frame 92, the Banner of the edit dialog and the refusal dialog). The
 * frame draws the signed-in Admin himself; another user who is the last active Admin (an Admin who
 * manages users through a role of the company's own) reads the authored variant.
 */
export function lastAdminText({ isSelf, name }: { isSelf: boolean; name: string }): string {
  if (isSelf) return 'Você é o único Admin ativo. Dê o papel Admin a outra pessoa antes de pausar, remover ou mudar o seu papel.';
  // authored (Story 26.9): the same rule said of another user.
  return `${name} é o único Admin ativo. Dê o papel Admin a outra pessoa antes de pausar, remover ou mudar o papel dele.`;
}
