import { uuidV7Schema } from '@app/domain';
import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { logError } from '../../log.ts';
import { runGenerateJob, type GenerateJobDeps, type GeneratePayload } from './job.ts';

/*
 * AD-15: one pg-boss queue, one job per generate, no automatic retry (a failed job is
 * recorded on its `generation_job` row and the user presses "Tentar novamente"), fifteen
 * minutes before pg-boss gives up on a stuck one. The api process registers the worker
 * when `WORKER=1` (the compose default); the route only sends.
 */

export const GENERATE_QUEUE = 'generate';

/**
 * Seconds pg-boss lets a job stay active before it expires it. The route and the Export
 * dialog treat a `queued`/`running` job older than this as dead (`isJobActive`), so a
 * worker that died mid-job never blocks the next generate forever.
 */
export const GENERATE_JOB_EXPIRE_S = 900;

const QUEUE_OPTIONS = { retryLimit: 0, expireInSeconds: GENERATE_JOB_EXPIRE_S } as const;

const payloadSchema = z.object({
  job_id: uuidV7Schema,
  company_id: uuidV7Schema,
  relatorio_id: uuidV7Schema,
  actor_id: z.string().min(1),
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

export async function registerGenerateWorker(boss: PgBoss, deps: GenerateJobDeps): Promise<void> {
  await ensureGenerateQueue(boss);
  await boss.work<GeneratePayload>(GENERATE_QUEUE, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      const parsed = payloadSchema.safeParse(job.data);
      if (!parsed.success) {
        logError('generate job payload invalid', { job_id: job.id, error: parsed.error.message });
        continue;
      }
      await runGenerateJob(deps, parsed.data);
    }
  });
}
