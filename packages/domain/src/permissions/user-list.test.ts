import { describe, expect, it } from 'vitest';
import { systemRoleRow, systemRoleRows, type RoleRow } from './roles.ts';
import { USER_STATUSES, userStatusLabel } from './user.ts';
import {
  filterUserList,
  lastAdminText,
  linkLifeText,
  reactivateNeedsRole,
  roleModulesText,
  roleOriginText,
  USER_ROW_ACTIONS,
  USER_STATUS_FILTERS,
  userActionDoneText,
  userChangeLeavesNoAdmin,
  userDirectory,
  userDirectoryRoles,
  userLastAccessText,
  userListCountText,
  userRowActionDestructive,
  userRowActionLabel,
  userRowActions,
  userRowDetailText,
  userStatusPillId,
  userStatusPillLabel,
  type UserListEntry,
} from './user-list.ts';

/*
 * Story 26.9 (`92-usuarios.html`): the Usuários screen's words and rules, computed once in the kernel.
 */

const A = '019966b0-0269-7000-8000-0000000000a1';
const B = '019966b0-0269-7000-8000-0000000000a2';
const C = '019966b0-0269-7000-8000-0000000000a3';
const D = '019966b0-0269-7000-8000-0000000000a4';
const admin = systemRoleRow('admin');
const campo = systemRoleRow('engenheiro_de_campo');
const consulta = systemRoleRow('consulta');
const estagiario: RoleRow = { id: '019966b0-0269-7000-8000-0000000000c1', name: 'Estagiário', permissions: ['relatorio.view', 'relatorio.fill'], removed_at: null };

const entry = (id: string, name: string, status: UserListEntry['status'], role: RoleRow | null): UserListEntry => ({
  id,
  name,
  email: `${name.toLowerCase()}@exemplo.com.br`,
  status,
  role_id: role?.id ?? null,
  role_name: role?.name ?? null,
  last_sign_in: null,
});

describe('26.9-UNIT-001 the pill words and the Situação filter', () => {
  it('the frame\'s four pill words beside the untouched kernel word', () => {
    expect(USER_STATUSES.map(userStatusPillLabel)).toEqual(['Ativo', 'Convite pendente', 'Pausado', 'Removido']);
    expect(USER_STATUSES.map(userStatusPillId)).toEqual(['ativo', 'convite', 'pausado', 'removido']);
    expect(userStatusLabel('invited')).toBe('Convidado');
  });

  it('the chips in the frame\'s order, "Todos" first', () => {
    expect(USER_STATUS_FILTERS).toEqual([
      { id: 'todos', label: 'Todos' },
      { id: 'ativo', label: 'Ativo' },
      { id: 'convite', label: 'Convite pendente' },
      { id: 'pausado', label: 'Pausado' },
      { id: 'removido', label: 'Removido' },
    ]);
  });

  it('"Todos" leaves the removed out; each chip keeps its status; the role filter keeps its role', () => {
    const list = [entry(A, 'Ana', 'active', admin), entry(B, 'Bia', 'invited', campo), entry(C, 'Caio', 'paused', campo), entry(D, 'Davi', 'removed', consulta)];
    expect(filterUserList(list, { status: 'todos', roleId: null }).map((e) => e.id)).toEqual([A, B, C]);
    expect(filterUserList(list, { status: 'removido', roleId: null }).map((e) => e.id)).toEqual([D]);
    expect(filterUserList(list, { status: 'convite', roleId: null }).map((e) => e.id)).toEqual([B]);
    expect(filterUserList(list, { status: 'pausado', roleId: null }).map((e) => e.id)).toEqual([C]);
    expect(filterUserList(list, { status: 'todos', roleId: campo.id }).map((e) => e.id)).toEqual([B, C]);
    expect(filterUserList(list, { status: 'ativo', roleId: campo.id })).toEqual([]);
  });
});

describe('26.9-UNIT-002 the count line', () => {
  it('the frame\'s main line, with and without removed users', () => {
    expect(userListCountText({ filter: 'todos', shown: 7, removed: 1 })).toBe('7 usuários · 1 removido, no filtro Removido');
    expect(userListCountText({ filter: 'todos', shown: 1, removed: 2 })).toBe('1 usuário · 2 removidos, no filtro Removido');
    expect(userListCountText({ filter: 'ativo', shown: 3, removed: 0 })).toBe('3 usuários');
  });

  it('the Removido chip\'s sentence, singular as drawn and its plural', () => {
    expect(userListCountText({ filter: 'removido', shown: 1, removed: 1 })).toBe('1 usuário removido. O nome continua nos relatórios que ele preencheu ou assinou.');
    expect(userListCountText({ filter: 'removido', shown: 2, removed: 2 })).toBe('2 usuários removidos. Os nomes continuam nos relatórios que eles preencheram ou assinaram.');
  });
});

