import {
  ADMIN_ROLE_ID,
  ADMIN_ROLE_ROUTES,
  ADMIN_USER_ROUTES,
  adminRoleListResponseSchema,
  adminRoleRoutePath,
  adminUserRoutePath,
  errorResponseSchema,
  PERMISSION_KEYS,
  restoredPermissions,
  roleFieldPath,
  rolePath,
  sheetObservationsPath,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLE_ROW_IDS,
  systemRoleRow,
  type AdminRoleEvent,
  type AdminRoleView,
  type PermissionKey,
} from '@app/domain';
import { and, eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminHarness, db, sql, type Person } from '../admin/admin.test-support.ts';
import { entities, ops } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { routeHarness, type Company } from '../sync/rules.test-support.ts';

/*
 * Story 26.10 (AD-29): the Admin's role routes, in process over the real auth and database with the
 * origin guard on; the pushes go through the compose api with real sessions.
 * - 26.10-API-001: each route, its ops (paths, actor `system:admin`, values) and its refusals: the
 *   Admin role on every change, a seeded rename and remove, a duplicate name in any case and with
 *   accents, an empty and a 61-character name, a role in use, an unknown id, another company's id, an
 *   unchanged request that writes no op, the restore to the epic's table.
 * - 26.10-API-002: a custom role "Estagiário" held by a user fills, loses `relatorio.fill` and is
 *   refused `op_forbidden`; the Engenheiro de Campo given `relatorio.create` creates; two creates of
 *   one name at once; Gestor do Projeto and Consulta 403 on every route, an inactive Admin 401.
 */

const roleEvents: AdminRoleEvent[] = [];
const h = adminHarness({ adminRoleEvents: (event) => void roleEvents.push(event) });

const CAMPO = SYSTEM_ROLE_ROW_IDS.engenheiro_de_campo;
const GESTOR = SYSTEM_ROLE_ROW_IDS.gestor_do_projeto;

const ok = async (res: Response, status = 200) => {
  expect(res.status, await res.clone().text()).toBe(status);
  return adminRoleListResponseSchema.parse(await res.json()).roles;
};
const refusal = async (res: Response) => errorResponseSchema.parse(await res.json());
const list = async (cookie: string) => ok(await h.call(ADMIN_ROLE_ROUTES.list.path, { method: 'GET', cookie }));
const setPermissions = (roles: Array<{ id: string; permissions: PermissionKey[] }>, cookie: string) => h.json(ADMIN_ROLE_ROUTES.set_permissions.path, { roles }, { method: 'PATCH', cookie });
const create = (name: unknown, cookie: string) => h.json(ADMIN_ROLE_ROUTES.create.path, { name }, { cookie });
const rename = (id: string, name: unknown, cookie: string) => h.json(adminRoleRoutePath('rename', id), { name }, { method: 'PATCH', cookie });
const remove = (id: string, cookie: string) => h.json(adminRoleRoutePath('remove', id), {}, { cookie });
const giveRole = async (userId: string, roleId: string, cookie: string) => {
  const res = await h.json(adminUserRoutePath('edit', userId), { role_id: roleId }, { method: 'PATCH', cookie });
  expect(res.status, await res.clone().text()).toBe(200);
};

const opsAt = async (companyId: string, path: string) =>
  db.select({ kind: ops.kind, value: ops.value, actor: ops.actor_id, batch: ops.batch_id }).from(ops).where(and(eq(ops.company_id, companyId), eq(ops.path, path)));
const roleOpCount = async (companyId: string) => (await db.select({ seq: ops.seq }).from(ops).where(and(eq(ops.company_id, companyId), like(ops.path, 'role/%')))).length;
const byName = (roles: AdminRoleView[], name: string) => roles.find((role) => role.name === name);
const tableSet = (system: keyof typeof SYSTEM_ROLE_PERMISSIONS) => PERMISSION_KEYS.filter((key) => SYSTEM_ROLE_PERMISSIONS[system].includes(key));

afterAll(async () => {
  await h.cleanup();
  await sql.end();
});

