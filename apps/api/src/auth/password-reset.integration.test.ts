import { INVITATION_LINK_HOURS, PRODUTO, RESET_LINK_HOURS, SET_PASSWORD_PATH, setPasswordLink } from '@app/domain';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminHarness, config, db, sql, type Person } from '../admin/admin.test-support.ts';
import { issuePasswordLink } from '../admin/password-links.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { ops, session } from '../db/schema.ts';
import { settleEmailTasks } from '../email/background.ts';
import { fakeEmailLink, fakeEmailToken, readFakeEmails } from '../email/fake-store.ts';
import { AUTH_ROUTES } from '../http/app.ts';
import { parseTrustedOrigins } from './trusted-origins.ts';

/*
 * 26.6-API-001b: "Esqueci minha senha" and the set-password link, in process over the real auth and
 * database with the origin guard on: the same answer for every address, a message only for an
 * invited or active user, the link's life (1 hour for a reset, 72 for an invitation, refused once
 * used or expired), the password rule, the end of the other sessions, the invited user's activation
 * at his first sign-in, and the limits (per address, per client address).
 */

const h = adminHarness({
  emailLimits: { passwordResetEmail: { max: 5, windowMs: 60_000 }, passwordResetAddress: { max: 20, windowMs: 60_000 }, adminEmail: { max: 30, windowMs: 600_000 }, trustProxy: true },
});
const companyId = h.company();
const people = {} as Record<'ativa' | 'pausada' | 'removida' | 'convidada' | 'curta', Person>;
const SAME_ANSWER = { status: true, message: 'If this email exists in our system, check your email for the reset link' };
const NEW_PASSWORD = 'senha-nova-0123';

const forgot = (email: string, from?: string) => h.json('/api/auth/request-password-reset', { email }, from === undefined ? {} : { from });
const setPassword = (token: string, newPassword: string) => h.json('/api/auth/reset-password', { token, newPassword });
const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;

beforeAll(async () => {
  people.ativa = await h.seedPerson(companyId, 'engenheiro_de_campo', 'Ana Ativa');
  people.pausada = await h.seedPerson(companyId, 'engenheiro_de_campo', 'Paula Pausada');
  people.removida = await h.seedPerson(companyId, 'engenheiro_de_campo', 'Rosa Removida');
  people.convidada = await h.seedPerson(companyId, 'consulta', 'Clara Convidada');
  people.curta = await h.seedPerson(companyId, 'consulta', 'Carla Curta');
  await h.putStatus(people.pausada, 'paused');
  await h.putStatus(people.removida, 'removed');
  await h.putStatus(people.convidada, 'invited');
}, 120_000);

afterAll(async () => {
  await settleEmailTasks();
  await h.cleanup();
  await sql.end();
});

