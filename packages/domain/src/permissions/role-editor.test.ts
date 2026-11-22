import { describe, expect, it } from 'vitest';
import { PERMISSION_KEYS, permissionKeyHelp, permissionKeyLabel, permissionModuleHelp, permissionModuleName, PERMISSION_MODULES, type PermissionKey } from './keys.ts';
import {
  changedRolePermissions,
  cleanRoleName,
  gridChanges,
  isAtSeededSet,
  keyCellLabel,
  managementGrantText,
  moduleCellLabel,
  moduleState,
  NEW_ROLE_PERMISSIONS,
  normalizeKeys,
  orderRoles,
  restoredPermissions,
  ROLE_NAME_MAX_LENGTH,
  roleChangeVerdict,
  roleHeadMeta,
  roleInUseText,
  roleLockedText,
  roleNameIssue,
  roleNameIssueText,
  rolesOneAtATime,
  toggleKey,
  toggleModule,
  unsavedChangesText,
  type EditorUser,
} from './role-editor.ts';
import { SYSTEM_ROLE_IDS, SYSTEM_ROLE_PERMISSIONS, systemRoleRow, systemRoleRows, type RoleRow } from './roles.ts';

/*
 * Story 26.10 (AD-29, `mockups/prototype/screens/93-papeis.html`): the rules of the roles the Admin
 * edits and creates, and the grid's derivations, with their boundaries.
 */

const CUSTOM_A = '019966c1-2610-7000-8000-00000000000a';
const CUSTOM_B = '019966c1-2610-7000-8000-00000000000b';
const ADMIN = systemRoleRow('admin');
const CAMPO = systemRoleRow('engenheiro_de_campo');
const GESTOR = systemRoleRow('gestor_do_projeto');
const custom = (id: string, name: string, permissions: PermissionKey[] = ['relatorio.view'], removed_at: string | null = null): RoleRow => ({ id, name, permissions, removed_at });
const ESTAGIARIO = custom(CUSTOM_A, 'Estagiário', ['relatorio.view', 'relatorio.fill']);
const ROLES: RoleRow[] = [...systemRoleRows(), ESTAGIARIO];
const user = (id: number, name: string, role_id: string, status?: EditorUser['status']): EditorUser => ({
  id: `019966c1-2610-7000-8000-0000000001${id.toString().padStart(2, '0')}`,
  name,
  role_id,
  ...(status === undefined ? {} : { status }),
});

describe('26.10-UNIT-001 the catalog reads as the frame', () => {
  it('the module of template.edit is "Templates"; each module has its line, the two management keys their help', () => {
    expect(PERMISSION_MODULES.map(permissionModuleName)).toEqual(['Relatórios', 'Preenchimento em campo', 'Emissão', 'Templates', 'Tipos de equipamento', 'Cadastros', 'Usuários e papéis']);
    expect(permissionModuleHelp('modelos')).toBe('A lista de templates e o compositor');
    for (const module of PERMISSION_MODULES) expect(permissionModuleHelp(module).length).toBeGreaterThan(10);
    expect(PERMISSION_KEYS.map(permissionKeyLabel)).toEqual([
      'Ver relatórios',
      'Criar relatório',
      'Remover relatório',
      'Preencher fichas, fotos e pontos',
      'Gerar e emitir relatório',
      'Baixar DOCX e PDF emitidos',
      'Editar templates',
      'Editar tipos de equipamento',
      'Editar cadastros',
      'Aceitar sugestões de cadastro',
      'Gerenciar usuários',
      'Gerenciar papéis e permissões',
    ]);
    expect(PERMISSION_KEYS.filter((key) => permissionKeyHelp(key) !== null)).toEqual(['users.manage', 'roles.manage']);
    expect(permissionKeyHelp('users.manage')).toBe('Quem tem esta permissão pode mudar usuários e papéis, inclusive os próprios.');
  });

  it('a new role starts with "Ver relatórios" only; eight roles or more show one at a time', () => {
    expect(NEW_ROLE_PERMISSIONS).toEqual(['relatorio.view']);
    expect(rolesOneAtATime(7)).toBe(false);
    expect(rolesOneAtATime(8)).toBe(true);
    expect(rolesOneAtATime(0)).toBe(false);
  });
});

