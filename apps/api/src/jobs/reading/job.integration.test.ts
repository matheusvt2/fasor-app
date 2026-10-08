import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  instantiateTemplate,
  makeOp,
  objectKey,
  plateReadingTarget,
  registryPath,
  standardTemplate,
  suggestionRowSchema,
  type BlockRow,
  type Op,
  type OpDraft,
  type SuggestionRow,
} from '@app/domain';
import { AccessDeniedException as BedrockAccessDeniedException, ThrottlingException as BedrockThrottlingException } from '@aws-sdk/client-bedrock-runtime';
import { AccessDeniedException, type Block } from '@aws-sdk/client-textract';
import { and, asc, desc, eq } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { now } from '../../clock.ts';
import { loadConfig } from '../../config.ts';
import { createDb } from '../../db/client.ts';
import { asCompanyId } from '../../db/repositories/company-id.ts';
import { entities, ops, readingRuns } from '../../db/schema.ts';
import { dropCompany } from '../../db/test-cleanup.ts';
import { newId } from '../../ids.ts';
import { createS3, putObject } from '../../storage/s3.ts';
import { renderVariants } from '../../storage/variants.ts';
import { applyOps } from '../../sync/apply.ts';
import { runReadingJob, type ReadingJobDeps } from './job.ts';
import { DEFAULT_FIXTURE_BY_BLOCK_TYPE, DEFAULT_FIXTURES_DIR } from './providers/fake.ts';
import { createReadingProviders } from './providers/index.ts';
import { readingServerOp, readingStatusPath, startReading } from './status.ts';
import { PermanentReadingError } from './providers/index.ts';
import { textractTokens, type TextractLike } from './providers/textract.ts';
import type { BedrockConverseOutput, BedrockLike } from './providers/bedrock.ts';
import { enqueueReading, ensureReadingQueue, failDeadReading, readingDeadLetterQueue, registerReadingWorker, type ReadingQueueOptions } from './worker.ts';

/*
 * Stories 8.4 and 8.5: the reading worker on its own PgBoss and a queue of its own (retry
 * delay 0, no backoff, polling 0.5 s), against the compose Postgres and MinIO, with a
 * throwaway company and a temporary fixtures directory. The rows are written straight
 * through `applyOps` and the objects straight into the store, so the compose api's own
 * receipt never sees these photos.
 */

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const bucket = config.S3_BUCKET;

const companyId = newId();
const company = asCompanyId(companyId);
/** A second throwaway company whose registry must never reach the first one's readings. */
const otherCompanyId = newId();
const ACTOR = 'reading-job-test-user';
const DEVICE = 'tablet-reading-job';
const queue = `reading-test-${newId()}`;
const queueOptions: ReadingQueueOptions = { retryLimit: 2, retryBackoff: false, retryDelay: 0, expireInSeconds: 60 };
const fixturesDir = mkdtempSync(join(tmpdir(), 'reading-fixtures-'));
const IMAGES = join(DEFAULT_FIXTURES_DIR, 'images');
const repoRoot = join(import.meta.dirname, '../../../../..');

const deps: ReadingJobDeps = {
  db,
  s3,
  bucket,
  now,
  newId,
  providers: createReadingProviders({ OCR_PROVIDER: 'fake', LLM_PROVIDER: 'fake', OCR_SERVICE_URL: 'http://127.0.0.1:9' }, { fixturesDir }),
};
let boss: PgBoss;

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const stamp = (draft: OpDraft): Op => makeOp({ ...draft, device_id: DEVICE }, { newId, now: now() });

async function apply(drafts: OpDraft[], target = company): Promise<void> {
  const result = await applyOps(db, target, drafts.map(stamp), { origin: 'client', actorId: ACTOR, now });
  expect(result.rejected).toEqual([]);
}

function companyDraft(path: string, value: unknown, owner = companyId): OpDraft {
  return { kind: 'create', scope: 'company', company_id: owner, project_id: null, relatorio_id: null, path, value: value as never, prev_op_id: null, batch_id: null, meta: null, actor_id: ACTOR };
}

/** A standard-template relatório of the throwaway company; returns its id and blocks. */
async function relatorio(): Promise<{ relatorioId: string; blocks: BlockRow[] }> {
  const projectId = newId();
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: newId() }),
    { id: projectId },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: ACTOR, companyId },
  );
  await apply([companyDraft(`project/${projectId}`, { id: projectId, client_id: null, name: 'Obra leitura', site: 'Obra leitura', removed_at: null }), ...drafts]);
  const blocks = drafts.map((draft) => draft.value as unknown as BlockRow).filter((row) => row !== null && typeof row === 'object' && 'block_type' in row && 'sheet' in row);
  return { relatorioId, blocks };
}

async function registry(kind: 'manufacturer' | 'voltage_class', name: string, owner = companyId): Promise<void> {
  const id = newId();
  await apply([companyDraft(registryPath(kind, id), { id, kind, name, gender: null, number: null, removed_at: null }, owner)], asCompanyId(owner));
}

/**
 * A plate photo of `block` with these bytes: the device's create, the original and both
 * variants in the store (`print: false` leaves the print variant out; `target` names another block;
 * `panel` makes it a panel front shot from the block's location instead).
 */
async function photo(
  relatorioId: string,
  block: BlockRow,
  bytes: Uint8Array,
  mime: 'image/png' | 'image/jpeg',
  options: { print?: boolean; target?: Pick<BlockRow, 'id' | 'block_type'>; panel?: boolean } = {},
): Promise<string> {
  const target = options.target ?? block;
  // Story 9.2: a panel front photographed from the palette of the block's location.
  const reading = options.panel
    ? { block_id: null, caption: null, reading_kind: 'panel', reading_target: { location_id: block.location_id } }
    : { block_id: block.id, caption: 'Placa de identificação', reading_kind: 'plate', reading_target: plateReadingTarget(target.id, target.block_type) };
  const id = newId();
  await apply([
    {
      kind: 'create',
      scope: 'relatorio',
      company_id: companyId,
      project_id: null,
      relatorio_id: relatorioId,
      path: `file/${id}`,
      value: {
        id,
        company_id: companyId,
        relatorio_id: relatorioId,
        kind: 'photo',
        sha256: sha256(bytes),
        mime,
        size: bytes.byteLength,
        uploaded_at: null,
        variants: null,
        removed_at: null,
        captured_at: '2026-09-27T10:00:00.000Z',
        tz_offset: -180,
        coords: null,
        local_seq: 1,
        item_key: null,
        ...reading,
        reading_status: 'queued',
      } as never,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: ACTOR,
    },
  ]);
  await putObject(s3, bucket, objectKey(companyId, 'photo', id, 'original', relatorioId), bytes, mime);
  const variants = (await renderVariants(bytes, mime))!;
  if (options.print !== false) await putObject(s3, bucket, objectKey(companyId, 'photo', id, 'print', relatorioId), variants.print.bytes, variants.print.contentType);
  await putObject(s3, bucket, objectKey(companyId, 'photo', id, 'thumb', relatorioId), variants.thumb.bytes, variants.thumb.contentType);
  return id;
}

async function row<T>(entity: string, id: string): Promise<T | undefined> {
  const [found] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, entity), eq(entities.id, id)));
  return found?.row as T | undefined;
}

const status = async (photoId: string) => (await row<{ reading_status: string }>('file', photoId))?.reading_status;

async function runs(photoId: string) {
  return db.select().from(readingRuns).where(and(eq(readingRuns.company_id, companyId), eq(readingRuns.photo_id, photoId))).orderBy(asc(readingRuns.created_at));
}

