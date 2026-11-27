import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  audioFileRowSchema,
  audioQualityOf,
  audioRetranscribePath,
  blockDefinitionIn,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  EMPTY_DEFINITION_CONTEXT,
  evaluateTest,
  instantiateTemplate,
  makeOp,
  snapshotDefinitionContext,
  standardTemplate,
  suggestionRowSchema,
  syncPushResponseSchema,
  type AudioFileRow,
  type AudioTarget,
  type BlockRow,
  type Op,
  type OpDraft,
  type SuggestionRow,
  type SystemRoleId,
  type WritingInput,
} from '@app/domain';
import { and, asc, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { now } from '../../clock.ts';
import { loadConfig } from '../../config.ts';
import { createDb } from '../../db/client.ts';
import { asCompanyId, type CompanyId } from '../../db/repositories/company-id.ts';
import { roleOfUser } from '../../db/roles.ts';
import { seedRoleActor } from '../../db/roles.test-support.ts';
import { entities, ops, transcriptionRuns } from '../../db/schema.ts';
import { dropCompany } from '../../db/test-cleanup.ts';
import { createAudioRoutes } from '../../http/audios.ts';
import { createFileRoutes } from '../../http/files.ts';
import { ForbiddenError, type AppEnv } from '../../http/session.ts';
import { newId } from '../../ids.ts';
import { createS3 } from '../../storage/s3.ts';
import { applyOps } from '../../sync/apply.ts';
import { createSyncRoutes } from '../../sync/routes.ts';
import { toSnapshot } from '../../sync/snapshot.ts';
import { runTranscriptionJob, type TranscriptionJobDeps } from './job.ts';
import type { TranscriptionPayload } from './payload.ts';
import { createSpeechProvider } from './providers/index.ts';
import { DEFAULT_SPEECH_FIXTURE, fakeSpeechProvider, type SpeechFixture } from './providers/speech-fake.ts';
import { DEFAULT_WRITING_FIXTURE, fakeWritingProvider, type WritingFixture } from './providers/writing-fake.ts';
import { TRANSCRIPTION_ACTOR } from './status.ts';
import { enqueueTranscription, registerTranscriptionWorker, transcriptionDeadLetterQueue, type TranscriptionQueueOptions } from './worker.ts';

/*
 * Story 31.2 (AD-30): the transcription job against the compose Postgres and MinIO, on two
 * throwaway companies, with the fake speech and writing providers on a temporary copy of the
 * committed fixtures. The device side is the real routes in process (the push, the file upload and
 * the retranscribe route) behind a stand-in session; the job runs directly, attempt by attempt, or
 * through a pg-boss queue of its own for the singleton and the three attempts.
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
const FIELD = newId();
const CONSULTA = newId();
const OTHER_ADMIN = newId();
const DEVICE = 'tablet-transcription';

const fixturesDir = mkdtempSync(join(tmpdir(), 'transcription-fixtures-'));
const speechPath = join(fixturesDir, 'speech.json');
const writingPath = join(fixturesDir, 'writing.json');
const writingCalls: WritingInput[] = [];
const fakeWriting = fakeWritingProvider(writingPath);

const deps: TranscriptionJobDeps = {
  db,
  s3,
  bucket,
  now,
  newId,
  speech: fakeSpeechProvider(speechPath),
  writing: {
    write: (input) => {
      writingCalls.push(input);
      return fakeWriting.write(input);
    },
  },
  writingName: 'fake',
};

const GOOD = audioQualityOf({ level: 0.2, clipped_share: 0, noise_ratio: 0.1, duration_ms: 4000, speech_ms: 3000 });

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** The text the fake speech step hears for these bytes (`fixtures/speech.json`, by sha256). */
function hears(bytes: Uint8Array, entry: { text: string; audio_seconds?: number } | { error: 'transient' | 'permanent' }): void {
  const fixture = readJson<SpeechFixture>(speechPath);
  fixture.by_sha256[sha256(bytes)] = entry;
  writeFileSync(speechPath, JSON.stringify(fixture));
}

/** What the fake writing step writes for a heard text. */
function writes(entry: WritingFixture['entries'][number]): void {
  const fixture = readJson<WritingFixture>(writingPath);
  fixture.entries.unshift(entry);
  writeFileSync(writingPath, JSON.stringify(fixture));
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const recording = (label: string) => new TextEncoder().encode(`synthetic-audio-${label}-${newId()}`);

/** The stand-in session's user and role, as each request sets them. */
let session: { userId: string; companyId: CompanyId };
const enqueued: TranscriptionPayload[] = [];

function makeApp(options: { aiFeatures?: boolean; retranscribeLimit?: { max: number; windowMs: number } } = {}): Hono<AppEnv> {
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
  const enqueue = async (payload: TranscriptionPayload) => {
    enqueued.push(payload);
  };
  app.route('/', createSyncRoutes(db, { now, newId }));
  app.route('/', createFileRoutes(db, s3, bucket, { now, enqueueTranscription: enqueue, ...(options.aiFeatures === undefined ? {} : { aiFeatures: options.aiFeatures }) }));
  app.route(
    '/',
    createAudioRoutes(db, {
      now,
      newId,
      enqueueTranscription: enqueue,
      ...(options.aiFeatures === undefined ? {} : { aiFeatures: options.aiFeatures }),
      ...(options.retranscribeLimit === undefined ? {} : { limit: options.retranscribeLimit }),
    }),
  );
  return app;
}

const app = makeApp();

function as(userId: string, companyOf: CompanyId = company): void {
  session = { userId, companyId: companyOf };
}

async function request(target: Hono<AppEnv>, path: string, init: RequestInit): Promise<Response> {
  return target.request(path, { ...init, headers: { [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), ...(init.headers as Record<string, string>) } });
}

async function push(userId: string, opsToPush: Op[], companyOf: CompanyId = company) {
  as(userId, companyOf);
  const res = await request(app, '/api/sync/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: opsToPush }) });
  expect(res.status, await res.clone().text()).toBe(200);
  return syncPushResponseSchema.parse(await res.json());
}

interface Relatorio {
  relatorioId: string;
  blocks: BlockRow[];
  tags: Map<string, string>;
}

async function relatorio(companyOf: CompanyId, actor: string): Promise<Relatorio> {
  const projectId = newId();
  const built = instantiateTemplate(
    standardTemplate({ id: newId() }),
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
    value: { id: projectId, client_id: null, name: 'Obra áudio', site: null, removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: actor,
  };
  const result = await applyOps(db, companyOf, [project, ...built.drafts].map((draft) => makeOp({ ...draft, device_id: DEVICE }, { newId, now: now() })), { now, origin: 'client', actorId: actor });
  expect(result.rejected).toEqual([]);
  const values = built.drafts.map((draft) => draft.value as Record<string, unknown>);
  const blocks = values.filter((row): row is BlockRow => row !== null && typeof row === 'object' && 'block_type' in row && 'sheet' in row) as BlockRow[];
  const tags = new Map(values.filter((row) => typeof row.tag === 'string' && typeof row.project_id === 'string').map((row) => [row.id as string, row.tag as string]));
  return { relatorioId: built.relatorioId, blocks, tags };
}

let main: Relatorio;
let other: Relatorio;
let seccionadora: BlockRow;

function audioCreate(input: { actor: string; relatorioId: string; target: AudioTarget; bytes: Uint8Array; mime?: string; companyOf?: CompanyId; quality?: unknown; status?: string }): { op: Op; id: string } {
  const id = newId();
  const companyOf = input.companyOf ?? company;
  const op = makeOp(
    {
      kind: 'create',
      scope: 'relatorio',
      company_id: companyOf,
      project_id: null,
      relatorio_id: input.relatorioId,
      path: `file/${id}`,
      value: {
        id,
        company_id: companyOf,
        relatorio_id: input.relatorioId,
        kind: 'audio',
        sha256: sha256(input.bytes),
        mime: input.mime ?? 'audio/webm',
        size: input.bytes.byteLength,
        uploaded_at: null,
        variants: null,
        removed_at: null,
        audio_target: input.target,
        audio_status: input.status ?? 'queued',
        quality: input.quality ?? GOOD,
        transcript_heard: null,
        transcript_written: null,
        transcription_run_id: null,
      } as never,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: input.actor,
      device_id: DEVICE,
    },
    { newId, now: now() },
  );
  return { op, id };
}

async function upload(target: Hono<AppEnv>, id: string, bytes: Uint8Array, userId = ADMIN, companyOf: CompanyId = company): Promise<Response> {
  as(userId, companyOf);
  return request(target, `/api/files/${id}`, { method: 'PUT', headers: { 'content-length': String(bytes.byteLength) }, body: bytes });
}

/** Records, pushes and uploads one audio as the Admin; returns its id once it is `transcribing`. */
async function recorded(target: AudioTarget, bytes: Uint8Array, mime = 'audio/webm'): Promise<string> {
  const { op, id } = audioCreate({ actor: ADMIN, relatorioId: main.relatorioId, target, bytes, mime });
  expect((await push(ADMIN, [op])).rejected).toEqual([]);
  expect((await upload(app, id, bytes)).status).toBe(200);
  expect((await audioOf(id)).audio_status).toBe('transcribing');
  return id;
}

async function rowOf<T>(entity: string, id: string, companyOf: CompanyId = company): Promise<T> {
  const [found] = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.company_id, companyOf), eq(entities.entity, entity), eq(entities.id, id)));
  return found!.row as T;
}

const audioOf = async (id: string): Promise<AudioFileRow> => audioFileRowSchema.parse(await rowOf('file', id));
const blockOf = (id: string) => rowOf<BlockRow>('block', id);

const run = (audioId: string, attempt = 1, lastAttempt = false) => runTranscriptionJob(deps, { company_id: companyId, audio_id: audioId }, { jobId: 'direct', attempt, lastAttempt });

async function runsOf(audioId: string) {
  return db.select().from(transcriptionRuns).where(and(eq(transcriptionRuns.company_id, companyId), eq(transcriptionRuns.audio_id, audioId))).orderBy(asc(transcriptionRuns.attempt), asc(transcriptionRuns.created_at));
}

async function lastOpOn(path: string) {
  const [found] = await db.select().from(ops).where(and(eq(ops.company_id, companyId), eq(ops.path, path))).orderBy(desc(ops.seq)).limit(1);
  return found;
}

async function suggestionsOf(audioId: string): Promise<SuggestionRow[]> {
  const found = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.company_id, companyId), eq(entities.entity, 'suggestion')));
  return found.map((r) => suggestionRowSchema.parse(r.row)).filter((s) => 'audio_id' in s.source && s.source.audio_id === audioId);
}

