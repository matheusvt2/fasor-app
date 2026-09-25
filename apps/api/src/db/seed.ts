import {
  councilSchema,
  defaultTitleForCouncil,
  SEED_VERSION,
  SERVER_DEVICE_ID,
  STANDARD_TEMPLATE_NAME,
  standardTemplate,
  SYSTEM_IDENTITY_ACTOR,
  toIso,
  uuidV7Schema,
  type Council,
  type UserRow,
} from '@app/domain';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
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

/** The envelope of a provisioning op in the company stream: server device, `system:identity`. */
function provisioningEnvelope(companyId: CompanyId) {
  return {
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
  } as const;
}

/**
 * Projects one identity user into the company stream. The first run applies one
 * `user/{id}` create, whose registration fields are the user's initial values. A later
 * run (a re-seed, which is also the password reset) puts only the identity-owned `name`,
 * and only when it changed: after the first projection the registration belongs to the
 * user, who edits it through their own ops, so a re-seed never writes it back. Every op
 * is a server op (`system:identity`, device `server`) with a fresh id; a second create
 * racing the first is a no-op (AD-3).
 */
async function projectUser(db: Db, companyId: CompanyId, row: UserRow): Promise<void> {
  const [existing] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'user'), eq(entities.id, row.id)))
    .limit(1);
  const envelope = provisioningEnvelope(companyId);
  const ops: unknown[] = [];
  if (existing === undefined) {
    ops.push({ ...envelope, op_id: newId(), kind: 'create', path: `user/${row.id}`, value: row });
  } else {
    const current = existing.row as Partial<UserRow>;
    if (current.name !== row.name) {
      ops.push({ ...envelope, op_id: newId(), kind: 'put', path: `user/${row.id}/name`, value: row.name });
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
 * a changed name adds one `name` put. The registration fields of the input seed only a new
 * user's initial values.
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

/**
 * Story 3.2: gives a company the seeded "Cabine primária — padrão" template, through the
 * op log like every other row -- one server `template/{id}` create (`system:identity`)
 * whose value is the kernel's `standardTemplate`, the same builder the Templates
 * surface's empty state commits from a device. Idempotent: a company that already holds
 * a live template of that name gets nothing, so a second run adds no op. Returns the id
 * of the template it created, or null.
 *
 * E12-Q4: a company seeded before the current `SEED_VERSION` holds its standard template at
 * the older version. When nobody has edited it (`version` still the seeded 1), the seed moves
 * it to the current version in one server batch (`upgradeStandardTemplate`); an edited one
 * keeps its version (AR-20), and so does every relatório already made from it.
 */
export async function seedStandardTemplate(db: Db, companyId: CompanyId): Promise<string | null> {
  const [existing] = await db
    .select({ id: entities.id, row: entities.row })
    .from(entities)
    .where(
      and(
        eq(entities.company_id, companyId),
        eq(entities.entity, 'template'),
        isNull(entities.removed_at),
        sql`${entities.row}->>'name' = ${STANDARD_TEMPLATE_NAME}`,
      ),
    )
    .limit(1);
  if (existing !== undefined) {
    await upgradeStandardTemplate(db, companyId, existing.id, existing.row as { seed_version?: unknown; version?: unknown });
    return null;
  }
  const id = newId();
  const op = {
    ...provisioningEnvelope(companyId),
    op_id: newId(),
    kind: 'create',
    path: `template/${id}`,
    value: standardTemplate({ id }),
  };
  const result = await applyOps(db, companyId, [op], { now, origin: 'server' });
  const rejected = result.rejected[0];
  if (rejected !== undefined) throw new Error(`could not seed the standard template: ${rejected.code}`);
  return id;
}

/**
 * E12-Q4: moves an unedited seeded standard template to `SEED_VERSION`, as one server op
 * batch (`system:identity`): its `seed_version` (a server-only path), the blocks and the
 * skeleton `standardTemplate` builds at that version, then `version` back to 1 (each
 * content put bumps it, D-4), so the template still reads as never edited. A template
 * already at `SEED_VERSION`, or edited (`version` above 1), gets no op.
 */
async function upgradeStandardTemplate(
  db: Db,
  companyId: CompanyId,
  id: string,
  row: { seed_version?: unknown; version?: unknown },
): Promise<void> {
  if (row.seed_version === SEED_VERSION || row.version !== 1) return;
  const target = standardTemplate({ id });
  const batchId = newId();
  const put = (field: string, value: unknown) => ({
    ...provisioningEnvelope(companyId),
    batch_id: batchId,
    op_id: newId(),
    kind: 'put',
    path: `template/${id}/${field}`,
    value,
  });
  const batch = [
    put('seed_version', target.seed_version),
    put('blocks', target.blocks),
    put('skeleton', target.skeleton),
    put('version', 1),
  ];
  const result = await applyOps(db, companyId, batch, { now, origin: 'server' });
  const rejected = result.rejected[0];
  if (rejected !== undefined) throw new Error(`could not upgrade the standard template: ${rejected.code}`);
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
 * It is called by the Playwright global setup, `scripts/test-reset.ts` (guarded to only
 * ever pass a `TEST_SEED` company id, F-DUP-3), and this file's own sibling
 * `test-reset.integration.test.ts` — never by `seedTestCompanies`: the api integration
 * files each seed in their own `beforeAll` and normally run side by side, which would let
 * a reset here wipe rows a neighbouring file had just written. `apps/api/vitest.config.ts`
 * sets `fileParallelism: false` specifically so `test-reset.integration.test.ts` can call
 * this safely; do not re-enable file parallelism there without re-solving this race first.
 */
export async function resetTestCompanyData(
  db: Db,
  only: readonly string[] = TEST_SEED.companies.map((c) => c.companyId),
): Promise<void> {
  // `only` narrows the reset to some of the test companies (the Templates empty-state spec
  // resets Empresa B alone); it can never name any other company.
  const testIds: readonly string[] = TEST_SEED.companies.map((c) => c.companyId);
  const foreign = only.filter((id) => !testIds.includes(id));
  if (foreign.length > 0) throw new Error(`resetTestCompanyData resets only the test companies, not ${foreign.join(', ')}`);
  const ids = [...only];
  if (ids.length === 0) return;
  await db.transaction(async (tx) => {
    await tx.delete(ops).where(inArray(ops.company_id, ids));
    await tx.delete(entities).where(inArray(entities.company_id, ids));
    await tx.delete(syncDevicePush).where(inArray(syncDevicePush.company_id, ids));
  });
}

/**
 * Provisions the two test companies. Empresa A also gets the standard template, as a
 * company seeded with `--standard-template` would; Empresa B is left without one, so the
 * Templates surface's empty state has a company to be tested on (Story 3.2).
 */
export async function seedTestCompanies(db: Db, auth: Auth): Promise<SeedUserResult[]> {
  await removeLegacyTestCompanies(db);
  const results: SeedUserResult[] = [];
  for (const company of TEST_SEED.companies) {
    const result = await seedUser(db, auth, {
      companyId: company.companyId,
      companyName: company.companyName,
      email: company.email,
      password: TEST_SEED.password,
      name: company.name,
      council: company.council,
      registrationNumber: company.registrationNumber,
      userId: company.userId,
    });
    if (company.standardTemplate) await seedStandardTemplate(db, result.companyId);
    results.push(result);
  }
  return results;
}