describe('26.10-API-001 each route', () => {
  const companyId = h.company();
  const otherId = h.company();
  let admin: Person;
  let cookie = '';
  let otherCookie = '';

  beforeAll(async () => {
    admin = await h.seedPerson(companyId, 'admin', 'Bruno Matsui');
    await h.seedPerson(companyId, 'engenheiro_de_campo', 'Carla Campos');
    const other = await h.seedPerson(otherId, 'admin', 'Otto Outra');
    cookie = await h.signIn(admin.email);
    otherCookie = await h.signIn(other.email);
  }, 60_000);

  it('list: the five seeded roles in the table order, the Admin locked with every key, each with its count of users', async () => {
    const roles = await list(cookie);
    expect(roles.map((role) => [role.name, role.system, role.locked, role.user_count])).toEqual([
      ['Admin', 'admin', true, 1],
      ['Engenheiro de Campo', 'engenheiro_de_campo', false, 1],
      ['Gestor do Projeto', 'gestor_do_projeto', false, 0],
      ['Responsável Técnico', 'responsavel_tecnico', false, 0],
      ['Consulta', 'consulta', false, 0],
    ]);
    expect(roles[0]!.permissions).toEqual([...PERMISSION_KEYS]);
    expect(byName(roles, 'Engenheiro de Campo')!.permissions).toEqual(tableSet('engenheiro_de_campo'));
  });

  it('set the keys: one put of role/{id}/permissions (normalized, system:admin); several roles are one batch; an unchanged set writes nothing', async () => {
    const roles = await ok(await setPermissions([{ id: CAMPO, permissions: ['relatorio.fill', 'relatorio.create', 'relatorio.view', 'relatorio.create'] }], cookie));
    expect(byName(roles, 'Engenheiro de Campo')!.permissions).toEqual(['relatorio.view', 'relatorio.create', 'relatorio.fill']);
    expect((await opsAt(companyId, roleFieldPath(CAMPO, 'permissions'))).map((op) => [op.kind, op.value, op.actor])).toEqual([
      ['put', ['relatorio.view', 'relatorio.create', 'relatorio.fill'], 'system:admin'],
    ]);
    expect(roleEvents.at(-1)).toEqual({ action: 'set_permissions', actor_id: admin.userId, company_id: companyId, role_id: CAMPO });

    // The same set again, and the Gestor's own set: no op.
    const before = await roleOpCount(companyId);
    const eventsBefore = roleEvents.length;
    await ok(await setPermissions([{ id: CAMPO, permissions: ['relatorio.view', 'relatorio.create', 'relatorio.fill'] }, { id: GESTOR, permissions: tableSet('gestor_do_projeto') }], cookie));
    expect(await roleOpCount(companyId)).toBe(before);
    expect(roleEvents.length).toBe(eventsBefore);

    // Two roles changed in one save: two puts under one batch id.
    await ok(await setPermissions([{ id: CAMPO, permissions: ['relatorio.view'] }, { id: GESTOR, permissions: ['relatorio.view', 'users.manage'] }], cookie));
    const campoLast = (await opsAt(companyId, roleFieldPath(CAMPO, 'permissions'))).at(-1)!;
    const gestorLast = (await opsAt(companyId, roleFieldPath(GESTOR, 'permissions'))).at(-1)!;
    expect(campoLast.batch).not.toBeNull();
    expect(gestorLast.batch).toBe(campoLast.batch);
    expect(gestorLast.value).toEqual(['relatorio.view', 'users.manage']);
  });

  it('restore: a seeded role takes the epic table again', async () => {
    const restored = restoredPermissions(systemRoleRow('gestor_do_projeto'))!;
    const roles = await ok(await setPermissions([{ id: GESTOR, permissions: restored }, { id: CAMPO, permissions: restoredPermissions(systemRoleRow('engenheiro_de_campo'))! }], cookie));
    expect(byName(roles, 'Gestor do Projeto')!.permissions).toEqual(tableSet('gestor_do_projeto'));
    expect(byName(roles, 'Engenheiro de Campo')!.permissions).toEqual(tableSet('engenheiro_de_campo'));
  });

  it('the Admin role refuses every change; a seeded role refuses a rename and a removal; nothing is written', async () => {
    const before = await roleOpCount(companyId);
    for (const res of [await setPermissions([{ id: ADMIN_ROLE_ID, permissions: ['relatorio.view'] }], cookie), await setPermissions([{ id: CAMPO, permissions: ['relatorio.view', 'relatorio.create'] }, { id: ADMIN_ROLE_ID, permissions: [...PERMISSION_KEYS] }], cookie), await rename(ADMIN_ROLE_ID, 'Chefe', cookie), await remove(ADMIN_ROLE_ID, cookie)]) {
      expect(res.status).toBe(409);
      expect(await refusal(res)).toMatchObject({ code: 'role_locked' });
    }
    for (const res of [await rename(CAMPO, 'Campo', cookie), await remove(GESTOR, cookie)]) {
      expect(res.status).toBe(409);
      expect(await refusal(res)).toMatchObject({ code: 'role_locked', details: { system: true } });
    }
    // The save with the Admin role beside a real change wrote nothing at all (atomic).
    expect(await roleOpCount(companyId)).toBe(before);
    expect(byName(await list(cookie), 'Engenheiro de Campo')!.permissions).toEqual(tableSet('engenheiro_de_campo'));
  });

  let estagiarioId = '';

  it('create: a role/{id} create with "Ver relatórios" only, no system, live; the name trimmed and collapsed', async () => {
    const roles = await ok(await create('  Estagiário   de campo ', cookie), 201);
    expect(roles.map((role) => role.name)).toEqual(['Admin', 'Engenheiro de Campo', 'Gestor do Projeto', 'Responsável Técnico', 'Consulta', 'Estagiário de campo']);
    const created = roles.at(-1)!;
    estagiarioId = created.id;
    expect(created).toEqual({ id: estagiarioId, name: 'Estagiário de campo', system: null, permissions: ['relatorio.view'], locked: false, user_count: 0 });
    expect((await opsAt(companyId, rolePath(estagiarioId))).map((op) => [op.kind, op.value, op.actor])).toEqual([
      ['create', { id: estagiarioId, name: 'Estagiário de campo', permissions: ['relatorio.view'], removed_at: null }, 'system:admin'],
    ]);
    expect(roleEvents.at(-1)).toEqual({ action: 'create', actor_id: admin.userId, company_id: companyId, role_id: estagiarioId });
    // Ids only in the events.
    expect(JSON.stringify(roleEvents)).not.toContain('Estagiário');
  });

  it('a name taken in any case or accent, a seeded name, an empty or 61-character name are refused; a body of the wrong shape is 400', async () => {
    const before = await roleOpCount(companyId);
    for (const name of ['estagiario de campo', 'ESTAGIÁRIO DE CAMPO', 'Estagiário  de  Campo', 'consulta', 'ADMIN']) {
      const res = await create(name, cookie);
      expect(res.status, name).toBe(409);
      expect((await refusal(res)).code, name).toBe('role_name_taken');
    }
    for (const [name, issue] of [
      ['', 'empty'],
      ['   ', 'empty'],
      ['x'.repeat(61), 'too_long'],
    ] as const) {
      const res = await create(name, cookie);
      expect(res.status).toBe(409);
      expect(await refusal(res)).toMatchObject({ code: 'role_name_invalid', details: { issue } });
    }
    // Exactly 60 characters is a name.
    const sixty = await ok(await create('y'.repeat(60), cookie), 201);
    const sixtyId = byName(sixty, 'y'.repeat(60))!.id;
    expect((await ok(await remove(sixtyId, cookie))).map((role) => role.id)).not.toContain(sixtyId);
    for (const res of [
      await h.json(ADMIN_ROLE_ROUTES.create.path, {}, { cookie }),
      await create(42, cookie),
      await h.json(ADMIN_ROLE_ROUTES.set_permissions.path, { roles: [] }, { method: 'PATCH', cookie }),
      await h.json(ADMIN_ROLE_ROUTES.set_permissions.path, { roles: [{ id: CAMPO, permissions: ['relatorio.voar'] }] }, { method: 'PATCH', cookie }),
      await h.json(ADMIN_ROLE_ROUTES.set_permissions.path, { roles: [{ id: CAMPO, permissions: [] }, { id: CAMPO, permissions: [] }] }, { method: 'PATCH', cookie }),
    ]) {
      expect(res.status).toBe(400);
      expect((await refusal(res)).code).toBe('invalid_request');
    }
    // The 60-character role was created and removed: two ops, nothing else.
    expect(await roleOpCount(companyId)).toBe(before + 2);
  });

  it('rename: a put of role/{id}/name; its own name writes nothing; another role\'s name is taken', async () => {
    const roles = await ok(await rename(estagiarioId, 'Estagiário', cookie));
    expect(byName(roles, 'Estagiário')?.id).toBe(estagiarioId);
    expect((await opsAt(companyId, roleFieldPath(estagiarioId, 'name'))).map((op) => [op.value, op.actor])).toEqual([['Estagiário', 'system:admin']]);
    const before = await roleOpCount(companyId);
    await ok(await rename(estagiarioId, ' Estagiário ', cookie));
    expect(await roleOpCount(companyId)).toBe(before);
    const taken = await rename(estagiarioId, 'gestor do projeto', cookie);
    expect(taken.status).toBe(409);
    expect((await refusal(taken)).code).toBe('role_name_taken');
  });

  it('remove: refused while a user holds the role, with the count and the names; then a tombstone, out of the list and of every route', async () => {
    const holder = await h.seedPerson(companyId, 'consulta', 'Marcos Teixeira');
    await giveRole(holder.userId, estagiarioId, cookie);
    expect(byName(await list(cookie), 'Estagiário')!.user_count).toBe(1);
    const refused = await remove(estagiarioId, cookie);
    expect(refused.status).toBe(409);
    expect(await refusal(refused)).toMatchObject({ code: 'role_in_use', details: { user_count: 1, user_names: ['Marcos Teixeira'] } });

    // A removed user does not hold it (reading open to the owner).
    await h.json(adminUserRoutePath('remove', holder.userId), {}, { cookie });
    const roles = await ok(await remove(estagiarioId, cookie));
    expect(roles.map((role) => role.id)).not.toContain(estagiarioId);
    const [tombstone] = await opsAt(companyId, roleFieldPath(estagiarioId, 'removed_at'));
    expect(tombstone).toMatchObject({ kind: 'put', actor: 'system:admin' });
    expect(typeof tombstone!.value).toBe('string');
    // Nothing is deleted: the row stays with its removed_at.
    const [row] = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.company_id, companyId), eq(entities.entity, 'role'), eq(entities.id, estagiarioId)));
    expect(row?.row).toMatchObject({ id: estagiarioId, name: 'Estagiário', removed_at: tombstone!.value });

    for (const res of [await remove(estagiarioId, cookie), await rename(estagiarioId, 'Outro', cookie), await setPermissions([{ id: estagiarioId, permissions: [] }], cookie)]) {
      expect(res.status).toBe(404);
      expect((await refusal(res)).code).toBe('role_not_found');
    }
  });

  it('an unknown id and another company\'s role are role_not_found 404, and nothing changes there', async () => {
    const theirs = byName(await ok(await create('Papel da outra', otherCookie), 201), 'Papel da outra')!;
    const before = await roleOpCount(otherId);
    for (const res of [
      await remove(theirs.id, cookie),
      await rename(theirs.id, 'Tomado', cookie),
      await setPermissions([{ id: theirs.id, permissions: [...PERMISSION_KEYS] }], cookie),
      await remove(newId(), cookie),
      await rename('nao-e-um-id', 'X', cookie),
    ]) {
      expect(res.status).toBe(404);
      expect((await refusal(res)).code).toBe('role_not_found');
    }
    expect(await roleOpCount(otherId)).toBe(before);
    expect((await list(cookie)).map((role) => role.id)).not.toContain(theirs.id);
    // A name is unique in its company only.
    await ok(await create('Papel da outra', cookie), 201);
  });
});