const item = (itemKey: string): AudioTarget => ({ type: 'item', block_id: seccionadora.id, item_key: itemKey });

beforeAll(async () => {
  copyFileSync(DEFAULT_SPEECH_FIXTURE, speechPath);
  copyFileSync(DEFAULT_WRITING_FIXTURE, writingPath);
  const roles: [string, CompanyId, SystemRoleId][] = [
    [ADMIN, company, 'admin'],
    [FIELD, company, 'engenheiro_de_campo'],
    [CONSULTA, company, 'consulta'],
    [OTHER_ADMIN, otherCompany, 'admin'],
  ];
  for (const [user, companyOf, role] of roles) await seedRoleActor(db, companyOf, user, role);
  main = await relatorio(company, ADMIN);
  other = await relatorio(otherCompany, OTHER_ADMIN);
  seccionadora = main.blocks.find((block) => block.block_type === 'chave_seccionadora' && block.equipment_id !== null)!;
}, 60_000);

afterAll(async () => {
  await dropCompany(db, companyId);
  await dropCompany(db, otherCompanyId);
  rmSync(fixturesDir, { recursive: true, force: true });
  await sql.end();
}, 60_000);

describe('31.2-API-001 receipt: one job per audio, the audio transcribing', () => {
  it.each([
    ['WebM/Opus', 'audio/webm'],
    ['MP4/AAC', 'audio/mp4'],
  ])('an uploaded %s audio sends one transcription job and goes transcribing by a system:transcription op; a retried upload sends nothing more', async (_format, mime) => {
    const bytes = recording(mime);
    const { op, id } = audioCreate({ actor: ADMIN, relatorioId: main.relatorioId, target: item('contatos'), bytes, mime });
    expect((await push(ADMIN, [op])).rejected).toEqual([]);
    const before = enqueued.length;
    expect((await upload(app, id, bytes)).status).toBe(200);
    expect(enqueued.slice(before)).toEqual([{ company_id: companyId, audio_id: id }]);
    expect((await audioOf(id)).audio_status).toBe('transcribing');
    const statusOp = await lastOpOn(`file/${id}/audio_status`);
    expect(statusOp).toMatchObject({ actor_id: TRANSCRIPTION_ACTOR, device_id: 'server', value: 'transcribing' });
    expect((await upload(app, id, bytes)).status).toBe(200);
    expect(enqueued.length).toBe(before + 1);
  });

  it('with AI_FEATURES off nothing is started and the audio stays queued', async () => {
    const off = makeApp({ aiFeatures: false });
    const bytes = recording('off');
    const { op, id } = audioCreate({ actor: ADMIN, relatorioId: main.relatorioId, target: item('contatos'), bytes });
    expect((await push(ADMIN, [op])).rejected).toEqual([]);
    const before = enqueued.length;
    expect((await upload(off, id, bytes)).status).toBe(200);
    expect(enqueued.length).toBe(before);
    expect((await audioOf(id)).audio_status).toBe('queued');
  });

  it('a queue of its own: the job is a singleton per audio, with three attempts, and a transient failure ends failed after the third', async () => {
    const queue = `transcription-test-${newId()}`;
    const queueOptions: TranscriptionQueueOptions = { retryLimit: 2, retryBackoff: false, retryDelay: 0, expireInSeconds: 60 };
    const boss = new PgBoss(config.DATABASE_URL);
    boss.on('error', (error) => console.error('pg-boss error', error));
    await boss.start();
    try {
      const bytes = recording('three');
      hears(bytes, { error: 'transient' });
      const { op, id } = audioCreate({ actor: ADMIN, relatorioId: main.relatorioId, target: item('aterramento'), bytes });
      expect((await push(ADMIN, [op])).rejected).toEqual([]);
      expect((await upload(app, id, bytes)).status).toBe(200);
      await enqueueTranscription(boss, { company_id: companyId, audio_id: id }, { queue, queueOptions });
      await enqueueTranscription(boss, { company_id: companyId, audio_id: id }, { queue, queueOptions });
      const jobs = await boss.findJobs(queue, { key: id });
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.retryLimit).toBe(2);
      await registerTranscriptionWorker(boss, deps, { queue, queueOptions, workOptions: { pollingIntervalSeconds: 0.5 } });
      const deadline = Date.now() + 40_000;
      while ((await audioOf(id)).audio_status !== 'failed') {
        if (Date.now() > deadline) throw new Error('the audio never failed');
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      const rows = await runsOf(id);
      expect(rows.map((row) => row.attempt)).toEqual([1, 2, 3]);
      expect(rows.every((row) => row.outcome === 'error' && row.speech_provider === 'fake')).toBe(true);
    } finally {
      await boss.offWork(queue);
      await boss.offWork(transcriptionDeadLetterQueue(queue));
      await boss.deleteQueue(queue);
      await boss.deleteQueue(transcriptionDeadLetterQueue(queue));
      await boss.stop();
    }
  }, 60_000);
});

