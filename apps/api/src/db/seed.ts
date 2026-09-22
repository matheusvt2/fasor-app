import { councilSchema, defaultTitleForCouncil, type Council } from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import type { Auth } from '../auth/auth.ts';
import type { Db } from './client.ts';
import { ensureCompany } from './repositories/companies.ts';
import { asCompanyId, type CompanyId } from './repositories/company-id.ts';
import { account, company, entities, ops, session, syncDevicePush, user } from './schema.ts';
import { LEGACY_TEST_COMPANY_IDS, TEST_SEED } from './test-seed.ts';

export { LEGACY_TEST_COMPANY_IDS, TEST_SEED };

/**
 * Provisioning library behind `scripts/seed-users.ts`. There is no signup route and no
 * outbound e-mail (FR-6): an operator creates a company and its users here, and the same
 * call resets a password.
 */

export interface SeedUserInput {
  companyId: string;
  companyName: string;
  email: string;
  password: string;
  name: string;
  council: Council;
  registrationNumber: string;
  /** Defaults to the council's printed title. */
  title?: string | undefined;
}

export interface SeedUserResult {
  companyId: CompanyId;
  userId: string;
  email: string;
  created: boolean;
}

/** Deterministic ids so a re-run updates the same rows instead of adding new ones. */
function idFor(kind: string, key: string): string {
  return `seed-${kind}-${key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/**
 * Creates or updates one company and one user with an email+password account.
 * Idempotent: running it twice leaves exactly one company row and one user row.
 */
export async function seedUser(
  db: Db,
  auth: Auth,
  input: SeedUserInput,
): Promise<SeedUserResult> {
  const companyId = asCompanyId(input.companyId);
  await ensureCompany(db, companyId, input.companyName);

  const email = input.email.trim().toLowerCase();
  const council = councilSchema.parse(input.council);
  const title = input.title?.trim() ?? '';
  const now = new Date();

  const existing = await db
    .select({ id: user.id, companyId: user.companyId })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  const found = existing[0];
  if (found !== undefined && found.companyId !== companyId) {
    throw new Error(`e-mail ${email} already belongs to company ${found.companyId}`);
  }

  const userId = found?.id ?? idFor('user', email);
  if (found === undefined) {
    // Two e-mails can slug to the same id ("a.b@x.com" and "a-b@x.com"), and the second
    // seed would silently overwrite the first user's row and password.
    const clash = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    const taken = clash[0]?.email;
    if (taken !== undefined && taken !== email) {
      throw new Error(
        `cannot provision ${email}: its id ${userId} already belongs to ${taken}; use a different e-mail`,
      );
    }
  }
  const userFields = {
    companyId,
    name: input.name,
    email,
    emailVerified: false,
    council,
    registrationNumber: input.registrationNumber,
    title: title === '' ? defaultTitleForCouncil(council) : title,
    updatedAt: now,
  };
  await db
    .insert(user)
    .values({ id: userId, ...userFields })
    .onConflictDoUpdate({ target: user.id, set: userFields });

  const context = await auth.$context;
  const passwordHash = await context.password.hash(input.password);
  const accountFields = {
    companyId,
    userId,
    accountId: userId,
    providerId: 'credential',
    password: passwordHash,
    updatedAt: now,
  };
  await db
    .insert(account)
    .values({ id: idFor('account', email), ...accountFields })
    .onConflictDoUpdate({
      target: [account.providerId, account.accountId],
      set: accountFields,
    });

  // Re-seeding an existing user is the documented password-reset path, so the old
  // password must stop working everywhere: drop that user's sessions.
  if (found !== undefined) await revokeSessions(db, companyId, userId);

  return { companyId, userId, email, created: found === undefined };
}

/** Removes every session of one user of this company, so a password reset takes effect. */
export async function revokeSessions(
  db: Db,
  companyId: CompanyId,
  userId: string,
): Promise<void> {
  await db.delete(session).where(and(eq(session.companyId, companyId), eq(session.userId, userId)));
}

/**
 * Drops the pre-1.5 test companies (v4-shaped ids) when a volume still holds them, so the
 * seeded e-mails are free for the v7 companies. Only ever touches those two ids; every
 * other e-mail keeps `seedUser`'s collision guard. One transaction, FK order.
 */
export async function removeLegacyTestCompanies(db: Db): Promise<number> {
  const legacy = [...LEGACY_TEST_COMPANY_IDS];
  const present = await db.select({ id: company.id }).from(company).where(inArray(company.id, legacy));
  if (present.length === 0) return 0;
  const ids = present.map((row) => row.id);
  await db.transaction(async (tx) => {
    const users = await tx.select({ id: user.id }).from(user).where(inArray(user.companyId, ids));
    const userIds = users.map((row) => row.id);
    if (userIds.length > 0) {
      await tx.delete(session).where(inArray(session.userId, userIds));
      await tx.delete(account).where(inArray(account.userId, userIds));
    }
    await tx.delete(session).where(inArray(session.companyId, ids));
    await tx.delete(account).where(inArray(account.companyId, ids));
    await tx.delete(user).where(inArray(user.companyId, ids));
    await tx.delete(ops).where(inArray(ops.company_id, ids));
    await tx.delete(entities).where(inArray(entities.company_id, ids));
    await tx.delete(syncDevicePush).where(inArray(syncDevicePush.company_id, ids));
    await tx.delete(company).where(inArray(company.id, ids));
  });
  return ids.length;
}

/**
 * Empties the op log, the materialized entities and the push register of the test
 * companies, keeping the companies and their users. The Playwright suite asserts counts
 * on surfaces that read the whole company (the Home status board), so its run has to
 * start from the same state; the Postgres volume itself is long-lived.
 *
 * It is called by the Playwright global setup only, never by `seedTestCompanies`: the
 * api integration files each seed in their own `beforeAll` and run side by side, so a
 * reset there would wipe rows a neighbouring file had just written.
 */
export async function resetTestCompanyData(db: Db): Promise<void> {
  const ids = TEST_SEED.companies.map((c) => c.companyId);
  await db.transaction(async (tx) => {
    await tx.delete(ops).where(inArray(ops.company_id, ids));
    await tx.delete(entities).where(inArray(entities.company_id, ids));
    await tx.delete(syncDevicePush).where(inArray(syncDevicePush.company_id, ids));
  });
}

export async function seedTestCompanies(db: Db, auth: Auth): Promise<SeedUserResult[]> {
  await removeLegacyTestCompanies(db);
  const results: SeedUserResult[] = [];
  for (const company of TEST_SEED.companies) {
    results.push(
      await seedUser(db, auth, {
        companyId: company.companyId,
        companyName: company.companyName,
        email: company.email,
        password: TEST_SEED.password,
        name: company.name,
        council: company.council,
        registrationNumber: company.registrationNumber,
      }),
    );
  }
  return results;
}