async function suggestions(relatorioId: string): Promise<SuggestionRow[]> {
  const found = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'suggestion'), eq(entities.relatorio_id, relatorioId)));
  return found.map((r) => suggestionRowSchema.parse(r.row));
}

async function waitFor(what: string, check: () => Promise<boolean>, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function solidPng(r: number, g: number, b: number, width = 200, height = 100): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 3, background: { r, g, b } } }).png().toBuffer());
}

function fixture(bytes: Uint8Array, body: unknown): void {
  writeFileSync(join(fixturesDir, `${sha256(bytes)}.json`), JSON.stringify(body));
}

/** The OCR of the chave's plate fixture: 200 x 100, a manufacturer word and a voltage. */
function chaveOcr(maker: string, kv: string) {
  return {
    image: { width: 200, height: 100 },
    tokens: [
      { id: 't0', text: 'FABRICAÇÃO', bbox: [5, 5, 60, 20], confidence: 0.99 },
      { id: 't1', text: maker, bbox: [100, 5, 160, 20], confidence: 0.99 },
      { id: 't2', text: 'TENSÃO', bbox: [5, 40, 50, 55], confidence: 0.99 },
      { id: 't3', text: kv, bbox: [100, 40, 120, 55], confidence: 0.99 },
      { id: 't4', text: 'kV', bbox: [125, 40, 140, 55], confidence: 0.99 },
    ],
    preprocessing_applied: false,
  };
}

function chaveValues(maker: string, kv: string) {
  return {
    values: [
      { key: 'fabricacao', value: maker.toUpperCase(), ocr_token_ids: ['t1'], confidence: 0.9 },
      { key: 'tensao_de_placa', value: `${kv} kV`, ocr_token_ids: ['t3', 't4'], confidence: 0.9 },
    ],
  };
}

beforeAll(async () => {
  for (const name of ['plate-error.png', 'plate-timeout.png']) {
    const sha = sha256(readFileSync(join(IMAGES, name)));
    copyFileSync(join(DEFAULT_FIXTURES_DIR, `${sha}.json`), join(fixturesDir, `${sha}.json`));
  }
  // E78-Q2 and Story 13.7: every plate default fixture, which a photo with none of its own replays.
  for (const plate of Object.values(DEFAULT_FIXTURE_BY_BLOCK_TYPE)) copyFileSync(join(DEFAULT_FIXTURES_DIR, `${plate!}.json`), join(fixturesDir, `${plate!}.json`));
  boss = new PgBoss(config.DATABASE_URL);
  boss.on('error', (error) => console.error('pg-boss error', error));
  await boss.start();
  await registerReadingWorker(boss, deps, { queue, queueOptions, workOptions: { pollingIntervalSeconds: 0.5 } });
}, 60_000);

afterAll(async () => {
  await boss.offWork(queue);
  await boss.offWork(readingDeadLetterQueue(queue));
  await boss.deleteQueue(queue);
  await boss.deleteQueue(readingDeadLetterQueue(queue));
  await boss.stop();
  await dropCompany(db, companyId);
  await dropCompany(db, otherCompanyId);
  rmSync(fixturesDir, { recursive: true, force: true });
  await sql.end();
}, 60_000);

const send = (photoId: string) => enqueueReading(boss, { company_id: companyId, photo_id: photoId, reading_kind: 'plate' }, { queue, queueOptions });

describe('8.4-INT reading job attempts', () => {
  for (const outcome of ['error', 'timeout'] as const) {
    it(`a fixture with outcome ${outcome}: three attempts, three run rows, failed, no suggestion`, async () => {
      const { relatorioId, blocks } = await relatorio();
      const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
      const id = await photo(relatorioId, block, new Uint8Array(readFileSync(join(IMAGES, `plate-${outcome}.png`))), 'image/png');
      await send(id);
      await waitFor(`${outcome} to fail`, async () => (await status(id)) === 'failed');
      const rows = await runs(id);
      expect(rows.map((r) => r.attempt)).toEqual([1, 2, 3]);
      expect(rows.every((r) => r.outcome === 'error' && r.ocr_provider === 'fake' && r.ocr_result === null && r.relatorio_id === relatorioId)).toBe(true);
      expect(new Set(rows.map((r) => r.job_id)).size).toBe(1);
      expect(rows[0]!.error).toContain(outcome === 'timeout' ? 'ProviderTimeoutError' : 'ProviderError');
      expect(await suggestions(relatorioId)).toEqual([]);
    }, 60_000);
  }

  it('a photo without a fixture, on a type with no default fixture, fails permanently after one attempt', async () => {
    const { relatorioId, blocks } = await relatorio();
    // E78-Q2 and Story 13.7: a type with a nameplate falls back to its synthetic plate; a cable has none.
    const block = blocks.find((b) => b.block_type === 'cabos_entrada')!;
    const id = await photo(relatorioId, block, await solidPng(7, 77, 177), 'image/png');
    await send(id);
    await waitFor('the permanent failure', async () => (await status(id)) === 'failed');
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const rows = await runs(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ attempt: 1, outcome: 'error' });
    expect(rows[0]!.error).toContain('PermanentReadingError');
    expect(rows[0]!.error).toContain('no fixture for block type cabos_entrada');
  }, 60_000);

  for (const [type, file] of [
    ['para_raio', 'plate-para-raio.png'],
    ['chave_seccionadora', 'plate-chave-seccionadora.png'],
    ['disjuntor_mt', 'plate-disjuntor-mt.png'],
    ['tp', 'plate-tp.png'],
    ['tc', 'plate-tc.png'],
  ] as const) {
    it(`13.7: a ${type} plate the device re-encoded (no fixture of its own) reads its synthetic plate: done, one pending suggestion per value`, async () => {
      const { relatorioId, blocks } = await relatorio();
      const block = blocks.find((b) => b.block_type === type)!;
      const committed = readFileSync(join(IMAGES, file));
      const values = (JSON.parse(readFileSync(join(DEFAULT_FIXTURES_DIR, `${DEFAULT_FIXTURE_BY_BLOCK_TYPE[type]!}.json`), 'utf8')) as { structuring: { values: { key: string }[] } }).structuring.values;
      // What a device does to a shot: decoded, resized and re-encoded, so no committed sha matches.
      const bytes = new Uint8Array(await sharp(committed).resize({ width: 1000 }).jpeg({ quality: 82 }).toBuffer());
      const id = await photo(relatorioId, block, bytes, 'image/jpeg');
      await send(id);
      await waitFor(`the ${type} fallback reading`, async () => (await status(id)) === 'done');
      const mine = (await suggestions(relatorioId)).filter((s) => s.source.photo_id === id);
      expect(mine).toHaveLength(values.length);
      expect(mine.every((s) => s.status === 'pending')).toBe(true);
      expect(mine.map((s) => s.target_path).sort()).toEqual(values.map((v) => `sheet/${block.id}/nameplate/${v.key}`).sort());
      if (type === 'tp') {
        // AIR-1 and AIR-V1 (review 2026-10-08): "13.800 V" lands as 13,8 kV and a bare year as printed, both trusted.
        expect(mine.find((s) => s.target_path.endsWith('/tensao_nominal_at'))).toMatchObject({ value: { raw: '13.8', unit: 'kV', state: 'measured' }, trust: 'suggested' });
        expect(mine.find((s) => s.target_path.endsWith('/data_fabricacao'))).toMatchObject({ value: '2020', trust: 'suggested' });
      }
      const [run] = await runs(id);
      expect(run).toMatchObject({ attempt: 1, outcome: 'ok', ocr_provider: 'fake', model: 'fake', prompt_version: 'fake-1' });
    }, 60_000);
  }

  it('E78-Q2: a transformer plate the device re-encoded (no fixture of its own) reads the synthetic plate: done, eleven pending suggestions', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const plate = join(repoRoot, 'services/ocr/tests/fixtures/plate-transformador.jpg');
    // What a device does to a shot: decoded, resized and re-encoded, so no committed sha matches.
    const bytes = new Uint8Array(await sharp(readFileSync(plate)).resize({ width: 1200 }).jpeg({ quality: 82 }).toBuffer());
    const id = await photo(relatorioId, block, bytes, 'image/jpeg');
    await send(id);
    await waitFor('the fallback reading', async () => (await status(id)) === 'done');
    const mine = (await suggestions(relatorioId)).filter((s) => s.source.photo_id === id);
    expect(mine).toHaveLength(11);
    expect(mine.every((s) => s.status === 'pending')).toBe(true);
    expect(mine.find((s) => s.target_path.endsWith('/data_fabricacao'))!.value).toBe('2024-08');
    const [run] = await runs(id);
    expect(run).toMatchObject({ attempt: 1, outcome: 'ok', ocr_provider: 'fake', model: 'fake', prompt_version: 'fake-1' });
  }, 60_000);

  it('an OCR read of another image size is transient: three attempts, failed, no suggestion', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const bytes = await solidPng(7, 88, 199);
    fixture(bytes, { ocr: { ...plateOcr(), image: { width: 201, height: 100 } }, structuring: plateValues() });
    const id = await photo(relatorioId, block, bytes, 'image/png');
    await send(id);
    await waitFor('the size mismatch to fail', async () => (await status(id)) === 'failed');
    const rows = await runs(id);
    expect(rows.map((r) => r.attempt)).toEqual([1, 2, 3]);
    expect(rows.every((r) => r.outcome === 'error' && r.error!.includes('ProviderError'))).toBe(true);
    expect(await suggestions(relatorioId)).toEqual([]);
  }, 60_000);
});

