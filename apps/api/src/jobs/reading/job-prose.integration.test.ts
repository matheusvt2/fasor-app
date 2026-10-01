import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fileFieldPath,
  instantiateTemplate,
  makeOp,
  ncObsReadingOf,
  objectKey,
  sheetChecklistPath,
  standardTemplate,
  suggestionRowSchema,
  type BlockRow,
  type Op,
  type OpDraft,
  type SuggestionRow,
} from '@app/domain';
import { and, asc, desc, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
import { createReadingProviders, type ReadingProvidersFactory } from './providers/index.ts';

/*
 * Stories 9.3 and 9.5: the two prose reading kinds (`caption`, `nc_obs`) through the job,
 * against the compose Postgres and MinIO, with a throwaway company and a copy of the committed
 * fixtures. A photo the device makes never has a committed sha256, so the happy paths replay
 * each kind's default fixture; the "cannot caption" and the error/timeout paths upload the
 * committed image itself (its own fixture wins). A spy on the prose provider proves a skipped
 * reading (a people mark, a caption, a sheet, a row no longer NC, an observation typed) never
 * reaches it. Each attempt runs directly (no queue): the plate suite covers the queue.
 */

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const bucket = config.S3_BUCKET;

const companyId = newId();
const company = asCompanyId(companyId);
const ACTOR = 'reading-prose-test-user';
const DEVICE = 'tablet-reading-prose';
const fixturesDir = mkdtempSync(join(tmpdir(), 'reading-prose-fixtures-'));
const IMAGES = join(DEFAULT_FIXTURES_DIR, 'images');
const ITEM = 'abertura_e_fechamento_manual';

const proseCalls: string[] = [];
const real = createReadingProviders({ OCR_PROVIDER: 'fake', LLM_PROVIDER: 'fake', OCR_SERVICE_URL: 'http://127.0.0.1:9' }, { fixturesDir });
const spied: ReadingProvidersFactory = (ctx) => {
  const providers = real(ctx);
  return {
    ...providers,
    prose: {
      describe: (input) => {
        proseCalls.push(`${ctx.photo_sha256}:${input.kind}`);
        return providers.prose.describe(input);
      },
    },
  };
};

const deps: ReadingJobDeps = { db, s3, bucket, now, newId, providers: spied };

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const stamp = (draft: OpDraft): Op => makeOp({ ...draft, device_id: DEVICE }, { newId, now: now() });

/**
 * Story 10.1: a put carries the last op on its path as `prev_op_id`, as the device stamps it
 * (`lastAppliedOpId`), so this one device's second write of a cell is sequential for the
 * fold, never a concurrent merge.
 */
async function withPrev(drafts: OpDraft[]): Promise<Op[]> {
  const last = new Map<string, string>();
  const out: Op[] = [];
  for (const d of drafts) {
    let prev = d.prev_op_id ?? null;
    if (d.kind === 'put' && prev === null) {
      const [latest] = await db.select({ op_id: ops.op_id }).from(ops).where(and(eq(ops.company_id, companyId), eq(ops.path, d.path))).orderBy(desc(ops.seq)).limit(1);
      prev = last.get(d.path) ?? latest?.op_id ?? null;
    }
    const op = stamp({ ...d, prev_op_id: prev });
    last.set(d.path, op.op_id);
    out.push(op);
  }
  return out;
}

async function apply(drafts: OpDraft[]): Promise<void> {
  const result = await applyOps(db, company, await withPrev(drafts), { origin: 'client', actorId: ACTOR, now });
  expect(result.rejected).toEqual([]);
}

function draft(kind: 'create' | 'put', scope: 'company' | 'relatorio', relatorioId: string | null, path: string, value: unknown): OpDraft {
  return { kind, scope, company_id: companyId, project_id: null, relatorio_id: relatorioId, path, value: value as never, prev_op_id: null, batch_id: null, meta: null, actor_id: ACTOR };
}

async function relatorio(): Promise<{ relatorioId: string; blocks: BlockRow[] }> {
  const projectId = newId();
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: newId() }),
    { id: projectId },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: ACTOR, companyId },
  );
  await apply([draft('create', 'company', null, `project/${projectId}`, { id: projectId, client_id: null, name: 'Obra prosa', site: 'Obra prosa', removed_at: null }), ...drafts]);
  const blocks = drafts.map((d) => d.value as unknown).filter((row): row is BlockRow => row !== null && typeof row === 'object' && 'block_type' in row && 'sheet' in row);
  return { relatorioId, blocks };
}

/** A device shot: a JPEG no committed fixture is named after. */
async function shot(seed: number): Promise<{ bytes: Uint8Array; mime: 'image/jpeg' | 'image/png' }> {
  const bytes = new Uint8Array(await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: seed % 256, g: 77, b: 140 } } }).jpeg({ quality: 80 }).toBuffer());
  return { bytes, mime: 'image/jpeg' };
}

