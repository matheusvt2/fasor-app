import type { Sql } from 'postgres';

/**
 * `scripts/test-reset.ts`: deletes one company's pg-boss jobs. A job names its company in
 * its payload under `company_id` (the generate job, `jobs/generate/worker.ts`) or
 * `companyId`; both keys are matched so no queued job of a reset company survives it. A
 * database where pg-boss never started (no `pgboss.job`) has nothing to delete.
 */
export async function resetCompanyJobs(sql: Sql, companyId: string): Promise<void> {
  const [queue] = await sql`select to_regclass('pgboss.job') as name`;
  if (!queue?.name) return;
  await sql`delete from pgboss.job where data->>'company_id' = ${companyId} or data->>'companyId' = ${companyId}`;
}
