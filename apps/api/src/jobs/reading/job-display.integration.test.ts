import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  displayCellTarget,
  displayEnvTarget,
  instantiateTemplate,
  locationRowSchema,
  makeOp,
  objectKey,
  sheetTestCellPath,
  standardTemplate,
  suggestionRowSchema,
  type BlockRow,
  type Op,
  type OpDraft,
  type SuggestionRow,
} from '@app/domain';
import { and, asc, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { now } from '../../clock.ts';
import { loadConfig } from '../../config.ts';
import { createDb } from '../../db/client.ts';
import { asCompanyId } from '../../db/repositories/company-id.ts';
import { entities, readingRuns } from '../../db/schema.ts';
import { dropCompany } from '../../db/test-cleanup.ts';
import { newId } from '../../ids.ts';
import { createS3, putObject } from '../../storage/s3.ts';
import { renderVariants } from '../../storage/variants.ts';
import { applyOps } from '../../sync/apply.ts';
import { runReadingJob, type ReadingJobDeps } from './job.ts';
import { DEFAULT_FIXTURES_DIR } from './providers/fake.ts';
import { createReadingProviders } from './providers/index.ts';

/*
 * Story 9.1: the display reading kind through the job, against the compose Postgres and
 * MinIO, with a throwaway company and a copy of the committed fixtures (plus a few of its
 * own). The photos are what a device makes of a shot: the synthetic displays of
 * `services/ocr/tests/fixtures/`, re-encoded, so no committed sha256 matches and the job
 * reads each through its table's default fixture (`kinds/display.ts`). Each attempt is run
 * directly (no queue): the plate kind's own suite (`job.integration.test.ts`) covers the
 * queue, the retries and the dead letter for every kind alike.
 */

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const bucket = config.S3_BUCKET;

const companyId = newId();
const company = asCompanyId(companyId);
const ACTOR = 'reading-display-test-user';
const DEVICE = 'tablet-reading-display';
const fixturesDir = mkdtempSync(join(tmpdir(), 'reading-display-fixtures-'));
const repoRoot = join(import.meta.dirname, '../../../../..');
const DISPLAYS = join(repoRoot, 'services/ocr/tests/fixtures');
const GOHM = 'GΩ';

const deps: ReadingJobDeps = {
  db,
  s3,
  bucket,
  now,
  newId,
  providers: createReadingProviders({ OCR_PROVIDER: 'fake', LLM_PROVIDER: 'fake', OCR_SERVICE_URL: 'http://127.0.0.1:9' }, { fixturesDir }),
};

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const stamp = (draft: OpDraft): Op => makeOp({ ...draft, device_id: DEVICE }, { newId, now: now() });

async function apply(drafts: OpDraft[]): Promise<void> {
  const result = await applyOps(db, company, drafts.map(stamp), { origin: 'client', actorId: ACTOR, now });
  expect(result.rejected).toEqual([]);
}

function draft(kind: 'create' | 'put', scope: 'company' | 'relatorio', relatorioId: string | null, path: string, value: unknown): OpDraft {
  return { kind, scope, company_id: companyId, project_id: null, relatorio_id: relatorioId, path, value: value as never, prev_op_id: null, batch_id: null, meta: null, actor_id: ACTOR };
}

interface Built {
  relatorioId: string;
  blocks: BlockRow[];
  cabineId: string;
}

async function relatorio(): Promise<Built> {
  const projectId = newId();
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: newId() }),
    { id: projectId },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: ACTOR, companyId },
  );
  await apply([draft('create', 'company', null, `project/${projectId}`, { id: projectId, client_id: null, name: 'Obra visor', site: 'Obra visor', removed_at: null }), ...drafts]);
  const values = drafts.map((d) => d.value as unknown);
  const blocks = values.filter((row): row is BlockRow => row !== null && typeof row === 'object' && 'block_type' in row && 'sheet' in row);
  const cabine = values.map((row) => locationRowSchema.safeParse(row)).find((parsed) => parsed.success && parsed.data.kind === 'cabine');
  return { relatorioId, blocks, cabineId: cabine!.data!.id };
}

/** What a device stores of a shot of `display`: decoded, resized and re-encoded. */
async function shot(display: string, width = 1000): Promise<Uint8Array> {
  return new Uint8Array(await sharp(readFileSync(join(DISPLAYS, `${display}.jpg`))).resize({ width }).jpeg({ quality: 82 }).toBuffer());
}

