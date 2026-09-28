import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  errorResponseSchema,
  instantiateTemplate,
  makeOp,
  plateReadingTarget,
  readingRereadPath,
  readingRereadResponseSchema,
  readingSingletonKey,
  sheetNameplatePath,
  standardTemplate,
  suggestionRowSchema,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type BlockRow,
  type Op,
  type OpDraft,
  type SuggestionRow,
} from '@app/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { entities, ops, readingRuns } from '../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { newId } from '../ids.ts';

/*
 * Stories 8.4 and 8.5 end to end over the compose api, as wired by default (env `fake`
 * providers, the committed fixtures, the worker in the api process): a device pushes a
 * relatório with a transformer and the plate photo's create, PUTs the synthetic plate, and
 * pulls `running`, `done` and the eleven suggestions of the fixture README; then the
 * idempotent PUT, the reread and every refusal of the new route, cross-tenant included.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const companyB = TEST_SEED.companies[1];
type Company = (typeof TEST_SEED.companies)[number];

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

const PLATE = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../../../../services/ocr/tests/fixtures/plate-transformador.jpg')));
const PLATE_SHA = 'a1eac9106f186a29ca82e896741922794eda7f86a231c4dcf942031d14dc26ac';
const TOKENS = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../../services/ocr/tests/fixtures/plate-transformador.tokens.json'), 'utf8')) as {
  tokens: { text: string; bbox: [number, number, number, number] }[];
};
const DEVICE = 'tablet-reading-a';
const TYPED_AT = { raw: '15', unit: 'kV', state: 'measured' };

const written = { opIds: new Set<string>(), entityIds: new Set<string>(), relatorioIds: new Set<string>(), photoIds: new Set<string>() };
const cookies = new Map<string, string>();

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    redirect: 'manual',
    headers: { origin: apiUrl, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), ...(init.headers as Record<string, string> | undefined) },
  });
}

async function signIn(company: Company): Promise<string> {
  const res = await call('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: company.email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

/** Retries once on 401: another suite's re-seed revokes sessions. */
async function authed(company: Company, path: string, init: RequestInit = {}): Promise<Response> {
  const attempt = async (fresh: boolean) => {
    if (fresh || !cookies.has(company.email)) cookies.set(company.email, await signIn(company));
    return call(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), cookie: cookies.get(company.email)! } });
  };
  const first = await attempt(false);
  return first.status === 401 ? attempt(true) : first;
}

const stamp = (draft: OpDraft): Op => makeOp({ ...draft, device_id: DEVICE }, { newId, now: now() });

async function push(company: Company, batch: Op[]): Promise<void> {
  for (const op of batch) written.opIds.add(op.op_id);
  const res = await authed(company, '/api/sync/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: batch }) });
  expect(res.status, await res.clone().text()).toBe(200);
  expect(syncPushResponseSchema.parse(await res.json()).rejected).toEqual([]);
}

function companyDraft(path: string, value: unknown): OpDraft {
  return { kind: 'create', scope: 'company', company_id: companyA.companyId, project_id: null, relatorio_id: null, path, value: value as never, prev_op_id: null, batch_id: null, meta: null, actor_id: companyA.userId };
}

/** A standard-template relatório of company A with its first transformer's TENSÃO NOMINAL AT typed. */
async function relatorio(): Promise<{ relatorioId: string; transformer: BlockRow }> {
  const projectId = newId();
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: newId() }),
    { id: projectId },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: companyA.userId, companyId: companyA.companyId },
  );
  written.relatorioIds.add(relatorioId);
  written.entityIds.add(projectId);
  const transformer = drafts.map((d) => d.value as unknown as BlockRow).find((row) => row?.block_type === 'transformador_forca')!;
  const typed: OpDraft = {
    kind: 'put',
    scope: 'relatorio',
    company_id: companyA.companyId,
    project_id: null,
    relatorio_id: relatorioId,
    path: sheetNameplatePath(transformer.id, 'tensao_nominal_at'),
    value: TYPED_AT,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: companyA.userId,
  };
  await push(companyA, [companyDraft(`project/${projectId}`, { id: projectId, client_id: null, name: 'Obra placa', site: 'Obra placa', removed_at: null }), ...drafts, typed].map(stamp));
  return { relatorioId, transformer };
}

