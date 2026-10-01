import { readingSingletonKey, uuidV7Schema } from '@app/domain';
import { and, eq } from 'drizzle-orm';
import type { PgBoss, WorkOptions } from 'pg-boss';
import { z } from 'zod';
import { asCompanyId } from '../../db/repositories/company-id.ts';
import { findFileRow } from '../../db/repositories/files.ts';
import { entities } from '../../db/schema.ts';
import { log, logError } from '../../log.ts';
import { createQueueOnce } from '../queue.ts';
import { runReadingJob, type ReadingJobDeps } from './job.ts';
import { readingPayloadSchema, type ReadingPayload } from './payload.ts';
import { writeReadingFailed, type WriteFailedDeps } from './status.ts';

/*
 * Story 8.4: the `reading` pg-boss queue. Policy `stately` with the singleton key
 * `${photo_id}:${reading_kind}` keeps one queued and one active job per photo and kind, so a
 * reread during a run queues exactly one more and a second send while one waits is a no-op.
 * Three attempts in all (`retryLimit: 2`) with exponential backoff; pg-boss counts an expired
 * job (a worker that died mid-read) as an attempt too. The api process registers the worker
 * when `WORKER=1`; file receipt and the reread route only send.
 *
 * E78-Q6: a job whose last attempt dies (expired, or the worker killed) never reaches the
 * handler's own `failed` write, so its photo would stay `running` forever. The queue's dead
 * letter queue (`reading-dead`, created first) receives it, and its worker writes `failed` as
 * `system:reading` when the photo is still `running` and no newer job for the same singleton
 * key is queued or active (that one writes its own outcome).
 */

export const READING_QUEUE = 'reading';

/** The dead letter queue of a reading queue: `reading-dead` for `reading`. */
export function readingDeadLetterQueue(queue: string): string {
  return `${queue}-dead`;
}

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

/** The schema pg-boss keeps its tables in: `jobs/queue.ts` constructs it with the default. */
const PGBOSS_SCHEMA = 'pgboss';

/**
 * Epic 9 A13: pg-boss copies the queue's dead letter onto a job only at send time, so a job
 * sent before the queue got one would die without reaching `reading-dead` and leave its
 * photo `running`. Once the queue has its dead letter, the live jobs (created, retry or
 * active) that carry none get it too. Returns how many jobs were updated.
 */
async function backfillDeadLetter(boss: PgBoss, queue: string, deadLetter: string): Promise<number> {
  const result = await boss
    .getDb()
    .executeSql(
      `UPDATE ${PGBOSS_SCHEMA}.job SET dead_letter = $2 WHERE name = $1 AND dead_letter IS NULL AND state IN ('created', 'retry', 'active') RETURNING id`,
      [queue, deadLetter],
    );
  return result.rows.length;
}

/**
 * Creates the queue when it does not exist yet (pg-boss 12 refuses `send` on an unknown
 * queue), its dead letter queue first (the queue names it); an existing queue created before
 * the dead letter existed gets it set (E78-Q6), and so do its live jobs (A13).
 */