describe('26.6-API-001b forgot password and the set-password link', () => {
  it('opens exactly the two password routes in AUTH_ROUTES', () => {
    // Story 29.1 (batch e29a): change-password follows them in the list.
    expect(AUTH_ROUTES.slice(-3, -1)).toEqual([
      { method: 'POST', path: '/api/auth/request-password-reset' },
      { method: 'POST', path: '/api/auth/reset-password' },
    ]);
  });

  it('an existing and an unknown address get the same answer; only the existing one stores a reset message with a 1-hour link', async () => {
    const since = new Date(Date.now() - 1000);
    const unknown = `ninguem-${companyId}@teste.local`;
    h.remember(unknown);
    const known = await forgot(people.ativa.email);
    const absent = await forgot(unknown);
    expect([known.status, absent.status]).toEqual([200, 200]);
    expect(await known.json()).toEqual(SAME_ANSWER);
    expect(await absent.json()).toEqual(SAME_ANSWER);
    await settleEmailTasks();
    expect(await readFakeEmails(db, { to: unknown })).toEqual([]);
    const stored = await readFakeEmails(db, { to: people.ativa.email, since });
    expect(stored).toHaveLength(1);
    const message = stored[0]!;
    expect(message.purpose).toBe('reset');
    expect(message.subject).toBe(`Crie uma senha nova no ${PRODUTO}`);
    expect(message.text).toContain('Olá, Ana Ativa.');
    const token = fakeEmailToken(message);
    // The link is the auth's own origin (AUTH_BASE_URL, else the first trusted origin), the page and the token.
    expect(fakeEmailLink(message)).toBe(setPasswordLink(config.AUTH_BASE_URL ?? parseTrustedOrigins(config.TRUSTED_ORIGINS)[0]!, token));
    expect(fakeEmailLink(message)).toContain(`${SET_PASSWORD_PATH}#${token}`);
    const links = await h.linksOf(people.ativa.userId);
    expect(links).toHaveLength(1);
    expect(links[0]!.companyId).toBe(companyId);
    const life = links[0]!.expiresAt.getTime() - Date.now();
    expect(life).toBeGreaterThan(RESET_LINK_HOURS * 3600_000 - 120_000);
    expect(life).toBeLessThanOrEqual(RESET_LINK_HOURS * 3600_000);
  });

  it('a paused or a removed user asks for a reset: the same answer, no message stored, no link left', async () => {
    for (const person of [people.pausada, people.removida]) {
      const res = await forgot(person.email);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(SAME_ANSWER);
    }
    await settleEmailTasks();
    for (const person of [people.pausada, people.removida]) {
      expect(await readFakeEmails(db, { to: person.email })).toEqual([]);
      expect(await h.linksOf(person.userId)).toEqual([]);
    }
  });

  it('the link sets the password once: the user signs in with it, his other sessions are gone, a second use is INVALID_TOKEN', async () => {
    const person = people.ativa;
    const open = await h.signIn(person.email);
    const since = new Date(Date.now() - 1000);
    expect((await forgot(person.email)).status).toBe(200);
    await settleEmailTasks();
    const message = (await readFakeEmails(db, { to: person.email, since })).at(-1)!;
    const token = fakeEmailToken(message);
    // A second request ended the first link: one live link per user.
    expect(await h.linksOf(person.userId)).toHaveLength(1);

    const set = await setPassword(token, NEW_PASSWORD);
    expect(set.status, await set.clone().text()).toBe(200);
    expect((await h.call('/api/account', { method: 'GET', cookie: open })).status).toBe(401);
    expect(await db.select({ id: session.id }).from(session).where(eq(session.userId, person.userId))).toEqual([]);
    expect((await h.signInRaw(person.email)).status).toBe(401);
    const cookie = await h.signIn(person.email, NEW_PASSWORD);
    expect((await h.call('/api/account', { method: 'GET', cookie })).status).toBe(200);

    const again = await setPassword(token, 'outra-senha-0123');
    expect(again.status).toBe(400);
    expect(await codeOf(again)).toBe('INVALID_TOKEN');
    const junk = await setPassword('nao-e-um-codigo', 'outra-senha-0123');
    expect(junk.status).toBe(400);
    expect(await codeOf(junk)).toBe('INVALID_TOKEN');
  });

  it('a password of 7 or 129 characters is refused and the link survives it', async () => {
    const person = people.curta;
    const token = await issuePasswordLink(db, { companyId: asCompanyId(companyId), userId: person.userId, hours: RESET_LINK_HOURS, now: new Date() });
    const short = await setPassword(token, 'x'.repeat(7));
    expect(short.status).toBe(400);
    expect(await codeOf(short)).toBe('PASSWORD_TOO_SHORT');
    const long = await setPassword(token, 'x'.repeat(129));
    expect(long.status).toBe(400);
    expect(await codeOf(long)).toBe('PASSWORD_TOO_LONG');
    expect((await setPassword(token, 'x'.repeat(8))).status).toBe(200);
    await h.signIn(person.email, 'x'.repeat(8));
  });

  it('an invitation older than 72 hours is refused like a used one', async () => {
    const person = people.convidada;
    const old = new Date(Date.now() - (INVITATION_LINK_HOURS + 1) * 3600_000);
    const token = await issuePasswordLink(db, { companyId: asCompanyId(companyId), userId: person.userId, hours: INVITATION_LINK_HOURS, now: old });
    const res = await setPassword(token, NEW_PASSWORD);
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe('INVALID_TOKEN');
  });

  it('an invited user sets his password through a 72-hour link, asks for a reset like anyone, and becomes active at his first sign-in', async () => {
    const person = people.convidada;
    expect((await h.kernelOf(person))?.status).toBe('invited');
    const token = await issuePasswordLink(db, { companyId: asCompanyId(companyId), userId: person.userId, hours: INVITATION_LINK_HOURS, now: new Date() });
    const [link] = await h.linksOf(person.userId);
    expect(link!.expiresAt.getTime() - Date.now()).toBeGreaterThan(INVITATION_LINK_HOURS * 3600_000 - 120_000);
    expect((await setPassword(token, NEW_PASSWORD)).status).toBe(200);

    // An invited user may ask for a reset (only paused and removed get nothing).
    const since = new Date(Date.now() - 1000);
    expect((await forgot(person.email)).status).toBe(200);
    await settleEmailTasks();
    expect(await readFakeEmails(db, { to: person.email, since })).toHaveLength(1);

    const cookie = await h.signIn(person.email, NEW_PASSWORD);
    expect((await h.kernelOf(person))?.status).toBe('active');
    expect((await h.call('/api/account', { method: 'GET', cookie })).status).toBe(200);
    const puts = await db
      .select({ value: ops.value, actor: ops.actor_id })
      .from(ops)
      .where(and(eq(ops.company_id, companyId), eq(ops.path, `user/${person.userId}/status`)));
    expect(puts.map((op) => op.value)).toEqual(['invited', 'active']);
    expect(puts.at(-1)!.actor).toBe('system:admin');
    // A second sign-in writes nothing more.
    await h.signIn(person.email, NEW_PASSWORD);
    expect(await db.select({ seq: ops.seq }).from(ops).where(and(eq(ops.company_id, companyId), eq(ops.path, `user/${person.userId}/status`)))).toHaveLength(2);
  });

  it('the sixth request for one address in a minute is rate-limited, whatever client address it comes from; a body that is not JSON is 415', async () => {
    const address = `limite-${companyId}@teste.local`;
    h.remember(address);
    const answers: number[] = [];
    for (let i = 0; i < 6; i++) answers.push((await forgot(address.toUpperCase(), `10.77.0.${i}`)).status);
    expect(answers).toEqual([200, 200, 200, 200, 200, 429]);
    const limited = await forgot(address, '10.77.1.1');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await codeOf(limited)).toBe('rate_limited');
    // The origin guard applies: a body that is not JSON is refused before any limiter or lookup.
    const text = await h.call('/api/auth/request-password-reset', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: `email=${address}` });
    expect(text.status).toBe(403);
    expect(await codeOf(text)).toBe('forbidden_origin');
  });

  it('one client address over 20 requests a minute is rate-limited, whatever address it names', async () => {
    const from = '10.78.0.1';
    const answers: number[] = [];
    for (let i = 0; i < 21; i++) {
      const address = `ip-${i}-${companyId}@teste.local`;
      h.remember(address);
      answers.push((await forgot(address, from)).status);
    }
    expect(answers.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(answers[20]).toBe(429);
    expect((await forgot(`ip-x-${companyId}@teste.local`, '10.78.0.2')).status).toBe(200);
    h.remember(`ip-x-${companyId}@teste.local`);
  });
});
