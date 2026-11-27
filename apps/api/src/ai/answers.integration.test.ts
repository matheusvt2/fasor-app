import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  aiWriteOutcomePath,
  aiWritePath,
  audioQualityOf,
  blockDefinitionIn,
  confirmSuggestionOps,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  discardSuggestionOp,
  displayCellTarget,
  EMPTY_DEFINITION_CONTEXT,
  evaluateTest,
  instantiateTemplate,
  makeOp,
  objectKey,
  plateReadingTarget,
  sheetChecklistPath,
  sheetNameplatePath,
  sheetObservationsPath,
  snapshotDefinitionContext,
  standardTemplate,
  suggestionRowSchema,
  type AudioTarget,
  type BlockRow,
  type Op,
  type OpDraft,
  type SuggestionRow,
  type SystemRoleId,
} from '@app/domain';
import { and, asc, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId, type CompanyId } from '../db/repositories/company-id.ts';
import { roleOfUser } from '../db/roles.ts';
import { seedRoleActor } from '../db/roles.test-support.ts';
import { aiAnswers, entities, readingRuns, transcriptionRuns } from '../db/schema.ts';
import { dropCompany } from '../db/test-cleanup.ts';
import { createAiWriteRoutes } from '../http/ai-write.ts';
import { createAiWriteOutcomeRoutes } from '../http/ai-write-outcome.ts';
import { ForbiddenError, type AppEnv } from '../http/session.ts';
import { newId } from '../ids.ts';
import { runAuditJob } from '../jobs/audit/job.ts';
import { AUDIT_ACTOR } from '../jobs/audit/payload.ts';
import { runReadingJob, type ReadingJobDeps } from '../jobs/reading/job.ts';
import { DEFAULT_FIXTURES_DIR } from '../jobs/reading/providers/fake.ts';
import { createReadingProviders } from '../jobs/reading/providers/index.ts';
import { runTranscriptionJob, type TranscriptionJobDeps } from '../jobs/transcription/job.ts';
import { DEFAULT_SPEECH_FIXTURE, fakeSpeechProvider, type SpeechFixture } from '../jobs/transcription/providers/speech-fake.ts';
import { DEFAULT_WRITING_FIXTURE, fakeWritingProvider } from '../jobs/transcription/providers/writing-fake.ts';
import { TRANSCRIPTION_ACTOR } from '../jobs/transcription/status.ts';
import { createS3, putObject } from '../storage/s3.ts';
import { renderVariants } from '../storage/variants.ts';
import { applyOps, applyServerBatch } from '../sync/apply.ts';
import { serverOp } from '../sync/server-op.ts';
import { toSnapshot } from '../sync/snapshot.ts';

/*
 * Story 32.1 (Matheus, 2026-11-27): every AI use writes its answer records with its run row, and the
 * ops a device or the server applies settle them, against the compose Postgres and MinIO on two
 * throwaway companies with the `fake` providers (the plate on a fixture of its own, the display on
 * the committed one, the audio and the AI control on copies of the committed fixtures, the audit on a
 * stand-in that answers one finding it may cite and one it may not). Each job runs directly, one
 * attempt; the device is `applyOps` as the push route calls it, or the routes in process.
 */

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const bucket = config.S3_BUCKET;

const companyId = newId();
const company = asCompanyId(companyId);
const otherCompanyId = newId();
const otherCompany = asCompanyId(otherCompanyId);
const ADMIN = newId();
const CONSULTA = newId();
const OTHER_ADMIN = newId();
const DEVICE = 'tablet-ai-answers';

const fixturesDir = mkdtempSync(join(tmpdir(), 'ai-answers-fixtures-'));
const speechPath = join(fixturesDir, 'speech.json');

const readingDeps: ReadingJobDeps = {
  db,
  s3,
  bucket,
  now,
  newId,
  providers: createReadingProviders({ OCR_PROVIDER: 'fake', LLM_PROVIDER: 'fake', OCR_SERVICE_URL: 'http://127.0.0.1:9' }, { fixturesDir }),
};

