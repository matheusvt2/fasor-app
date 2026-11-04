import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  errorResponseSchema,
  makeOp,
  MAX_IMAGE_PIXELS,
  syncPushResponseSchema,
  TELEMETRY_ROUTE,
  type Op,
  type OpDraft,
  type StampedUxEvent,
} from '@app/domain';
import { and, eq, inArray, like } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { entities, ops, user } from '../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { newId } from '../ids.ts';
import { createS3 } from '../storage/s3.ts';
import { MAX_INPUT_PIXELS, renderVariants } from '../storage/variants.ts';
import { createApp } from './app.ts';

/*
 * Story 20.13 (security pass S7, S8) and the pixel limit of Story 20.12 (S6), in process over
 * the real auth, database and object store, with the origin guard on: better-auth answers only
 * sign-in, sign-out and get-session (`update-user` leaves the name as it was, `list-sessions`
 * is a 404); a cross-site push applies nothing; the telemetry limit holds per session user
 * whatever device id the client names; a removed file is no longer served; and an image whose
 * header claims 200 megapixels is refused 413 before any decode while the health route answers.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const DEVICE = 'tablet-edges';
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const trustedOrigins = parseTrustedOrigins(config.TRUSTED_ORIGINS);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins });
const staticDir = mkdtempSync(join(tmpdir(), 'edges-'));
const up = async () => undefined;
const sunk: StampedUxEvent[][] = [];
const app = createApp({
  originGuard: { trustedOrigins: [...trustedOrigins, apiUrl] },
  probes: { db: up, queue: up, storage: up, libreoffice: up },
  auth,
  db,
  s3,
  bucket: config.S3_BUCKET,
  staticDir,
  telemetry: { sink: { write: async (events) => void sunk.push([...events]) }, limit: { max: 1000, windowMs: 60_000 }, userLimit: { max: 6, windowMs: 60_000 } },
});
const written = { opIds: new Set<string>(), fileIds: new Set<string>() };

/** Every request of the app's own: a trusted origin and the contract version. */
function call(path: string, init: RequestInit & { cookie?: string } = {}): Promise<Response> | Response {
  const { cookie, ...rest } = init;
  return app.request(path, {
    ...rest,
    headers: { origin: apiUrl, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), ...(cookie === undefined ? {} : { cookie }), ...(rest.headers as Record<string, string>) },
  });
}

/** A JSON body with the length a browser would state. */
function jsonInit(body: unknown, extra: Record<string, string> = {}): RequestInit {
  const text = JSON.stringify(body);
  return { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)), ...extra }, body: text };
}

async function signIn(): Promise<string> {
  const res = await call('/api/auth/sign-in/email', jsonInit({ email: companyA.email, password: TEST_SEED.password }));
  expect(res.status, await res.clone().text()).toBe(200);
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

let cookie = '';

async function nameOf(): Promise<string> {
  const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, companyA.userId));
  return row!.name;
}

const stamp = (draft: OpDraft): Op => makeOp({ ...draft, device_id: DEVICE }, { newId, now: now() });

async function push(batch: Op[]): Promise<void> {
  for (const op of batch) written.opIds.add(op.op_id);
  const res = await call('/api/sync/ops', { ...jsonInit({ ops: batch }), cookie });
  expect(res.status, await res.clone().text()).toBe(200);
  expect(syncPushResponseSchema.parse(await res.json()).rejected).toEqual([]);
}

