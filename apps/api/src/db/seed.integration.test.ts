import { uuidV7Schema } from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { loadConfig } from '../config.ts';
import { newId } from '../ids.ts';
import { pullCompany } from '../sync/pull.ts';
import { createDb } from './client.ts';
import { asCompanyId } from './repositories/company-id.ts';
import { findUserProfile } from './repositories/users.ts';
import { account, company, entities, ops, session, syncDevicePush, user } from './schema.ts';
import { LEGACY_TEST_COMPANY_IDS, seedTestCompanies, seedUser, TEST_SEED } from './seed.ts';

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
          .values({ id: LEGACY_USER, companyId: LEGACY_A, name: 'Legada', email: LEGACY_EMAIL })
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

describe('the user projection (retro A2)', () => {
  it('puts one server-only user/{id} create per seeded user in the company stream, and a re-seed adds none', async () => {
    await seedTestCompanies(db, auth);
    await seedTestCompanies(db, auth);
    for (const seeded of TEST_SEED.companies) {
      const creates = await db
        .select({ kind: ops.kind, scope: ops.scope, actor_id: ops.actor_id, device_id: ops.device_id, value: ops.value })
        .from(ops)
        .where(and(eq(ops.company_id, seeded.companyId), eq(ops.path, `user/${seeded.userId}`)));
      expect(creates).toHaveLength(1);
      expect(creates[0]).toMatchObject({
        kind: 'create',
        scope: 'company',
        actor_id: 'system:identity',
        device_id: 'server',
        value: { id: seeded.userId, name: seeded.name, email: seeded.email },
      });
      expect(uuidV7Schema.safeParse(seeded.userId).success).toBe(true);

      // The company stream the device pulls carries it.
      const page = await pullCompany(db, asCompanyId(seeded.companyId), 0);
      expect(page.ops.filter((op) => op.path === `user/${seeded.userId}`)).toHaveLength(1);
    }
  });

  it('mints a uuidv7 for a new user, keeps it on re-seed, and re-keys a legacy slug user', async () => {
    const companyId = newId();
    const email = `projecao-${companyId}@teste.local`;
    const base = {
      companyId,
      companyName: 'Empresa de Projeção',
      email,
      password: TEST_SEED.password,
      name: 'Pia Projeção',
      council: 'crt' as const,
      registrationNumber: 'SP 3',
    };
    try {
      const first = await seedUser(db, auth, base);
      expect(first.created).toBe(true);
      expect(uuidV7Schema.safeParse(first.userId).success).toBe(true);
      const again = await seedUser(db, auth, { ...base, password: 'outra-senha-123456' });
      expect(again).toMatchObject({ userId: first.userId, created: false });
      const creates = await db.select({ op_id: ops.op_id }).from(ops).where(eq(ops.path, `user/${first.userId}`));
      expect(creates).toHaveLength(1);
      const profile = await findUserProfile(db, asCompanyId(companyId), first.userId);
      expect(profile).toMatchObject({ council: 'crt', registrationNumber: 'SP 3', title: 'Técnico(a) em Eletrotécnica' });

      // A re-seed with a changed name and number updates the entity through server puts.
      await seedUser(db, auth, { ...base, name: 'Pia Renomeada', registrationNumber: 'SP 33' });
      expect(await findUserProfile(db, asCompanyId(companyId), first.userId)).toMatchObject({
        name: 'Pia Renomeada',
        registrationNumber: 'SP 33',
      });
      const [entity] = await db
        .select({ row: entities.row })
        .from(entities)
        .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'user'), eq(entities.id, first.userId)));
      expect(entity?.row).toMatchObject({ name: 'Pia Renomeada', registration_number: 'SP 33', title: 'Técnico(a) em Eletrotécnica' });
      const puts = await db
        .select({ path: ops.path, actor_id: ops.actor_id, device_id: ops.device_id })
        .from(ops)
        .where(and(eq(ops.company_id, companyId), eq(ops.kind, 'put')));
      expect(puts.map((p) => p.path).sort()).toEqual([`user/${first.userId}/name`, `user/${first.userId}/registration_number`]);
      for (const put of puts) expect(put).toMatchObject({ actor_id: 'system:identity', device_id: 'server' });

      // A user provisioned when ids were slugs: re-seeding moves it to a v7 id.
      await db.delete(account).where(eq(account.userId, first.userId));
      await db.delete(user).where(eq(user.id, first.userId));
      const legacyId = 'seed-user-projecao-legado';
      await db.insert(user).values({ id: legacyId, companyId, name: 'Pia Projeção', email });
      await db
        .insert(session)
        .values({ id: `legacy-session-${newId()}`, companyId, userId: legacyId, token: newId(), expiresAt: new Date() });
      await db
        .insert(syncDevicePush)
        .values({ company_id: companyId, user_id: legacyId, device_id: 'legacy-device', last_push_at: new Date().toISOString() });
      const rekeyed = await seedUser(db, auth, base);
      expect(await db.select({ id: session.id }).from(session).where(eq(session.userId, legacyId))).toEqual([]);
      expect(
        await db.select({ d: syncDevicePush.device_id }).from(syncDevicePush).where(eq(syncDevicePush.user_id, legacyId)),
      ).toEqual([]);
      expect(uuidV7Schema.safeParse(rekeyed.userId).success).toBe(true);
      expect(await db.select({ id: user.id }).from(user).where(eq(user.email, email))).toEqual([{ id: rekeyed.userId }]);
    } finally {
      await db.delete(session).where(eq(session.companyId, companyId));
      await db.delete(account).where(eq(account.companyId, companyId));
      await db.delete(user).where(eq(user.companyId, companyId));
      await db.delete(ops).where(eq(ops.company_id, companyId));
      await db.delete(entities).where(eq(entities.company_id, companyId));
      await db.delete(syncDevicePush).where(eq(syncDevicePush.company_id, companyId));
      await db.delete(company).where(eq(company.id, companyId));
    }
  });

  it('refuses a supplied user id that already belongs to another e-mail', async () => {
    const [a] = TEST_SEED.companies;
    await expect(
      seedUser(db, auth, {
        companyId: a.companyId,
        companyName: a.companyName,
        email: `outro-${newId()}@teste.local`,
        password: TEST_SEED.password,
        name: 'Outra Pessoa',
        council: 'crea',
        registrationNumber: 'SP 5',
        userId: a.userId,
      }),
    ).rejects.toThrow(/already belongs to/);
    expect(await db.select({ email: user.email }).from(user).where(eq(user.id, a.userId))).toEqual([{ email: a.email }]);
  });

  it('refuses a company id that is not a uuidv7 and writes nothing', async () => {
    const v4 = '8f3a2c1e-5b6d-4e7f-8a9b-0c1d2e3f4a5b';
    await expect(
      seedUser(db, auth, {
        companyId: v4,
        companyName: 'Empresa v4',
        email: 'v4@teste.local',
        password: TEST_SEED.password,
        name: 'Vera',
        council: 'crea',
        registrationNumber: 'SP 4',
      }),
    ).rejects.toThrow(/uuidv7/);
    expect(await db.select({ id: company.id }).from(company).where(eq(company.id, v4))).toEqual([]);
  });
});