/** A committed image of `fixtures/images/`, uploaded as it is (its own fixture wins). */
function committed(name: string): { bytes: Uint8Array; mime: 'image/jpeg' | 'image/png' } {
  return { bytes: new Uint8Array(readFileSync(join(IMAGES, name))), mime: 'image/png' };
}

interface PhotoInput {
  relatorioId: string;
  image: { bytes: Uint8Array; mime: 'image/jpeg' | 'image/png' };
  kind: 'caption' | 'nc_obs';
  target?: unknown;
  blockId?: string | null;
  itemKey?: string | null;
  caption?: string | null;
  peopleInPhoto?: boolean;
}

async function photo(input: PhotoInput): Promise<string> {
  const id = newId();
  const { bytes, mime } = input.image;
  await apply([
    draft('create', 'relatorio', input.relatorioId, `file/${id}`, {
      id,
      company_id: companyId,
      relatorio_id: input.relatorioId,
      kind: 'photo',
      sha256: sha256(bytes),
      mime,
      size: bytes.byteLength,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      captured_at: '2026-09-28T10:00:00.000Z',
      tz_offset: -180,
      coords: null,
      local_seq: 1,
      block_id: input.blockId ?? null,
      item_key: input.itemKey ?? null,
      caption: input.caption ?? null,
      reading_kind: input.kind,
      reading_target: input.target ?? null,
      reading_status: 'queued',
      people_in_photo: input.peopleInPhoto ?? false,
    }),
  ]);
  await putObject(s3, bucket, objectKey(companyId, 'photo', id, 'original', input.relatorioId), bytes, mime);
  const variants = (await renderVariants(bytes, mime))!;
  await putObject(s3, bucket, objectKey(companyId, 'photo', id, 'print', input.relatorioId), variants.print.bytes, variants.print.contentType);
  await putObject(s3, bucket, objectKey(companyId, 'photo', id, 'thumb', input.relatorioId), variants.thumb.bytes, variants.thumb.contentType);
  return id;
}

const run = (photoId: string, kind: 'caption' | 'nc_obs', lastAttempt = false) =>
  runReadingJob(deps, { company_id: companyId, photo_id: photoId, reading_kind: kind }, { jobId: 'direct', attempt: 1, lastAttempt });

async function row<T>(entity: string, id: string): Promise<T | undefined> {
  const [found] = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.company_id, companyId), eq(entities.entity, entity), eq(entities.id, id)));
  return found?.row as T | undefined;
}

const status = async (photoId: string) => (await row<{ reading_status: string }>('file', photoId))?.reading_status;

async function suggestionsOf(photoId: string): Promise<SuggestionRow[]> {
  const found = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.company_id, companyId), eq(entities.entity, 'suggestion')));
  return found.map((r) => suggestionRowSchema.parse(r.row)).filter((s) => s.source.photo_id === photoId);
}

async function runs(photoId: string) {
  return db.select().from(readingRuns).where(and(eq(readingRuns.company_id, companyId), eq(readingRuns.photo_id, photoId))).orderBy(asc(readingRuns.created_at));
}

const callsFor = async (photoId: string) => {
  const file = await row<{ sha256: string }>('file', photoId);
  return proseCalls.filter((call) => call.startsWith(`${file!.sha256}:`)).length;
};

const setResult = (relatorioId: string, blockId: string, value: string | null) => draft('put', 'relatorio', relatorioId, sheetChecklistPath(blockId, ITEM, 'result'), value);

beforeAll(() => {
  for (const name of readdirSync(DEFAULT_FIXTURES_DIR).filter((file) => file.endsWith('.json'))) copyFileSync(join(DEFAULT_FIXTURES_DIR, name), join(fixturesDir, name));
});

afterAll(async () => {
  await dropCompany(db, companyId);
  rmSync(fixturesDir, { recursive: true, force: true });
  await sql.end();
}, 60_000);