describe('31.2-API-002 a prose field: written by the fake model, added after its value, naming the audio', () => {
  it('polish: the observation of a checklist item gets the written text, the audio done with both transcripts and its run', async () => {
    const bytes = recording('polish');
    hears(bytes, { text: 'contato com sinais de oxidacao' });
    writes({ heard: 'contato com sinais de oxidacao', level: 'polish', text: 'Contato com sinais de oxidação.' });
    const id = await recorded(item('contatos'), bytes);
    writingCalls.length = 0;
    await run(id);
    const path = `sheet/${seccionadora.id}/checklist/contatos/observation`;
    expect((await blockOf(seccionadora.id)).sheet.checklist.contatos?.observation?.value).toBe('Contato com sinais de oxidação.');
    expect(await lastOpOn(path)).toMatchObject({ actor_id: TRANSCRIPTION_ACTOR, meta: { source_audio_id: id } });
    const audio = await audioOf(id);
    const [runRow] = await runsOf(id);
    expect(audio).toMatchObject({ audio_status: 'done', transcript_heard: 'contato com sinais de oxidacao', transcript_written: 'Contato com sinais de oxidação.', transcription_run_id: runRow!.id });
    expect(runRow).toMatchObject({ outcome: 'ok', level: 'polish', speech_provider: 'fake', speech_model: 'fake', writing_provider: 'fake', model: 'fake', prompt_version: 'fake-writing-1', guard_outcome: 'passed', fallback_reason: null, not_a_reading: false, usd: 0, input_tokens: 0, output_tokens: 0 });
    expect(runRow!.duration_ms).toBeGreaterThanOrEqual(0);
    expect(writingCalls).toHaveLength(1);
    expect(writingCalls[0]).toMatchObject({ text: 'contato com sinais de oxidacao', level: 'polish', context: { field: 'Observação do item', equipment_type: 'Chave seccionadora', item: { label: expect.any(String) } } });

    // A second audio on the same field is added after the text already there.
    const second = recording('polish-2');
    hears(second, { text: 'parafuso solto no borne' });
    const id2 = await recorded(item('contatos'), second);
    await run(id2);
    expect((await blockOf(seccionadora.id)).sheet.checklist.contatos?.observation?.value).toBe('Contato com sinais de oxidação.\n\nParafuso solto no borne.');
  });

  it('report: OBSERVAÇÕES of the ficha, with the context of the field; the conclusion text adds to the composed text, edited', async () => {
    const bytes = recording('report');
    hears(bytes, { text: 'equipamento em bom estado geral' });
    writes({ heard: 'equipamento em bom estado geral', level: 'report', text: 'O equipamento apresenta bom estado geral de conservação.' });
    writingCalls.length = 0;
    const id = await recorded({ type: 'sheet_field', block_id: seccionadora.id, field: 'observations' }, bytes);
    await run(id);
    expect((await blockOf(seccionadora.id)).sheet.observations?.value).toBe('O equipamento apresenta bom estado geral de conservação.');
    expect(writingCalls[0]).toMatchObject({ level: 'report', context: { field: 'Observações da ficha', equipment_type: 'Chave seccionadora', tag: main.tags.get(seccionadora.equipment_id!) } });
    expect((await runsOf(id))[0]).toMatchObject({ level: 'report', guard_outcome: 'passed' });

    const conclusion = recording('conclusion');
    hears(conclusion, { text: 'recomenda-se nova inspecao em um ano' });
    writingCalls.length = 0;
    const id2 = await recorded({ type: 'sheet_field', block_id: seccionadora.id, field: 'conclusion_text' }, conclusion);
    await run(id2);
    const sheet = (await blockOf(seccionadora.id)).sheet;
    expect(String(sheet.conclusion.text?.value)).toMatch(/\n\nRecomenda-se nova inspecao em um ano\.$/);
    expect(sheet.conclusion.text_status?.value).toBe('edited');
    expect(typeof sheet.conclusion.text_basis?.value).toBe('string');
    expect(writingCalls[0]!.context.conclusion).toMatchObject({ nc_items: [], readings_out: [] });
  });
});

