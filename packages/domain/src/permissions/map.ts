import type { Op } from '../ops/op.ts';
import { parsePath, safeParsePath, type OpPath, type PathFamily } from '../ops/path.ts';
import type { RegistryKind, RelatorioStatus } from '../schemas/entities.ts';
import { countsAsEdit, type EditCandidate } from '../status/edited-since.ts';
import { can, type RoleLike } from './can.ts';
import type { PermissionKey } from './keys.ts';

/*
 * AD-29 (Story 26.2): the key each op and each HTTP route needs. The map is typed over
 * `PathFamily`, so a family added to `opPathSchema` fails `pnpm static` here until someone writes
 * its key, and `permissions/map.test.ts` checks every family of the runtime table. `'none'` means
 * no key: a family only the server writes (the push refuses a client op on it as
 * `op_server_only` before any key is asked), or the user's own profile (the owner rule of the
 * push route holds it).
 */

export type PermissionNeed = PermissionKey | 'none';

/** The fields of an op the map reads beside its path. */
export type PermissionOp = Pick<Op, 'kind' | 'value'>;

/**
 * 2026-11-22 (Matheus, "sim nos dois", e26r): what the reader holds of the relatório the op writes
 * into, for the needs that depend on it. The server passes the status it holds (never the op's
 * claim); a device passes the status on its store. Absent, no such need applies.
 */
export interface PermissionContext {
  relatorioStatus?: RelatorioStatus | null | undefined;
}

type FamilyNeed = PermissionNeed | ((path: OpPath, op: PermissionOp, context: PermissionContext) => PermissionNeed);

/**
 * The registry kinds the ficha creates from a field surface (the nameplate's "Criar “…”" chip,
 * `createWordOp` in `apps/web/src/surfaces/ficha/ficha-ops.ts`): their create needs
 * `relatorio.fill`, so the Engenheiro de Campo can name a manufacturer or a voltage class on site.
 * Their field puts (rename, remove) are the Cadastros' and need `registry.edit`.
 * Coordinator's reading, open to Matheus (AD-29).
 */
export const FICHA_REGISTRY_KINDS: readonly RegistryKind[] = ['manufacturer', 'voltage_class'];

/**
 * `relatorio/setup`: the fields of the creation form ("Novo relatório" and its setup) need
 * `relatorio.create`; the fields written in the field (the parecer, the site altitude, the next
 * intervention, the instruments carried) need `relatorio.fill`. Every key of `RELATORIO_SETUP_KEYS`
 * is in exactly one list (`permissions/map.test.ts`), and a key in neither fails closed to
 * `relatorio.create`. Coordinator's reading, open to Matheus (AD-29).
 */
export const SETUP_CREATE_FIELDS: readonly string[] = [
  'service_start',
  'service_end',
  'atividade',
  'local',
  'responsible_user_id',
  'cover_photo_file_id',
  'escopo',
  'exclusions',
  'additional_info',
  'art_trt_number',
];
export const SETUP_FILL_FIELDS: readonly string[] = [
  'parecer',
  'site_altitude_m',
  'site_altitude_na',
  'site_altitude_confirmed',
  'next_intervention_date',
  'next_intervention_justification',
  'instrument_ids',
  // Story 28.9 (contract 59): the relatório's additional items, written in Etapa 6 beside the parecer.
  'additional_items',
];

const setupNeed = (path: OpPath): PermissionNeed =>
  path.family === 'relatorio/setup' && SETUP_FILL_FIELDS.includes(path.field) ? 'relatorio.fill' : 'relatorio.create';

/**
 * `relatorio/status`: the move to Emitido issues; every other move (Em revisão, back to Rascunho) fills.
 * 2026-11-22 (Matheus, "sim nos dois", e26r): a move away from Emitido issues too, whatever its target
 * (the backward move, and the reopen an edit appends, `advanceOnEdit`): only a role that issues takes
 * an issued relatório back. The status is the context's, the one the server holds.
 */
