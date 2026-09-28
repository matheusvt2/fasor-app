import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, makeOp, syncPushResponseSchema, type Op } from '@app/domain';
import { and, eq, inArray, like } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { entities, ops } from '../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { newId } from '../ids.ts';
import type { ReadingPayload } from '../jobs/reading/payload.ts';
import { createS3 } from '../storage/s3.ts';
import { createApp } from './app.ts';

/*
 * Story 8.4, file receipt in process: the app is built with a spy send to the reading
 * queue, so the I/O matrix rows "Enqueue unavailable" (the send fails: the upload still
 * answers 200 and the photo stays `queued`) and "No reading" (a photo without a reading kind,
 * or a kind other than plate: no send, no status op) are checked without the compose worker.
 * The session cookie comes from the compose api (sessions live in Postgres).
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});
const staticDir = mkdtempSync(join(tmpdir(), 'files-reading-'));
const up = async () => undefined;
const probes = { db: up, queue: up, storage: up, libreoffice: up };
const written = { opIds: new Set<string>(), fileIds: new Set<string>() };

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

function request(app: App, path: string, init: RequestInit): Promise<Response> | Response {
  return app.request(path, { ...init, headers: { cookie, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), ...(init.headers as Record<string, string>) } });
}

let shade = 0;

/** A company-scope photo create with the given reading fields, pushed through the app, and its bytes. */
async function photo(app: App, reading: { reading_kind: string | null; reading_status: string }): Promise<{ id: string; bytes: Uint8Array }> {
  const bytes = new Uint8Array(await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 17, b: shade++ } } }).jpeg().toBuffer());
  const id = newId();
  written.fileIds.add(id);
  const op: Op = makeOp(
    {
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
        captured_at: '2026-09-27T10:00:00.000Z',
        tz_offset: -180,
        coords: null,
        local_seq: 1,
        block_id: null,
        item_key: null,
        caption: null,
        reading_kind: reading.reading_kind,
        reading_target: reading.reading_kind === null ? null : { block_id: newId(), block_type: 'transformador_forca' },
        reading_status: reading.reading_status,
      } as never,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: companyA.userId,
      device_id: 'tablet-files-reading',
    },
    { newId, now: now() },
  );
  written.opIds.add(op.op_id);
  const res = await request(app, '/api/sync/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: [op] }) });
  expect(res.status, await res.clone().text()).toBe(200);
  expect(syncPushResponseSchema.parse(await res.json()).rejected).toEqual([]);
  return { id, bytes };
}

async function statusOf(id: string): Promise<{ reading_status: string; statusOps: number }> {
  const [found] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'file'), eq(entities.id, id)));
  const statusOps = await db
    .select({ op_id: ops.op_id })
    .from(ops)
    .where(and(eq(ops.company_id, companyA.companyId), eq(ops.path, `file/${id}/reading_status`)));
  return { reading_status: (found!.row as { reading_status: string }).reading_status, statusOps: statusOps.length };
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  cookie = await signIn();
}, 60_000);

afterAll(async () => {
  const ids = [...written.fileIds];
  for (const id of ids) await db.delete(ops).where(and(eq(ops.company_id, companyA.companyId), like(ops.path, `file/${id}/%`)));
  if (written.opIds.size > 0) await db.delete(ops).where(inArray(ops.op_id, [...written.opIds]));
  if (ids.length > 0) await db.delete(entities).where(inArray(entities.id, ids));
  rmSync(staticDir, { recursive: true, force: true });
  await sql.end();
});

describe('8.4-INT file receipt and the reading queue', () => {
  it('a send that fails: the upload answers 200 and the plate photo stays queued', async () => {
    const calls: ReadingPayload[] = [];
    const app = createApp({
      probes,
      auth,
      db,
      s3,
      bucket: config.S3_BUCKET,
      staticDir,
      enqueueReading: async (payload) => {
        calls.push(payload);
        throw new Error('queue down');
      },
    });
    const { id, bytes } = await photo(app, { reading_kind: 'plate', reading_status: 'queued' });
    const res = await request(app, `/api/files/${id}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes });
    expect(res.status, await res.clone().text()).toBe(200);
    expect(calls).toEqual([{ company_id: companyA.companyId, photo_id: id, reading_kind: 'plate' }]);
    expect(await statusOf(id)).toEqual({ reading_status: 'queued', statusOps: 0 });
  }, 60_000);

  it('an app without a queue: the upload answers 200 and the plate photo stays queued', async () => {
    const app = createApp({ probes, auth, db, s3, bucket: config.S3_BUCKET, staticDir });
    const { id, bytes } = await photo(app, { reading_kind: 'plate', reading_status: 'queued' });
    const res = await request(app, `/api/files/${id}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes });
    expect(res.status).toBe(200);
    expect(await statusOf(id)).toEqual({ reading_status: 'queued', statusOps: 0 });
  }, 60_000);

  it('a photo without a reading kind, or with a kind other than plate: no send, no status op', async () => {
    const calls: ReadingPayload[] = [];
    const app = createApp({ probes, auth, db, s3, bucket: config.S3_BUCKET, staticDir, enqueueReading: async (payload) => void calls.push(payload) });
    const none = await photo(app, { reading_kind: null, reading_status: 'none' });
    const display = await photo(app, { reading_kind: 'display', reading_status: 'queued' });
    for (const { id, bytes } of [none, display]) {
      const res = await request(app, `/api/files/${id}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes });
      expect(res.status, await res.clone().text()).toBe(200);
    }
    expect(calls).toEqual([]);
    expect(await statusOf(none.id)).toEqual({ reading_status: 'none', statusOps: 0 });
    expect(await statusOf(display.id)).toEqual({ reading_status: 'queued', statusOps: 0 });
  }, 60_000);
});