const transcriptionDeps: TranscriptionJobDeps = {
  db,
  s3,
  bucket,
  now,
  newId,
  speech: fakeSpeechProvider(speechPath),
  writing: fakeWritingProvider(DEFAULT_WRITING_FIXTURE),
  writingName: 'fake',
};

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Device ops of `actor`, stamped at `at` (now unless an offline device's older instant is asked for), one batch each call. */
async function push(actor: string, drafts: readonly OpDraft[], options: { at?: Date; batch?: boolean; companyOf?: CompanyId } = {}): Promise<Op[]> {
  const batchId = options.batch === false ? null : newId();
  const ops = drafts.map((draft) => makeOp({ ...draft, batch_id: batchId, device_id: DEVICE }, { newId, now: options.at ?? now() }));
  const result = await applyOps(db, options.companyOf ?? company, ops, { origin: 'client', actorId: actor, now });
  expect(result.rejected).toEqual([]);
  return ops;
}

function relatorioDraft(relatorioId: string, kind: 'create' | 'put', path: string, value: unknown, meta: OpDraft['meta'] = null, actor = ADMIN): OpDraft {
  return { kind, scope: 'relatorio', company_id: companyId, project_id: null, relatorio_id: relatorioId, path, value: value as never, prev_op_id: null, batch_id: null, meta, actor_id: actor };
}

interface Relatorio {
  relatorioId: string;
  blocks: BlockRow[];
}

/** A standard-template relatório, its ops stamped two hours ago (so an offline device's op of an hour ago is after its creation). */
async function relatorio(seedVersion?: string, companyOf: CompanyId = company, actor = ADMIN): Promise<Relatorio> {
  const projectId = newId();
  const built = instantiateTemplate(
    standardTemplate({ id: newId(), ...(seedVersion === undefined ? {} : { seedVersion }) }),
    { id: projectId },
    { service_start: '2026-11-20', service_end: '2026-11-21', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId, actorId: actor, companyId: companyOf },
  );
  const project: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: companyOf,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra IA', site: null, removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: actor,
  };
  const at = new Date(Date.now() - 2 * 3_600_000);
  const result = await applyOps(db, companyOf, [project, ...built.drafts].map((draft) => makeOp({ ...draft, device_id: DEVICE }, { newId, now: at })), { now, origin: 'client', actorId: actor });
  expect(result.rejected).toEqual([]);
  const blocks = built.drafts.map((draft) => draft.value as Record<string, unknown>).filter((row): row is BlockRow => row !== null && typeof row === 'object' && 'block_type' in row && 'sheet' in row) as BlockRow[];
  return { relatorioId: built.relatorioId, blocks };
}

/** The seed the reading suites read their synthetic plates on (`jobs/reading/job.integration.test.ts`). */
const PLATE_SEED = 'v12';

const block = (r: Relatorio, type: string) => r.blocks.find((row) => row.block_type === type && row.equipment_id !== null)!;

async function records(relatorioId: string, use?: string) {
  const rows = await db.select().from(aiAnswers).where(and(eq(aiAnswers.company_id, companyId), eq(aiAnswers.relatorio_id, relatorioId))).orderBy(asc(aiAnswers.created_at), asc(aiAnswers.id));
  return use === undefined ? rows : rows.filter((row) => row.use === use);
}

async function suggestionsOf(relatorioId: string): Promise<SuggestionRow[]> {
  const found = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.company_id, companyId), eq(entities.entity, 'suggestion'), eq(entities.relatorio_id, relatorioId)));
  return found.map((r) => suggestionRowSchema.parse(r.row));
}

/** The relatório's revision, emitted as the generate job writes it (one server batch). */
async function emit(relatorioId: string): Promise<void> {
  const id = newId();
  const at = now().toISOString();
  await applyServerBatch(
    db,
    company,
    [
      serverOp({
        opId: newId(),
        companyId,
        actorId: 'system:generate',
        clientTs: at,
        kind: 'create',
        path: `revision/${id}`,
        value: { id, relatorio_id: relatorioId, number: 1, snapshot_seq: 0, created_by: ADMIN, docx_file_id: newId(), pdf_file_id: newId(), created_at: at },
        relatorioId,
      }),
    ],
    { now },
  );
}

// --- photos -------------------------------------------------------------------------------------

async function solidPng(r: number, g: number, b: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width: 200, height: 100, channels: 3, background: { r, g, b } } }).png().toBuffer());
}