describe('31.2-API-003 a measurement table: a reading is suggested, other speech goes to OBSERVAÇÕES', () => {
  async function table() {
    const snapshot = await toSnapshot(db, company, main.relatorioId);
    const block = snapshot.blocks.find((row) => row.id === seccionadora.id)!;
    const definition = blockDefinitionIn(snapshotDefinitionContext(snapshot), block)!;
    const evaluated = evaluateTest(block, definition, definition.tests.find((one) => one.key === 'isolacao')!).tables[0]!;
    const row = evaluated.rows.find((one) => evaluated.rows.filter((other) => other.label === one.label).length === 1)!;
    return { key: evaluated.key, label: row.label };
  }

  it('a parsed reading is one pending Suggestion on its cell sourced by the audio, nothing written to the cell', async () => {
    const { key, label } = await table();
    const bytes = recording('reading');
    hears(bytes, { text: `${label}, 147 giga` });
    const cellsBefore = (await blockOf(seccionadora.id)).sheet.test.isolacao ?? null;
    writingCalls.length = 0;
    const id = await recorded({ type: 'table', block_id: seccionadora.id, test_key: 'isolacao', table_key: key }, bytes);
    await run(id);
    const [suggestion, ...more] = await suggestionsOf(id);
    expect(more).toEqual([]);
    expect(suggestion).toMatchObject({ status: 'pending', trust: 'suggested', mode: 'fill', source: { audio_id: id }, value: { raw: '147', unit: 'GΩ', state: 'measured' } });
    expect(suggestion!.target_path).toMatch(new RegExp(`^sheet/${seccionadora.id}/test/isolacao/cell/`));
    expect((await blockOf(seccionadora.id)).sheet.test.isolacao ?? null).toEqual(cellsBefore);
    expect(writingCalls).toEqual([]);
    expect(await audioOf(id)).toMatchObject({ audio_status: 'done', transcript_heard: `${label}, 147 giga`, transcript_written: null });
    expect((await runsOf(id))[0]).toMatchObject({ level: 'reading', not_a_reading: false, writing_provider: null });
  });

  it('speech that is no reading goes to OBSERVAÇÕES as text of the audio, and the audio records not_a_reading', async () => {
    const { key } = await table();
    const before = (await blockOf(seccionadora.id)).sheet.observations?.value ?? null;
    const bytes = recording('not-reading');
    hears(bytes, { text: 'isolador com trinca na saia' });
    const id = await recorded({ type: 'table', block_id: seccionadora.id, test_key: 'isolacao', table_key: key }, bytes);
    await run(id);
    expect(await suggestionsOf(id)).toEqual([]);
    const observations = (await blockOf(seccionadora.id)).sheet.observations?.value;
    expect(observations).toBe(before === null ? 'Isolador com trinca na saia.' : `${String(before)}\n\nIsolador com trinca na saia.`);
    expect(await lastOpOn(`sheet/${seccionadora.id}/observations`)).toMatchObject({ meta: { source_audio_id: id } });
    expect(await audioOf(id)).toMatchObject({ audio_status: 'done', not_a_reading: true });
    expect((await runsOf(id))[0]).toMatchObject({ not_a_reading: true });
  });
});

