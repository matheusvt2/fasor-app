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
import { DEFAULT_FIXTURES_DIR } from './providers/fake.ts';
import { createReadingProviders } from './providers/index.ts';
import { readingServerOp, readingStatusPath, startReading } from './status.ts';
import { enqueueReading, registerReadingWorker, type ReadingQueueOptions } from './worker.ts';

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
 * variants in the store (`print: false` leaves the print variant out; `target` names another block).
 */
async function photo(
  relatorioId: string,
  block: BlockRow,
  bytes: Uint8Array,
  mime: 'image/png' | 'image/jpeg',
  options: { print?: boolean; target?: Pick<BlockRow, 'id' | 'block_type'> } = {},
): Promise<string> {
  const target = options.target ?? block;
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
        block_id: block.id,
        item_key: null,
        caption: 'Placa de identificação',
        reading_kind: 'plate',
        reading_target: plateReadingTarget(target.id, target.block_type),
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
  boss = new PgBoss(config.DATABASE_URL);
  boss.on('error', (error) => console.error('pg-boss error', error));
  await boss.start();
  await registerReadingWorker(boss, deps, { queue, queueOptions, workOptions: { pollingIntervalSeconds: 0.5 } });
}, 60_000);

afterAll(async () => {
  await boss.offWork(queue);
  await boss.deleteQueue(queue);
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

  it('a photo without a fixture fails permanently after one attempt', async () => {
    const { relatorioId, blocks } = await relatorio();
    const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const id = await photo(relatorioId, block, await solidPng(7, 77, 177), 'image/png');
    await send(id);
    await waitFor('the permanent failure', async () => (await status(id)) === 'failed');
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const rows = await runs(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ attempt: 1, outcome: 'error' });
    expect(rows[0]!.error).toContain('PermanentReadingError');
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

describe('8.4-INT provider stubs and foreign payloads', () => {
  for (const [ocr, llm] of [
    ['textract', 'fake'],
    ['fake', 'anthropic'],
    ['fake', 'bedrock'],
  ] as const) {
    it(`OCR_PROVIDER=${ocr} LLM_PROVIDER=${llm} fails permanently with ProviderNotImplementedError`, async () => {
      const { relatorioId, blocks } = await relatorio();
      const block = blocks.find((b) => b.block_type === 'transformador_forca')!;
      const bytes = await solidPng(1, 2, Math.floor(Math.random() * 250));
      fixture(bytes, { ocr: { image: { width: 200, height: 100 }, tokens: [], preprocessing_applied: false } });
      const id = await photo(relatorioId, block, bytes, 'image/png');
      const stubDeps = { ...deps, providers: createReadingProviders({ OCR_PROVIDER: ocr, LLM_PROVIDER: llm, OCR_SERVICE_URL: 'http://127.0.0.1:9' }, { fixturesDir }) };
      await runReadingJob(stubDeps, { company_id: companyId, photo_id: id, reading_kind: 'plate' }, { jobId: 'direct', attempt: 1, lastAttempt: false });
      expect(await status(id)).toBe('failed');
      const rows = await runs(id);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.error).toContain('ProviderNotImplementedError');
      expect(rows[0]!.ocr_provider).toBe(ocr);
    }, 60_000);
  }

  it('a payload naming a photo the company does not hold writes a run row and no status', async () => {
    const photoId = newId();
    await runReadingJob(deps, { company_id: companyId, photo_id: photoId, reading_kind: 'plate' }, { jobId: 'direct', attempt: 1, lastAttempt: false });
    const rows = await runs(photoId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'error', relatorio_id: null });
    expect(await row('file', photoId)).toBeUndefined();
  }, 60_000);
});