/** A photo of `relatorioId` with its reading queued, its create applied and its objects stored. */
async function photo(relatorioId: string, bytes: Uint8Array, mime: 'image/png' | 'image/jpeg', reading: { block_id: string | null; reading_kind: 'plate' | 'display'; reading_target: unknown }): Promise<string> {
  const id = newId();
  await push(ADMIN, [
    relatorioDraft(relatorioId, 'create', `file/${id}`, {
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
      captured_at: '2026-11-27T10:00:00.000Z',
      tz_offset: -180,
      coords: null,
      local_seq: 1,
      item_key: null,
      caption: null,
      ...reading,
      reading_status: 'queued',
    }),
  ]);
  await putObject(s3, bucket, objectKey(companyId, 'photo', id, 'original', relatorioId), bytes, mime);
  const variants = (await renderVariants(bytes, mime))!;
  await putObject(s3, bucket, objectKey(companyId, 'photo', id, 'print', relatorioId), variants.print.bytes, variants.print.contentType);
  await putObject(s3, bucket, objectKey(companyId, 'photo', id, 'thumb', relatorioId), variants.thumb.bytes, variants.thumb.contentType);
  return id;
}

const read = (photoId: string, kind: 'plate' | 'display') => runReadingJob(readingDeps, { company_id: companyId, photo_id: photoId, reading_kind: kind }, { jobId: 'direct', attempt: 1, lastAttempt: true });

/** A chave seccionadora plate the fake reads as a manufacturer and a voltage (the voltage normalized from "23 kV" to "23"). */
function chavePlate(bytes: Uint8Array): void {
  writeFileSync(
    join(fixturesDir, `${sha256(bytes)}.json`),
    JSON.stringify({
      ocr: {
        image: { width: 200, height: 100 },
        tokens: [
          { id: 't0', text: 'FABRICAÇÃO', bbox: [5, 5, 60, 20], confidence: 0.99 },
          { id: 't1', text: 'Novafab', bbox: [100, 5, 160, 20], confidence: 0.99 },
          { id: 't2', text: 'TENSÃO', bbox: [5, 40, 50, 55], confidence: 0.99 },
          { id: 't3', text: '23', bbox: [100, 40, 120, 55], confidence: 0.99 },
          { id: 't4', text: 'kV', bbox: [125, 40, 140, 55], confidence: 0.99 },
        ],
        preprocessing_applied: false,
      },
      structuring: {
        values: [
          { key: 'fabricacao', value: 'NOVAFAB', ocr_token_ids: ['t1'], confidence: 0.9 },
          { key: 'tensao_de_placa', value: '23 kV', ocr_token_ids: ['t3', 't4'], confidence: 0.7 },
        ],
      },
    }),
  );
}

// --- audio --------------------------------------------------------------------------------------

const GOOD = audioQualityOf({ level: 0.2, clipped_share: 0, noise_ratio: 0.1, duration_ms: 4000, speech_ms: 3000 });

function hears(bytes: Uint8Array, text: string): void {
  const fixture = JSON.parse(readFileSync(speechPath, 'utf8')) as SpeechFixture;
  fixture.by_sha256[sha256(bytes)] = { text };
  writeFileSync(speechPath, JSON.stringify(fixture));
}

/** An audio of `target` the device recorded and the server stored (its create pushed, its upload recorded as the file route does). */
async function audio(relatorioId: string, target: AudioTarget, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(`synthetic-audio-${newId()}`);
  hears(bytes, text);
  const id = newId();
  await push(ADMIN, [
    relatorioDraft(relatorioId, 'create', `file/${id}`, {
      id,
      company_id: companyId,
      relatorio_id: relatorioId,
      kind: 'audio',
      sha256: sha256(bytes),
      mime: 'audio/webm',
      size: bytes.byteLength,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      audio_target: target,
      audio_status: 'queued',
      quality: GOOD,
      transcript_heard: null,
      transcript_written: null,
      transcription_run_id: null,
    }),
  ]);
  await putObject(s3, bucket, objectKey(companyId, 'audio', id, 'original', relatorioId), bytes, 'audio/webm');
  const at = now().toISOString();
  await applyOps(db, company, [serverOp({ opId: newId(), companyId, actorId: TRANSCRIPTION_ACTOR, clientTs: at, kind: 'put', path: `file/${id}/uploaded_at`, value: at, relatorioId })], { now, origin: 'server' });
  return id;
}

const transcribe = (audioId: string) => runTranscriptionJob(transcriptionDeps, { company_id: companyId, audio_id: audioId }, { jobId: 'direct', attempt: 1, lastAttempt: true });