describe('31.2-API-004 the guard and a writing call that fails for good give the field the text as heard', () => {
  it('a written text with a number nobody said falls back to the text as heard; the run row says why', async () => {
    const bytes = recording('guard');
    hears(bytes, { text: 'contato oxidado' });
    writes({ heard: 'contato oxidado', text: 'Contato oxidado em 3 pontos.' });
    const id = await recorded(item('isoladores'), bytes);
    await run(id);
    expect((await blockOf(seccionadora.id)).sheet.checklist.isoladores?.observation?.value).toBe('Contato oxidado');
    expect(await audioOf(id)).toMatchObject({ audio_status: 'done', transcript_heard: 'contato oxidado', transcript_written: null });
    const [runRow] = await runsOf(id);
    expect(runRow).toMatchObject({ outcome: 'ok', guard_outcome: 'failed', model: 'fake' });
    expect(runRow!.fallback_reason).toBe('guard: added number 3');
  });

  it('a permanent writing failure falls back at once; a transient one is retried, and falls back on the last attempt', async () => {
    const bytes = recording('write-fail');
    hears(bytes, { text: 'pintura descascada' });
    writes({ heard: 'pintura descascada', error: 'permanent' });
    const id = await recorded(item('pintura_corrosao'), bytes);
    await run(id);
    expect((await blockOf(seccionadora.id)).sheet.checklist.pintura_corrosao?.observation?.value).toBe('Pintura descascada');
    expect((await runsOf(id))[0]!.fallback_reason).toMatch(/^writing_failed: /);

    const flaky = recording('write-flaky');
    hears(flaky, { text: 'limpeza necessaria' });
    writes({ heard: 'limpeza necessaria', error: 'transient' });
    const id2 = await recorded(item('limpeza_e_lubrificacao'), flaky);
    await expect(run(id2, 1, false)).rejects.toThrow(/transient/);
    expect((await audioOf(id2)).audio_status).toBe('transcribing');
    await run(id2, 3, true);
    expect((await blockOf(seccionadora.id)).sheet.checklist.limpeza_e_lubrificacao?.observation?.value).toBe('Limpeza necessaria');
    expect(await audioOf(id2)).toMatchObject({ audio_status: 'done', transcript_written: null });
    expect((await runsOf(id2)).map((row) => row.outcome)).toEqual(['error', 'ok']);
  });
});

describe('31.2-API-005 three failures: failed, then "Tentar de novo" queues it again and it ends done', () => {
  it('the last attempt writes failed; the retranscribe route answers 202 transcribing; the next run is done', async () => {
    const bytes = recording('retry');
    hears(bytes, { error: 'transient' });
    const id = await recorded(item('mecanismo_de_acionamento'), bytes);
    await expect(run(id, 1, false)).rejects.toThrow();
    await expect(run(id, 2, false)).rejects.toThrow();
    await run(id, 3, true);
    expect((await audioOf(id)).audio_status).toBe('failed');
    expect(await lastOpOn(`file/${id}/audio_status`)).toMatchObject({ actor_id: TRANSCRIPTION_ACTOR, value: 'failed' });

    hears(bytes, { text: 'mecanismo travando' });
    as(ADMIN);
    const before = enqueued.length;
    const res = await request(app, audioRetranscribePath(id), { method: 'POST' });
    expect(res.status, await res.clone().text()).toBe(202);
    expect(await res.json()).toEqual({ audio_id: id, audio_status: 'transcribing' });
    expect(enqueued.slice(before)).toEqual([{ company_id: companyId, audio_id: id }]);
    expect((await audioOf(id)).audio_status).toBe('transcribing');
    await run(id);
    expect(await audioOf(id)).toMatchObject({ audio_status: 'done', transcript_heard: 'mecanismo travando' });
    expect((await runsOf(id)).length).toBe(4);

    // Only a failed audio is queued again.
    const again = await request(app, audioRetranscribePath(id), { method: 'POST' });
    expect(again.status).toBe(409);
  });
});