/** A display photo of `relatorioId` with `target`, its create applied and its objects stored. */
async function photo(relatorioId: string, blockId: string | null, bytes: Uint8Array, target: unknown, kind: 'display' | 'panel' = 'display'): Promise<string> {
  const id = newId();
  await apply([
    draft('create', 'relatorio', relatorioId, `file/${id}`, {
      id,
      company_id: companyId,
      relatorio_id: relatorioId,
      kind: 'photo',
      sha256: sha256(bytes),
      mime: 'image/jpeg',
      size: bytes.byteLength,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      captured_at: '2026-09-28T10:00:00.000Z',
      tz_offset: -180,
      coords: null,
      local_seq: 1,
      block_id: blockId,
      item_key: null,
      caption: null,
      reading_kind: kind,
      reading_target: target,
      reading_status: 'queued',
    }),
  ]);
  await putObject(s3, bucket, objectKey(companyId, 'photo', id, 'original', relatorioId), bytes, 'image/jpeg');
  const variants = (await renderVariants(bytes, 'image/jpeg'))!;
  await putObject(s3, bucket, objectKey(companyId, 'photo', id, 'print', relatorioId), variants.print.bytes, variants.print.contentType);
  await putObject(s3, bucket, objectKey(companyId, 'photo', id, 'thumb', relatorioId), variants.thumb.bytes, variants.thumb.contentType);
  return id;
}

const run = (photoId: string, kind: 'display' | 'panel' = 'display') =>
  runReadingJob(deps, { company_id: companyId, photo_id: photoId, reading_kind: kind }, { jobId: 'direct', attempt: 1, lastAttempt: false });

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

beforeAll(() => {
  for (const name of readdirSync(DEFAULT_FIXTURES_DIR).filter((file) => file.endsWith('.json'))) copyFileSync(join(DEFAULT_FIXTURES_DIR, name), join(fixturesDir, name));
});

afterAll(async () => {
  await dropCompany(db, companyId);
  rmSync(fixturesDir, { recursive: true, force: true });
  await sql.end();
}, 60_000);

