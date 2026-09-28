import { readingSingletonKey } from '@app/domain';
import type { PgBoss, WorkOptions } from 'pg-boss';
import { logError } from '../../log.ts';
import { runReadingJob, type ReadingJobDeps } from './job.ts';
import { readingPayloadSchema, type ReadingPayload } from './payload.ts';

/*
 * Story 8.4: the `reading` pg-boss queue. Policy `stately` with the singleton key
 * `${photo_id}:${reading_kind}` keeps one queued and one active job per photo and kind, so a
 * reread during a run queues exactly one more and a second send while one waits is a no-op.
 * Three attempts in all (`retryLimit: 2`) with exponential backoff; pg-boss counts an expired
 * job (a worker that died mid-read) as an attempt too. The api process registers the worker
 * when `WORKER=1`; file receipt and the reread route only send.
 */

export const READING_QUEUE = 'reading';

/** The retry and expiry policy of a reading job; tests shrink it. */
export interface ReadingQueueOptions {
  retryLimit: number;
  retryBackoff: boolean;
  retryDelay: number;
  /** Only with `retryBackoff` (pg-boss refuses it otherwise). */
  retryDelayMax?: number;
  expireInSeconds: number;
}

export const READING_QUEUE_OPTIONS: ReadingQueueOptions = {
  retryLimit: 2,
  retryBackoff: true,
  retryDelay: 5,
  retryDelayMax: 60,
  expireInSeconds: 300,
};

export interface ReadingQueueTarget {
  /** Defaults to `READING_QUEUE`. */
  queue?: string;
  /** Defaults to `READING_QUEUE_OPTIONS`. */
  queueOptions?: ReadingQueueOptions;
}

/**
 * Creates the queue when it does not exist yet (pg-boss 12 refuses `send` on an unknown
 * queue); a `createQueue` that loses a race to another first send is fine once the queue exists.
 */
export async function ensureReadingQueue(boss: PgBoss, target: ReadingQueueTarget = {}): Promise<void> {
  const queue = target.queue ?? READING_QUEUE;
  if ((await boss.getQueue(queue)) !== null) return;
  try {
    await boss.createQueue(queue, { policy: 'stately', ...(target.queueOptions ?? READING_QUEUE_OPTIONS) });
  } catch (error) {
    if ((await boss.getQueue(queue)) === null) throw error;
  }
}

/** Sends one reading job. A null id means one is already queued for the key: that is success. */
export async function enqueueReading(boss: PgBoss, payload: ReadingPayload, target: ReadingQueueTarget = {}): Promise<void> {
  await ensureReadingQueue(boss, target);
  await boss.send(target.queue ?? READING_QUEUE, payload, {
    ...(target.queueOptions ?? READING_QUEUE_OPTIONS),
    singletonKey: readingSingletonKey(payload.photo_id, payload.reading_kind),
  });
}

export interface RegisterReadingWorkerOptions extends ReadingQueueTarget {
  /** Extra `work` options (the tests poll faster). */
  workOptions?: Pick<WorkOptions, 'pollingIntervalSeconds'>;
}

export async function registerReadingWorker(boss: PgBoss, deps: ReadingJobDeps, options: RegisterReadingWorkerOptions = {}): Promise<string> {
  const queue = options.queue ?? READING_QUEUE;
  await ensureReadingQueue(boss, options);
  const workOptions = { ...options.workOptions, batchSize: 1, includeMetadata: true } as const;
  return boss.work<ReadingPayload, void, typeof workOptions>(queue, workOptions, async (jobs) => {
    for (const job of jobs) {
      const parsed = readingPayloadSchema.safeParse(job.data);
      if (!parsed.success) {
        logError('reading job payload invalid', { job_id: job.id, error: parsed.error.message });
        continue;
      }
      await runReadingJob(deps, parsed.data, {
        jobId: job.id,
        attempt: job.retryCount + 1,
        lastAttempt: job.retryCount >= job.retryLimit,
      });
    }
  });
}
