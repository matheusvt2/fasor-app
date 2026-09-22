import { eq } from 'drizzle-orm';
import type { Database } from '../client.ts';
import { company } from '../schema.ts';
import type { CompanyId } from './company-id.ts';

export interface CompanyRow {
  id: string;
  name: string;
}

/** The tenant itself. Takes the same required typed argument as every other repository call. */
export async function findCompany(
  db: Database,
  companyId: CompanyId,
): Promise<CompanyRow | undefined> {
  const rows = await db
    .select({ id: company.id, name: company.name })
    .from(company)
    .where(eq(company.id, companyId))
    .limit(1);
  return rows[0];
}

/** Provisioning only (seed CLI): creates the tenant row if it is not there yet. */
export async function ensureCompany(
  db: Database,
  companyId: CompanyId,
  name: string,
): Promise<CompanyRow> {
  await db
    .insert(company)
    .values({ id: companyId, name })
    .onConflictDoUpdate({ target: company.id, set: { name, updatedAt: new Date() } });
  const row = await findCompany(db, companyId);
  if (row === undefined) throw new Error(`company ${companyId} missing after upsert`);
  return row;
}
