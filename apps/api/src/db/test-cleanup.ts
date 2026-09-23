import { eq } from 'drizzle-orm';
import type { Db } from './client.ts';
import { account, company, entities, ops, session, syncDevicePush, user } from './schema.ts';

/**
 * Test support only: removes a throwaway company an integration test provisioned, with
 * everything attached, in FK order. Never pass a `TEST_SEED` company; the suites share
 * those (use `resetTestCompanyData` there).
 */
export async function dropCompany(db: Db, companyId: string): Promise<void> {
  await db.delete(session).where(eq(session.companyId, companyId));
  await db.delete(account).where(eq(account.companyId, companyId));
  await db.delete(user).where(eq(user.companyId, companyId));
  await db.delete(ops).where(eq(ops.company_id, companyId));
  await db.delete(entities).where(eq(entities.company_id, companyId));
  await db.delete(syncDevicePush).where(eq(syncDevicePush.company_id, companyId));
  await db.delete(company).where(eq(company.id, companyId));
}