describe('31.2-API-006 tenant scoping and the field permission', () => {
  it("another company's audio answers 404 on the retranscribe route and a 409 on its upload; no other company's data reaches the prompt", async () => {
    const bytes = recording('tenant');
    hears(bytes, { error: 'permanent' });
    const id = await recorded(item('simultaneidade'), bytes);
    await run(id);
    expect((await audioOf(id)).audio_status).toBe('failed');
    as(OTHER_ADMIN, otherCompany);
    expect((await request(app, audioRetranscribePath(id), { method: 'POST' })).status).toBe(404);
    expect((await upload(app, id, bytes, OTHER_ADMIN, otherCompany)).status).toBe(409);

    // The context the model receives names this company's relatório only.
    const own = recording('tenant-ok');
    hears(own, { text: 'aterramento conferido' });
    writingCalls.length = 0;
    const id2 = await recorded({ type: 'sheet_field', block_id: seccionadora.id, field: 'observations' }, own);
    await run(id2);
    const sent = JSON.stringify(writingCalls);
    for (const tag of other.tags.values()) if (![...main.tags.values()].includes(tag)) expect(sent).not.toContain(tag);
    expect(sent).not.toContain(other.relatorioId);
  });

  it('a role without the key of the field is refused the audio create; the field user records on a sheet field; a consulta user is refused the retranscribe', async () => {
    const bytes = recording('roles');
    const consulta = audioCreate({ actor: CONSULTA, relatorioId: main.relatorioId, target: item('contatos'), bytes });
    expect((await push(CONSULTA, [consulta.op])).rejected).toEqual([{ op_id: consulta.op.op_id, code: 'op_forbidden' }]);
    // The Engenheiro de Campo fills the ficha but does not create a relatório: "Informações adicionais" is not his field.
    const setup = audioCreate({ actor: FIELD, relatorioId: main.relatorioId, target: { type: 'setup', field: 'additional_info' }, bytes });
    expect((await push(FIELD, [setup.op])).rejected).toEqual([{ op_id: setup.op.op_id, code: 'op_forbidden' }]);
    const field = audioCreate({ actor: FIELD, relatorioId: main.relatorioId, target: item('contatos'), bytes });
    expect((await push(FIELD, [field.op])).rejected).toEqual([]);

    const failing = recording('roles-failed');
    hears(failing, { error: 'permanent' });
    const id = await recorded(item('intertravamento_mecanico'), failing);
    await run(id);
    as(CONSULTA);
    expect((await request(app, audioRetranscribePath(id), { method: 'POST' })).status).toBe(403);
  });
});

describe('31.2-API-007 a device writes only dismissed; a dismissed audio is never transcribed', () => {
  it('a device op writing a server-only status is refused through the sync route; dismissed folds and the job then writes nothing', async () => {
    const bytes = recording('dismiss');
    const id = await recorded(item('contatos'), bytes);
    const put = (path: string, value: unknown) =>
      makeOp({ kind: 'put', scope: 'relatorio', company_id: companyId, project_id: null, relatorio_id: main.relatorioId, path, value: value as never, prev_op_id: null, batch_id: null, meta: null, actor_id: ADMIN, device_id: DEVICE }, { newId, now: now() });
    for (const status of ['done', 'transcribing', 'failed', 'queued']) {
      const op = put(`file/${id}/audio_status`, status);
      expect((await push(ADMIN, [op])).rejected, status).toEqual([{ op_id: op.op_id, code: 'op_invalid' }]);
    }
    const transcript = put(`file/${id}/transcript_heard`, 'forjado');
    expect((await push(ADMIN, [transcript])).rejected).toEqual([{ op_id: transcript.op_id, code: 'op_server_only' }]);
    // A create born transcribing, or with a quality verdict the kernel does not give, is refused.
    const bornLate = audioCreate({ actor: ADMIN, relatorioId: main.relatorioId, target: item('contatos'), bytes: recording('late'), status: 'transcribing' });
    expect((await push(ADMIN, [bornLate.op])).rejected).toEqual([{ op_id: bornLate.op.op_id, code: 'op_invalid' }]);
    const forged = audioCreate({ actor: ADMIN, relatorioId: main.relatorioId, target: item('contatos'), bytes: recording('forged'), quality: { ...GOOD, level: 0.001 } });
    expect((await push(ADMIN, [forged.op])).rejected).toEqual([{ op_id: forged.op.op_id, code: 'op_invalid' }]);

    const dismiss = put(`file/${id}/audio_status`, 'dismissed');
    expect((await push(ADMIN, [dismiss])).rejected).toEqual([]);
    expect((await audioOf(id)).audio_status).toBe('dismissed');
    const observation = (await blockOf(seccionadora.id)).sheet.checklist.contatos?.observation?.value ?? null;
    await run(id);
    expect((await audioOf(id)).audio_status).toBe('dismissed');
    expect((await blockOf(seccionadora.id)).sheet.checklist.contatos?.observation?.value ?? null).toBe(observation);
    expect((await runsOf(id))[0]).toMatchObject({ outcome: 'error', error: 'skipped: the audio is dismissed' });
  });
});

/** A device's put, as the sync route receives it. */
function devicePut(path: string, value: unknown, actor = ADMIN): Op {
  return makeOp({ kind: 'put', scope: 'relatorio', company_id: companyId, project_id: null, relatorio_id: main.relatorioId, path, value: value as never, prev_op_id: null, batch_id: null, meta: null, actor_id: actor, device_id: DEVICE }, { newId, now: now() });
}

/** The job's deps with a writing step that first runs `meanwhile` (a device's put landing while the model writes). */
function writingWhile(meanwhile: () => Promise<void>): TranscriptionJobDeps {
  return {
    ...deps,
    writing: {
      write: async (input) => {
        writingCalls.push(input);
        await meanwhile();
        return fakeWriting.write(input);
      },
    },
  };
}

