import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminHarness, sql, db, type Person } from '../admin/admin.test-support.ts';
import { session } from '../db/schema.ts';
import { TEST_SEED } from '../db/seed.ts';
import { AUTH_ROUTES } from '../http/app.ts';

/*
 * 29.1-API: "Alterar senha" on the Conta screen, in process over the real auth and database with the
 * origin guard on. The signed-in user gives the current password and a new one: the new one signs
 * in and the old one no longer does; this request's device stays signed in (a new session cookie)
 * and every other session of the user ends, whatever the body asked. A wrong current password, a
 * short or long new one change nothing. A paused user changes nothing; the route is limited per
 * signed-in user and per client address.
 */

const h = adminHarness({
  emailLimits: { passwordResetEmail: { max: 5, windowMs: 60_000 }, passwordResetAddress: { max: 20, windowMs: 60_000 }, adminEmail: { max: 30, windowMs: 600_000 }, trustProxy: true },
});
const companyId = h.company();
const people = {} as Record<'campo' | 'consulta' | 'errada' | 'curta' | 'pausada' | 'limite' | 'endereco' | 'forma', Person>;
const NEW_PASSWORD = 'senha-trocada-29';

const change = (cookie: string, body: Record<string, unknown>, from?: string) => h.json('/api/auth/change-password', body, { cookie, ...(from === undefined ? {} : { from }) });
const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;
/** The cookie pair of a response's Set-Cookie, to replay. */
const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
const sessionsOf = async (userId: string) => (await db.select({ id: session.id }).from(session).where(eq(session.userId, userId))).length;

beforeAll(async () => {
  people.campo = await h.seedPerson(companyId, 'engenheiro_de_campo', 'Carlos Campo');
  people.consulta = await h.seedPerson(companyId, 'consulta', 'Clara Consulta');
  people.errada = await h.seedPerson(companyId, 'engenheiro_de_campo', 'Ernesto Errado');
  people.curta = await h.seedPerson(companyId, 'consulta', 'Carla Curta');
  people.pausada = await h.seedPerson(companyId, 'engenheiro_de_campo', 'Paula Pausada');
  people.limite = await h.seedPerson(companyId, 'consulta', 'Lia Limite');
  people.endereco = await h.seedPerson(companyId, 'consulta', 'Edu Endereço');
  people.forma = await h.seedPerson(companyId, 'consulta', 'Fabio Formulario');
}, 120_000);

afterAll(async () => {
  await h.cleanup();
  await sql.end();
});

