import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  aiRewriteSource,
  aiRewriteWrite,
  aiWritePath,
  blockFieldPath,
  isSectionBlockType,
  aiWriteResponseSchema,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  EMPTY_DEFINITION_CONTEXT,
  instantiateTemplate,
  makeOp,
  sheetChecklistPath,
  standardTemplate,
  type AudioTarget,
  type BlockRow,
  type OpDraft,
  type SystemRoleId,
  type WritingInput,
  type WritingProvider,
} from '@app/domain';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId, type CompanyId } from '../db/repositories/company-id.ts';
import { roleOfUser } from '../db/roles.ts';
import { seedRoleActor } from '../db/roles.test-support.ts';
import { entities, transcriptionRuns } from '../db/schema.ts';
import { dropCompany } from '../db/test-cleanup.ts';
import { newId } from '../ids.ts';
import { AI_WRITE_PROMPT_VERSION } from '../jobs/transcription/prompt.ts';
import { DEFAULT_WRITING_FIXTURE, FAKE_WRITING_MODEL, FAKE_WRITING_PROMPT_VERSION, fakeWritingProvider } from '../jobs/transcription/providers/writing-fake.ts';
import { applyOps } from '../sync/apply.ts';
import { toSnapshot } from '../sync/snapshot.ts';
import { createAiWriteRoutes } from './ai-write.ts';
import type { RateLimitRule } from './rate-limit.ts';
import { ForbiddenError, type AppEnv } from './session.ts';

/*
 * Story 31.9 (AD-30, FR-79): `POST /api/relatorios/{id}/write`, the AI control, against the compose
 * Postgres on two throwaway companies: the rewrite at the report level with the field's context and
 * its run row, the guard and a failed call (field untouched, a run row all the same), the composed
 * conclusion text, the company scoping, the field permission, the barrier, AI features off and the
 * per-user limit. The writing step is the `fake` provider on a copy of the committed fixture, or a
 * stand-in that reports tokens and USD as Bedrock would.
 */

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);

const companyId = newId();
const company = asCompanyId(companyId);
const otherCompanyId = newId();
const otherCompany = asCompanyId(otherCompanyId);
const ADMIN = newId();
const FIELD = newId();
const CONSULTA = newId();
const OTHER_ADMIN = newId();
const DEVICE = 'tablet-ai-write';

const fixturesDir = mkdtempSync(join(tmpdir(), 'ai-write-fixtures-'));
const writingPath = join(fixturesDir, 'writing.json');
const calls: WritingInput[] = [];

let session: { userId: string; companyId: CompanyId };

function makeApp(options: { aiFeatures?: boolean; limit?: RateLimitRule; provider?: WritingProvider; name?: string } = {}): Hono<AppEnv> {
  const fake = fakeWritingProvider(writingPath);
  const provider = options.provider ?? fake;
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
  app.route(
    '/',
    createAiWriteRoutes(db, {
      now,
      newId,
      writing: {
        name: options.name ?? 'fake',
        provider: {
          write: (input) => {
            calls.push(input);
            return provider.write(input);
          },
        },
      },
      ...(options.aiFeatures === undefined ? {} : { aiFeatures: options.aiFeatures }),
      ...(options.limit === undefined ? {} : { limit: options.limit }),
    }),
  );
  return app;
}

const app = makeApp();

function as(userId: string, companyOf: CompanyId = company): void {
  session = { userId, companyId: companyOf };
}

async function write(target: Hono<AppEnv>, relatorioId: string, body: unknown): Promise<Response> {
  return target.request(aiWritePath(relatorioId), {
    method: 'POST',
    headers: { 'content-type': 'application/json', [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) },
    body: JSON.stringify(body),
  });
}