/** A one-token OCR read of a 200 x 100 image and its one value, for photos the guards must stop. */
function plateOcr() {
  return { image: { width: 200, height: 100 }, tokens: [{ id: 't0', text: 'TR-01', bbox: [20, 10, 120, 40], confidence: 0.99 }], preprocessing_applied: false };
}
function plateValues() {
  return { values: [{ key: 'identificacao', value: 'TR-01', ocr_token_ids: ['t0'], confidence: 0.9 }] };
}

function relatorioPut(relatorioId: string, path: string, value: unknown): OpDraft {
  return { kind: 'put', scope: 'relatorio', company_id: companyId, project_id: null, relatorio_id: relatorioId, path, value: value as never, prev_op_id: null, batch_id: null, meta: null, actor_id: ACTOR };
}

describe('8.4-INT permanent guards: one run row, failed, no suggestion', () => {
  let color = 20;
  /** A photo whose fixture would read fine, so only the guard can stop it. */
  async function readablePhoto(relatorioId: string, block: BlockRow, options: Parameters<typeof photo>[4] = {}): Promise<string> {
    const bytes = await solidPng(3, 150, color++);
    fixture(bytes, { ocr: plateOcr(), structuring: plateValues() });
    return photo(relatorioId, block, bytes, 'image/png', options);
  }

  async function expectPermanent(id: string, relatorioId: string, reason: string): Promise<void> {
    await runReadingJob(deps, { company_id: companyId, photo_id: id, reading_kind: 'plate' }, { jobId: 'direct', attempt: 1, lastAttempt: false });
    const rows = await runs(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.error).toContain('PermanentReadingError');
    expect(rows[0]!.error).toContain(reason);
    expect(await status(id)).toBe('failed');
    expect((await suggestions(relatorioId)).filter((s) => s.source.photo_id === id)).toEqual([]);
  }

  it('the print variant is missing', async () => {
    const { relatorioId, blocks } = await relatorio();
    const id = await readablePhoto(relatorioId, blocks.find((b) => b.block_type === 'transformador_forca')!, { print: false });
    await expectPermanent(id, relatorioId, 'no print variant');
  }, 60_000);

  it('the photo was removed', async () => {
    const { relatorioId, blocks } = await relatorio();
    const id = await readablePhoto(relatorioId, blocks.find((b) => b.block_type === 'transformador_forca')!);
    await apply([relatorioPut(relatorioId, `file/${id}/removed_at`, '2026-09-27T11:00:00.000Z')]);
    await expectPermanent(id, relatorioId, 'photo was removed');
  }, 60_000);

  it('the target block was removed', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const id = await readablePhoto(relatorioId, block);
    await apply([relatorioPut(relatorioId, `block/${block.id}/removed_at`, '2026-09-27T11:00:00.000Z')]);
    await expectPermanent(id, relatorioId, 'target block was removed');
  }, 60_000);

  it('the target block belongs to another relatório', async () => {
    const own = await relatorio();
    const other = await relatorio();
    const foreign = other.blocks.find((b) => b.block_type === 'transformador_forca')!;
    const id = await readablePhoto(own.relatorioId, own.blocks.find((b) => b.block_type === 'transformador_forca')!, { target: foreign });
    await expectPermanent(id, own.relatorioId, 'not the photo relatorio block');
  }, 60_000);
});

describe('8.4-INT EXIF orientation', () => {
  it('a photo stored sideways (orientation 6) is read upright, boxes normalized over the upright size', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    // Stored 200 x 100 with EXIF orientation 6: upright it is 100 x 200.
    const jpeg = new Uint8Array(
      await sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 61, g: 6, b: 16 } } })
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer(),
    );
    fixture(jpeg, {
      ocr: { image: { width: 100, height: 200 }, tokens: [{ id: 't0', text: 'TR-01', bbox: [10, 20, 60, 40], confidence: 0.99 }], preprocessing_applied: false },
      structuring: plateValues(),
    });
    const id = await photo(relatorioId, block, jpeg, 'image/jpeg');
    await runReadingJob(deps, { company_id: companyId, photo_id: id, reading_kind: 'plate' }, { jobId: 'direct', attempt: 1, lastAttempt: true });
    expect(await status(id)).toBe('done');
    const [suggestion] = (await suggestions(relatorioId)).filter((s) => s.source.photo_id === id);
    expect(suggestion!.source.bbox).toEqual([0.1, 0.1, 0.6, 0.2]);
    expect((await runs(id))[0]).toMatchObject({ outcome: 'ok' });
  }, 60_000);
});

describe('8.4-INT startReading keeps a status the job already wrote', () => {
  const latestStatus = async (photoId: string) => {
    const [latest] = await db
      .select({ value: ops.value })
      .from(ops)
      .where(and(eq(ops.company_id, companyId), eq(ops.path, readingStatusPath(photoId))))
      .orderBy(desc(ops.seq))
      .limit(1);
    return latest?.value;
  };

  it('writes running after the send, and not over a done written before it', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const plain = await photo(relatorioId, block, await solidPng(5, 5, 5), 'image/png');
    const sent: string[] = [];
    const ran = await startReading({ db, now, newId, enqueue: async (payload) => void sent.push(payload.photo_id) }, company, { id: plain, relatorioId }, { company_id: companyId, photo_id: plain, reading_kind: 'plate' });
    expect(ran).toBe(true);
    expect(sent).toEqual([plain]);
    expect(await latestStatus(plain)).toBe('running');

    const raced = await photo(relatorioId, block, await solidPng(6, 6, 6), 'image/png');
    const fastJob = async () => {
      const done = readingServerOp({ companyId, relatorioId, kind: 'put', path: readingStatusPath(raced), value: 'done', batchId: null, now, newId });
      expect((await applyOps(db, company, [done], { origin: 'server', now })).rejected).toEqual([]);
    };
    const wrote = await startReading({ db, now, newId, enqueue: fastJob }, company, { id: raced, relatorioId }, { company_id: companyId, photo_id: raced, reading_kind: 'plate' });
    expect(wrote).toBe(false);
    expect(await latestStatus(raced)).toBe('done');
    expect(await status(raced)).toBe('done');
  }, 60_000);
});

