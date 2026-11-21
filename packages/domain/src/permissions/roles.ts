import { z } from 'zod';
import { isoTimestampSchema } from '../clock.ts';
import { uuidV7Schema } from '../ids.ts';
import { PERMISSION_KEYS, permissionKeySchema, type PermissionKey } from './keys.ts';

/*
 * AD-29 (Story 26.2): a role is a company entity `role/{id}` that lives in the op log like every
 * other company row (server-only families `role` and `role/field`, actor `system:admin`), so every
 * device renders roles from IndexedDB. The five seeded roles carry a `system` identifier; a role
 * the Admin creates (Story 26.10) carries none. Every company holds the five seeded roles under
 * the same constant row ids (the `entities` key includes the company), so a seed, a migration and
 * a test name a seeded role by id with no lookup.
 */

export const SYSTEM_ROLE_IDS = ['admin', 'engenheiro_de_campo', 'gestor_do_projeto', 'responsavel_tecnico', 'consulta'] as const;
export const systemRoleIdSchema = z.enum(SYSTEM_ROLE_IDS);
export type SystemRoleId = z.infer<typeof systemRoleIdSchema>;

/** The row id of each seeded role, the same in every company (uuidv7-shaped constants). */
export const SYSTEM_ROLE_ROW_IDS: Readonly<Record<SystemRoleId, string>> = {
  admin: '00000026-0000-7000-8000-000000000001',
  engenheiro_de_campo: '00000026-0000-7000-8000-000000000002',
  gestor_do_projeto: '00000026-0000-7000-8000-000000000003',
  responsavel_tecnico: '00000026-0000-7000-8000-000000000004',
  consulta: '00000026-0000-7000-8000-000000000005',
};

/** The role row id of the locked Admin role. */
export const ADMIN_ROLE_ID = SYSTEM_ROLE_ROW_IDS.admin;

/** The fields a server-only `role/{id}/{field}` put writes; `id` and `system` are fixed at create. */
export const ROLE_FIELDS = ['name', 'permissions', 'removed_at'] as const;

/**
 * A role row. `permissions` is the set of keys the role holds (no key twice). `system` names a
 * seeded role; absent on a custom role. `removed_at` is the tombstone a later story writes when
 * the Admin removes a custom role; absent and null both mean live.
 */
export const roleRowSchema = z.object({
  id: uuidV7Schema,
  name: z.string().min(1),
  permissions: z.array(permissionKeySchema).refine((keys) => new Set(keys).size === keys.length, { message: 'a key appears twice' }),
  system: systemRoleIdSchema.optional(),
  removed_at: isoTimestampSchema.nullable().optional(),
});
export type RoleRow = z.infer<typeof roleRowSchema>;

/** The seeded role names, the epic's table verbatim. */
const SYSTEM_ROLE_NAMES: Readonly<Record<SystemRoleId, string>> = {
  admin: 'Admin',
  engenheiro_de_campo: 'Engenheiro de Campo',
  gestor_do_projeto: 'Gestor do Projeto',
  responsavel_tecnico: 'Responsável Técnico',
  consulta: 'Consulta',
};

export function systemRoleName(system: SystemRoleId): string {
  return SYSTEM_ROLE_NAMES[system];
}

/**
 * The seeded sets, the epic's table "The roles as they are seeded" as data. The Admin's line is
 * written with every key so a reader that lists a role's keys sees them, but `can` never reads it:
 * the Admin role holds every key whatever is stored.
 */
export const SYSTEM_ROLE_PERMISSIONS: Readonly<Record<SystemRoleId, readonly PermissionKey[]>> = {
  admin: PERMISSION_KEYS,
  engenheiro_de_campo: ['relatorio.view', 'relatorio.fill'],
  gestor_do_projeto: [
    'relatorio.view',
    'relatorio.fill',
    'relatorio.create',
    'relatorio.delete',
    'export.download',
    'template.edit',
    'equipment_type.edit',
    'registry.edit',
    'suggestion.review',
  ],
  responsavel_tecnico: ['relatorio.view', 'relatorio.fill', 'relatorio.create', 'relatorio.issue', 'export.download', 'registry.edit', 'suggestion.review'],
  consulta: ['relatorio.view', 'export.download'],
};

/** The seeded role row of one system identifier, its keys in the catalog's order. */
export function systemRoleRow(system: SystemRoleId): RoleRow {
  const held = new Set(SYSTEM_ROLE_PERMISSIONS[system]);
  return {
    id: SYSTEM_ROLE_ROW_IDS[system],
    name: SYSTEM_ROLE_NAMES[system],
    permissions: PERMISSION_KEYS.filter((key) => held.has(key)),
    system,
    removed_at: null,
  };
}

/** The five seeded role rows every company holds, in the table's column order. */
export function systemRoleRows(): RoleRow[] {
  return SYSTEM_ROLE_IDS.map(systemRoleRow);
}

/** The system identifier of a seeded role's row id, or null for any other id. */
export function systemRoleOfId(id: string | null | undefined): SystemRoleId | null {
  if (typeof id !== 'string') return null;
  for (const system of SYSTEM_ROLE_IDS) if (SYSTEM_ROLE_ROW_IDS[system] === id) return system;
  return null;
}
