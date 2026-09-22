import {
  councilSchema,
  defaultTitleForCouncil,
  SERVER_DEVICE_ID,
  SYSTEM_IDENTITY_ACTOR,
  toIso,
  uuidV7Schema,
  type Council,
  type UserRow,
} from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import type { Auth } from '../auth/auth.ts';
import { now } from '../clock.ts';
import { newId } from '../ids.ts';
import { applyOps } from '../sync/apply.ts';
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
 *
 * This is the only place an identity user is born (AD-9), so it is also where the user
 * enters the op log: each user is projected into the company stream as one server-only
 * `user/{id}` create (`system:identity`) carrying the CAP-6 registration fields. From
 * then on the registration lives only on that kernel entity.
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
  /**
   * The uuidv7 a new user gets. The test seeds pass fixed ids; the CLI leaves it out and
   * one is minted (AD-4). An existing user always keeps the id it has.
   */
  userId?: string | undefined;
}

export interface SeedUserResult {
  companyId: CompanyId;
  userId: string;
  email: string;
  created: boolean;
}

const isUuidV7 = (value: string) => uuidV7Schema.safeParse(value).success;

/**
 * A user provisioned before identity ids were uuidv7 carries a slug id, which no kernel
 * row or op can name. Re-seeding such a user re-keys it: its sessions, account, push
 * register rows and identity row go, and `seedUser` inserts it again under a v7 id.
 */
async function dropLegacyUser(db: Db, companyId: CompanyId, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(session).where(eq(session.userId, userId));
    await tx.delete(account).where(eq(account.userId, userId));
    await tx
      .delete(syncDevicePush)
      .where(and(eq(syncDevicePush.company_id, companyId), eq(syncDevicePush.user_id, userId)));
    await tx.delete(user).where(and(eq(user.companyId, companyId), eq(user.id, userId)));
  });
}

/** The identity-owned and registration fields a re-seed keeps in step with the input. */
const RESEEDED_FIELDS = ['name', 'council', 'registration_number', 'title'] as const;

/**
 * Projects one identity user into the company stream. The first run applies one
 * `user/{id}` create; a later run (a re-seed) applies one `put` per field whose value the
 * input changed, so the entity stays the only home of the registration. Every op is a
 * server op (`system:identity`, device `server`) with a fresh id; a second create racing
 * the first is a no-op (AD-3).
 */
async function projectUser(db: Db, companyId: CompanyId, row: UserRow): Promise<void> {
  const [existing] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'user'), eq(entities.id, row.id)))
    .limit(1);
  const envelope = {
    scope: 'company',
    company_id: companyId,
    project_id: null,
    relatorio_id: null,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: SYSTEM_IDENTITY_ACTOR,
    device_id: SERVER_DEVICE_ID,
    client_ts: toIso(now()),
  };
  const ops: unknown[] = [];
  if (existing === undefined) {
    ops.push({ ...envelope, op_id: newId(), kind: 'create', path: `user/${row.id}`, value: row });
  } else {
    const current = existing.row as Partial<UserRow>;
    for (const field of RESEEDED_FIELDS) {
      if (current[field] === row[field]) continue;
      ops.push({ ...envelope, op_id: newId(), kind: 'put', path: `user/${row.id}/${field}`, value: row[field] });
    }
  }
  if (ops.length === 0) return;
  const result = await applyOps(db, companyId, ops, { now, origin: 'server' });
  const rejected = result.rejected[0];
  if (rejected !== undefined) throw new Error(`could not project user ${row.id}: ${rejected.code}`);
}

/**
 * Creates or updates one company and one user with an email+password account, and
 * projects the user into the company stream. Idempotent: running it twice with the same
 * input leaves one company row, one user row and one `user/{id}` create; a re-seed with
 * a changed name or registration adds one put per changed field.
 */
export async function seedUser(
  db: Db,
  auth: Auth,
  input: SeedUserInput,
): Promise<SeedUserResult> {
  const companyId = asCompanyId(input.companyId);
  if (input.userId !== undefined && !isUuidV7(input.userId)) {
    throw new Error(`user id must be a uuidv7, got "${input.userId}"`);
  }
  await ensureCompany(db, companyId, input.companyName);

  const email = input.email.trim().toLowerCase();
  const council = councilSchema.parse(input.council);
  const typedTitle = input.title?.trim() ?? '';
  const title = typedTitle === '' ? defaultTitleForCouncil(council) : typedTitle;
  const at = now();

  const existing = await db
    .select({ id: user.id, companyId: user.companyId })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  let found = existing[0];
  if (found !== undefined && found.companyId !== companyId) {
    throw new Error(`e-mail ${email} already belongs to company ${found.companyId}`);
  }
  if (found !== undefined && !isUuidV7(found.id)) {
    await dropLegacyUser(db, companyId, found.id);
    found = undefined;
  }

  const userId = found?.id ?? input.userId ?? newId();
  if (found === undefined) {
    // A supplied id that already names another user would overwrite that user below.
    const [clash] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1);
    if (clash !== undefined && clash.email !== email) {
      throw new Error(`cannot provision ${email}: user id ${userId} already belongs to ${clash.email}`);
    }
  }
  const userFields = {
    companyId,
    name: input.name,
    email,
    emailVerified: false,
    updatedAt: at,
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
    updatedAt: at,
  };
  await db
    .insert(account)
    // A fresh id only matters on insert: the upsert target is (providerId, accountId), so a
    // re-seed updates the same row.
    .values({ id: newId(), ...accountFields })
    .onConflictDoUpdate({
      target: [account.providerId, account.accountId],
      set: accountFields,
    });

  await projectUser(db, companyId, {
    id: userId,
    name: input.name,
    email,
    council,
    registration_number: input.registrationNumber,
    title,
    // Default on: epics.md, the capture story and the Account toggle "Localização nas fotos".
    photo_location_enabled: true,
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
 * companies, keeping the companies and their identity users. The Playwright suite asserts
 * counts on surfaces that read the whole company (the Home status board), so its run has
 * to start from the same state; the Postgres volume itself is long-lived. The users'
 * `user/{id}` projection goes with the log, so the caller seeds again afterwards
 * (`seedTestCompanies` re-projects every user whose entity is missing).
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
        userId: company.userId,
      }),
    );
  }
  return results;
}