interface Relatorio {
  relatorioId: string;
  blocks: BlockRow[];
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
    value: { id: projectId, client_id: null, name: 'Obra IA', site: null, removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: actor,
  };
  const result = await applyOps(db, companyOf, [project, ...built.drafts].map((draft) => makeOp({ ...draft, device_id: DEVICE }, { newId, now: now() })), { now, origin: 'client', actorId: actor });
  expect(result.rejected).toEqual([]);
  const blocks = built.drafts.map((draft) => draft.value as Record<string, unknown>).filter((row): row is BlockRow => row !== null && typeof row === 'object' && 'block_type' in row && 'sheet' in row) as BlockRow[];
  return { relatorioId: built.relatorioId, blocks };
}

let main: Relatorio;
let other: Relatorio;
let seccionadora: BlockRow;

/** Writes an item's observation as the Admin's device would; returns the op id (the device's `last_op_id`). */
async function observe(itemKey: string, text: string | null): Promise<string> {
  const op = makeOp(
    {
      kind: 'put',
      scope: 'relatorio',
      company_id: companyId,
      project_id: null,
      relatorio_id: main.relatorioId,
      path: sheetChecklistPath(seccionadora.id, itemKey, 'observation'),
      value: text,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: ADMIN,
      device_id: DEVICE,
    },
    { newId, now: now() },
  );
  const result = await applyOps(db, company, [op], { now, origin: 'client', actorId: ADMIN });
  expect(result.rejected).toEqual([]);
  return op.op_id;
}

const item = (itemKey: string): AudioTarget => ({ type: 'item', block_id: seccionadora.id, item_key: itemKey });

async function lastRun() {
  const [row] = await db.select().from(transcriptionRuns).where(and(eq(transcriptionRuns.company_id, companyId), eq(transcriptionRuns.kind, 'ai_write'))).orderBy(desc(transcriptionRuns.created_at)).limit(1);
  return row;
}

async function runCount(): Promise<number> {
  return (await db.select().from(transcriptionRuns).where(and(eq(transcriptionRuns.company_id, companyId), eq(transcriptionRuns.kind, 'ai_write')))).length;
}

async function storedObservation(itemKey: string): Promise<unknown> {
  const [found] = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.company_id, companyId), eq(entities.entity, 'block'), eq(entities.id, seccionadora.id)));
  return (found!.row as BlockRow).sheet.checklist[itemKey]?.observation?.value ?? null;
}

