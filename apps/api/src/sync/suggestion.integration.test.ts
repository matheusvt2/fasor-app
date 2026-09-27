import {
  confirmSuggestionOps,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  instantiateTemplate,
  makeOp,
  SERVER_DEVICE_ID,
  standardTemplate,
  suggestionPath,
  suggestionRowSchema,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type BlockRow,
  type Op,
  type OpDraft,
  type SuggestionRow,
  type SyncPushResponse,
} from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { entities, ops } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { applyOps } from './apply.ts';

/*
 * Story 8.1 (contract 5) through the sync route: a device never writes a suggestion row
 * (`suggestion/{id}` is server-only), but it confirms one the server wrote
 * (`suggestion/{id}/status` plus the target put carrying `meta.source_suggestion_id`); a
 * device's photo create may queue a reading (`reading_status: queued` with its kind), never
 * report one.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const company = TEST_SEED.companies[0];
const DEVICE = 'tablet-test-suggestions';

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

const written = { opIds: new Set<string>(), entityIds: new Set<string>() };
let cookie = '';

async function signIn(): Promise<string> {
  const res = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json', origin: apiUrl },
    body: JSON.stringify({ email: company.email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

async function authed(path: string, init: RequestInit = {}): Promise<Response> {
  const call = () =>
    fetch(`${apiUrl}${path}`, {
      ...init,
      redirect: 'manual',
      headers: { 'content-type': 'application/json', origin: apiUrl, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), cookie, ...(init.headers as Record<string, string> | undefined) },
    });
  const first = await call();
  if (first.status !== 401) return first;
  cookie = await signIn();
  return call();
}

async function push(batch: Op[]): Promise<SyncPushResponse> {
  for (const op of batch) written.opIds.add(op.op_id);
  const res = await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
  expect(res.status, await res.clone().text()).toBe(200);
  return syncPushResponseSchema.parse(await res.json());
}

const stamp = (draft: OpDraft): Op => makeOp({ ...draft, device_id: DEVICE }, { newId, now: now() });
const author = { id: company.userId, companyId: company.companyId };

async function entityRow<T>(entity: string, id: string): Promise<T | undefined> {
  const [row] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, entity), eq(entities.id, id)));
  return row?.row as T | undefined;
}

/** A relatório of the standard template pushed by this company's device; returns its id and a Chave seccionadora block. */
async function relatorio(): Promise<{ relatorioId: string; blockId: string }> {
  const projectId = newId();
  const projectDraft: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: company.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra sugestões', site: 'Obra sugestões', removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: company.userId,
  };
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: newId() }),
    { id: projectId },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: company.userId, companyId: company.companyId },
  );
  const creation = [projectDraft, ...drafts].map(stamp);
  for (const op of creation) written.entityIds.add((op.value as { id: string }).id);
  const pushed = await push(creation);
  expect(pushed.rejected).toEqual([]);
  const block = drafts.map((draft) => draft.value as unknown as BlockRow).find((row) => row?.block_type === 'chave_seccionadora');
  return { relatorioId, blockId: block!.id };
}

function suggestionRow(relatorioId: string, blockId: string): SuggestionRow {
  return {
    id: newId(),
    relatorio_id: relatorioId,
    target_path: `sheet/${blockId}/nameplate/fabricacao`,
    value: 'Celtta',
    trust: 'suggested',
    mode: 'fill',
    source: { photo_id: newId(), bbox: [0.1, 0.2, 0.4, 0.3], ocr_token_ids: ['t3'], reading_run_id: newId() },
    status: 'pending',
    prompt_version: 'fake-1',
    hint: { create_registry_entry: { kind: 'manufacturer', name: 'Celtta' } },
  };
}

function suggestionCreate(row: SuggestionRow, device: string, actor: string): OpDraft & { device_id: string } {
  return {
    kind: 'create',
    scope: 'relatorio',
    company_id: company.companyId,
    project_id: null,
    relatorio_id: row.relatorio_id,
    path: suggestionPath(row.id),
    value: row as never,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: actor,
    device_id: device,
  };
}

function photoCreate(relatorioId: string, blockId: string, reading: { reading_kind: string | null; reading_status: string }): Op {
  const id = newId();
  written.entityIds.add(id);
  return stamp({
    kind: 'create',
    scope: 'relatorio',
    company_id: company.companyId,
    project_id: null,
    relatorio_id: relatorioId,
    path: `file/${id}`,
    value: {
      id,
      company_id: company.companyId,
      relatorio_id: relatorioId,
      kind: 'photo',
      sha256: 'ab'.repeat(32),
      mime: 'image/jpeg',
      size: 1234,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      captured_at: '2026-09-26T10:00:00.000Z',
      tz_offset: -180,
      coords: null,
      local_seq: 1,
      block_id: blockId,
      item_key: null,
      caption: 'Placa de identificação',
      reading_kind: reading.reading_kind,
      reading_target: reading.reading_kind === null ? null : { block_id: blockId, block_type: 'chave_seccionadora' },
      reading_status: reading.reading_status,
    } as never,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: company.userId,
  });
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  cookie = await signIn();
}, 60_000);