const statusNeed = (_path: OpPath, op: PermissionOp, context: PermissionContext): PermissionNeed =>
  op.kind === 'put' && (op.value === 'emitido' || context.relatorioStatus === 'emitido') ? 'relatorio.issue' : 'relatorio.fill';

const registryCreateNeed = (path: OpPath): PermissionNeed =>
  path.family === 'registry' && FICHA_REGISTRY_KINDS.includes(path.kind) ? 'relatorio.fill' : 'registry.edit';

const FAMILY_NEEDS = {
  // Relatórios: an obra and a relatório are created with "Novo relatório" and its setup.
  project: 'relatorio.create',
  'project/field': 'relatorio.create',
  relatorio: 'relatorio.create',
  'relatorio/setup': setupNeed,
  'relatorio/removed_at': 'relatorio.delete',
  // Emissão: the order the printed document lists the sheets in is chosen at the issuing step.
  'relatorio/export/scheme': 'relatorio.issue',
  'relatorio/status': statusNeed,
  // Preenchimento em campo: the ficha, photos, points, the site checks, the structure in the field.
  location: 'relatorio.fill',
  'location/field': 'relatorio.fill',
  'location/se': 'relatorio.fill',
  'location/env': 'relatorio.fill',
  'location/agrupar_por_tipo': 'relatorio.fill',
  'location/funcao': 'relatorio.fill',
  'location/checklist': 'relatorio.fill',
  block: 'relatorio.fill',
  'block/field': 'relatorio.fill',
  'sheet/nameplate': 'relatorio.fill',
  'sheet/checklist': 'relatorio.fill',
  'sheet/test': 'relatorio.fill',
  'sheet/test/cell': 'relatorio.fill',
  'sheet/test/value': 'relatorio.fill',
  'sheet/test/row': 'relatorio.fill',
  'sheet/test/row/cell': 'relatorio.fill',
  'sheet/conclusion': 'relatorio.fill',
  'sheet/observations': 'relatorio.fill',
  equipment: 'relatorio.fill',
  'equipment/field': 'relatorio.fill',
  file: 'relatorio.fill',
  'file/field': 'relatorio.fill',
  point: 'relatorio.fill',
  'point/field': 'relatorio.fill',
  // A reading suggestion is confirmed or discarded in the ficha; `suggestion.review` is kept for
  // the Cadastros side. Coordinator's reading, open to Matheus (AD-29).
  'suggestion/status': 'relatorio.fill',
  // Cadastros, except the kinds the ficha creates (`FICHA_REGISTRY_KINDS`).
  registry: registryCreateNeed,
  'registry/field': 'registry.edit',
  // Modelos and Tipos de equipamento.
  template: 'template.edit',
  'template/field': 'template.edit',
  equipment_type: 'equipment_type.edit',
  'equipment_type/field': 'equipment_type.edit',
  equipment_type_version: 'equipment_type.edit',
  // The user's own profile fields: open to an active user (the owner rule stays in the push route).
  'user/field': 'none',
  // Usuários e papéis: server-only families, written by the Admin's routes (Stories 26.8, 26.10).
  'user/role_id': 'users.manage',
  'user/status': 'users.manage',
  role: 'roles.manage',
  'role/field': 'roles.manage',
  // Written only by the server.
  user: 'none',
  'file/server': 'none',
  'equipment/last_nameplate': 'none',
  'equipment/last_results': 'none',
  suggestion: 'none',
  generation_job: 'none',
  'generation_job/field': 'none',
  revision: 'none',
  'relatorio/preview_file_id': 'none',
  'template/seed_version': 'none',
  audit_run: 'none',
  'audit_run/field': 'none',
} as const satisfies Record<PathFamily, FamilyNeed>;

/** The need of every path family (read by the coverage test). */
export const FAMILY_PERMISSION_NEEDS: Readonly<Record<PathFamily, FamilyNeed>> = FAMILY_NEEDS;

