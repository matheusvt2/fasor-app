import { createHash } from 'node:crypto';
import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  errorResponseSchema,
  FILE_SHA256_HEADER,
  filePutResponseSchema,
  makeOp,
  MAX_FILE_BYTES,
  objectKey,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type Op,
  type OpInput,
} from '@app/domain';
import { inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { entities, ops } from '../db/schema.ts';
import { TEST_SEED, seedTestCompanies } from '../db/seed.ts';
import { newId } from '../ids.ts';
import { createS3, getObject } from '../storage/s3.ts';

/**
 * 2.2-API: `PUT /api/files/{id}` and `GET /api/files/{id}/{variant}` over the compose api
 * and MinIO, with the two seeded companies (TC-9). Every id is minted per run; the rows
 * this suite wrote are removed by id afterwards. Objects are never deleted (AD-7:
 * immutable keys), so each run writes under fresh ids.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const companyB = TEST_SEED.companies[1];

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

const written = { opIds: new Set<string>(), entityIds: new Set<string>() };

type Company = (typeof TEST_SEED.companies)[number];

function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    origin: apiUrl,
    [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION),
    ...(init.headers as Record<string, string> | undefined),
  };
  return fetch(`${apiUrl}${path}`, { ...init, redirect: 'manual', headers });
}

async function signIn(email: string): Promise<string> {
  const res = await call('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

const cookies = new Map<string, string>();

async function cookieFor(company: Company, fresh = false): Promise<string> {
  const cached = cookies.get(company.email);
  if (cached !== undefined && !fresh) return cached;
  const cookie = await signIn(company.email);
  cookies.set(company.email, cookie);
  return cookie;
}

/** Retries once on 401: the api suites run in parallel and re-seeding revokes sessions. */
async function authed(company: Company, path: string, init: RequestInit = {}): Promise<Response> {
  const attempt = async (fresh: boolean) =>
    call(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), cookie: await cookieFor(company, fresh) } });
  const first = await attempt(false);
  return first.status === 401 ? attempt(true) : first;
}

interface Ids {
  company: string;
  actor: string;
  device: string;
}

const idsA: Ids = { company: companyA.companyId, actor: companyA.userId, device: 'tablet-files-a' };
const idsB: Ids = { company: companyB.companyId, actor: companyB.userId, device: 'tablet-files-b' };

function op(ids: Ids, input: Omit<OpInput, 'company_id' | 'actor_id' | 'device_id'> & Partial<OpInput>): Op {
  return makeOp(
    {
      company_id: ids.company,
      actor_id: ids.actor,
      device_id: ids.device,
      project_id: null,
      relatorio_id: null,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      ...input,
    },
    { newId, now: now() },
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The `file/{id}` create op of a company-scoped upload kind, plus the bytes it describes. */
function fileCreate(ids: Ids, kind: string, mime: string, bytes: Uint8Array, id = newId()): { id: string; op: Op } {
  written.entityIds.add(id);
  const built = op(ids, {
    kind: 'create',
    scope: 'company',
    path: `file/${id}`,
    value: {
      id,
      company_id: ids.company,
      relatorio_id: null,
      kind,
      sha256: sha256(bytes),
      mime,
      size: bytes.byteLength,
      uploaded_at: null,
      variants: null,
      removed_at: null,
    },
  });
  written.opIds.add(built.op_id);
  return { id, op: built };
}

async function pushOk(company: Company, batch: Op[]): Promise<void> {
  const res = await authed(company, '/api/sync/ops', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ops: batch }),
  });
  expect(res.status, await res.clone().text()).toBe(200);
  const parsed = syncPushResponseSchema.parse(await res.json());
  expect(parsed.rejected).toEqual([]);
  for (const built of batch) written.opIds.add(built.op_id);
}

