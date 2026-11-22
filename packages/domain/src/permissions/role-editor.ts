import { listPtBr, plural } from '../text/plural.ts';
import { normalizeRegistryName } from '../text/normalize-name.ts';
import { isAdminRole, type RoleLike } from './can.ts';
import {
  MANAGEMENT_KEYS,
  PERMISSION_KEYS,
  permissionKeyLabel,
  permissionKeysOf,
  permissionModuleName,
  type PermissionKey,
  type PermissionModule,
} from './keys.ts';
import { SYSTEM_ROLE_IDS, SYSTEM_ROLE_PERMISSIONS, systemRoleOfId, type RoleRow, type SystemRoleId } from './roles.ts';
import { userStatusOf, type UserStatus } from './user.ts';

/*
 * Story 26.10 (AD-29): the rules of the Papéis e permissões grid and of the roles the Admin
 * creates, decided once here. `apps/api` (the routes under `/api/admin/roles`) asks
 * `roleChangeVerdict` before it writes and again under the company lock; `apps/web` draws the grid
 * from the derivations below and writes no rule, count or sentence of its own
 * (`mockups/prototype/screens/93-papeis.html`, approved 2026-11-21 with the owner's answers):
 * - the Admin role is locked: its keys, its name and its existence never change;
 * - the other four seeded roles take any set of keys and can be restored to the seeded set; they
 *   are never renamed nor removed;
 * - a custom role has a name unique in the company (ignoring case, accents and repeated spaces,
 *   against every live role, the seeded ones included) and any set of keys; it is removed only
 *   when no user holds it (a removed user does not count: reading open to the owner);
 * - a new role starts with "Ver relatórios" only (answer 4 of 2026-11-21).
 */

/** The longest role name the grid takes. */
export const ROLE_NAME_MAX_LENGTH = 60;

/** The keys a new role is born with (MOCK-GUIDE § 2026-11-21, answer 4). */
export const NEW_ROLE_PERMISSIONS: readonly PermissionKey[] = ['relatorio.view'];

/** Up to this many roles, every role is a column at tablet width (answer 1 of 2026-11-21). */
export const ROLES_BESIDE_MAX = 7;

/** Whether the grid shows one role at a time below 1280 px, as on a phone: eight roles or more. */
export function rolesOneAtATime(count: number): boolean {
  return count > ROLES_BESIDE_MAX;
}

/** A set of keys with no key twice, in the catalog's order. */
export function normalizeKeys(keys: readonly PermissionKey[]): PermissionKey[] {
  const held = new Set(keys);
  return PERMISSION_KEYS.filter((key) => held.has(key));
}

