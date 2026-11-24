import {
  ADMIN_ROLE_ROUTES,
  ADMIN_USER_ROUTES,
  adminRoleListResponseSchema,
  adminRoleRoutePath,
  adminUserListResponseSchema,
  adminUserResponseSchema,
  adminUserRoutePath,
  errorResponseSchema,
  INVITATION_LINK_HOURS,
  PRODUTO,
  relatorioSetupPath,
  SYSTEM_ROLE_ROW_IDS,
  userRolePath,
  type AdminUserRouteName,
} from '@app/domain';
import { and, asc, eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminHarness, auth, db, sql, type Person } from '../admin/admin.test-support.ts';
import { AdminUserError, createAdminUsersService } from '../admin/users.ts';
import { SESSION_EXPIRES_IN_SECONDS, SESSION_UPDATE_AGE_SECONDS } from '../auth/auth.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { roleOp } from '../db/roles.ts';
import { account, ops, session, user } from '../db/schema.ts';
import { createFakeEmailProvider } from '../email/fake.ts';
import { fakeEmailToken, readFakeEmails, waitForFakeEmail } from '../email/fake-store.ts';
import type { EmailProvider } from '../email/types.ts';
import { newId } from '../ids.ts';
import { now } from '../clock.ts';
import { applyServerBatch } from '../sync/apply.ts';
import { routeHarness, type Company } from '../sync/rules.test-support.ts';

/*
 * Story 26.8 (AD-29): the Admin's user routes, in process over the real auth and database with the
 * origin guard on.
 * - 26.8-API-001: each route, its happy path and its state refusals; the invitation to first sign-in.
 * - 26.8-API-002: the last Admin (alone; two requests at once; lowering himself) and a paused user
 *   (401 at once, back with the same password after "reactivate").
 * - e26r-API-001 to 003 (2026-11-22, review of Epic 26): a reactivation ends the kept sessions; the
 *   inert session of a paused user does not slide; a reactivation needs a live role.
 * - 26.8-API-003: Gestor and Consulta 403 on every route; the tenant 404 on every route; the duplicate
 *   e-mail (a removed user's included); the shared e-mail limit; a removed responsável still named.
 */

const h = adminHarness();
const PASSWORD = 'senha-do-convite-01';

const ok = async (res: Response, status = 200) => {
  expect(res.status, await res.clone().text()).toBe(status);
  return adminUserResponseSchema.parse(await res.json());
};
const codeOf = async (res: Response) => errorResponseSchema.parse(await res.json()).code;
const action = (route: Exclude<AdminUserRouteName, 'list' | 'create' | 'edit'>, id: string, cookie: string) => h.json(adminUserRoutePath(route, id), {}, { cookie });
const edit = (id: string, body: unknown, cookie: string) => h.json(adminUserRoutePath('edit', id), body, { method: 'PATCH', cookie });
const create = (body: unknown, cookie: string) => h.json(ADMIN_USER_ROUTES.create.path, body, { cookie });
const list = async (cookie: string) => {
  const res = await h.call(ADMIN_USER_ROUTES.list.path, { method: 'GET', cookie });
  expect(res.status).toBe(200);
  return adminUserListResponseSchema.parse(await res.json()).users;
};
// In applied order: `.at(-1)` is the latest op, never the heap order Postgres happens to return (e28v2).
const opsAt = async (companyId: string, path: string) =>
  db.select({ value: ops.value, actor: ops.actor_id, kind: ops.kind }).from(ops).where(and(eq(ops.company_id, companyId), eq(ops.path, path))).orderBy(asc(ops.seq));
const opCount = async (companyId: string, userId: string) => (await db.select({ seq: ops.seq }).from(ops).where(and(eq(ops.company_id, companyId), like(ops.path, `user/${userId}%`)))).length;

afterAll(async () => {
  await h.cleanup();
  await sql.end();
});