describe('8.5-INT registry verdicts on a Chave seccionadora', () => {
  it('in the registry: the canonical names, suggested; out of it: verify and the create hint', async () => {
    const maker = `Leituratec${newId().slice(-4).replace(/[^a-f]/g, 'x')}`;
    await registry('manufacturer', maker);
    await registry('voltage_class', '15');
    // Another company holds exactly the unknown names: its registry must not count here.
    await registry('manufacturer', 'Novafab', otherCompanyId);
    await registry('voltage_class', '23', otherCompanyId);
    const { relatorioId, blocks } = await relatorio();
    const chaves = blocks.filter((b) => b.block_type === 'chave_seccionadora');

    const known = await solidPng(11, 22, 33);
    fixture(known, { ocr: chaveOcr(maker, '15'), structuring: chaveValues(maker, '15') });
    const knownPhoto = await photo(relatorioId, chaves[0]!, known, 'image/png');
    const unknown = await solidPng(44, 55, 66);
    fixture(unknown, { ocr: chaveOcr('Novafab', '23'), structuring: chaveValues('Novafab', '23') });
    const unknownPhoto = await photo(relatorioId, chaves[1]!, unknown, 'image/png');

    await send(knownPhoto);
    await send(unknownPhoto);
    await waitFor('both readings', async () => (await status(knownPhoto)) === 'done' && (await status(unknownPhoto)) === 'done');

    const all = await suggestions(relatorioId);
    const of = (photoId: string, key: string) => all.find((s) => s.source.photo_id === photoId && s.target_path.endsWith(`/${key}`))!;
    expect(of(knownPhoto, 'fabricacao')).toMatchObject({ value: maker, trust: 'suggested', hint: null, mode: 'fill' });
    expect(of(knownPhoto, 'tensao_de_placa')).toMatchObject({ value: '15', trust: 'suggested', hint: null });
    expect(of(knownPhoto, 'tensao_de_placa').source).toMatchObject({ bbox: [0.5, 0.4, 0.7, 0.55], ocr_token_ids: ['t3', 't4'] });
    expect(of(unknownPhoto, 'fabricacao')).toMatchObject({
      value: 'NOVAFAB',
      trust: 'suggested',
      hint: { create_registry_entry: { kind: 'manufacturer', name: 'NOVAFAB' } },
    });
    expect(of(unknownPhoto, 'tensao_de_placa')).toMatchObject({ value: '23', trust: 'verify', hint: null });

    const [run] = await runs(knownPhoto);
    expect(run).toMatchObject({ outcome: 'ok', attempt: 1, ocr_provider: 'fake', model: 'fake', prompt_version: 'fake-1', llm_usage: { input_tokens: 0, output_tokens: 0, usd: 0 } });
    expect(of(knownPhoto, 'fabricacao').source.reading_run_id).toBe(run!.id);
    expect((run!.ocr_result as { tokens: { bbox: number[] }[] }).tokens[1]!.bbox).toEqual([0.5, 0.05, 0.8, 0.2]);
  }, 60_000);

  it('a second run of a photo discards its previous pending suggestions and emits its own', async () => {
    const { relatorioId, blocks } = await relatorio();
    const chave = blocks.find((b) => b.block_type === 'chave_seccionadora')!;
    const bytes = await solidPng(99, 12, 12);
    fixture(bytes, { ocr: chaveOcr('Refab', '36,2'), structuring: chaveValues('Refab', '36,2') });
    const id = await photo(relatorioId, chave, bytes, 'image/png');
    await send(id);
    await waitFor('the first run', async () => (await runs(id)).length === 1 && (await status(id)) === 'done');
    const first = await suggestions(relatorioId);
    expect(first).toHaveLength(2);

    await send(id);
    await waitFor('the second run', async () => (await runs(id)).length === 2);
    const [, second] = await runs(id);
    expect(second!.outcome).toBe('ok');
    const after = await suggestions(relatorioId);
    expect(after).toHaveLength(4);
    for (const old of first) expect(after.find((s) => s.id === old.id)!.status).toBe('discarded');
    const fresh = after.filter((s) => s.status === 'pending');
    expect(fresh).toHaveLength(2);
    expect(fresh.every((s) => s.source.reading_run_id === second!.id)).toBe(true);
    expect(await status(id)).toBe('done');
  }, 60_000);
});

describe('8.4-INT foreign payloads and the AI flag', () => {
  it('11.8 follow-up: with AI features off a queued plate job fails permanently before OCR; no provider is built', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const bytes = await solidPng(1, 2, Math.floor(Math.random() * 250));
    const id = await photo(relatorioId, block, bytes, 'image/png');
    let built = 0;
    const offDeps = {
      ...deps,
      aiFeatures: false,
      providers: (ctx: Parameters<typeof deps.providers>[0]) => {
        built += 1;
        return deps.providers(ctx);
      },
    };
    await runReadingJob(offDeps, { company_id: companyId, photo_id: id, reading_kind: 'plate' }, { jobId: 'direct', attempt: 1, lastAttempt: false });
    expect(built).toBe(0);
    expect(await status(id)).toBe('failed');
    const rows = await runs(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.error).toContain('AiFeaturesOffError');
    expect(rows[0]!.ocr_provider).toBe('none');
  }, 60_000);

  it('a payload naming a photo the company does not hold writes a run row and no status', async () => {
    const photoId = newId();
    await runReadingJob(deps, { company_id: companyId, photo_id: photoId, reading_kind: 'plate' }, { jobId: 'direct', attempt: 1, lastAttempt: false });
    const rows = await runs(photoId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'error', relatorio_id: null });
    expect(await row('file', photoId)).toBeUndefined();
  }, 60_000);
});

