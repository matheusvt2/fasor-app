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
import { entities, ops } from '../db/schema.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { createApp } from '../http/app.ts';
import { newId } from '../ids.ts';
import type { ReadingPayload } from '../jobs/reading/payload.ts';
import { createS3 } from '../storage/s3.ts';

/*
 * Ledger 1131 (contract 14) through `POST /api/sync/ops`, in process with a spy send to the
 * reading queue (the `panel-retarget` pattern): a gallery import batch creates its photos with
 * no reading (`reading_status: none`), so their upload sends nothing; the answer's client
 * `file/{id}/reading_kind = 'caption'` put queues the caption reading, sent once by the push
 * route when the bytes are stored, else by the upload. The put is refused (`op_invalid`, row
 * unchanged, nothing sent) on a photo with a sheet, a caption, the "Pessoas na foto" mark or a
 * reading already, on a logo file and on an id with no row.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const DEVICE = 'tablet-caption-batch';
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});
const staticDir = mkdtempSync(join(tmpdir(), 'caption-batch-'));
const up = async () => undefined;
const probes = { db: up, queue: up, storage: up, libreoffice: up };
const written = { opIds: new Set<string>(), entityIds: new Set<string>() };

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

async function fileRow(id: string): Promise<Record<string, unknown> | undefined> {
  const [found] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'file'), eq(entities.id, id)));
  return found?.row as Record<string, unknown> | undefined;
}

/** A relatório of the standard template pushed by company A's device, with a block on its first coluna. */
async function relatorio(app: App): Promise<{ relatorioId: string; blockId: string }> {
  const projectId = newId();
  const projectDraft: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: companyA.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra lote', site: 'Obra lote', removed_at: null },
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
  const coluna = drafts.map((draft) => draft.value as unknown as LocationRow).find((row) => row?.kind === 'coluna')!;
  const pair = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId,
    projectId,
    locationId: coluna.id,
    type: 'chave_seccionadora',
    tag: `SEC-L${shade}`,
    seedVersion: 'v3',
    orderKey: 'zz',
  });
  const envelope = { company_id: companyA.companyId, prev_op_id: null, batch_id: null, meta: null, actor_id: companyA.userId, kind: 'create' as const };
  const creation = [
    projectDraft,
    ...drafts,
    { ...envelope, scope: 'project' as const, project_id: projectId, relatorio_id: null, path: `equipment/${pair.equipment.id}`, value: pair.equipment as never },
    { ...envelope, scope: 'relatorio' as const, project_id: null, relatorio_id: relatorioId, path: `block/${pair.block.id}`, value: pair.block as never },
  ].map(stamp);
  for (const op of creation) written.entityIds.add((op.value as { id: string }).id);
  expect((await push(app, creation)).rejected).toEqual([]);
  return { relatorioId, blockId: pair.block.id };
}

let shade = 0;

interface PhotoShape {
  block_id?: string | null;
  caption?: string | null;
  people_in_photo?: boolean;
  reading_kind?: string | null;
  reading_target?: unknown;
  reading_status?: string;
}

/** A photo create of company A (by default a gallery batch photo: "Geral", no reading) and its bytes. */
async function photo(relatorioId: string, shape: PhotoShape = {}): Promise<{ op: Op; id: string; bytes: Uint8Array }> {
  const bytes = new Uint8Array(await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 60, g: 20, b: shade++ } } }).jpeg().toBuffer());
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
      captured_at: '2026-09-30T10:00:00.000Z',
      tz_offset: -180,
      coords: null,
      local_seq: 1,
      block_id: shape.block_id ?? null,
      item_key: null,
      caption: shape.caption ?? null,
      reading_kind: shape.reading_kind ?? null,
      reading_target: shape.reading_target ?? null,
      reading_status: shape.reading_status ?? 'none',
      people_in_photo: shape.people_in_photo ?? false,
    } as never,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: companyA.userId,
  });
  return { op, id, bytes };
}

