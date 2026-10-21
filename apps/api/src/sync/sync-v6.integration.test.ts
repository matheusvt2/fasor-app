import {
  blockPath,
  canonicalJson,
  checklistResultOf,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  defaultBlockConfig,
  entityKey,
  fileFieldPath,
  makeOp,
  MIN_CONTRACT_VERSION,
  newEquipmentBlock,
  oilCrossingPuts,
  replay,
  sheetChecklistPath,
  sheetNameplatePath,
  sheetTestCellPath,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type BlockRow,
  type EquipmentBlockType,
  type FileRow,
  type JsonValue,
  type Op,
  type OpInput,
  type SyncPullResponse,
  type SyncPushResponse,
} from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { entities, ops, syncDevicePush } from '../db/schema.ts';
import { newId } from '../ids.ts';

/*
 * Stories 14.9 and 14.11 (seed v6, contract 21) through POST /api/sync/ops, over the compose api
 * with a seeded user, as `sync-cta.integration.test.ts` drives it. On a v6 relatório the Quadro
 * elétrico's create and its cells are accepted and the server's row equals the kernel replay; on
 * v5 its create answers `op_invalid` inside a 200 and writes nothing. A crossing between oil and
 * non-oil is a batch of existing families (nameplate, checklist, `file/{id}/item_key`): pushed
 * through the route, the server's rows equal the kernel replay of the same ops. A version-20
 * bundle's pull is answered 426. Every id is minted per run and removed by id afterwards.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const company = TEST_SEED.companies[0];
const DEVICE = 'tablet-test-v6';
const QD = 'quadro_eletrico';

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

const written = { opIds: new Set<string>(), entityIds: new Set<string>() };

function call(path: string, init: RequestInit = {}, version = String(CONTRACT_VERSION)): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: apiUrl,
    [CONTRACT_VERSION_HEADER]: version,
    ...(init.headers as Record<string, string> | undefined),
  };
  return fetch(`${apiUrl}${path}`, { ...init, redirect: 'manual', headers });
}

async function signIn(): Promise<string> {
  const res = await call('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email: company.email, password: TEST_SEED.password }) });
  expect(res.status, await res.text()).toBe(200);
  return res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

let cookie: string | null = null;

/** An authenticated call that signs in again once on a 401 (another suite may have re-seeded the users). */
async function authed(path: string, init: RequestInit = {}, version = String(CONTRACT_VERSION)): Promise<Response> {
  const attempt = async (fresh: boolean) => {
    if (cookie === null || fresh) cookie = await signIn();
    return call(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), cookie } }, version);
  };
  const first = await attempt(false);
  return first.status === 401 ? attempt(true) : first;
}

async function pushOk(batch: Op[]): Promise<SyncPushResponse> {
  const res = await authed('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: batch }) });
  expect(res.status, await res.clone().text()).toBe(200);
  const parsed = syncPushResponseSchema.parse(await res.json());
  for (const pushed of batch) written.opIds.add(pushed.op_id);
  return parsed;
}

async function pullOk(path: string): Promise<SyncPullResponse> {
  const res = await authed(path);
  expect(res.status, await res.clone().text()).toBe(200);
  return syncPullResponseSchema.parse(await res.json());
}

function op(input: Omit<OpInput, 'company_id' | 'actor_id' | 'device_id'> & Partial<OpInput>): Op {
  return makeOp(
    { company_id: company.companyId, actor_id: company.userId, device_id: DEVICE, project_id: null, relatorio_id: null, prev_op_id: null, batch_id: null, meta: null, ...input },
    { newId, now: now() },
  );
}

const scoped = (relatorioId: string) => ({ scope: 'relatorio' as const, relatorio_id: relatorioId });
const put = (relatorioId: string, path: string, value: unknown, extra: Partial<OpInput> = {}): Op => op({ ...scoped(relatorioId), kind: 'put', path, value: value as Op['value'], ...extra });
const num = (raw: string, unit: string): JsonValue => ({ raw, unit, state: 'measured' });

function relatorioCreate(relatorioId: string, projectId: string, seedVersion: string): Op {
  written.entityIds.add(relatorioId);
  return op({
    ...scoped(relatorioId),
    kind: 'create',
    path: `relatorio/${relatorioId}`,
    value: {
      id: relatorioId,
      project_id: projectId,
      template_id: null,
      template_version: null,
      seed_version: seedVersion,
      status: 'rascunho',
      setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null },
      export: { scheme: 'por_local_e_tipo' },
      preview_file_id: null,
      removed_at: null,
    },
  });
}

function localCreate(relatorioId: string, id: string): Op {
  written.entityIds.add(id);
  return op({
    ...scoped(relatorioId),
    kind: 'create',
    path: `location/${id}`,
    value: {
      id,
      relatorio_id: relatorioId,
      parent_id: null,
      kind: 'cabine',
      name: 'Subestação',
      order_key: 'a0',
      removed_at: null,
      se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
      env: { altitude_m: null, temperature_c: null, humidity_pct: null },
      agrupar_por_tipo: true,
    },
  });
}