describe('11.7-INT the textract provider through an injected client (nothing reaches AWS)', () => {
  const answer = JSON.parse(readFileSync(join(import.meta.dirname, 'providers/fixtures/textract/plate-upright.json'), 'utf8')) as { Blocks: Block[] };
  // Every WORD shifted right by 1% of the width, so these boxes differ from the fake fixture's.
  const shifted: Block[] = answer.Blocks.map((block) =>
    block.BlockType === 'WORD' && block.Geometry?.BoundingBox !== undefined
      ? { ...block, Geometry: { ...block.Geometry, BoundingBox: { ...block.Geometry.BoundingBox, Left: block.Geometry.BoundingBox.Left! + 0.01 } } }
      : block,
  );
  const textractDeps = (client: TextractLike): ReadingJobDeps => ({
    ...deps,
    providers: createReadingProviders({ OCR_PROVIDER: 'textract', LLM_PROVIDER: 'fake', OCR_SERVICE_URL: 'http://127.0.0.1:9', TEXTRACT_REGION: 'us-east-1' }, { fixturesDir, textract: { client } }),
  });
  const platePhoto = async (relatorioId: string, block: BlockRow) => {
    const bytes = new Uint8Array(await sharp(readFileSync(join(repoRoot, 'services/ocr/tests/fixtures/plate-transformador.jpg'))).resize({ width: 1200 }).jpeg({ quality: 82 }).toBuffer());
    return photo(relatorioId, block, bytes, 'image/jpeg');
  };

  it('a plate photo reads to done, its suggestions boxed by the Textract tokens, the run naming textract', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const id = await platePhoto(relatorioId, block);
    const sent: Uint8Array[] = [];
    const client: TextractLike = {
      async send(command) {
        sent.push(command.input.Document!.Bytes!);
        return { Blocks: shifted };
      },
    };
    await runReadingJob(textractDeps(client), { company_id: companyId, photo_id: id, reading_kind: 'plate' }, { jobId: 'direct', attempt: 1, lastAttempt: false });
    expect(await status(id)).toBe('done');
    expect(sent).toHaveLength(1);
    const size = await sharp(sent[0]!).metadata();
    const expected = textractTokens(shifted, size.width, size.height);
    const [run] = await runs(id);
    expect(run).toMatchObject({ attempt: 1, outcome: 'ok', ocr_provider: 'textract', model: 'fake' });
    const stored = (run!.ocr_result as { tokens: { text: string; bbox: number[] }[] }).tokens;
    expect(stored.map((token) => token.text)).toEqual(expected.map((token) => token.text));
    const mine = (await suggestions(relatorioId)).filter((s) => s.source.photo_id === id);
    expect(mine).toHaveLength(11);
    const identificacao = mine.find((s) => s.target_path.endsWith('/identificacao'))!;
    expect(identificacao).toMatchObject({ value: 'TR-01', status: 'pending' });
    expect(identificacao.source.ocr_token_ids).toEqual(['t4']);
    const [x0, y0, x1, y1] = expected[4]!.bbox;
    const normalized = [x0 / size.width, y0 / size.height, x1 / size.width, y1 / size.height];
    identificacao.source.bbox!.forEach((value, corner) => expect(value).toBeCloseTo(normalized[corner]!, 3));
    stored[4]!.bbox.forEach((value, corner) => expect(value).toBeCloseTo(normalized[corner]!, 3));
  }, 60_000);

  it('AccessDeniedException ends failed in one attempt, permanent, the run naming textract', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const id = await platePhoto(relatorioId, block);
    const client: TextractLike = {
      async send() {
        throw new AccessDeniedException({ $metadata: {}, message: 'explicit deny' });
      },
    };
    await runReadingJob(textractDeps(client), { company_id: companyId, photo_id: id, reading_kind: 'plate' }, { jobId: 'direct', attempt: 1, lastAttempt: false });
    expect(await status(id)).toBe('failed');
    const rows = await runs(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ attempt: 1, outcome: 'error', ocr_provider: 'textract' });
    expect(rows[0]!.error).toContain('AccessDeniedException');
    expect(await suggestions(relatorioId)).toEqual([]);
  }, 60_000);
});

describe('E78-Q6 a reading whose last attempt dies ends failed (the dead letter queue)', () => {
  const hangQueue = `reading-hang-${newId()}`;
  const hangOptions: ReadingQueueOptions = { retryLimit: 0, retryBackoff: false, retryDelay: 0, expireInSeconds: 1 };
  let release: () => void = () => undefined;
  const hanging = new Promise<never>((_, reject) => {
    release = () => reject(new PermanentReadingError('released by the test'));
  });
  hanging.catch(() => undefined);
  const hangDeps: ReadingJobDeps = {
    ...deps,
    providers: () => ({
      ocr: { read: () => hanging },
      structuring: { structure: () => hanging },
      prose: { describe: () => hanging },
      ocr_name: 'fake',
    }),
  };

  beforeAll(async () => {
    await registerReadingWorker(boss, hangDeps, { queue: hangQueue, queueOptions: hangOptions, workOptions: { pollingIntervalSeconds: 0.5 } });
  }, 60_000);

  afterAll(async () => {
    release();
    await boss.offWork(hangQueue, { wait: false });
    await boss.offWork(readingDeadLetterQueue(hangQueue), { wait: false });
    await boss.deleteQueue(hangQueue);
    await boss.deleteQueue(readingDeadLetterQueue(hangQueue));
  }, 60_000);

  it('a provider that never answers: the attempt expires, the dead letter worker writes failed as system:reading', async () => {
    expect((await boss.getQueue(hangQueue))!.deadLetter).toBe(readingDeadLetterQueue(hangQueue));
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const id = await photo(relatorioId, block, await solidPng(9, 19, 29), 'image/png');
    const wrote = await startReading(
      { db, now, newId, enqueue: (payload) => enqueueReading(boss, payload, { queue: hangQueue, queueOptions: hangOptions }) },
      company,
      { id, relatorioId },
      { company_id: companyId, photo_id: id, reading_kind: 'plate' },
    );
    expect(wrote).toBe(true);
    expect(await status(id)).toBe('running');
    await waitFor('the dead letter to fail the reading', async () => (await status(id)) === 'failed', 45_000);
    const [last] = await db
      .select({ value: ops.value, actor_id: ops.actor_id })
      .from(ops)
      .where(and(eq(ops.company_id, companyId), eq(ops.path, readingStatusPath(id))))
      .orderBy(desc(ops.seq))
      .limit(1);
    expect(last).toEqual({ value: 'failed', actor_id: 'system:reading' });
  }, 60_000);

  it('writes nothing while a job for the key is queued, or once the status moved on', async () => {
    const idle = `reading-idle-${newId()}`;
    await ensureReadingQueue(boss, { queue: idle, queueOptions: hangOptions });
    try {
      const { relatorioId, blocks } = await relatorio();
      const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
      const id = await photo(relatorioId, block, await solidPng(9, 29, 39), 'image/png');
      const payload = { company_id: companyId, photo_id: id, reading_kind: 'plate' as const };
      // Running, and a newer job for the same key still queued (no worker on this queue).
      await startReading({ db, now, newId, enqueue: (p) => enqueueReading(boss, p, { queue: idle, queueOptions: hangOptions }) }, company, { id, relatorioId }, payload);
      expect(await failDeadReading(boss, { db, now, newId }, idle, payload, 'dead-1')).toBe(false);
      expect(await status(id)).toBe('running');
      // No live job any more, still running: failed.
      await boss.deleteQueuedJobs(idle);
      expect(await failDeadReading(boss, { db, now, newId }, idle, payload, 'dead-2')).toBe(true);
      expect(await status(id)).toBe('failed');
      // Not running (failed, or done): left as it is.
      expect(await failDeadReading(boss, { db, now, newId }, idle, payload, 'dead-3')).toBe(false);
    } finally {
      await boss.deleteQueue(idle);
      await boss.deleteQueue(readingDeadLetterQueue(idle));
    }
  }, 60_000);

  it('an existing queue created without a dead letter gets one', async () => {
    const old = `reading-old-${newId()}`;
    await boss.createQueue(old, { policy: 'stately' });
    try {
      expect((await boss.getQueue(old))!.deadLetter ?? null).toBeNull();
      await ensureReadingQueue(boss, { queue: old });
      expect((await boss.getQueue(old))!.deadLetter).toBe(readingDeadLetterQueue(old));
    } finally {
      await boss.deleteQueue(old);
      await boss.deleteQueue(readingDeadLetterQueue(old));
    }
  }, 60_000);

  it('A13: a job sent before the queue had its dead letter gets it with the queue', async () => {
    const old = `reading-old-${newId()}`;
    await boss.createQueue(old, { policy: 'stately' });
    try {
      const payload = { company_id: companyId, photo_id: newId(), reading_kind: 'plate' as const };
      const jobId = await boss.send(old, payload);
      expect(jobId).not.toBeNull();
      const deadLetterOf = async () => (await boss.findJobs(old, { id: jobId! }))[0]?.deadLetter ?? null;
      expect(await deadLetterOf()).toBeNull();
      await ensureReadingQueue(boss, { queue: old });
      expect(await deadLetterOf()).toBe(readingDeadLetterQueue(old));
    } finally {
      await boss.deleteQueue(old);
      await boss.deleteQueue(readingDeadLetterQueue(old));
    }
  }, 60_000);
});

