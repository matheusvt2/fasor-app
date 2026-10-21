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
  syncPushResponseSchema,
  type BlockRow,
  type EquipmentBlockType,
  type FileRow,
  type JsonValue,
  type Op,
  type OpInput,
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
 * Story 14.14 (seed v7, contract 22) through POST /api/sync/ops, over the compose api with a
 * seeded user, as `sync-v6.integration.test.ts` drives it. On a v7 relatório a disjuntor on
 * "Outro" takes its oil item and VOL. ÓLEO as an oil unit does, and the crossing "Outro" to "Ar"
 * is a batch of existing families whose server rows equal the kernel replay; the SELV mark and a
 * TENSÃO ENSAIO write nothing beyond their own cells. A version-21 bundle's pull is answered 426.
 * Every id is minted per run and removed by id afterwards.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const company = TEST_SEED.companies[0];
const DEVICE = 'tablet-test-v7';
const QD = 'quadro_eletrico';
const OIL_ITEM = 'oleo_isolante_indicador_de_nivel';

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
    seedVersion,
    orderKey: 'a0',
    config: defaultBlockConfig(seedVersion, type) as unknown as JsonValue,
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

describe('Story 14.14 (contract 22): seed v7 through POST /api/sync/ops', () => {
  it('contract 22: the route speaks it and a version-21 bundle\'s pull is answered 426', async () => {
    expect(CONTRACT_VERSION).toBe(22);
    expect(MIN_CONTRACT_VERSION).toBe(22);
    const t = await relatorio('v7');
    expect((await authed(`/api/sync/relatorios/${t.relatorio}?since=0`)).status).toBe(200);
    expect((await authed(`/api/sync/relatorios/${t.relatorio}?since=0`, {}, '21')).status).toBe(426);
  });

  it('a v7 disjuntor on "Outro" keeps its oil item and VOL. ÓLEO; the crossing to "Ar" through the route equals the kernel replay, the photo kept untied', async () => {
    const t = await relatorio('v7');
    const dj = blockCreates(t, 'disjuntor_mt', 'v7');
    const photo = photoCreate(t.relatorio, dj.id, OIL_ITEM);
    const setup = [
      dj.equipment,
      dj.block,
      photo,
      put(t.relatorio, sheetNameplatePath(dj.id, 'meio_de_extincao'), 'Outro'),
      put(t.relatorio, sheetNameplatePath(dj.id, 'vol_oleo'), num('45', 'L')),
      put(t.relatorio, sheetChecklistPath(dj.id, OIL_ITEM, 'result'), 'C'),
    ];
    const first = await pushOk(setup);
    expect(first.rejected).toEqual([]);
    const before = (await rowOfEntity('block', dj.id)) as BlockRow;
    expect(before).toMatchObject({ block_type: 'disjuntor_mt', seed_version: 'v7' });
    expect(checklistResultOf(before, OIL_ITEM)).toBe('C');
    expect(before.sheet.nameplate.vol_oleo!.value).toEqual(num('45', 'L'));
    const photoRow = (await rowOfEntity('file', (photo.value as { id: string }).id)) as FileRow;
    // Outro to Óleo crosses nothing; Outro to Ar clears the item, VOL. ÓLEO and the photo tie.
    expect(oilCrossingPuts({ blocks: [before], files: [photoRow] as never }, dj.id, 'meio_de_extincao', 'Óleo')).toEqual([]);
    const crossing = oilCrossingPuts({ blocks: [before], files: [photoRow] as never }, dj.id, 'meio_de_extincao', 'Ar');
    expect(crossing.map((entry) => entry.path)).toEqual([sheetChecklistPath(dj.id, OIL_ITEM, 'result'), sheetNameplatePath(dj.id, 'vol_oleo'), fileFieldPath(photoRow.id, 'item_key')]);
    const prev = (path: string) => {
      const parsed = path.split('/');
      if (parsed[0] === 'file') return null;
      const cell = parsed[2] === 'nameplate' ? before.sheet.nameplate[parsed[3]!] : before.sheet.checklist[parsed[3]!]?.[parsed[4] as 'result' | 'observation'];
      return cell?.op_id ?? null;
    };
    const batchId = newId();
    const batch = [
      put(t.relatorio, sheetNameplatePath(dj.id, 'meio_de_extincao'), 'Ar', { batch_id: batchId, prev_op_id: prev(sheetNameplatePath(dj.id, 'meio_de_extincao')) }),
      ...crossing.map((entry) => put(t.relatorio, entry.path, entry.value, { batch_id: batchId, prev_op_id: prev(entry.path) })),
    ];
    expect((await pushOk(batch)).rejected).toEqual([]);
    const server = (await rowOfEntity('block', dj.id)) as BlockRow;
    const pure = replay([...t.log, ...setup, ...batch].map((o, i) => ({ ...o, seq: i + 1 })));
    expect(canonicalJson(server as never)).toBe(canonicalJson(pure.get(entityKey('block', dj.id)) as never));
    expect(checklistResultOf(server, OIL_ITEM)).toBe('NA');
    expect(server.sheet.nameplate.vol_oleo?.value ?? null).toBeNull();
    const untied = (await rowOfEntity('file', photoRow.id)) as FileRow & { item_key: string | null };
    expect(untied).toMatchObject({ block_id: dj.id, item_key: null, removed_at: null });
  });

  it('a v7 QGBT marked SELV/PELV at 380 V with an insulation cell: only the pushed cells are written, the row equals the kernel replay', async () => {
    const t = await relatorio('v7');
    const qd = blockCreates(t, QD, 'v7');
    const edits = [
      qd.equipment,
      qd.block,
      put(t.relatorio, sheetNameplatePath(qd.id, 'tensao_nominal'), num('380', 'V')),
      put(t.relatorio, sheetNameplatePath(qd.id, 'circuito_selv_pelv'), 'SIM'),
      put(t.relatorio, sheetTestCellPath(qd.id, 'isolacao', 0, 1), num('850', 'MΩ')),
    ];
    const result = await pushOk(edits);
    expect(result.rejected).toEqual([]);
    const server = (await rowOfEntity('block', qd.id)) as BlockRow;
    expect(Object.keys(server.sheet.nameplate).sort()).toEqual(['circuito_selv_pelv', 'tensao_nominal']);
    const pure = replay([...t.log, ...edits].map((o, i) => ({ ...o, seq: i + 1 })));
    expect(canonicalJson(server as never)).toBe(canonicalJson(pure.get(entityKey('block', qd.id)) as never));
  });
});
