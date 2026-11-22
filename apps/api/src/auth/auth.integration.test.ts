import { accountResponseSchema, type UserProfile } from '@app/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.ts';
import { createDb, type Db } from '../db/client.ts';
import { findUserProfile } from '../db/repositories/users.ts';
import { asCompanyId, type CompanyId } from '../db/repositories/company-id.ts';
import { session, user } from '../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { createAuth } from './auth.ts';
import { parseTrustedOrigins } from './trusted-origins.ts';

/**
 * 1.3-API-001 and 1.3-API-002 against the live compose stack. The suite seeds itself
 * (TC-9) and then speaks HTTP, so it exercises the same cookie the browser gets.
 */

/**
 * Every user of one company, through the repository's own `findUserProfile` (A-27, review
 * 2026-09-30: the listing lived in the repository for this test alone).
 */
async function listUserProfiles(db: Db, companyId: CompanyId): Promise<UserProfile[]> {
  const ids = await db.select({ id: user.id }).from(user).where(eq(user.companyId, companyId));
  const profiles = await Promise.all(ids.map((row) => findUserProfile(db, companyId, row.id)));
  return profiles.filter((profile): profile is UserProfile => profile !== undefined);
}

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const companyB = TEST_SEED.companies[1];

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    redirect: 'manual',
    headers: { 'content-type': 'application/json', origin: apiUrl, ...init.headers },
  });
}

/** Signs in and returns the raw Set-Cookie header plus a Cookie header to replay. */
async function signIn(email: string): Promise<{ setCookie: string; cookie: string }> {
  const res = await call('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  const setCookie = res.headers.getSetCookie().join('\n');
  expect(setCookie).not.toBe('');
  const cookie = res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  return { setCookie, cookie };
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
}, 60_000);

afterAll(async () => {
  await sql.end();
});

describe('1.3-API-001 session, cookie and provisioning', () => {
  it('provisions both seeded users idempotently', async () => {
    const before = await listUserProfiles(db, asCompanyId(companyA.companyId));
    await seedTestCompanies(db, auth);
    const after = await listUserProfiles(db, asCompanyId(companyA.companyId));
    expect(after).toHaveLength(1);
    expect(after).toEqual(before);
    expect(after[0]?.email).toBe(companyA.email);
  });

  it('sets an httpOnly, SameSite=Lax, Secure cookie with a 30-day lifetime', async () => {
    const { setCookie } = await signIn(companyA.email);
    const sessionCookie = setCookie
      .split('\n')
      .find((value) => value.includes('session_token'));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    expect(sessionCookie).toMatch(/Secure/i);
    const maxAge = /Max-Age=(\d+)/i.exec(sessionCookie ?? '');
    expect(maxAge).not.toBeNull();
    expect(Number(maxAge?.[1])).toBe(60 * 60 * 24 * 30);
  });

  it('does not let a forged Host header widen the trusted origins', async () => {
    const res = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        host: 'evil.example',
        origin: 'http://evil.example',
      },
      body: JSON.stringify({ email: companyA.email, password: TEST_SEED.password }),
    });
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie().join('\n')).not.toContain('session_token');
  });

  it('accepts a dev server on any localhost port (worktrees use different host ports)', async () => {
    const res = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:25173' },
      body: JSON.stringify({ email: companyA.email, password: TEST_SEED.password }),
    });
    expect(res.status, await res.text()).toBe(200);
  });

  it('refuses a bad password without saying which field failed', async () => {
    const res = await call('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: companyA.email, password: 'wrong-password-000' }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.getSetCookie().join('\n')).not.toContain('session_token');
  });

  it('answers 401 on an authenticated route without a cookie', async () => {
    const res = await call('/api/account');
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'unauthenticated' });
  });

  it('serves the signed-in profile, with the registration composed from the user entity', async () => {
    const { cookie } = await signIn(companyA.email);
    const read = await call('/api/account', { headers: { cookie } });
    expect(read.status).toBe(200);
    const profile = accountResponseSchema.parse(await read.json()).user;
    expect(profile.id).toBe(companyA.userId);
    expect(profile.email).toBe(companyA.email);
    expect(profile.companyId).toBe(companyA.companyId);
    // The seeded council comes from the kernel `user` entity, the only home of the
    // registration; the identity table has no registration column any more.
    expect(profile.council).toBe(companyA.council);
  });

  it('has no registration write route: the registration is written as user ops', async () => {
    const { cookie } = await signIn(companyA.email);
    const res = await call('/api/account/registration', {
      method: 'PUT',
      headers: { cookie },
      body: JSON.stringify({ council: 'crt', registrationNumber: 'SP 9999', title: 'Técnico(a) em Eletrotécnica' }),
    });
    expect(res.status).toBe(404);
  });

  it('clears the session on sign-out', async () => {
    const { cookie } = await signIn(companyA.email);
    const out = await call('/api/auth/sign-out', {
      method: 'POST',
      headers: { cookie },
      body: '{}',
    });
    expect(out.status).toBe(200);
    const after = await call('/api/account', { headers: { cookie } });
    expect(after.status).toBe(401);
  });

  it('revokes existing sessions when the user is re-seeded (password reset)', async () => {
    const { cookie } = await signIn(companyA.email);
    expect((await call('/api/account', { headers: { cookie } })).status).toBe(200);
    await seedTestCompanies(db, auth);
    expect((await call('/api/account', { headers: { cookie } })).status).toBe(401);
  });

  // Batch e26t (2026-11-22). The device of a user whose sessions were deleted (a reactivation,
  // `admin/users.ts`; an expired session leaves the same) still sends the old cookie when he signs
  // in again. Two WebKit reds of the matrix looked like a late 401 clearing the cookie the sign-in
  // had just set; the cause was the harness (a `Secure` cookie on a plain http origin, which WebKit
  // refuses: `e2e/support/plain-http-cookie.ts`). This pins what the server owes that sign-in.
  it('e26t-API-001 a sign-in carrying the cookie of a deleted session answers a new session, and no 401 of the old cookie sets a cookie', async () => {
    const dead = await signIn(companyA.email);
    // The cookie's value is `token.signature`, percent-encoded; the row is the session it named.
    const token = decodeURIComponent(dead.cookie.slice(dead.cookie.indexOf('=') + 1)).split('.')[0]!;
    const deleted = await db.delete(session).where(eq(session.token, token)).returning({ id: session.id });
    expect(deleted).toHaveLength(1);

    // The old cookie is refused with no Set-Cookie on the answer, on the account read and on a sync
    // route: a 401 still in flight can neither clear nor replace the cookie a sign-in sets meanwhile.
    for (const path of ['/api/account', '/api/sync/company']) {
      const refused = await call(path, { headers: { cookie: dead.cookie } });
      expect(refused.status, path).toBe(401);
      expect(await refused.json(), path).toMatchObject({ code: 'unauthenticated' });
      expect(refused.headers.getSetCookie(), path).toEqual([]);
    }

    // The sign-in over it: one cookie, the same name and path with a new value, so the browser
    // replaces the old one; the account read that follows it is answered.
    const again = await call('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { cookie: dead.cookie },
      body: JSON.stringify({ email: companyA.email, password: TEST_SEED.password }),
    });
    expect(again.status, await again.clone().text()).toBe(200);
    const set = again.headers.getSetCookie();
    expect(set).toHaveLength(1);
    const fresh = set[0]!.split(';')[0]!;
    expect(fresh.split('=')[0]).toBe(dead.cookie.split('=')[0]);
    expect(fresh).not.toBe(dead.cookie);
    expect(set[0]).toMatch(/Path=\//i);
    expect(set[0]).not.toMatch(/Max-Age=0\b/i);
    const read = await call('/api/account', { headers: { cookie: fresh } });
    expect(read.status).toBe(200);
    expect(accountResponseSchema.parse(await read.json()).user.id).toBe(companyA.userId);
  });

  it('applied the migrations at boot', async () => {
    const [table] = await sql`select to_regclass('public.user') as name`;
    expect(table?.name).not.toBeNull();
    const applied = await sql`select count(*)::int as count from drizzle.__drizzle_migrations`;
    expect(applied[0]?.count).toBeGreaterThan(0);
  });

  it('answers the error envelope on an unknown /api route', async () => {
    const res = await call('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'not_found' });
  });

  it('refuses sign-up', async () => {
    const res = await call('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({
        email: 'intruder@teste.local',
        password: 'uma-senha-qualquer-1',
        name: 'Intruder',
      }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const rows = await sql`select id from "user" where email = 'intruder@teste.local'`;
    expect(rows).toHaveLength(0);
  });
});

