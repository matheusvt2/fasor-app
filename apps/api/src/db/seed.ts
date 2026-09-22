import { councilSchema, defaultTitleForCouncil, type Council } from '@app/domain';
import { and, eq } from 'drizzle-orm';
import type { Auth } from '../auth/auth.ts';
import type { Database } from './client.ts';
import { ensureCompany } from './repositories/companies.ts';
import { asCompanyId, type CompanyId } from './repositories/company-id.ts';
import { account, session, user } from './schema.ts';
import { TEST_SEED } from './test-seed.ts';

export { TEST_SEED };

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
  db: Database,
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
  db: Database,
  companyId: CompanyId,
  userId: string,
): Promise<void> {
  await db.delete(session).where(and(eq(session.companyId, companyId), eq(session.userId, userId)));
}

export async function seedTestCompanies(db: Database, auth: Auth): Promise<SeedUserResult[]> {
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
