import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import {
  AUDIT_FINDING_KINDS,
  auditResponseSchema,
  auditRunningDetailsSchema,
  auditRunRowSchema,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  errorResponseSchema,
  instantiateTemplate,
  makeOp,
  newEquipmentBlock,
  opSchema,
  standardTemplate,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type AuditRunRow,
  type LocationRow,
  type Op,
  type OpDraft,
} from '@app/domain';
import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { entities, ops } from '../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { newId } from '../ids.ts';
import { runAuditJob, type AuditJobDeps } from '../jobs/audit/job.ts';
import type { AuditPayload } from '../jobs/audit/payload.ts';
import { AUDIT_PROMPT_VERSION, AUDIT_TOOL } from '../jobs/audit/prompt.ts';
import { bedrockAuditProvider, createAuditProvider, type AuditProvider } from '../jobs/audit/provider.ts';
import { bedrockClientSource, usdFor, type BedrockConverseOutput } from '../ai/bedrock.ts';
import { ProviderError } from '../ai/errors.ts';
import { createS3 } from '../storage/s3.ts';
import { createApp } from './app.ts';

/*
 * Story 13.8 (contract 15) through the routes, in process with a spy send to the `audit`
 * queue (the `caption-batch` pattern): a tap's POST answers 202 and creates one `queued`
 * run; the job, run inline under `fake`, writes only `audit_run/*` ops and the relatório
 * stream pulled at version 15 carries the run's create and its findings; a second POST while
 * the run is active answers 409 `audit_running` with its id and sends nothing; AI features
 * off answer 409 `ai_features_off` with no run and no job; the barrier and the 404 are the
 * preview's; a version-14 pull is refused (426, `MIN_CONTRACT_VERSION` 15). The `audit run`
 * log line carries the model, prompt version, tokens and USD, on `fake` and on Bedrock
 * through an injected client.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const DEVICE = 'tablet-audit';
const HAIKU = 'global.anthropic.claude-haiku-4-5-20251001-v1:0';
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});
const staticDir = mkdtempSync(join(tmpdir(), 'audit-route-'));
const up = async () => undefined;
const probes = { db: up, queue: up, storage: up, libreoffice: up };
const relatorios = new Set<string>();
const projects = new Set<string>();

let cookie = '';

async function signIn(): Promise<string> {
  const res = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { origin: apiUrl, 'content-type': 'application/json' },
    body: JSON.stringify({ email: companyA.email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

type App = ReturnType<typeof createApp>;

function appWith(sent: AuditPayload[], options: { aiFeatures?: boolean } = {}): App {
  return createApp({ probes, auth, db, s3, bucket: config.S3_BUCKET, staticDir, enqueueAudit: async (payload) => void sent.push(payload), ...options });
}

function request(app: App, path: string, init: RequestInit = {}, version: number = CONTRACT_VERSION): Promise<Response> | Response {
  return app.request(path, { ...init, headers: { cookie, [CONTRACT_VERSION_HEADER]: String(version), ...(init.headers as Record<string, string>) } });
}

const stamp = (draft: OpDraft): Op => makeOp({ ...draft, device_id: DEVICE }, { newId, now: now() });

async function push(app: App, batch: Op[]): Promise<void> {
  const res = await request(app, '/api/sync/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: batch }) });
  expect(res.status, await res.clone().text()).toBe(200);
  expect(syncPushResponseSchema.parse(await res.json()).rejected).toEqual([]);
}

let shade = 0;

/** A relatório of the standard template with one chave seccionadora and one captioned photo, pushed by company A's device; its newest op id. */
async function relatorio(app: App): Promise<{ relatorioId: string; blockId: string; photoId: string; lastOpId: string }> {
  const projectId = newId();
  projects.add(projectId);
  const projectDraft: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: companyA.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra auditoria', site: 'Obra auditoria', removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: companyA.userId,
  };
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: newId() }),
    { id: projectId },
    { service_start: '2026-10-06', service_end: '2026-10-07', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: companyA.userId, companyId: companyA.companyId },
  );
  relatorios.add(relatorioId);
  const coluna = drafts.map((draft) => draft.value as unknown as LocationRow).find((row) => row?.kind === 'coluna')!;
  const pair = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId,
    projectId,
    locationId: coluna.id,
    type: 'chave_seccionadora',
    tag: `SEC-A${shade++}`,
    seedVersion: 'v3',
    orderKey: 'zz',
  });
  const photoId = newId();
  const envelope = { company_id: companyA.companyId, prev_op_id: null, batch_id: null, meta: null, actor_id: companyA.userId, kind: 'create' as const };
  const creation = [
    projectDraft,
    ...drafts,
    { ...envelope, scope: 'project' as const, project_id: projectId, relatorio_id: null, path: `equipment/${pair.equipment.id}`, value: pair.equipment as never },
    { ...envelope, scope: 'relatorio' as const, project_id: null, relatorio_id: relatorioId, path: `block/${pair.block.id}`, value: pair.block as never },
    {
      ...envelope,
      scope: 'relatorio' as const,
      project_id: null,
      relatorio_id: relatorioId,
      path: `file/${photoId}`,
      value: {
        id: photoId,
        company_id: companyA.companyId,
        relatorio_id: relatorioId,
        kind: 'photo',
        sha256: 'a'.repeat(64),
        mime: 'image/jpeg',
        size: 1000,
        uploaded_at: null,
        variants: null,
        removed_at: null,
        captured_at: '2026-10-06T10:00:00.000Z',
        tz_offset: -180,
        coords: null,
        local_seq: 1,
        block_id: null,
        item_key: null,
        caption: 'Vista do transformador de força',
        reading_kind: null,
        reading_target: null,
        reading_status: 'none',
        people_in_photo: false,
      } as never,
    },
  ].map(stamp);
  await push(app, creation);
  return { relatorioId, blockId: pair.block.id, photoId, lastOpId: creation.at(-1)!.op_id };
}