afterAll(async () => {
  const opIds = [...written.opIds];
  const entityIds = [...written.entityIds];
  if (opIds.length > 0) await db.delete(ops).where(inArray(ops.op_id, opIds));
  if (entityIds.length > 0) await db.delete(entities).where(inArray(entities.id, entityIds));
  await sql.end();
});

describe('8.1-API suggestions through the sync route', () => {
  it('refuses a client suggestion create as op_server_only and stores nothing of it', async () => {
    const { relatorioId, blockId } = await relatorio();
    const row = suggestionRow(relatorioId, blockId);
    written.entityIds.add(row.id);
    const create = makeOp(suggestionCreate(row, DEVICE, company.userId), { newId, now: now() });
    const result = await push([create]);
    expect(result.rejected).toEqual([{ op_id: create.op_id, code: 'op_server_only' }]);
    expect(result.applied).toEqual([]);
    expect(await entityRow('suggestion', row.id)).toBeUndefined();
  }, 60_000);

  it('accepts the confirm pair on a suggestion the server wrote: the row reads confirmed, the cell carries its provenance', async () => {
    const { relatorioId, blockId } = await relatorio();
    const row = suggestionRow(relatorioId, blockId);
    written.entityIds.add(row.id);
    const at = now();
    const serverCreate = makeOp(suggestionCreate(row, SERVER_DEVICE_ID, 'system:reading'), { newId, now: at });
    written.opIds.add(serverCreate.op_id);
    const applied = await applyOps(db, asCompanyId(company.companyId), [serverCreate], { origin: 'server', now: () => at });
    expect(applied.rejected).toEqual([]);
    expect(suggestionRowSchema.parse(await entityRow('suggestion', row.id))).toEqual(row);

    const confirm = confirmSuggestionOps(author, row).map(stamp);
    const result = await push(confirm);
    expect(result.rejected).toEqual([]);
    expect(result.applied.map((a) => a.op_id)).toEqual(confirm.map((op) => op.op_id));
    expect((await entityRow<SuggestionRow>('suggestion', row.id))!.status).toBe('confirmed');
    const block = (await entityRow<BlockRow>('block', blockId))!;
    expect(block.sheet.nameplate.fabricacao).toMatchObject({ value: 'Celtta', source_suggestion_id: row.id });

    // The relatório stream carries the server create (with its hint) and the confirm back.
    const pull = await authed(`/api/sync/relatorios/${relatorioId}?since=0`);
    expect(pull.status, await pull.clone().text()).toBe(200);
    const pulled = new Map((syncPullResponseSchema.parse(await pull.json()).ops as Op[]).map((op) => [op.op_id, op]));
    expect((pulled.get(serverCreate.op_id)!.value as SuggestionRow).hint).toEqual({ create_registry_entry: { kind: 'manufacturer', name: 'Celtta' } });
    expect(pulled.get(confirm[1]!.op_id)!.meta).toEqual({ source_suggestion_id: row.id });
  }, 60_000);

  it('accepts a photo create that queues a plate reading, and refuses one reporting a reading or queued without a kind', async () => {
    const { relatorioId, blockId } = await relatorio();
    const queued = photoCreate(relatorioId, blockId, { reading_kind: 'plate', reading_status: 'queued' });
    const plain = photoCreate(relatorioId, blockId, { reading_kind: null, reading_status: 'none' });
    const done = photoCreate(relatorioId, blockId, { reading_kind: 'plate', reading_status: 'done' });
    const running = photoCreate(relatorioId, blockId, { reading_kind: 'plate', reading_status: 'running' });
    const kindless = photoCreate(relatorioId, blockId, { reading_kind: null, reading_status: 'queued' });
    const result = await push([queued, plain, done, running, kindless]);
    expect(result.applied.map((a) => a.op_id)).toEqual([queued.op_id, plain.op_id]);
    expect(result.rejected).toEqual([
      { op_id: done.op_id, code: 'op_invalid' },
      { op_id: running.op_id, code: 'op_invalid' },
      { op_id: kindless.op_id, code: 'op_invalid' },
    ]);
    expect(await entityRow('file', (queued.value as { id: string }).id)).toMatchObject({ reading_kind: 'plate', reading_status: 'queued' });
    expect(await entityRow('file', (done.value as { id: string }).id)).toBeUndefined();
  }, 60_000);
});