function put(relatorioId: string, id: string, field: string, value: unknown): Op {
  return stamp({ scope: 'relatorio', company_id: companyA.companyId, project_id: null, relatorio_id: relatorioId, prev_op_id: null, batch_id: null, meta: null, actor_id: companyA.userId, kind: 'put', path: `file/${id}/${field}`, value: value as never });
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

describe('ledger 1131 a gallery batch asks for its caption reading once answered', () => {
  it('an uploaded batch photo sends nothing; the answer caption put queues it and sends the caption reading once', async () => {
    const calls: ReadingPayload[] = [];
    const app = appWith(calls);
    const { relatorioId } = await relatorio(app);
    const shot = await photo(relatorioId);
    expect((await push(app, [shot.op])).rejected).toEqual([]);
    await upload(app, shot.id, shot.bytes);
    expect(calls).toEqual([]);
    expect(await fileRow(shot.id)).toMatchObject({ reading_kind: null, reading_status: 'none' });

    const answer = put(relatorioId, shot.id, 'reading_kind', 'caption');
    const result = await push(app, [answer]);
    expect(result.rejected).toEqual([]);
    expect(result.applied.map((a) => a.op_id)).toEqual([answer.op_id]);
    expect(calls).toEqual([{ company_id: companyA.companyId, photo_id: shot.id, reading_kind: 'caption' }]);
    expect(await fileRow(shot.id)).toMatchObject({ reading_kind: 'caption', reading_status: 'running' });

    // A second caption put finds a reading already: refused, nothing sent again.
    const again = put(relatorioId, shot.id, 'reading_kind', 'caption');
    expect((await push(app, [again])).rejected).toEqual([{ op_id: again.op_id, code: 'op_invalid' }]);
    expect(calls).toHaveLength(1);
  }, 60_000);

  it('the put pushed before the upload queues the photo; the upload sends the caption reading once', async () => {
    const calls: ReadingPayload[] = [];
    const app = appWith(calls);
    const { relatorioId } = await relatorio(app);
    const shot = await photo(relatorioId);
    expect((await push(app, [shot.op, put(relatorioId, shot.id, 'reading_kind', 'caption')])).rejected).toEqual([]);
    expect(calls).toEqual([]);
    expect(await fileRow(shot.id)).toMatchObject({ reading_kind: 'caption', reading_status: 'queued' });
    await upload(app, shot.id, shot.bytes);
    expect(calls).toEqual([{ company_id: companyA.companyId, photo_id: shot.id, reading_kind: 'caption' }]);
  }, 60_000);

  it('refuses the caption put on a photo with a sheet, a caption, the people mark or a reading already, on a logo and on no row, with the row unchanged and nothing sent', async () => {
    const calls: ReadingPayload[] = [];
    const app = appWith(calls);
    const { relatorioId, blockId } = await relatorio(app);
    const shapes: PhotoShape[] = [
      { block_id: blockId },
      { caption: 'Vista geral da cabine' },
      { people_in_photo: true },
      { reading_kind: 'panel', reading_target: panelReadingTarget(newId()), reading_status: 'queued' },
      { reading_kind: 'caption', reading_status: 'queued' },
    ];
    const photos = await Promise.all(shapes.map((shape) => photo(relatorioId, shape)));
    expect((await push(app, photos.map((p) => p.op))).rejected).toEqual([]);

    // Answered in the batch itself: the context put lands first, then the caption put is refused.
    const answered = await photo(relatorioId);
    expect((await push(app, [answered.op])).rejected).toEqual([]);
    const people = put(relatorioId, answered.id, 'people_in_photo', true);
    const afterPeople = put(relatorioId, answered.id, 'reading_kind', 'caption');
    const mixed = await push(app, [people, afterPeople]);
    expect(mixed.applied.map((a) => a.op_id)).toEqual([people.op_id]);
    expect(mixed.rejected).toEqual([{ op_id: afterPeople.op_id, code: 'op_invalid' }]);

    const logoId = newId();
    written.entityIds.add(logoId);
    const logo = stamp({
      kind: 'create',
      scope: 'company',
      company_id: companyA.companyId,
      project_id: null,
      relatorio_id: null,
      path: `file/${logoId}`,
      value: { id: logoId, company_id: companyA.companyId, relatorio_id: null, kind: 'logo', sha256: 'ef'.repeat(32), mime: 'image/png', size: 10, uploaded_at: null, variants: null, removed_at: null } as never,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: companyA.userId,
    });
    expect((await push(app, [logo])).rejected).toEqual([]);

    const before = await Promise.all([...photos, answered].map((p) => fileRow(p.id)));
    const logoBefore = await fileRow(logoId);
    const bad = [
      ...[...photos, answered].map((p) => put(relatorioId, p.id, 'reading_kind', 'caption')),
      stamp({ scope: 'company', company_id: companyA.companyId, project_id: null, relatorio_id: null, prev_op_id: null, batch_id: null, meta: null, actor_id: companyA.userId, kind: 'put', path: `file/${logoId}/reading_kind`, value: 'caption' }),
      put(relatorioId, newId(), 'reading_kind', 'caption'),
    ];
    const result = await push(app, bad);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toEqual(bad.map((op) => ({ op_id: op.op_id, code: 'op_invalid' })));
    expect(await Promise.all([...photos, answered].map((p) => fileRow(p.id)))).toEqual(before);
    expect(await fileRow(logoId)).toEqual(logoBefore);

    // Their uploads send only the readings their creates asked for, never a caption for a photo with context.
    for (const p of [...photos, answered]) await upload(app, p.id, p.bytes);
    expect(calls.map((call) => [call.photo_id, call.reading_kind])).toEqual([
      [photos[3]!.id, 'panel'],
      [photos[4]!.id, 'caption'],
    ]);
  }, 60_000);
});