describe('9.2-INT the panel reading', () => {
  let color = 60;
  const C09_SECCIONADORA = {
    values: [
      { key: 'block_type', value: 'chave_seccionadora', ocr_token_ids: ['t1'], confidence: 0.93 },
      { key: 'column', value: 'C09', ocr_token_ids: ['t0'], confidence: 0.95 },
    ],
  };

  /** A panel photo taken from the palette on `target` (a `{location_id}`, or anything else to break it), its fixture a C09 seccionadora. */
  async function panelPhoto(relatorioId: string, target: unknown): Promise<string> {
    const bytes = await solidPng(90, 40, color++);
    fixture(bytes, {
      ocr: {
        image: { width: 200, height: 100 },
        tokens: [
          { id: 't0', text: 'C09', bbox: [10, 10, 50, 30], confidence: 0.99 },
          { id: 't1', text: 'SECCIONADORA', bbox: [60, 50, 180, 70], confidence: 0.99 },
        ],
        preprocessing_applied: false,
      },
      structuring: C09_SECCIONADORA,
    });
    const id = newId();
    await apply([
      {
        kind: 'create',
        scope: 'relatorio',
        company_id: companyId,
        project_id: null,
        relatorio_id: relatorioId,
        path: `file/${id}`,
        value: {
          id,
          company_id: companyId,
          relatorio_id: relatorioId,
          kind: 'photo',
          sha256: sha256(bytes),
          mime: 'image/png',
          size: bytes.byteLength,
          uploaded_at: null,
          variants: null,
          removed_at: null,
          captured_at: '2026-09-28T10:00:00.000Z',
          tz_offset: -180,
          coords: null,
          local_seq: 1,
          block_id: null,
          item_key: null,
          caption: null,
          reading_kind: 'panel',
          reading_target: target,
          reading_status: 'queued',
        } as never,
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: ACTOR,
      },
    ]);
    await putObject(s3, bucket, objectKey(companyId, 'photo', id, 'original', relatorioId), bytes, 'image/png');
    const variants = (await renderVariants(bytes, 'image/png'))!;
    await putObject(s3, bucket, objectKey(companyId, 'photo', id, 'print', relatorioId), variants.print.bytes, variants.print.contentType);
    return id;
  }

  const runPanel = (id: string) => runReadingJob(deps, { company_id: companyId, photo_id: id, reading_kind: 'panel' }, { jobId: 'direct-panel', attempt: 1, lastAttempt: false });

  it('reads the type and the column into one pending suggestion on file/{id}/block_id, and ends done', async () => {
    const { relatorioId, blocks } = await relatorio();
    const coluna = blocks.find((b) => b.block_type === 'chave_seccionadora')!.location_id!;
    const id = await panelPhoto(relatorioId, { location_id: coluna });
    await runPanel(id);
    expect(await status(id)).toBe('done');
    const mine = (await suggestions(relatorioId)).filter((s) => s.source.photo_id === id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      target_path: `file/${id}/block_id`,
      value: { block_type: 'chave_seccionadora', column: 9, column_text: 'C09' },
      trust: 'suggested',
      status: 'pending',
      source: { photo_id: id, bbox: [0.05, 0.1, 0.9, 0.7], ocr_token_ids: ['t0', 't1'] },
    });
    const [run] = await runs(id);
    expect(run).toMatchObject({ outcome: 'ok', reading_kind: 'panel', model: 'fake' });
  }, 60_000);

  it('a photo re-targeted to plate before its panel job runs: the panel job ends superseded, writing neither failed nor done', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'chave_seccionadora')!;
    const id = await panelPhoto(relatorioId, { location_id: block.location_id });
    await apply([
      relatorioPut(relatorioId, `file/${id}/reading_target`, plateReadingTarget(block.id, block.block_type)),
      relatorioPut(relatorioId, `file/${id}/reading_kind`, 'plate'),
    ]);
    await runPanel(id);
    expect(await row('file', id)).toMatchObject({ reading_kind: 'plate', reading_status: 'queued' });
    const statusOps = await db.select({ value: ops.value }).from(ops).where(and(eq(ops.company_id, companyId), eq(ops.path, readingStatusPath(id))));
    expect(statusOps).toEqual([]);
    const rows = await runs(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'error', error: 'superseded', reading_kind: 'panel' });
    expect((await suggestions(relatorioId)).filter((s) => s.source.photo_id === id)).toEqual([]);
  }, 60_000);

  /** Runs the panel job with a structuring step that re-targets the photo to `block`'s plate mid-run, then answers or throws `fail`. */
  async function runRetargetedMidRun(relatorioId: string, id: string, block: BlockRow, fail: Error | null): Promise<void> {
    const midRun: ReadingJobDeps = {
      ...deps,
      providers: (ctx) => {
        const real = deps.providers(ctx);
        return {
          ...real,
          structuring: {
            async structure(input) {
              await apply([
                relatorioPut(relatorioId, `file/${id}/reading_target`, plateReadingTarget(block.id, block.block_type)),
                relatorioPut(relatorioId, `file/${id}/reading_kind`, 'plate'),
              ]);
              if (fail !== null) throw fail;
              return real.structuring.structure(input);
            },
          },
        };
      },
    };
    await runReadingJob(midRun, { company_id: companyId, photo_id: id, reading_kind: 'panel' }, { jobId: 'direct-panel-mid', attempt: 1, lastAttempt: false });
  }

  async function expectSuperseded(relatorioId: string, id: string): Promise<void> {
    expect(await row('file', id)).toMatchObject({ reading_kind: 'plate', reading_status: 'queued' });
    expect(await db.select({ value: ops.value }).from(ops).where(and(eq(ops.company_id, companyId), eq(ops.path, readingStatusPath(id))))).toEqual([]);
    const rows = await runs(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'error', error: 'superseded', reading_kind: 'panel' });
    expect((await suggestions(relatorioId)).filter((s) => s.source.photo_id === id)).toEqual([]);
  }

  it('re-targeted while the panel job runs: the check inside the batch ends it superseded, no status and no suggestion', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'chave_seccionadora')!;
    const id = await panelPhoto(relatorioId, { location_id: block.location_id });
    await runRetargetedMidRun(relatorioId, id, block, null);
    await expectSuperseded(relatorioId, id);
  }, 60_000);

  it('re-targeted while the panel job runs, which then fails permanently: superseded, no failed written over the plate', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'chave_seccionadora')!;
    const id = await panelPhoto(relatorioId, { location_id: block.location_id });
    await runRetargetedMidRun(relatorioId, id, block, new PermanentReadingError('stub: the model refused'));
    await expectSuperseded(relatorioId, id);
  }, 60_000);

  it('a target that does not parse, a location gone or one of another relatório fails permanently', async () => {
    const own = await relatorio();
    const other = await relatorio();
    const coluna = own.blocks.find((b) => b.block_type === 'chave_seccionadora')!.location_id!;
    const cases: [unknown, string][] = [
      [{ block_id: coluna }, 'no panel reading target'],
      [{ location_id: other.blocks.find((b) => b.block_type === 'chave_seccionadora')!.location_id }, 'not of the photo relatorio'],
      [{ location_id: newId() }, 'target location does not exist'],
    ];
    for (const [target, reason] of cases) {
      const id = await panelPhoto(own.relatorioId, target);
      await runPanel(id);
      const rows = await runs(id);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.error).toContain(reason);
      expect(await status(id)).toBe('failed');
    }
    const id = await panelPhoto(own.relatorioId, { location_id: coluna });
    await apply([{ ...relatorioPut(own.relatorioId, `location/${coluna}/removed_at`, null), kind: 'remove' }]);
    await runPanel(id);
    expect((await runs(id))[0]!.error).toContain('target location was removed');
    expect(await status(id)).toBe('failed');
  }, 60_000);
});

