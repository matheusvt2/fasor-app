import { GENERATE_JOB_EXPIRE_S, GENERATE_JOB_QUEUE_RETENTION_S, SERVER_DEVICE_ID, toIso, uuidV7Schema, type Op } from '@app/domain';
import { and, eq } from 'drizzle-orm';
import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { asCompanyId } from '../../db/repositories/company-id.ts';
import { entities } from '../../db/schema.ts';
import { log, logError } from '../../log.ts';
import { applyOps } from '../../sync/apply.ts';
import { GENERATE_ACTOR, runGenerateJob, type GenerateJobDeps, type GeneratePayload } from './job.ts';

/*
 * AD-15: one pg-boss queue, one job per generate, no automatic retry (a failed job is
 * recorded on its `generation_job` row and the user presses "Tentar novamente"), fifteen
 * minutes before pg-boss gives up on a stuck one. The api process registers the worker
 * when `WORKER=1` (the compose default); the route only sends.
 */

export const GENERATE_QUEUE = 'generate';

/**
 * `expireInSeconds` is the kernel's `GENERATE_JOB_EXPIRE_S` (a running job's life after its
 * `started_at`) and `retentionSeconds` its `GENERATE_JOB_QUEUE_RETENTION_S` (how long a
 * created job waits for a worker): the two ages `isJobActive` reads (R7).
 */
const QUEUE_OPTIONS = { retryLimit: 0, expireInSeconds: GENERATE_JOB_EXPIRE_S, retentionSeconds: GENERATE_JOB_QUEUE_RETENTION_S } as const;

const payloadSchema = z.object({
  job_id: uuidV7Schema,
  company_id: uuidV7Schema,
  relatorio_id: uuidV7Schema,
  actor_id: z.string().min(1),
  // Story 7.5: absent on payloads queued before previews existed, which were all issues.
  kind: z.enum(['issue', 'preview']).optional(),
});

/**
 * Creates the queue when it does not exist yet (pg-boss 12 refuses `send` on an unknown
 * queue). Two first sends may race here: a `createQueue` that fails because the other
 * one just won is fine as long as the queue exists afterwards.
 */
export async function ensureGenerateQueue(boss: PgBoss): Promise<void> {
  if ((await boss.getQueue(GENERATE_QUEUE)) !== null) return;
  try {
    await boss.createQueue(GENERATE_QUEUE, QUEUE_OPTIONS);
  } catch (error) {
    if ((await boss.getQueue(GENERATE_QUEUE)) === null) throw error;
  }
}

export async function enqueueGenerate(boss: PgBoss, payload: GeneratePayload): Promise<void> {
  await ensureGenerateQueue(boss);
  const id = await boss.send(GENERATE_QUEUE, payload, QUEUE_OPTIONS);
  if (id === null) throw new Error('pg-boss did not accept the generate job');
}

/** What an invalid payload still has to carry for its job row to be found. */
const jobIdsSchema = z.object({ job_id: uuidV7Schema, company_id: uuidV7Schema });

/**
 * Story 4.8 review debt R9: a payload the worker schema refuses fails its `generation_job`
 * row with `render_failed`, so the Export dialog shows the failure instead of waiting on a
 * job that will never run. That needs the job and company ids to parse and the row to
 * exist (its `relatorio_id` is read from it); otherwise the refusal is only logged.
 */
async function recordInvalidPayload(deps: GenerateJobDeps, data: unknown, queueJobId: string): Promise<void> {
  const ids = jobIdsSchema.safeParse(data);
  if (!ids.success) return;
  const { job_id, company_id } = ids.data;
  const companyId = asCompanyId(company_id);
  const fields = { queue_job_id: queueJobId, job_id, company_id };
  try {
    const [record] = await deps.db
      .select({ relatorio_id: entities.relatorio_id })
      .from(entities)
      .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'generation_job'), eq(entities.id, job_id)))
      .limit(1);
    if (record === undefined || record.relatorio_id === null) {
      log('generate job payload invalid, no job row to fail', fields);
      return;
    }
    const now = toIso(deps.now());
    const put = (field: 'status' | 'error', value: string): Op => ({
      op_id: deps.newId(),
      kind: 'put',
      scope: 'relatorio',
      company_id,
      project_id: null,
      relatorio_id: record.relatorio_id,
      path: `generation_job/${job_id}/${field}`,
      value,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: GENERATE_ACTOR,
      device_id: SERVER_DEVICE_ID,
      client_ts: now,
    });
    const result = await applyOps(deps.db, companyId, [put('status', 'failed'), put('error', 'render_failed')], { now: deps.now, origin: 'server' });
    if (result.rejected.length > 0) logError('generate invalid payload could not fail its job row', { ...fields, rejected: result.rejected });
  } catch (error) {
    logError('generate invalid payload could not fail its job row', { ...fields, error: String(error) });
  }
}

/** One batch of queue jobs: each valid payload runs; an invalid one is logged and, when it can be, fails its job row (R9). */
export async function handleGenerateJobs(deps: GenerateJobDeps, jobs: readonly { id: string; data: unknown }[]): Promise<void> {
  for (const job of jobs) {
    const parsed = payloadSchema.safeParse(job.data);
    if (!parsed.success) {
      logError('generate job payload invalid', { job_id: job.id, error: parsed.error.message });
      await recordInvalidPayload(deps, job.data, job.id);
      continue;
    }
    await runGenerateJob(deps, parsed.data);
  }
}

export async function registerGenerateWorker(boss: PgBoss, deps: GenerateJobDeps): Promise<void> {
  await ensureGenerateQueue(boss);
  await boss.work<GeneratePayload>(GENERATE_QUEUE, { batchSize: 1 }, (jobs) => handleGenerateJobs(deps, jobs));
}
