import {
  blockConfigWithOption,
  blockConfigWithSubBlock,
  blockFieldPath,
  blockPath,
  canonicalJson,
  choiceValue,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  defaultBlockConfig,
  entityKey,
  getDefinition,
  makeOp,
  newEquipmentBlock,
  replay,
  sheetTestCellPath,
  sheetTestValuePath,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type BlockRow,
  type JsonValue,
  type MeasurementTest,
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
 * Story 14.5 (contract 19): the Chave de transferência automática through POST /api/sync/ops,
 * over the compose api with a seeded user, the way `sync.integration.test.ts` drives it. On a
 * relatório on seed v5 the block create, a table cell, a choice cell, a test value
 * (`sheet/{block_id}/test/{test_key}/value/{value_key}`) and the configuration put are
 * accepted, and the server's block row equals the kernel replay of the same ops. Every
 * refusal of the spec's I/O matrix the server can meet (the type on an older seed, a value
 * key the test does not declare, a fixed cell, an address outside the table) answers
 * `op_invalid` inside a 200, never a 500, and writes nothing. Every id is minted per run; the
 * rows this suite wrote are removed by id afterwards.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const company = TEST_SEED.companies[0];
const DEVICE = 'tablet-test-cta';

const CTA = 'chave_transferencia_automatica';
const E1 = 'cta_resistencia_contato';
const E2 = 'cta_isolamento_principal';
const E4 = 'cta_ajustes_controlador';
const E5 = 'cta_transferencia';
const E6 = 'cta_termografia';

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

/** Everything this suite writes, removed in afterAll: op ids and entity ids. */
const written = { opIds: new Set<string>(), entityIds: new Set<string>() };

function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: apiUrl,
    [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION),
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

/**
 * An authenticated call that signs in again once on a 401: `auth.integration.test.ts`
 * re-seeds the users, which revokes their sessions (the documented password-reset path).
 */
async function authed(path: string, init: RequestInit = {}): Promise<Response> {
  const attempt = async (fresh: boolean) => {
    if (cookie === null || fresh) cookie = await signIn();
    return call(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), cookie } });
  };
  const first = await attempt(false);
  return first.status === 401 ? attempt(true) : first;
}

/** One push through the route; a refusal is an entry of `rejected` inside a 200, so anything else fails here. */
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
const put = (relatorioId: string, path: string, value: unknown): Op => op({ ...scoped(relatorioId), kind: 'put', path, value: value as Op['value'] });
const num = (raw: string, unit: string | null): JsonValue => ({ raw, unit, state: 'measured' });

/** A Rascunho relatório row on `seedVersion` (the helpers of `sync.integration.test.ts` only make v1). */
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
      name: 'Geradores',
      order_key: 'a0',
      removed_at: null,
      se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
      env: { altitude_m: null, temperature_c: null, humidity_pct: null },
      agrupar_por_tipo: true,
    },
  });
}

/**
 * The two creates one palette tap writes for a new Chave de transferência automática
 * (`newEquipmentBlock`): the equipment row (project scope) and the block row, born on
 * `blockSeedVersion` with the type's default configuration of seed v5.
 */
function ctaCreates(ids: { relatorio: string; project: string; local: string; block: string; equipment: string }, blockSeedVersion = 'v5'): { equipment: Op; block: Op; row: BlockRow } {
  written.entityIds.add(ids.block);
  written.entityIds.add(ids.equipment);
  const built = newEquipmentBlock({
    blockId: ids.block,
    equipmentId: ids.equipment,
    relatorioId: ids.relatorio,
    projectId: ids.project,
    locationId: ids.local,
    type: CTA,
    tag: 'CTA-GERADORES',
    seedVersion: 'v5',
    orderKey: 'a0',
    config: defaultBlockConfig('v5', CTA) as unknown as JsonValue,
  });
  const row: BlockRow = { ...built.block, seed_version: blockSeedVersion };
  return {
    equipment: op({ kind: 'create', scope: 'project', project_id: ids.project, path: `equipment/${ids.equipment}`, value: built.equipment as unknown as Op['value'] }),
    block: op({ ...scoped(ids.relatorio), kind: 'create', path: blockPath(ids.block), value: row as unknown as Op['value'] }),
    row,
  };
}