describe('26.8-API-001 each route', () => {
  const companyId = h.company();
  let admin: Person;
  let adminCookie = '';
  let campoId = '';
  const campoEmail = `campo-${companyId}@teste.local`;

  beforeAll(async () => {
    admin = await h.seedPerson(companyId, 'admin', 'Bruno Matsui');
    adminCookie = await h.signIn(admin.email);
    h.remember(campoEmail);
  }, 60_000);

  it('create: an Engenheiro de Campo is born invited with the role, one invitation is stored, and after the link he signs in holding that role', async () => {
    const res = await ok(await create({ name: ' Fernanda Rocha ', email: campoEmail.toUpperCase(), role_id: SYSTEM_ROLE_ROW_IDS.engenheiro_de_campo }, adminCookie), 201);
    campoId = res.user.id;
    expect(res.invitation).toBe('sent');
    expect(res.user).toMatchObject({ name: 'Fernanda Rocha', email: campoEmail, status: 'invited', role: { id: SYSTEM_ROLE_ROW_IDS.engenheiro_de_campo, name: 'Engenheiro de Campo' }, last_sign_in: null });
    expect((await list(adminCookie)).find((u) => u.id === campoId)?.status).toBe('invited');

    expect(await h.kernelOf({ companyId, userId: campoId })).toEqual({
      id: campoId,
      name: 'Fernanda Rocha',
      email: campoEmail,
      council: null,
      registration_number: null,
      title: null,
      photo_location_enabled: true,
      role_id: SYSTEM_ROLE_ROW_IDS.engenheiro_de_campo,
      status: 'invited',
    });
    expect(await opsAt(companyId, `user/${campoId}`)).toEqual([expect.objectContaining({ kind: 'create', actor: 'system:identity' })]);
    const [credential] = await db.select({ password: account.password, provider: account.providerId }).from(account).where(eq(account.userId, campoId));
    expect(credential?.provider).toBe('credential');
    expect(credential?.password).toBeTruthy();
    const [link] = await h.linksOf(campoId);
    expect(link!.expiresAt.getTime() - Date.now()).toBeGreaterThan(INVITATION_LINK_HOURS * 3600_000 - 120_000);

    const stored = await readFakeEmails(db, { to: campoEmail, purpose: 'invitation' });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.subject).toBe(`Convite para o ${PRODUTO}`);
    expect(stored[0]!.text).toContain(`Bruno Matsui convidou você para usar o ${PRODUTO} na empresa Empresa Exemplo, com o papel Engenheiro de Campo.`);
    expect(stored[0]!.text).toContain('https://app.example.com/definir-senha#');
    expect(h.events.at(-1)).toEqual({ action: 'create', actor_id: admin.userId, company_id: companyId, target_user_id: campoId, role_id: SYSTEM_ROLE_ROW_IDS.engenheiro_de_campo });

    expect((await h.json('/api/auth/reset-password', { token: fakeEmailToken(stored[0]!), newPassword: PASSWORD })).status).toBe(200);
    const cookie = await h.signIn(campoEmail, PASSWORD);
    expect((await h.call('/api/account', { method: 'GET', cookie })).status).toBe(200);
    const listed = (await list(adminCookie)).find((u) => u.id === campoId)!;
    expect(listed).toMatchObject({ status: 'active', role: { id: SYSTEM_ROLE_ROW_IDS.engenheiro_de_campo } });
    expect(listed.last_sign_in).not.toBeNull();
    // He holds the role: no Admin route for him.
    expect((await h.call(ADMIN_USER_ROUTES.list.path, { method: 'GET', cookie })).status).toBe(403);
  });

  it('list: every user of the company with name, e-mail, role, status and last sign-in, by name', async () => {
    const users = await list(adminCookie);
    expect(users.map((u) => u.name)).toEqual(['Bruno Matsui', 'Fernanda Rocha']);
    expect(users[0]).toMatchObject({ id: admin.userId, email: admin.email, role: { name: 'Admin' }, status: 'active' });
    expect(users[0]!.last_sign_in).not.toBeNull();
  });

  it('edit: the name updates the identity row and puts user/{id}/name; the role puts user/{id}/role_id; an unchanged field writes nothing', async () => {
    const before = await opCount(companyId, campoId);
    const renamed = await ok(await edit(campoId, { name: 'Fernanda R. Rocha' }, adminCookie));
    expect(renamed.user.name).toBe('Fernanda R. Rocha');
    const [identity] = await db.select({ name: user.name }).from(user).where(eq(user.id, campoId));
    expect(identity?.name).toBe('Fernanda R. Rocha');
    expect((await opsAt(companyId, `user/${campoId}/name`)).map((op) => [op.value, op.actor])).toEqual([['Fernanda R. Rocha', 'system:identity']]);
    const roled = await ok(await edit(campoId, { role_id: SYSTEM_ROLE_ROW_IDS.consulta }, adminCookie));
    expect(roled.user.role).toEqual({ id: SYSTEM_ROLE_ROW_IDS.consulta, name: 'Consulta' });
    expect((await opsAt(companyId, `user/${campoId}/role_id`)).map((op) => [op.value, op.actor])).toEqual([[SYSTEM_ROLE_ROW_IDS.consulta, 'system:admin']]);
    expect(await opCount(companyId, campoId)).toBe(before + 2);
    await ok(await edit(campoId, { name: 'Fernanda R. Rocha', role_id: SYSTEM_ROLE_ROW_IDS.consulta }, adminCookie));
    expect(await opCount(companyId, campoId)).toBe(before + 2);

    expect(await codeOf(await edit(campoId, { role_id: newId() }, adminCookie))).toBe('role_not_found');
    expect(await codeOf(await edit(newId(), { name: 'X' }, adminCookie))).toBe('user_not_found');
    const bad = await edit(campoId, {}, adminCookie);
    expect(bad.status).toBe(400);
    expect(await codeOf(bad)).toBe('invalid_request');
    expect(await codeOf(await create({ name: 'Sem papel', email: 'x', role_id: 'admin' }, adminCookie))).toBe('invalid_request');
  });

  it('pause, reactivate, remove: the state rules, the sessions kept and inert while paused, ended by reactivate, the same password after it', async () => {
    const cookie = await h.signIn(campoEmail, PASSWORD);
    const paused = await ok(await action('pause', campoId, adminCookie));
    expect(paused.user.status).toBe('paused');
    // 2026-11-22 (Matheus, Story 26.11): the sessions stay, and every request with them is refused as an inactive user.
    expect((await db.select({ id: session.id }).from(session).where(eq(session.userId, campoId))).length).toBeGreaterThan(0);
    const refusedAccount = await h.call('/api/account', { method: 'GET', cookie });
    expect(refusedAccount.status).toBe(401);
    expect(await codeOf(refusedAccount)).toBe('user_inactive');
    expect((await h.signInRaw(campoEmail, PASSWORD)).status).toBe(401);
    const twice = await action('pause', campoId, adminCookie);
    expect(twice.status).toBe(409);
    expect(errorResponseSchema.parse(await twice.json())).toMatchObject({ code: 'user_state_invalid', details: { status: 'paused' } });

    expect((await ok(await action('reactivate', campoId, adminCookie))).user.status).toBe('active');
    expect(await codeOf(await action('reactivate', campoId, adminCookie))).toBe('user_state_invalid');
    // 2026-11-22 (e26r, review of Epic 26; was "the kept session works again"): the reactivation
    // ended the kept sessions, so the old cookie is no session at all; the same password signs in.
    expect(await db.select({ id: session.id }).from(session).where(eq(session.userId, campoId))).toEqual([]);
    const ended = await h.call('/api/account', { method: 'GET', cookie });
    expect(ended.status).toBe(401);
    expect(await codeOf(ended)).toBe('unauthenticated');
    await h.signIn(campoEmail, PASSWORD);

    expect((await ok(await action('remove', campoId, adminCookie))).user.status).toBe('removed');
    expect(await codeOf(await action('remove', campoId, adminCookie))).toBe('user_state_invalid');
    expect(await codeOf(await edit(campoId, { name: 'Outra' }, adminCookie))).toBe('user_state_invalid');
    expect(await codeOf(await action('send_reset', campoId, adminCookie))).toBe('user_state_invalid');
    expect((await h.signInRaw(campoEmail, PASSWORD)).status).toBe(401);
    // Remove is a status: the identity row, the kernel row and its name stay.
    expect((await h.kernelOf({ companyId, userId: campoId }))?.name).toBe('Fernanda R. Rocha');
    expect((await ok(await action('reactivate', campoId, adminCookie))).user.status).toBe('active');
    await h.signIn(campoEmail, PASSWORD);
    // One usage event per action that passed, ids only.
    expect(h.events.slice(-4).map((e) => e.action)).toEqual(['pause', 'reactivate', 'remove', 'reactivate']);
    expect(JSON.stringify(h.events)).not.toContain(campoEmail);
    expect(JSON.stringify(h.events)).not.toContain('Fernanda');
  });

  it('resend the invitation: only for an invited user; the old link dies, a new 72-hour link and message', async () => {
    const email = `convite-${companyId}@teste.local`;
    h.remember(email);
    const created = await ok(await create({ name: 'Igor Convidado', email, role_id: SYSTEM_ROLE_ROW_IDS.consulta }, adminCookie), 201);
    const first = await waitForFakeEmail(db, { to: email, purpose: 'invitation' });
    const resent = await ok(await action('resend_invitation', created.user.id, adminCookie));
    expect(resent.invitation).toBe('sent');
    const messages = await readFakeEmails(db, { to: email, purpose: 'invitation' });
    expect(messages).toHaveLength(2);
    expect(await h.linksOf(created.user.id)).toHaveLength(1);
    const old = await h.json('/api/auth/reset-password', { token: fakeEmailToken(first), newPassword: PASSWORD });
    expect(old.status).toBe(400);
    expect((await h.json('/api/auth/reset-password', { token: fakeEmailToken(messages[1]!), newPassword: PASSWORD })).status).toBe(200);
    await h.signIn(email, PASSWORD);
    expect(await codeOf(await action('resend_invitation', created.user.id, adminCookie))).toBe('user_state_invalid');
    // An invitation is cancelled by remove.
    const other = await ok(await create({ name: 'Ivo Cancelado', email: `cancelado-${companyId}@teste.local`, role_id: SYSTEM_ROLE_ROW_IDS.consulta }, adminCookie), 201);
    h.remember(`cancelado-${companyId}@teste.local`);
    expect(await codeOf(await action('pause', other.user.id, adminCookie))).toBe('user_state_invalid');
    expect((await ok(await action('remove', other.user.id, adminCookie))).user.status).toBe('removed');
    expect(await h.linksOf(other.user.id)).toEqual([]);
  });

  it('send a password reset: an active or invited user gets a 1-hour link; a paused one is refused', async () => {
    const since = new Date(Date.now() - 1000);
    const sent = await ok(await action('send_reset', campoId, adminCookie));
    expect(sent.reset).toBe('sent');
    const message = await waitForFakeEmail(db, { to: campoEmail, purpose: 'reset', since });
    expect((await h.json('/api/auth/reset-password', { token: fakeEmailToken(message), newPassword: 'senha-redefinida-1' })).status).toBe(200);
    await h.signIn(campoEmail, 'senha-redefinida-1');
    await ok(await action('pause', campoId, adminCookie));
    expect(await codeOf(await action('send_reset', campoId, adminCookie))).toBe('user_state_invalid');
    expect(h.events.at(-1)).toEqual({ action: 'pause', actor_id: admin.userId, company_id: companyId, target_user_id: campoId });
  });

  it('a provider error keeps the created user and answers invitation failed', async () => {
    const failing: EmailProvider = { send: async () => Promise.reject(new Error('MessageRejected')) };
    const service = createAdminUsersService({ db, auth, email: failing, now, newId, appOrigin: 'https://app.example.com', events: () => undefined });
    const email = `falha-${companyId}@teste.local`;
    const result = await service.createUser({ userId: admin.userId, companyId: asCompanyId(companyId) }, { name: 'Falha Envio', email, role_id: SYSTEM_ROLE_ROW_IDS.consulta });
    expect(result.invitation).toBe('failed');
    expect(result.user.status).toBe('invited');
    expect(await readFakeEmails(db, { to: email })).toEqual([]);
    expect(await h.linksOf(result.user.id)).toHaveLength(1);
  });
});