const runWith = (jobDeps: TranscriptionJobDeps, audioId: string, attempt = 1, lastAttempt = false) =>
  runTranscriptionJob(jobDeps, { company_id: companyId, audio_id: audioId }, { jobId: 'direct', attempt, lastAttempt });

const blockOfType = (type: string) => main.blocks.find((block) => block.block_type === type && block.equipment_id !== null)!;

describe('e31f-API-002 the job writes the field from a fresh read under the lock', () => {
  it('a text typed while the audio was "Transcrevendo" is kept, the audio text added after it', async () => {
    const dj = blockOfType('disjuntor_mt');
    const bytes = recording('typed-meanwhile');
    hears(bytes, { text: 'disjuntor com oleo escurecido' });
    const id = await recorded({ type: 'sheet_field', block_id: dj.id, field: 'observations' }, bytes);
    await runWith(writingWhile(async () => void (await push(ADMIN, [devicePut(`sheet/${dj.id}/observations`, 'Texto digitado agora.')]))), id);
    expect((await blockOf(dj.id)).sheet.observations?.value).toBe('Texto digitado agora.\n\nDisjuntor com oleo escurecido.');
    expect((await audioOf(id)).audio_status).toBe('done');
  });

  it('a parecer verdict tapped meanwhile is never reverted: only the summary moves', async () => {
    expect((await push(ADMIN, [devicePut('relatorio/setup/parecer', { verdict: 'apto', text: null, text_status: null, text_basis: null })])).rejected).toEqual([]);
    const bytes = recording('parecer-meanwhile');
    hears(bytes, { text: 'instalacao em condicoes de operacao' });
    const id = await recorded({ type: 'setup', field: 'parecer_text' }, bytes);
    await runWith(writingWhile(async () => void (await push(ADMIN, [devicePut('relatorio/setup/parecer', { verdict: 'apto_com_restricoes', text: null, text_status: null, text_basis: null })]))), id);
    const parecer = (await rowOf<{ setup: { parecer: { verdict: string; text: string | null; text_status: string | null } } }>('relatorio', main.relatorioId)).setup.parecer;
    expect(parecer.verdict).toBe('apto_com_restricoes');
    expect(parecer.text).toMatch(/Instalacao em condicoes de operacao\.$/);
    expect(parecer.text_status).toBe('edited');
  });

  it('a Não ensaiado reason changed meanwhile is never reverted: only the note moves', async () => {
    const tp = blockOfType('tp');
    // The mark's instant is the device's now (the attribution rule refuses an instant before the relatório).
    const mark = (reason: string) => ({ reason, text: null, at: now().toISOString(), by: ADMIN });
    expect((await push(ADMIN, [devicePut(`block/${tp.id}/not_tested`, mark('outro'))])).rejected).toEqual([]);
    const bytes = recording('not-tested-meanwhile');
    hears(bytes, { text: 'equipamento sem acesso no dia' });
    const id = await recorded({ type: 'sheet_field', block_id: tp.id, field: 'not_tested_text' }, bytes);
    await runWith(writingWhile(async () => void (await push(ADMIN, [devicePut(`block/${tp.id}/not_tested`, mark('impossibilidade_desligamento'))]))), id);
    const notTested = (await blockOf(tp.id)).not_tested;
    expect(notTested).toMatchObject({ reason: 'impossibilidade_desligamento' });
    expect(notTested!.text).toMatch(/Equipamento sem acesso no dia\.$/);
  });
});

describe('e31f-API-003 the server cap and speech paid once', () => {
  it('an audio past the cap by its quality is never sent to speech: failed, the run row says too_long', async () => {
    const bytes = recording('too-long');
    const quality = audioQualityOf({ level: 0.2, clipped_share: 0, noise_ratio: 0.1, duration_ms: 200_000, speech_ms: 150_000 });
    const { op, id } = audioCreate({ actor: ADMIN, relatorioId: main.relatorioId, target: item('contatos'), bytes, quality });
    expect((await push(ADMIN, [op])).rejected).toEqual([]);
    expect((await upload(app, id, bytes)).status).toBe(200);
    await run(id);
    expect((await audioOf(id)).audio_status).toBe('failed');
    const [runRow] = await runsOf(id);
    expect(runRow).toMatchObject({ outcome: 'error', speech_model: null, audio_seconds: null });
    expect(runRow!.error).toMatch(/too_long/);
  });

  it('an audio the provider hears past the cap is never written: failed, no writing call', async () => {
    const bytes = recording('heard-too-long');
    hears(bytes, { text: 'fala longa demais', audio_seconds: 400 });
    const id = await recorded(item('contatos'), bytes);
    writingCalls.length = 0;
    await run(id);
    expect((await audioOf(id)).audio_status).toBe('failed');
    expect(writingCalls).toEqual([]);
    const [runRow] = await runsOf(id);
    expect(runRow).toMatchObject({ outcome: 'error', speech_model: 'fake', audio_seconds: 400 });
    expect(runRow!.error).toMatch(/too_long/);
  });

  it('after a transient writing failure the next attempt reuses the stored text as heard, with no speech call', async () => {
    const bytes = recording('reuse-heard');
    hears(bytes, { text: 'cabo com emenda aparente' });
    writes({ heard: 'cabo com emenda aparente', error: 'transient' });
    const id = await recorded(item('contatos'), bytes);
    await expect(run(id, 1, false)).rejects.toThrow(/transient/);
    expect(await audioOf(id)).toMatchObject({ audio_status: 'transcribing', transcript_heard: 'cabo com emenda aparente' });
    // Speech would now fail for good: the second attempt never calls it.
    hears(bytes, { error: 'permanent' });
    writes({ heard: 'cabo com emenda aparente', text: 'Cabo com emenda aparente.' });
    await run(id, 2, false);
    expect(await audioOf(id)).toMatchObject({ audio_status: 'done', transcript_heard: 'cabo com emenda aparente', transcript_written: 'Cabo com emenda aparente.' });
    const rows = await runsOf(id);
    expect(rows.map((row) => [row.outcome, row.speech_model])).toEqual([
      ['error', 'fake'],
      ['ok', null],
    ]);
  });
});