function put(company: Company, id: string, body: Uint8Array, headers: Record<string, string> = {}): Promise<Response> {
  return authed(company, `/api/files/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream', ...headers },
    body,
  });
}

const PDF_BYTES = new TextEncoder().encode('%PDF-1.4\nfake certificate for the 2.2 suite\n%%EOF\n');

async function pngBytes(): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width: 900, height: 300, channels: 3, background: { r: 10, g: 40, b: 90 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

const SVG_BYTES = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" fill="#0a2850"/></svg>',
);

beforeAll(async () => {
  await seedTestCompanies(db, auth);
});

afterAll(async () => {
  // The server's own `uploaded_at`/`variants` ops carry ids this suite never saw: they
  // are removed by the paths only these files could have.
  const serverPaths = [...written.entityIds].flatMap((id) => [`file/${id}/uploaded_at`, `file/${id}/variants`]);
  if (serverPaths.length > 0) await db.delete(ops).where(inArray(ops.path, serverPaths));
  if (written.opIds.size > 0) await db.delete(ops).where(inArray(ops.op_id, [...written.opIds]));
  if (written.entityIds.size > 0) await db.delete(entities).where(inArray(entities.id, [...written.entityIds]));
  await sql.end();
});

describe('2.2-API-001 PUT /api/files/:id stores the object and emits uploaded_at', () => {
  it('stores the bytes under the immutable key and reports uploaded_at', async () => {
    const { id, op: createOp } = fileCreate(idsA, 'certificate', 'application/pdf', PDF_BYTES);
    await pushOk(companyA, [createOp]);

    const res = await put(companyA, id, PDF_BYTES, { [FILE_SHA256_HEADER]: sha256(PDF_BYTES) });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = filePutResponseSchema.parse(await res.json());
    expect(body.id).toBe(id);
    expect(body.uploaded_at).not.toBe('');

    const stored = await getObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'certificate', id));
    expect(stored).not.toBeNull();

    // The `uploaded_at` op reaches the device by the pull, as a `system:files` server op.
    const pulled = await authed(companyA, '/api/sync/company?since=0');
    const page = syncPullResponseSchema.parse(await pulled.json());
    const uploadedOp = page.ops.find(
      (raw) => (raw as { path?: string }).path === `file/${id}/uploaded_at`,
    ) as { actor_id: string; device_id: string; value: unknown } | undefined;
    expect(uploadedOp).toBeDefined();
    expect(uploadedOp?.actor_id).toBe('system:files');
    expect(uploadedOp?.device_id).toBe('server');
    expect(uploadedOp?.value).toBe(body.uploaded_at);

    // GET serves the original on demand, with the row's content type.
    const got = await authed(companyA, `/api/files/${id}/original`);
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toContain('application/pdf');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(PDF_BYTES);
  });

  it('is idempotent on (id, sha256): the retry answers the same uploaded_at and adds no op', async () => {
    const { id, op: createOp } = fileCreate(idsA, 'certificate', 'application/pdf', PDF_BYTES);
    await pushOk(companyA, [createOp]);

    const first = filePutResponseSchema.parse(await (await put(companyA, id, PDF_BYTES)).json());
    const second = await put(companyA, id, PDF_BYTES);
    expect(second.status).toBe(200);
    expect(filePutResponseSchema.parse(await second.json()).uploaded_at).toBe(first.uploaded_at);

    const rows = await db.select({ op_id: ops.op_id }).from(ops).where(inArray(ops.path, [`file/${id}/uploaded_at`]));
    for (const row of rows) written.opIds.add(row.op_id);
    expect(rows).toHaveLength(1);
  });
});

describe('2.2-API-002 refusals', () => {
  it('answers 409 file_row_missing when the create op has not been applied', async () => {
    const id = newId();
    const res = await put(companyA, id, PDF_BYTES);
    expect(res.status).toBe(409);
    expect(errorResponseSchema.parse(await res.json()).code).toBe('file_row_missing');
    expect(await getObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'certificate', id))).toBeNull();
  });

  it('answers 409 file_sha_mismatch and stores nothing when the body is not the row bytes', async () => {
    const { id, op: createOp } = fileCreate(idsA, 'certificate', 'application/pdf', PDF_BYTES);
    await pushOk(companyA, [createOp]);

    const other = new TextEncoder().encode('%PDF-1.4\nother bytes\n%%EOF\n');
    const res = await put(companyA, id, other);
    expect(res.status).toBe(409);
    expect(errorResponseSchema.parse(await res.json()).code).toBe('file_sha_mismatch');
    expect(await getObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'certificate', id))).toBeNull();
  });

  it('answers 413 file_too_large for a body past the 25 MB cap, and stores nothing', async () => {
    const big = new Uint8Array(MAX_FILE_BYTES + 1024);
    const { id, op: createOp } = fileCreate(idsA, 'certificate', 'application/pdf', big);
    await pushOk(companyA, [createOp]);

    const res = await put(companyA, id, big);
    expect(res.status).toBe(413);
    expect(errorResponseSchema.parse(await res.json()).code).toBe('file_too_large');
    expect(await getObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'certificate', id))).toBeNull();
  });

  it('answers 409 file_sha_mismatch when the body length is not the size the row declares', async () => {
    const bytes = PDF_BYTES;
    const { id, op: createOp } = fileCreate(idsA, 'certificate', 'application/pdf', bytes);
    // A row that understates its size would have every storage and quota reader believe it.
    const forged = { ...createOp, value: { ...(createOp.value as object), size: 1 } };
    await pushOk(companyA, [forged as Op]);

    const res = await put(companyA, id, bytes);
    expect(res.status).toBe(409);
    expect(errorResponseSchema.parse(await res.json()).code).toBe('file_sha_mismatch');
    expect(await getObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'certificate', id))).toBeNull();
  });

  it('answers 413 file_too_large when the row itself declares a size over the limit', async () => {
    const bytes = new TextEncoder().encode('small body, big claim');
    const { id, op: createOp } = fileCreate(idsA, 'certificate', 'application/pdf', bytes);
    // The row's `size` is client-supplied: a 26 MB claim is the permanent verdict, not a
    // kind the device could correct.
    const forged = { ...createOp, value: { ...(createOp.value as object), size: 26 * 1024 * 1024 } };
    await pushOk(companyA, [forged as Op]);

    const res = await put(companyA, id, bytes);
    expect(res.status).toBe(413);
    expect(errorResponseSchema.parse(await res.json()).code).toBe('file_too_large');
  });

  it('answers 413 for a chunked body over the limit, with no content-length to go on', async () => {
    const { id, op: createOp } = fileCreate(idsA, 'certificate', 'application/pdf', PDF_BYTES);
    await pushOk(companyA, [createOp]);

    // A ReadableStream body makes undici send `transfer-encoding: chunked`, so the
    // declared-length check cannot fire and `readCappedBody` is what refuses it.
    const chunk = new Uint8Array(1024 * 1024).fill(0x20);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 27 * 1024 * 1024) {
          controller.close();
          return;
        }
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    // The 413 comes while the body is still being sent, so this socket is left
    // half-written; `connection: close` keeps it out of the pool for the next test.
    const res = await authed(companyA, `/api/files/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream', connection: 'close' },
      body,
      duplex: 'half',
    } as RequestInit);
    expect(res.status).toBe(413);
    expect(errorResponseSchema.parse(await res.json()).code).toBe('file_too_large');
    expect(await getObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'certificate', id))).toBeNull();
  });

  it('answers 409 file_row_missing for an id that is not a uuid, never a 500', async () => {
    const res = await put(companyA, 'not-a-uuid', PDF_BYTES);
    expect(res.status).toBe(409);
    expect(errorResponseSchema.parse(await res.json()).code).toBe('file_row_missing');
  });

  it('answers 404 on GET for an id that is not a uuid, exactly as for an unknown one', async () => {
    const bad = await authed(companyA, '/api/files/not-a-uuid/original');
    const unknown = await authed(companyA, `/api/files/${newId()}/original`);
    expect(bad.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(errorResponseSchema.parse(await bad.json()).code).toBe('not_found');
  });

  it('refuses a row whose own id is not the id it is filed under, and touches neither key', async () => {
    // The victim: a real, already-uploaded file of the same company.
    const victimBytes = new TextEncoder().encode('%PDF-1.4\nthe original certificate\n%%EOF\n');
    const victim = fileCreate(idsA, 'certificate', 'application/pdf', victimBytes);
    await pushOk(companyA, [victim.op]);
    expect((await put(companyA, victim.id, victimBytes)).status).toBe(200);

    const attackBytes = new TextEncoder().encode('%PDF-1.4\nreplaced\n%%EOF\n');
    const attackerId = newId();
    written.entityIds.add(attackerId);

    // First layer: a create op whose `value.id` is not its path id never applies at all,
    // so the row below cannot be reached through the sync push (`opSchema`, AD-4). The op
    // is built valid and then bent, because `makeOp` refuses to build it bent.
    const honest = fileCreate(idsA, 'certificate', 'application/pdf', attackBytes, attackerId);
    const forgedOp = { ...honest.op, value: { ...(honest.op.value as object), id: victim.id } };
    written.opIds.add(forgedOp.op_id);
    const pushed = await authed(companyA, '/api/sync/ops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ops: [forgedOp] }),
    });
    expect(syncPushResponseSchema.parse(await pushed.json()).rejected).toEqual([
      { op_id: forgedOp.op_id, code: 'op_invalid' },
    ]);

    // Second layer: the route does not rely on that. Written straight into `entities`,
    // the same row is still refused and no object is touched -- the key comes from the id
    // the row is filed under, never from the id its JSON claims.
    await db.insert(entities).values({
      company_id: companyA.companyId,
      entity: 'file',
      id: attackerId,
      relatorio_id: null,
      project_id: null,
      row: forgedOp.value as never,
      removed_at: null,
      updated_seq: 0,
    });

    const res = await put(companyA, attackerId, attackBytes);
    expect(res.status).toBe(409);
    expect(errorResponseSchema.parse(await res.json()).code).toBe('file_row_missing');
    expect((await authed(companyA, `/api/files/${attackerId}/original`)).status).toBe(404);

    // The victim's object is byte for byte what it was.
    const got = await authed(companyA, `/api/files/${victim.id}/original`);
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(victimBytes);
    // And nothing was written under the forged row's own id either.
    expect(await getObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'certificate', attackerId))).toBeNull();
  });

  it('answers 400 file_kind_invalid for a kind/mime pair this route does not store', async () => {
    const gif = new TextEncoder().encode('GIF89a-not-really');
    const { id, op: createOp } = fileCreate(idsA, 'certificate', 'image/gif', gif);
    await pushOk(companyA, [createOp]);

    const res = await put(companyA, id, gif);
    expect(res.status).toBe(400);
    expect(errorResponseSchema.parse(await res.json()).code).toBe('file_kind_invalid');
  });
});