/** Whether two key sets hold the same keys (order and repeats ignored). */
export function sameKeys(a: readonly PermissionKey[], b: readonly PermissionKey[]): boolean {
  const left = normalizeKeys(a);
  const right = normalizeKeys(b);
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

/** A role name as it is stored: trimmed, inner runs of spaces collapsed to one. */
export function cleanRoleName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** The fields of a role the editor reads (a `RoleRow`, or a role of the Admin's list, `system` null on a custom one). */
export type EditorRole = RoleLike & Pick<RoleRow, 'name'>;

const isLive = (role: Partial<Pick<RoleRow, 'removed_at'>>): boolean => role.removed_at === null || role.removed_at === undefined;

/** The seeded role's identifier (one of the five, under its constant row id), the Admin included; null for any other role. */
function seededSystemOf(role: EditorRole): SystemRoleId | null {
  const system = role.system;
  return system !== undefined && system !== null && systemRoleOfId(role.id) === system ? system : null;
}

const isSeededRole = (role: EditorRole): boolean => seededSystemOf(role) !== null;

export type RoleNameIssue = 'empty' | 'too_long' | 'taken';

/**
 * Why a role name cannot be used, or null. The name is cleaned first (`cleanRoleName`) and
 * compared ignoring case and accents with every live role's name but `ownId`'s (a rename keeps
 * its own name).
 */
export function roleNameIssue(name: string, roles: readonly Pick<EditorRole, 'id' | 'name' | 'removed_at'>[], ownId?: string): RoleNameIssue | null {
  const clean = cleanRoleName(name);
  if (clean === '') return 'empty';
  if (Array.from(clean).length > ROLE_NAME_MAX_LENGTH) return 'too_long';
  const wanted = normalizeRegistryName(clean);
  const taken = roles.some((role) => role.id !== ownId && isLive(role) && normalizeRegistryName(role.name) === wanted);
  return taken ? 'taken' : null;
}

const NAME_ISSUE_TEXTS: Readonly<Record<RoleNameIssue, string>> = {
  // authored (Story 26.10)
  empty: 'Escreva o nome do papel.',
  // authored (Story 26.10)
  too_long: `O nome tem no máximo ${ROLE_NAME_MAX_LENGTH} caracteres.`,
  // authored (Story 26.10)
  taken: 'Já existe um papel com este nome.',
};

/** The line under the name field of "Novo papel" and "Renomear papel". */
export function roleNameIssueText(issue: RoleNameIssue): string {
  return NAME_ISSUE_TEXTS[issue];
}

/** The live roles in the grid's column order: the seeded ones in the table's order, then the custom ones by id (creation order). */
export function orderRoles<T extends EditorRole>(rows: readonly T[]): T[] {
  const live = rows.filter(isLive);
  const seeded = SYSTEM_ROLE_IDS.flatMap((system) => live.filter((row) => isSeededRole(row) && row.system === system));
  const custom = live.filter((row) => !isSeededRole(row)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return [...seeded, ...custom];
}

/** One user of the company as the editor reads him. */
export interface EditorUser {
  id: string;
  name: string;
  role_id?: string | null | undefined;
  status?: UserStatus | null | undefined;
}

/** What the Admin asks of a role. */
export type RoleChange =
  | { kind: 'permissions'; role_id: string; permissions: readonly PermissionKey[] }
  | { kind: 'rename'; role_id: string; name: string }
  | { kind: 'create'; name: string }
  | { kind: 'remove'; role_id: string };

/** `role_locked`'s details: `system` for a seeded role (rename and remove); absent for the Admin role (every change). */
export interface RoleLockedDetails {
  system?: true;
}

/** `role_in_use`'s details: how many users hold the role, and their names by name. */
export interface RoleInUseDetails {
  user_count: number;
  user_names: string[];
}

export type RoleChangeRefusal = 'role_not_found' | 'role_locked' | 'role_name_taken' | 'role_name_invalid' | 'role_in_use';

export type RoleChangeVerdict =
  | { ok: true }
  | { ok: false; reason: 'role_not_found' }
  | { ok: false; reason: 'role_locked'; details: RoleLockedDetails }
  | { ok: false; reason: 'role_name_taken' }
  | { ok: false; reason: 'role_name_invalid'; details: { issue: Exclude<RoleNameIssue, 'taken'> } }
  | { ok: false; reason: 'role_in_use'; details: RoleInUseDetails };

/** The users who hold a role: every one but the removed (a removed user cannot be edited, so he would make the role unremovable). */
export function roleHolders(users: readonly EditorUser[], roleId: string): EditorUser[] {
  return users
    .filter((user) => user.role_id === roleId && userStatusOf(user) !== 'removed')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function nameVerdict(name: string, roles: readonly EditorRole[], ownId?: string): RoleChangeVerdict {
  const issue = roleNameIssue(name, roles, ownId);
  if (issue === null) return { ok: true };
  return issue === 'taken' ? { ok: false, reason: 'role_name_taken' } : { ok: false, reason: 'role_name_invalid', details: { issue } };
}

/**
 * The one verdict on a change to the company's roles. `roles` are the company's role rows (removed
 * ones included or not: a removed role is no role here); `users` its users with their `role_id`
 * and status. The Admin role refuses every change; a seeded role refuses a rename and a removal.
 */
export function roleChangeVerdict(roles: readonly EditorRole[], users: readonly EditorUser[], change: RoleChange): RoleChangeVerdict {
  if (change.kind === 'create') return nameVerdict(change.name, roles);
  const role = roles.find((candidate) => candidate.id === change.role_id && isLive(candidate));
  if (role === undefined) return { ok: false, reason: 'role_not_found' };
  if (isAdminRole(role)) return { ok: false, reason: 'role_locked', details: {} };
  if (change.kind === 'permissions') return { ok: true };
  if (isSeededRole(role)) return { ok: false, reason: 'role_locked', details: { system: true } };
  if (change.kind === 'rename') return nameVerdict(change.name, roles, role.id);
  const holders = roleHolders(users, role.id);
  if (holders.length > 0) return { ok: false, reason: 'role_in_use', details: { user_count: holders.length, user_names: holders.map((user) => user.name) } };
  return { ok: true };
}

/** The seeded set (catalog order) of a seeded role other than the Admin, or null (the Admin role, a custom role). */
export function restoredPermissions(role: EditorRole): PermissionKey[] | null {
  const system = seededSystemOf(role);
  if (system === null || isAdminRole(role)) return null;
  return normalizeKeys(SYSTEM_ROLE_PERMISSIONS[system]);
}

/** Whether a seeded role (not the Admin) holds exactly its seeded set; false for any other role. */
export function isAtSeededSet(role: EditorRole): boolean {
  const restored = restoredPermissions(role);
  return restored !== null && sameKeys(role.permissions, restored);
}

/* ---------- The grid's derivations (the web draws them; it decides none) ---------- */

export interface ModuleState {
  /** On when the role holds every key of the module, off when none, mixed when some. */
  state: 'on' | 'off' | 'mixed';
  held: number;
  total: number;
}

/** The state of a module's switch for a set of keys. */
export function moduleState(permissions: readonly PermissionKey[], module: PermissionModule): ModuleState {
  const keys = permissionKeysOf(module);
  const held = keys.filter((key) => permissions.includes(key)).length;
  return { state: held === 0 ? 'off' : held === keys.length ? 'on' : 'mixed', held, total: keys.length };
}

/** A tap on a module's switch: on takes every key of the module; mixed or off gives them all (answer 3 of 2026-11-21). */
export function toggleModule(permissions: readonly PermissionKey[], module: PermissionModule): PermissionKey[] {
  const keys = permissionKeysOf(module);
  if (moduleState(permissions, module).state === 'on') return normalizeKeys(permissions.filter((key) => !keys.includes(key)));
  return normalizeKeys([...permissions, ...keys]);
}

/** A tap on a key's switch. */
export function toggleKey(permissions: readonly PermissionKey[], key: PermissionKey): PermissionKey[] {
  return permissions.includes(key) ? normalizeKeys(permissions.filter((held) => held !== key)) : normalizeKeys([...permissions, key]);
}

/** One unsaved change of the grid: a key given or taken from a role. */
export interface GridChange {
  role_id: string;
  role_name: string;
  key: PermissionKey;
  on: boolean;
}

/**
 * The unsaved changes of the grid: each key whose draft differs from the saved role, roles in the
 * column order, keys in the catalog's order. A draft entry of a role the list no longer holds, and
 * any entry for the Admin role, count for nothing.
 */
export function gridChanges(saved: readonly EditorRole[], draft: Readonly<Record<string, readonly PermissionKey[]>>): GridChange[] {
  const changes: GridChange[] = [];
  for (const role of orderRoles(saved)) {
    if (isAdminRole(role)) continue;
    const drafted = draft[role.id];
    if (drafted === undefined) continue;
    for (const key of PERMISSION_KEYS) {
      const was = role.permissions.includes(key);
      const now = drafted.includes(key);
      if (was !== now) changes.push({ role_id: role.id, role_name: role.name, key, on: now });
    }
  }
  return changes;
}

/** The roles "Salvar alterações" sends: each changed role once, with its whole drafted set (normalized), in column order. */
export function changedRolePermissions(saved: readonly EditorRole[], draft: Readonly<Record<string, readonly PermissionKey[]>>): { id: string; permissions: PermissionKey[] }[] {
  const changed = new Set(gridChanges(saved, draft).map((change) => change.role_id));
  return orderRoles(saved)
    .filter((role) => changed.has(role.id))
    .map((role) => ({ id: role.id, permissions: normalizeKeys(draft[role.id] ?? role.permissions) }));
}

/** The sticky bar's line: "1 alteração não salva: Engenheiro de Campo · Criar relatório.", "N alterações não salvas.", or null. */
export function unsavedChangesText(changes: readonly GridChange[]): string | null {
  if (changes.length === 0) return null;
  const [only] = changes;
  // frame 93-papeis.html
  if (changes.length === 1 && only !== undefined) return `1 alteração não salva: ${only.role_name} · ${permissionKeyLabel(only.key)}.`;
  // authored (Story 26.10): the frame's sentence for more than one change
  return `${changes.length} alterações não salvas.`;
}

/**
 * Rule 4 of the story, said before saving: the roles a change gives `users.manage` or
 * `roles.manage`, whose users become able to change users and roles. Null when no change does.
 */
export function managementGrantText(changes: readonly GridChange[]): string | null {
  const names: string[] = [];
  for (const change of changes) if (change.on && MANAGEMENT_KEYS.includes(change.key) && !names.includes(change.role_name)) names.push(change.role_name);
  if (names.length === 0) return null;
  // authored (Story 26.10)
  return `${listPtBr(names)} ${names.length === 1 ? 'passa' : 'passam'} a poder mudar usuários e papéis, inclusive os próprios.`;
}

/** The line under a role's name in the column head: "1 usuário", "2 usuários"; a custom role adds " · criado" (frame 93-papeis.html). */
export function roleHeadMeta(userCount: number, custom: boolean): string {
  return `${plural(userCount, 'usuário', 'usuários')}${custom ? ' · criado' : ''}`;
}

/** How many names `roleInUseText` writes before "e mais N". */
const IN_USE_NAMES_SHOWN = 5;

/** The refusal of a removal (frame 93-papeis.html): who still holds the role. */
export function roleInUseText(details: RoleInUseDetails): string {
  const count = details.user_count;
  // frame 93-papeis.html (the confirmation of a role nobody holds)
  if (count <= 0) return 'Nenhum usuário tem este papel.';
  const shown = details.user_names.slice(0, IN_USE_NAMES_SHOWN);
  const rest = count - shown.length;
  const names = listPtBr(rest > 0 ? [...shown, `mais ${rest}`] : shown);
  // frame 93-papeis.html
  if (count === 1) return `1 usuário tem este papel: ${names}. Mude o papel dele em Usuários e tente de novo.`;
  // authored (Story 26.10): the frame's sentence in the plural
  return `${count} usuários têm este papel: ${names}. Mude o papel deles em Usuários e tente de novo.`;
}

/** The note above the grid, and why the Admin role refuses every change (frame 93-papeis.html). */
export const ADMIN_ROLE_LOCKED_TEXT = 'Admin tem todas as permissões, sempre. A coluna não muda, para a empresa nunca ficar sem quem cuide dos usuários.';

/** The line of a seeded role's menu, and why it refuses a rename or a removal (frame 93-papeis.html). */
export const SYSTEM_ROLE_LOCKED_TEXT = 'Papel do sistema: não pode ser renomeado nem removido.';

/** Why a locked role refused a change: a seeded role (rename, remove) or the Admin role (everything). */
export function roleLockedText(details: RoleLockedDetails | undefined): string {
  return details?.system === true ? SYSTEM_ROLE_LOCKED_TEXT : ADMIN_ROLE_LOCKED_TEXT;
}

/** "2 de 3", under a mixed module switch. */
export function moduleCountText(state: ModuleState): string {
  return `${state.held} de ${state.total}`;
}

/** A key cell's accessible name: "Criar relatório — Engenheiro de Campo"; the locked Admin's "… — Admin, sempre" (frame 93-papeis.html). */
export function keyCellLabel(key: PermissionKey, roleName: string, locked: boolean): string {
  return `${permissionKeyLabel(key)} — ${roleName}${locked ? ', sempre' : ''}`;
}

/** A module cell's accessible name, with ", 2 de 3" when mixed (frame 93-papeis.html). */
export function moduleCellLabel(module: PermissionModule, roleName: string, locked: boolean, state: ModuleState): string {
  const mixed = state.state === 'mixed' ? `, ${moduleCountText(state)}` : '';
  return `${permissionModuleName(module)} — ${roleName}${locked ? ', sempre' : ''}${mixed}`;
}