describe('26.10-UNIT-002 role names', () => {
  it('empty, 60 and 61 characters, case and accents, repeated spaces, the own name on rename', () => {
    expect(roleNameIssue('', ROLES)).toBe('empty');
    expect(roleNameIssue('   ', ROLES)).toBe('empty');
    expect(roleNameIssue('a'.repeat(ROLE_NAME_MAX_LENGTH), ROLES)).toBeNull();
    expect(roleNameIssue('a'.repeat(ROLE_NAME_MAX_LENGTH + 1), ROLES)).toBe('too_long');
    // Trimmed before counting.
    expect(roleNameIssue(`  ${'a'.repeat(ROLE_NAME_MAX_LENGTH)}  `, ROLES)).toBeNull();
    expect(roleNameIssue('estagiario', ROLES)).toBe('taken');
    expect(roleNameIssue('ESTAGIÁRIO', ROLES)).toBe('taken');
    expect(roleNameIssue('engenheiro  de   campo', ROLES)).toBe('taken');
    expect(roleNameIssue('admin', ROLES)).toBe('taken');
    expect(roleNameIssue('Supervisor de campo', ROLES)).toBeNull();
    expect(roleNameIssue('Estagiário', ROLES, CUSTOM_A)).toBeNull();
    expect(roleNameIssue('Consulta', ROLES, CUSTOM_A)).toBe('taken');
    // A removed role's name is free again.
    expect(roleNameIssue('Antigo', [...ROLES, custom(CUSTOM_B, 'Antigo', [], '2026-11-22T10:00:00.000Z')])).toBeNull();
    expect(cleanRoleName('  Supervisor   de  campo ')).toBe('Supervisor de campo');
    expect(roleNameIssueText('empty')).toBe('Escreva o nome do papel.');
    expect(roleNameIssueText('too_long')).toBe('O nome tem no máximo 60 caracteres.');
    expect(roleNameIssueText('taken')).toBe('Já existe um papel com este nome.');
  });
});