describe('26.8-API-002 the last Admin and a paused user', () => {
  it('the only active Admin cannot pause, remove or lower himself; with a second Admin he can', async () => {
    const companyId = h.company();
    const ana = await h.seedPerson(companyId, 'admin', 'Ana Admin');
    const cookie = await h.signIn(ana.email);
    for (const res of [await action('pause', ana.userId, cookie), await action('remove', ana.userId, cookie), await edit(ana.userId, { role_id: SYSTEM_ROLE_ROW_IDS.consulta }, cookie)]) {
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('last_admin');
    }
    expect((await h.kernelOf(ana))?.status).toBe('active');
    const bia = await h.seedPerson(companyId, 'admin', 'Bia Admin');
    expect((await ok(await edit(ana.userId, { role_id: SYSTEM_ROLE_ROW_IDS.consulta }, cookie))).user.role?.name).toBe('Consulta');
    // Ana is no Admin any more: her next request is refused; Bia is the last one now.
    expect((await action('pause', bia.userId, cookie)).status).toBe(403);
    const biaCookie = await h.signIn(bia.email);
    expect(await codeOf(await action('pause', bia.userId, biaCookie))).toBe('last_admin');
  });

  it('two requests at once that would each leave one Admin cannot both pass (the company lock)', async () => {
    const companyId = h.company();
    const ana = await h.seedPerson(companyId, 'admin', 'Ana Admin');
    const bia = await h.seedPerson(companyId, 'admin', 'Bia Admin');
    const service = createAdminUsersService({ db, auth, email: createFakeEmailProvider(db), now, newId, appOrigin: 'https://app.example.com', events: () => undefined });
    const actor = { userId: ana.userId, companyId: asCompanyId(companyId) };
    const results = await Promise.allSettled([service.pauseUser(actor, bia.userId), service.editUser(actor, ana.userId, { role_id: SYSTEM_ROLE_ROW_IDS.consulta })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const refused = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(AdminUserError);
    expect((refused.reason as AdminUserError).code).toBe('last_admin');

    expect((await service.listUsers(actor)).filter((u) => u.role?.name === 'Admin' && u.status === 'active')).toHaveLength(1);

    // Through the routes too, in a company of exactly two Admins, each pausing the other at once. The
    // one that loses is refused under the lock (409 last_admin), or, when the winner's pause was
    // committed before his request was read, 401 user_inactive (2026-11-22: a pause keeps the
    // sessions, inert).
    const routeCompany = h.company();
    const caio = await h.seedPerson(routeCompany, 'admin', 'Caio Admin');
    const dora = await h.seedPerson(routeCompany, 'admin', 'Dora Admin');
    const [caioCookie, doraCookie] = [await h.signIn(caio.email), await h.signIn(dora.email)];
    const answers = await Promise.all([action('pause', dora.userId, caioCookie), action('pause', caio.userId, doraCookie)]);
    const statuses = answers.map((res) => res.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect([401, 409]).toContain(statuses.find((status) => status !== 200));
    const routeActor = { userId: caio.userId, companyId: asCompanyId(routeCompany) };
    expect((await service.listUsers(routeActor)).filter((u) => u.role?.name === 'Admin' && u.status === 'active')).toHaveLength(1);
  });

  it('an active user with an open session is paused: his next request is 401, and after reactivate he signs in again with the same password', async () => {
    const companyId = h.company();
    const ana = await h.seedPerson(companyId, 'admin', 'Ana Admin');
    const rui = await h.seedPerson(companyId, 'responsavel_tecnico', 'Rui Técnico');
    const adminCookie = await h.signIn(ana.email);
    const ruiCookie = await h.signIn(rui.email);
    expect((await h.call('/api/account', { method: 'GET', cookie: ruiCookie })).status).toBe(200);
    await ok(await action('pause', rui.userId, adminCookie));
    expect((await h.call('/api/account', { method: 'GET', cookie: ruiCookie })).status).toBe(401);
    expect(await codeOf(await h.signInRaw(rui.email))).toBe('user_inactive');
    await ok(await action('reactivate', rui.userId, adminCookie));
    const again = await h.signIn(rui.email);
    expect((await h.call('/api/account', { method: 'GET', cookie: again })).status).toBe(200);
  });

  it('26.11-API-001 a paused or removed user keeps his sessions and every path refuses them with user_inactive, get-session included; a reactivation ends them; sign-out still works', async () => {
    const companyId = h.company();
    const ana = await h.seedPerson(companyId, 'admin', 'Ana Admin');
    const rui = await h.seedPerson(companyId, 'responsavel_tecnico', 'Rui Técnico');
    const adminCookie = await h.signIn(ana.email);
    let ruiCookie = await h.signIn(rui.email);
    const probes: { method: 'GET' | 'POST'; path: string; body?: unknown }[] = [
      { method: 'GET', path: '/api/account' },
      { method: 'GET', path: '/api/auth/get-session' },
      { method: 'GET', path: '/api/sync/company?since=0' },
      { method: 'POST', path: '/api/sync/ops', body: { ops: [] } },
      { method: 'GET', path: '/api/files/019966b0-0270-7000-8000-0000000000f1/original' },
      { method: 'POST', path: '/api/telemetry', body: {} },
      { method: 'GET', path: '/api/admin/users' },
    ];
    const answers = async () =>
      Promise.all(
        probes.map(async (probe) => {
          const res =
            probe.method === 'GET' ? await h.call(probe.path, { method: 'GET', cookie: ruiCookie }) : await h.json(probe.path, probe.body, { cookie: ruiCookie });
          return { path: probe.path, status: res.status, code: res.status === 401 ? await codeOf(res) : null };
        }),
      );
    // Active: get-session answers (the session is live).
    expect((await h.call('/api/auth/get-session', { method: 'GET', cookie: ruiCookie })).status).toBe(200);
    for (const route of ['pause', 'remove'] as const) {
      await ok(await action(route, rui.userId, adminCookie));
      expect(await answers()).toEqual(probes.map((probe) => ({ path: probe.path, status: 401, code: 'user_inactive' })));
      expect((await db.select({ id: session.id }).from(session).where(eq(session.userId, rui.userId))).length).toBeGreaterThan(0);
      await ok(await action('reactivate', rui.userId, adminCookie));
      // 2026-11-22 (e26r, review of Epic 26; was "get-session answers 200 with the kept cookie"): the
      // reactivation deleted his sessions, so the old cookie answers 401 and get-session holds none;
      // the same password signs in again and that session is live.
      expect(await db.select({ id: session.id }).from(session).where(eq(session.userId, rui.userId))).toEqual([]);
      const ended = await h.call('/api/account', { method: 'GET', cookie: ruiCookie });
      expect(ended.status).toBe(401);
      expect(await codeOf(ended)).toBe('unauthenticated');
      expect(await (await h.call('/api/auth/get-session', { method: 'GET', cookie: ruiCookie })).json()).toBeNull();
      ruiCookie = await h.signIn(rui.email);
      expect((await h.call('/api/auth/get-session', { method: 'GET', cookie: ruiCookie })).status).toBe(200);
    }
    // Sign-out of a paused user ends only his own session.
    await ok(await action('pause', rui.userId, adminCookie));
    const out = await h.json('/api/auth/sign-out', {}, { cookie: ruiCookie });
    expect(out.status).toBe(200);
  });

  it('e26r-API-001 a reactivation ends every session of that user and no one else\'s', async () => {
    const companyId = h.company();
    const ana = await h.seedPerson(companyId, 'admin', 'Ana Admin');
    const rui = await h.seedPerson(companyId, 'responsavel_tecnico', 'Rui Técnico');
    const adminCookie = await h.signIn(ana.email);
    const first = await h.signIn(rui.email);
    const second = await h.signIn(rui.email);
    await ok(await action('pause', rui.userId, adminCookie));
    await ok(await action('reactivate', rui.userId, adminCookie));
    for (const cookie of [first, second]) expect(await codeOf(await h.call('/api/account', { method: 'GET', cookie }))).toBe('unauthenticated');
    // The Admin's own session is untouched.
    expect((await h.call('/api/account', { method: 'GET', cookie: adminCookie })).status).toBe(200);
    const again = await h.signIn(rui.email);
    expect((await h.call('/api/account', { method: 'GET', cookie: again })).status).toBe(200);
  });

  it('e26r-API-002 a paused user\'s request after the update age leaves session.expires_at as it was; an active user\'s slides', async () => {
    const companyId = h.company();
    const ana = await h.seedPerson(companyId, 'admin', 'Ana Admin');
    const rui = await h.seedPerson(companyId, 'responsavel_tecnico', 'Rui Técnico');
    const adminCookie = await h.signIn(ana.email);
    const ruiCookie = await h.signIn(rui.email);
    // The session as better-auth holds it two days after its last slide: the update age elapsed.
    const aged = new Date(Date.now() + (SESSION_EXPIRES_IN_SECONDS - 2 * SESSION_UPDATE_AGE_SECONDS) * 1000);
    aged.setMilliseconds(0);
    const age = async () => db.update(session).set({ expiresAt: aged }).where(eq(session.userId, rui.userId));
    const expiries = async () => (await db.select({ at: session.expiresAt }).from(session).where(eq(session.userId, rui.userId))).map((row) => row.at.getTime());

    await ok(await action('pause', rui.userId, adminCookie));
    await age();
    for (const path of ['/api/account', '/api/auth/get-session', '/api/sync/company?since=0']) {
      const res = await h.call(path, { method: 'GET', cookie: ruiCookie });
      expect(res.status, path).toBe(401);
      expect(await codeOf(res)).toBe('user_inactive');
    }
    expect(await expiries()).toEqual([aged.getTime()]);

    // The control: the same session of an active user past the update age slides on his next request.
    await h.putStatus(rui, 'active');
    await age();
    expect((await h.call('/api/account', { method: 'GET', cookie: ruiCookie })).status).toBe(200);
    const [slid] = await expiries();
    expect(slid).toBeGreaterThan(aged.getTime() + SESSION_UPDATE_AGE_SECONDS * 1000);
  });

  it('e26r-API-003 a user whose role was removed is not reactivated: role_not_found and nothing changes; given a live role, he is', async () => {
    const companyId = h.company();
    const ana = await h.seedPerson(companyId, 'admin', 'Ana Admin');
    const adminCookie = await h.signIn(ana.email);
    const created = await h.json(ADMIN_ROLE_ROUTES.create.path, { name: 'Estagiário' }, { cookie: adminCookie });
    expect(created.status, await created.clone().text()).toBe(201);
    const estagiario = adminRoleListResponseSchema.parse(await created.json()).roles.find((role) => role.name === 'Estagiário')!;
    const email = `estagiario-${companyId}@teste.local`;
    h.remember(email);
    const person = (await ok(await create({ name: 'Eva Estagiária', email, role_id: estagiario.id }, adminCookie), 201)).user;
    await ok(await action('remove', person.id, adminCookie));
    // A removed user holds no role for the role rules, so the role can be removed under him.
    const removed = await h.json(adminRoleRoutePath('remove', estagiario.id), {}, { cookie: adminCookie });
    expect(removed.status, await removed.clone().text()).toBe(200);

    const before = await opCount(companyId, person.id);
    const eventsBefore = h.events.length;
    const refused = await action('reactivate', person.id, adminCookie);
    expect(refused.status).toBe(404);
    expect(await codeOf(refused)).toBe('role_not_found');
    expect((await h.kernelOf({ companyId, userId: person.id }))?.status).toBe('removed');
    expect(await opCount(companyId, person.id)).toBe(before);
    expect(h.events).toHaveLength(eventsBefore);

    // A paused user whose role row does not resolve is refused the same; once the Admin gives him a role, he is reactivated.
    const rui = await h.seedPerson(companyId, 'responsavel_tecnico', 'Rui Técnico');
    await ok(await action('pause', rui.userId, adminCookie));
    const tenant = asCompanyId(companyId);
    await applyServerBatch(db, tenant, [roleOp(tenant, { kind: 'put', path: userRolePath(rui.userId), value: newId() })], { now });
    expect(await codeOf(await action('reactivate', rui.userId, adminCookie))).toBe('role_not_found');
    expect((await h.kernelOf(rui))?.status).toBe('paused');
    await ok(await edit(rui.userId, { role_id: SYSTEM_ROLE_ROW_IDS.consulta }, adminCookie));
    expect((await ok(await action('reactivate', rui.userId, adminCookie))).user).toMatchObject({ status: 'active', role: { name: 'Consulta' } });
  });
});

describe('e26s-API-001 the reactivation that carries a role (2026-11-22)', () => {
  const companyId = h.company();
  const otherId = h.company();
  let adminCookie = '';
  let otherCookie = '';
  let estagiarioId = '';
  let otherRoleId = '';
  const reactivate = (id: string, body: unknown, cookie: string) => h.json(adminUserRoutePath('reactivate', id), body, { cookie });
  const sessionsOf = async (userId: string) => (await db.select({ id: session.id }).from(session).where(eq(session.userId, userId))).length;

  /** A user of the company holding the custom role, then removed (the role goes under him in the test). */
  async function strand(name: string): Promise<Person> {
    const person = await h.seedPerson(companyId, 'consulta', name);
    await ok(await edit(person.userId, { role_id: estagiarioId }, adminCookie));
    await ok(await action('remove', person.userId, adminCookie));
    return person;
  }

  beforeAll(async () => {
    const admin = await h.seedPerson(companyId, 'admin', 'Ana Admin');
    adminCookie = await h.signIn(admin.email);
    const otherAdmin = await h.seedPerson(otherId, 'admin', 'Otto Outra');
    otherCookie = await h.signIn(otherAdmin.email);
    const made = await h.json(ADMIN_ROLE_ROUTES.create.path, { name: 'Estagiário' }, { cookie: adminCookie });
    expect(made.status, await made.clone().text()).toBe(201);
    estagiarioId = adminRoleListResponseSchema.parse(await made.json()).roles.find((role) => role.name === 'Estagiário')!.id;
    const madeOther = await h.json(ADMIN_ROLE_ROUTES.create.path, { name: 'De outra empresa' }, { cookie: otherCookie });
    expect(madeOther.status, await madeOther.clone().text()).toBe(201);
    otherRoleId = adminRoleListResponseSchema.parse(await madeOther.json()).roles.find((role) => role.name === 'De outra empresa')!.id;
  }, 60_000);

  it('a removed user whose role was removed: refused without a role, with a removed role and with another company\'s role, nothing changes; with a live role he is reactivated and signs in', async () => {
    const person = await strand('Eva Estagiária');
    // The role can only go once nobody active holds it.
    const gone = await h.json(adminRoleRoutePath('remove', estagiarioId), {}, { cookie: adminCookie });
    expect(gone.status, await gone.clone().text()).toBe(200);

    const before = await opCount(companyId, person.userId);
    const eventsBefore = h.events.length;
    const sessionsBefore = await sessionsOf(person.userId);
    for (const body of [{}, { role_id: estagiarioId }, { role_id: otherRoleId }, { role_id: newId() }]) {
      const refused = await reactivate(person.userId, body, adminCookie);
      expect(refused.status).toBe(404);
      expect(await codeOf(refused)).toBe('role_not_found');
    }
    expect((await h.kernelOf(person))?.status).toBe('removed');
    expect((await h.kernelOf(person))?.role_id).toBe(estagiarioId);
    expect(await opCount(companyId, person.userId)).toBe(before);
    expect(h.events).toHaveLength(eventsBefore);
    expect(await sessionsOf(person.userId)).toBe(sessionsBefore);

    const bad = await reactivate(person.userId, { role_id: 'consulta' }, adminCookie);
    expect(bad.status).toBe(400);
    expect(await codeOf(bad)).toBe('invalid_request');

    const done = await ok(await reactivate(person.userId, { role_id: SYSTEM_ROLE_ROW_IDS.gestor_do_projeto }, adminCookie));
    expect(done.user).toMatchObject({ id: person.userId, status: 'active', role: { id: SYSTEM_ROLE_ROW_IDS.gestor_do_projeto, name: 'Gestor do Projeto' } });
    expect(await h.kernelOf(person)).toMatchObject({ status: 'active', role_id: SYSTEM_ROLE_ROW_IDS.gestor_do_projeto });
    // One batch: the role op and the status op, both the Admin's, the role first.
    expect(await opCount(companyId, person.userId)).toBe(before + 2);
    expect((await opsAt(companyId, userRolePath(person.userId))).at(-1)).toMatchObject({ value: SYSTEM_ROLE_ROW_IDS.gestor_do_projeto, actor: 'system:admin' });
    expect((await opsAt(companyId, `user/${person.userId}/status`)).at(-1)).toMatchObject({ value: 'active', actor: 'system:admin' });
    expect(h.events.at(-1)).toMatchObject({ action: 'reactivate', target_user_id: person.userId, role_id: SYSTEM_ROLE_ROW_IDS.gestor_do_projeto });
    // The same password, and the new role is the one he holds.
    const cookie = await h.signIn(person.email);
    expect((await h.call('/api/account', { method: 'GET', cookie })).status).toBe(200);
    expect((await h.call(ADMIN_USER_ROUTES.list.path, { method: 'GET', cookie })).status).toBe(403);
  });

  it('a paused user is reactivated with a live role too; the same role as his own writes only the status; the last-Admin and state rules hold', async () => {
    const paused = await h.seedPerson(companyId, 'responsavel_tecnico', 'Rui Técnico');
    await ok(await action('pause', paused.userId, adminCookie));
    const before = await opCount(companyId, paused.userId);
    const same = await ok(await reactivate(paused.userId, { role_id: SYSTEM_ROLE_ROW_IDS.responsavel_tecnico }, adminCookie));
    expect(same.user).toMatchObject({ status: 'active', role: { name: 'Responsável Técnico' } });
    expect(await opCount(companyId, paused.userId)).toBe(before + 1);

    // An active user is not reactivated, with a role or without.
    expect(await codeOf(await reactivate(paused.userId, { role_id: SYSTEM_ROLE_ROW_IDS.consulta }, adminCookie))).toBe('user_state_invalid');
    expect((await h.kernelOf(paused))?.role_id).toBe(SYSTEM_ROLE_ROW_IDS.responsavel_tecnico);

    // A paused Admin comes back as an Admin or as another role; the active Admin stays.
    const second = await h.seedPerson(companyId, 'admin', 'Sara Segunda');
    await ok(await action('pause', second.userId, adminCookie));
    expect((await ok(await reactivate(second.userId, { role_id: SYSTEM_ROLE_ROW_IDS.consulta }, adminCookie))).user).toMatchObject({ status: 'active', role: { name: 'Consulta' } });

    // Another company's user is not found, with a role or without (the tenant refusal).
    const foreign = await h.seedPerson(otherId, 'consulta', 'Cora Consulta');
    await h.putStatus(foreign, 'paused');
    expect(await codeOf(await reactivate(foreign.userId, { role_id: SYSTEM_ROLE_ROW_IDS.consulta }, adminCookie))).toBe('user_not_found');
    expect((await h.kernelOf(foreign))?.status).toBe('paused');
  });
});

describe('26.8-API-003 roles, tenants, duplicates, the limit and history', () => {
  const companyId = h.company();
  const otherId = h.company();
  let admin: Person;
  let other: Person;
  let adminCookie = '';

  beforeAll(async () => {
    admin = await h.seedPerson(companyId, 'admin', 'Ana Admin');
    other = await h.seedPerson(otherId, 'admin', 'Otto Outra');
    adminCookie = await h.signIn(admin.email);
  }, 60_000);

  /** Every route, on `target` (each a call to make). */
  const everyRoute = (target: string, cookie: string): Array<() => Promise<Response>> => [
    () => h.call(ADMIN_USER_ROUTES.list.path, { method: 'GET', cookie }),
    () => create({ name: 'Novo', email: `novo-${newId()}@teste.local`, role_id: SYSTEM_ROLE_ROW_IDS.consulta }, cookie),
    () => edit(target, { name: 'Outro nome' }, cookie),
    () => action('pause', target, cookie),
    () => action('reactivate', target, cookie),
    () => action('remove', target, cookie),
    () => action('resend_invitation', target, cookie),
    () => action('send_reset', target, cookie),
  ];
  const callAll = (calls: Array<() => Promise<Response>>) => Promise.all(calls.map((call) => call()));

  it('a Gestor do Projeto and a Consulta get 403 forbidden on every route; an inactive Admin gets 401 user_inactive', async () => {
    const gestor = await h.seedPerson(companyId, 'gestor_do_projeto', 'Gustavo Gestor');
    const consulta = await h.seedPerson(companyId, 'consulta', 'Otávio Consulta');
    for (const person of [gestor, consulta]) {
      const cookie = await h.signIn(person.email);
      for (const res of await callAll(everyRoute(admin.userId, cookie))) {
        expect(res.status).toBe(403);
        expect(await codeOf(res)).toBe('forbidden');
      }
    }
    expect((await h.kernelOf(admin))?.name).toBe('Ana Admin');
    const second = await h.seedPerson(companyId, 'admin', 'Sara Segunda');
    const cookie = await h.signIn(second.email);
    await h.putStatus(second, 'paused');
    for (const res of await callAll(everyRoute(admin.userId, cookie))) {
      expect(res.status).toBe(401);
      expect(await codeOf(res)).toBe('user_inactive');
    }
    await h.putStatus(second, 'active');
  });

  it('an Admin of company A naming a user of company B gets 404 user_not_found on every route, and nothing changes', async () => {
    const before = await opCount(otherId, other.userId);
    // The six routes that name a user (the list and the create name none).
    for (const res of await callAll(everyRoute(other.userId, adminCookie).slice(2))) {
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('user_not_found');
    }
    expect(await opCount(otherId, other.userId)).toBe(before);
    expect((await h.kernelOf(other))?.status).toBe('active');
    expect(await readFakeEmails(db, { to: other.email })).toEqual([]);
    expect((await list(adminCookie)).map((u) => u.id)).not.toContain(other.userId);
  });

  it('an e-mail that already belongs to a user (this company, another one, a removed user) is user_email_taken: no message, no row', async () => {
    const removed = await h.seedPerson(companyId, 'consulta', 'Renato Removido');
    await ok(await action('remove', removed.userId, adminCookie));
    const cases: Array<[string, unknown]> = [
      [admin.email, { user_id: admin.userId, status: 'active' }],
      [removed.email.toUpperCase(), { user_id: removed.userId, status: 'removed' }],
      [other.email, undefined],
    ];
    for (const [email, details] of cases) {
      const since = new Date();
      const res = await create({ name: 'Duplicado', email, role_id: SYSTEM_ROLE_ROW_IDS.consulta }, adminCookie);
      expect(res.status).toBe(409);
      const body = errorResponseSchema.parse(await res.json());
      expect(body.code).toBe('user_email_taken');
      expect(body.details).toEqual(details);
      expect(await readFakeEmails(db, { to: email, since })).toEqual([]);
    }
    expect(await db.select({ id: user.id }).from(user).where(eq(user.name, 'Duplicado'))).toEqual([]);
  });

  it('create, resend-invitation and password-reset share one limit per Admin', async () => {
    const limited = adminHarness({ emailLimits: { passwordResetEmail: { max: 5, windowMs: 60_000 }, passwordResetAddress: { max: 20, windowMs: 60_000 }, adminEmail: { max: 3, windowMs: 600_000 }, trustProxy: true } });
    const cookie = await limited.signIn(admin.email);
    const email = `limite-${companyId}@teste.local`;
    h.remember(email);
    const created = await limited.json(ADMIN_USER_ROUTES.create.path, { name: 'Lia Limite', email, role_id: SYSTEM_ROLE_ROW_IDS.consulta }, { cookie });
    expect(created.status).toBe(201);
    const id = adminUserResponseSchema.parse(await created.json()).user.id;
    expect((await limited.json(adminUserRoutePath('resend_invitation', id), {}, { cookie })).status).toBe(200);
    expect((await limited.json(adminUserRoutePath('send_reset', id), {}, { cookie })).status).toBe(200);
    const over = await limited.json(adminUserRoutePath('resend_invitation', id), {}, { cookie });
    expect(over.status).toBe(429);
    expect(await codeOf(over)).toBe('rate_limited');
    expect(Number(over.headers.get('retry-after'))).toBeGreaterThan(0);
    // The routes that send nothing are not limited.
    expect((await limited.json(adminUserRoutePath('edit', id), { name: 'Lia L.' }, { cookie, method: 'PATCH' })).status).toBe(200);
    await limited.cleanup();
  });

  it('a removed responsável: his name, his row and every op he wrote stay in the relatório and its history', async () => {
    const harness = routeHarness('tablet-admin-users');
    await harness.setup();
    try {
      const rui = await h.seedPerson(companyId, 'responsavel_tecnico', 'Rui Responsável');
      const asCompany = { companyId, email: rui.email, userId: rui.userId } as unknown as Company;
      const seeded = await harness.seedRelatorio(asCompany);
      const responsible = harness.clientOp(asCompany, { kind: 'put', path: relatorioSetupPath('responsible_user_id'), relatorio_id: seeded.relatorioId, value: rui.userId });
      expect((await harness.push(asCompany, [responsible])).rejected).toEqual([]);
      const written = await db.select({ seq: ops.seq }).from(ops).where(and(eq(ops.company_id, companyId), eq(ops.actor_id, rui.userId)));
      expect(written.length).toBeGreaterThan(1);

      await ok(await action('remove', rui.userId, adminCookie));

      expect((await harness.rowOf<{ setup: { responsible_user_id: string | null } }>(asCompany, 'relatorio', seeded.relatorioId))?.setup.responsible_user_id).toBe(rui.userId);
      expect(await h.kernelOf(rui)).toMatchObject({ name: 'Rui Responsável', status: 'removed' });
      expect(await db.select({ seq: ops.seq }).from(ops).where(and(eq(ops.company_id, companyId), eq(ops.actor_id, rui.userId)))).toHaveLength(written.length);
      const pulled = await harness.authed({ companyId, email: admin.email, userId: admin.userId } as unknown as Company, '/api/sync/company?since=0');
      expect(pulled.status).toBe(200);
      expect(JSON.stringify(await pulled.json())).toContain('Rui Responsável');
    } finally {
      await harness.cleanup();
    }
  }, 120_000);
});
