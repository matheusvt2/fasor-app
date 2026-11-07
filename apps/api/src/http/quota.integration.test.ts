import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EMPTY_DEFINITION_CONTEXT,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  errorResponseSchema,
  filePutResponseSchema,
  instantiateTemplate,
  makeOp,
  readingRereadPath,
  readingRereadResponseSchema,
  standardTemplate,
  syncPushResponseSchema,
  type Op,
  type OpDraft,
} from '@app/domain';
import { and, eq, inArray, like, sql as dsql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { consumeDailyQuota } from '../db/repositories/ai-usage.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { aiUsageDaily, entities, ops } from '../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { newId } from '../ids.ts';
import type { AuditPayload } from '../jobs/audit/payload.ts';
import type { ReadingPayload } from '../jobs/reading/payload.ts';
import { applyOps } from '../sync/apply.ts';
import { serverOp } from '../sync/server-op.ts';
import { createS3 } from '../storage/s3.ts';
import { createApp } from './app.ts';

/*
 * Story 20.12 (security pass S6), in process with spy sends and small ceilings (2 readings and
 * 1 audit a day): the reading a file receipt would start, a reread and an audit each spend one
 * unit of the company's `America/Sao_Paulo` day, and at the ceiling nothing is sent: the upload
 * still answers 200 (the photo kept, `reading_status = failed`, `reading: 'quota_exceeded'`),
 * the reread and the audit answer 429 `quota_exceeded`. A reread of a photo already `done`
 * spends nothing; yesterday's count does not hold today; concurrent spends never pass the limit.
 * The api test files run one at a time (`fileParallelism: false`), so Empresa A's counter rows
 * are this file's while it runs; they are cleared before each test and after the file.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const COMPANY = asCompanyId(companyA.companyId);
const DEVICE = 'tablet-quota';
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const staticDir = mkdtempSync(join(tmpdir(), 'quota-'));
const up = async () => undefined;
const probes = { db: up, queue: up, storage: up, libreoffice: up };
const written = { fileIds: new Set<string>(), relatorios: new Set<string>(), projects: new Set<string>() };

let cookie = '';
const readings: ReadingPayload[] = [];
const audits: AuditPayload[] = [];

const app = createApp({
  originGuard: 'off',
  probes,
  auth,
  db,
  s3,
  bucket: config.S3_BUCKET,
  staticDir,
  quotas: { readings: 2, audits: 1 },
  enqueueReading: async (payload) => void readings.push(payload),
  enqueueAudit: async (payload) => void audits.push(payload),
});

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

function request(path: string, init: RequestInit = {}): Promise<Response> | Response {
  return app.request(path, { ...init, headers: { cookie, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), ...(init.headers as Record<string, string>) } });
}

const stamp = (draft: OpDraft): Op => makeOp({ ...draft, device_id: DEVICE }, { newId, now: now() });

async function push(batch: Op[]): Promise<void> {
  const res = await request('/api/sync/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: batch }) });
  expect(res.status, await res.clone().text()).toBe(200);
  expect(syncPushResponseSchema.parse(await res.json()).rejected).toEqual([]);
}

let shade = 0;

/** A queued plate photo pushed by company A's device, and its bytes (not uploaded yet). */
async function platePhoto(): Promise<{ id: string; bytes: Uint8Array }> {
  const bytes = new Uint8Array(await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 17, g: 200, b: shade++ } } }).jpeg().toBuffer());
  const id = newId();
  written.fileIds.add(id);
  await push([
    stamp({
      kind: 'create',
      scope: 'company',
      company_id: companyA.companyId,
      project_id: null,
      relatorio_id: null,
      path: `file/${id}`,
      value: {
        id,
        company_id: companyA.companyId,
        relatorio_id: null,
        kind: 'photo',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        mime: 'image/jpeg',
        size: bytes.byteLength,
        uploaded_at: null,
        variants: null,
        removed_at: null,
        captured_at: '2026-11-01T10:00:00.000Z',
        tz_offset: -180,
        coords: null,
        local_seq: 1,
        block_id: null,
        item_key: null,
        caption: null,
        reading_kind: 'plate',
        reading_target: { block_id: newId(), block_type: 'transformador_forca' },
        reading_status: 'queued',
      } as never,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: companyA.userId,
    }),
  ]);
  return { id, bytes };
}

function upload(photo: { id: string; bytes: Uint8Array }): Promise<Response> | Response {
  return request(`/api/files/${photo.id}`, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: photo.bytes });
}