export async function ensureReadingQueue(boss: PgBoss, target: ReadingQueueTarget = {}): Promise<void> {
  const queue = target.queue ?? READING_QUEUE;
  const deadLetter = readingDeadLetterQueue(queue);
  const existing = await boss.getQueue(queue);
  if (existing !== null && existing.deadLetter === deadLetter) return;
  await createQueueOnce(boss, deadLetter, { policy: 'standard', retryLimit: 2, retryDelay: 5, expireInSeconds: 60 });
  if (existing === null) await createQueueOnce(boss, queue, { policy: 'stately', ...(target.queueOptions ?? READING_QUEUE_OPTIONS), deadLetter });
  const current = await boss.getQueue(queue);
  if (current !== null && current.deadLetter !== deadLetter) await boss.updateQueue(queue, { deadLetter });
  if (existing !== null) {
    const updated = await backfillDeadLetter(boss, queue, deadLetter);
    if (updated > 0) log('reading jobs given the dead letter', { queue, dead_letter: deadLetter, jobs: updated });
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
  await registerReadingDeadLetterWorker(boss, deps, options);
  const workOptions = { ...options.workOptions, batchSize: 1, includeMetadata: true } as const;
  return boss.work<ReadingPayload, void, typeof workOptions>(queue, workOptions, (jobs) => handleReadingJobs(deps, jobs));
}

/** One queued reading job as the handler reads it (pg-boss's job with its retry metadata). */
export interface ReadingQueueJob {
  id: string;
  data: unknown;
  retryCount: number;
  retryLimit: number;
}

/** What an invalid payload still has to carry for its photo to be found (A-14). */
const photoIdsSchema = z.object({ company_id: uuidV7Schema, photo_id: uuidV7Schema });

/**
 * Review 2026-09-30, A-14: a payload the worker schema refuses would complete without an
 * outcome and leave its photo `running` forever. When its company and photo ids still parse
 * and the photo exists, `failed` is written as `system:reading` (from `running`, or from
 * `queued` when the job was picked up before `running` landed), so the device shows the
 * failure and "Ler novamente" can start over; otherwise the refusal is only logged.
 */
async function failInvalidPayload(deps: ReadingJobDeps, data: unknown, queueJobId: string): Promise<void> {
  const ids = photoIdsSchema.safeParse(data);
  if (!ids.success) return;
  const companyId = asCompanyId(ids.data.company_id);
  const fields = { job_id: queueJobId, company_id: ids.data.company_id, photo_id: ids.data.photo_id };
  try {
    const found = await findFileRow(deps.db, companyId, ids.data.photo_id);
    if (found === null || found.row.kind !== 'photo') {
      log('reading job payload invalid, no photo to fail', fields);
      return;
    }
    const photo = { id: ids.data.photo_id, relatorioId: found.relatorioId };
    const wrote = (await writeReadingFailed(deps, companyId, photo, 'running')) || (await writeReadingFailed(deps, companyId, photo, 'queued'));
    log(wrote ? 'reading job payload invalid, photo marked failed' : 'reading job payload invalid, photo left as it is', { ...fields, relatorio_id: found.relatorioId });
  } catch (error) {
    logError('reading invalid payload could not fail its photo', { ...fields, error: String(error) });
  }
}

/** One batch of reading jobs: each valid payload runs one attempt; an invalid one fails its photo when it can (A-14). */
export async function handleReadingJobs(deps: ReadingJobDeps, jobs: readonly ReadingQueueJob[]): Promise<void> {
  for (const job of jobs) {
    const parsed = readingPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      logError('reading job payload invalid', { job_id: job.id, error: parsed.error.message });
      await failInvalidPayload(deps, job.data, job.id);
      continue;
    }
    await runReadingJob(deps, parsed.data, {
      jobId: job.id,
      attempt: job.retryCount + 1,
      lastAttempt: job.retryCount >= job.retryLimit,
    });
  }
}

/**
 * E78-Q6: the worker of the dead letter queue. A reading job lands there when its last attempt
 * failed without the handler writing an outcome (it expired, or its worker died). It writes
 * `failed` only while the photo is still `running` and no job for the photo's singleton key is
 * queued or active in the reading queue.
 */
export async function registerReadingDeadLetterWorker(boss: PgBoss, deps: WriteFailedDeps, options: RegisterReadingWorkerOptions = {}): Promise<string> {
  const queue = options.queue ?? READING_QUEUE;
  const workOptions = { ...options.workOptions, batchSize: 1 } as const;
  return boss.work<ReadingPayload>(readingDeadLetterQueue(queue), workOptions, async (jobs) => {
    for (const job of jobs) {
      const parsed = readingPayloadSchema.safeParse(job.data);
      if (!parsed.success) {
        logError('dead reading job payload invalid', { job_id: job.id, error: parsed.error.message });
        continue;
      }
      await failDeadReading(boss, deps, queue, parsed.data, job.id);
    }
  });
}

const LIVE_STATES: ReadonlySet<string> = new Set(['created', 'retry', 'active']);

/** Writes `failed` for a dead-lettered reading whose photo is still `running` with no live job of its key. */
export async function failDeadReading(boss: PgBoss, deps: WriteFailedDeps, queue: string, payload: ReadingPayload, jobId: string): Promise<boolean> {
  const companyId = asCompanyId(payload.company_id);
  const [record] = await deps.db
    .select({ relatorio_id: entities.relatorio_id })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'file'), eq(entities.id, payload.photo_id)))
    .limit(1);
  const fields = { company_id: payload.company_id, photo_id: payload.photo_id, reading_kind: payload.reading_kind, job_id: jobId };
  if (record === undefined) {
    log('dead reading: no such photo', fields);
    return false;
  }
  const key = readingSingletonKey(payload.photo_id, payload.reading_kind);
  const stillLive = async () => (await boss.findJobs(queue, { key })).some((job) => LIVE_STATES.has(job.state));
  const wrote = await writeReadingFailed(deps, companyId, { id: payload.photo_id, relatorioId: record.relatorio_id }, 'running', stillLive);
  log(wrote ? 'dead reading marked failed' : 'dead reading left as it is', fields);
  return wrote;
}