describe('9.1-INT the display reading kind', () => {
  it('a seccionadora contato aberto shot: done, one pending suggestion of 147 GΩ on T1, suggested, fill; a run row with no model', async () => {
    const { relatorioId, blocks } = await relatorio();
    const chave = blocks.find((b) => b.block_type === 'chave_seccionadora')!;
    const id = await photo(relatorioId, chave.id, await shot('display-isolacao'), displayCellTarget(chave.id, chave.block_type, 'isolacao', { row: 0, col: 0 }));
    await run(id);
    expect(await status(id)).toBe('done');
    const [suggestion, ...rest] = await suggestionsOf(id);
    expect(rest).toEqual([]);
    expect(suggestion).toMatchObject({
      target_path: sheetTestCellPath(chave.id, 'isolacao', 0, 0),
      value: { raw: '147', unit: GOHM, state: 'measured' },
      trust: 'suggested',
      mode: 'fill',
      status: 'pending',
      prompt_version: 'display-1',
      source: { ocr_token_ids: ['t1', 't2'] },
    });
    const [attempt] = await runs(id);
    expect(attempt).toMatchObject({ outcome: 'ok', reading_kind: 'display', ocr_provider: 'fake', model: null, prompt_version: null, llm_usage: null });
    expect((attempt!.ocr_result as { tokens: unknown[] }).tokens).toHaveLength(3);
    expect(suggestion!.source.reading_run_id).toBe(attempt!.id);
  }, 60_000);

  it('typed first: the suggestion is a replace and the typed cell is never written by the job', async () => {
    const { relatorioId, blocks } = await relatorio();
    const chave = blocks.find((b) => b.block_type === 'chave_seccionadora')!;
    const typed = { raw: '14.7', unit: GOHM, state: 'measured' };
    await apply([draft('put', 'relatorio', relatorioId, sheetTestCellPath(chave.id, 'isolacao', 1, 0), typed)]);
    const id = await photo(relatorioId, chave.id, await shot('display-isolacao'), displayCellTarget(chave.id, chave.block_type, 'isolacao', { row: 1, col: 0 }));
    await run(id);
    const [suggestion] = await suggestionsOf(id);
    expect(suggestion).toMatchObject({ mode: 'replace', value: { raw: '147', unit: GOHM } });
    const block = await row<BlockRow>('block', chave.id);
    expect(block!.sheet.test.isolacao!.cells['1']!['0']!.value).toEqual(typed);
  }, 60_000);

  it('the contact resistance: the micro-ohmmeter read at low confidence is verify, in µΩ', async () => {
    const { relatorioId, blocks } = await relatorio();
    const chave = blocks.find((b) => b.block_type === 'chave_seccionadora')!;
    const id = await photo(relatorioId, chave.id, await shot('display-microhmimetro'), displayCellTarget(chave.id, chave.block_type, 'resistencia_contato', { row: 2, col: 0 }));
    await run(id);
    expect((await suggestionsOf(id)).map((s) => [s.target_path, s.value, s.trust])).toEqual([
      [sheetTestCellPath(chave.id, 'resistencia_contato', 2, 0), { raw: '87', unit: 'µΩ', state: 'measured' }, 'verify'],
    ]);
  }, 60_000);

  it('a transformer tester showing 30 s / 1 min / 10 min: only 1 MINUTO is suggested', async () => {
    const { relatorioId, blocks } = await relatorio();
    const transformer = blocks.find((b) => b.block_type === 'transformador_forca')!;
    const id = await photo(relatorioId, transformer.id, await shot('display-tres-valores'), displayCellTarget(transformer.id, transformer.block_type, 'isolacao', { row: 0, col: 1 }));
    await run(id);
    expect(await status(id)).toBe('done');
    expect((await suggestionsOf(id)).map((s) => [s.target_path, s.value])).toEqual([[sheetTestCellPath(transformer.id, 'isolacao', 0, 1), { raw: '1.45', unit: GOHM, state: 'measured' }]]);
  }, 60_000);

  it('the thermo-hygrometer of a cabine: temperature and humidity on the cabine environment', async () => {
    const { relatorioId, cabineId } = await relatorio();
    const id = await photo(relatorioId, null, await shot('display-termo'), displayEnvTarget(cabineId));
    await run(id);
    expect(await status(id)).toBe('done');
    expect((await suggestionsOf(id)).map((s) => [s.target_path, s.value, s.trust])).toEqual([
      [`location/${cabineId}/env/temperature_c`, { raw: '23.4', unit: '°C', state: 'measured' }, 'verify'],
      [`location/${cabineId}/env/humidity_pct`, { raw: '58', unit: '%', state: 'measured' }, 'suggested'],
    ]);
  }, 60_000);

  it('no value read: done with no suggestion', async () => {
    const { relatorioId, blocks } = await relatorio();
    const chave = blocks.find((b) => b.block_type === 'chave_seccionadora')!;
    const bytes = new Uint8Array(await sharp({ create: { width: 120, height: 90, channels: 3, background: { r: 3, g: 91, b: 7 } } }).jpeg().toBuffer());
    writeFileSync(
      join(fixturesDir, `${sha256(bytes)}.json`),
      JSON.stringify({ ocr: { image: { width: 120, height: 90 }, tokens: [{ id: 't0', text: '12/03/2026', bbox: [5, 5, 60, 20], confidence: 0.99 }], preprocessing_applied: false } }),
    );
    const id = await photo(relatorioId, chave.id, bytes, displayCellTarget(chave.id, chave.block_type, 'isolacao', { row: 0, col: 0 }));
    await run(id);
    expect(await status(id)).toBe('done');
    expect(await suggestionsOf(id)).toEqual([]);
  }, 60_000);

  describe('permanent failures: one run row, failed, no suggestion', () => {
    async function expectPermanent(id: string, reason: string, kind: 'display' | 'panel' = 'display'): Promise<void> {
      await run(id, kind);
      const rows = await runs(id);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.error).toContain('PermanentReadingError');
      expect(rows[0]!.error).toContain(reason);
      expect(await status(id)).toBe('failed');
      expect(await suggestionsOf(id)).toEqual([]);
    }

    it('a target that does not parse', async () => {
      const { relatorioId, blocks } = await relatorio();
      const chave = blocks.find((b) => b.block_type === 'chave_seccionadora')!;
      await expectPermanent(await photo(relatorioId, chave.id, await shot('display-isolacao'), { block_id: chave.id }), 'no display reading target');
    }, 60_000);

    it('a removed block, and a test the block does not have', async () => {
      const { relatorioId, blocks } = await relatorio();
      const [chave, other] = blocks.filter((b) => b.block_type === 'chave_seccionadora');
      const gone = await photo(relatorioId, chave!.id, await shot('display-isolacao'), displayCellTarget(chave!.id, chave!.block_type, 'isolacao', { row: 0, col: 0 }));
      await apply([draft('put', 'relatorio', relatorioId, `block/${chave!.id}/removed_at`, '2026-09-28T11:00:00.000Z')]);
      await expectPermanent(gone, 'target block was removed');
      const noTest = await photo(relatorioId, other!.id, await shot('display-ttr'), displayCellTarget(other!.id, other!.block_type, 'relacao_transformacao', { row: 0, col: 3 }));
      await expectPermanent(noTest, 'target test is not on the block');
    }, 60_000);

    it('a cabine of another relatório, and a removed cabine', async () => {
      const own = await relatorio();
      const other = await relatorio();
      await expectPermanent(await photo(own.relatorioId, null, await shot('display-termo'), displayEnvTarget(other.cabineId)), 'not the photo relatorio cabine');
      const gone = await photo(own.relatorioId, null, await shot('display-termo'), displayEnvTarget(own.cabineId));
      await apply([draft('put', 'relatorio', own.relatorioId, `location/${own.cabineId}/removed_at`, '2026-09-28T11:00:00.000Z')]);
      await expectPermanent(gone, 'target cabine was removed');
    }, 60_000);

    // Since Stories 9.2, 9.3 and 9.5 every reading kind has a handler: no kind is "not read yet".
  });
});