describe('2.2-API-006 the bytes are never served as a page', () => {
  it('serves the original as a download, and neither route lets the browser sniff a type', async () => {
    // An SVG logo is the dangerous case: served inline from this origin it would run as
    // script with the session cookie.
    const { id, op: createOp } = fileCreate(idsA, 'logo', 'image/svg+xml', SVG_BYTES);
    await pushOk(companyA, [createOp]);
    const put200 = await put(companyA, id, SVG_BYTES);
    expect(put200.headers.get('x-content-type-options')).toBe('nosniff');

    const original = await authed(companyA, `/api/files/${id}/original`);
    expect(original.status).toBe(200);
    expect(original.headers.get('x-content-type-options')).toBe('nosniff');
    expect(original.headers.get('content-disposition')).toBe('attachment');

    const thumb = await authed(companyA, `/api/files/${id}/thumb`);
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get('x-content-type-options')).toBe('nosniff');
    // A variant is server-rendered PNG/JPEG, so it stays inline for an <img> to use.
    expect(thumb.headers.get('content-disposition')).toBeNull();
  });
});

describe('2.2-API-003 variants', () => {
  it('writes thumb and print for a png logo, emits file/{id}/variants, and both GET', async () => {
    const png = await pngBytes();
    const { id, op: createOp } = fileCreate(idsA, 'logo', 'image/png', png);
    await pushOk(companyA, [createOp]);

    const body = filePutResponseSchema.parse(await (await put(companyA, id, png)).json());
    expect(body.variants).not.toBeNull();
    expect(body.variants?.thumb).toBe(objectKey(companyA.companyId, 'logo', id, 'thumb'));
    expect(body.variants?.print).toBe(objectKey(companyA.companyId, 'logo', id, 'print'));

    for (const variant of ['thumb', 'print'] as const) {
      const got = await authed(companyA, `/api/files/${id}/${variant}`);
      expect(got.status, `${variant} should be readable`).toBe(200);
      expect((await got.arrayBuffer()).byteLength).toBeGreaterThan(0);
    }

    // The original is untouched by the variants stored *under* its own key. MinIO's
    // object layout hides `{id}/thumb` from a listing of the `{id}` prefix (the object
    // shadows the prefix), so this reads it back by key, which is how the route does.
    const original = await authed(companyA, `/api/files/${id}/original`);
    expect(original.status).toBe(200);
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(png);

    const rows = await db.select({ op_id: ops.op_id }).from(ops).where(inArray(ops.path, [`file/${id}/variants`]));
    for (const row of rows) written.opIds.add(row.op_id);
    expect(rows).toHaveLength(1);
  });

  it('rasterizes an svg logo into both variants', async () => {
    const { id, op: createOp } = fileCreate(idsA, 'logo', 'image/svg+xml', SVG_BYTES);
    await pushOk(companyA, [createOp]);

    const body = filePutResponseSchema.parse(await (await put(companyA, id, SVG_BYTES)).json());
    expect(body.variants).not.toBeNull();
    const thumb = await authed(companyA, `/api/files/${id}/thumb`);
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get('content-type')).toContain('image/png');
  });

  it('leaves a pdf certificate without variants', async () => {
    const { id, op: createOp } = fileCreate(idsA, 'certificate', 'application/pdf', PDF_BYTES);
    await pushOk(companyA, [createOp]);
    const body = filePutResponseSchema.parse(await (await put(companyA, id, PDF_BYTES)).json());
    expect(body.variants).toBeNull();
    expect((await authed(companyA, `/api/files/${id}/thumb`)).status).toBe(404);
  });
});

