import { AUDIT_RUN_EXPIRE_S, AUDIT_RUN_QUEUE_RETENTION_S, toIso, uuidV7Schema } from '@app/domain';
import { and, eq } from 'drizzle-orm';
import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { asCompanyId } from '../../db/repositories/company-id.ts';
import { entities } from '../../db/schema.ts';
import { log, logError } from '../../log.ts';
import { applyOps } from '../../sync/apply.ts';
import { createQueueOnce } from '../queue.ts';
import { auditRunPut, runAuditJob, type AuditJobDeps } from './job.ts';
import { auditPayloadSchema, type AuditPayload } from './payload.ts';

/*
 * Story 13.8: the `audit` queue, a sibling of `generate` and `reading` on the same pg-boss
 * instance (the reading framework is photo-bound, so the audit is not a reading kind). One job
 * per tap, no retry (`retryLimit: 0`: one tap is at most one LLM call), a singleton on the
 * run id, and the two ages `auditRunActive` reads: `expireInSeconds` after the job starts and
 * `retentionSeconds` while it waits.
 */

export const AUDIT_QUEUE = 'audit';

const QUEUE_OPTIONS = { retryLimit: 0, expireInSeconds: AUDIT_RUN_EXPIRE_S, retentionSeconds: AUDIT_RUN_QUEUE_RETENTION_S } as const;

export async function ensureAuditQueue(boss: PgBoss): Promise<void> {
  await createQueueOnce(boss, AUDIT_QUEUE, QUEUE_OPTIONS);
}

export async function enqueueAudit(boss: PgBoss, payload: AuditPayload): Promise<void> {
  await ensureAuditQueue(boss);
  const id = await boss.send(AUDIT_QUEUE, payload, { ...QUEUE_OPTIONS, singletonKey: payload.run_id });
  if (id === null) throw new Error('pg-boss did not accept the audit job');
}

const runIdsSchema = z.object({ run_id: uuidV7Schema, company_id: uuidV7Schema });

/** A payload the schema refuses fails its run row when the run and company ids parse and the row exists; else it is only logged. */
async function recordInvalidPayload(deps: AuditJobDeps, data: unknown, queueJobId: string): Promise<void> {
  const ids = runIdsSchema.safeParse(data);
  if (!ids.success) return;
  const { run_id, company_id } = ids.data;
  const companyId = asCompanyId(company_id);
  const fields = { queue_job_id: queueJobId, job_id: run_id, company_id };
  try {
    const [record] = await deps.db
      .select({ relatorio_id: entities.relatorio_id })
      .from(entities)
      .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'audit_run'), eq(entities.id, run_id)))
      .limit(1);
    if (record === undefined || record.relatorio_id === null) {
      log('audit job payload invalid, no run row to fail', fields);
      return;
    }
    const at = toIso(deps.now());
    const run = { run_id, company_id, relatorio_id: record.relatorio_id };
    const result = await applyOps(deps.db, companyId, [auditRunPut(run, at, deps.newId, 'status', 'failed'), auditRunPut(run, at, deps.newId, 'error', 'audit_failed')], {
      now: deps.now,
      origin: 'server',
    });
    if (result.rejected.length > 0) logError('audit invalid payload could not fail its run row', { ...fields, rejected: result.rejected });
  } catch (error) {
    logError('audit invalid payload could not fail its run row', { ...fields, error: String(error) });
  }
}

/** One batch of queue jobs: each valid payload runs once; an invalid one is logged and, when it can be, fails its run row. */
export async function handleAuditJobs(deps: AuditJobDeps, jobs: readonly { id: string; data: unknown }[]): Promise<void> {
  for (const job of jobs) {
    const parsed = auditPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      logError('audit job payload invalid', { job_id: job.id, error: parsed.error.message });
      await recordInvalidPayload(deps, job.data, job.id);
      continue;
    }
    await runAuditJob(deps, parsed.data);
  }
}

export async function registerAuditWorker(boss: PgBoss, deps: AuditJobDeps): Promise<void> {
  await ensureAuditQueue(boss);
  await boss.work<AuditPayload>(AUDIT_QUEUE, { batchSize: 1 }, (jobs) => handleAuditJobs(deps, jobs));
}
