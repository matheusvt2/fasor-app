import { and, eq, inArray, like, or, sql } from 'drizzle-orm';
import type { Db } from './client.ts';
import { account, aiUsageDaily, company, entities, ops, readingRuns, session, syncDevicePush, transcriptionRuns, user } from './schema.ts';

/**
 * Test support only: removes a throwaway company an integration test provisioned, with
 * everything attached, in FK order, in one transaction (E-11, review 2026-09-30: all of it
 * or none of it). Never pass a `TEST_SEED` company; the suites share those (use
 * `resetTestCompanyData` there).
 */
export async function dropCompany(db: Db, companyId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(session).where(eq(session.companyId, companyId));
    await tx.delete(account).where(eq(account.companyId, companyId));
    await tx.delete(user).where(eq(user.companyId, companyId));
    await tx.delete(ops).where(eq(ops.company_id, companyId));
    await tx.delete(entities).where(eq(entities.company_id, companyId));
    await tx.delete(syncDevicePush).where(eq(syncDevicePush.company_id, companyId));
    await tx.delete(readingRuns).where(eq(readingRuns.company_id, companyId));
    await tx.delete(transcriptionRuns).where(eq(transcriptionRuns.company_id, companyId));
    await tx.delete(aiUsageDaily).where(eq(aiUsageDaily.company_id, companyId));
    await tx.delete(company).where(eq(company.id, companyId));
  });
}

/**
 * Chore T4 (2026-11-26), test support only: removes the registry rows of one kind and name (case
 * insensitive) from a company, with their ops. A test that confirms a nameplate value teaches the
 * company a registry row (learned options); a later file of the same test pair that needs the name
 * unknown (the reading hints `create_registry_entry` only for a name the company lacks) clears it
 * first, and the teaching file clears what it taught.
 */
export async function dropRegistryRowsNamed(db: Db, companyId: string, kind: string, name: string): Promise<number> {
  const found = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'registry'), sql`${entities.row}->>'kind' = ${kind}`, sql`lower(${entities.row}->>'name') = lower(${name})`));
  const ids = found.map((row) => row.id);
  if (ids.length === 0) return 0;
  await db.transaction(async (tx) => {
    await tx.delete(ops).where(and(eq(ops.company_id, companyId), or(...ids.map((id) => like(ops.path, `registry/${kind}/${id}%`)))));
    await tx.delete(entities).where(and(eq(entities.company_id, companyId), eq(entities.entity, 'registry'), inArray(entities.id, ids)));
  });
  return ids.length;
}