describe('2.2-API-007 no object key ever comes out of the row', () => {
  it('a forged `variants` map naming another company\'s keys serves nothing', async () => {
    // Company A uploads a real logo, so its original, thumb and print all exist.
    const png = await pngBytes();
    const victim = fileCreate(idsA, 'logo', 'image/png', png);
    await pushOk(companyA, [victim.op]);
    const victimBody = filePutResponseSchema.parse(await (await put(companyA, victim.id, png)).json());
    expect(victimBody.variants).not.toBeNull();

    // Company B creates its own file whose row points `thumb`/`print` at A's keys.
    const bBytes = await pngBytes();
    const attacker = fileCreate(idsB, 'logo', 'image/png', bBytes);
    const forged = {
      ...attacker.op,
      value: {
        ...(attacker.op.value as object),
        variants: {
          thumb: objectKey(companyA.companyId, 'logo', victim.id, 'thumb'),
          print: objectKey(companyA.companyId, 'logo', victim.id),
        },
      },
    };
    written.opIds.add(forged.op_id);
    const pushed = await authed(companyB, '/api/sync/ops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ops: [forged] }),
    });
    const pushResult = syncPushResponseSchema.parse(await pushed.json());

    // First layer: a create carrying server-owned fields is refused outright.
    expect(pushResult.rejected).toEqual([{ op_id: forged.op_id, code: 'op_invalid' }]);

    // Second layer: the route does not rely on that. Written straight into `entities`,
    // the same row still serves nothing -- every key is derived, never read back.
    written.entityIds.add(attacker.id);
    await db.insert(entities).values({
      company_id: companyB.companyId,
      entity: 'file',
      id: attacker.id,
      relatorio_id: null,
      project_id: null,
      row: { ...(forged.value as object), uploaded_at: '2026-09-22T12:00:00.000Z' } as never,
      removed_at: null,
      updated_seq: 0,
    });

    for (const variant of ['thumb', 'print'] as const) {
      const res = await authed(companyB, `/api/files/${attacker.id}/${variant}`);
      expect(res.status, `${variant} must not serve A's bytes`).toBe(404);
      expect(errorResponseSchema.parse(await res.json()).code).toBe('not_found');
    }
    // A's own file is untouched and still readable by A.
    expect((await authed(companyA, `/api/files/${victim.id}/thumb`)).status).toBe(200);
  });

  it('a key shaped like a path escape is a 404, never a 500 from the store', async () => {
    const bytes = await pngBytes();
    const { id } = fileCreate(idsA, 'logo', 'image/png', bytes);
    written.entityIds.add(id);
    await db.insert(entities).values({
      company_id: companyA.companyId,
      entity: 'file',
      id,
      relatorio_id: null,
      project_id: null,
      row: {
        id,
        company_id: companyA.companyId,
        relatorio_id: null,
        kind: 'logo',
        sha256: sha256(bytes),
        mime: 'image/png',
        size: bytes.byteLength,
        uploaded_at: '2026-09-22T12:00:00.000Z',
        variants: { thumb: '../../../etc/passwd', print: '../../../etc/passwd' },
        // Part of the row JSON, not only the column: `fileBase.removed_at` is nullable,
        // not optional, so leaving it out would make the row unparseable and the route
        // would answer 404 before ever building a key -- the case would pass vacuously.
        removed_at: null,
      } as never,
      removed_at: null,
      updated_seq: 0,
    });

    for (const variant of ['thumb', 'print'] as const) {
      const res = await authed(companyA, `/api/files/${id}/${variant}`);
      expect(res.status, 'a name the store would refuse must not surface as a 500').toBe(404);
      expect(errorResponseSchema.parse(await res.json()).code).toBe('not_found');
    }
  });
});

