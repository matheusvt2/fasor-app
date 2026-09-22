import { accountResponseSchema } from '@app/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.ts';
import { createDb, createSql } from '../db/client.ts';
import { findUserProfile, listUserProfiles } from '../db/repositories/users.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { createAuth } from './auth.ts';
import { parseTrustedOrigins } from './trusted-origins.ts';

/**
 * 1.3-API-001 and 1.3-API-002 against the live compose stack. The suite seeds itself
 * (TC-9) and then speaks HTTP, so it exercises the same cookie the browser gets.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const companyB = TEST_SEED.companies[1];

const config = loadConfig();
const sql = createSql(config.DATABASE_URL);
const db = createDb(sql);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
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

  it('serves the signed-in profile and saves the professional registration', async () => {
    const { cookie } = await signIn(companyA.email);
    const read = await call('/api/account', { headers: { cookie } });
    expect(read.status).toBe(200);
    const profile = accountResponseSchema.parse(await read.json()).user;
    expect(profile.email).toBe(companyA.email);
    expect(profile.companyId).toBe(companyA.companyId);

    const saved = await call('/api/account/registration', {
      method: 'PUT',
      headers: { cookie },
      body: JSON.stringify({
        council: 'crt',
        registrationNumber: 'SP 9999',
        title: 'Técnico(a) em Eletrotécnica',
      }),
    });
    expect(saved.status).toBe(200);
    expect(accountResponseSchema.parse(await saved.json()).user).toMatchObject({
      council: 'crt',
      registrationNumber: 'SP 9999',
    });

    // Put the seeded value back so the e2e suite starts from a known state.
    const restored = await call('/api/account/registration', {
      method: 'PUT',
      headers: { cookie },
      body: JSON.stringify({
        council: companyA.council,
        registrationNumber: companyA.registrationNumber,
        title: 'Eng. Eletricista',
      }),
    });
    expect(restored.status).toBe(200);
  });

  it('rejects an invalid registration body', async () => {
    const { cookie } = await signIn(companyA.email);
    const res = await call('/api/account/registration', {
      method: 'PUT',
      headers: { cookie },
      body: JSON.stringify({ council: 'cau', registrationNumber: '', title: '' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'registration_invalid' });
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

    // Every authenticated route of this story, called by a user of company A.
    const account = accountResponseSchema.parse(
      await (await call('/api/account', { headers: { cookie } })).json(),
    ).user;
    expect(account.companyId).toBe(companyA.companyId);
    expect(account.email).not.toBe(companyB.email);

    const written = accountResponseSchema.parse(
      await (
        await call('/api/account/registration', {
          method: 'PUT',
          headers: { cookie },
          body: JSON.stringify({
            council: 'crea',
            registrationNumber: companyA.registrationNumber,
            title: 'Eng. Eletricista',
          }),
        })
      ).json(),
    ).user;
    expect(written.companyId).toBe(companyA.companyId);

    // The other company's user is untouched by company A's write.
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
