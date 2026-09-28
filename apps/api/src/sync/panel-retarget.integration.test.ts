import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  instantiateTemplate,
  makeOp,
  newEquipmentBlock,
  panelReadingTarget,
  panelRetargetOps,
  standardTemplate,
  syncPushResponseSchema,
  type LocationRow,
  type Op,
  type OpDraft,
  type SyncPushResponse,
} from '@app/domain';
import { and, eq, inArray, like } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { entities, ops } from '../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { createApp } from '../http/app.ts';
import { newId } from '../ids.ts';
import type { ReadingPayload } from '../jobs/reading/payload.ts';
import { createS3 } from '../storage/s3.ts';
import { applyOps } from './apply.ts';

/*
 * Story 9.2 (contract 7) through `POST /api/sync/ops`, in process with a spy send to the
 * reading queue (the `files-reading` pattern): the "Fotografar equipamento" confirm is one
 * batch -- equipment + block creates and the panel photo re-targeted to the new block's
 * plate (`block_id`, caption, `reading_target`, `reading_kind: plate`). The `reading_kind`
 * put queues the plate reading (`applyOp`), and the push route sends it when the photo's
 * bytes are already stored; file receipt sends it otherwise. A bad value is `op_invalid`; a
 * photo of another company is never touched nor read.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const companyB = TEST_SEED.companies[1];
const DEVICE = 'tablet-panel-retarget';
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});
const staticDir = mkdtempSync(join(tmpdir(), 'panel-retarget-'));
const up = async () => undefined;
const probes = { db: up, queue: up, storage: up, libreoffice: up };
const written = { opIds: new Set<string>(), entityIds: new Set<string>() };
const author = { id: companyA.userId, companyId: companyA.companyId };

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

function appWith(calls: ReadingPayload[]): App {
  return createApp({ probes, auth, db, s3, bucket: config.S3_BUCKET, staticDir, enqueueReading: async (payload) => void calls.push(payload) });
}

function request(app: App, path: string, init: RequestInit): Promise<Response> | Response {
  return app.request(path, { ...init, headers: { cookie, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), ...(init.headers as Record<string, string>) } });
}

const stamp = (draft: OpDraft): Op => {
  const op = makeOp({ ...draft, device_id: DEVICE }, { newId, now: now() });
  written.opIds.add(op.op_id);
  return op;
};

async function push(app: App, batch: Op[]): Promise<SyncPushResponse> {
  const res = await request(app, '/api/sync/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: batch }) });
  expect(res.status, await res.clone().text()).toBe(200);
  return syncPushResponseSchema.parse(await res.json());
}

async function fileRow(companyId: string, id: string): Promise<Record<string, unknown> | undefined> {
  const [found] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'file'), eq(entities.id, id)));
  return found?.row as Record<string, unknown> | undefined;
}

/** A relatório of the standard template pushed by company A's device: its id, its project and a coluna. */
async function relatorio(app: App): Promise<{ relatorioId: string; projectId: string; coluna: LocationRow }> {
  const projectId = newId();
  const projectDraft: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: companyA.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra painel', site: 'Obra painel', removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: companyA.userId,
  };
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: newId() }),
    { id: projectId },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: companyA.userId, companyId: companyA.companyId },
  );
  const creation = [projectDraft, ...drafts].map(stamp);
  for (const op of creation) written.entityIds.add((op.value as { id: string }).id);
  expect((await push(app, creation)).rejected).toEqual([]);
  const coluna = drafts.map((draft) => draft.value as unknown as LocationRow).find((row) => row?.kind === 'coluna')!;
  return { relatorioId, projectId, coluna };
}

let shade = 0;

/** A panel photo create of company A (queued, targeting `locationId`) and its bytes. */
async function panelPhoto(relatorioId: string, locationId: string): Promise<{ op: Op; id: string; bytes: Uint8Array }> {
  const bytes = new Uint8Array(await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 17, g: 90, b: shade++ } } }).jpeg().toBuffer());
  const id = newId();
  written.entityIds.add(id);
  const op = stamp({
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
      captured_at: '2026-09-28T10:00:00.000Z',
      tz_offset: -180,
      coords: null,
      local_seq: 1,
      block_id: null,
      item_key: null,
      caption: null,
      reading_kind: 'panel',
      reading_target: panelReadingTarget(locationId),
      reading_status: 'queued',
    } as never,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: companyA.userId,
  });
  return { op, id, bytes };
}

