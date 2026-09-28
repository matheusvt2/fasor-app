import { buffer } from 'node:stream/consumers';
import {
  blockRowSchema,
  buildReadingSuggestions,
  getDefinition,
  normalizeBox,
  objectKey,
  photoFileRowSchema,
  plateReadingTargetSchema,
  registryRowSchema,
  suggestionPath,
  suggestionRowSchema,
  suggestionStatusPath,
  toIso,
  type BlockRow,
  type Clock,
  type NewId,
  type OcrReadResult,
  type StructuringResult,
  type WordRow,
} from '@app/domain';
import type { S3Client } from '@aws-sdk/client-s3';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.ts';
import { asCompanyId, type CompanyId } from '../../db/repositories/company-id.ts';
import { entities, readingRuns } from '../../db/schema.ts';
import { log, logError } from '../../log.ts';
import { getObject } from '../../storage/s3.ts';
import { applyOps } from '../../sync/apply.ts';
import { exifOrientation, readingImage, type ReadingImage } from './image.ts';
import type { ReadingPayload } from './payload.ts';
import { isPermanentReadingError, PermanentReadingError, ProviderError, type ReadingProvidersFactory } from './providers/index.ts';
import { readingServerOp, readingStatusPath, type ReadingStatusValue } from './status.ts';