/**
 * The key an op needs, or `'none'`. Never throws on a parsed path; a string is parsed first.
 * `context` (e26r): the relatório's current status, read by the `relatorio/status` need.
 */
export function permissionForPath(path: OpPath | string, op: PermissionOp, context: PermissionContext = {}): PermissionNeed {
  const parsed = typeof path === 'string' ? parsePath(path) : path;
  const need: FamilyNeed = FAMILY_PERMISSION_NEEDS[parsed.family];
  return typeof need === 'function' ? need(parsed, op, context) : need;
}

/**
 * 2026-11-22 (Matheus, "sim nos dois", e26r): leaving Emitido needs `relatorio.issue`. On a relatório
 * whose current status is Emitido, an op that would reopen it needs `relatorio.issue` beside its own
 * key (`permissionForPath`): a `relatorio/status` put (any move away), and every edit AD-22's emitter
 * answers with Emitido to Em revisão (`countsAsEdit`: a sheet value, a photo, a point, the parecer,
 * the tree). `'none'` for every other op and in every other status.
 */
export function reopenNeed(op: EditCandidate, relatorioStatus: RelatorioStatus | null | undefined): PermissionNeed {
  if (relatorioStatus !== 'emitido') return 'none';
  if (safeParsePath(op.path)?.family === 'relatorio/status') return op.kind === 'put' ? 'relatorio.issue' : 'none';
  return countsAsEdit(op) ? 'relatorio.issue' : 'none';
}

/**
 * e26r: the key that keeps a role from writing into a relatório in this status, or null when it
 * writes: `relatorio.fill` when the role does not fill, `relatorio.issue` when the relatório is
 * Emitido and the role does not issue (every write there would reopen it). The read-only screens read it.
 */
export function relatorioWriteRefusal(role: RoleLike | null | undefined, relatorioStatus: RelatorioStatus | null | undefined): 'relatorio.fill' | 'relatorio.issue' | null {
  if (!can(role, 'relatorio.fill')) return 'relatorio.fill';
  if (relatorioStatus === 'emitido' && !can(role, 'relatorio.issue')) return 'relatorio.issue';
  return null;
}

/**
 * The HTTP routes that are not ops, by name. The sync routes, the account read and telemetry are
 * open to every active user.
 */
export const PERMISSION_ROUTES = [
  'relatorio.generate',
  'relatorio.preview',
  'relatorio.preview_pdf',
  'relatorio.audit',
  'reading.reread',
  'revision.docx',
  'revision.pdf',
  'file.upload',
  'file.read',
  'sync.push',
  'sync.pull',
  'account.read',
  'telemetry',
  // Story 26.8 (2026-11-21): every route under `/api/admin/users` (list, create, edit, pause,
  // reactivate, remove, resend the invitation, send a password reset).
  'admin.users',
  // Story 26.10 (2026-11-22): every route under `/api/admin/roles` (list, set the keys, create,
  // rename, remove).
  'admin.roles',
] as const;
export type PermissionRoute = (typeof PERMISSION_ROUTES)[number];

const ROUTE_NEEDS: Readonly<Record<PermissionRoute, PermissionNeed>> = {
  'relatorio.generate': 'relatorio.issue',
  'relatorio.preview': 'relatorio.issue',
  'relatorio.preview_pdf': 'relatorio.issue',
  'relatorio.audit': 'relatorio.issue',
  'reading.reread': 'relatorio.issue',
  'revision.docx': 'export.download',
  'revision.pdf': 'export.download',
  'file.upload': 'relatorio.fill',
  'file.read': 'relatorio.view',
  'sync.push': 'none',
  'sync.pull': 'none',
  'account.read': 'none',
  telemetry: 'none',
  'admin.users': 'users.manage',
  'admin.roles': 'roles.manage',
};

/** The key a route needs, or `'none'`. */
export function permissionForRoute(name: PermissionRoute): PermissionNeed {
  return ROUTE_NEEDS[name];
}