async function blockRow(id: string): Promise<BlockRow> {
  const [found] = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.company_id, companyId), eq(entities.entity, 'block'), eq(entities.id, id)));
  return found!.row as BlockRow;
}

// --- the AI control -----------------------------------------------------------------------------

let session: { userId: string; companyId: CompanyId };

const app = new Hono<AppEnv>();
app.use('*', async (c, next) => {
  const { role } = await roleOfUser(db, session.companyId, session.userId);
  c.set('session', { userId: session.userId, companyId: session.companyId, role, status: 'active' });
  await next();
});
app.onError((error, c) => {
  if (error instanceof ForbiddenError) return c.json({ code: 'forbidden', message: error.message }, 403);
  throw error;
});
app.route('/', createAiWriteRoutes(db, { now, newId, writing: { name: 'fake', provider: fakeWritingProvider(DEFAULT_WRITING_FIXTURE) } }));
app.route('/', createAiWriteOutcomeRoutes(db, { now }));

function as(userId: string, companyOf: CompanyId = company): void {
  session = { userId, companyId: companyOf };
}

async function post(path: string, body: unknown): Promise<Response> {
  return app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) }, body: JSON.stringify(body) });
}

/** The latest AI control run of the company: its id is the record's `run_id` (the answer's `run_id` once Story 31.10 adds it). */
async function lastAiWriteRun() {
  const [row] = await db.select().from(transcriptionRuns).where(and(eq(transcriptionRuns.company_id, companyId), eq(transcriptionRuns.kind, 'ai_write'))).orderBy(desc(transcriptionRuns.created_at)).limit(1);
  return row!;
}

beforeAll(async () => {
  for (const name of readdirSync(DEFAULT_FIXTURES_DIR).filter((file) => file.endsWith('.json'))) copyFileSync(join(DEFAULT_FIXTURES_DIR, name), join(fixturesDir, name));
  copyFileSync(DEFAULT_SPEECH_FIXTURE, speechPath);
  const roles: [string, CompanyId, SystemRoleId][] = [
    [ADMIN, company, 'admin'],
    [CONSULTA, company, 'consulta'],
    [OTHER_ADMIN, otherCompany, 'admin'],
  ];
  for (const [user, companyOf, role] of roles) await seedRoleActor(db, companyOf, user, role);
}, 60_000);

afterAll(async () => {
  await dropCompany(db, companyId);
  await dropCompany(db, otherCompanyId);
  rmSync(fixturesDir, { recursive: true, force: true });
  await sql.end();
}, 60_000);