describe('2.2-API-008 server-owned fields may not ride in on a create', () => {
  it('rejects a client create claiming uploaded_at or variants, and applies a clean one', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4\nnever uploaded\n%%EOF\n');

    for (const server of [{ uploaded_at: '2026-09-22T12:00:00.000Z' }, { variants: { thumb: 'a', print: 'b' } }]) {
      const honest = fileCreate(idsA, 'certificate', 'application/pdf', bytes);
      const forged = { ...honest.op, value: { ...(honest.op.value as object), ...server } };
      written.opIds.add(forged.op_id);
      const res = await authed(companyA, '/api/sync/ops', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ops: [forged] }),
      });
      expect(syncPushResponseSchema.parse(await res.json()).rejected).toEqual([
        { op_id: forged.op_id, code: 'op_invalid' },
      ]);
      // Nothing was materialized, so the id is not "attached but missing" either.
      expect((await authed(companyA, `/api/files/${honest.id}/original`)).status).toBe(404);
    }

    // The same create without those fields still applies and still uploads.
    const clean = fileCreate(idsA, 'certificate', 'application/pdf', bytes);
    await pushOk(companyA, [clean.op]);
    expect((await put(companyA, clean.id, bytes)).status).toBe(200);
  });
});

describe('2.2-API-004 tenant scoping (AD-10)', () => {
  it('company B can neither PUT nor GET company A file, and cannot tell it from an unknown id', async () => {
    const png = await pngBytes();
    const { id, op: createOp } = fileCreate(idsA, 'logo', 'image/png', png);
    await pushOk(companyA, [createOp]);
    await put(companyA, id, png);

    // GET: the same 404 for A's known id and for an id that exists nowhere.
    const unknownId = newId();
    for (const variant of ['original', 'thumb', 'print'] as const) {
      const mine = await authed(companyB, `/api/files/${id}/${variant}`);
      const nobodys = await authed(companyB, `/api/files/${unknownId}/${variant}`);
      expect(mine.status).toBe(404);
      expect(nobodys.status).toBe(404);
      expect(errorResponseSchema.parse(await mine.json()).code).toBe('not_found');
      expect(errorResponseSchema.parse(await nobodys.json()).code).toBe('not_found');
    }

    // PUT: refused, identically to an id that exists nowhere, and nothing is stored.
    const knownRes = await put(companyB, id, png);
    const unknownRes = await put(companyB, unknownId, png);
    expect(knownRes.status).toBe(unknownRes.status);
    expect(errorResponseSchema.parse(await knownRes.json()).code).toBe(
      errorResponseSchema.parse(await unknownRes.json()).code,
    );
    expect(await getObject(s3, config.S3_BUCKET, objectKey(companyB.companyId, 'logo', id))).toBeNull();
    // A's object is still A's bytes: B's PUT never touched it.
    const original = await getObject(s3, config.S3_BUCKET, objectKey(companyA.companyId, 'logo', id));
    expect(original).not.toBeNull();
  });

  it('refuses both routes without a session', async () => {
    const id = newId();
    expect((await call(`/api/files/${id}`, { method: 'PUT', body: PDF_BYTES })).status).toBe(401);
    expect((await call(`/api/files/${id}/original`)).status).toBe(401);
  });
});

describe('2.2-API-005 a client may not forge the server ops', () => {
  it('rejects a device-pushed file/{id}/uploaded_at as op_server_only', async () => {
    const { id, op: createOp } = fileCreate(idsA, 'certificate', 'application/pdf', PDF_BYTES);
    await pushOk(companyA, [createOp]);
    const forged = op(idsA, { kind: 'put', scope: 'company', path: `file/${id}/uploaded_at`, value: '2026-01-01T00:00:00.000Z' });
    written.opIds.add(forged.op_id);
    const res = await authed(companyA, '/api/sync/ops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ops: [forged] }),
    });
    const parsed = syncPushResponseSchema.parse(await res.json());
    expect(parsed.rejected).toEqual([{ op_id: forged.op_id, code: 'op_server_only' }]);
  });
});
