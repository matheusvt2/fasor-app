import { eq } from 'drizzle-orm';
import type { Db } from './client.ts';
import { account, company, entities, ops, readingRuns, session, syncDevicePush, user } from './schema.ts';

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
    await tx.delete(company).where(eq(company.id, companyId));
  });
}
