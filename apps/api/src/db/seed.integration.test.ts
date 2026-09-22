import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { loadConfig } from '../config.ts';
import { newId } from '../ids.ts';
import { createDb } from './client.ts';
import { account, company, ops, session, syncDevicePush, user } from './schema.ts';
import { LEGACY_TEST_COMPANY_IDS, seedTestCompanies, TEST_SEED } from './seed.ts';

/**
 * A volume seeded before Story 1.5 holds the two test companies under v4-shaped ids.
 * `seedTestCompanies` must clear them (users, accounts, sessions, ops, pushes, company)
 * and leave the two v7 companies with both seeded users attached. The legacy rows here
 * use e-mails of their own so the suites running in parallel keep their sign-ins.
 */

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

const LEGACY_A = LEGACY_TEST_COMPANY_IDS[0];
const LEGACY_USER = 'seed-user-legacy-a-teste-local';
const LEGACY_EMAIL = 'legacy-a@teste.local';

afterAll(async () => {
  await sql.end();
});

/**
 * Plants the legacy company with a user, account, session, op and push row in one
 * transaction. The other api suites call `seedTestCompanies` from parallel workers and
 * would remove these rows mid-way, so a deadlock (40P01) is retried; an early removal by
 * another worker only brings the end state this test asserts.
 */
async function plantLegacyCompany(): Promise<{ opId: string }> {
  const now = new Date();
  const opId = newId();
  for (let attempt = 1; ; attempt++) {
    try {
      await db.transaction(async (tx) => {
        await tx.insert(company).values({ id: LEGACY_A, name: 'Empresa A (legada)' }).onConflictDoNothing();
        await tx
          .insert(user)
          .values({ id: LEGACY_USER, companyId: LEGACY_A, name: 'Legada', email: LEGACY_EMAIL, council: 'crea' })
          .onConflictDoNothing();
        await tx
          .insert(account)
          .values({
            id: 'seed-account-legacy-a-teste-local',
            companyId: LEGACY_A,
            userId: LEGACY_USER,
            accountId: LEGACY_USER,
            providerId: 'credential',
            password: 'x',
          })
          .onConflictDoNothing();
        await tx
          .insert(session)
          .values({ id: `legacy-session-${newId()}`, companyId: LEGACY_A, userId: LEGACY_USER, token: newId(), expiresAt: now });
        await tx.insert(ops).values({
          op_id: opId,
          company_id: LEGACY_A,
          scope: 'company',
          kind: 'put',
          path: 'legacy/path',
          value: null,
          actor_id: LEGACY_USER,
          device_id: 'legacy-device',
          client_ts: now.toISOString(),
          received_at: now.toISOString(),
        });
        await tx
          .insert(syncDevicePush)
          .values({ company_id: LEGACY_A, user_id: LEGACY_USER, device_id: 'legacy-device', last_push_at: now.toISOString() })
          .onConflictDoNothing();
      });
      return { opId };
    } catch (error) {
      const code = (error as { cause?: { code?: string }; code?: string }).cause?.code ?? (error as { code?: string }).code;
      if (code !== '40P01' || attempt >= 5) throw error;
    }
  }
}

describe('seedTestCompanies on a volume seeded before Story 1.5', () => {
  it('removes the legacy companies with everything attached and provisions the two v7 companies', async () => {
    const { opId } = await plantLegacyCompany();

    const results = await seedTestCompanies(db, auth);
    expect(results.map((r) => r.email).sort()).toEqual([...TEST_SEED.companies].map((c) => c.email).sort());

    // The legacy rows are gone, in every table.
    expect(await db.select({ id: company.id }).from(company).where(inArray(company.id, [...LEGACY_TEST_COMPANY_IDS]))).toEqual([]);
    expect(await db.select({ id: user.id }).from(user).where(eq(user.id, LEGACY_USER))).toEqual([]);
    expect(await db.select({ id: user.id }).from(user).where(eq(user.email, LEGACY_EMAIL))).toEqual([]);
    expect(await db.select({ id: account.id }).from(account).where(eq(account.userId, LEGACY_USER))).toEqual([]);
    expect(await db.select({ id: session.id }).from(session).where(eq(session.userId, LEGACY_USER))).toEqual([]);
    expect(await db.select({ op_id: ops.op_id }).from(ops).where(eq(ops.op_id, opId))).toEqual([]);
    expect(await db.select({ d: syncDevicePush.device_id }).from(syncDevicePush).where(eq(syncDevicePush.company_id, LEGACY_A))).toEqual([]);

    // The two v7 companies exist with their users attached.
    for (const seeded of TEST_SEED.companies) {
      const [row] = await db.select({ id: company.id }).from(company).where(eq(company.id, seeded.companyId));
      expect(row?.id).toBe(seeded.companyId);
      const [u] = await db.select({ id: user.id, companyId: user.companyId }).from(user).where(eq(user.email, seeded.email));
      expect(u).toEqual({ id: seeded.userId, companyId: seeded.companyId });
    }

    // A second run with nothing legacy left is a no-op on that path and still idempotent.
    await seedTestCompanies(db, auth);
    expect(await db.select({ id: company.id }).from(company).where(inArray(company.id, [...LEGACY_TEST_COMPANY_IDS]))).toEqual([]);
  });
});