/** The two creates one palette tap writes for a new block of `type` on `seedVersion`: the equipment row and the block row. */
function blockCreates(ids: { relatorio: string; project: string; local: string }, type: EquipmentBlockType, seedVersion: string): { equipment: Op; block: Op; id: string } {
  const block = newId();
  const equipment = newId();
  written.entityIds.add(block);
  written.entityIds.add(equipment);
  const built = newEquipmentBlock({
    blockId: block,
    equipmentId: equipment,
    relatorioId: ids.relatorio,
    projectId: ids.project,
    locationId: ids.local,
    type,
    tag: `${type}-1`,
    seedVersion: 'v6',
    orderKey: 'a0',
    config: defaultBlockConfig('v6', type) as unknown as JsonValue,
  });
  return {
    equipment: op({ kind: 'create', scope: 'project', project_id: ids.project, path: `equipment/${equipment}`, value: built.equipment as unknown as Op['value'] }),
    block: op({ ...scoped(ids.relatorio), kind: 'create', path: blockPath(block), value: { ...built.block, seed_version: seedVersion } as unknown as Op['value'] }),
    id: block,
  };
}

function photoCreate(relatorioId: string, blockId: string, itemKey: string): Op {
  const id = newId();
  written.entityIds.add(id);
  return op({
    ...scoped(relatorioId),
    kind: 'create',
    path: `file/${id}`,
    value: {
      id,
      company_id: company.companyId,
      relatorio_id: relatorioId,
      kind: 'photo',
      sha256: 'ab'.repeat(32),
      mime: 'image/jpeg',
      size: 10,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      captured_at: '2026-10-20T10:00:00.000Z',
      tz_offset: -180,
      coords: null,
      local_seq: 1,
      block_id: blockId,
      item_key: itemKey,
      caption: null,
      reading_kind: null,
      reading_target: null,
      reading_status: 'none',
      people_in_photo: false,
    },
  });
}

async function rowOfEntity(entity: string, id: string): Promise<unknown> {
  const [found] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, entity), eq(entities.id, id)));
  return found?.row;
}

async function storedIds(candidates: string[]): Promise<Set<string>> {
  const rows = await db.select({ op_id: ops.op_id }).from(ops).where(inArray(ops.op_id, candidates));
  return new Set(rows.map((r) => r.op_id));
}

async function relatorio(seedVersion: string) {
  const ids = { relatorio: newId(), project: newId(), local: newId() };
  const log = [relatorioCreate(ids.relatorio, ids.project, seedVersion), localCreate(ids.relatorio, ids.local)];
  const result = await pushOk(log);
  expect(result.rejected).toEqual([]);
  return { ...ids, log };
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
}, 60_000);

afterAll(async () => {
  const opIds = [...written.opIds];
  const entityIds = [...written.entityIds];
  if (opIds.length > 0) await db.delete(ops).where(inArray(ops.op_id, opIds));
  if (entityIds.length > 0) await db.delete(entities).where(inArray(entities.id, entityIds));
  await db.delete(syncDevicePush).where(eq(syncDevicePush.device_id, DEVICE));
  await sql.end();
});

