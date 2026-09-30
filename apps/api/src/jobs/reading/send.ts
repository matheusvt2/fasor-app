import { readingNeedsAi, type Clock, type NewId } from '@app/domain';
import type { Db } from '../../db/client.ts';
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
 * is already uploaded (the "Fotografar equipamento" re-target).
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
}

export async function sendReading(deps: SendReadingDeps, companyId: CompanyId, photo: { id: string; relatorioId: string | null }, readingKind: ReadingKind): Promise<void> {
  const fields = { company_id: companyId, relatorio_id: photo.relatorioId, file_id: photo.id, reading_kind: readingKind };
  if (deps.aiFeatures === false && readingNeedsAi(readingKind)) {
    log('reading refused: ai features off', fields);
    try {
      await writeReadingFailed({ db: deps.db, now: deps.now, newId: deps.newId }, companyId, photo, 'queued');
    } catch (writeError) {
      logError('reading failed status not written', { ...fields, error: String(writeError) });
    }
    return;
  }
  const enqueue = deps.enqueue;
  if (enqueue === undefined) {
    log('reading not enqueued: no queue', fields);
    return;
  }
  try {
    await startReading({ db: deps.db, now: deps.now, newId: deps.newId, enqueue }, companyId, photo, { company_id: companyId, photo_id: photo.id, reading_kind: readingKind });
  } catch (error) {
    logError('reading enqueue failed', { ...fields, error: String(error) });
    if (!(error instanceof ReadingSendError)) return;
    try {
      await writeReadingFailed({ db: deps.db, now: deps.now, newId: deps.newId }, companyId, photo, 'queued');
    } catch (writeError) {
      logError('reading failed status not written', { ...fields, error: String(writeError) });
    }
  }
}