describe('32.1-API-001 a plate reading: one record per field, settled by the device, closed by the emission', () => {
  it('the job writes a record per value read, per value dropped and per field left empty, with its run row; the confirm, the discard and a typed field settle them; the emission closes the rest', async () => {
    const r = await relatorio(PLATE_SEED);
    const chave = block(r, 'chave_seccionadora');
    const bytes = await solidPng(32, 1, 1);
    chavePlate(bytes);
    const photoId = await photo(r.relatorioId, bytes, 'image/png', { block_id: chave.id, reading_kind: 'plate', reading_target: plateReadingTarget(chave.id, chave.block_type) });
    await read(photoId, 'plate');

    const [run] = await db.select().from(readingRuns).where(and(eq(readingRuns.company_id, companyId), eq(readingRuns.photo_id, photoId)));
    expect(run).toMatchObject({ outcome: 'ok' });
    const suggestions = await suggestionsOf(r.relatorioId);
    const maker = suggestions.find((s) => s.target_path === sheetNameplatePath(chave.id, 'fabricacao'))!;
    const voltage = suggestions.find((s) => s.target_path === sheetNameplatePath(chave.id, 'tensao_de_placa'))!;
    const all = await records(r.relatorioId, 'plate');
    expect(all.every((row) => row.run_id === run!.id && row.run_table === 'reading_runs' && row.input_file_id === photoId && row.input_text === null && row.model === 'fake' && row.prompt_version === 'fake-1')).toBe(true);
    const byKey = new Map(all.map((row) => [row.item_key, row]));
    expect(byKey.get('fabricacao')).toMatchObject({ suggestion_id: maker.id, answer: 'NOVAFAB', shown: maker.value, confidence: 0.9, outcome: null });
    expect(byKey.get('tensao_de_placa')).toMatchObject({ suggestion_id: voltage.id, answer: '23 kV', shown: voltage.value, shown_reason: 'normalized', confidence: 0.7 });
    // Every other field of the plate was asked for and left empty: open, no suggestion.
    const empty = all.filter((row) => row.shown_reason === 'empty');
    expect(empty.length).toBeGreaterThan(0);
    expect(empty.every((row) => row.suggestion_id === null && row.answer === null && row.outcome === null && row.target_path === sheetNameplatePath(chave.id, row.item_key!))).toBe(true);

    // The maker confirmed with an edit, offline an hour ago and pushed now: changed, at the op's own time.
    const offline = new Date(Date.now() - 3_600_000);
    await push(ADMIN, confirmSuggestionOps({ id: ADMIN, companyId }, maker, { value: 'Novafab Ltda' }), { at: offline });
    // The voltage discarded.
    await push(ADMIN, [discardSuggestionOp({ id: ADMIN, companyId }, voltage)]);
    // A text field the model left empty, typed by the user.
    const snapshot = await toSnapshot(db, company, r.relatorioId);
    const definition = blockDefinitionIn(snapshotDefinitionContext(snapshot), snapshot.blocks.find((row) => row.id === chave.id)!)!;
    const textKeys = new Set(definition.nameplate.filter((field) => field.kind === 'text').map((field) => field.key));
    const filled = empty.find((row) => textKeys.has(row.item_key!))!;
    expect(filled).toBeDefined();
    await push(ADMIN, [relatorioDraft(r.relatorioId, 'put', filled.target_path!, 'TYPED-001')]);

    const after = new Map((await records(r.relatorioId, 'plate')).map((row) => [row.item_key, row]));
    expect(after.get('fabricacao')).toMatchObject({ outcome: 'changed', action: 'edit', final_value: 'Novafab Ltda', settled_by: ADMIN, settled_at: offline.toISOString(), closed_at: null });
    expect(after.get('tensao_de_placa')).toMatchObject({ outcome: 'refused', action: 'discard', final_value: null, settled_by: ADMIN });
    expect(after.get(filled.item_key)).toMatchObject({ outcome: 'changed', action: 'edit', final_value: 'TYPED-001' });

    // A later edit of the confirmed field moves its final value; the emission closes everything.
    await push(ADMIN, [relatorioDraft(r.relatorioId, 'put', maker.target_path, 'Novafab S.A.')]);
    await emit(r.relatorioId);
    const closed = await records(r.relatorioId, 'plate');
    expect(closed.every((row) => row.closed_at !== null)).toBe(true);
    const final = new Map(closed.map((row) => [row.item_key, row]));
    expect(final.get('fabricacao')).toMatchObject({ outcome: 'changed', final_value: 'Novafab S.A.' });
    expect(closed.filter((row) => row.shown_reason === 'empty' && row.item_key !== filled.item_key).every((row) => row.outcome === 'unanswered')).toBe(true);
  }, 60_000);

  it('a second reading of the photo closes the first one\'s open records as superseded, and the confirm of a new one keeps it', async () => {
    const r = await relatorio(PLATE_SEED);
    const chave = block(r, 'chave_seccionadora');
    const bytes = await solidPng(32, 2, 2);
    chavePlate(bytes);
    const photoId = await photo(r.relatorioId, bytes, 'image/png', { block_id: chave.id, reading_kind: 'plate', reading_target: plateReadingTarget(chave.id, chave.block_type) });
    await read(photoId, 'plate');
    const first = (await records(r.relatorioId, 'plate')).filter((row) => row.suggestion_id !== null);
    await read(photoId, 'plate');
    const again = await records(r.relatorioId, 'plate');
    for (const old of first) expect(again.find((row) => row.id === old.id)).toMatchObject({ outcome: 'unanswered', action: 'superseded', closed_at: expect.any(String) });
    const fresh = (await suggestionsOf(r.relatorioId)).find((s) => s.status === 'pending' && s.target_path === sheetNameplatePath(chave.id, 'fabricacao'))!;
    await push(ADMIN, confirmSuggestionOps({ id: ADMIN, companyId }, fresh));
    expect((await records(r.relatorioId, 'plate')).find((row) => row.suggestion_id === fresh.id)).toMatchObject({ outcome: 'kept', action: 'confirm', final_value: fresh.value });
  }, 60_000);
});