describe('26.9-UNIT-003 the row menu by status', () => {
  it('the frame\'s items in its order, Remover last', () => {
    expect(userRowActions('active', { isSelf: false }).map(userRowActionLabel)).toEqual(['Editar', 'Enviar redefinição de senha', 'Pausar', 'Remover']);
    expect(userRowActions('active', { isSelf: true }).map(userRowActionLabel)).toEqual(['Editar', 'Pausar', 'Remover']);
    expect(userRowActions('invited', { isSelf: false }).map(userRowActionLabel)).toEqual(['Editar', 'Reenviar convite', 'Remover']);
    expect(userRowActions('paused', { isSelf: false }).map(userRowActionLabel)).toEqual(['Editar', 'Reativar', 'Remover']);
    expect(userRowActions('removed', { isSelf: false }).map(userRowActionLabel)).toEqual(['Reativar']);
  });

  it('only Remover is destructive', () => {
    expect(USER_ROW_ACTIONS.filter(userRowActionDestructive)).toEqual(['remove']);
  });
});

describe('26.9-UNIT-004 the Toasts say when a change takes effect', () => {
  const who = { name: 'Eduardo Prado', email: 'eduardo@exemplo.com.br' };
  it('the frame\'s words for each action', () => {
    expect(userActionDoneText('create', who)).toBe('Convite enviado para eduardo@exemplo.com.br. Vale por 72 horas.');
    expect(userActionDoneText('edit', { ...who, roleChanged: true })).toBe('Eduardo Prado alterado. O aparelho dele segue o novo papel na próxima sincronização.');
    expect(userActionDoneText('edit', who)).toBe('Nome salvo.');
    expect(userActionDoneText('pause', who)).toBe('Eduardo Prado pausado. O aparelho dele para na próxima vez que falar com o servidor.');
    expect(userActionDoneText('remove', who)).toBe('Eduardo Prado removido. O aparelho dele para na próxima vez que falar com o servidor.');
    expect(userActionDoneText('reactivate', who)).toBe('Eduardo Prado reativado. Ele já pode entrar.');
    expect(userActionDoneText('resend_invitation', who)).toBe('Convite reenviado para eduardo@exemplo.com.br. Vale por 72 horas.');
    expect(userActionDoneText('send_reset', who)).toBe('Link enviado para eduardo@exemplo.com.br.');
  });

  it('a link\'s life in words', () => {
    expect(linkLifeText(1)).toBe('1 hora');
    expect(linkLifeText(72)).toBe('72 horas');
  });
});

describe('26.9-UNIT-005 the line under a name', () => {
  // 2026-11-21 15:00 in America/Sao_Paulo (UTC-3).
  const now = new Date('2026-11-21T18:00:00.000Z');
  it('today, an earlier day, never', () => {
    expect(userLastAccessText('2026-11-21T11:12:00.000Z', now)).toBe('último acesso hoje 08:12');
    expect(userLastAccessText('2026-11-19T19:40:00.000Z', now)).toBe('último acesso 19/11 16:40');
    expect(userLastAccessText(null, now)).toBe('');
    expect(userLastAccessText('nope', now)).toBe('');
  });

  it('the role, then the last access', () => {
    expect(userRowDetailText({ role_name: 'Admin', last_sign_in: '2026-11-21T11:12:00.000Z' }, now)).toBe('Admin · último acesso hoje 08:12');
    expect(userRowDetailText({ role_name: 'Consulta', last_sign_in: null }, now)).toBe('Consulta');
    expect(userRowDetailText({ role_name: null, last_sign_in: null }, now)).toBe('');
  });
});

describe('26.9-UNIT-006 the roles the dialog offers', () => {
  it('each seeded role names its modules as the frame does', () => {
    expect(systemRoleRows().map(roleModulesText)).toEqual([
      'Todas as permissões',
      'Relatórios (em parte) · Preenchimento em campo',
      'Relatórios · Preenchimento em campo · Emissão (em parte) · Templates · Tipos de equipamento · Cadastros',
      'Relatórios (em parte) · Preenchimento em campo · Emissão · Cadastros',
      'Relatórios (em parte) · Emissão (em parte)',
    ]);
    expect(roleModulesText(estagiario)).toBe('Relatórios (em parte) · Preenchimento em campo');
    expect(roleModulesText({ id: estagiario.id, permissions: [] })).toBe('Nenhuma permissão');
  });

  it('the five seeded roles first, as the device holds them, then the company\'s live roles by name', () => {
    const removed: RoleRow = { id: '019966b0-0269-7000-8000-0000000000c2', name: 'Antigo', permissions: [], removed_at: '2026-11-20T10:00:00.000Z' };
    const another: RoleRow = { id: '019966b0-0269-7000-8000-0000000000c3', name: 'Almoxarife', permissions: ['relatorio.view'], removed_at: null };
    expect(userDirectoryRoles([estagiario, removed, another]).map((r) => r.name)).toEqual([
      'Admin',
      'Engenheiro de Campo',
      'Gestor do Projeto',
      'Responsável Técnico',
      'Consulta',
      'Almoxarife',
      'Estagiário',
    ]);
    expect(userDirectoryRoles([]).map((r) => r.id)).toEqual(systemRoleRows().map((r) => r.id));
    expect(roleOriginText(estagiario)).toBe('criado pela empresa');
    expect(roleOriginText(admin)).toBeNull();
  });
});

