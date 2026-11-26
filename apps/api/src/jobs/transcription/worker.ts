import { uuidV7Schema } from '@app/domain';
import type { PgBoss, WorkOptions } from 'pg-boss';
import { z } from 'zod';
import { asCompanyId } from '../../db/repositories/company-id.ts';
import { log, logError } from '../../log.ts';
import { createQueueOnce } from '../queue.ts';
import { entityRecord } from '../reading/kinds/shared.ts';
import { runTranscriptionJob, type TranscriptionJobDeps } from './job.ts';
import { transcriptionPayloadSchema, type TranscriptionPayload } from './payload.ts';
import { writeAudioStatus, type AudioStatusDeps } from './status.ts';

/*
 * Story 31.2 (AD-30): the `transcription` pg-boss queue, a sibling of `reading` on the same
 * instance. Policy `stately` with the audio id as singleton key keeps one queued and one active job
 * per audio, so a second send while one waits is a no-op. Three attempts in all (`retryLimit: 2`)
 * with exponential backoff; pg-boss counts an expired job as an attempt too. The api registers the
 * worker when `WORKER=1`; file receipt and the retranscribe route only send.
 *
 * A job whose last attempt dies (expired, or the worker killed) never reaches the handler's own
 * `failed` write: the dead letter queue (`transcription-dead`) receives it, and its worker writes
 * `failed` while the audio is still `transcribing` and no newer job for it is queued or active.
 */

export const TRANSCRIPTION_QUEUE = 'transcription';

export function transcriptionDeadLetterQueue(queue: string): string {
  return `${queue}-dead`;
}

/** The retry and expiry policy of a transcription job; tests shrink it. */
export interface TranscriptionQueueOptions {
  retryLimit: number;
  retryBackoff: boolean;
  retryDelay: number;
  retryDelayMax?: number;
  expireInSeconds: number;
}

export const TRANSCRIPTION_QUEUE_OPTIONS: TranscriptionQueueOptions = {
  retryLimit: 2,
  retryBackoff: true,
  retryDelay: 5,
  retryDelayMax: 60,
  expireInSeconds: 600,
};

export interface TranscriptionQueueTarget {
  /** Defaults to `TRANSCRIPTION_QUEUE`. */
  queue?: string;
  /** Defaults to `TRANSCRIPTION_QUEUE_OPTIONS`. */
  queueOptions?: TranscriptionQueueOptions;
}

/** Creates the queue (and its dead letter queue first) when it does not exist yet. */
export async function ensureTranscriptionQueue(boss: PgBoss, target: TranscriptionQueueTarget = {}): Promise<void> {
  const queue = target.queue ?? TRANSCRIPTION_QUEUE;
  const deadLetter = transcriptionDeadLetterQueue(queue);
  if ((await boss.getQueue(queue)) !== null) return;
  await createQueueOnce(boss, deadLetter, { policy: 'standard', retryLimit: 2, retryDelay: 5, expireInSeconds: 60 });
  await createQueueOnce(boss, queue, { policy: 'stately', ...(target.queueOptions ?? TRANSCRIPTION_QUEUE_OPTIONS), deadLetter });
}

/** Sends one transcription job, singleton per audio. A null id means one is already queued for it: that is success. */
export async function enqueueTranscription(boss: PgBoss, payload: TranscriptionPayload, target: TranscriptionQueueTarget = {}): Promise<void> {
  await ensureTranscriptionQueue(boss, target);
  await boss.send(target.queue ?? TRANSCRIPTION_QUEUE, payload, { ...(target.queueOptions ?? TRANSCRIPTION_QUEUE_OPTIONS), singletonKey: payload.audio_id });
}

/** One queued job as the handler reads it (pg-boss's job with its retry metadata). */
export interface TranscriptionQueueJob {
  id: string;
  data: unknown;
  retryCount: number;
  retryLimit: number;
}

/** One batch of transcription jobs: each valid payload runs one attempt; an invalid one is logged. */
export async function handleTranscriptionJobs(deps: TranscriptionJobDeps, jobs: readonly TranscriptionQueueJob[]): Promise<void> {
  for (const job of jobs) {
    const parsed = transcriptionPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      logError('transcription job payload invalid', { job_id: job.id, error: parsed.error.message });
      continue;
    }
    await runTranscriptionJob(deps, parsed.data, { jobId: job.id, attempt: job.retryCount + 1, lastAttempt: job.retryCount >= job.retryLimit });
  }
}

export interface RegisterTranscriptionWorkerOptions extends TranscriptionQueueTarget {
  /** Extra `work` options (the tests poll faster). */
  workOptions?: Pick<WorkOptions, 'pollingIntervalSeconds'>;
}

export async function registerTranscriptionWorker(boss: PgBoss, deps: TranscriptionJobDeps, options: RegisterTranscriptionWorkerOptions = {}): Promise<string> {
  const queue = options.queue ?? TRANSCRIPTION_QUEUE;
  await ensureTranscriptionQueue(boss, options);
  await registerTranscriptionDeadLetterWorker(boss, deps, options);
  const workOptions = { ...options.workOptions, batchSize: 1, includeMetadata: true } as const;
  return boss.work<TranscriptionPayload, void, typeof workOptions>(queue, workOptions, (jobs) => handleTranscriptionJobs(deps, jobs));
}

const LIVE_STATES: ReadonlySet<string> = new Set(['created', 'retry', 'active']);

const idsSchema = z.object({ company_id: uuidV7Schema, audio_id: uuidV7Schema });

/** Writes `failed` for a dead-lettered job whose audio is still `transcribing` with no live job of its own. */
export async function failDeadTranscription(boss: PgBoss, deps: AudioStatusDeps, queue: string, data: unknown, jobId: string): Promise<boolean> {
  const ids = idsSchema.safeParse(data);
  if (!ids.success) return false;
  const companyId = asCompanyId(ids.data.company_id);
  const record = await entityRecord(deps.db, companyId, 'file', ids.data.audio_id);
  const fields = { company_id: ids.data.company_id, audio_id: ids.data.audio_id, job_id: jobId };
  if (record === null) {
    log('dead transcription: no such audio', fields);
    return false;
  }
  const stillLive = async () => (await boss.findJobs(queue, { key: ids.data.audio_id })).some((job) => LIVE_STATES.has(job.state));
  const wrote = await writeAudioStatus(deps, companyId, { id: ids.data.audio_id, relatorioId: record.relatorio_id }, ['transcribing'], 'failed', stillLive);
  log(wrote ? 'dead transcription marked failed' : 'dead transcription left as it is', fields);
  return wrote;
}

export async function registerTranscriptionDeadLetterWorker(boss: PgBoss, deps: AudioStatusDeps, options: RegisterTranscriptionWorkerOptions = {}): Promise<string> {
  const queue = options.queue ?? TRANSCRIPTION_QUEUE;
  const workOptions = { ...options.workOptions, batchSize: 1 } as const;
  return boss.work(transcriptionDeadLetterQueue(queue), workOptions, async (jobs) => {
    for (const job of jobs) await failDeadTranscription(boss, deps, queue, job.data, job.id);
  });
}