describe('26.10-UNIT-003 roleChangeVerdict', () => {
  it('the Admin role refuses every change', () => {
    for (const change of [
      { kind: 'permissions', role_id: ADMIN.id, permissions: [] },
      { kind: 'rename', role_id: ADMIN.id, name: 'Chefe' },
      { kind: 'remove', role_id: ADMIN.id },
    ] as const) {
      expect(roleChangeVerdict(ROLES, [], change)).toEqual({ ok: false, reason: 'role_locked', details: {} });
    }
  });

  it('a seeded role takes any key set but refuses a rename and a removal', () => {
    expect(roleChangeVerdict(ROLES, [], { kind: 'permissions', role_id: CAMPO.id, permissions: ['relatorio.view', 'relatorio.create'] })).toEqual({ ok: true });
    expect(roleChangeVerdict(ROLES, [], { kind: 'permissions', role_id: CAMPO.id, permissions: [] })).toEqual({ ok: true });
    expect(roleChangeVerdict(ROLES, [], { kind: 'rename', role_id: CAMPO.id, name: 'Campo' })).toEqual({ ok: false, reason: 'role_locked', details: { system: true } });
    expect(roleChangeVerdict(ROLES, [], { kind: 'remove', role_id: GESTOR.id })).toEqual({ ok: false, reason: 'role_locked', details: { system: true } });
  });

  it('create and rename: the name rules', () => {
    expect(roleChangeVerdict(ROLES, [], { kind: 'create', name: 'Supervisor' })).toEqual({ ok: true });
    expect(roleChangeVerdict(ROLES, [], { kind: 'create', name: 'estagiário' })).toEqual({ ok: false, reason: 'role_name_taken' });
    expect(roleChangeVerdict(ROLES, [], { kind: 'create', name: '' })).toEqual({ ok: false, reason: 'role_name_invalid', details: { issue: 'empty' } });
    expect(roleChangeVerdict(ROLES, [], { kind: 'create', name: 'x'.repeat(61) })).toEqual({ ok: false, reason: 'role_name_invalid', details: { issue: 'too_long' } });
    expect(roleChangeVerdict(ROLES, [], { kind: 'rename', role_id: CUSTOM_A, name: 'Estagiário' })).toEqual({ ok: true });
    expect(roleChangeVerdict(ROLES, [], { kind: 'rename', role_id: CUSTOM_A, name: 'Gestor do projeto' })).toEqual({ ok: false, reason: 'role_name_taken' });
  });

  it('an unknown or removed role is role_not_found', () => {
    const removed = custom(CUSTOM_B, 'Removido', [], '2026-11-22T10:00:00.000Z');
    for (const change of [
      { kind: 'permissions', role_id: CUSTOM_B, permissions: [] },
      { kind: 'rename', role_id: CUSTOM_B, name: 'Outro' },
      { kind: 'remove', role_id: CUSTOM_B },
    ] as const) {
      expect(roleChangeVerdict(ROLES, [], change)).toEqual({ ok: false, reason: 'role_not_found' });
      expect(roleChangeVerdict([...ROLES, removed], [], change)).toEqual({ ok: false, reason: 'role_not_found' });
    }
  });

  it('remove: in use by 0, 1, 2 and 6 users; a removed user does not count; paused and invited do', () => {
    const remove = { kind: 'remove', role_id: CUSTOM_A } as const;
    expect(roleChangeVerdict(ROLES, [], remove)).toEqual({ ok: true });
    expect(roleChangeVerdict(ROLES, [user(1, 'Marcos Teixeira', CUSTOM_A, 'removed'), user(2, 'Outro', CAMPO.id)], remove)).toEqual({ ok: true });
    expect(roleChangeVerdict(ROLES, [user(1, 'Marcos Teixeira', CUSTOM_A)], remove)).toEqual({ ok: false, reason: 'role_in_use', details: { user_count: 1, user_names: ['Marcos Teixeira'] } });
    expect(roleChangeVerdict(ROLES, [user(1, 'Rita', CUSTOM_A, 'paused'), user(2, 'Ana', CUSTOM_A, 'invited')], remove)).toEqual({
      ok: false,
      reason: 'role_in_use',
      details: { user_count: 2, user_names: ['Ana', 'Rita'] },
    });
    const six = ['Fábio', 'Bia', 'Caio', 'Duda', 'Edu', 'Ana'].map((name, index) => user(index + 10, name, CUSTOM_A, 'active'));
    const verdict = roleChangeVerdict(ROLES, six, remove);
    expect(verdict).toEqual({ ok: false, reason: 'role_in_use', details: { user_count: 6, user_names: ['Ana', 'Bia', 'Caio', 'Duda', 'Edu', 'Fábio'] } });
  });
});

describe('26.10-UNIT-004 the seeded sets and the order of the columns', () => {
  it('restore answers the epic table for every seeded role but the Admin; a custom role has none', () => {
    for (const system of SYSTEM_ROLE_IDS) {
      const role = { ...systemRoleRow(system), permissions: ['relatorio.view'] as PermissionKey[] };
      if (system === 'admin') expect(restoredPermissions(role)).toBeNull();
      else expect(restoredPermissions(role)).toEqual(PERMISSION_KEYS.filter((key) => SYSTEM_ROLE_PERMISSIONS[system].includes(key)));
    }
    expect(restoredPermissions(ESTAGIARIO)).toBeNull();
    // A custom role carrying a `system` word under another id is no seeded role.
    expect(restoredPermissions({ ...ESTAGIARIO, system: 'consulta' })).toBeNull();
    expect(isAtSeededSet(CAMPO)).toBe(true);
    expect(isAtSeededSet({ ...CAMPO, permissions: ['relatorio.view'] })).toBe(false);
    expect(isAtSeededSet(ADMIN)).toBe(false);
  });

  it('orderRoles: seeded in the table order, then custom by id; removed ones left out', () => {
    const shuffled = [custom(CUSTOM_B, 'Zeta'), GESTOR, ESTAGIARIO, ADMIN, custom('019966c1-2610-7000-8000-00000000000c', 'Fora', [], '2026-11-22T10:00:00.000Z'), ...systemRoleRows().slice(3), CAMPO];
    expect(orderRoles(shuffled).map((role) => role.name)).toEqual(['Admin', 'Engenheiro de Campo', 'Gestor do Projeto', 'Responsável Técnico', 'Consulta', 'Estagiário', 'Zeta']);
  });

  it('normalizeKeys dedupes and orders by the catalog', () => {
    expect(normalizeKeys(['roles.manage', 'relatorio.view', 'roles.manage', 'relatorio.fill'])).toEqual(['relatorio.view', 'relatorio.fill', 'roles.manage']);
  });
});