describe('32.1-API-002 "Ler visor": one record per value read', () => {
  it('a display shot: one record, no model, confirmed as read is kept', async () => {
    const r = await relatorio();
    const chave = block(r, 'chave_seccionadora');
    const shot = new Uint8Array(await sharp(readFileSync(join(import.meta.dirname, '../../../../services/ocr/tests/fixtures/display-isolacao.jpg'))).resize({ width: 1000 }).jpeg({ quality: 82 }).toBuffer());
    const photoId = await photo(r.relatorioId, shot, 'image/jpeg', { block_id: chave.id, reading_kind: 'display', reading_target: displayCellTarget(chave.id, chave.block_type, 'isolacao', { row: 0, col: 0 }) });
    await read(photoId, 'display');
    const [record, ...rest] = await records(r.relatorioId, 'display');
    expect(rest).toEqual([]);
    const [suggestion] = await suggestionsOf(r.relatorioId);
    expect(record).toMatchObject({ suggestion_id: suggestion!.id, item_key: 'isolacao:0:0', answer: suggestion!.value, shown: suggestion!.value, model: null, confidence: null, input_file_id: photoId });
    await push(ADMIN, confirmSuggestionOps({ id: ADMIN, companyId }, suggestion!));
    expect((await records(r.relatorioId, 'display'))[0]).toMatchObject({ outcome: 'kept', action: 'confirm', settled_by: ADMIN });
  }, 60_000);
});

describe('32.1-API-003 an audio: the text written into a field and a reading spoken into a table', () => {
  it('a prose field: the record keeps the text as heard and as written and the field text shown; the user\'s edit changes it; another audio\'s text kept untouched at the emission', async () => {
    const r = await relatorio();
    const chave = block(r, 'chave_seccionadora');
    const target: AudioTarget = { type: 'item', block_id: chave.id, item_key: 'contatos' };
    const id = await audio(r.relatorioId, target, 'contato oxidado na fase b');
    await transcribe(id);
    const [run] = await db.select().from(transcriptionRuns).where(and(eq(transcriptionRuns.company_id, companyId), eq(transcriptionRuns.audio_id, id)));
    const path = sheetChecklistPath(chave.id, 'contatos', 'observation');
    const shown = (await blockRow(chave.id)).sheet.checklist.contatos?.observation?.value;
    const [record] = await records(r.relatorioId, 'audio_text');
    expect(record).toMatchObject({ run_id: run!.id, run_table: 'transcription_runs', input_file_id: id, input_text: null, target_path: path, shown, outcome: null });
    expect(record!.answer).toMatchObject({ heard: 'contato oxidado na fase b' });
    await push(ADMIN, [relatorioDraft(r.relatorioId, 'put', path, 'Contato oxidado na fase B, limpar.')]);
    expect((await records(r.relatorioId, 'audio_text'))[0]).toMatchObject({ outcome: 'changed', action: 'edit', final_value: 'Contato oxidado na fase B, limpar.' });

    const untouched = await audio(r.relatorioId, { type: 'sheet_field', block_id: chave.id, field: 'observations' }, 'equipamento em bom estado');
    await transcribe(untouched);
    await emit(r.relatorioId);
    const second = (await records(r.relatorioId, 'audio_text')).find((row) => row.target_path === sheetObservationsPath(chave.id))!;
    expect(second).toMatchObject({ outcome: 'kept', action: 'untouched', closed_at: expect.any(String) });
  }, 60_000);

  it('a measurement table: one record per spoken reading, settled by its Suggestion\'s confirm', async () => {
    const r = await relatorio();
    const chave = block(r, 'chave_seccionadora');
    const snapshot = await toSnapshot(db, company, r.relatorioId);
    const stored = snapshot.blocks.find((row) => row.id === chave.id)!;
    const definition = blockDefinitionIn(snapshotDefinitionContext(snapshot), stored)!;
    const evaluated = evaluateTest(stored, definition, definition.tests.find((one) => one.key === 'isolacao')!).tables[0]!;
    const label = evaluated.rows.find((one) => evaluated.rows.filter((other) => other.label === one.label).length === 1)!.label;
    const id = await audio(r.relatorioId, { type: 'table', block_id: chave.id, test_key: 'isolacao', table_key: evaluated.key }, `${label}, 147 giga`);
    await transcribe(id);
    const [suggestion] = (await suggestionsOf(r.relatorioId)).filter((s) => 'audio_id' in s.source);
    const [record, ...rest] = await records(r.relatorioId, 'audio_reading');
    expect(rest).toEqual([]);
    expect(record).toMatchObject({ suggestion_id: suggestion!.id, answer: `${label}, 147 giga`, shown: suggestion!.value, input_file_id: id });
    await push(ADMIN, confirmSuggestionOps({ id: ADMIN, companyId }, suggestion!));
    expect((await records(r.relatorioId, 'audio_reading'))[0]).toMatchObject({ outcome: 'kept', action: 'confirm' });
  }, 60_000);
});

