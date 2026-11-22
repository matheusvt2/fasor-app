import { describe, expect, it } from 'vitest';
import { can, isAdminRole, keysOf } from './can.ts';
import { PERMISSION_KEYS, permissionKeyLabel, permissionKeysOf, permissionModuleName, permissionModuleOf, PERMISSION_MODULES, type PermissionKey } from './keys.ts';
import { ADMIN_ROLE_ID, roleRowSchema, SYSTEM_ROLE_IDS, SYSTEM_ROLE_ROW_IDS, systemRoleName, systemRoleOfId, systemRoleRow, systemRoleRows, type SystemRoleId } from './roles.ts';
import { uuidV7Schema } from '../ids.ts';

/**
 * The epic's table "The roles as they are seeded" (`epics.md` Epic 26), written out cell by cell,
 * columns Admin, Engenheiro de Campo, Gestor do Projeto, Responsável Técnico, Consulta.
 */
const TABLE: Readonly<Record<PermissionKey, readonly [boolean, boolean, boolean, boolean, boolean]>> = {
  'relatorio.view': [true, true, true, true, true],
  'relatorio.fill': [true, true, true, true, false],
  'relatorio.create': [true, false, true, true, false],
  'relatorio.delete': [true, false, true, false, false],
  'relatorio.issue': [true, false, false, true, false],
  'export.download': [true, false, true, true, true],
  'template.edit': [true, false, true, false, false],
  'equipment_type.edit': [true, false, true, false, false],
  'registry.edit': [true, false, true, true, false],
  'suggestion.review': [true, false, true, true, false],
  'users.manage': [true, false, false, false, false],
  'roles.manage': [true, false, false, false, false],
};
const COLUMNS: readonly SystemRoleId[] = ['admin', 'engenheiro_de_campo', 'gestor_do_projeto', 'responsavel_tecnico', 'consulta'];

describe('26.2-UNIT-001 the catalog', () => {
  it('holds the twelve keys of the epic, each in its module', () => {
    expect(PERMISSION_KEYS).toHaveLength(12);
    expect(Object.keys(TABLE).sort()).toEqual([...PERMISSION_KEYS].sort());
    expect(PERMISSION_MODULES.map((module) => [permissionModuleName(module), permissionKeysOf(module)])).toEqual([
      ['Relatórios', ['relatorio.view', 'relatorio.create', 'relatorio.delete']],
      ['Preenchimento em campo', ['relatorio.fill']],
      ['Emissão', ['relatorio.issue', 'export.download']],
      // Story 26.10: the frame's word for the module (MOCK-GUIDE § 2026-11-21, answer 2).
      ['Templates', ['template.edit']],
      ['Tipos de equipamento', ['equipment_type.edit']],
      ['Cadastros', ['registry.edit', 'suggestion.review']],
      ['Usuários e papéis', ['users.manage', 'roles.manage']],
    ]);
    for (const key of PERMISSION_KEYS) {
      expect(permissionKeysOf(permissionModuleOf(key))).toContain(key);
      expect(permissionKeyLabel(key).length, key).toBeGreaterThan(3);
    }
  });
});

describe('26.2-UNIT-002 the seeded roles answer the epic table, cell by cell', () => {
  for (const key of PERMISSION_KEYS) {
    COLUMNS.forEach((system, column) => {
      it(`${system} / ${key} = ${TABLE[key][column] ? 'yes' : 'no'}`, () => {
        expect(can(systemRoleRow(system), key)).toBe(TABLE[key][column]);
      });
    });
  }

  it('five seeded rows, each valid, named as the epic, under constant uuidv7 ids', () => {
    const rows = systemRoleRows();
    expect(rows.map((row) => row.system)).toEqual([...SYSTEM_ROLE_IDS]);
    expect(rows.map((row) => row.name)).toEqual(['Admin', 'Engenheiro de Campo', 'Gestor do Projeto', 'Responsável Técnico', 'Consulta']);
    for (const row of rows) {
      expect(roleRowSchema.parse(row)).toEqual(row);
      expect(uuidV7Schema.safeParse(row.id).success, row.id).toBe(true);
      expect(row.id).toBe(SYSTEM_ROLE_ROW_IDS[row.system!]);
      expect(systemRoleOfId(row.id)).toBe(row.system);
      expect(systemRoleName(row.system!)).toBe(row.name);
      // The stored set is the table's column (the Admin's written with every key).
      expect(row.permissions).toEqual(PERMISSION_KEYS.filter((key) => TABLE[key][COLUMNS.indexOf(row.system!)]));
    }
    expect(new Set(rows.map((row) => row.id)).size).toBe(5);
    expect(systemRoleOfId('019966b0-0000-7000-8000-0000000000aa')).toBeNull();
    expect(systemRoleOfId(undefined)).toBeNull();
  });
});

describe('26.2-UNIT-003 the locked Admin and the fail-closed verdict', () => {
  it('the Admin role stored with an empty set answers yes to every key', () => {
    const locked = { ...systemRoleRow('admin'), permissions: [] };
    for (const key of PERMISSION_KEYS) expect(can(locked, key), key).toBe(true);
    expect(keysOf(locked)).toEqual([...PERMISSION_KEYS]);
    expect(isAdminRole(locked)).toBe(true);
  });

  it('no role (absent role_id, a row the company does not hold) answers no to every key', () => {
    for (const key of PERMISSION_KEYS) {
      expect(can(null, key), key).toBe(false);
      expect(can(undefined, key), key).toBe(false);
    }
    expect(keysOf(null)).toEqual([]);
  });

  it('a custom role is never the Admin, whatever it is named, holds or claims', () => {
    const custom = { id: '019966b0-0000-7000-8000-0000000000aa', name: 'Admin', permissions: ['relatorio.view' as const] };
    expect(isAdminRole(custom)).toBe(false);
    expect(keysOf(custom)).toEqual(['relatorio.view']);
    // A hand-built row claiming the Admin system under another id is not the locked Admin.
    expect(isAdminRole({ ...custom, system: 'admin' })).toBe(false);
    expect(can({ ...custom, system: 'admin' }, 'users.manage')).toBe(false);
    // The Admin's id with another system is not either.
    expect(isAdminRole({ ...custom, id: ADMIN_ROLE_ID, system: 'consulta' })).toBe(false);
  });

  it('a removed role grants nothing; the Admin is never removed by a tombstone', () => {
    const removed = { ...systemRoleRow('gestor_do_projeto'), removed_at: '2026-11-21T10:00:00.000Z' };
    expect(keysOf(removed)).toEqual([]);
    expect(keysOf({ ...systemRoleRow('admin'), removed_at: '2026-11-21T10:00:00.000Z' })).toEqual([...PERMISSION_KEYS]);
  });

  it('the row schema refuses an unknown key and a key twice', () => {
    const base = { id: '019966b0-0000-7000-8000-0000000000aa', name: 'Campo' };
    expect(roleRowSchema.safeParse({ ...base, permissions: ['relatorio.view'] }).success).toBe(true);
    expect(roleRowSchema.safeParse({ ...base, permissions: ['relatorio.read'] }).success).toBe(false);
    expect(roleRowSchema.safeParse({ ...base, permissions: ['relatorio.view', 'relatorio.view'] }).success).toBe(false);
    expect(roleRowSchema.safeParse({ ...base, permissions: [], system: 'auditor' }).success).toBe(false);
  });
});