/** One of the eight on seed v1, as `sync.integration.test.ts` creates it: the op a refusing push must still apply. */
function seccionadoraCreate(relatorioId: string, blockId: string, locationId: string): Op {
  written.entityIds.add(blockId);
  return op({
    ...scoped(relatorioId),
    kind: 'create',
    path: blockPath(blockId),
    value: {
      id: blockId,
      relatorio_id: relatorioId,
      location_id: locationId,
      equipment_id: null,
      block_type: 'chave_seccionadora',
      config: {},
      seed_version: 'v1',
      order_key: 'a1',
      feeds_block_id: null,
      not_tested: null,
      concluded_by: null,
      sheet: { nameplate: {}, checklist: {}, test: {}, conclusion: {}, observations: null },
      created_by: null,
      first_edited_at: null,
      last_modified_by: null,
      last_modified_at: null,
      removed_at: null,
    },
  });
}

const definition = getDefinition('v5', 'cabine_primaria', CTA);
const testOf = (key: string): MeasurementTest => definition.measurement_tests!.find((test) => test.key === key)!;
/** The index of a row or a column of a test, by key: the op path's `row` and `col`. */
const rowOf = (testKey: string, rowKey: string): number => testOf(testKey).rows.findIndex((row) => row.key === rowKey);
const colOf = (testKey: string, columnKey: string): number => testOf(testKey).columns.findIndex((column) => column.key === columnKey);
const cellPath = (blockId: string, testKey: string, rowKey: string, columnKey: string) => sheetTestCellPath(blockId, testKey, rowOf(testKey, rowKey), colOf(testKey, columnKey));

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