describe('29.1-API change password', () => {
  it('opens change-password in AUTH_ROUTES, next to the two password routes of Story 26.6', () => {
    expect(AUTH_ROUTES.slice(-3)).toEqual([
      { method: 'POST', path: '/api/auth/request-password-reset' },
      { method: 'POST', path: '/api/auth/reset-password' },
      { method: 'POST', path: '/api/auth/change-password' },
    ]);
  });

  it('the new password signs in and the old one does not; this device stays signed in and every other session ends, even when the body asks to keep them', async () => {
    for (const person of [people.campo, people.consulta]) {
      const here = await h.signIn(person.email);
      const other = await h.signIn(person.email);
      expect(await sessionsOf(person.userId)).toBe(2);

      const res = await change(here, { currentPassword: TEST_SEED.password, newPassword: NEW_PASSWORD, revokeOtherSessions: false });
      expect(res.status, await res.clone().text()).toBe(200);
      const renewed = cookieOf(res);
      expect(renewed).toContain('releng.session_token=');

      // This device: the new cookie reads the account; the other device's session is gone.
      expect((await h.call('/api/account', { method: 'GET', cookie: renewed })).status).toBe(200);
      expect((await h.call('/api/account', { method: 'GET', cookie: other })).status).toBe(401);
      expect((await h.call('/api/account', { method: 'GET', cookie: here })).status).toBe(401);
      expect(await sessionsOf(person.userId)).toBe(1);

      expect((await h.signInRaw(person.email)).status).toBe(401);
      const again = await h.signIn(person.email, NEW_PASSWORD);
      expect((await h.call('/api/account', { method: 'GET', cookie: again })).status).toBe(200);
    }
  });

  it('a wrong current password is INVALID_PASSWORD; the password and the sessions are unchanged', async () => {
    const person = people.errada;
    const here = await h.signIn(person.email);
    const other = await h.signIn(person.email);
    const res = await change(here, { currentPassword: 'nao-e-esta-senha', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe('INVALID_PASSWORD');
    expect((await h.call('/api/account', { method: 'GET', cookie: other })).status).toBe(200);
    expect((await h.call('/api/account', { method: 'GET', cookie: here })).status).toBe(200);
    expect((await h.signInRaw(person.email, NEW_PASSWORD)).status).toBe(401);
    await h.signIn(person.email);
  });

  it('a new password of 7 or 129 characters is refused and the password is unchanged', async () => {
    const person = people.curta;
    const here = await h.signIn(person.email);
    const short = await change(here, { currentPassword: TEST_SEED.password, newPassword: 'x'.repeat(7) });
    expect(short.status).toBe(400);
    expect(await codeOf(short)).toBe('PASSWORD_TOO_SHORT');
    const long = await change(here, { currentPassword: TEST_SEED.password, newPassword: 'x'.repeat(129) });
    expect(long.status).toBe(400);
    expect(await codeOf(long)).toBe('PASSWORD_TOO_LONG');
    expect((await h.call('/api/account', { method: 'GET', cookie: here })).status).toBe(200);
    await h.signIn(person.email);
  });

  it('without a session the change is 401; a paused user is 401 user_inactive and his password is unchanged', async () => {
    const anonymous = await h.json('/api/auth/change-password', { currentPassword: TEST_SEED.password, newPassword: NEW_PASSWORD });
    expect(anonymous.status).toBe(401);

    const person = people.pausada;
    const cookie = await h.signIn(person.email);
    await h.putStatus(person, 'paused');
    const res = await change(cookie, { currentPassword: TEST_SEED.password, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
    expect(await codeOf(res)).toBe('user_inactive');
    await h.putStatus(person, 'active');
    await h.signIn(person.email);
  });

  it('the sixth change of one user in a minute is rate-limited, whatever client address it comes from', async () => {
    const person = people.limite;
    const cookie = await h.signIn(person.email);
    const answers: number[] = [];
    for (let i = 0; i < 6; i++) answers.push((await change(cookie, { currentPassword: 'errada-de-novo', newPassword: NEW_PASSWORD }, `10.79.0.${i}`)).status);
    expect(answers).toEqual([400, 400, 400, 400, 400, 429]);
    const limited = await change(cookie, { currentPassword: TEST_SEED.password, newPassword: NEW_PASSWORD }, '10.79.1.1');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await codeOf(limited)).toBe('rate_limited');
    // The limited request changed nothing.
    expect((await h.signInRaw(person.email, NEW_PASSWORD)).status).toBe(401);
  });

  // Batch e28r (wave review): the handler forces `revokeOtherSessions` only on a JSON body. A body of any other type never
  // reaches it: the origin guard (Story 20.13, `origin-guard.ts`) answers `403 forbidden_origin` to a write that is not
  // `application/json`, and behind it better-auth's router allows `application/json` alone (better-call's 415).
  it('a form-encoded, multipart or text body asking to keep the other sessions is 403 forbidden_origin; the password and the sessions are unchanged', async () => {
    const person = people.forma;
    const here = await h.signIn(person.email);
    const other = await h.signIn(person.email);
    const fields = new URLSearchParams({ currentPassword: TEST_SEED.password, newPassword: NEW_PASSWORD, revokeOtherSessions: 'false' }).toString();
    for (const [type, body] of [
      ['application/x-www-form-urlencoded', fields],
      ['application/x-www-form-urlencoded;charset=UTF-8', fields],
      ['text/plain', JSON.stringify({ currentPassword: TEST_SEED.password, newPassword: NEW_PASSWORD, revokeOtherSessions: false })],
    ] as const) {
      const res = await h.call('/api/auth/change-password', { method: 'POST', cookie: here, headers: { 'content-type': type }, body });
      expect(res.status, `${type}: ${await res.clone().text()}`).toBe(403);
      expect(await codeOf(res)).toBe('forbidden_origin');
    }
    const multipart = new FormData();
    multipart.set('currentPassword', TEST_SEED.password);
    multipart.set('newPassword', NEW_PASSWORD);
    multipart.set('revokeOtherSessions', 'false');
    const parts = await h.call('/api/auth/change-password', { method: 'POST', cookie: here, body: multipart });
    expect(parts.status).toBe(403);
    expect(await codeOf(parts)).toBe('forbidden_origin');
    expect((await h.call('/api/account', { method: 'GET', cookie: here })).status).toBe(200);
    expect((await h.call('/api/account', { method: 'GET', cookie: other })).status).toBe(200);
    expect(await sessionsOf(person.userId)).toBe(2);
    expect((await h.signInRaw(person.email, NEW_PASSWORD)).status).toBe(401);
  });

  it('one client address over 20 changes a minute is rate-limited, with or without a session', async () => {
    const from = '10.80.0.1';
    const answers: number[] = [];
    // No session: only the address counts, and better-auth answers 401 until the limit.
    for (let i = 0; i < 20; i++) answers.push((await change('releng.session_token=nada', { currentPassword: 'errada', newPassword: NEW_PASSWORD }, from)).status);
    expect(answers.every((status) => status === 401)).toBe(true);
    const cookie = await h.signIn(people.endereco.email);
    const limited = await change(cookie, { currentPassword: TEST_SEED.password, newPassword: NEW_PASSWORD }, from);
    expect(limited.status).toBe(429);
    expect((await change(cookie, { currentPassword: 'errada', newPassword: NEW_PASSWORD }, '10.80.0.2')).status).toBe(400);
  });
});
