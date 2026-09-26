import { sql } from 'drizzle-orm';
import type { Db } from './client.ts';
import { E2E_WORKER_COMPANY_LIKE, E2E_WORKER_USER_LIKE, workerIndexOfCompany, workerIndexOfUser } from './e2e-worker-seed.ts';

/**
 * E6-Q7: the check that parallel Playwright workers stayed apart. Every worker signs in
 * as its own users and writes only into its own pair of companies (`e2e-worker-seed.ts`),
 * so after a run nothing a worker's user wrote may sit in any other company: not another
 * worker's pair, not a `TEST_SEED` company, not any other. The Playwright global teardown
 * runs it and fails the run with the rows it returns.
 *
 * What counts as "written by a worker's user":
 * - an `ops` row whose `actor_id` is that user;
 * - a `sync_device_push` row whose `user_id` is that user;
 * - an `entities` row whose materialized row names that user anywhere (`created_by`,
 *   `last_modified_by`, `concluded_by`, `responsible_user_id`, the `user/{id}` row itself).
 */

export interface E2eLeak {
  table: 'ops' | 'entities' | 'sync_device_push';
  companyId: string;
  userId: string;
  /** The op's path, the entity's `entity/id`, or the push row's device id. */
  what: string;
}

/** True when the company is one of the two companies of this worker user's pair. */
function inOwnPair(companyId: string, userId: string): boolean {
  const company = workerIndexOfCompany(companyId);
  return company !== null && company === workerIndexOfUser(userId);
}

/** Every row a worker user wrote outside its own pair; empty when the workers stayed apart. */
export async function findE2eLeaks(db: Db): Promise<E2eLeak[]> {
  const leaks: E2eLeak[] = [];

  const opRows = await db.execute<{ company_id: string; actor_id: string; path: string }>(
    // The SQL drops the rows in the actor's own pair (same worker suffix) so a long run's
    // log never crosses the wire; `inOwnPair` below is the check itself.
    sql`select company_id::text as company_id, actor_id, path from ops
        where actor_id like ${E2E_WORKER_USER_LIKE}
          and not (company_id::text like ${E2E_WORKER_COMPANY_LIKE} and right(company_id::text, 12) = right(actor_id, 12))`,
  );
  for (const row of opRows) {
    if (workerIndexOfUser(row.actor_id) === null || inOwnPair(row.company_id, row.actor_id)) continue;
    leaks.push({ table: 'ops', companyId: row.company_id, userId: row.actor_id, what: row.path });
  }

  const pushRows = await db.execute<{ company_id: string; user_id: string; device_id: string }>(
    sql`select company_id::text as company_id, user_id, device_id from sync_device_push where user_id like ${E2E_WORKER_USER_LIKE}`,
  );
  for (const row of pushRows) {
    if (workerIndexOfUser(row.user_id) === null || inOwnPair(row.company_id, row.user_id)) continue;
    leaks.push({ table: 'sync_device_push', companyId: row.company_id, userId: row.user_id, what: row.device_id });
  }

  // Every worker user id any entity row names, with the row's company: the regexp finds
  // each occurrence, so one query covers every field and every worker.
  const entityRows = await db.execute<{ company_id: string; entity: string; id: string; user_id: string }>(
    sql`select distinct e.company_id::text as company_id, e.entity, e.id::text as id, m.user_id
        from entities e,
             lateral (select (regexp_matches(e.row::text, '(e2e00000-00[ab]1-7000-8000-[0-9a-f]{12})', 'g'))[1] as user_id) m
        where e.row::text like ${'%' + E2E_WORKER_USER_LIKE}
          and not (e.company_id::text like ${E2E_WORKER_COMPANY_LIKE} and right(e.company_id::text, 12) = right(m.user_id, 12))`,
  );
  for (const row of entityRows) {
    if (workerIndexOfUser(row.user_id) === null || inOwnPair(row.company_id, row.user_id)) continue;
    leaks.push({ table: 'entities', companyId: row.company_id, userId: row.user_id, what: `${row.entity}/${row.id}` });
  }

  return leaks;
}

/** The failure message for a non-empty leak list, one row per line. */
export function describeE2eLeaks(leaks: readonly E2eLeak[]): string {
  const lines = leaks.map((leak) => `  ${leak.table}: user ${leak.userId} wrote ${leak.what} into company ${leak.companyId}`);
  return `e2e leak check: ${leaks.length} row(s) written by a worker's user outside its own pair of companies\n${lines.join('\n')}`;
}