describe('26.10-API-002 the keys reach the push; races; who may call', () => {
  const companyId = h.company();
  let admin: Person;
  let cookie = '';
  const harness = routeHarness('tablet-admin-roles');
  const asCompany = (person: Person) => ({ companyId: person.companyId, email: person.email, userId: person.userId }) as unknown as Company;

  beforeAll(async () => {
    admin = await h.seedPerson(companyId, 'admin', 'Ana Admin');
    cookie = await h.signIn(admin.email);
  }, 60_000);

  afterAll(async () => {
    await harness.cleanup();
  });

  it(
    '"Estagiário" with view and fill: its user\'s reading is accepted; the Admin takes relatorio.fill; the same kind of reading is refused op_forbidden',
    async () => {
      const seeded = await harness.seedRelatorio(asCompany(admin));
      const blockId = seeded.blocks[0]!.id;
      const created = await ok(await create('Estagiário', cookie), 201);
      const estagiario = byName(created, 'Estagiário')!;
      await ok(await setPermissions([{ id: estagiario.id, permissions: ['relatorio.view', 'relatorio.fill'] }], cookie));
      const intern = await h.seedPerson(companyId, 'consulta', 'Ivo Estagiário');
      await giveRole(intern.userId, estagiario.id, cookie);

      const reading = (text: string) => harness.clientOp(asCompany(intern), { kind: 'put', path: sheetObservationsPath(blockId), relatorio_id: seeded.relatorioId, value: text });
      const first = reading('Leitura do estagiário');
      expect((await harness.push(asCompany(intern), [first])).rejected).toEqual([]);

      await ok(await setPermissions([{ id: estagiario.id, permissions: ['relatorio.view'] }], cookie));
      const second = reading('Outra leitura');
      expect((await harness.push(asCompany(intern), [second])).rejected).toEqual([{ op_id: second.op_id, code: 'op_forbidden' }]);
      expect(await harness.logged(second.op_id)).toBe(false);
    },
    120_000,
  );

  it(
    'the Engenheiro de Campo is refused a create; given relatorio.create, his create is accepted',
    async () => {
      const campo = await h.seedPerson(companyId, 'engenheiro_de_campo', 'Carla Campos');
      const projectCreate = () => {
        const projectId = newId();
        return harness.clientOp(asCompany(campo), { kind: 'create', scope: 'company', path: `project/${projectId}`, value: { id: projectId, client_id: null, name: 'Obra do campo', site: null, removed_at: null } });
      };
      const refused = projectCreate();
      expect((await harness.push(asCompany(campo), [refused])).rejected).toEqual([{ op_id: refused.op_id, code: 'op_forbidden' }]);

      await ok(await setPermissions([{ id: CAMPO, permissions: [...tableSet('engenheiro_de_campo'), 'relatorio.create'] }], cookie));
      // The create of "Novo relatório" (the obra first, as 26.4-API-001 reads `relatorio.create`).
      const accepted = projectCreate();
      const result = await harness.push(asCompany(campo), [accepted]);
      expect(result.rejected).toEqual([]);
      expect(result.applied.map((a) => a.op_id)).toEqual([accepted.op_id]);
    },
    120_000,
  );

  it('two creates of one name at once: one 201 and one 409 role_name_taken, one role', async () => {
    const answers = await Promise.all([create('Supervisor', cookie), create('supervisor', cookie)]);
    expect(answers.map((res) => res.status).sort()).toEqual([201, 409]);
    const loser = answers.find((res) => res.status === 409)!;
    expect((await refusal(loser)).code).toBe('role_name_taken');
    expect((await list(cookie)).filter((role) => role.name.toLowerCase() === 'supervisor')).toHaveLength(1);
  });

  it('a Gestor do Projeto and a Consulta get 403 forbidden on every route; an inactive Admin gets 401 user_inactive', async () => {
    const everyRoute = (who: string): Array<() => Promise<Response>> => [
      () => h.call(ADMIN_ROLE_ROUTES.list.path, { method: 'GET', cookie: who }),
      () => setPermissions([{ id: CAMPO, permissions: ['relatorio.view'] }], who),
      () => create('Papel proibido', who),
      () => rename(CAMPO, 'Outro', who),
      () => remove(CAMPO, who),
    ];
    const before = await roleOpCount(companyId);
    for (const role of ['gestor_do_projeto', 'consulta'] as const) {
      const person = await h.seedPerson(companyId, role, `Pessoa ${role}`);
      const personCookie = await h.signIn(person.email);
      for (const call of everyRoute(personCookie)) {
        const res = await call();
        expect(res.status).toBe(403);
        expect((await refusal(res)).code).toBe('forbidden');
      }
    }
    const second = await h.seedPerson(companyId, 'admin', 'Sara Segunda');
    const secondCookie = await h.signIn(second.email);
    await h.putStatus(second, 'paused');
    for (const call of everyRoute(secondCookie)) {
      const res = await call();
      expect(res.status).toBe(401);
      expect((await refusal(res)).code).toBe('user_inactive');
    }
    expect(await roleOpCount(companyId)).toBe(before);
    // The users route is not this one: the Gestor holds no roles.manage, the Admin holds both.
    expect((await h.call(ADMIN_USER_ROUTES.list.path, { method: 'GET', cookie })).status).toBe(200);
  });
});
