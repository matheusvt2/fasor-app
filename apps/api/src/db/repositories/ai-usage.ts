import { sql } from 'drizzle-orm';
import type { Db } from '../client.ts';
import type { Tx } from '../../sync/apply.ts';
import type { CompanyId } from './company-id.ts';

/*
 * Story 20.12 (security pass S6): the per-company daily ceiling of paid AI work. One counter row
 * per company, day and kind (`ai_usage_daily`); the day is the `America/Sao_Paulo` calendar day,
 * so the count starts again at local midnight.
 */

export type AiUsageKind = 'reading' | 'audit';

/** The env defaults (`config.ts`): readings (rereads included) and audits per company per day. */
export const DEFAULT_READING_DAILY_QUOTA = 400;
export const DEFAULT_AUDIT_DAILY_QUOTA = 30;

/** The ceilings `createApp` applies; absent, the defaults above. */
export interface DailyQuotas {
  readings: number;
  audits: number;
}

export const DEFAULT_DAILY_QUOTAS: DailyQuotas = { readings: DEFAULT_READING_DAILY_QUOTA, audits: DEFAULT_AUDIT_DAILY_QUOTA };

/** The company is at its daily ceiling for this kind: nothing was spent, nothing may start. */
export class QuotaExceededError extends Error {
  readonly kind: AiUsageKind;
  constructor(kind: AiUsageKind) {
    super(`daily ${kind} quota exceeded`);
    this.name = 'QuotaExceededError';
    this.kind = kind;
  }
}

/**
 * Spends one unit of today's `kind` for the company, answering whether it was under `limit`.
 * One statement: the insert creates today's row at 1, and on a conflict the update adds 1 only
 * while the count is below the limit, so concurrent calls never pass it (the row lock orders
 * them) and a refused call changes nothing.
 */
export async function consumeDailyQuota(db: Db | Tx, companyId: CompanyId, kind: AiUsageKind, limit: number): Promise<boolean> {
  if (limit <= 0) return false;
  const rows = await db.execute<{ count: number }>(sql`
    insert into ai_usage_daily (company_id, day, kind, count)
    values (${companyId}, (now() at time zone 'America/Sao_Paulo')::date, ${kind}, 1)
    on conflict (company_id, day, kind) do update set count = ai_usage_daily.count + 1
    where ai_usage_daily.count < ${limit}
    returning count
  `);
  return rows.length > 0;
}