async function rowOf(id: string): Promise<{ reading_status: string; uploaded_at: string | null }> {
  const [found] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'file'), eq(entities.id, id)));
  return found!.row as never;
}

/** Today's (or another day's) count of `kind` for company A; 0 when it has no row. */
async function countOf(kind: 'reading' | 'audit', dayOffset = 0): Promise<number> {
  const rows = await db
    .select({ count: aiUsageDaily.count })
    .from(aiUsageDaily)
    .where(
      and(
        eq(aiUsageDaily.company_id, companyA.companyId),
        eq(aiUsageDaily.kind, kind),
        eq(aiUsageDaily.day, dsql`((now() at time zone 'America/Sao_Paulo')::date + ${dayOffset}::int)`),
      ),
    );
  return rows[0]?.count ?? 0;
}

async function setCount(kind: 'reading' | 'audit', count: number, dayOffset = 0): Promise<void> {
  await db.execute(dsql`
    insert into ai_usage_daily (company_id, day, kind, count)
    values (${companyA.companyId}, (now() at time zone 'America/Sao_Paulo')::date + ${dayOffset}::int, ${kind}, ${count})
    on conflict (company_id, day, kind) do update set count = excluded.count
  `);
}

async function setStatus(id: string, status: 'done' | 'failed'): Promise<void> {
  const op = serverOp({ opId: newId(), companyId: companyA.companyId, actorId: 'system:reading', clientTs: now().toISOString(), kind: 'put', path: `file/${id}/reading_status`, value: status, relatorioId: null });
  expect((await applyOps(db, COMPANY, [op], { origin: 'server', now })).rejected).toEqual([]);
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  cookie = await signIn();
}, 60_000);

beforeEach(async () => {
  readings.length = 0;
  audits.length = 0;
  await db.delete(aiUsageDaily).where(eq(aiUsageDaily.company_id, companyA.companyId));
});

afterAll(async () => {
  await db.delete(aiUsageDaily).where(eq(aiUsageDaily.company_id, companyA.companyId));
  const ids = [...written.fileIds];
  for (const id of ids) await db.delete(ops).where(and(eq(ops.company_id, companyA.companyId), like(ops.path, `file/${id}%`)));
  if (ids.length > 0) await db.delete(entities).where(inArray(entities.id, ids));
  for (const id of written.relatorios) {
    await db.delete(ops).where(eq(ops.relatorio_id, id));
    await db.delete(entities).where(eq(entities.relatorio_id, id));
  }
  for (const id of written.projects) {
    await db.delete(ops).where(eq(ops.project_id, id));
    await db.delete(ops).where(like(ops.path, `project/${id}%`));
    await db.delete(entities).where(eq(entities.id, id));
  }
  rmSync(staticDir, { recursive: true, force: true });
  await sql.end();
});