describe('26.9-UNIT-007 the device rows overlaid by the route', () => {
  it('the view wins on status, role and name; a user the route lacks keeps his row; a view-only user is listed', () => {
    const users = [
      { id: A, name: 'Bruno', email: 'bruno@exemplo.com.br', role_id: admin.id },
      { id: B, name: 'Eduardo', email: 'eduardo@exemplo.com.br', role_id: campo.id, status: 'active' as const },
    ];
    const views = [
      { id: B, name: 'Eduardo Prado', email: 'eduardo@exemplo.com.br', status: 'paused' as const, role: { id: consulta.id, name: 'Consulta' }, last_sign_in: '2026-11-20T20:45:00.000Z' },
      { id: C, name: 'Fernanda', email: 'fernanda@exemplo.com.br', status: 'invited' as const, role: { id: campo.id, name: 'Engenheiro de Campo' }, last_sign_in: null },
    ];
    expect(userDirectory(users, systemRoleRows(), views)).toEqual([
      { id: A, name: 'Bruno', email: 'bruno@exemplo.com.br', status: 'active', role_id: admin.id, role_name: 'Admin', last_sign_in: null },
      { id: B, name: 'Eduardo Prado', email: 'eduardo@exemplo.com.br', status: 'paused', role_id: consulta.id, role_name: 'Consulta', last_sign_in: '2026-11-20T20:45:00.000Z' },
      { id: C, name: 'Fernanda', email: 'fernanda@exemplo.com.br', status: 'invited', role_id: campo.id, role_name: 'Engenheiro de Campo', last_sign_in: null },
    ]);
  });
});

describe('26.9-UNIT-008 the last Admin, before the route answers', () => {
  const roles = systemRoleRows();
  it('the only active Admin cannot pause, remove or lower himself; with a second Admin he can', () => {
    const one = [entry(A, 'Bruno', 'active', admin), entry(B, 'Eduardo', 'active', campo), entry(C, 'Paula', 'paused', admin)];
    expect(userChangeLeavesNoAdmin(one, roles, { user_id: A, status: 'paused' })).toBe(true);
    expect(userChangeLeavesNoAdmin(one, roles, { user_id: A, status: 'removed' })).toBe(true);
    expect(userChangeLeavesNoAdmin(one, roles, { user_id: A, role_id: campo.id })).toBe(true);
    expect(userChangeLeavesNoAdmin(one, roles, { user_id: A, role_id: admin.id })).toBe(false);
    expect(userChangeLeavesNoAdmin(one, roles, { user_id: B, status: 'paused' })).toBe(false);
    const two = [...one, entry(D, 'Rafael', 'active', admin)];
    expect(userChangeLeavesNoAdmin(two, roles, { user_id: A, status: 'removed' })).toBe(false);
  });

  it('the frame\'s sentence for himself, the authored one for another user', () => {
    expect(lastAdminText({ isSelf: true, name: 'Bruno' })).toBe('Você é o único Admin ativo. Dê o papel Admin a outra pessoa antes de pausar, remover ou mudar o seu papel.');
    expect(lastAdminText({ isSelf: false, name: 'Rafael' })).toBe('Rafael é o único Admin ativo. Dê o papel Admin a outra pessoa antes de pausar, remover ou mudar o papel dele.');
  });
});

describe('e26s-UNIT reactivateNeedsRole: whether a reactivation asks for a role first', () => {
  const removed: RoleRow = { id: '019966b0-0269-7000-8000-0000000000c2', name: 'Antigo', permissions: [], removed_at: '2026-11-20T10:00:00.000Z' };
  const live: RoleRow = { id: '019966b0-0269-7000-8000-0000000000c3', name: 'Almoxarife', permissions: ['relatorio.view'], removed_at: null };
  const unset: RoleRow = { id: '019966b0-0269-7000-8000-0000000000c4', name: 'Sem marca', permissions: [] };

  it('asks for a user with no role and for a role the device holds as removed', () => {
    expect(reactivateNeedsRole(null, [live])).toBe(true);
    expect(reactivateNeedsRole(removed.id, [removed, live])).toBe(true);
  });

  it('does not ask for a live role (removed_at null or absent) or for a role the device does not hold yet', () => {
    expect(reactivateNeedsRole(live.id, [removed, live])).toBe(false);
    expect(reactivateNeedsRole(unset.id, [unset])).toBe(false);
    expect(reactivateNeedsRole('019966b0-0269-7000-8000-0000000000c9', [removed, live])).toBe(false);
    expect(reactivateNeedsRole(systemRoleRow('consulta').id, [])).toBe(false);
  });
});