describe('e31f-API-004 "Tentar de novo" of a queued audio, its limit, and the dismiss rules', () => {
  it('an audio left queued with AI features off is queued again by "Tentar de novo"; one not uploaded answers 409 not_caught_up', async () => {
    const off = makeApp({ aiFeatures: false });
    const bytes = recording('queued-retry');
    const { op, id } = audioCreate({ actor: ADMIN, relatorioId: main.relatorioId, target: item('contatos'), bytes });
    expect((await push(ADMIN, [op])).rejected).toEqual([]);
    expect((await upload(off, id, bytes)).status).toBe(200);
    expect((await audioOf(id)).audio_status).toBe('queued');
    as(ADMIN);
    const before = enqueued.length;
    const res = await request(app, audioRetranscribePath(id), { method: 'POST' });
    expect(res.status, await res.clone().text()).toBe(202);
    expect(enqueued.slice(before)).toEqual([{ company_id: companyId, audio_id: id }]);
    expect((await audioOf(id)).audio_status).toBe('transcribing');

    const waiting = audioCreate({ actor: ADMIN, relatorioId: main.relatorioId, target: item('contatos'), bytes: recording('not-uploaded') });
    expect((await push(ADMIN, [waiting.op])).rejected).toEqual([]);
    as(ADMIN);
    const early = await request(app, audioRetranscribePath(waiting.id), { method: 'POST' });
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ code: 'not_caught_up' });
  });

  it('past the per-user limit the route answers 429', async () => {
    const limited = makeApp({ retranscribeLimit: { max: 1, windowMs: 60_000 } });
    const off = makeApp({ aiFeatures: false });
    const bytes = recording('limited');
    const { op, id } = audioCreate({ actor: ADMIN, relatorioId: main.relatorioId, target: item('contatos'), bytes });
    expect((await push(ADMIN, [op])).rejected).toEqual([]);
    expect((await upload(off, id, bytes)).status).toBe(200);
    as(ADMIN);
    expect((await request(limited, audioRetranscribePath(id), { method: 'POST' })).status).toBe(202);
    const again = await request(limited, audioRetranscribePath(id), { method: 'POST' });
    expect(again.status).toBe(429);
    expect(again.headers.get('retry-after')).not.toBeNull();
  });

  it("a dismiss needs the key of the audio's field; it is accepted from queued and failed, refused on a done audio", async () => {
    const setup = audioCreate({ actor: ADMIN, relatorioId: main.relatorioId, target: { type: 'setup', field: 'additional_info' }, bytes: recording('dismiss-setup') });
    expect((await push(ADMIN, [setup.op])).rejected).toEqual([]);
    // The Engenheiro de Campo fills the ficha (relatorio.fill) but "Informações adicionais" is not his field.
    const forbidden = devicePut(`file/${setup.id}/audio_status`, 'dismissed', FIELD);
    expect((await push(FIELD, [forbidden])).rejected).toEqual([{ op_id: forbidden.op_id, code: 'op_forbidden' }]);
    const queued = devicePut(`file/${setup.id}/audio_status`, 'dismissed');
    expect((await push(ADMIN, [queued])).rejected).toEqual([]);
    expect((await audioOf(setup.id)).audio_status).toBe('dismissed');

    const failing = recording('dismiss-failed');
    hears(failing, { error: 'permanent' });
    const failedId = await recorded(item('contatos'), failing);
    await run(failedId);
    expect((await audioOf(failedId)).audio_status).toBe('failed');
    const fromFailed = devicePut(`file/${failedId}/audio_status`, 'dismissed', FIELD);
    expect((await push(FIELD, [fromFailed])).rejected).toEqual([]);

    const ok = recording('dismiss-done');
    hears(ok, { text: 'contato limpo' });
    const doneId = await recorded(item('contatos'), ok);
    await run(doneId);
    expect((await audioOf(doneId)).audio_status).toBe('done');
    const late = devicePut(`file/${doneId}/audio_status`, 'dismissed');
    expect((await push(ADMIN, [late])).rejected).toEqual([{ op_id: late.op_id, code: 'op_invalid' }]);
    expect((await audioOf(doneId)).audio_status).toBe('done');
  });
});

describe('31.2-API-008 STT_PROVIDER', () => {
  it('fake is the default; transcribe builds the Amazon Transcribe adapter (Story 31.8) without calling AWS', () => {
    expect(loadConfig({ ...process.env, STT_PROVIDER: '' }).STT_PROVIDER).toBe('fake');
    expect(createSpeechProvider({ STT_PROVIDER: 'fake' }).name).toBe('fake');
    expect(createSpeechProvider({ STT_PROVIDER: 'transcribe', S3_BUCKET: 'a-bucket' }).name).toBe('transcribe');
  });
});