describe('20.12-INT the daily ceiling of readings', () => {
  it('file receipt: under the ceiling the reading starts and spends one; at it, nothing is sent and the photo is kept, failed', async () => {
    const first = await platePhoto();
    const ok = await upload(first);
    expect(ok.status, await ok.clone().text()).toBe(200);
    expect(filePutResponseSchema.parse(await ok.json()).reading).toBeUndefined();
    expect(readings.map((payload) => payload.photo_id)).toEqual([first.id]);
    expect(await countOf('reading')).toBe(1);

    await setCount('reading', 2);
    const over = await platePhoto();
    const refused = await upload(over);
    expect(refused.status, await refused.clone().text()).toBe(200);
    const answer = filePutResponseSchema.parse(await refused.json());
    expect(answer.reading).toBe('quota_exceeded');
    expect(answer.uploaded_at).not.toBeNull();
    expect(readings.map((payload) => payload.photo_id)).toEqual([first.id]);
    expect(await rowOf(over.id)).toMatchObject({ reading_status: 'failed' });
    expect((await rowOf(over.id)).uploaded_at).not.toBeNull();
    expect(await countOf('reading')).toBe(2);
  }, 60_000);

  it('reread: at the ceiling 429 quota_exceeded, nothing sent; a photo already done answers 200 done and spends nothing', async () => {
    const photo = await platePhoto();
    await setCount('reading', 2);
    expect((await upload(photo)).status).toBe(200);
    expect(await rowOf(photo.id)).toMatchObject({ reading_status: 'failed' });

    const refused = await request(readingRereadPath(photo.id), { method: 'POST' });
    expect(refused.status).toBe(429);
    expect(errorResponseSchema.parse(await refused.json()).code).toBe('quota_exceeded');
    expect(readings).toEqual([]);
    expect(await countOf('reading')).toBe(2);

    await setStatus(photo.id, 'done');
    await db.delete(aiUsageDaily).where(eq(aiUsageDaily.company_id, companyA.companyId));
    const done = await request(readingRereadPath(photo.id), { method: 'POST' });
    expect(done.status).toBe(200);
    expect(readingRereadResponseSchema.parse(await done.json())).toEqual({ photo_id: photo.id, reading_status: 'done' });
    expect(readings).toEqual([]);
    expect(await countOf('reading')).toBe(0);

    // Under the ceiling a failed photo is read again, and that spends one.
    await setStatus(photo.id, 'failed');
    const again = await request(readingRereadPath(photo.id), { method: 'POST' });
    expect(again.status).toBe(202);
    expect(readingRereadResponseSchema.parse(await again.json())).toEqual({ photo_id: photo.id, reading_status: 'running' });
    expect(readings.map((payload) => payload.photo_id)).toEqual([photo.id]);
    expect(await countOf('reading')).toBe(1);
  }, 60_000);

  it("the next day: yesterday's full count does not hold today's first reading", async () => {
    await setCount('reading', 2, -1);
    const photo = await platePhoto();
    const res = await upload(photo);
    expect(res.status).toBe(200);
    expect(filePutResponseSchema.parse(await res.json()).reading).toBeUndefined();
    expect(readings.map((payload) => payload.photo_id)).toEqual([photo.id]);
    expect(await countOf('reading')).toBe(1);
    expect(await countOf('reading', -1)).toBe(2);
  }, 60_000);

  it('concurrent spends never pass the limit', async () => {
    const answers = await Promise.all(Array.from({ length: 12 }, () => consumeDailyQuota(db, COMPANY, 'reading', 5)));
    expect(answers.filter(Boolean)).toHaveLength(5);
    expect(await countOf('reading')).toBe(5);
    expect(await consumeDailyQuota(db, COMPANY, 'reading', 0)).toBe(false);
  });
});

describe('20.12-INT the daily ceiling of audits', () => {
  /** A relatório of the standard template pushed by company A's device, and its newest op id. */
  async function relatorio(): Promise<{ relatorioId: string; lastOpId: string }> {
    const projectId = newId();
    written.projects.add(projectId);
    const projectDraft: OpDraft = {
      kind: 'create',
      scope: 'company',
      company_id: companyA.companyId,
      project_id: null,
      relatorio_id: null,
      path: `project/${projectId}`,
      value: { id: projectId, client_id: null, name: 'Obra cota', site: 'Obra cota', removed_at: null },
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: companyA.userId,
    };
    const { relatorioId, drafts } = instantiateTemplate(
      standardTemplate({ id: newId() }),
      { id: projectId },
      { service_start: '2026-11-04', service_end: '2026-11-04', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
      { newId, actorId: companyA.userId, companyId: companyA.companyId },
    );
    written.relatorios.add(relatorioId);
    const creation = [projectDraft, ...drafts].map(stamp);
    await push(creation);
    return { relatorioId, lastOpId: creation.at(-1)!.op_id };
  }

  const postAudit = (relatorioId: string, lastOpId: string) =>
    request(`/api/relatorios/${relatorioId}/audit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ last_op_id: lastOpId, file_ids_expected: [] }) });

  async function runCount(relatorioId: string): Promise<number> {
    const rows = await db
      .select({ id: entities.id })
      .from(entities)
      .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'audit_run'), eq(entities.relatorio_id, relatorioId)));
    return rows.length;
  }

  it('at the ceiling 429 quota_exceeded, no audit_run and nothing sent; under it one run, one unit spent', async () => {
    const { relatorioId, lastOpId } = await relatorio();
    await setCount('audit', 1);
    const refused = await postAudit(relatorioId, lastOpId);
    expect(refused.status, await refused.clone().text()).toBe(429);
    expect(errorResponseSchema.parse(await refused.json()).code).toBe('quota_exceeded');
    expect(await runCount(relatorioId)).toBe(0);
    expect(audits).toEqual([]);
    expect(await countOf('audit')).toBe(1);

    await db.delete(aiUsageDaily).where(eq(aiUsageDaily.company_id, companyA.companyId));
    const accepted = await postAudit(relatorioId, lastOpId);
    expect(accepted.status, await accepted.clone().text()).toBe(202);
    expect(await runCount(relatorioId)).toBe(1);
    expect(audits).toHaveLength(1);
    expect(await countOf('audit')).toBe(1);
  }, 60_000);
});