describe('Stories 14.9 and 14.11 (contract 21): seed v6 through POST /api/sync/ops', () => {
  it('contract 21: the route speaks it and a version-20 bundle\'s pull is answered 426', async () => {
    // Contract 21 introduced seed v6; later contracts (23, Story 14.12) keep refusing 20.
    expect(CONTRACT_VERSION).toBeGreaterThanOrEqual(21);
    expect(MIN_CONTRACT_VERSION).toBeGreaterThanOrEqual(21);
    const t = await relatorio('v6');
    expect((await authed(`/api/sync/relatorios/${t.relatorio}?since=0`)).status).toBe(200);
    expect((await authed(`/api/sync/relatorios/${t.relatorio}?since=0`, {}, '20')).status).toBe(426);
  });

  it('on a v6 relatório the QGBT\'s create, its plate and its four insulation cells are accepted, and the server row equals the kernel replay', async () => {
    const t = await relatorio('v6');
    const qd = blockCreates(t, QD, 'v6');
    const edits = [
      qd.equipment,
      qd.block,
      put(t.relatorio, sheetNameplatePath(qd.id, 'tensao_nominal'), num('380', 'V')),
      put(t.relatorio, sheetNameplatePath(qd.id, 'ip'), 'IP54'),
      put(t.relatorio, sheetNameplatePath(qd.id, 'circuito_selv_pelv'), 'NÃO'),
      put(t.relatorio, sheetChecklistPath(qd.id, 'organizacao_interna', 'result'), 'NC'),
      ...['850', '1200', '0.4', '900'].map((raw, row) => put(t.relatorio, sheetTestCellPath(qd.id, 'isolacao', row, 1), num(raw, 'MΩ'))),
    ];
    const result = await pushOk(edits);
    expect(result.rejected).toEqual([]);
    expect(result.applied.map((a) => a.op_id)).toEqual(edits.map((o) => o.op_id));
    const server = (await rowOfEntity('block', qd.id)) as BlockRow;
    expect(server).toMatchObject({ block_type: QD, seed_version: 'v6' });
    expect(server.sheet.test.isolacao!.cells['3']!['1']!.value).toEqual(num('900', 'MΩ'));
    const pure = replay([...t.log, ...edits].map((o, i) => ({ ...o, seq: i + 1 })));
    expect(canonicalJson(server as never)).toBe(canonicalJson(pure.get(entityKey('block', qd.id)) as never));
    const page = await pullOk(`/api/sync/relatorios/${t.relatorio}?since=0`);
    expect((page.ops as Op[]).map((o) => o.path)).toContain(blockPath(qd.id));
  });

  it('matrix "QGBT on an old seed": on a v5 relatório the create is op_invalid, 200, nothing written, and the rest of the push applies', async () => {
    const t = await relatorio('v5');
    const refused = blockCreates(t, QD, 'v5');
    const bornOnV6 = blockCreates(t, QD, 'v6');
    const good = blockCreates(t, 'chave_transferencia_automatica', 'v5');
    const batch = [refused.block, bornOnV6.block, good.block];
    const result = await pushOk(batch);
    expect(result.rejected).toEqual([
      { op_id: refused.block.op_id, code: 'op_invalid' },
      { op_id: bornOnV6.block.op_id, code: 'op_invalid' },
    ]);
    expect(result.applied.map((a) => a.op_id)).toEqual([good.block.op_id]);
    expect(await rowOfEntity('block', refused.id)).toBeUndefined();
    expect(await rowOfEntity('block', bornOnV6.id)).toBeUndefined();
    expect((await storedIds([refused.block.op_id, bornOnV6.block.op_id])).size).toBe(0);
  });

  it('a crossing ÓLEO to Á SECO is one batch of existing families: through the route the server rows equal the kernel replay, the photo kept untied', async () => {
    const t = await relatorio('v6');
    const tr = blockCreates(t, 'transformador_forca', 'v6');
    const photo = photoCreate(t.relatorio, tr.id, 'termometro');
    const setup = [
      tr.equipment,
      tr.block,
      photo,
      put(t.relatorio, sheetNameplatePath(tr.id, 'tipo_de_isolacao'), 'ÓLEO'),
      put(t.relatorio, sheetNameplatePath(tr.id, 'vol_oleo'), num('320', 'L')),
      put(t.relatorio, sheetChecklistPath(tr.id, 'termometro', 'result'), 'C'),
      put(t.relatorio, sheetChecklistPath(tr.id, 'termometro', 'observation'), 'leitura conferida'),
    ];
    expect((await pushOk(setup)).rejected).toEqual([]);
    const before = (await rowOfEntity('block', tr.id)) as BlockRow;
    const photoRow = (await rowOfEntity('file', (photo.value as { id: string }).id)) as FileRow;
    const crossing = oilCrossingPuts({ blocks: [before], files: [photoRow] as never }, tr.id, 'tipo_de_isolacao', 'Á SECO');
    expect(crossing.map((entry) => entry.path)).toEqual([
      sheetChecklistPath(tr.id, 'termometro', 'result'),
      sheetChecklistPath(tr.id, 'termometro', 'observation'),
      sheetNameplatePath(tr.id, 'vol_oleo'),
      fileFieldPath(photoRow.id, 'item_key'),
    ]);
    const prev = (path: string) => {
      const parsed = path.split('/');
      if (parsed[0] === 'file') return null;
      const cell = parsed[2] === 'nameplate' ? before.sheet.nameplate[parsed[3]!] : before.sheet.checklist[parsed[3]!]?.[parsed[4] as 'result' | 'observation'];
      return cell?.op_id ?? null;
    };
    const batchId = newId();
    const batch = [
      put(t.relatorio, sheetNameplatePath(tr.id, 'tipo_de_isolacao'), 'Á SECO', { batch_id: batchId, prev_op_id: prev(sheetNameplatePath(tr.id, 'tipo_de_isolacao')) }),
      ...crossing.map((entry) => put(t.relatorio, entry.path, entry.value, { batch_id: batchId, prev_op_id: prev(entry.path) })),
    ];
    const result = await pushOk(batch);
    expect(result.rejected).toEqual([]);
    const server = (await rowOfEntity('block', tr.id)) as BlockRow;
    const pure = replay([...t.log, ...setup, ...batch].map((o, i) => ({ ...o, seq: i + 1 })));
    expect(canonicalJson(server as never)).toBe(canonicalJson(pure.get(entityKey('block', tr.id)) as never));
    expect(checklistResultOf(server, 'termometro')).toBe('NA');
    expect(server.sheet.nameplate.vol_oleo?.value ?? null).toBeNull();
    const untied = (await rowOfEntity('file', photoRow.id)) as FileRow & { item_key: string | null };
    expect(untied).toMatchObject({ block_id: tr.id, item_key: null, removed_at: null });
    expect(canonicalJson(untied as never)).toBe(canonicalJson(pure.get(entityKey('file', photoRow.id)) as never));
  });
});
