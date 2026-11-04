import { loadConfig } from '../../apps/api/src/config.ts';
import { createDb } from '../../apps/api/src/db/client.ts';

/*
 * Story 20.12: the per-company daily counters of paid AI work (`ai_usage_daily`), set from the
 * test runner against the compose Postgres, the way `push-server-ops.ts` writes what only the
 * server writes. A spec sets its worker company at the ceiling and clears it after.
 */

/** Puts the company's count of `kind` for today (`America/Sao_Paulo`) at `count`. */
export async function setDailyUsage(companyId: string, kind: 'reading' | 'audit', count: number): Promise<void> {
  const { sql } = createDb(loadConfig().DATABASE_URL);
  try {
    await sql`
      insert into ai_usage_daily (company_id, day, kind, count)
      values (${companyId}, (now() at time zone 'America/Sao_Paulo')::date, ${kind}, ${count})
      on conflict (company_id, day, kind) do update set count = excluded.count
    `;
  } finally {
    await sql.end();
  }
}

/** Removes every counter row of the company. */
export async function clearDailyUsage(companyId: string): Promise<void> {
  const { sql } = createDb(loadConfig().DATABASE_URL);
  try {
    await sql`delete from ai_usage_daily where company_id = ${companyId}`;
  } finally {
    await sql.end();
  }
}