/** The confirm batch: equipment + block on `coluna`, the photo re-targeted to its plate, one batch id. */
function confirmBatch(relatorioId: string, projectId: string, coluna: LocationRow, photoId: string): { batch: Op[]; blockId: string } {
  const pair = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId,
    projectId,
    locationId: coluna.id,
    type: 'chave_seccionadora',
    tag: `SEC-P${shade}`,
    seedVersion: 'v3',
    orderKey: 'zz',
  });
  written.entityIds.add(pair.block.id);
  written.entityIds.add(pair.equipment.id);
  const batchId = newId();
  const drafts: OpDraft[] = [
    { scope: 'project', company_id: companyA.companyId, project_id: projectId, relatorio_id: null, prev_op_id: null, batch_id: null, meta: null, actor_id: companyA.userId, kind: 'create', path: `equipment/${pair.equipment.id}`, value: pair.equipment as never },
    { scope: 'relatorio', company_id: companyA.companyId, project_id: null, relatorio_id: relatorioId, prev_op_id: null, batch_id: null, meta: null, actor_id: companyA.userId, kind: 'create', path: `block/${pair.block.id}`, value: pair.block as never },
    ...panelRetargetOps(author, relatorioId, photoId, pair.block),
  ];
  return { batch: drafts.map((draft) => stamp({ ...draft, batch_id: batchId })), blockId: pair.block.id };
}