beforeAll(async () => {
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

describe('31.9-API-001 the rewrite at the report level, with the field context, and its run row', () => {
  it('answers the written text and stores model, prompt version, tokens and USD; nothing is written to the relatório', async () => {
    const lastOpId = await observe('contatos', 'contato fase b aquecido oxidado');
    as(ADMIN);
    calls.length = 0;
    const res = await write(app, main.relatorioId, { target: item('contatos'), last_op_id: lastOpId });
    expect(res.status, await res.clone().text()).toBe(200);
    expect(aiWriteResponseSchema.parse(await res.json())).toEqual({ outcome: 'written', source: 'contato fase b aquecido oxidado', text: 'Contatos da fase B com sinais de aquecimento e oxidação.' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ text: 'contato fase b aquecido oxidado', level: 'report', source: 'field', context: { field: 'Observação do item' } });
    expect(await storedObservation('contatos')).toBe('contato fase b aquecido oxidado');
    const run = await lastRun();
    expect(run).toMatchObject({
      kind: 'ai_write',
      audio_id: null,
      user_id: ADMIN,
      relatorio_id: main.relatorioId,
      target: item('contatos'),
      outcome: 'ok',
      level: 'report',
      speech_provider: null,
      writing_provider: 'fake',
      model: FAKE_WRITING_MODEL,
      prompt_version: FAKE_WRITING_PROMPT_VERSION,
      input_tokens: 0,
      output_tokens: 0,
      usd: 0,
      guard_outcome: 'passed',
    });
  });

  it('a provider that bills the call: its tokens, USD and the AI control prompt version on the row', async () => {
    const billed = makeApp({
      name: 'bedrock',
      provider: {
        write: async (input) => ({ text: input.text.replace('verificado', 'foi verificado'), model: 'stand-in-model', prompt_version: AI_WRITE_PROMPT_VERSION, usage: { input_tokens: 412, output_tokens: 37, usd: 0.0012345678 } }),
      },
    });
    const lastOpId = await observe('simultaneidade', 'mecanismo verificado');
    as(ADMIN);
    const res = await write(billed, main.relatorioId, { target: item('simultaneidade'), last_op_id: lastOpId });
    expect(await res.json()).toEqual({ outcome: 'written', source: 'mecanismo verificado', text: 'mecanismo foi verificado' });
    expect(await lastRun()).toMatchObject({ writing_provider: 'bedrock', model: 'stand-in-model', prompt_version: 'transcription-write-field-1', input_tokens: 412, output_tokens: 37, usd: 0.001235 });
  });
});

describe('31.9-API-002 a guard that fails or a call that fails leaves the field unchanged', () => {
  it('an answer adding a number is refused, the run row says why', async () => {
    const lastOpId = await observe('intertravamento_mecanico', 'folga no acionamento do mecanismo');
    as(ADMIN);
    const res = await write(app, main.relatorioId, { target: item('intertravamento_mecanico'), last_op_id: lastOpId });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: 'refused', reason: 'guard' });
    expect(await lastRun()).toMatchObject({ outcome: 'ok', guard_outcome: 'failed', fallback_reason: 'guard: added number 3' });
    expect(await storedObservation('intertravamento_mecanico')).toBe('folga no acionamento do mecanismo');
  });

  it('a writing call that fails is refused as failed, with an error run row', async () => {
    const broken = makeApp({
      provider: {
        write: () => Promise.reject(new Error('the provider is down')),
      },
    });
    const lastOpId = await observe('contatos', 'contato fase b aquecido oxidado');
    as(ADMIN);
    const res = await write(broken, main.relatorioId, { target: item('contatos'), last_op_id: lastOpId });
    expect(await res.json()).toEqual({ outcome: 'refused', reason: 'failed' });
    expect(await lastRun()).toMatchObject({ outcome: 'error', error: 'Error: the provider is down', guard_outcome: null });
  });
});

describe('31.9-API-003 "Texto da conclusão" holding the composed text', () => {
  it('rewrites the composed text with the conclusion in the context; the result is never in the answer', async () => {
    as(ADMIN);
    calls.length = 0;
    const target: AudioTarget = { type: 'sheet_field', block_id: seccionadora.id, field: 'conclusion_text' };
    const res = await write(app, main.relatorioId, { target, last_op_id: null });
    const answer = aiWriteResponseSchema.parse(await res.json());
    const expected = aiRewriteSource(await toSnapshot(db, company, main.relatorioId), target, { now: now() });
    expect(answer).toMatchObject({ outcome: 'written', source: expected!.text });
    expect(calls[0]!.context.conclusion).toBeDefined();
    expect(calls[0]!.text).toBe(expected!.text);
  });
});

describe('e31f-API-001 a section text is rewritten block by block, keeping its formatting', () => {
  it('one writing call per block; the answer holds one line per block, which the write gives back its kind and its marks', async () => {
    const section = main.blocks.find((block) => isSectionBlockType(block.block_type))!;
    const sectionText = 'Inspeção da **cabine primária** realizada.\n- item um verificado\n- item dois verificado';
    const op = makeOp(
      {
        kind: 'put',
        scope: 'relatorio',
        company_id: companyId,
        project_id: null,
        relatorio_id: main.relatorioId,
        path: blockFieldPath(section.id, 'config'),
        value: { ...((section.config ?? {}) as Record<string, unknown>), section_text: sectionText, section_text_edited: true } as never,
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: ADMIN,
        device_id: DEVICE,
      },
      { newId, now: now() },
    );
    expect((await applyOps(db, company, [op], { now, origin: 'client', actorId: ADMIN })).rejected).toEqual([]);
    as(ADMIN);
    calls.length = 0;
    const target: AudioTarget = { type: 'section', block_id: section.id };
    const res = await write(app, main.relatorioId, { target, last_op_id: op.op_id });
    const answer = aiWriteResponseSchema.parse(await res.json());
    expect(calls.map((call) => call.text)).toEqual(['Inspeção da cabine primária realizada.', 'item um verificado', 'item dois verificado']);
    expect(answer).toEqual({ outcome: 'written', source: 'Inspeção da cabine primária realizada.\nitem um verificado\nitem dois verificado', text: 'Inspeção da cabine primária realizada.\nItem um verificado.\nItem dois verificado.' });
    const write2 = aiRewriteWrite(await toSnapshot(db, company, main.relatorioId), target, answer.outcome === 'written' ? answer.text : '', { now: now() })!;
    expect((write2.puts[0]!.value as { section_text: string }).section_text).toBe('Inspeção da **cabine primária** realizada.\n- Item um verificado.\n- Item dois verificado.');
  });
});

