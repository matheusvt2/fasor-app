import { audioFileRowSchema, fileFieldPath, toIso, type AudioStatus, type Clock, type NewId, type Op } from '@app/domain';
import type { Db } from '../../db/client.ts';
import { consumeDailyQuota, DEFAULT_TRANSCRIPTION_DAILY_QUOTA } from '../../db/repositories/ai-usage.ts';
import type { CompanyId } from '../../db/repositories/company-id.ts';
import { log, logError } from '../../log.ts';
import { applyServerBatch, ServerBatchRejectedError, type Tx } from '../../sync/apply.ts';
import { serverOp } from '../../sync/server-op.ts';
import { entityRecord } from '../reading/kinds/shared.ts';
import type { TranscriptionPayload } from './payload.ts';

/*
 * Story 31.2 (AD-30): the audio status transitions, every one but `dismissed` written by
 * `system:transcription`: the device's create says `queued`; file receipt and
 * `POST /api/audios/{id}/retranscribe` send one job and write `transcribing`; the job writes
 * `done`, or `failed` after its third attempt. Each write checks, under the company lock, the
 * status it moves from, so a device's dismiss or a faster job is never written over.
 */

export const TRANSCRIPTION_ACTOR = 'system:transcription';

/** One server op of the transcription job's actor, in the audio's relatório. */
export function transcriptionServerOp(input: {
  companyId: string;
  relatorioId: string | null;
  kind: 'create' | 'put';
  path: string;
  value: unknown;
  batchId: string | null;
  meta?: Op['meta'];
  now: Clock;
  newId: NewId;
}): Op {
  return serverOp({
    opId: input.newId(),
    companyId: input.companyId,
    actorId: TRANSCRIPTION_ACTOR,
    clientTs: toIso(input.now()),
    kind: input.kind,
    path: input.path,
    value: input.value,
    relatorioId: input.relatorioId,
    batchId: input.batchId,
    ...(input.meta === undefined ? {} : { meta: input.meta }),
  });
}

/** The audio's stored status, read inside the caller's transaction; null when the company holds no such live audio. */
export async function storedAudioStatus(db: Db | Tx, companyId: CompanyId, audioId: string): Promise<AudioStatus | null> {
  const record = await entityRecord(db, companyId, 'file', audioId);
  const parsed = record === null ? null : audioFileRowSchema.safeParse(record.row);
  return parsed === null || !parsed.success ? null : parsed.data.audio_status;
}

/** Why `writeAudioStatus` wrote nothing: the status moved from the one it expected. */
class StatusMovedError extends Error {}

export interface AudioStatusDeps {
  db: Db;
  now: Clock;
  newId: NewId;
}

/**
 * Writes `audio_status = to` as `system:transcription`, under the company lock, only while the
 * stored status is one of `from` and `stillLive` (when given) finds no job that will write an
 * outcome of its own. Returns whether it was written.
 */
export async function writeAudioStatus(
  deps: AudioStatusDeps,
  companyId: CompanyId,
  audio: { id: string; relatorioId: string | null },
  from: readonly AudioStatus[],
  to: AudioStatus,
  stillLive?: () => Promise<boolean>,
): Promise<boolean> {
  const op = transcriptionServerOp({ companyId, relatorioId: audio.relatorioId, kind: 'put', path: fileFieldPath(audio.id, 'audio_status'), value: to, batchId: null, now: deps.now, newId: deps.newId });
  try {
    await applyServerBatch(deps.db, companyId, [op], {
      now: deps.now,
      before: async (tx) => {
        const status = await storedAudioStatus(tx, companyId, audio.id);
        if (status === null || !from.includes(status)) throw new StatusMovedError();
        if (stillLive !== undefined && (await stillLive())) throw new StatusMovedError();
      },
    });
    return true;
  } catch (error) {
    if (error instanceof StatusMovedError) return false;
    if (error instanceof ServerBatchRejectedError) throw new Error(`audio ${to} op rejected: ${error.message}`, { cause: error });
    throw error;
  }
}

export interface StartTranscriptionDeps extends AudioStatusDeps {
  /** Absent when the app runs without a queue: nothing is sent and the audio stays as it is. */
  enqueue?: (payload: TranscriptionPayload) => Promise<void>;
  /** `false` when the server's `AI_FEATURES` is `off`: no job is started and the audio stays as it is. Absent reads as on. */
  aiFeatures?: boolean;
  /** Security pass 2026-11-26 (A1): the company's daily ceiling of transcriptions started; absent, `DEFAULT_TRANSCRIPTION_DAILY_QUOTA`. */
  dailyQuota?: number;
}

/** What became of a start: `sent` (and `transcribing` written), or why not. */
export type StartTranscriptionOutcome = 'sent' | 'ai_off' | 'no_queue' | 'quota_exceeded' | 'moved' | 'send_failed';

/**
 * Sends one transcription job for an audio whose status is still one of `from`, then writes
 * `transcribing` when the status has not moved meanwhile. File receipt starts a `queued` audio;
 * the retranscribe route a `failed` one. A failed send of a `queued` audio marks it `failed`, so the
 * device offers "Tentar de novo" instead of waiting forever. Never throws on a send failure.
 *
 * Security pass 2026-11-26 (A1): each start spends one unit of the company's daily `transcription`
 * ceiling before the send. At the ceiling nothing is sent and the audio stays as it is (a `queued`
 * audio the server holds, or a `failed` one: both offer "Tentar de novo", which the route answers
 * `429 quota_exceeded` until the next day). The job's own retries spend nothing.
 */
export async function startTranscription(
  deps: StartTranscriptionDeps,
  companyId: CompanyId,
  audio: { id: string; relatorioId: string | null },
  from: readonly AudioStatus[],
): Promise<StartTranscriptionOutcome> {
  const fields = { company_id: companyId, relatorio_id: audio.relatorioId, file_id: audio.id, kind: 'transcription' };
  if (deps.aiFeatures === false) {
    log('transcription not started: ai features off', fields);
    return 'ai_off';
  }
  if (deps.enqueue === undefined) {
    log('transcription not started: no queue', fields);
    return 'no_queue';
  }
  if (!(await consumeDailyQuota(deps.db, companyId, 'transcription', deps.dailyQuota ?? DEFAULT_TRANSCRIPTION_DAILY_QUOTA))) {
    // One line per start the ceiling refused (the `QuotaExceeded` metric filter reads `msg`, `company_id` and `kind`).
    log('quota_exceeded', fields);
    return 'quota_exceeded';
  }
  // One line per transcription started (a per-company count of paid speech work).
  log('transcription_started', fields);
  try {
    await deps.enqueue({ company_id: companyId, audio_id: audio.id });
  } catch (error) {
    logError('transcription enqueue failed', { ...fields, error: String(error) });
    try {
      await writeAudioStatus(deps, companyId, audio, from, 'failed');
    } catch (writeError) {
      logError('audio failed status not written', { ...fields, error: String(writeError) });
    }
    return 'send_failed';
  }
  const wrote = await writeAudioStatus(deps, companyId, audio, from, 'transcribing');
  if (!wrote) log('audio status moved before transcribing was written', fields);
  return wrote ? 'sent' : 'moved';
}