async function upload(app: App, id: string, bytes: Uint8Array): Promise<void> {
  const res = await request(app, `/api/files/${id}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes });
  expect(res.status, await res.clone().text()).toBe(200);
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  cookie = await signIn();
}, 60_000);

afterAll(async () => {
  const ids = [...written.entityIds];
  for (const id of ids) await db.delete(ops).where(like(ops.path, `file/${id}/%`));
  if (written.opIds.size > 0) await db.delete(ops).where(inArray(ops.op_id, [...written.opIds]));
  if (ids.length > 0) await db.delete(entities).where(inArray(entities.id, ids));
  rmSync(staticDir, { recursive: true, force: true });
  await sql.end();
});

describe('9.2-INT the panel photo re-targeted to the new block plate', () => {
  it('an uploaded panel photo: one batch creates the block and re-targets the photo; the row is plate and queued, then running, and plate is sent once', async () => {
    const calls: ReadingPayload[] = [];
    const app = appWith(calls);
    const { relatorioId, projectId, coluna } = await relatorio(app);
    const photo = await panelPhoto(relatorioId, coluna.id);
    expect((await push(app, [photo.op])).rejected).toEqual([]);
    await upload(app, photo.id, photo.bytes);
    expect(calls).toEqual([{ company_id: companyA.companyId, photo_id: photo.id, reading_kind: 'panel' }]);

    const { batch, blockId } = confirmBatch(relatorioId, projectId, coluna, photo.id);
    const result = await push(app, batch);
    expect(result.rejected).toEqual([]);
    expect(result.applied.map((a) => a.op_id)).toEqual(batch.map((op) => op.op_id));
    expect(calls).toEqual([
      { company_id: companyA.companyId, photo_id: photo.id, reading_kind: 'panel' },
      { company_id: companyA.companyId, photo_id: photo.id, reading_kind: 'plate' },
    ]);
    expect(await fileRow(companyA.companyId, photo.id)).toMatchObject({
      block_id: blockId,
      caption: 'placa de identificação',
      reading_kind: 'plate',
      reading_target: { block_id: blockId, block_type: 'chave_seccionadora' },
      reading_status: 'running',
    });
    // The re-target itself queued it (no client status op), then the send wrote `running` after it.
    const statusOps = await db
      .select({ value: ops.value, actor_id: ops.actor_id, seq: ops.seq })
      .from(ops)
      .where(and(eq(ops.company_id, companyA.companyId), eq(ops.path, `file/${photo.id}/reading_status`)));
    const kindSeq = result.applied.find((a) => a.op_id === batch.at(-1)!.op_id)!.seq;
    expect(statusOps.filter((op) => op.seq > kindSeq).map((op) => [op.value, op.actor_id])).toEqual([['running', 'system:reading']]);
  }, 60_000);

  it('a photo not uploaded yet: the re-target sends nothing and the row stays plate and queued; the upload then sends plate', async () => {
    const calls: ReadingPayload[] = [];
    const app = appWith(calls);
    const { relatorioId, projectId, coluna } = await relatorio(app);
    const photo = await panelPhoto(relatorioId, coluna.id);
    const { batch, blockId } = confirmBatch(relatorioId, projectId, coluna, photo.id);
    expect((await push(app, [photo.op, ...batch])).rejected).toEqual([]);
    expect(calls).toEqual([]);
    expect(await fileRow(companyA.companyId, photo.id)).toMatchObject({ block_id: blockId, reading_kind: 'plate', reading_status: 'queued' });
    await upload(app, photo.id, photo.bytes);
    expect(calls).toEqual([{ company_id: companyA.companyId, photo_id: photo.id, reading_kind: 'plate' }]);
    expect(await fileRow(companyA.companyId, photo.id)).toMatchObject({ reading_status: 'running' });
  }, 60_000);

  it('refuses a reading_kind that is not one of the five kinds, and a reading_target that is not an object, as op_invalid', async () => {
    const calls: ReadingPayload[] = [];
    const app = appWith(calls);
    const { relatorioId, coluna } = await relatorio(app);
    const photo = await panelPhoto(relatorioId, coluna.id);
    expect((await push(app, [photo.op])).rejected).toEqual([]);
    const put = (field: string, value: unknown): Op =>
      stamp({ scope: 'relatorio', company_id: companyA.companyId, project_id: null, relatorio_id: relatorioId, prev_op_id: null, batch_id: null, meta: null, actor_id: companyA.userId, kind: 'put', path: `file/${photo.id}/${field}`, value: value as never });
    const bad = [put('reading_kind', 'bogus'), put('reading_kind', null), put('reading_target', 'x'), put('reading_target', [1]), put('reading_target', null)];
    const result = await push(app, bad);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toEqual(bad.map((op) => ({ op_id: op.op_id, code: 'op_invalid' })));
    expect(await fileRow(companyA.companyId, photo.id)).toMatchObject({ reading_kind: 'panel', reading_target: { location_id: coluna.id }, reading_status: 'queued' });
    expect(calls).toEqual([]);
  }, 60_000);

  it('never touches nor sends a photo of another company: its company is a tenant mismatch, its id alone writes nothing there', async () => {
    const calls: ReadingPayload[] = [];
    const app = appWith(calls);
    const { relatorioId, coluna } = await relatorio(app);
    // Company B's own uploaded panel photo, written straight into its company.
    const foreignId = newId();
    written.entityIds.add(foreignId);
    const foreign = makeOp(
      {
        kind: 'create',
        scope: 'company',
        company_id: companyB.companyId,
        project_id: null,
        relatorio_id: null,
        path: `file/${foreignId}`,
        value: {
          id: foreignId,
          company_id: companyB.companyId,
          relatorio_id: null,
          kind: 'photo',
          sha256: 'cd'.repeat(32),
          mime: 'image/jpeg',
          size: 10,
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
          reading_target: panelReadingTarget(coluna.id),
          reading_status: 'queued',
        } as never,
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: companyB.userId,
        device_id: 'tablet-panel-b',
      },
      { newId, now: now() },
    );
    written.opIds.add(foreign.op_id);
    expect((await applyOps(db, asCompanyId(companyB.companyId), [foreign], { origin: 'client', actorId: companyB.userId, now })).rejected).toEqual([]);

    const envelope = { scope: 'relatorio' as const, project_id: null, relatorio_id: relatorioId, prev_op_id: null, batch_id: null, meta: null, actor_id: companyA.userId, kind: 'put' as const };
    const mismatch = stamp({ ...envelope, company_id: companyB.companyId, path: `file/${foreignId}/reading_kind`, value: 'plate' });
    const ownScope = stamp({ ...envelope, company_id: companyA.companyId, path: `file/${foreignId}/reading_kind`, value: 'plate' });
    const result = await push(app, [mismatch, ownScope]);
    expect(result.rejected).toEqual([{ op_id: mismatch.op_id, code: 'op_tenant_mismatch' }]);
    expect(await fileRow(companyB.companyId, foreignId)).toMatchObject({ reading_kind: 'panel', reading_status: 'queued' });
    expect(await fileRow(companyA.companyId, foreignId)).toBeUndefined();
    expect(calls).toEqual([]);
  }, 60_000);
});
