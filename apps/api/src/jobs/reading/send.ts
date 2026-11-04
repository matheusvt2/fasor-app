import { readingNeedsAi, type Clock, type NewId } from '@app/domain';
import type { Db } from '../../db/client.ts';
import { QuotaExceededError } from '../../db/repositories/ai-usage.ts';
import type { CompanyId } from '../../db/repositories/company-id.ts';
import { log, logError } from '../../log.ts';
import type { ReadingKind, ReadingPayload } from './payload.ts';
import { ReadingSendError, startReading, writeReadingFailed } from './status.ts';

/*
 * Story 8.4, shared since Story 9.2: sends a photo's reading of `readingKind` and writes
 * `running` (`startReading`); a failure is logged, never answered. E78-Q7: when the send
 * itself fails (nothing was queued) the photo is marked `failed`, so the device offers
 * "Tentar novamente" instead of waiting forever. File receipt calls it on the upload of a
 * queued photo; the push route calls it on a client `file/{id}/reading_kind` put whose photo
 * is already uploaded (the "Fotografar equipamento" re-target). Story 20.12: a company at its
 * daily reading ceiling gets no job; the photo is marked `failed` (so "Preencher manualmente"
 * and "Tentar novamente" show) and the call answers `'quota_exceeded'`.
 */

export interface SendReadingDeps {
  db: Db;
  now: Clock;
  newId: NewId;
  /** Absent when the app runs without a queue: nothing is sent and the photo stays `queued`. */
  enqueue?: (payload: ReadingPayload) => Promise<void>;
  /**
   * Story 11.8 follow-up: `false` when the server's `AI_FEATURES` is `off`. A kind that needs
   * the LLM step (`readingNeedsAi`) is then never sent and the photo is marked `failed`, so no
   * device waits forever on `queued`. Absent reads as on.
   */
  aiFeatures?: boolean;
  /** Story 20.12: the company's daily reading ceiling (`StartReadingDeps.dailyQuota`). */
  dailyQuota?: number;
}

/** What became of the send: `quota_exceeded` when the daily ceiling refused it (`FilePutResponse.reading`). */
export type SendReadingOutcome = 'sent' | 'quota_exceeded' | 'not_sent';

export async function sendReading(
  deps: SendReadingDeps,
  companyId: CompanyId,
  photo: { id: string; relatorioId: string | null },
  readingKind: ReadingKind,
): Promise<SendReadingOutcome> {
  const fields = { company_id: companyId, relatorio_id: photo.relatorioId, file_id: photo.id, reading_kind: readingKind };
  if (deps.aiFeatures === false && readingNeedsAi(readingKind)) {
    log('reading refused: ai features off', fields);
    try {
      await writeReadingFailed({ db: deps.db, now: deps.now, newId: deps.newId }, companyId, photo, 'queued');
    } catch (writeError) {
      logError('reading failed status not written', { ...fields, error: String(writeError) });
    }
    return 'not_sent';
  }
  const enqueue = deps.enqueue;
  if (enqueue === undefined) {
    log('reading not enqueued: no queue', fields);
    return 'not_sent';
  }
  try {
    await startReading(
      { db: deps.db, now: deps.now, newId: deps.newId, enqueue, ...(deps.dailyQuota === undefined ? {} : { dailyQuota: deps.dailyQuota }) },
      companyId,
      photo,
      { company_id: companyId, photo_id: photo.id, reading_kind: readingKind },
    );
    return 'sent';
  } catch (error) {
    const quota = error instanceof QuotaExceededError;
    if (!quota) logError('reading enqueue failed', { ...fields, error: String(error) });
    if (!quota && !(error instanceof ReadingSendError)) return 'not_sent';
    try {
      await writeReadingFailed({ db: deps.db, now: deps.now, newId: deps.newId }, companyId, photo, 'queued');
    } catch (writeError) {
      logError('reading failed status not written', { ...fields, error: String(writeError) });
    }
    return quota ? 'quota_exceeded' : 'not_sent';
  }
}
