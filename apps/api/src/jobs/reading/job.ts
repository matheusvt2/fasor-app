import { buffer } from 'node:stream/consumers';
import {
  normalizeBox,
  objectKey,
  photoFileRowSchema,
  suggestionPath,
  suggestionRowSchema,
  suggestionStatusPath,
  toIso,
  type Clock,
  type NewId,
  type OcrReadResult,
  type StructuringResult,
} from '@app/domain';
import type { S3Client } from '@aws-sdk/client-s3';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.ts';
import { asCompanyId, type CompanyId } from '../../db/repositories/company-id.ts';
import { entities, readingRuns } from '../../db/schema.ts';
import { log, logError } from '../../log.ts';
import { getObject } from '../../storage/s3.ts';
import { applyOps, applyServerBatch, ServerBatchRejectedError, type Tx } from '../../sync/apply.ts';
import { readingImage, type ReadingImage } from './image.ts';
import { readingKindHandler, type ReadingKindRunResult } from './kinds/index.ts';
import { entityRecord } from './kinds/shared.ts';
import type { ReadingPayload } from './payload.ts';
import { isPermanentReadingError, PermanentReadingError, ProviderError, type ReadingProvidersFactory } from './providers/index.ts';
import { readingServerOp, readingStatusPath, type ReadingStatusValue } from './status.ts';

/*
 * Stories 8.4 and 8.5: one attempt of a reading job. It loads the photo and its relatório
 * (every lookup scoped by the payload's company, AD-10), lets the handler of the photo's
 * reading kind check its target (Story 9.1, `kinds/`: the plate's block and registries, the
 * display's table or cabine), orients the `print` variant, and lets the handler read it with
 * the env-selected providers and turn what it read into pending suggestions through the
 * kernel. The discards of the photo's previous pending suggestions, the creates and
 * `reading_status = done` are one all-or-nothing server batch sharing one `batch_id`,
 * committed with the run's `ok` row. Every attempt leaves one `reading_runs` row. A kind
 * with no handler fails permanently; a photo whose kind moved on (Story 9.2) ends superseded,
 * writing no status; a transient failure before the last attempt rethrows
 * for pg-boss to retry; the last attempt and a permanent failure write `failed` and return.
 */

export interface ReadingJobDeps {
  db: Db;
  s3: S3Client;
  bucket: string;
  now: Clock;
  newId: NewId;
  providers: ReadingProvidersFactory;
}

export interface ReadingAttempt {
  /** The pg-boss job id. */
  jobId: string;
  /** 1-based. */
  attempt: number;
  /** True on the attempt after which pg-boss retries no more. */
  lastAttempt: boolean;
}

/** The ids of the photo's own pending suggestions in its relatório, which a new run replaces. */
async function pendingOfPhoto(db: Db | Tx, companyId: CompanyId, relatorioId: string, photoId: string): Promise<string[]> {
  const records = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'suggestion'), eq(entities.relatorio_id, relatorioId)));
  const ids: string[] = [];
  for (const record of records) {
    const parsed = suggestionRowSchema.safeParse(record.row);
    if (parsed.success && parsed.data.status === 'pending' && parsed.data.source.photo_id === photoId) ids.push(parsed.data.id);
  }
  return ids.sort();
}