describe('31.9-API-004 scoping, the field permission, the barrier and AI features off', () => {
  it("another company's relatório answers 404; a role without the field's key 403; nothing called", async () => {
    calls.length = 0;
    as(OTHER_ADMIN, otherCompany);
    expect((await write(app, main.relatorioId, { target: item('contatos'), last_op_id: null })).status).toBe(404);
    as(ADMIN);
    expect((await write(app, other.relatorioId, { target: item('contatos'), last_op_id: null })).status).toBe(404);
    as(CONSULTA);
    expect((await write(app, main.relatorioId, { target: item('contatos'), last_op_id: null })).status).toBe(403);
    // The Engenheiro de Campo fills the ficha, not "Informações adicionais".
    as(FIELD);
    expect((await write(app, main.relatorioId, { target: { type: 'setup', field: 'additional_info' }, last_op_id: null })).status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('a table target and a malformed body are 400; an empty field 409; an op the server lacks 409 not_caught_up', async () => {
    as(ADMIN);
    calls.length = 0;
    expect((await write(app, main.relatorioId, { target: { type: 'table', block_id: seccionadora.id, test_key: 'x', table_key: 'y' }, last_op_id: null })).status).toBe(400);
    expect((await write(app, main.relatorioId, { target: item('contatos') })).status).toBe(400);
    await observe('mecanismo_de_acionamento', null);
    const empty = await write(app, main.relatorioId, { target: item('mecanismo_de_acionamento'), last_op_id: null });
    expect(empty.status).toBe(409);
    expect(await empty.json()).toMatchObject({ code: 'invalid_request' });
    const behind = await write(app, main.relatorioId, { target: item('contatos'), last_op_id: newId() });
    expect(behind.status).toBe(409);
    expect(await behind.json()).toMatchObject({ code: 'not_caught_up' });
    expect(calls).toHaveLength(0);
  });

  it('with AI features off the route answers 409 ai_features_off and stores no run', async () => {
    const before = await runCount();
    as(ADMIN);
    const res = await write(makeApp({ aiFeatures: false }), main.relatorioId, { target: item('contatos'), last_op_id: null });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'ai_features_off' });
    expect(await runCount()).toBe(before);
  });
});

describe('31.9-API-005 the per-user limit', () => {
  it('past the limit the route answers 429 with retry-after, for that user only', async () => {
    const limited = makeApp({ limit: { max: 2, windowMs: 60_000 } });
    await observe('contatos', 'contato fase b aquecido oxidado');
    as(ADMIN);
    expect((await write(limited, main.relatorioId, { target: item('contatos'), last_op_id: null })).status).toBe(200);
    expect((await write(limited, main.relatorioId, { target: item('contatos'), last_op_id: null })).status).toBe(200);
    const third = await write(limited, main.relatorioId, { target: item('contatos'), last_op_id: null });
    expect(third.status).toBe(429);
    expect(third.headers.get('retry-after')).not.toBeNull();
    as(FIELD);
    expect((await write(limited, main.relatorioId, { target: item('contatos'), last_op_id: null })).status).toBe(200);
  });
});