async function postAudit(app: App, relatorioId: string, lastOpId: string | null): Promise<Response> {
  return request(app, `/api/relatorios/${relatorioId}/audit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ last_op_id: lastOpId, file_ids_expected: [] }),
  });
}

async function runsOf(relatorioId: string): Promise<AuditRunRow[]> {
  const rows = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'audit_run'), eq(entities.relatorio_id, relatorioId)));
  return rows.map((record) => auditRunRowSchema.parse(record.row));
}

async function opsBy(relatorioId: string, actor: string): Promise<{ path: string }[]> {
  return db
    .select({ path: ops.path })
    .from(ops)
    .where(and(eq(ops.company_id, companyA.companyId), eq(ops.relatorio_id, relatorioId), eq(ops.actor_id, actor)));
}

const jobDeps = (provider: AuditProvider): AuditJobDeps => ({ db, now, newId, provider });

/** The `audit run` lines logged while `body` runs. */
async function auditLogLines(body: () => Promise<unknown>): Promise<Record<string, unknown>[]> {
  const spy = vi.spyOn(console, 'log');
  try {
    await body();
    return spy.mock.calls
      .map(([line]) => (typeof line === 'string' && line.startsWith('{') ? (JSON.parse(line) as Record<string, unknown>) : null))
      .filter((line): line is Record<string, unknown> => line !== null && line.msg === 'audit run');
  } finally {
    spy.mockRestore();
  }
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  cookie = await signIn();
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  const ids = [...relatorios];
  if (ids.length > 0) {
    await db.delete(ops).where(and(eq(ops.company_id, companyA.companyId), inArray(ops.relatorio_id, ids)));
    await db.delete(entities).where(and(eq(entities.company_id, companyA.companyId), inArray(entities.relatorio_id, ids)));
    await db.delete(entities).where(and(eq(entities.company_id, companyA.companyId), inArray(entities.id, ids)));
  }
  for (const projectId of projects) {
    await db.delete(ops).where(and(eq(ops.company_id, companyA.companyId), like(ops.path, `project/${projectId}%`)));
    await db.delete(ops).where(and(eq(ops.company_id, companyA.companyId), eq(ops.project_id, projectId)));
    await db.delete(entities).where(and(eq(entities.company_id, companyA.companyId), eq(entities.project_id, projectId)));
    await db.delete(entities).where(and(eq(entities.company_id, companyA.companyId), eq(entities.id, projectId)));
  }
  rmSync(staticDir, { recursive: true, force: true });
  await sql.end();
});

describe('13.8-API-001 one tap, one run, one job', () => {
  it('POST answers 202 with a queued run; the fake job writes only the run; the stream at version 15 carries its create and one finding per kind', async () => {
    const sent: AuditPayload[] = [];
    const app = appWith(sent);
    const { relatorioId, blockId, photoId, lastOpId } = await relatorio(app);

    const res = await postAudit(app, relatorioId, lastOpId);
    expect(res.status, await res.clone().text()).toBe(202);
    const { audit_run_id: runId } = auditResponseSchema.parse(await res.json());
    expect(sent).toEqual([{ run_id: runId, company_id: companyA.companyId, relatorio_id: relatorioId, actor_id: companyA.userId }]);
    const [queued] = await runsOf(relatorioId);
    expect(queued).toMatchObject({ id: runId, status: 'queued', findings: [] });

    const before = (await db.select({ op_id: ops.op_id }).from(ops).where(and(eq(ops.company_id, companyA.companyId), eq(ops.relatorio_id, relatorioId)))).length;
    const lines = await auditLogLines(() => runAuditJob(jobDeps(createAuditProvider({ LLM_PROVIDER: 'fake', AI_FEATURES: 'on' })), sent[0]!));

    // The job wrote only the run: every op of `system:audit` is an `audit_run` op, and nothing else was added.
    const audit = await opsBy(relatorioId, 'system:audit');
    expect(audit.length).toBeGreaterThan(1);
    for (const op of audit) expect(op.path.startsWith(`audit_run/${runId}`)).toBe(true);
    const after = (await db.select({ op_id: ops.op_id }).from(ops).where(and(eq(ops.company_id, companyA.companyId), eq(ops.relatorio_id, relatorioId)))).length;
    expect(after - before).toBe(audit.length - 1);

    const [done] = await runsOf(relatorioId);
    expect(done!.status).toBe('done');
    expect(done!.prompt_version).toBe('fake-audit-1');
    expect(done!.finished_at).not.toBeNull();
    expect(done!.findings.map((finding) => finding.kind)).toEqual([...AUDIT_FINDING_KINDS]);
    // The fake cites the first sheet and the first row in text order (the template's own sheets come first).
    const sheetIds = new Set((await db.select({ id: entities.id }).from(entities).where(and(eq(entities.entity, 'block'), eq(entities.relatorio_id, relatorioId)))).map((row) => row.id));
    expect(sheetIds.has(blockId)).toBe(true);
    expect(done!.findings.map((finding) => finding.target)).toEqual([
      { kind: 'sheet', blockId: expect.any(String) },
      { kind: 'sheet', blockId: expect.any(String) },
      { kind: 'section', rowKey: 'section_10' },
      { kind: 'photos' },
    ]);
    for (const finding of done!.findings.slice(0, 2)) expect(sheetIds.has((finding.target as { blockId: string }).blockId)).toBe(true);
    expect(done!.findings[3]!.ref).toBe(`photo:${photoId}`);
    expect(done!.findings[2]!.label).toBe('Seção 10 · Conclusão e parecer');

    // The `audit run` line: model, prompt version, tokens and USD (0 on fake), counts and duration.
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      company_id: companyA.companyId,
      relatorio_id: relatorioId,
      audit_run_id: runId,
      status: 'done',
      model: 'fake',
      prompt_version: 'fake-audit-1',
      input_tokens: 0,
      output_tokens: 0,
      usd: 0,
      findings: 4,
      dropped: 0,
    });
    expect(typeof lines[0]!.duration_ms).toBe('number');

    // The relatório stream at the current contract carries the run's create and its findings put.
    const pull = await request(app, `/api/sync/relatorios/${relatorioId}?since=0`);
    expect(pull.status).toBe(200);
    const pulled = syncPullResponseSchema.parse(await pull.json()).ops.map((op) => opSchema.parse(op));
    const create = pulled.find((op) => op.path === `audit_run/${runId}`);
    expect(create?.kind).toBe('create');
    const findings = pulled.find((op) => op.path === `audit_run/${runId}/findings`);
    expect((findings?.value as unknown[]).length).toBe(4);
    expect(pulled.find((op) => op.path === `audit_run/${runId}/status` && op.value === 'done')).toBeDefined();
  });

  it('a second POST while the run is active answers 409 audit_running with its id and sends no second job', async () => {
    const sent: AuditPayload[] = [];
    const app = appWith(sent);
    const { relatorioId, lastOpId } = await relatorio(app);
    const first = await postAudit(app, relatorioId, lastOpId);
    expect(first.status).toBe(202);
    const { audit_run_id: runId } = auditResponseSchema.parse(await first.json());

    const second = await postAudit(app, relatorioId, lastOpId);
    expect(second.status).toBe(409);
    const body = errorResponseSchema.parse(await second.json());
    expect(body.code).toBe('audit_running');
    expect(auditRunningDetailsSchema.parse(body.details)).toEqual({ audit_run_id: runId });
    expect(sent).toHaveLength(1);
    expect(await runsOf(relatorioId)).toHaveLength(1);

    // Once the run is done, a new tap is a new run.
    await runAuditJob(jobDeps(createAuditProvider({ LLM_PROVIDER: 'fake', AI_FEATURES: 'on' })), sent[0]!);
    const third = await postAudit(app, relatorioId, lastOpId);
    expect(third.status).toBe(202);
    expect(sent).toHaveLength(2);
    expect(await runsOf(relatorioId)).toHaveLength(2);
  });

  it('a provider failure fails the run with its error code; the button may ask again', async () => {
    const sent: AuditPayload[] = [];
    const app = appWith(sent);
    const { relatorioId, lastOpId } = await relatorio(app);
    expect((await postAudit(app, relatorioId, lastOpId)).status).toBe(202);
    const failing: AuditProvider = {
      async audit() {
        throw new ProviderError('bedrock: ThrottlingException: slow down');
      },
    };
    const lines = await auditLogLines(() => runAuditJob(jobDeps(failing), sent[0]!));
    const [failed] = await runsOf(relatorioId);
    expect(failed).toMatchObject({ status: 'failed', error: 'provider_failed', findings: [] });
    expect(lines[0]).toMatchObject({ status: 'failed', error: 'provider_failed', error_class: 'ProviderError' });
    expect((await postAudit(app, relatorioId, lastOpId)).status).toBe(202);
  });

  it('API-V2 (review 2026-10-08): a denied Bedrock call fails the run as provider_refused, not invalid_output', async () => {
    const sent: AuditPayload[] = [];
    const app = appWith(sent);
    const { relatorioId, lastOpId } = await relatorio(app);
    expect((await postAudit(app, relatorioId, lastOpId)).status).toBe(202);
    const denied = bedrockAuditProvider({
      source: bedrockClientSource({
        region: 'us-east-1',
        client: {
          async send() {
            throw Object.assign(new Error('User is not authorized to perform: bedrock:InvokeModel'), { name: 'AccessDeniedException', $fault: 'client' });
          },
        },
      }),
      modelId: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
    });
    const lines = await auditLogLines(() => runAuditJob(jobDeps(denied), sent[0]!));
    const [failed] = await runsOf(relatorioId);
    expect(failed).toMatchObject({ status: 'failed', error: 'provider_refused', findings: [] });
    expect(lines[0]).toMatchObject({ status: 'failed', error: 'provider_refused', error_class: 'ProviderRefusedError' });
  });
});

describe('13.8-API-004 the queue refuses the job', () => {
  it('answers 500, records the run failed/enqueue_failed, and a later tap with a working queue is queued (not 409)', async () => {
    const broken = createApp({
      probes,
      auth,
      db,
      s3,
      bucket: config.S3_BUCKET,
      staticDir,
      enqueueAudit: async () => {
        throw new Error('boom');
      },
    });
    const { relatorioId, lastOpId } = await relatorio(broken);
    const failed = await postAudit(broken, relatorioId, lastOpId);
    expect(failed.status).toBe(500);
    expect(errorResponseSchema.parse(await failed.json()).code).toBe('internal_error');
    const afterFailure = await runsOf(relatorioId);
    expect(afterFailure).toHaveLength(1);
    expect(afterFailure[0]).toMatchObject({ status: 'failed', error: 'enqueue_failed' });

    const sent: AuditPayload[] = [];
    const working = appWith(sent);
    const queued = await postAudit(working, relatorioId, lastOpId);
    expect(queued.status, await queued.clone().text()).toBe(202);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.run_id).toBe(auditResponseSchema.parse(await queued.json()).audit_run_id);
  });
});

describe('13.8-API-002 refusals', () => {
  it('AI features off: 409 ai_features_off, no run, no job', async () => {
    const sent: AuditPayload[] = [];
    const app = appWith(sent, { aiFeatures: false });
    const { relatorioId, lastOpId } = await relatorio(appWith([]));
    const res = await postAudit(app, relatorioId, lastOpId);
    expect(res.status).toBe(409);
    expect(errorResponseSchema.parse(await res.json()).code).toBe('ai_features_off');
    expect(sent).toEqual([]);
    expect(await runsOf(relatorioId)).toEqual([]);
  });

  it('the barrier answers 409 not_caught_up for an op the server lacks, an unknown relatório 404, a bad body 400', async () => {
    const sent: AuditPayload[] = [];
    const app = appWith(sent);
    const { relatorioId } = await relatorio(app);
    const missing = await postAudit(app, relatorioId, newId());
    expect(missing.status).toBe(409);
    expect(errorResponseSchema.parse(await missing.json()).code).toBe('not_caught_up');
    expect((await postAudit(app, newId(), null)).status).toBe(404);
    const bad = await request(app, `/api/relatorios/${relatorioId}/audit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(bad.status).toBe(400);
    expect(sent).toEqual([]);
    expect(await runsOf(relatorioId)).toEqual([]);
  });

  it('a version-14 pull is refused (426 contract_outdated): below MIN_CONTRACT_VERSION (15 at Story 13.8, 16 since PR #121)', async () => {
    const app = appWith([]);
    const res = await request(app, `/api/sync/relatorios/${newId()}?since=0`, {}, 14);
    expect(res.status).toBe(426);
    expect(errorResponseSchema.parse(await res.json()).code).toBe('contract_outdated');
  });
});