async function objectBytes(deps: ReadingJobDeps, key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const stored = await getObject(deps.s3, deps.bucket, key);
  if (stored === null) return null;
  return { bytes: new Uint8Array(await buffer(stored.body)), contentType: stored.contentType };
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** What one attempt learned, for its `reading_runs` row whatever the outcome. */
interface RunFacts {
  relatorioId: string | null;
  photoFound: boolean;
  ocrName: string;
  image: ReadingImage | null;
  ocr: OcrReadResult | null;
  structuring: StructuringResult | null;
  /** Stories 9.3 and 9.5: the model call of a prose kind (no structuring step). */
  model: ReadingKindRunResult['model'];
  /** True once the batch and its `ok` run row committed. */
  committed: boolean;
}

/**
 * Story 9.2: the photo's `reading_kind` is no longer the payload's (the "Fotografar
 * equipamento" confirm re-targeted a panel photo to its new block's plate while this job was
 * queued or running). The reading of the new kind owns the photo's status now, so this one
 * ends writing neither `done` nor `failed`: its run row says `superseded`, and nothing else.
 */
class ReadingSupersededError extends Error {
  constructor() {
    super('superseded');
    this.name = 'ReadingSupersededError';
  }
}

/** The photo's stored `reading_kind`, read inside the batch transaction. */
async function readingKindOf(tx: Db | Tx, companyId: CompanyId, photoId: string): Promise<string | null> {
  const record = await entityRecord(tx, companyId, 'file', photoId);
  const parsed = record === null ? null : photoFileRowSchema.safeParse(record.row);
  return parsed === null || !parsed.success ? null : parsed.data.reading_kind;
}

/** The photo's pending suggestions changed between the read and the batch: transient, the next attempt reads them again. */
class PendingChangedError extends ProviderError {
  constructor() {
    super('the photo pending suggestions changed while the reading ran');
    this.name = 'PendingChangedError';
  }
}

function normalizedOcr(ocr: OcrReadResult, image: { width: number; height: number }): unknown {
  return {
    image: ocr.image,
    preprocessing_applied: ocr.preprocessing_applied,
    tokens: ocr.tokens.map((token) => ({ ...token, bbox: normalizeBox(token.bbox, image) })),
  };
}

export async function runReadingJob(deps: ReadingJobDeps, payload: ReadingPayload, attempt: ReadingAttempt): Promise<void> {
  const companyId = asCompanyId(payload.company_id);
  const startedAt = deps.now().getTime();
  const runId = deps.newId();
  const facts: RunFacts = { relatorioId: null, photoFound: false, ocrName: 'none', image: null, ocr: null, structuring: null, model: null, committed: false };
  const logFields = () => ({
    company_id: payload.company_id,
    relatorio_id: facts.relatorioId,
    job_id: attempt.jobId,
    photo_id: payload.photo_id,
    reading_kind: payload.reading_kind,
    run_id: runId,
    attempt: attempt.attempt,
  });

  async function recordRun(outcome: 'ok' | 'error', error: string | null, executor: Db | Tx = deps.db): Promise<void> {
    await executor.insert(readingRuns).values({
      id: runId,
      company_id: companyId,
      photo_id: payload.photo_id,
      relatorio_id: facts.relatorioId,
      reading_kind: payload.reading_kind,
      job_id: attempt.jobId,
      attempt: attempt.attempt,
      outcome,
      error,
      ocr_provider: facts.ocrName,
      ocr_result: outcome === 'error' || facts.ocr === null || facts.image === null ? null : normalizedOcr(facts.ocr, facts.image),
      model: facts.structuring?.model ?? facts.model?.model ?? null,
      prompt_version: facts.structuring?.prompt_version ?? facts.model?.prompt_version ?? null,
      llm_usage: facts.structuring?.usage ?? facts.model?.usage ?? null,
      duration_ms: Math.max(0, deps.now().getTime() - startedAt),
      created_at: toIso(deps.now()),
    });
  }

  try {
    const photoRecord = await entityRecord(deps.db, companyId, 'file', payload.photo_id);
    if (photoRecord === null) throw new PermanentReadingError('the photo does not exist');
    const photoParsed = photoFileRowSchema.safeParse(photoRecord.row);
    if (!photoParsed.success || photoParsed.data.id !== payload.photo_id) throw new PermanentReadingError('the file is not a photo row');
    const photo = photoParsed.data;
    facts.relatorioId = photoRecord.relatorio_id;
    facts.photoFound = true;
    if (photoRecord.removed_at !== null || photo.removed_at !== null) throw new PermanentReadingError('the photo was removed');
    if (photo.reading_kind !== payload.reading_kind) throw new ReadingSupersededError();
    // Every queued kind is sent (Story 9.1); one the job does not read yet ends `failed`.
    const handler = readingKindHandler(payload.reading_kind);
    if (handler === undefined) throw new PermanentReadingError(`reading kind ${payload.reading_kind} is not read yet`);
    const relatorioId = photoRecord.relatorio_id;
    if (relatorioId === null) throw new PermanentReadingError('the photo has no relatorio');

    const relatorio = await entityRecord(deps.db, companyId, 'relatorio', relatorioId);
    if (relatorio === null || relatorio.removed_at !== null) throw new PermanentReadingError('the relatorio is missing or removed');

    const prepared = await handler.prepare({ db: deps.db, companyId, relatorioId, photo });

    // Stories 9.3 and 9.5: a reading the target no longer wants is never sent (no provider,
    // no image); it still ends `done`, and a previous pending suggestion of the photo leaves.
    let built: ReadingKindRunResult;
    if (prepared.skip !== undefined) {
      log('reading skipped', { ...logFields(), reason: prepared.skip });
      built = { ocr: null, structuring: null, rows: [], dropped: [] };
    } else {
      const providers = deps.providers({
        photo_sha256: photo.sha256,
        reading_kind: payload.reading_kind,
        block_type: prepared.fixture.block_type,
        table_key: prepared.fixture.table_key,
      });
      facts.ocrName = providers.ocr_name;

      const print = await objectBytes(deps, objectKey(companyId, 'photo', photo.id, 'print', relatorioId));
      if (print === null) throw new PermanentReadingError('the photo has no print variant');
      // The print is upright already (its variant applied the original's EXIF orientation, A12).
      const image = await readingImage({ print: print.bytes, printMime: print.contentType });
      facts.image = image;

      built = await prepared.run({ providers, image, runId, newId: deps.newId });
    }
    facts.ocr = built.ocr;
    facts.structuring = built.structuring;
    facts.model = built.model ?? null;
    for (const drop of built.dropped) log('reading value dropped', { ...logFields(), key: drop.key, reason: drop.reason });

    const batchId = deps.newId();
    const op = (kind: 'create' | 'put', path: string, value: unknown) =>
      readingServerOp({ companyId, relatorioId, kind, path, value, batchId, now: deps.now, newId: deps.newId });
    const previous = await pendingOfPhoto(deps.db, companyId, relatorioId, photo.id);
    const batch = [
      ...previous.map((id) => op('put', suggestionStatusPath(id), 'discarded')),
      ...built.rows.map((row) => op('create', suggestionPath(row.id), row)),
      op('put', readingStatusPath(photo.id), 'done' satisfies ReadingStatusValue),
    ];
    // All or nothing, under the company lock: the pending set is re-read inside the
    // transaction (a device confirm or discard that landed since is never overwritten; the
    // attempt retries instead), and the run row commits with the batch it describes.
    try {
      await applyServerBatch(deps.db, companyId, batch, {
        now: deps.now,
        before: async (tx) => {
          if ((await readingKindOf(tx, companyId, photo.id)) !== payload.reading_kind) throw new ReadingSupersededError();
          const current = await pendingOfPhoto(tx, companyId, relatorioId, photo.id);
          if (current.join() !== previous.join()) throw new PendingChangedError();
          await recordRun('ok', null, tx);
        },
      });
    } catch (error) {
      if (error instanceof ServerBatchRejectedError) throw new PermanentReadingError(`the reading batch was refused: ${error.message}`, { cause: error });
      throw error;
    }
    facts.committed = true;
    log('reading done', { ...logFields(), suggestions: built.rows.length, discarded: previous.length, dropped: built.dropped.length });
  } catch (error) {
    // The batch and its run row committed: nothing after them can fail the reading.
    if (facts.committed) {
      logError('reading done, logging failed', { ...logFields(), error: errorText(error) });
      return;
    }
    const permanent = isPermanentReadingError(error);
    // A failure about to write `failed` on a photo re-targeted meanwhile ends superseded too:
    // the new kind's reading owns the status.
    let superseded = error instanceof ReadingSupersededError;
    if (!superseded && facts.photoFound && (permanent || attempt.lastAttempt)) {
      try {
        superseded = (await readingKindOf(deps.db, companyId, payload.photo_id)) !== payload.reading_kind;
      } catch (readError) {
        logError('reading kind not re-read', { ...logFields(), error: errorText(readError) });
      }
    }
    if (superseded) {
      try {
        await recordRun('error', 'superseded');
      } catch (recordError) {
        logError('reading run row not written', { ...logFields(), error: errorText(recordError) });
      }
      log('reading superseded', logFields());
      return;
    }
    try {
      await recordRun('error', errorText(error));
    } catch (recordError) {
      logError('reading run row not written', { ...logFields(), error: errorText(recordError) });
    }
    logError('reading attempt failed', { ...logFields(), permanent, last_attempt: attempt.lastAttempt, error: errorText(error) });
    if (!permanent && !attempt.lastAttempt) throw error;
    if (facts.photoFound) {
      const failed = readingServerOp({
        companyId,
        relatorioId: facts.relatorioId,
        kind: 'put',
        path: readingStatusPath(payload.photo_id),
        value: 'failed' satisfies ReadingStatusValue,
        batchId: null,
        now: deps.now,
        newId: deps.newId,
      });
      try {
        const result = await applyOps(deps.db, companyId, [failed], { origin: 'server', now: deps.now });
        if (result.rejected.length > 0) logError('reading failed status refused', { ...logFields(), rejected: result.rejected });
      } catch (writeError) {
        logError('reading failed status not written', { ...logFields(), error: errorText(writeError) });
      }
    }
    log('reading failed', { ...logFields(), permanent });
  }
}