/** A company-scope file create of `bytes`: a photo (no reading) for a JPEG, a certificate for a PNG (a photo is JPEG only). */
function photoCreate(id: string, bytes: Uint8Array, mime: string): Op {
  const base = {
    id,
    company_id: companyA.companyId,
    relatorio_id: null,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    mime,
    size: bytes.byteLength,
    uploaded_at: null,
    variants: null,
    removed_at: null,
  };
  const photo = {
    ...base,
    kind: 'photo',
    captured_at: '2026-11-01T10:00:00.000Z',
    tz_offset: -180,
    coords: null,
    local_seq: 1,
    block_id: null,
    item_key: null,
    caption: null,
    reading_kind: null,
    reading_target: null,
    reading_status: 'none',
  };
  return stamp({
    kind: 'create',
    scope: 'company',
    company_id: companyA.companyId,
    project_id: null,
    relatorio_id: null,
    path: `file/${id}`,
    value: (mime === 'image/jpeg' ? photo : { ...base, kind: 'certificate' }) as never,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: companyA.userId,
  });
}

function upload(id: string, bytes: Uint8Array, mime: string): Promise<Response> | Response {
  return call(`/api/files/${id}`, { method: 'PUT', cookie, headers: { 'content-type': mime, 'content-length': String(bytes.byteLength) }, body: bytes });
}

/** A small real PNG whose IHDR says `width` x `height` (its CRC recomputed): a header that lies. */
async function liarPng(width: number, height: number): Promise<Uint8Array> {
  const png = Buffer.from(await sharp({ create: { width: 8, height: 8, channels: 3, background: '#808080' } }).png().toBuffer());
  // Signature (8) + length (4) + "IHDR" (4): width at 16, height at 20, CRC of type + data at 29.
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  png.writeUInt32BE(crc32(png.subarray(12, 29)) >>> 0, 29);
  return new Uint8Array(png);
}

/** A small real JPEG whose SOF0 says `width` x `height`. */
async function liarJpeg(width: number, height: number): Promise<Uint8Array> {
  const jpeg = Buffer.from(await sharp({ create: { width: 8, height: 8, channels: 3, background: '#808080' } }).jpeg({ quality: 50 }).toBuffer());
  for (let at = 2; at < jpeg.length - 9; ) {
    if (jpeg[at] !== 0xff) throw new Error('not a marker');
    const marker = jpeg[at + 1]!;
    const length = jpeg.readUInt16BE(at + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      jpeg.writeUInt16BE(height, at + 5);
      jpeg.writeUInt16BE(width, at + 7);
      return new Uint8Array(jpeg);
    }
    at += 2 + length;
  }
  throw new Error('no SOF marker');
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  cookie = await signIn();
}, 60_000);

afterAll(async () => {
  for (const id of written.fileIds) await db.delete(ops).where(and(eq(ops.company_id, companyA.companyId), like(ops.path, `file/${id}%`)));
  if (written.opIds.size > 0) await db.delete(ops).where(inArray(ops.op_id, [...written.opIds]));
  if (written.fileIds.size > 0) await db.delete(entities).where(inArray(entities.id, [...written.fileIds]));
  rmSync(staticDir, { recursive: true, force: true });
  await sql.end();
});

describe('20.13-INT the better-auth allowlist (S7)', () => {
  it('update-user, list-sessions, revoke-other-sessions and change-password are 404s; the name and the sessions are unchanged', async () => {
    const before = await nameOf();
    const renamed = await call('/api/auth/update-user', { ...jsonInit({ name: 'Renomeado por fora' }), cookie });
    expect(renamed.status).toBe(404);
    expect(errorResponseSchema.parse(await renamed.json()).code).toBe('not_found');
    expect(await nameOf()).toBe(before);

    const sessions = await call('/api/auth/list-sessions', { method: 'GET', cookie });
    expect(sessions.status).toBe(404);
    expect(await sessions.text()).not.toContain('token');
    expect((await call('/api/auth/revoke-other-sessions', { ...jsonInit({}), cookie })).status).toBe(404);
    expect((await call('/api/auth/change-password', { ...jsonInit({ currentPassword: TEST_SEED.password, newPassword: 'outra-senha-123456' }), cookie })).status).toBe(404);

    // The three the app uses still answer, and the session they read is the same one.
    const session = await call('/api/auth/get-session', { method: 'GET', cookie });
    expect(session.status).toBe(200);
    expect(JSON.stringify(await session.json())).toContain(companyA.email);
    const other = await signIn();
    const out = await call('/api/auth/sign-out', { ...jsonInit({}), cookie: other });
    expect(out.status).toBe(200);
    expect((await call('/api/account', { method: 'GET', cookie })).status).toBe(200);
    expect((await call('/api/account', { method: 'GET', cookie: other })).status).toBe(401);
  }, 60_000);
});