describe('11.6-INT the bedrock provider through an injected client (nothing reaches AWS)', () => {
  const HAIKU = 'global.anthropic.claude-haiku-4-5-20251001-v1:0';
  const NOVA_PRO = 'us.amazon.nova-pro-v1:0';
  const QWEN = 'qwen.qwen3-vl-235b-a22b';
  const PANEL = '36f3fca92f329117f736195e6bcdcae60ba683a82a7d3dcd0aff154b158d3d51';
  const fixtureOf = (sha: string) => JSON.parse(readFileSync(join(DEFAULT_FIXTURES_DIR, `${sha}.json`), 'utf8')) as { structuring: unknown };
  /** The synthetic plate's eleven values (one `verify`: the TAP the fixture misreads). */
  const plateAnswer = fixtureOf(DEFAULT_FIXTURE_BY_BLOCK_TYPE.transformador_forca!).structuring;
  /** Three plate values, two whose digits are not their cited tokens' digits: two `verify` of three. */
  const poorAnswer = {
    values: [
      { key: 'identificacao', value: 'TR-02', ocr_token_ids: ['t4'], confidence: 0.6 },
      { key: 'n_serie', value: '240815-08', ocr_token_ids: ['t9'], confidence: 0.6 },
      { key: 'tipo', value: 'TSE-500/15', ocr_token_ids: ['t11'], confidence: 0.9 },
    ],
  };
  const TOKENS: Record<string, { inputTokens: number; outputTokens: number }> = { [HAIKU]: { inputTokens: 2000, outputTokens: 300 }, [NOVA_PRO]: { inputTokens: 2100, outputTokens: 500 }, [QWEN]: { inputTokens: 1700, outputTokens: 120 } };

  /** A client answering each model with its own tool input, recording the models it was asked. */
  function converse(byModel: Record<string, unknown>): BedrockLike & { models: string[]; images: Uint8Array[] } {
    const models: string[] = [];
    const images: Uint8Array[] = [];
    return {
      models,
      images,
      async send(command): Promise<BedrockConverseOutput> {
        const modelId = command.input.modelId!;
        models.push(modelId);
        images.push(command.input.messages![0]!.content![0]!.image!.source!.bytes!);
        const tokens = TOKENS[modelId]!;
        return {
          output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 'u1', name: 'record_values', input: byModel[modelId] as never } }] } },
          stopReason: 'tool_use',
          usage: { ...tokens, totalTokens: tokens.inputTokens + tokens.outputTokens },
        };
      },
    };
  }

  const bedrockDeps = (client: BedrockLike, escalation?: string): ReadingJobDeps => ({
    ...deps,
    providers: createReadingProviders(
      { OCR_PROVIDER: 'fake', LLM_PROVIDER: 'bedrock', OCR_SERVICE_URL: 'http://127.0.0.1:9', ...(escalation === undefined ? {} : { BEDROCK_ESCALATION_MODEL_ID: escalation }) },
      { fixturesDir, bedrock: { client, createClient: () => { throw new Error('a real BedrockRuntimeClient was built'); } } },
    ),
  });
  /** The synthetic plate as a device sends it: re-encoded, so the fake OCR replays the plate fixture scaled. */
  const platePhoto = async (relatorioId: string, block: BlockRow) => {
    const bytes = new Uint8Array(await sharp(readFileSync(join(repoRoot, 'services/ocr/tests/fixtures/plate-transformador.jpg'))).resize({ width: 1200 }).jpeg({ quality: 82 }).toBuffer());
    return photo(relatorioId, block, bytes, 'image/jpeg');
  };
  const read = (jobDeps: ReadingJobDeps, id: string, reading_kind: 'plate' | 'panel' = 'plate') =>
    runReadingJob(jobDeps, { company_id: companyId, photo_id: id, reading_kind }, { jobId: 'direct', attempt: 1, lastAttempt: false });
  const usd = (model: string) => (model === HAIKU ? (2000 * 1.0 + 300 * 5.0) / 1e6 : model === QWEN ? Math.round(1700 * 0.53 + 120 * 2.66) / 1e6 : (2100 * 0.8 + 500 * 3.2) / 1e6);

  it('a plate reads to done through Converse: suggestions from the tool input, the run row with the model, prompt_version, tokens and USD', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const id = await platePhoto(relatorioId, block);
    const client = converse({ [HAIKU]: plateAnswer });
    await read(bedrockDeps(client), id);
    expect(await status(id)).toBe('done');
    // One verify of eleven: no escalation, one call, on the job's own image bytes.
    expect(client.models).toEqual([HAIKU]);
    expect((await sharp(client.images[0]!).metadata()).width).toBe(1200);
    const mine = (await suggestions(relatorioId)).filter((s) => s.source.photo_id === id);
    expect(mine).toHaveLength(11);
    expect(mine.every((s) => s.status === 'pending' && s.prompt_version === 'bedrock-structuring-1')).toBe(true);
    expect(mine.find((s) => s.target_path.endsWith('/identificacao'))).toMatchObject({ value: 'TR-01', trust: 'suggested', source: { ocr_token_ids: ['t4'] } });
    const [run] = await runs(id);
    expect(run).toMatchObject({
      attempt: 1,
      outcome: 'ok',
      ocr_provider: 'fake',
      model: HAIKU,
      prompt_version: 'bedrock-structuring-1',
      llm_usage: { input_tokens: 2000, output_tokens: 300, usd: usd(HAIKU) },
    });
  }, 60_000);

  it('a plate more than half verify is read once more on the escalation model; the reading with more suggested values is kept, usage summed', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const id = await platePhoto(relatorioId, block);
    const client = converse({ [HAIKU]: poorAnswer, [NOVA_PRO]: plateAnswer });
    await read(bedrockDeps(client), id);
    expect(await status(id)).toBe('done');
    expect(client.models).toEqual([HAIKU, NOVA_PRO]);
    const mine = (await suggestions(relatorioId)).filter((s) => s.source.photo_id === id);
    expect(mine).toHaveLength(11);
    expect(mine.filter((s) => s.trust === 'verify')).toHaveLength(1);
    const [run] = await runs(id);
    expect(run).toMatchObject({
      outcome: 'ok',
      model: NOVA_PRO,
      prompt_version: 'bedrock-structuring-1',
      llm_usage: { input_tokens: 4100, output_tokens: 800, usd: Math.round((usd(HAIKU) + usd(NOVA_PRO)) * 1e6) / 1e6 },
    });
  }, 60_000);

  it('the escalation keeps the first reading when it has fewer suggested values', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const id = await platePhoto(relatorioId, block);
    const fewer = { values: poorAnswer.values.slice(0, 2) };
    const client = converse({ [HAIKU]: poorAnswer, [NOVA_PRO]: fewer });
    await read(bedrockDeps(client), id);
    expect(client.models).toEqual([HAIKU, NOVA_PRO]);
    const mine = (await suggestions(relatorioId)).filter((s) => s.source.photo_id === id);
    expect(mine.map((s) => s.trust).sort()).toEqual(['suggested', 'verify', 'verify']);
    expect((await runs(id))[0]).toMatchObject({ model: HAIKU, llm_usage: { input_tokens: 4100, output_tokens: 800 } });
  }, 60_000);

  it('an OCR read with no word never escalates, even with no suggestion: only the first model is called', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const bytes = await solidPng(3, 141, 59);
    fixture(bytes, { ocr: { image: { width: 200, height: 100 }, tokens: [], preprocessing_applied: false } });
    const id = await photo(relatorioId, block, bytes, 'image/png');
    const client = converse({ [HAIKU]: { values: [] }, [NOVA_PRO]: plateAnswer });
    await read(bedrockDeps(client), id);
    expect(await status(id)).toBe('done');
    expect(client.models).toEqual([HAIKU]);
    expect((await suggestions(relatorioId)).filter((s) => s.source.photo_id === id)).toEqual([]);
    expect((await runs(id))[0]).toMatchObject({ outcome: 'ok', model: HAIKU, llm_usage: { input_tokens: 2000, output_tokens: 300, usd: usd(HAIKU) } });
  }, 60_000);

  it('an empty first reading with OCR words present is read again on the escalation model, which is kept', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const id = await platePhoto(relatorioId, block);
    const client = converse({ [HAIKU]: { values: [] }, [NOVA_PRO]: plateAnswer });
    await read(bedrockDeps(client), id);
    expect(await status(id)).toBe('done');
    expect(client.models).toEqual([HAIKU, NOVA_PRO]);
    const mine = (await suggestions(relatorioId)).filter((s) => s.source.photo_id === id);
    expect(mine).toHaveLength(11);
    expect((await runs(id))[0]).toMatchObject({ outcome: 'ok', model: NOVA_PRO, llm_usage: { input_tokens: 4100, output_tokens: 800, usd: Math.round((usd(HAIKU) + usd(NOVA_PRO)) * 1e6) / 1e6 } });
  }, 60_000);

  it('an escalation that returns only verify rows replaces an empty first reading (a tie on suggested goes to the one with more rows)', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const id = await platePhoto(relatorioId, block);
    const verifyOnly = { values: poorAnswer.values.filter((value) => value.key !== 'tipo') };
    const client = converse({ [HAIKU]: { values: [] }, [NOVA_PRO]: verifyOnly });
    await read(bedrockDeps(client), id);
    expect(client.models).toEqual([HAIKU, NOVA_PRO]);
    const mine = (await suggestions(relatorioId)).filter((s) => s.source.photo_id === id);
    expect(mine.map((s) => s.trust)).toEqual(['verify', 'verify']);
    expect((await runs(id))[0]).toMatchObject({ model: NOVA_PRO });
  }, 60_000);

  it('with BEDROCK_ESCALATION_MODEL_ID empty no second call is made', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const id = await platePhoto(relatorioId, block);
    const client = converse({ [HAIKU]: poorAnswer, [NOVA_PRO]: plateAnswer });
    await read(bedrockDeps(client, ''), id);
    expect(await status(id)).toBe('done');
    expect(client.models).toEqual([HAIKU]);
    expect((await runs(id))[0]).toMatchObject({ model: HAIKU, llm_usage: { input_tokens: 2000, output_tokens: 300, usd: usd(HAIKU) } });
  }, 60_000);

  for (const [name, thrown] of [
    ['AccessDeniedException (permanent)', new BedrockAccessDeniedException({ $metadata: {}, message: 'explicit deny' })],
    ['ThrottlingException (transient)', new BedrockThrottlingException({ $metadata: {}, message: 'Too many tokens' })],
  ] as const) {
    it(`an escalation that fails with ${name} keeps the first reading: done, its suggestions, the Haiku model and usage`, async () => {
      const { relatorioId, blocks } = await relatorio();
      const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
      const id = await platePhoto(relatorioId, block);
      const first = converse({ [HAIKU]: poorAnswer });
      const client: BedrockLike = {
        async send(command, options) {
          if (command.input.modelId === NOVA_PRO) throw thrown;
          return first.send(command, options);
        },
      };
      await read(bedrockDeps(client), id);
      expect(await status(id)).toBe('done');
      const mine = (await suggestions(relatorioId)).filter((s) => s.source.photo_id === id);
      expect(mine.map((s) => s.trust).sort()).toEqual(['suggested', 'verify', 'verify']);
      const rows = await runs(id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ attempt: 1, outcome: 'ok', model: HAIKU, prompt_version: 'bedrock-structuring-1', llm_usage: { input_tokens: 2000, output_tokens: 300, usd: usd(HAIKU) } });
    }, 60_000);
  }

  it('a panel front reads to done through Converse on the panel model, never escalating: one suggestion on the photo block_id, usage on the run row', async () => {
    copyFileSync(join(DEFAULT_FIXTURES_DIR, `${PANEL}.json`), join(fixturesDir, `${PANEL}.json`));
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'chave_seccionadora')!;
    const id = await photo(relatorioId, block, await solidPng(11, 22, 33, 400, 300), 'image/png', { panel: true });
    const client = converse({ [QWEN]: fixtureOf(PANEL).structuring });
    await read(bedrockDeps(client), id, 'panel');
    expect(await status(id)).toBe('done');
    // Panel fronts read on their own model (Qwen3 VL by default), never on Haiku, and never escalate.
    expect(client.models).toEqual([QWEN]);
    const mine = (await suggestions(relatorioId)).filter((s) => s.source.photo_id === id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ target_path: `file/${id}/block_id`, prompt_version: 'bedrock-structuring-1' });
    expect((await runs(id))[0]).toMatchObject({ outcome: 'ok', reading_kind: 'panel', model: QWEN, prompt_version: 'bedrock-structuring-1', llm_usage: { input_tokens: 1700, output_tokens: 120, usd: usd(QWEN) } });
  }, 60_000);

  it('a panel front whose reading is all low-confidence (verify) still never escalates: only the panel model is called', async () => {
    copyFileSync(join(DEFAULT_FIXTURES_DIR, `${PANEL}.json`), join(fixturesDir, `${PANEL}.json`));
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'chave_seccionadora')!;
    const id = await photo(relatorioId, block, await solidPng(11, 22, 33, 400, 300), 'image/png', { panel: true });
    const unsure = { values: (fixtureOf(PANEL).structuring as { values: Record<string, unknown>[] }).values.map((value) => ({ ...value, confidence: 0.3 })) };
    // Nova Pro answers too, so a second call would show in `client.models`.
    const client = converse({ [QWEN]: unsure, [NOVA_PRO]: fixtureOf(PANEL).structuring });
    await read(bedrockDeps(client), id, 'panel');
    expect(await status(id)).toBe('done');
    expect(client.models).toEqual([QWEN]);
    const mine = (await suggestions(relatorioId)).filter((s) => s.source.photo_id === id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ trust: 'verify' });
    expect((await runs(id))[0]).toMatchObject({ model: QWEN });
  }, 60_000);

  it('AccessDeniedException ends failed in one attempt, permanent, naming the AWS error; no suggestion', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const id = await platePhoto(relatorioId, block);
    const client: BedrockLike = {
      async send() {
        throw new BedrockAccessDeniedException({ $metadata: {}, message: 'explicit deny' });
      },
    };
    await read(bedrockDeps(client), id);
    expect(await status(id)).toBe('failed');
    const rows = await runs(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ attempt: 1, outcome: 'error', ocr_provider: 'fake', model: null });
    expect(rows[0]!.error).toContain('PermanentReadingError');
    expect(rows[0]!.error).toContain('AccessDeniedException');
    expect((await suggestions(relatorioId)).filter((s) => s.source.photo_id === id)).toEqual([]);
  }, 60_000);
});