/** The device's photo create for `block` (a plate reading by default). */
async function photoCreate(relatorioId: string, block: BlockRow, bytes: Uint8Array, reading: 'plate' | null = 'plate'): Promise<string> {
  const id = newId();
  written.entityIds.add(id);
  written.photoIds.add(id);
  await push(companyA, [
    stamp({
      kind: 'create',
      scope: 'relatorio',
      company_id: companyA.companyId,
      project_id: null,
      relatorio_id: relatorioId,
      path: `file/${id}`,
      value: {
        id,
        company_id: companyA.companyId,
        relatorio_id: relatorioId,
        kind: 'photo',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        mime: 'image/jpeg',
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
        reading_kind: reading,
        reading_target: reading === null ? null : plateReadingTarget(block.id, block.block_type),
        reading_status: reading === null ? 'none' : 'queued',
      } as never,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: companyA.userId,
    }),
  ]);
  return id;
}

function put(company: Company, id: string, body: Uint8Array): Promise<Response> {
  return authed(company, `/api/files/${id}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body });
}

function reread(company: Company, id: string): Promise<Response> {
  return authed(company, readingRereadPath(id), { method: 'POST' });
}

async function pullAll(relatorioId: string): Promise<Op[]> {
  const all: Op[] = [];
  let since = 0;
  for (;;) {
    const res = await authed(companyA, `/api/sync/relatorios/${relatorioId}?since=${since}`);
    expect(res.status, await res.clone().text()).toBe(200);
    const page = syncPullResponseSchema.parse(await res.json());
    all.push(...(page.ops as Op[]));
    if (page.ops.length === 0 || page.seq === since) return all;
    since = page.seq;
  }
}

const statusOps = (all: Op[], photoId: string) => all.filter((op) => op.path === `file/${photoId}/reading_status`);

async function waitForStatuses(relatorioId: string, photoId: string, count: number): Promise<Op[]> {
  const deadline = Date.now() + 40_000;
  for (;;) {
    const all = await pullAll(relatorioId);
    const statuses = statusOps(all, photoId);
    if (statuses.length >= count && statuses.at(-1)!.value !== 'running') return all;
    if (Date.now() > deadline) throw new Error(`reading_status ops: ${JSON.stringify(statuses.map((op) => op.value))}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
}

async function jobsFor(photoId: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from pgboss.job where name = 'reading' and singleton_key = ${readingSingletonKey(photoId, 'plate')}`;
  return row!.n;
}

async function runsOf(photoId: string) {
  return db.select().from(readingRuns).where(and(eq(readingRuns.company_id, companyA.companyId), eq(readingRuns.photo_id, photoId))).orderBy(asc(readingRuns.created_at));
}

const HINT_CELTTA = { create_registry_entry: { kind: 'manufacturer', name: 'Celtta' } };
const TABLE: [string, unknown, string[], 'suggested' | 'verify', unknown][] = [
  ['identificacao', 'TR-01', ['t4'], 'suggested', null],
  ['fabricacao', 'Celtta', ['t6'], 'suggested', HINT_CELTTA],
  ['n_serie', '240815-07', ['t9'], 'suggested', null],
  ['tipo', 'TSE-500/15', ['t11'], 'suggested', null],
  ['tipo_de_isolacao', 'EPÓXI', ['t15'], 'suggested', null],
  ['potencia_nominal', { raw: '500', unit: 'kVA', state: 'measured' }, ['t22', 't23'], 'suggested', null],
  ['tap_atual', '5', ['t26'], 'verify', null],
  ['data_fabricacao', '2024-08', ['t29'], 'suggested', null],
  ['tensao_nominal_at', { raw: '15', unit: 'kV', state: 'measured' }, ['t33', 't34'], 'suggested', null],
  ['tensao_nominal_bt', { raw: '380', unit: 'V', state: 'measured' }, ['t38', 't39'], 'suggested', null],
  ['ligacao_secundaria', 'Dyn1', ['t42'], 'suggested', null],
];

function expectedBbox(ids: string[]): number[] {
  const boxes = ids.map((id) => TOKENS.tokens[Number(id.slice(1))]!.bbox);
  const round = (v: number) => Math.round(v * 10_000) / 10_000;
  return [
    round(Math.min(...boxes.map((b) => b[0])) / 1600),
    round(Math.min(...boxes.map((b) => b[1])) / 1100),
    round(Math.max(...boxes.map((b) => b[2])) / 1600),
    round(Math.max(...boxes.map((b) => b[3])) / 1100),
  ];
}

function createdSuggestions(all: Op[]): SuggestionRow[] {
  return all.filter((op) => op.kind === 'create' && op.path.startsWith('suggestion/')).map((op) => suggestionRowSchema.parse(op.value));
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
}, 60_000);

afterAll(async () => {
  const relatorios = [...written.relatorioIds];
  if (relatorios.length > 0) {
    await db.delete(ops).where(inArray(ops.relatorio_id, relatorios));
    await db.delete(entities).where(inArray(entities.relatorio_id, relatorios));
  }
  if (written.opIds.size > 0) await db.delete(ops).where(inArray(ops.op_id, [...written.opIds]));
  if (written.entityIds.size > 0) await db.delete(entities).where(inArray(entities.id, [...written.entityIds]));
  if (written.photoIds.size > 0) await db.delete(readingRuns).where(inArray(readingRuns.photo_id, [...written.photoIds]));
  await sql.end();
}, 60_000);

describe('8.4-INT the plate read end to end over the compose api', () => {
  let relatorioId = '';
  let photoId = '';
  let transformer: BlockRow;
  let firstRun: SuggestionRow[] = [];

  it('the first PUT sends one job: running, then done, with the eleven suggestions of the README', async () => {
    expect(createHash('sha256').update(PLATE).digest('hex')).toBe(PLATE_SHA);
    ({ relatorioId, transformer } = await relatorio());
    photoId = await photoCreate(relatorioId, transformer, PLATE);
    const res = await put(companyA, photoId, PLATE);
    expect(res.status, await res.clone().text()).toBe(200);

    const all = await waitForStatuses(relatorioId, photoId, 2);
    const statuses = statusOps(all, photoId);
    expect(statuses.map((op) => op.value)).toEqual(['running', 'done']);
    expect(statuses.every((op) => op.actor_id === 'system:reading' && op.device_id === 'server')).toBe(true);

    const rows = createdSuggestions(all);
    expect(rows).toHaveLength(11);
    const [run] = await runsOf(photoId);
    expect(run).toMatchObject({
      outcome: 'ok',
      attempt: 1,
      relatorio_id: relatorioId,
      reading_kind: 'plate',
      ocr_provider: 'fake',
      model: 'fake',
      prompt_version: 'fake-1',
      llm_usage: { input_tokens: 0, output_tokens: 0, usd: 0 },
      error: null,
    });
    for (const [key, value, cited, trust, hint] of TABLE) {
      const row = rows.find((r) => r.target_path === sheetNameplatePath(transformer.id, key));
      expect(row, key).toBeDefined();
      expect(row, key).toMatchObject({
        relatorio_id: relatorioId,
        value,
        trust,
        hint,
        mode: key === 'tensao_nominal_at' ? 'replace' : 'fill',
        status: 'pending',
        prompt_version: 'fake-1',
        source: { photo_id: photoId, bbox: expectedBbox(cited), ocr_token_ids: cited, reading_run_id: run!.id },
      });
    }
    expect(rows.find((r) => r.target_path.endsWith('/vol_oleo'))).toBeUndefined();
    // The discards (none), the creates and `done` are one batch.
    const batch = new Set(all.filter((op) => op.path.startsWith('suggestion/') || op.value === 'done').map((op) => op.batch_id));
    expect(batch.size).toBe(1);
    expect([...batch][0]).not.toBeNull();
    expect(await jobsFor(photoId)).toBe(1);
    firstRun = rows;
  }, 90_000);

  it('a retried PUT sends no second job and writes no status op', async () => {
    const res = await put(companyA, photoId, PLATE);
    expect(res.status).toBe(200);
    await new Promise((resolveWait) => setTimeout(resolveWait, 3_000));
    expect(statusOps(await pullAll(relatorioId), photoId).map((op) => op.value)).toEqual(['running', 'done']);
    expect(await jobsFor(photoId)).toBe(1);
    expect(await runsOf(photoId)).toHaveLength(1);
  }, 60_000);

  it('another company answers the unknown-id 404 on a reread and 409 on a PUT, and changes nothing', async () => {
    const before = await pullAll(relatorioId);
    const foreign = await reread(companyB, photoId);
    const unknown = await reread(companyB, newId());
    const malformed = await reread(companyB, 'not-a-uuid');
    expect([foreign.status, unknown.status, malformed.status]).toEqual([404, 404, 404]);
    const bodies = await Promise.all([foreign.text(), unknown.text(), malformed.text()]);
    expect(new Set(bodies).size).toBe(1);
    expect(errorResponseSchema.parse(JSON.parse(bodies[0]!)).code).toBe('not_found');

    const stolen = await put(companyB, photoId, PLATE);
    expect(stolen.status).toBe(409);
    expect(errorResponseSchema.parse(await stolen.json()).code).toBe('file_row_missing');
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_500));
    const after = await pullAll(relatorioId);
    expect(after.map((op) => op.op_id)).toEqual(before.map((op) => op.op_id));
    expect(await jobsFor(photoId)).toBe(1);
  }, 60_000);

  it('a reread answers 202 running, makes a new run and discards the previous pending suggestions', async () => {
    const res = await reread(companyA, photoId);
    expect(res.status, await res.clone().text()).toBe(202);
    expect(readingRereadResponseSchema.parse(await res.json())).toEqual({ photo_id: photoId, reading_status: 'running' });

    const all = await waitForStatuses(relatorioId, photoId, 4);
    expect(statusOps(all, photoId).map((op) => op.value)).toEqual(['running', 'done', 'running', 'done']);
    const runs = await runsOf(photoId);
    expect(runs).toHaveLength(2);
    expect(runs[1]!.id).not.toBe(runs[0]!.id);
    for (const old of firstRun) {
      const discard = all.find((op) => op.path === `suggestion/${old.id}/status`);
      expect(discard?.value, old.target_path).toBe('discarded');
      expect(discard?.actor_id).toBe('system:reading');
    }
    const fresh = createdSuggestions(all).filter((row) => row.source.reading_run_id === runs[1]!.id);
    expect(fresh).toHaveLength(11);
    expect(await jobsFor(photoId)).toBe(2);
  }, 90_000);

  it('a reread of a photo that is not a plate reading is 400, of one not uploaded yet 409, of a non-photo 404', async () => {
    const plain = await photoCreate(relatorioId, transformer, PLATE, null);
    const notReadable = await reread(companyA, plain);
    expect(notReadable.status).toBe(400);
    expect(errorResponseSchema.parse(await notReadable.json()).code).toBe('invalid_request');

    const waiting = await photoCreate(relatorioId, transformer, PLATE);
    const notUploaded = await reread(companyA, waiting);
    expect(notUploaded.status).toBe(409);
    expect(errorResponseSchema.parse(await notUploaded.json()).code).toBe('not_caught_up');
    expect(await jobsFor(waiting)).toBe(0);

    const certificateId = newId();
    written.entityIds.add(certificateId);
    await push(companyA, [
      stamp(
        companyDraft(`file/${certificateId}`, {
          id: certificateId,
          company_id: companyA.companyId,
          relatorio_id: null,
          kind: 'certificate',
          sha256: 'cd'.repeat(32),
          mime: 'application/pdf',
          size: 10,
          uploaded_at: null,
          variants: null,
          removed_at: null,
        }),
      ),
    ]);
    const notPhoto = await reread(companyA, certificateId);
    expect(notPhoto.status).toBe(404);
    expect(await notPhoto.text()).toBe(await (await reread(companyA, newId())).text());
  }, 60_000);
});