describe('1.3-API-002 two companies, no cross-read', () => {
  it('never returns a row of the other company from any route this story ships', async () => {
    const { cookie } = await signIn(companyA.email);

    // Every authenticated account route, called by a user of company A.
    const account = accountResponseSchema.parse(
      await (await call('/api/account', { headers: { cookie } })).json(),
    ).user;
    expect(account.companyId).toBe(companyA.companyId);
    expect(account.id).toBe(companyA.userId);
    expect(account.email).not.toBe(companyB.email);

    // The other company's user is still there, readable only under its own tenant.
    const otherUsers = await listUserProfiles(db, asCompanyId(companyB.companyId));
    expect(otherUsers).toHaveLength(1);
    expect(otherUsers[0]?.email).toBe(companyB.email);
    expect(otherUsers[0]?.registrationNumber).toBe(companyB.registrationNumber);
  });

  it('refuses to read the other company through the repository layer', async () => {
    const usersOfA = await listUserProfiles(db, asCompanyId(companyA.companyId));
    const usersOfB = await listUserProfiles(db, asCompanyId(companyB.companyId));
    const aId = usersOfA[0]?.id;
    const bId = usersOfB[0]?.id;
    expect(aId).toBeDefined();
    expect(bId).toBeDefined();

    // Company A asking for company B's user id gets nothing, not the other company's row.
    expect(await findUserProfile(db, asCompanyId(companyA.companyId), bId ?? '')).toBeUndefined();
    expect(await findUserProfile(db, asCompanyId(companyB.companyId), aId ?? '')).toBeUndefined();

    // Compile-time half of AD-10, declared and never called: `pnpm static` fails if any
    // of these ever starts to typecheck, because each @ts-expect-error would be unused.
    const tenantScopingMustNotCompile = () => {
      // @ts-expect-error a repository call must carry the company id (AD-10)
      void findUserProfile(db, bId ?? '');
      // @ts-expect-error a bare string is not a CompanyId (AD-10)
      void findUserProfile(db, companyA.companyId, bId ?? '');
      // @ts-expect-error listing users also needs the typed company id (AD-10)
      void listUserProfiles(db);
    };
    void tenantScopingMustNotCompile;
  });
});