describe('20.13-INT the cross-site write guard (S8)', () => {
  it('a push from a foreign origin, or as text/plain, answers 403 forbidden_origin and applies nothing', async () => {
    const id = newId();
    written.fileIds.add(id);
    const bytes = new Uint8Array(await sharp({ create: { width: 4, height: 4, channels: 3, background: '#101010' } }).jpeg().toBuffer());
    const op = photoCreate(id, bytes, 'image/jpeg');
    written.opIds.add(op.op_id);
    const body = JSON.stringify({ ops: [op] });
    const foreign = await app.request('/api/sync/ops', {
      method: 'POST',
      headers: { cookie, origin: 'https://evil.example', 'content-type': 'application/json', 'content-length': String(body.length), [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) },
      body,
    });
    expect(foreign.status).toBe(403);
    expect(errorResponseSchema.parse(await foreign.json()).code).toBe('forbidden_origin');
    const plain = await app.request('/api/sync/ops', {
      method: 'POST',
      headers: { cookie, 'content-type': 'text/plain', 'content-length': String(body.length), [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) },
      body,
    });
    expect(plain.status).toBe(403);
    expect(await db.select({ op_id: ops.op_id }).from(ops).where(eq(ops.op_id, op.op_id))).toEqual([]);
  });
});

describe('20.13-INT telemetry is limited per session user (S8)', () => {
  const event = (device: string) => ({
    v: 1,
    ts: '2026-11-04T11:59:00.000Z',
    session_id: '019966c1-0000-7000-8000-0000000000aa',
    device_id: device,
    app_version: 'dev',
    name: 'action',
    screen: 'home',
    target: 'home.card_open',
  });

  it('a client rotating its device id still meets the per-user window', async () => {
    const send = (device: string) => call(TELEMETRY_ROUTE.path, { ...jsonInit([event(device), event(device)]), cookie });
    for (let i = 1; i <= 3; i++) expect((await send(`019966c1-0000-7000-8000-00000000e0${i}0`)).status).toBe(204);
    const refused = await send('019966c1-0000-7000-8000-00000000e040');
    expect(refused.status).toBe(429);
    expect(sunk).toHaveLength(3);
  });
});

describe('20.13-INT a removed file is not served (S8)', () => {
  it('GET of a tombstoned photo answers 404, of a live one 200', async () => {
    const id = newId();
    written.fileIds.add(id);
    const bytes = new Uint8Array(await sharp({ create: { width: 6, height: 6, channels: 3, background: '#202020' } }).jpeg().toBuffer());
    await push([photoCreate(id, bytes, 'image/jpeg')]);
    expect((await upload(id, bytes, 'image/jpeg')).status).toBe(200);
    expect((await call(`/api/files/${id}/original`, { method: 'GET', cookie })).status).toBe(200);
    expect((await call(`/api/files/${id}/thumb`, { method: 'GET', cookie })).status).toBe(200);

    await push([
      stamp({
        kind: 'put',
        scope: 'company',
        company_id: companyA.companyId,
        project_id: null,
        relatorio_id: null,
        path: `file/${id}/removed_at`,
        value: '2026-11-01T12:00:00.000Z' as never,
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: companyA.userId,
      }),
    ]);
    for (const variant of ['original', 'thumb', 'print']) {
      const res = await call(`/api/files/${id}/${variant}`, { method: 'GET', cookie });
      expect(res.status, variant).toBe(404);
      expect(errorResponseSchema.parse(await res.json()).code).toBe('not_found');
    }
  }, 60_000);
});

