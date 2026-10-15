import { uuidV7Schema } from '@app/domain';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { Auth } from '../auth/auth.ts';
import type { Db } from './client.ts';
import { asCompanyId } from './repositories/company-id.ts';
import { seedSampleRelatorio } from './sample-relatorio.ts';
import { entities, ops, readingRuns, syncDevicePush, user } from './schema.ts';
import { seedStandardTemplate, seedUser } from './seed.ts';

/*
 * Story 14.10 part 6: the production smoke's test company. After every deploy
 * (`infra/bin/deploy`) a one-shot ECS task (`smoke-seed-cli.ts`, task definition
 * `fasor-production-smoke-seed`) empties this one company and seeds it again: its user, the
 * standard template and one fresh test relatório from the small Porto Seguro sample. The
 * Playwright suite under `e2e/production/` then signs in as that user, and the same task runs
 * once more as the cleanup. Every delete here is scoped to the smoke company's id, and the
 * reset refuses a company that holds any user other than the smoke e-mail, so a misconfigured
 * id can never empty a real company. S3 objects a run uploaded stay (AD-7: no delete).
 */

/** The variables the task reads (`infra/production/smoke.tf`); the password comes from Secrets Manager. */
export const SMOKE_SEED_VARIABLES = ['SMOKE_COMPANY_ID', 'SMOKE_COMPANY_NAME', 'SMOKE_USER_EMAIL', 'SMOKE_USER_NAME', 'SMOKE_USER_PASSWORD'] as const;

/** The smoke user's registration: a test account, never printed on a delivered relatório. */
export const SMOKE_COUNCIL = 'crea';
export const SMOKE_REGISTRATION_NUMBER = 'TESTE-0000';

export interface SmokeSeedInput {
  companyId: string;
  companyName: string;
  email: string;
  name: string;
  password: string;
}

export interface SmokeSeedResult {
  companyId: string;
  userId: string;
  email: string;
  /** The standard template seeded on this run (the reset removed the earlier one). */
  templateId: string | null;
  relatorioId: string;
  /** What the reset removed: rows per table. */
  removed: { ops: number; entities: number; syncDevicePush: number; readingRuns: number };
}

/** A refused input or company: the CLI prints the message and exits 1, nothing written. */
export class SmokeSeedRefused extends Error {}

/**
 * The smoke seed's input from the environment, checked before any database is opened: every
 * variable present and not blank, the company id a uuidv7 (AD-4). Throws `SmokeSeedRefused`
 * naming each missing variable, or the bad id. The password is never part of a message.
 */
export function readSmokeSeedEnv(env: Record<string, string | undefined>): SmokeSeedInput {
  const missing = SMOKE_SEED_VARIABLES.filter((name) => (env[name] ?? '').trim() === '');
  if (missing.length > 0) throw new SmokeSeedRefused(`missing ${missing.join(', ')}`);
  const companyId = env.SMOKE_COMPANY_ID!.trim();
  if (!uuidV7Schema.safeParse(companyId).success) {
    throw new SmokeSeedRefused(`SMOKE_COMPANY_ID must be a uuidv7, got "${companyId}"`);
  }
  return {
    companyId,
    companyName: env.SMOKE_COMPANY_NAME!.trim(),
    email: env.SMOKE_USER_EMAIL!.trim().toLowerCase(),
    name: env.SMOKE_USER_NAME!.trim(),
    // Taken as stored: a password's spaces are part of it.
    password: env.SMOKE_USER_PASSWORD!,
  };
}

/**
 * Empties the smoke company and seeds it again: its `ops`, `entities`, `sync_device_push` and
 * `reading_runs` rows go (the table set of `resetTestCompanyData`), in one transaction that
 * first checks, under the same transaction, that the company holds no user but the smoke
 * e-mail and that the e-mail belongs to no other company; then `seedUser` (which revokes the
 * user's earlier sessions and projects the user again), `seedStandardTemplate` and
 * `seedSampleRelatorio`. Run twice, it leaves the company in the same state; no row of any
 * other company is read for writing or touched.
 */
export async function resetAndSeedSmokeCompany(db: Db, auth: Auth, input: SmokeSeedInput): Promise<SmokeSeedResult> {
  const companyId = input.companyId;
  const removed = await db.transaction(async (tx) => {
    const others = await tx
      .select({ email: user.email })
      .from(user)
      .where(and(eq(user.companyId, companyId), ne(user.email, input.email)))
      .limit(5);
    if (others.length > 0) {
      throw new SmokeSeedRefused(`refusing: company ${companyId} holds users other than ${input.email}`);
    }
    const [owner] = await tx.select({ companyId: user.companyId }).from(user).where(eq(user.email, input.email)).limit(1);
    if (owner !== undefined && owner.companyId !== companyId) {
      throw new SmokeSeedRefused(`refusing: ${input.email} belongs to company ${owner.companyId}, not ${companyId}`);
    }
    const ids = [companyId];
    const opsRemoved = await tx.delete(ops).where(inArray(ops.company_id, ids)).returning({ id: ops.op_id });
    const entitiesRemoved = await tx.delete(entities).where(inArray(entities.company_id, ids)).returning({ id: entities.id });
    const pushRemoved = await tx.delete(syncDevicePush).where(inArray(syncDevicePush.company_id, ids)).returning({ id: syncDevicePush.device_id });
    const runsRemoved = await tx.delete(readingRuns).where(inArray(readingRuns.company_id, ids)).returning({ id: readingRuns.id });
    return { ops: opsRemoved.length, entities: entitiesRemoved.length, syncDevicePush: pushRemoved.length, readingRuns: runsRemoved.length };
  });

  const seeded = await seedUser(db, auth, {
    companyId,
    companyName: input.companyName,
    email: input.email,
    password: input.password,
    name: input.name,
    council: SMOKE_COUNCIL,
    registrationNumber: SMOKE_REGISTRATION_NUMBER,
  });
  const templateId = await seedStandardTemplate(db, asCompanyId(companyId));
  const relatorioId = await seedSampleRelatorio(db, companyId, { responsibleUserId: seeded.userId });
  return { companyId, userId: seeded.userId, email: seeded.email, templateId, relatorioId, removed };
}