describe('26.10-UNIT-005 module switches and key switches', () => {
  it('on, off and mixed with its count', () => {
    expect(moduleState(['relatorio.view', 'relatorio.fill'], 'relatorios')).toEqual({ state: 'mixed', held: 1, total: 3 });
    expect(moduleState(PERMISSION_KEYS, 'relatorios')).toEqual({ state: 'on', held: 3, total: 3 });
    expect(moduleState([], 'emissao')).toEqual({ state: 'off', held: 0, total: 2 });
    expect(moduleState(['relatorio.fill'], 'preenchimento')).toEqual({ state: 'on', held: 1, total: 1 });
  });

  it('a tap: mixed gives the whole module, on takes it, off gives it; other modules untouched', () => {
    const mixed: PermissionKey[] = ['relatorio.view', 'export.download'];
    expect(toggleModule(mixed, 'relatorios')).toEqual(['relatorio.view', 'relatorio.create', 'relatorio.delete', 'export.download']);
    expect(toggleModule(['relatorio.view', 'relatorio.create', 'relatorio.delete', 'export.download'], 'relatorios')).toEqual(['export.download']);
    expect(toggleModule(['export.download'], 'relatorios')).toEqual(['relatorio.view', 'relatorio.create', 'relatorio.delete', 'export.download']);
    expect(toggleModule(['export.download'], 'emissao')).toEqual(['relatorio.issue', 'export.download']);
    expect(toggleKey(['relatorio.view'], 'relatorio.create')).toEqual(['relatorio.view', 'relatorio.create']);
    expect(toggleKey(['relatorio.view', 'relatorio.create'], 'relatorio.view')).toEqual(['relatorio.create']);
  });

  it('the cells\' accessible names and the count', () => {
    expect(keyCellLabel('relatorio.create', 'Engenheiro de Campo', false)).toBe('Criar relatório — Engenheiro de Campo');
    expect(keyCellLabel('relatorio.create', 'Admin', true)).toBe('Criar relatório — Admin, sempre');
    expect(moduleCellLabel('relatorios', 'Engenheiro de Campo', false, moduleState(CAMPO.permissions, 'relatorios'))).toBe('Relatórios — Engenheiro de Campo, 1 de 3');
    expect(moduleCellLabel('relatorios', 'Gestor do Projeto', false, moduleState(GESTOR.permissions, 'relatorios'))).toBe('Relatórios — Gestor do Projeto');
    expect(moduleCellLabel('emissao', 'Admin', true, moduleState(PERMISSION_KEYS, 'emissao'))).toBe('Emissão — Admin, sempre');
  });
});