/** A relatório on `seedVersion` with one local; on v5, a Chave de transferência automática on it too. */
async function relatorio(seedVersion: string) {
  const ids = { relatorio: newId(), project: newId(), local: newId(), block: newId(), equipment: newId() };
  const log = [relatorioCreate(ids.relatorio, ids.project, seedVersion), localCreate(ids.relatorio, ids.local)];
  if (seedVersion === 'v5') {
    const cta = ctaCreates(ids);
    log.push(cta.equipment, cta.block);
  }
  const result = await pushOk(log);
  expect(result.rejected).toEqual([]);
  expect(result.applied.map((a) => a.op_id)).toEqual(log.map((o) => o.op_id));
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

describe('Story 14.5 (contract 19): the Chave de transferência automática through POST /api/sync/ops', () => {
  it('the fixed cells and the row indexes this suite writes are the ones seed v5 declares', () => {
    // The paths below are built from the definition; these pin what they resolve to.
    expect([rowOf(E1, 'polo_c'), colOf(E1, 'lado_emergencia')]).toEqual([2, 1]);
    expect(testOf(E5).rows[rowOf(E5, 'ate_carga_na_emergencia')]!.fixed).toEqual({ ajuste: 'limite 10 s' });
    expect(testOf(E2).rows[rowOf(E2, 'linha_carga')]!.fixed).toEqual({ normal_fechada: '—', emergencia_fechada: '—' });
    expect(testOf(E5).values!.map((value) => value.key)).toContain('metodo');
    expect(testOf(E5).values!.map((value) => value.key)).not.toContain('duracao');
  });

  it('on a v5 relatório the block create, a cell, a choice cell, test values and the configuration are accepted, and the server row equals the kernel replay, byte for byte', async () => {
    const t = await relatorio('v5');
    const created = (await rowOfEntity('block', t.block)) as BlockRow;
    expect(created).toMatchObject({ block_type: CTA, seed_version: 'v5', location_id: t.local, equipment_id: t.equipment, created_by: company.userId });
    expect(await rowOfEntity('equipment', t.equipment)).toMatchObject({ type: CTA, tag: 'CTA-GERADORES', project_id: t.project });

    const metodo = sheetTestValuePath(t.block, E5, 'metodo');
    expect(metodo).toBe(`sheet/${t.block}/test/cta_transferencia/value/metodo`);
    const poloC = cellPath(t.block, E1, 'polo_c', 'lado_emergencia');
    expect(poloC).toBe(`sheet/${t.block}/test/cta_resistencia_contato/cell/2/1`);
    const faltaDeFase = cellPath(t.block, E4, 'falta_de_fase', 'deixado');
    // The configuration is the whole config put (structure): four poles, then the E6 switch off.
    const fourPoles = blockConfigWithOption(created.config, 'polos', '4');
    const edits = [
      put(t.relatorio, poloC, num('63', 'µΩ')),
      put(t.relatorio, faltaDeFase, choiceValue('ligado')),
      put(t.relatorio, metodo, choiceValue('falta_real')),
      put(t.relatorio, sheetTestValuePath(t.block, E5, 'carga'), choiceValue('com_carga')),
      put(t.relatorio, sheetTestValuePath(t.block, E5, 'carga_percentual'), num('62', '%')),
      put(t.relatorio, blockFieldPath(t.block, 'config'), fourPoles),
      put(t.relatorio, blockFieldPath(t.block, 'config'), blockConfigWithSubBlock(fourPoles, E6, false)),
      // A typed neighbour of a fixed cell: the Medido of "Até carga na Emergência".
      put(t.relatorio, cellPath(t.block, E5, 'ate_carga_na_emergencia', 'medido'), num('8.4', 's')),
    ];
    const result = await pushOk(edits);
    expect(result.rejected).toEqual([]);
    expect(result.applied.map((a) => a.op_id)).toEqual(edits.map((o) => o.op_id));

    const server = (await rowOfEntity('block', t.block)) as BlockRow;
    const pure = replay([...t.log, ...edits].map((o, i) => ({ ...o, seq: i + 1 })));
    expect(canonicalJson(server as never)).toBe(canonicalJson(pure.get(entityKey('block', t.block)) as never));
    expect(canonicalJson((await rowOfEntity('equipment', t.equipment)) as never)).toBe(canonicalJson(pure.get(entityKey('equipment', t.equipment)) as never));

    // The values where the kernel stores them: a number as {raw, unit, state}, a choice as its option key.
    expect(server.sheet.test[E1]!.cells['2']!['1']!.value).toEqual({ raw: '63', unit: 'µΩ', state: 'measured' });
    expect(server.sheet.test[E4]!.cells[String(rowOf(E4, 'falta_de_fase'))]![String(colOf(E4, 'deixado'))]!.value).toEqual({ raw: 'ligado', unit: null, state: 'measured' });
    expect(server.sheet.test[E5]!.values!.metodo!.value).toEqual({ raw: 'falta_real', unit: null, state: 'measured' });
    expect(server.sheet.test[E5]!.values!.carga!.value).toEqual({ raw: 'com_carga', unit: null, state: 'measured' });
    expect(server.sheet.test[E5]!.values!.carga_percentual!.value).toEqual({ raw: '62', unit: '%', state: 'measured' });
    expect(server.sheet.test[E5]!.cells[String(rowOf(E5, 'ate_carga_na_emergencia'))]![String(colOf(E5, 'medido'))]!.value).toEqual({ raw: '8.4', unit: 's', state: 'measured' });
    expect(server.config).toMatchObject({ block_type: CTA, options: { polos: '4' }, sub_blocks: { [E6]: { enabled: false }, [E1]: { enabled: true } } });
    expect(server).toMatchObject({ last_modified_by: company.userId });
    expect(server.first_edited_at).not.toBeNull();

    // The stream carries the create and the new family for every device on contract 19.
    const page = await pullOk(`/api/sync/relatorios/${t.relatorio}?since=0`);
    const paths = (page.ops as Op[]).map((o) => o.path);
    expect(paths).toContain(blockPath(t.block));
    expect(paths).toContain(poloC);
    expect(paths).toContain(metodo);
    expect(paths.filter((path) => path === blockFieldPath(t.block, 'config'))).toHaveLength(2);
  });

  it.each(['v1', 'v4'])('matrix "CTA on an old seed": on a %s relatório the block create is op_invalid, 200, nothing written, and the rest of the push applies', async (seedVersion) => {
    const t = await relatorio(seedVersion);
    // Born on v5, as a contract-19 device would send it; and carrying the relatório's own version.
    const bornOnV5 = ctaCreates(t);
    const onOldSeed = ctaCreates({ ...t, block: newId(), equipment: newId() }, seedVersion);
    const good = newId();
    const batch = [bornOnV5.block, onOldSeed.block, seccionadoraCreate(t.relatorio, good, t.local)];
    const result = await pushOk(batch);
    expect(result.rejected).toEqual([
      { op_id: bornOnV5.block.op_id, code: 'op_invalid' },
      { op_id: onOldSeed.block.op_id, code: 'op_invalid' },
    ]);
    expect(result.applied.map((a) => a.op_id)).toEqual([batch[2]!.op_id]);
    expect(await rowOfEntity('block', bornOnV5.row.id)).toBeUndefined();
    expect(await rowOfEntity('block', onOldSeed.row.id)).toBeUndefined();
    expect(await rowOfEntity('block', good)).toMatchObject({ block_type: 'chave_seccionadora', seed_version: 'v1' });
    expect((await storedIds([bornOnV5.block.op_id, onOldSeed.block.op_id])).size).toBe(0);
    // The stream of the relatório never carries the refused creates.
    const page = await pullOk(`/api/sync/relatorios/${t.relatorio}?since=0`);
    const paths = (page.ops as Op[]).map((o) => o.path);
    expect(paths).toContain(blockPath(good));
    expect(paths).not.toContain(blockPath(bornOnV5.row.id));
    expect(paths).not.toContain(blockPath(onOldSeed.row.id));
  });

  it('matrix "E5 options" and "Fixed cells": an undeclared value key, a fixed cell and an address outside the table are op_invalid, 200, and the sheet is untouched', async () => {
    const t = await relatorio('v5');
    const before = await rowOfEntity('block', t.block);
    const refused = [
      // A value key the test does not declare; a value on a test that declares none.
      put(t.relatorio, sheetTestValuePath(t.block, E5, 'duracao'), choiceValue('falta_real')),
      put(t.relatorio, sheetTestValuePath(t.block, E1, 'metodo'), choiceValue('falta_real')),
      // The fixed cells: E5 "Até carga na Emergência" under Ajuste, E2 Linha-carga under Normal fechada.
      put(t.relatorio, cellPath(t.block, E5, 'ate_carga_na_emergencia', 'ajuste'), num('10', 's')),
      put(t.relatorio, cellPath(t.block, E2, 'linha_carga', 'normal_fechada'), num('12.4', 'GΩ')),
      // Outside the table: E1 has four rows and two columns.
      put(t.relatorio, sheetTestCellPath(t.block, E1, 4, 0), num('38', 'µΩ')),
      put(t.relatorio, sheetTestCellPath(t.block, E1, 0, 2), num('38', 'µΩ')),
      // A test of the seeded grammar is not a test of this type.
      put(t.relatorio, sheetTestCellPath(t.block, 'isolacao', 0, 0), num('3300', 'MΩ')),
    ];
    const good = put(t.relatorio, cellPath(t.block, E2, 'linha_carga', 'aberta'), num('18.6', 'GΩ'));
    const result = await pushOk([...refused, good]);
    expect(result.rejected).toEqual(refused.map((o) => ({ op_id: o.op_id, code: 'op_invalid' })));
    expect(result.applied.map((a) => a.op_id)).toEqual([good.op_id]);
    expect((await storedIds(refused.map((o) => o.op_id))).size).toBe(0);

    const server = (await rowOfEntity('block', t.block)) as BlockRow;
    expect(Object.keys(server.sheet.test)).toEqual([E2]);
    expect(Object.keys(server.sheet.test[E2]!.cells)).toEqual([String(rowOf(E2, 'linha_carga'))]);
    expect(Object.keys(server.sheet.test[E2]!.cells[String(rowOf(E2, 'linha_carga'))]!)).toEqual([String(colOf(E2, 'aberta'))]);
    // But for that one cell, the row is the one the create left.
    const pure = replay([...t.log, good].map((o, i) => ({ ...o, seq: i + 1 })));
    expect(canonicalJson(server as never)).toBe(canonicalJson(pure.get(entityKey('block', t.block)) as never));
    expect((before as BlockRow).sheet.test).toEqual({});
  });
});