/*
 * Stories 8.4 and 8.5: one attempt of a reading job. It loads the photo, its relatório, the
 * target block and the company's live registries (every lookup scoped by the payload's
 * company, AD-10), orients the `print` variant, calls the env-selected OCR and structuring
 * providers on the same bytes, and turns the values into pending suggestions through the
 * kernel (`buildReadingSuggestions`: digit coverage, registries, boxes, mode). The discards
 * of the photo's previous pending suggestions, the creates and `reading_status = done` are
 * one `applyOps` call sharing one `batch_id`. Every attempt, successful or not, leaves one
 * `reading_runs` row. A transient failure before the last attempt rethrows for pg-boss to
 * retry; the last attempt and a permanent failure write `failed` and return.
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

interface EntityRecord {
  row: unknown;
  relatorio_id: string | null;
  removed_at: string | null;
}

async function entityRecord(db: Db, companyId: CompanyId, entity: string, id: string): Promise<EntityRecord | null> {
  const [record] = await db
    .select({ row: entities.row, relatorio_id: entities.relatorio_id, removed_at: entities.removed_at })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, entity), eq(entities.id, id)))
    .limit(1);
  return record ?? null;
}

async function liveRegistry(db: Db, companyId: CompanyId): Promise<{ manufacturers: WordRow[]; voltageClasses: WordRow[] }> {
  const records = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'registry'), isNull(entities.removed_at)));
  const manufacturers: WordRow[] = [];
  const voltageClasses: WordRow[] = [];
  for (const record of records) {
    const parsed = registryRowSchema.safeParse(record.row);
    if (!parsed.success || parsed.data.removed_at !== null) continue;
    if (parsed.data.kind === 'manufacturer') manufacturers.push(parsed.data);
    else if (parsed.data.kind === 'voltage_class') voltageClasses.push(parsed.data);
  }
  return { manufacturers, voltageClasses };
}

/** The ids of the photo's own pending suggestions in its relatório, which a new run replaces. */
async function pendingOfPhoto(db: Db, companyId: CompanyId, relatorioId: string, photoId: string): Promise<string[]> {
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
  const facts: RunFacts = { relatorioId: null, photoFound: false, ocrName: 'none', image: null, ocr: null, structuring: null };
  const logFields = () => ({
    company_id: payload.company_id,
    relatorio_id: facts.relatorioId,
    job_id: attempt.jobId,
    photo_id: payload.photo_id,
    reading_kind: payload.reading_kind,
    run_id: runId,
    attempt: attempt.attempt,
  });

  async function recordRun(outcome: 'ok' | 'error', error: string | null): Promise<void> {
    await deps.db.insert(readingRuns).values({
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
      model: facts.structuring?.model ?? null,
      prompt_version: facts.structuring?.prompt_version ?? null,
      llm_usage: facts.structuring?.usage ?? null,
      duration_ms: Math.max(0, deps.now().getTime() - startedAt),
      created_at: toIso(deps.now()),
    });
  }

  try {
    if (payload.reading_kind !== 'plate') throw new PermanentReadingError(`reading kind ${payload.reading_kind} is not read yet`);

    const photoRecord = await entityRecord(deps.db, companyId, 'file', payload.photo_id);
    if (photoRecord === null) throw new PermanentReadingError('the photo does not exist');
    const photoParsed = photoFileRowSchema.safeParse(photoRecord.row);
    if (!photoParsed.success || photoParsed.data.id !== payload.photo_id) throw new PermanentReadingError('the file is not a photo row');
    const photo = photoParsed.data;
    facts.relatorioId = photoRecord.relatorio_id;
    facts.photoFound = true;
    if (photoRecord.removed_at !== null || photo.removed_at !== null) throw new PermanentReadingError('the photo was removed');
    if (photo.reading_kind !== payload.reading_kind) throw new PermanentReadingError('the photo is not a reading of this kind');
    const relatorioId = photoRecord.relatorio_id;
    if (relatorioId === null) throw new PermanentReadingError('the photo has no relatorio');

    const relatorio = await entityRecord(deps.db, companyId, 'relatorio', relatorioId);
    if (relatorio === null || relatorio.removed_at !== null) throw new PermanentReadingError('the relatorio is missing or removed');

    const target = plateReadingTargetSchema.safeParse(photo.reading_target);
    if (!target.success) throw new PermanentReadingError('the photo has no plate reading target');
    const blockRecord = await entityRecord(deps.db, companyId, 'block', target.data.block_id);
    const blockParsed = blockRecord === null ? null : blockRowSchema.safeParse(blockRecord.row);
    if (blockRecord === null || blockParsed === null || !blockParsed.success) throw new PermanentReadingError('the target block does not exist');
    const block: BlockRow = blockParsed.data;
    if (blockRecord.removed_at !== null) throw new PermanentReadingError('the target block was removed');
    if (block.relatorio_id !== relatorioId || block.block_type !== target.data.block_type) {
      throw new PermanentReadingError('the target block is not the photo relatorio block it names');
    }
    let fields;
    try {
      fields = getDefinition(block.seed_version, 'cabine_primaria', block.block_type).nameplate;
    } catch (error) {
      throw new PermanentReadingError('the target block has no nameplate definition', { cause: error });
    }
    const registry = await liveRegistry(deps.db, companyId);

    const providers = deps.providers({ photo_sha256: photo.sha256 });
    facts.ocrName = providers.ocr_name;

    const print = await objectBytes(deps, objectKey(companyId, 'photo', photo.id, 'print', relatorioId));
    if (print === null) throw new PermanentReadingError('the photo has no print variant');
    const original = await objectBytes(deps, objectKey(companyId, 'photo', photo.id, 'original', relatorioId));
    const orientation = original === null ? undefined : await exifOrientation(original.bytes);
    const image = await readingImage({ print: print.bytes, printMime: print.contentType, orientation });
    facts.image = image;

    const ocr = await providers.ocr.read({ bytes: image.bytes, mime: image.mime });
    if (ocr.image.width !== image.width || ocr.image.height !== image.height) {
      throw new ProviderError(`the OCR read a ${ocr.image.width}x${ocr.image.height} image, the job sent ${image.width}x${image.height}`);
    }
    facts.ocr = ocr;
    const structuring = await providers.structuring.structure({ image: { bytes: image.bytes, mime: image.mime }, ocr, fields: [...fields] });
    facts.structuring = structuring;

    const built = buildReadingSuggestions({
      relatorioId,
      photoId: photo.id,
      runId,
      block,
      ocr,
      image,
      output: structuring.output,
      promptVersion: structuring.prompt_version,
      registry,
      newId: deps.newId,
    });
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
    const applied = await applyOps(deps.db, companyId, batch, { origin: 'server', now: deps.now });
    if (applied.rejected.length > 0) {
      throw new PermanentReadingError(`the reading batch was refused: ${applied.rejected.map((r) => `${r.op_id} ${r.code}`).join(', ')}`);
    }

    await recordRun('ok', null);
    log('reading done', { ...logFields(), suggestions: built.rows.length, discarded: previous.length, dropped: built.dropped.length });
  } catch (error) {
    const permanent = isPermanentReadingError(error);
    await recordRun('error', errorText(error));
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
      const result = await applyOps(deps.db, companyId, [failed], { origin: 'server', now: deps.now });
      if (result.rejected.length > 0) logError('reading failed status refused', { ...logFields(), rejected: result.rejected });
    }
    log('reading failed', { ...logFields(), permanent });
  }
}