describe('9.3-INT the caption reading kind', () => {
  it('a photo with no context: done, one pending suggested fill on its caption, full image, no token; the run row carries the model', async () => {
    const { relatorioId } = await relatorio();
    const id = await photo({ relatorioId, image: await shot(1), kind: 'caption' });
    await run(id, 'caption');
    expect(await status(id)).toBe('done');
    const [suggestion, ...rest] = await suggestionsOf(id);
    expect(rest).toEqual([]);
    expect(suggestion).toMatchObject({
      target_path: fileFieldPath(id, 'caption'),
      value: 'Vista geral da cabine primária',
      trust: 'suggested',
      mode: 'fill',
      status: 'pending',
      prompt_version: 'fake-1',
      hint: null,
      source: { photo_id: id, bbox: [0, 0, 1, 1], ocr_token_ids: [] },
    });
    const [attempt] = await runs(id);
    expect(attempt).toMatchObject({ outcome: 'ok', reading_kind: 'caption', ocr_provider: 'fake', ocr_result: null, model: 'fake', prompt_version: 'fake-1', llm_usage: { input_tokens: 0, output_tokens: 0, usd: 0 } });
    expect(suggestion!.source.reading_run_id).toBe(attempt!.id);
    // The job never writes the caption itself.
    expect((await row<{ caption: string | null }>('file', id))!.caption).toBeNull();
    expect(await callsFor(id)).toBe(1);
  }, 60_000);

  it('audit 8.4: the attempt logs one structured line naming the company, relatório, job, photo, kind, run and attempt, with its outcome', async () => {
    const { relatorioId } = await relatorio();
    const id = await photo({ relatorioId, image: await shot(9), kind: 'caption' });
    const lines = vi.spyOn(console, 'log');
    try {
      await runReadingJob(deps, { company_id: companyId, photo_id: id, reading_kind: 'caption' }, { jobId: 'job-audit-8-4', attempt: 2, lastAttempt: false });
      const logged = lines.mock.calls
        .map((args) => JSON.parse(String(args[0])) as Record<string, unknown>)
        .filter((line) => line.photo_id === id && typeof line.msg === 'string' && line.msg.startsWith('reading '));
      const [attempt] = await runs(id);
      expect(logged).toEqual([
        expect.objectContaining({
          level: 'info',
          msg: 'reading done',
          company_id: companyId,
          relatorio_id: relatorioId,
          job_id: 'job-audit-8-4',
          photo_id: id,
          reading_kind: 'caption',
          run_id: attempt!.id,
          attempt: 2,
        }),
      ]);
      expect(attempt).toMatchObject({ outcome: 'ok', job_id: 'job-audit-8-4', attempt: 2 });
    } finally {
      lines.mockRestore();
    }
  }, 60_000);

  it('the provider cannot caption (prose null): done, no suggestion', async () => {
    const { relatorioId } = await relatorio();
    const id = await photo({ relatorioId, image: committed('caption-none.png'), kind: 'caption' });
    await run(id, 'caption');
    expect(await status(id)).toBe('done');
    expect(await suggestionsOf(id)).toEqual([]);
    expect(await runs(id)).toHaveLength(1);
  }, 60_000);

  it('a people mark, a caption or a sheet at run time: done, no suggestion, the provider never called', async () => {
    const { relatorioId, blocks } = await relatorio();
    const chave = blocks.find((b) => b.block_type === 'chave_seccionadora')!;
    const marked = await photo({ relatorioId, image: await shot(2), kind: 'caption', peopleInPhoto: true });
    const captioned = await photo({ relatorioId, image: await shot(3), kind: 'caption' });
    await apply([draft('put', 'relatorio', relatorioId, fileFieldPath(captioned, 'caption'), 'Equipe na cabine')]);
    const onSheet = await photo({ relatorioId, image: await shot(4), kind: 'caption' });
    await apply([draft('put', 'relatorio', relatorioId, fileFieldPath(onSheet, 'block_id'), chave.id)]);
    for (const id of [marked, captioned, onSheet]) {
      await run(id, 'caption');
      expect(await status(id)).toBe('done');
      expect(await suggestionsOf(id)).toEqual([]);
      expect(await callsFor(id)).toBe(0);
      const [attempt] = await runs(id);
      expect(attempt).toMatchObject({ outcome: 'ok', model: null, ocr_result: null });
    }
  }, 60_000);

  it('a mark set after a first reading: the rerun discards the pending caption and calls nothing', async () => {
    const { relatorioId } = await relatorio();
    const id = await photo({ relatorioId, image: await shot(5), kind: 'caption' });
    await run(id, 'caption');
    const [first] = await suggestionsOf(id);
    expect(first!.status).toBe('pending');
    await apply([draft('put', 'relatorio', relatorioId, fileFieldPath(id, 'people_in_photo'), true)]);
    const before = await callsFor(id);
    await run(id, 'caption');
    expect(await callsFor(id)).toBe(before);
    expect((await suggestionsOf(id)).map((s) => [s.id, s.status])).toEqual([[first!.id, 'discarded']]);
    expect(await status(id)).toBe('done');
  }, 60_000);

  it('provider error and timeout are transient: retried, failed on the last attempt', async () => {
    const { relatorioId } = await relatorio();
    for (const name of ['plate-error.png', 'plate-timeout.png']) {
      const id = await photo({ relatorioId, image: committed(name), kind: 'caption' });
      await expect(run(id, 'caption')).rejects.toThrow();
      expect(await status(id)).toBe('queued');
      await run(id, 'caption', true);
      expect(await status(id)).toBe('failed');
      expect((await runs(id)).map((r) => r.outcome)).toEqual(['error', 'error']);
      expect(await suggestionsOf(id)).toEqual([]);
    }
  }, 60_000);
});