describe('32.1-API-004 the AI control: the proposal, "Usar", "Desfazer", the device\'s report and the guard', () => {
  let r: Relatorio;
  let chave: BlockRow;
  const item = (key: string): AudioTarget => ({ type: 'item', block_id: chave.id, item_key: key });

  async function observe(key: string, text: string): Promise<string> {
    const [op] = await push(ADMIN, [relatorioDraft(r.relatorioId, 'put', sheetChecklistPath(chave.id, key, 'observation'), text)]);
    return op!.op_id;
  }

  async function tap(key: string, text: string): Promise<{ answer: { outcome: string; text?: string }; runId: string }> {
    const lastOpId = await observe(key, text);
    as(ADMIN);
    const res = await post(aiWritePath(r.relatorioId), { target: item(key), last_op_id: lastOpId });
    expect(res.status).toBe(200);
    return { answer: (await res.json()) as { outcome: string; text?: string }, runId: (await lastAiWriteRun()).id };
  }

  const recordOf = async (runId: string) => (await records(r.relatorioId, 'ai_write')).find((row) => row.run_id === runId)!;

  beforeAll(async () => {
    r = await relatorio();
    chave = block(r, 'chave_seccionadora');
  }, 60_000);

  it('a proposal is recorded with its run row; "Usar o texto da IA" (meta.ai_run_id) keeps it; "Desfazer" refuses it', async () => {
    const { answer, runId } = await tap('contatos', 'contato fase b aquecido oxidado');
    expect(answer.outcome).toBe('written');
    expect(await recordOf(runId)).toMatchObject({ use: 'ai_write', input_text: 'contato fase b aquecido oxidado', answer: answer.text, shown: answer.text, target: item('contatos'), outcome: null });
    const path = sheetChecklistPath(chave.id, 'contatos', 'observation');
    await push(ADMIN, [relatorioDraft(r.relatorioId, 'put', path, answer.text, { ai_written: true, ai_run_id: runId })]);
    expect(await recordOf(runId)).toMatchObject({ outcome: 'kept', action: 'confirm', final_value: answer.text, settled_by: ADMIN });
    await push(ADMIN, [relatorioDraft(r.relatorioId, 'put', path, 'contato fase b aquecido oxidado')]);
    expect(await recordOf(runId)).toMatchObject({ outcome: 'refused', action: 'undo' });
  });

  it('an older device\'s put (no ai_run_id) settles the latest open proposal of the field', async () => {
    const { answer, runId } = await tap('contatos', 'contato fase b aquecido oxidado');
    await push(ADMIN, [relatorioDraft(r.relatorioId, 'put', sheetChecklistPath(chave.id, 'contatos', 'observation'), answer.text, { ai_written: true })]);
    expect(await recordOf(runId)).toMatchObject({ outcome: 'kept' });
  });

  it('POST write-outcome: "Manter o meu texto" refuses the proposal (204); a second report changes nothing; the field\'s key, the body, the run and the company are checked', async () => {
    const { runId } = await tap('contatos', 'contato fase b aquecido oxidado');
    as(CONSULTA);
    expect((await post(aiWriteOutcomePath(r.relatorioId), { run_id: runId, outcome: 'refused', action: 'keep_mine' })).status).toBe(403);
    as(ADMIN);
    expect((await post(aiWriteOutcomePath(r.relatorioId), { run_id: runId, outcome: 'kept', action: 'keep_mine' })).status).toBe(400);
    expect((await post(aiWriteOutcomePath(r.relatorioId), { run_id: newId(), outcome: 'refused', action: 'keep_mine' })).status).toBe(404);
    as(OTHER_ADMIN, otherCompany);
    expect((await post(aiWriteOutcomePath(r.relatorioId), { run_id: runId, outcome: 'refused', action: 'keep_mine' })).status).toBe(404);
    as(ADMIN);
    expect((await post(aiWriteOutcomePath(r.relatorioId), { run_id: runId, outcome: 'refused', action: 'keep_mine' })).status).toBe(204);
    expect(await recordOf(runId)).toMatchObject({ outcome: 'refused', action: 'keep_mine', settled_by: ADMIN });
    expect((await post(aiWriteOutcomePath(r.relatorioId), { run_id: runId, outcome: 'refused', action: 'text_changed' })).status).toBe(204);
    expect(await recordOf(runId)).toMatchObject({ action: 'keep_mine' });
  });

  it('a guard refusal is recorded withheld with the model\'s text and the reasons; a proposal nobody answered closes unanswered at the emission', async () => {
    const refused = await tap('intertravamento_mecanico', 'folga no acionamento do mecanismo');
    expect(refused.answer.outcome).toBe('refused');
    const record = await recordOf(refused.runId);
    expect(record).toMatchObject({ shown: null, shown_reason: 'guard: added number 3', outcome: 'refused', action: 'withheld', closed_at: expect.any(String) });
    expect(typeof record.answer).toBe('string');
    const open = await tap('contatos', 'contato fase b aquecido oxidado');
    await emit(r.relatorioId);
    expect(await recordOf(open.runId)).toMatchObject({ outcome: 'unanswered', closed_at: expect.any(String) });
  });
});