describe('e20f (QA N2) the photos of a removed relatório are not served', () => {
  it('a photo of a relatório answers 200, 404 once the relatório is removed, and 200 again once it is restored', async () => {
    const projectId = newId();
    const relatorioId = newId();
    const id = newId();
    for (const entity of [projectId, relatorioId, id]) written.fileIds.add(entity);
    const envelope = { company_id: companyA.companyId, project_id: null, prev_op_id: null, batch_id: null, meta: null, actor_id: companyA.userId };
    const inRelatorio = { ...envelope, scope: 'relatorio' as const, relatorio_id: relatorioId };
    await push([
      stamp({ ...envelope, kind: 'create', scope: 'company', relatorio_id: null, path: `project/${projectId}`, value: { id: projectId, client_id: null, name: 'Obra das bordas', site: null, removed_at: null } as never }),
      stamp({
        ...inRelatorio,
        kind: 'create',
        path: `relatorio/${relatorioId}`,
        value: {
          id: relatorioId,
          project_id: projectId,
          template_id: null,
          template_version: null,
          seed_version: 'v1',
          status: 'rascunho',
          setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null },
          export: { scheme: 'por_local_e_tipo' },
          preview_file_id: null,
          removed_at: null,
        } as never,
      }),
    ]);
    const bytes = new Uint8Array(await sharp({ create: { width: 6, height: 6, channels: 3, background: '#303030' } }).jpeg().toBuffer());
    const create = photoCreate(id, bytes, 'image/jpeg');
    await push([stamp({ ...create, ...inRelatorio, value: { ...(create.value as Record<string, unknown>), relatorio_id: relatorioId } as never })]);
    expect((await upload(id, bytes, 'image/jpeg')).status).toBe(200);
    const status = async () => (await call(`/api/files/${id}/original`, { method: 'GET', cookie })).status;
    expect(await status()).toBe(200);

    await push([stamp({ ...inRelatorio, kind: 'remove', path: 'relatorio/removed_at', value: null })]);
    expect(await status()).toBe(404);
    expect((await call(`/api/files/${id}/thumb`, { method: 'GET', cookie })).status).toBe(404);

    await push([stamp({ ...inRelatorio, kind: 'put', path: 'relatorio/removed_at', value: null })]);
    expect(await status()).toBe(200);
  }, 60_000);
});

describe('20.12-INT the pixel limit (S6)', () => {
  it('a PNG and a JPEG whose headers claim 200 MP are refused 413 with the pixel details before any decode; health answers meanwhile', async () => {
    expect(MAX_INPUT_PIXELS).toBe(MAX_IMAGE_PIXELS);
    for (const [mime, bytes] of [
      ['image/png', await liarPng(20_000, 10_000)],
      ['image/jpeg', await liarJpeg(20_000, 10_000)],
    ] as const) {
      // The decoder itself refuses it too, should anything reach it.
      await expect(renderVariants(bytes, mime)).rejects.toThrow(/pixel limit/i);
      const id = newId();
      written.fileIds.add(id);
      await push([photoCreate(id, bytes, mime)]);
      const started = Date.now();
      const [res, health] = await Promise.all([upload(id, bytes, mime), call('/api/health', { method: 'GET' })]);
      expect(res.status, mime).toBe(413);
      expect(errorResponseSchema.parse(await res.json())).toMatchObject({ code: 'file_too_large', details: { limit: 'pixels', max_pixels: 120_000_000 } });
      expect(health.status).toBe(200);
      expect(Date.now() - started).toBeLessThan(5_000);
      const [row] = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.company_id, companyA.companyId), eq(entities.id, id)));
      expect((row!.row as { uploaded_at: string | null }).uploaded_at).toBeNull();
    }

    // An image under the limit still uploads.
    const id = newId();
    written.fileIds.add(id);
    const fine = await liarPng(8, 8);
    await push([photoCreate(id, fine, 'image/png')]);
    expect((await upload(id, fine, 'image/png')).status).toBe(200);
  }, 60_000);
});