describe('13.8-API-003 the Bedrock audit logs its tokens and USD', () => {
  it('one Converse call on an injected client; a finding citing a ref not sent is dropped and counted', async () => {
    const sent: AuditPayload[] = [];
    const app = appWith(sent);
    const { relatorioId, lastOpId } = await relatorio(app);
    expect((await postAudit(app, relatorioId, lastOpId)).status).toBe(202);
    const commands: ConverseCommand[] = [];
    const answer: BedrockConverseOutput = {
      output: {
        message: {
          role: 'assistant',
          content: [
            {
              toolUse: {
                toolUseId: 't1',
                name: AUDIT_TOOL,
                input: {
                  findings: [
                    { kind: 'parecer_vs_restricoes', ref: 'section:10', text: 'O parecer não cita as restrições.' },
                    { kind: 'conclusion_vs_nc', ref: `sheet:${newId()}`, text: 'Inventado.' },
                  ],
                } as never,
              },
            },
          ],
        },
      },
      stopReason: 'tool_use',
      usage: { inputTokens: 8000, outputTokens: 200, totalTokens: 8200 },
    };
    const client = {
      async send(command: ConverseCommand) {
        commands.push(command);
        return answer;
      },
    };
    const provider = bedrockAuditProvider({ source: bedrockClientSource({ region: 'us-east-1', client }), modelId: HAIKU });
    const lines = await auditLogLines(() => runAuditJob(jobDeps(provider), sent[0]!));
    expect(commands).toHaveLength(1);
    // Text and values only: no image block is sent.
    expect(JSON.stringify(commands[0]!.input.messages)).not.toContain('"image"');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      status: 'done',
      model: HAIKU,
      prompt_version: AUDIT_PROMPT_VERSION,
      input_tokens: 8000,
      output_tokens: 200,
      usd: usdFor(HAIKU, { input_tokens: 8000, output_tokens: 200 }),
      findings: 1,
      dropped: 1,
    });
    const [done] = await runsOf(relatorioId);
    expect(done!.prompt_version).toBe(AUDIT_PROMPT_VERSION);
    expect(done!.findings.map((finding) => finding.ref)).toEqual(['section:10']);
  });
});