describe('26.10-UNIT-006 the unsaved changes and the bar', () => {
  it('no change, one, several; a role no longer in the list and the Admin count for nothing', () => {
    expect(gridChanges(ROLES, {})).toEqual([]);
    expect(gridChanges(ROLES, { [CAMPO.id]: CAMPO.permissions })).toEqual([]);
    expect(unsavedChangesText([])).toBeNull();
    const one = gridChanges(ROLES, { [CAMPO.id]: [...CAMPO.permissions, 'relatorio.create'] });
    expect(one).toEqual([{ role_id: CAMPO.id, role_name: 'Engenheiro de Campo', key: 'relatorio.create', on: true }]);
    expect(unsavedChangesText(one)).toBe('1 alteração não salva: Engenheiro de Campo · Criar relatório.');
    expect(gridChanges(ROLES, { [CUSTOM_B]: ['relatorio.view', 'relatorio.fill'], [ADMIN.id]: [] })).toEqual([]);
    const many = gridChanges(ROLES, { [CUSTOM_A]: ['relatorio.view'], [CAMPO.id]: [...CAMPO.permissions, 'relatorio.create'] });
    // Column order (Campo before Estagiário), then the catalog's.
    expect(many.map((change) => [change.role_name, change.key, change.on])).toEqual([
      ['Engenheiro de Campo', 'relatorio.create', true],
      ['Estagiário', 'relatorio.fill', false],
    ]);
    expect(unsavedChangesText(many)).toBe('2 alterações não salvas.');
    expect(changedRolePermissions(ROLES, { [CUSTOM_A]: ['relatorio.view'], [CAMPO.id]: [...CAMPO.permissions, 'relatorio.create'], [GESTOR.id]: GESTOR.permissions })).toEqual([
      { id: CAMPO.id, permissions: ['relatorio.view', 'relatorio.create', 'relatorio.fill'] },
      { id: CUSTOM_A, permissions: ['relatorio.view'] },
    ]);
  });

  it('a change that gives users.manage or roles.manage is said before saving; taking it away is not', () => {
    expect(managementGrantText(gridChanges(ROLES, { [CAMPO.id]: [...CAMPO.permissions, 'relatorio.create'] }))).toBeNull();
    expect(managementGrantText(gridChanges(ROLES, { [CAMPO.id]: [...CAMPO.permissions, 'users.manage', 'roles.manage'] }))).toBe(
      'Engenheiro de Campo passa a poder mudar usuários e papéis, inclusive os próprios.',
    );
    expect(managementGrantText(gridChanges(ROLES, { [CAMPO.id]: [...CAMPO.permissions, 'roles.manage'], [CUSTOM_A]: [...ESTAGIARIO.permissions, 'users.manage'] }))).toBe(
      'Engenheiro de Campo e Estagiário passam a poder mudar usuários e papéis, inclusive os próprios.',
    );
    const withManage = custom(CUSTOM_B, 'Chefe', ['relatorio.view', 'users.manage']);
    expect(managementGrantText(gridChanges([...ROLES, withManage], { [CUSTOM_B]: ['relatorio.view'] }))).toBeNull();
  });

  it('the head line, the in-use refusal and the locked refusal', () => {
    expect(roleHeadMeta(1, false)).toBe('1 usuário');
    expect(roleHeadMeta(2, false)).toBe('2 usuários');
    expect(roleHeadMeta(0, false)).toBe('0 usuários');
    expect(roleHeadMeta(1, true)).toBe('1 usuário · criado');
    expect(roleInUseText({ user_count: 1, user_names: ['Marcos Teixeira'] })).toBe('1 usuário tem este papel: Marcos Teixeira. Mude o papel dele em Usuários e tente de novo.');
    expect(roleInUseText({ user_count: 2, user_names: ['Ana', 'Rita'] })).toBe('2 usuários têm este papel: Ana e Rita. Mude o papel deles em Usuários e tente de novo.');
    expect(roleInUseText({ user_count: 6, user_names: ['Ana', 'Bia', 'Caio', 'Duda', 'Edu', 'Fábio'] })).toBe(
      '6 usuários têm este papel: Ana, Bia, Caio, Duda, Edu e mais 1. Mude o papel deles em Usuários e tente de novo.',
    );
    expect(roleInUseText({ user_count: 5, user_names: ['Ana', 'Bia', 'Caio', 'Duda', 'Edu'] })).toBe('5 usuários têm este papel: Ana, Bia, Caio, Duda e Edu. Mude o papel deles em Usuários e tente de novo.');
    expect(roleLockedText({ system: true })).toBe('Papel do sistema: não pode ser renomeado nem removido.');
    expect(roleLockedText({})).toContain('Admin tem todas as permissões, sempre.');
    expect(roleLockedText(undefined)).toContain('Admin tem todas as permissões, sempre.');
  });
});