describe('32.1-API-005 Conferência por IA: a finding is acted on when the field it names changes', () => {
  it('one record per finding kept or dropped, with the audit text as input; an edit of the cited sheet settles it; the emission closes it', async () => {
    const r = await relatorio();
    const runId = newId();
    const at = now().toISOString();
    await applyServerBatch(
      db,
      company,
      [
        serverOp({
          opId: newId(),
          companyId,
          actorId: AUDIT_ACTOR,
          clientTs: at,
          kind: 'create',
          path: `audit_run/${runId}`,
          value: { id: runId, relatorio_id: r.relatorioId, status: 'queued', findings: [], error: null, prompt_version: null, created_at: at, started_at: null, finished_at: null, coverage: null },
          relatorioId: r.relatorioId,
        }),
      ],
      { now },
    );
    let cited = '';
    const status = await runAuditJob(
      {
        db,
        now,
        newId,
        provider: {
          audit: async ({ refs }) => {
            cited = refs.find((ref) => ref.id.startsWith('sheet:'))!.id;
            return {
              findings: [
                { kind: 'conclusion_vs_nc', ref: cited, text: 'A conclusão contradiz um item NC.' },
                { kind: 'not_a_kind', ref: cited, text: 'x' },
              ],
              model: 'stand-in',
              prompt_version: 'audit-stand-in',
              usage: { input_tokens: 10, output_tokens: 5, usd: 0.0001 },
            };
          },
        },
      },
      { run_id: runId, company_id: companyId, relatorio_id: r.relatorioId, actor_id: ADMIN },
    );
    expect(status).toBe('done');
    const findings = await records(r.relatorioId, 'audit_finding');
    expect(findings.map((row) => [row.item_key, row.shown_reason, row.outcome])).toEqual([
      ['conclusion_vs_nc', null, null],
      ['not_a_kind', 'dropped: unknown_kind', 'refused'],
    ]);
    expect(findings.every((row) => row.run_id === runId && row.run_table === 'audit_run' && typeof row.input_text === 'string' && row.input_text.length > 0 && row.model === 'stand-in' && row.run_usd === 0.0001)).toBe(true);
    const blockId = cited.slice('sheet:'.length);
    await push(ADMIN, [relatorioDraft(r.relatorioId, 'put', sheetObservationsPath(blockId), 'Conclusão revista.')]);
    expect((await records(r.relatorioId, 'audit_finding'))[0]).toMatchObject({ outcome: 'changed', action: 'field_changed', settled_by: ADMIN });
    await emit(r.relatorioId);
    expect((await records(r.relatorioId, 'audit_finding'))[0]).toMatchObject({ outcome: 'changed', closed_at: expect.any(String) });
  }, 60_000);
});