describe('9.5-INT the nc_obs reading kind', () => {
  it('an NC row with an empty observation: one suggested fill on that row observation, nothing else', async () => {
    const { relatorioId, blocks } = await relatorio();
    const chave = blocks.find((b) => b.block_type === 'chave_seccionadora')!;
    await apply([setResult(relatorioId, chave.id, 'NC')]);
    const id = await photo({ relatorioId, image: await shot(10), kind: 'nc_obs', target: ncObsReadingOf(chave, ITEM).target, blockId: chave.id, itemKey: ITEM });
    await run(id, 'nc_obs');
    expect(await status(id)).toBe('done');
    const all = await suggestionsOf(id);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      target_path: sheetChecklistPath(chave.id, ITEM, 'observation'),
      value: 'Oxidação aparente na estrutura do equipamento.',
      trust: 'suggested',
      mode: 'fill',
      source: { bbox: [0, 0, 1, 1], ocr_token_ids: [] },
    });
    expect((await runs(id))[0]).toMatchObject({ outcome: 'ok', reading_kind: 'nc_obs', model: 'fake', prompt_version: 'fake-1' });
    // The job never writes the observation nor any verdict.
    const block = await row<BlockRow>('block', chave.id);
    expect(block!.sheet.checklist[ITEM]!.observation).toBeUndefined();
    expect(block!.sheet.checklist[ITEM]!.result!.value).toBe('NC');
  }, 60_000);

  it('drift: a row turned C, a cleared row or a typed observation: done, no suggestion, the provider never called', async () => {
    const { relatorioId, blocks } = await relatorio();
    const [a, b, c] = blocks.filter((block) => block.block_type === 'chave_seccionadora');
    const ids: string[] = [];
    for (const block of [a!, b!, c!]) {
      await apply([setResult(relatorioId, block.id, 'NC')]);
      ids.push(await photo({ relatorioId, image: await shot(20 + ids.length), kind: 'nc_obs', target: ncObsReadingOf(block, ITEM).target, blockId: block.id, itemKey: ITEM }));
    }
    await apply([
      setResult(relatorioId, a!.id, 'C'),
      setResult(relatorioId, b!.id, null),
      draft('put', 'relatorio', relatorioId, sheetChecklistPath(c!.id, ITEM, 'observation'), 'Digitado antes da leitura'),
    ]);
    for (const id of ids) {
      await run(id, 'nc_obs');
      expect(await status(id)).toBe('done');
      expect(await suggestionsOf(id)).toEqual([]);
      expect(await callsFor(id)).toBe(0);
    }
    expect((await row<BlockRow>('block', c!.id))!.sheet.checklist[ITEM]!.observation!.value).toBe('Digitado antes da leitura');
  }, 60_000);

  describe('a bad target is a permanent failure: one run row, failed, no suggestion', () => {
    async function expectPermanent(id: string, reason: string): Promise<void> {
      await run(id, 'nc_obs');
      const rows = await runs(id);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.error).toContain('PermanentReadingError');
      expect(rows[0]!.error).toContain(reason);
      expect(await status(id)).toBe('failed');
      expect(await suggestionsOf(id)).toEqual([]);
    }

    it('unparseable, a block of another relatório, another type, a removed block, an item not on the block', async () => {
      const own = await relatorio();
      const other = await relatorio();
      const chave = own.blocks.find((b) => b.block_type === 'chave_seccionadora')!;
      const foreign = other.blocks.find((b) => b.block_type === 'chave_seccionadora')!;
      const at = (target: unknown, seed: number) => shot(seed).then((image) => photo({ relatorioId: own.relatorioId, image, kind: 'nc_obs', target }));
      await expectPermanent(await at({ block_id: chave.id }, 30), 'no nc_obs reading target');
      await expectPermanent(await at(ncObsReadingOf(foreign, ITEM).target, 31), 'not the photo relatorio block');
      await expectPermanent(await at({ ...ncObsReadingOf(chave, ITEM).target, block_type: 'tp' }, 32), 'not the photo relatorio block');
      await expectPermanent(await at({ ...ncObsReadingOf(chave, ITEM).target, item_key: 'nao_existe' }, 33), 'checklist item is not on the block');
      const gone = await at(ncObsReadingOf(chave, ITEM).target, 34);
      await apply([draft('put', 'relatorio', own.relatorioId, `block/${chave.id}/removed_at`, '2026-09-28T11:00:00.000Z')]);
      await expectPermanent(gone, 'target block was removed');
    }, 60_000);
  });
});
