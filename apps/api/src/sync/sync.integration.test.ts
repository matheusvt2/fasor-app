import {
  accountResponseSchema,
  buildSnapshot,
  canonicalJson,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  entityKey,
  errorResponseSchema,
  generateResponseSchema,
  locationChecklistPath,
  locationRemovalPlan,
  locationRestorePlan,
  makeOp,
  MIN_CONTRACT_VERSION,
  photoToken,
  progress,
  replay,
  revisionRowSchema,
  serializeSnapshot,
  SITE_ITEM_KEYS,
  splitEntityKey,
  syncPullResponseSchema,
  syncPushResponseSchema,
  userRowSchema,
  type BlockRow,
  type EntityState,
  type EquipmentRow,
  type LocationRow,
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
import { asCompanyId } from '../db/repositories/company-id.ts';
import { findUserProfile } from '../db/repositories/users.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { entities, ops, syncDevicePush } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { extractStructure } from '../jobs/generate/docx-structure.test-support.ts';
import { toSnapshot } from './snapshot.ts';

/**
 * 1.5-API-001..005 over the compose api with the two seeded users (TC-9). Every id is
 * minted per run; the rows this suite wrote are removed by id afterwards.
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const companyB = TEST_SEED.companies[1];
const DEVICE_A = 'tablet-test-a';
const DEVICE_B = 'phone-test-b';

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

/** Everything this suite writes, removed in afterAll: op ids, entity ids and every device id it pushed with. */
const written = { opIds: new Set<string>(), entityIds: new Set<string>(), devices: new Set<string>() };

type Company = (typeof TEST_SEED.companies)[number];

/** `contractHeader: null` sends no `x-contract-version` at all (the missing-header case). */
function call(path: string, init: RequestInit = {}, contractHeader: string | null = String(CONTRACT_VERSION)): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: apiUrl,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (contractHeader !== null) headers[CONTRACT_VERSION_HEADER] = contractHeader;
  return fetch(`${apiUrl}${path}`, { ...init, redirect: 'manual', headers });
}

async function signIn(email: string): Promise<string> {
  const res = await call('/api/auth/sign-in/email', {
    method: 'POST',
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

/**
 * An authenticated call that signs in again once on a 401: the api suites run in
 * parallel and `auth.integration.test.ts` re-seeds the users, which revokes their
 * sessions (the documented password-reset path).
 */
async function authed(
  company: Company,
  path: string,
  init: RequestInit = {},
  contractHeader: string | null = String(CONTRACT_VERSION),
): Promise<Response> {
  const attempt = async (fresh: boolean) =>
    call(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), cookie: await cookieFor(company, fresh) } }, contractHeader);
  const first = await attempt(false);
  return first.status === 401 ? attempt(true) : first;
}

async function push(company: Company, body: unknown, contractHeader?: string | null): Promise<Response> {
  return authed(company, '/api/sync/ops', { method: 'POST', body: JSON.stringify(body) }, contractHeader);
}

async function pushOk(company: Company, batch: unknown[]): Promise<SyncPushResponse> {
  const res = await push(company, { ops: batch });
  expect(res.status, await res.clone().text()).toBe(200);
  const parsed = syncPushResponseSchema.parse(await res.json());
  for (const raw of batch) {
    const id = (raw as { op_id?: string }).op_id;
    if (id) written.opIds.add(id);
  }
  return parsed;
}

async function pull(company: Company, path: string, contractHeader?: string | null): Promise<Response> {
  return authed(company, path, {}, contractHeader);
}

async function pullOk(company: Company, path: string): Promise<SyncPullResponse> {
  const res = await pull(company, path);
  expect(res.status, await res.clone().text()).toBe(200);
  return syncPullResponseSchema.parse(await res.json());
}

interface Ids {
  company: string;
  actor: string;
  device: string;
}

const idsA: Ids = { company: companyA.companyId, actor: companyA.userId, device: DEVICE_A };
const idsB: Ids = { company: companyB.companyId, actor: companyB.userId, device: DEVICE_B };

function op(ids: Ids, input: Omit<OpInput, 'company_id' | 'actor_id' | 'device_id'> & Partial<OpInput>): Op {
  const built = makeOp(
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
  written.devices.add(built.device_id);
  return built;
}

function clientCreate(ids: Ids, clientId: string): Op {
  written.entityIds.add(clientId);
  return op(ids, {
    kind: 'create',
    scope: 'company',
    path: `registry/client/${clientId}`,
    value: {
      id: clientId,
      kind: 'client',
      name: 'Cliente de Teste',
      cnpj: null,
      contact_name: null,
      contact_phone: null,
      sites: [],
      removed_at: null,
    },
  });
}

/** Story 2.5: a manufacturer row, minimal but schema-valid (`registryRowSchemas.manufacturer`). */
function manufacturerCreate(ids: Ids, manufacturerId: string, name: string): Op {
  written.entityIds.add(manufacturerId);
  return op(ids, {
    kind: 'create',
    scope: 'company',
    path: `registry/manufacturer/${manufacturerId}`,
    value: { id: manufacturerId, kind: 'manufacturer', name, gender: null, number: null, removed_at: null },
  });
}

/** Story 2.5: a voltage_class row, minimal but schema-valid (`registryRowSchemas.voltage_class`). */
function voltageClassCreate(ids: Ids, voltageClassId: string, name: string): Op {
  written.entityIds.add(voltageClassId);
  return op(ids, {
    kind: 'create',
    scope: 'company',
    path: `registry/voltage_class/${voltageClassId}`,
    value: { id: voltageClassId, kind: 'voltage_class', name, gender: null, number: null, removed_at: null },
  });
}

/** Story 2.1: an instrument row, minimal but schema-valid (`registryRowSchemas.instrument`). */
function instrumentCreate(ids: Ids, instrumentId: string): Op {
  written.entityIds.add(instrumentId);
  return op(ids, {
    kind: 'create',
    scope: 'company',
    path: `registry/instrument/${instrumentId}`,
    value: {
      id: instrumentId,
      kind: 'instrument',
      code: 'T-01',
      name: 'Instrumento de Teste',
      manufacturer: null,
      model: null,
      serial: null,
      cert_number: null,
      laboratory: null,
      calibrated_at: null,
      calibration_interval_months: null,
      rbc_accredited: null,
      test_isolacao: null,
      test_resistencia_contato: null,
      test_relacao_transformacao: null,
      certificate_file_id: null,
      removed_at: null,
    },
  });
}

function relatorioCreate(ids: Ids, relatorioId: string, projectId: string): Op {
  written.entityIds.add(relatorioId);
  return op(ids, {
    kind: 'create',
    scope: 'relatorio',
    relatorio_id: relatorioId,
    path: `relatorio/${relatorioId}`,
    value: {
      id: relatorioId,
      project_id: projectId,
      template_id: null,
      template_version: null,
      seed_version: 'v1',
      status: 'rascunho',
      setup: {
        service_start: null,
        service_end: null,
        atividade: null,
        local: null,
        responsible_user_id: null,
        cover_photo_file_id: null,
      },
      export: { scheme: 'por_local_e_tipo' },
      preview_file_id: null,
      removed_at: null,
    },
  });
}

function projectCreate(ids: Ids, projectId: string): Op {
  written.entityIds.add(projectId);
  return op(ids, {
    kind: 'create',
    scope: 'company',
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra de Teste', site: null, removed_at: null },
  });
}

function equipmentCreate(ids: Ids, equipmentId: string, projectId: string): Op {
  written.entityIds.add(equipmentId);
  return op(ids, {
    kind: 'create',
    scope: 'project',
    project_id: projectId,
    path: `equipment/${equipmentId}`,
    value: { id: equipmentId, project_id: projectId, tag: 'TR-01', type: 'transformador_forca', last_nameplate: null, removed_at: null },
  });
}

/** A relatório block row of `blockType` at seed v1 (a section type has no equipment definition). */
function blockCreate(ids: Ids, relatorioId: string, blockId: string, blockType: string): Op {
  written.entityIds.add(blockId);
  return op(ids, {
    kind: 'create',
    scope: 'relatorio',
    relatorio_id: relatorioId,
    path: `block/${blockId}`,
    value: {
      id: blockId,
      relatorio_id: relatorioId,
      location_id: null,
      equipment_id: null,
      block_type: blockType,
      config: {},
      seed_version: 'v1',
      order_key: 'a0',
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

function sheetPut(ids: Ids, relatorioId: string, path: string, value: unknown): Op {
  return op(ids, { kind: 'put', scope: 'relatorio', relatorio_id: relatorioId, path, value: value as Op['value'] });
}

function setupPut(ids: Ids, relatorioId: string, field: string, value: unknown, extra: Partial<OpInput> = {}): Op {
  return op(ids, {
    kind: 'put',
    scope: 'relatorio',
    relatorio_id: relatorioId,
    path: `relatorio/setup/${field}`,
    value: value as Op['value'],
    ...extra,
  });
}

beforeAll(async () => {
  await seedTestCompanies(db, auth);
}, 60_000);

afterAll(async () => {
  const opIds = [...written.opIds];
  const entityIds = [...written.entityIds];
  if (opIds.length > 0) await db.delete(ops).where(inArray(ops.op_id, opIds));
  if (entityIds.length > 0) await db.delete(entities).where(inArray(entities.id, entityIds));
  const devices = [...written.devices];
  if (devices.length > 0) await db.delete(syncDevicePush).where(inArray(syncDevicePush.device_id, devices));
  await sql.end();
});

async function pushRowsOf(userId: string, deviceId: string) {
  return db
    .select({ last_push_at: syncDevicePush.last_push_at })
    .from(syncDevicePush)
    .where(and(eq(syncDevicePush.user_id, userId), eq(syncDevicePush.device_id, deviceId)));
}

async function storedIds(candidates: string[]): Promise<Set<string>> {
  const rows = await db.select({ op_id: ops.op_id }).from(ops).where(inArray(ops.op_id, candidates));
  return new Set(rows.map((r) => r.op_id));
}

describe('1.5-API-001 push semantics', () => {
  it('applies a valid batch in array order with increasing seq and the contract shape', async () => {
    const relatorioId = newId();
    const batch = [
      clientCreate(idsA, newId()),
      relatorioCreate(idsA, relatorioId, newId()),
      setupPut(idsA, relatorioId, 'service_start', '2026-09-22'),
    ];
    const result = await pushOk(companyA, batch);
    expect(Object.keys(result).sort()).toEqual(['applied', 'rejected', 'superseded']);
    expect(result.applied.map((a) => a.op_id)).toEqual(batch.map((o) => o.op_id));
    const seqs = result.applied.map((a) => a.seq);
    expect(seqs[0]).toBeLessThan(seqs[1]!);
    expect(seqs[1]).toBeLessThan(seqs[2]!);
    expect(result.rejected).toEqual([]);
    expect(result.superseded).toEqual([]);
    const [row] = await db
      .select({ row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'relatorio'), eq(entities.id, relatorioId)));
    expect((row?.row as { setup: { service_start: string } }).setup.service_start).toBe('2026-09-22');
  });

  it('is atomic per op: a bad value and an unknown path are rejected, the rest applies', async () => {
    const relatorioId = newId();
    const create = relatorioCreate(idsA, relatorioId, newId());
    const badValue = setupPut(idsA, relatorioId, 'service_start', 42);
    const good = setupPut(idsA, relatorioId, 'local', 'Galpao 3');
    const unknownPath = { ...setupPut(idsA, relatorioId, 'local', 'x'), path: 'relatorio/setup/colour' };
    const result = await pushOk(companyA, [create, badValue, good, unknownPath]);
    expect(result.applied.map((a) => a.op_id)).toEqual([create.op_id, good.op_id]);
    expect(result.rejected).toEqual([
      { op_id: badValue.op_id, code: 'op_invalid' },
      { op_id: unknownPath.op_id, code: 'op_path_unknown' },
    ]);
    const stored = await storedIds([badValue.op_id, unknownPath.op_id, good.op_id]);
    expect(stored.has(badValue.op_id)).toBe(false);
    expect(stored.has(unknownPath.op_id)).toBe(false);
    expect(stored.has(good.op_id)).toBe(true);
  });

  it('E5-Q1 answers 200 with a seed-path refusal as op_invalid, never 500, and applies the rest', async () => {
    const relatorioId = newId();
    const equipment = newId();
    const section = newId();
    const setup = [
      relatorioCreate(idsA, relatorioId, newId()),
      blockCreate(idsA, relatorioId, equipment, 'disjuntor_mt'),
      blockCreate(idsA, relatorioId, section, 'section_1'),
    ];
    expect((await pushOk(companyA, setup)).rejected).toEqual([]);
    const instrument = { instrument_id: newId() };
    const reading = { raw: '3300', unit: 'MΩ', state: 'measured' };
    // disjuntor_mt isolação: six rows (0-5), one VALORES column; TP ratio col 2 is VAL CALCULADO (derived).
    const unknownTest = sheetPut(idsA, relatorioId, `sheet/${equipment}/test/nao_existe/instrument`, instrument);
    const onSection = sheetPut(idsA, relatorioId, `sheet/${section}/test/isolacao/instrument`, instrument);
    const rowOutside = sheetPut(idsA, relatorioId, `sheet/${equipment}/test/isolacao/cell/6/0`, reading);
    const colOutside = sheetPut(idsA, relatorioId, `sheet/${equipment}/test/isolacao/cell/0/1`, reading);
    const good = sheetPut(idsA, relatorioId, `sheet/${equipment}/test/isolacao/cell/0/0`, reading);
    const result = await pushOk(companyA, [unknownTest, onSection, rowOutside, colOutside, good]);
    expect(result.rejected).toEqual([
      { op_id: unknownTest.op_id, code: 'op_invalid' },
      { op_id: onSection.op_id, code: 'op_invalid' },
      { op_id: rowOutside.op_id, code: 'op_invalid' },
      { op_id: colOutside.op_id, code: 'op_invalid' },
    ]);
    expect(result.applied.map((a) => a.op_id)).toEqual([good.op_id]);
    const [row] = await db
      .select({ row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'block'), eq(entities.id, equipment)));
    const sheet = (row?.row as { sheet: { test: Record<string, { cells: Record<string, Record<string, unknown>> }> } }).sheet;
    expect(sheet.test.isolacao?.cells['0']?.['0']).toBeDefined();
    expect(sheet.test.nao_existe).toBeUndefined();
    expect((await storedIds([unknownTest.op_id, onSection.op_id, rowOutside.op_id, colOutside.op_id])).size).toBe(0);
  });

  it('rejects a server-only family and the two origin spoofs as op_server_only, a foreign actor as op_invalid', async () => {
    const relatorioId = newId();
    const fileId = newId();
    const create = relatorioCreate(idsA, relatorioId, newId());
    const serverOnly = op(idsA, {
      kind: 'put',
      scope: 'relatorio',
      relatorio_id: relatorioId,
      path: `file/${fileId}/uploaded_at`,
      value: '2026-09-22T10:00:00.000Z',
    });
    const deviceSpoof = setupPut(idsA, relatorioId, 'local', 'a', { device_id: 'server' });
    const actorSpoof = setupPut(idsA, relatorioId, 'local', 'b', { actor_id: 'system:files' });
    const foreignActor = setupPut(idsA, relatorioId, 'local', 'c', { actor_id: companyB.userId });
    const fine = setupPut(idsA, relatorioId, 'local', 'd');
    const result = await pushOk(companyA, [create, serverOnly, deviceSpoof, actorSpoof, foreignActor, fine]);
    expect(result.rejected).toEqual([
      { op_id: serverOnly.op_id, code: 'op_server_only' },
      { op_id: deviceSpoof.op_id, code: 'op_server_only' },
      { op_id: actorSpoof.op_id, code: 'op_server_only' },
      { op_id: foreignActor.op_id, code: 'op_invalid' },
    ]);
    expect(result.applied.map((a) => a.op_id)).toEqual([create.op_id, fine.op_id]);
  });

  it('rejects an op of another company as op_tenant_mismatch and stores nothing of it', async () => {
    const foreign = clientCreate(idsB, newId());
    const result = await pushOk(companyA, [foreign]);
    expect(result.rejected).toEqual([{ op_id: foreign.op_id, code: 'op_tenant_mismatch' }]);
    expect(result.applied).toEqual([]);
    expect((await storedIds([foreign.op_id])).size).toBe(0);
  });

  it('answers 400 sync_batch_invalid on a bad envelope or over 500 ops, and 401 without a session', async () => {
    const notArray = await push(companyA, { ops: clientCreate(idsA, newId()) });
    expect(notArray.status).toBe(400);
    expect(errorResponseSchema.parse(await notArray.json()).code).toBe('sync_batch_invalid');

    const tooMany = await push(companyA, { ops: new Array(501).fill(null).map(() => clientCreate(idsA, newId())) });
    expect(tooMany.status).toBe(400);
    expect(errorResponseSchema.parse(await tooMany.json()).code).toBe('sync_batch_invalid');

    const anonymous = await call('/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: [] }) });
    expect(anonymous.status).toBe(401);
    expect(errorResponseSchema.parse(await anonymous.json()).code).toBe('unauthenticated');
  });
});

describe('1.5-API-002 idempotency and monotonic seq', () => {
  it('re-pushing the same batch returns the same seqs and leaves one row per op', async () => {
    const relatorioId = newId();
    const batch = [relatorioCreate(idsA, relatorioId, newId()), setupPut(idsA, relatorioId, 'atividade', 'Manutencao')];
    const first = await pushOk(companyA, batch);
    const second = await pushOk(companyA, batch);
    expect(second.applied).toEqual(first.applied);
    expect(second.rejected).toEqual([]);
    expect(second.superseded).toEqual([]);
    const rows = await db.select({ op_id: ops.op_id }).from(ops).where(inArray(ops.op_id, batch.map((o) => o.op_id)));
    expect(rows).toHaveLength(2);
    const [row] = await db
      .select({ updated_seq: entities.updated_seq })
      .from(entities)
      .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'relatorio'), eq(entities.id, relatorioId)));
    expect(row?.updated_seq).toBe(first.applied[1]!.seq);
  });

  it('rejects an op_id already applied for another company instead of answering that seq', async () => {
    const clientId = newId();
    const original = clientCreate(idsA, clientId);
    const applied = await pushOk(companyA, [original]);
    expect(applied.applied).toHaveLength(1);

    // Company B reuses A's op_id on a well-formed op of its own: the global unique on op_id means
    // the insert can never succeed, so the answer is a rejection, never A's seq (which the device
    // would have marked acked and lost).
    const reused = { ...clientCreate(idsB, newId()), op_id: original.op_id };
    const result = await pushOk(companyB, [reused]);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toEqual([{ op_id: original.op_id, code: 'op_invalid' }]);

    const rows = await db.select({ company_id: ops.company_id }).from(ops).where(eq(ops.op_id, original.op_id));
    expect(rows).toEqual([{ company_id: companyA.companyId }]);
    const bEntities = await db
      .select({ id: entities.id })
      .from(entities)
      .where(and(eq(entities.company_id, companyB.companyId), eq(entities.id, (reused.value as { id: string }).id)));
    expect(bEntities).toEqual([]);
  });

  it('keeps seq monotonic per company while the two companies push interleaved', async () => {
    const a1 = await pushOk(companyA, [clientCreate(idsA, newId())]);
    const b1 = await pushOk(companyB, [clientCreate(idsB, newId())]);
    const a2 = await pushOk(companyA, [clientCreate(idsA, newId())]);
    const b2 = await pushOk(companyB, [clientCreate(idsB, newId())]);
    expect(a1.applied[0]!.seq).toBeLessThan(a2.applied[0]!.seq);
    expect(b1.applied[0]!.seq).toBeLessThan(b2.applied[0]!.seq);
    const [rowA] = await db.select({ company_id: ops.company_id }).from(ops).where(eq(ops.op_id, a2.applied[0]!.op_id));
    const [rowB] = await db.select({ company_id: ops.company_id }).from(ops).where(eq(ops.op_id, b2.applied[0]!.op_id));
    expect(rowA?.company_id).toBe(companyA.companyId);
    expect(rowB?.company_id).toBe(companyB.companyId);
  });
});

describe('E6-A1 a push is one transaction under one company lock; a refused op leaves nothing behind', () => {
  it('a row-schema refusal in the middle removes only that op: the ops before and after it land with ascending seqs', async () => {
    const relatorioId = newId();
    const create = relatorioCreate(idsA, relatorioId, newId());
    const before = setupPut(idsA, relatorioId, 'local', 'Galpao 7');
    // `service_start` must be a date string: `applyOp`'s row schema refuses 42 (a ZodError).
    const refused = setupPut(idsA, relatorioId, 'service_start', 42);
    const after = setupPut(idsA, relatorioId, 'atividade', 'Manutencao preventiva');
    const batch = [create, before, refused, after];

    const result = await pushOk(companyA, batch);
    expect(result.applied.map((a) => a.op_id)).toEqual([create.op_id, before.op_id, after.op_id]);
    const seqs = result.applied.map((a) => a.seq);
    expect([...seqs].sort((x, y) => x - y)).toEqual(seqs);
    expect(new Set(seqs).size).toBe(3);
    expect(result.rejected).toEqual([{ op_id: refused.op_id, code: 'op_invalid' }]);
    const stored = await storedIds(batch.map((o) => o.op_id));
    expect(stored).toEqual(new Set([create.op_id, before.op_id, after.op_id]));
    const [row] = await db
      .select({ row: entities.row, updated_seq: entities.updated_seq })
      .from(entities)
      .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'relatorio'), eq(entities.id, relatorioId)));
    const setup = (row?.row as { setup: { local: string; atividade: string; service_start: unknown } }).setup;
    expect(setup.local).toBe('Galpao 7');
    expect(setup.atividade).toBe('Manutencao preventiva');
    expect(setup.service_start).toBeNull();
    expect(row?.updated_seq).toBe(seqs[2]);

    // Re-sent whole (the device never saw the answer): the same seqs, nothing new, and the
    // refused op refused again.
    const again = await pushOk(companyA, batch);
    expect(again.applied).toEqual(result.applied);
    expect(again.rejected).toEqual(result.rejected);
    expect(again.superseded).toEqual([]);
    const rows = await db.select({ op_id: ops.op_id }).from(ops).where(inArray(ops.op_id, batch.map((o) => o.op_id)));
    expect(rows).toHaveLength(3);
  });
});

describe('1.5-API-003 superseded', () => {
  it('applies and reports an op whose prev_op_id is not the latest on its path', async () => {
    const relatorioId = newId();
    const create = relatorioCreate(idsA, relatorioId, newId());
    const p1 = setupPut(idsA, relatorioId, 'local', 'v1');
    const p2 = setupPut(idsA, relatorioId, 'local', 'v2', { prev_op_id: p1.op_id });
    const first = await pushOk(companyA, [create, p1, p2]);
    expect(first.superseded).toEqual([]);

    // Stale pointer (another device still pointing at p1) and a null pointer while the server has one.
    const stale = setupPut(idsA, relatorioId, 'local', 'v3', { prev_op_id: p1.op_id, device_id: 'tablet-test-a2' });
    const blind = setupPut(idsA, relatorioId, 'local', 'v4', { prev_op_id: null });
    const second = await pushOk(companyA, [stale, blind]);
    expect(second.applied.map((a) => a.op_id)).toEqual([stale.op_id, blind.op_id]);
    expect(second.superseded).toEqual([
      { op_id: stale.op_id, over_op_id: p2.op_id },
      { op_id: blind.op_id, over_op_id: stale.op_id },
    ]);

    // A dedupe hit is never superseded again.
    const again = await pushOk(companyA, [stale]);
    expect(again.applied[0]!.seq).toBe(second.applied[0]!.seq);
    expect(again.superseded).toEqual([]);

    // The implicit-relatorio path is scoped by relatorio: the same path on another relatorio is not superseded.
    const otherRelatorio = newId();
    const third = await pushOk(companyA, [relatorioCreate(idsA, otherRelatorio, newId()), setupPut(idsA, otherRelatorio, 'local', 'x')]);
    expect(third.superseded).toEqual([]);
  });
});

describe('1.5-API-004 pulls', () => {
  it('the company stream holds company-scope ops only and carries the summary', async () => {
    const clientId = newId();
    const relatorioId = newId();
    const projectId = newId();
    const pushed = await pushOk(companyA, [
      clientCreate(idsA, clientId),
      relatorioCreate(idsA, relatorioId, projectId),
      setupPut(idsA, relatorioId, 'local', 'Galpao'),
    ]);
    const clientSeq = pushed.applied[0]!.seq;
    const relatorioSeq = pushed.applied[2]!.seq;

    const page = await pullOk(companyA, `/api/sync/company?since=${clientSeq - 1}`);
    expect(Object.keys(page).sort()).toEqual(['ops', 'seq', 'summary']);
    const pulled = page.ops as Op[];
    expect(pulled[0]?.op_id).toBe(pushed.applied[0]!.op_id);
    expect(pulled.every((o) => o.scope === 'company' && o.relatorio_id === null)).toBe(true);
    expect(pulled.some((o) => o.relatorio_id === relatorioId)).toBe(false);
    const seqs = pulled.map((o) => o.seq!);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    expect(page.seq).toBeGreaterThanOrEqual(clientSeq);
    expect(page.seq).toBeLessThan(relatorioSeq);

    const summary = page.summary!;
    expect(summary.last_push_at).toContainEqual(
      expect.objectContaining({ user_id: companyA.userId, device_id: DEVICE_A }),
    );
    expect(summary.last_push_at.every((p) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p.at))).toBe(true);
    // Most recent push first: the device just pushed, so it leads, and the list is sorted.
    expect(summary.last_push_at[0]).toMatchObject({ user_id: companyA.userId, device_id: DEVICE_A });
    const ats = summary.last_push_at.map((p) => p.at);
    expect(ats).toEqual([...ats].sort().reverse());
    expect(summary.relatorios).toContainEqual({
      id: relatorioId,
      project_id: projectId,
      status: 'rascunho',
      template_id: null,
      seed_version: 'v1',
      updated_seq: relatorioSeq,
      progress: { sheets: 0, photos: 0 },
    });
    // No row of company B.
    expect(summary.last_push_at.some((p) => p.user_id === companyB.userId)).toBe(false);

    // Each company's stream carries its own `user/{id}` create and never the other's.
    const whole = async (company: Company) => {
      const all: { path: string; company_id: string }[] = [];
      for (let since = 0; ; ) {
        const next = await pullOk(company, `/api/sync/company?since=${since}`);
        all.push(...(next.ops as { path: string; company_id: string; seq: number }[]));
        const last = (next.ops.at(-1) as { seq?: number } | undefined)?.seq;
        if (last === undefined || last >= next.seq) break;
        since = last;
      }
      return all;
    };
    const streamB = await whole(companyB);
    expect(streamB.some((o) => o.path === `user/${companyB.userId}`)).toBe(true);
    expect(streamB.some((o) => o.path.startsWith(`user/${companyA.userId}`))).toBe(false);
    expect(streamB.every((o) => o.company_id === companyB.companyId)).toBe(true);
  });

  it('a registry/instrument create is tenant-scoped like any other company-scope op', async () => {
    const instrumentId = newId();
    const pushed = await pushOk(companyA, [instrumentCreate(idsA, instrumentId)]);
    const seq = pushed.applied[0]!.seq;

    const pageA = await pullOk(companyA, `/api/sync/company?since=${seq - 1}`);
    expect((pageA.ops as Op[]).some((o) => o.path === `registry/instrument/${instrumentId}`)).toBe(true);

    const streamB = await pullOk(companyB, '/api/sync/company?since=0');
    expect((streamB.ops as Op[]).some((o) => o.path === `registry/instrument/${instrumentId}`)).toBe(false);
  });

  it('the relatorio stream unites its ops with older project-scope ops, in seq order, with the head', async () => {
    const projectId = newId();
    const equipmentId = newId();
    const relatorioId = newId();
    const equipment = equipmentCreate(idsA, equipmentId, projectId);
    const before = await pushOk(companyA, [equipment]);
    const create = relatorioCreate(idsA, relatorioId, projectId);
    const put = setupPut(idsA, relatorioId, 'local', 'Torre A');
    const after = await pushOk(companyA, [create, put]);

    const page = await pullOk(companyA, `/api/sync/relatorios/${relatorioId}?since=0`);
    expect(Object.keys(page).sort()).toEqual(['ops', 'seq']);
    const pulled = page.ops as Op[];
    expect(pulled.map((o) => o.op_id)).toEqual([equipment.op_id, create.op_id, put.op_id]);
    expect(pulled.map((o) => o.seq)).toEqual([before.applied[0]!.seq, after.applied[0]!.seq, after.applied[1]!.seq]);
    expect(page.seq).toBe(after.applied[1]!.seq);

    const tail = await pullOk(companyA, `/api/sync/relatorios/${relatorioId}?since=${after.applied[0]!.seq}`);
    expect((tail.ops as Op[]).map((o) => o.op_id)).toEqual([put.op_id]);
    expect(tail.seq).toBe(page.seq);
  });

  it('E4 retro item 17: the project stream holds its own project-scope ops only, in seq order, with the head', async () => {
    const projectId = newId();
    const otherProjectId = newId();
    const relatorioId = newId();
    const equipmentId = newId();
    const created = await pushOk(companyA, [projectCreate(idsA, projectId), projectCreate(idsA, otherProjectId)]);
    expect(created.rejected).toEqual([]);
    const equipment = equipmentCreate(idsA, equipmentId, projectId);
    const rename = op(idsA, { kind: 'put', scope: 'project', project_id: projectId, path: `equipment/${equipmentId}/tag`, value: 'TR-01A' });
    const elsewhere = equipmentCreate(idsA, newId(), otherProjectId);
    const own = await pushOk(companyA, [equipment, relatorioCreate(idsA, relatorioId, projectId), setupPut(idsA, relatorioId, 'local', 'Torre A'), elsewhere, rename]);
    expect(own.rejected).toEqual([]);

    const page = await pullOk(companyA, `/api/sync/projects/${projectId}?since=0`);
    expect(Object.keys(page).sort()).toEqual(['ops', 'seq']);
    const pulled = page.ops as Op[];
    expect(pulled.map((o) => o.op_id)).toEqual([equipment.op_id, rename.op_id]);
    expect(page.seq).toBe(pulled.at(-1)!.seq);

    const tail = await pullOk(companyA, `/api/sync/projects/${projectId}?since=${pulled[0]!.seq}`);
    expect((tail.ops as Op[]).map((o) => o.op_id)).toEqual([rename.op_id]);
  });

  it('E4 retro item 17: answers 404 for an unknown, foreign or malformed project id', async () => {
    const foreignProject = newId();
    await pushOk(companyB, [projectCreate(idsB, foreignProject)]);
    for (const id of [foreignProject, newId(), 'abc']) {
      const res = await pull(companyA, `/api/sync/projects/${id}?since=0`);
      expect(res.status).toBe(404);
      expect(errorResponseSchema.parse(await res.json()).code).toBe('not_found');
    }
    expect((await pull(companyB, `/api/sync/projects/${foreignProject}?since=0`)).status).toBe(200);
  });

  it('records one last_push_at row per (user, device) and moves it forward on every push', async () => {
    await pushOk(companyA, [clientCreate(idsA, newId())]);
    const [first] = await pushRowsOf(companyA.userId, DEVICE_A);
    expect(first).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await pushOk(companyA, [clientCreate(idsA, newId())]);
    const rows = await pushRowsOf(companyA.userId, DEVICE_A);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.last_push_at > first!.last_push_at).toBe(true);
    // A rejected-only batch does not count as a push.
    await pushOk(companyA, [clientCreate(idsB, newId())]);
    expect((await pushRowsOf(companyA.userId, DEVICE_A))[0]!.last_push_at).toBe(rows[0]!.last_push_at);
  });

  it('answers 404 relatorio_not_found for an unknown, foreign or malformed relatorio id', async () => {
    const foreignRelatorio = newId();
    await pushOk(companyB, [relatorioCreate(idsB, foreignRelatorio, newId())]);
    for (const id of [foreignRelatorio, newId(), 'abc']) {
      const res = await pull(companyA, `/api/sync/relatorios/${id}?since=0`);
      expect(res.status).toBe(404);
      expect(errorResponseSchema.parse(await res.json()).code).toBe('relatorio_not_found');
    }
    expect((await pull(companyB, `/api/sync/relatorios/${foreignRelatorio}?since=0`)).status).toBe(200);
  });

  it('refuses a malformed since', async () => {
    const res = await pull(companyA, '/api/sync/company?since=-3');
    expect(res.status).toBe(400);
    expect(errorResponseSchema.parse(await res.json()).code).toBe('sync_batch_invalid');
  });
});

describe('2.5-API-004 manufacturer/voltage_class normalized-name merge', () => {
  it('materializes exactly one live manufacturer when two devices create near-duplicate names offline', async () => {
    const id1 = newId();
    const id2 = newId();
    const first = await pushOk(companyA, [manufacturerCreate(idsA, id1, 'Schneider')]);
    expect(first.rejected).toEqual([]);
    const idsA2: Ids = { company: companyA.companyId, actor: companyA.userId, device: 'tablet-test-a2' };
    const second = await pushOk(companyA, [manufacturerCreate(idsA2, id2, 'SCHNEIDER')]);
    // Neither op is rejected: the second op is applied, merged onto the first's row (AC4).
    expect(second.rejected).toEqual([]);

    const rows = await db
      .select({ id: entities.id, removed_at: entities.removed_at, row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'registry'), inArray(entities.id, [id1, id2])));
    const live = rows.filter((r) => r.removed_at === null && (r.row as { kind: string }).kind === 'manufacturer');
    expect(live).toHaveLength(1);
  });

  it('materializes exactly one live voltage_class the same way', async () => {
    const id1 = newId();
    const id2 = newId();
    await pushOk(companyA, [voltageClassCreate(idsA, id1, '13.8 kV')]);
    await pushOk(companyA, [voltageClassCreate(idsA, id2, '13.8 KV')]);

    const rows = await db
      .select({ id: entities.id, removed_at: entities.removed_at, row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'registry'), inArray(entities.id, [id1, id2])));
    const live = rows.filter((r) => r.removed_at === null && (r.row as { kind: string }).kind === 'voltage_class');
    expect(live).toHaveLength(1);
  });

  it('redirects a put on the same locally-minted id when it merges earlier in the same request', async () => {
    // The normal flow: name commits as create, gender/number as separate puts in the same
    // batch, right after. If the create's redirect onto another device's existing row isn't
    // carried to the later put in this request, the put resolves against the now-missing
    // local id and `applyOp` silently no-ops it (AD-3) instead of landing on the merged row.
    const existingId = newId();
    await pushOk(companyA, [manufacturerCreate(idsA, existingId, 'Siemens')]);

    const localId = newId();
    written.entityIds.add(localId);
    const create = manufacturerCreate(idsA, localId, 'SIEMENS');
    const put = op(idsA, { kind: 'put', scope: 'company', path: `registry/manufacturer/${localId}/gender`, value: 'm' });
    const result = await pushOk(companyA, [create, put]);
    expect(result.rejected).toEqual([]);

    const rows = await db
      .select({ id: entities.id, removed_at: entities.removed_at, row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'registry'), inArray(entities.id, [existingId, localId])));
    const live = rows.filter((r) => r.removed_at === null && (r.row as { kind: string }).kind === 'manufacturer');
    expect(live).toHaveLength(1);
    expect(live[0]?.id).toBe(existingId);
    expect((live[0]?.row as { gender: string | null }).gender).toBe('m');
  });

  it('converges on the originating device over two cycles: the merged-away id is retired and a later put on it lands on the survivor (Epic 2 retro D-1)', async () => {
    const survivorId = newId();
    const ghostId = newId();
    written.entityIds.add(ghostId);
    await pushOk(companyA, [manufacturerCreate(idsA, survivorId, 'Legrand')]);
    const { seq: cursor } = await pullOk(companyA, '/api/sync/company?since=0');

    // Cycle 1: the device pushes its own near-duplicate and a field on it, then pulls.
    const ghostCreate = manufacturerCreate(idsA, ghostId, 'LEGRAND ');
    const ghostGender = op(idsA, { kind: 'put', scope: 'company', path: `registry/manufacturer/${ghostId}/gender`, value: 'f' });
    const first = await pushOk(companyA, [ghostCreate, ghostGender]);
    expect(first.rejected).toEqual([]);
    const page1 = await pullOk(companyA, `/api/sync/company?since=${cursor}`);
    const cycle1 = page1.ops as Op[];
    // The log holds what was applied: both ops on the survivor, under the device's own op ids.
    expect(cycle1.find((o) => o.op_id === ghostCreate.op_id)?.path).toBe(`registry/manufacturer/${survivorId}`);
    expect(cycle1.find((o) => o.op_id === ghostGender.op_id)?.path).toBe(`registry/manufacturer/${survivorId}/gender`);
    // And one system op retires the merged-away id on every device, naming the survivor.
    const retire = cycle1.filter((o) => o.path === `registry/manufacturer/${ghostId}/removed_at`);
    expect(retire).toHaveLength(1);
    expect(retire[0]).toMatchObject({ kind: 'remove', actor_id: 'system:registry', device_id: 'server', meta: { merged_into: survivorId } });
    written.opIds.add(retire[0]!.op_id);

    // Cycle 2: an edit made on the ghost before the pull reached the device arrives in a later request.
    const ghostNumber = op(idsA, { kind: 'put', scope: 'company', path: `registry/manufacturer/${ghostId}/number`, value: 'singular' });
    const second = await pushOk(companyA, [ghostNumber]);
    expect(second.rejected).toEqual([]);
    // Other suites write to the same company stream in parallel, so only this op is looked at.
    const cycle2 = (await pullOk(companyA, `/api/sync/company?since=${page1.seq}`)).ops as Op[];
    expect(cycle2.find((o) => o.op_id === ghostNumber.op_id)?.path).toBe(`registry/manufacturer/${survivorId}/number`);
    expect(cycle2.filter((o) => o.path.startsWith(`registry/manufacturer/${ghostId}`))).toEqual([]);

    const rows = await db
      .select({ id: entities.id, removed_at: entities.removed_at, row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'registry'), inArray(entities.id, [survivorId, ghostId])));
    expect(rows.map((r) => r.id)).toEqual([survivorId]);
    expect(rows[0]!.row).toMatchObject({ name: 'Legrand', gender: 'f', number: 'singular' });

    // A resend of the merged create is a dedupe hit: no second system op.
    await pushOk(companyA, [ghostCreate]);
    const again = (await pullOk(companyA, `/api/sync/company?since=${cursor}`)).ops as Op[];
    expect(again.filter((o) => o.path === `registry/manufacturer/${ghostId}/removed_at`)).toHaveLength(1);
  });

  it('never merges across kinds: a manufacturer and a voltage_class of the same normalized name both stay live', async () => {
    const manufacturerId = newId();
    const voltageClassId = newId();
    const name = `KindProbe ${newId().slice(-6)}`;
    await pushOk(companyA, [manufacturerCreate(idsA, manufacturerId, name)]);
    const second = await pushOk(companyA, [voltageClassCreate(idsA, voltageClassId, name.toUpperCase())]);
    expect(second.rejected).toEqual([]);

    const rows = await db
      .select({ id: entities.id, removed_at: entities.removed_at })
      .from(entities)
      .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'registry'), inArray(entities.id, [manufacturerId, voltageClassId])));
    expect(rows.filter((r) => r.removed_at === null).map((r) => r.id).sort()).toEqual([manufacturerId, voltageClassId].sort());
  });

  it('never merges across companies: two companies with the same normalized name each keep their own row (AD-10)', async () => {
    const idA = newId();
    const idB = newId();
    await pushOk(companyA, [manufacturerCreate(idsA, idA, 'CrossTenantProbe')]);
    await pushOk(companyB, [manufacturerCreate(idsB, idB, 'CROSSTENANTPROBE')]);

    const rows = await db
      .select({ id: entities.id, company_id: entities.company_id, removed_at: entities.removed_at, row: entities.row })
      .from(entities)
      .where(and(eq(entities.entity, 'registry'), inArray(entities.id, [idA, idB])));
    const live = rows.filter((r) => r.removed_at === null && (r.row as { kind: string }).kind === 'manufacturer');
    expect(live).toHaveLength(2);
    expect(live.find((r) => r.id === idA)?.company_id).toBe(companyA.companyId);
    expect(live.find((r) => r.id === idB)?.company_id).toBe(companyB.companyId);
  });

  it('never merges two blank-name creates: an empty/unset name is never treated as a duplicate (independent review, PR #14 finding 1)', async () => {
    const id1 = newId();
    const id2 = newId();
    written.entityIds.add(id1);
    written.entityIds.add(id2);
    const create1 = manufacturerCreate(idsA, id1, '');
    const create2 = manufacturerCreate(idsA, id2, '');
    const put2 = op(idsA, { kind: 'put', scope: 'company', path: `registry/manufacturer/${id2}/gender`, value: 'f' });
    const result = await pushOk(companyA, [create1, create2, put2]);
    expect(result.rejected).toEqual([]);

    const rows = await db
      .select({ id: entities.id, removed_at: entities.removed_at, row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'registry'), inArray(entities.id, [id1, id2])));
    const live = rows.filter((r) => r.removed_at === null && (r.row as { kind: string }).kind === 'manufacturer');
    expect(live).toHaveLength(2);
    expect((live.find((r) => r.id === id2)?.row as { gender: string | null } | undefined)?.gender).toBe('f');
  });
});

describe('the registration as user ops (retro A2)', () => {
  function userPut(ids: Ids, userId: string, field: string, value: string, extra: Partial<OpInput> = {}): Op {
    return op(ids, { kind: 'put', scope: 'company', path: `user/${userId}/${field}`, value, ...extra });
  }

  async function account(company: Company) {
    const res = await authed(company, '/api/account');
    expect(res.status).toBe(200);
    return accountResponseSchema.parse(await res.json()).user;
  }

  async function userEntity(company: Company) {
    const [row] = await db
      .select({ row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, 'user'), eq(entities.id, company.userId)));
    return row?.row as { council: string | null; registration_number: string | null; title: string | null } | undefined;
  }

  // These ops stay in the log (they are not added to `written`): the entity they leave
  // behind is the seeded registration again, and the log must keep explaining it.
  async function pushKept(company: Company, batch: Op[]): Promise<SyncPushResponse> {
    const res = await push(company, { ops: batch });
    expect(res.status, await res.clone().text()).toBe(200);
    return syncPushResponseSchema.parse(await res.json());
  }

  // Company B's user, so the title this test moves for a moment is never the one
  // `auth.integration.test.ts` compares across a re-seed of company A, in parallel.
  it('an own-user put reaches the entity, and GET /api/account composes it', async () => {
    const before = await account(companyB);
    expect(before.id).toBe(companyB.userId);
    const title = `Técnico ${newId().slice(-4)}`;
    const result = await pushKept(companyB, [userPut(idsB, companyB.userId, 'title', title)]);
    expect(result.rejected).toEqual([]);
    expect((await userEntity(companyB))?.title).toBe(title);
    expect((await account(companyB)).title).toBe(title);

    // Back to the seeded title, through the same path.
    const seeded = before.title ?? 'Técnico(a) em Eletrotécnica';
    await pushKept(companyB, [userPut(idsB, companyB.userId, 'title', seeded)]);
    expect((await account(companyB)).title).toBe(seeded);
  });

  it("refuses a write to anyone else's user row per op, in this company or another, and never a create", async () => {
    const bBefore = await userEntity(companyB);
    expect(bBefore).toBeDefined();
    const colleague = userPut(idsA, newId(), 'title', 'Colega');
    const ownName = userPut(idsA, companyA.userId, 'name', 'Outro Nome');
    const otherCompanysUser = userPut(idsA, companyB.userId, 'title', 'Intruso');
    const otherTenant = userPut(idsA, companyB.userId, 'title', 'Intruso', { company_id: companyB.companyId });
    const create = op(idsA, {
      kind: 'create',
      scope: 'company',
      path: `user/${companyA.userId}`,
      value: {
        id: companyA.userId,
        name: 'Outra Ana',
        email: 'x@teste.local',
        council: null,
        registration_number: null,
        title: null,
        photo_location_enabled: false,
      },
    });
    const fine = clientCreate(idsA, newId());
    const result = await pushOk(companyA, [colleague, ownName, otherCompanysUser, otherTenant, create, fine]);
    expect(result.rejected).toEqual([
      { op_id: colleague.op_id, code: 'op_forbidden' },
      { op_id: ownName.op_id, code: 'op_forbidden' },
      { op_id: otherCompanysUser.op_id, code: 'op_forbidden' },
      { op_id: otherTenant.op_id, code: 'op_tenant_mismatch' },
      { op_id: create.op_id, code: 'op_server_only' },
    ]);
    expect(result.applied.map((a) => a.op_id)).toEqual([fine.op_id]);
    expect(await userEntity(companyB)).toEqual(bBefore);
  });

  it('never lets company B read company A through GET /api/account', async () => {
    const b = await account(companyB);
    expect(b).toMatchObject({ id: companyB.userId, companyId: companyB.companyId, email: companyB.email });
    expect(b.id).not.toBe(companyA.userId);
    expect(b.companyId).not.toBe(companyA.companyId);

    // The repository never answers company B's user under company A.
    expect(await findUserProfile(db, asCompanyId(companyA.companyId), companyB.userId)).toBeUndefined();

    // A user row with B's id planted under company A is never composed into B's profile:
    // the registration comes from B's own tenant.
    const planted = {
      id: companyB.userId,
      name: 'Plantado',
      email: companyB.email,
      council: 'crea',
      registration_number: 'SP PLANTADO',
      title: 'Plantado',
      photo_location_enabled: false,
    };
    await db
      .insert(entities)
      .values({ company_id: companyA.companyId, entity: 'user', id: companyB.userId, row: userRowSchema.parse(planted), updated_seq: 0 });
    try {
      const again = await account(companyB);
      expect(again.registrationNumber).toBe(b.registrationNumber);
      expect(again.registrationNumber).not.toBe('SP PLANTADO');
      expect(await findUserProfile(db, asCompanyId(companyA.companyId), companyB.userId)).toBeUndefined();
    } finally {
      await db
        .delete(entities)
        .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'user'), eq(entities.id, companyB.userId)));
    }
  });

  it('the old registration write route is gone', async () => {
    const res = await authed(companyA, '/api/account/registration', {
      method: 'PUT',
      body: JSON.stringify({ council: 'crea', registrationNumber: 'SP 1', title: 'Eng.' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('1.5-API-005 contract skew', () => {
  it('answers 426 on pulls below the minimum or without the header, and still accepts the push', async () => {
    for (const path of ['/api/sync/company?since=0', `/api/sync/relatorios/${newId()}?since=0`, `/api/sync/projects/${newId()}?since=0`]) {
      const res = await pull(companyA, path, '0');
      expect(res.status).toBe(426);
      expect(errorResponseSchema.parse(await res.json()).code).toBe('contract_outdated');
    }
    // A version-1 bundle cannot parse the `user/{id}` creates the company stream carries.
    expect((await pull(companyA, '/api/sync/company?since=0', '1')).status).toBe(426);
    const missing = await pull(companyA, '/api/sync/company?since=0', null);
    expect(missing.status).toBe(426);
    expect(errorResponseSchema.parse(await missing.json()).code).toBe('contract_outdated');

    const batch = [clientCreate(idsA, newId())];
    const res = await push(companyA, { ops: batch }, '0');
    expect(res.status).toBe(200);
    for (const o of batch) written.opIds.add(o.op_id);
    expect(syncPushResponseSchema.parse(await res.json()).applied).toHaveLength(1);
  });

  it('contract 19 (Story 14.5; Story 14.3 matrix "Old client"): a version-18 pull is refused with 426 contract_outdated on every stream, a version-19 pull is answered', async () => {
    expect(CONTRACT_VERSION).toBe(19);
    expect(MIN_CONTRACT_VERSION).toBe(19);
    for (const path of ['/api/sync/company?since=0', `/api/sync/relatorios/${newId()}?since=0`, `/api/sync/projects/${newId()}?since=0`]) {
      // 18 is the last version that cannot parse `sheet/{id}/test/{key}/value/...`, the ninth block type nor resolve seed v5 (Story 14.5);
      // 17 cannot parse `location/{id}/checklist/...` nor resolve seed v4 (Story 14.3); 16 stays refused as since Story 14.2.
      for (const version of ['18', '17', '16']) {
        const old = await pull(companyA, path, version);
        expect(old.status, `${path} at ${version}`).toBe(426);
        expect(errorResponseSchema.parse(await old.json()).code).toBe('contract_outdated');
      }
    }
    const current = await pull(companyA, '/api/sync/company?since=0', '19');
    expect(current.status).toBe(200);
    // An outdated client keeps pushing (AD-13): only the pull is refused.
    const batch = [clientCreate(idsA, newId())];
    const pushed = await push(companyA, { ops: batch }, '18');
    expect(pushed.status).toBe(200);
    for (const o of batch) written.opIds.add(o.op_id);
  });
});

/** A relatório-scoped file row of `kind` (a photo, or another relatório file such as a cover photo). */
function relatorioFileCreate(ids: Ids, relatorioId: string, fileId: string, kind: 'photo' | 'cover_photo'): Op {
  written.entityIds.add(fileId);
  const base = {
    id: fileId,
    company_id: ids.company,
    relatorio_id: relatorioId,
    sha256: 'cd'.repeat(32),
    mime: 'image/jpeg',
    size: 1024,
    uploaded_at: null,
    variants: null,
    removed_at: null,
  };
  const value =
    kind === 'photo'
      ? {
          ...base,
          kind,
          captured_at: '2026-09-06T11:12:30.000Z',
          tz_offset: -180,
          coords: null,
          local_seq: 1,
          block_id: null,
          item_key: null,
          caption: null,
          reading_kind: null,
          reading_target: null,
          reading_status: 'none',
        }
      : { ...base, kind };
  return op(ids, { kind: 'create', scope: 'relatorio', relatorio_id: relatorioId, path: `file/${fileId}`, value: value as Op['value'] });
}

describe('10.4-API-001 the company summary carries each relatório\'s progress', () => {
  it('counts live blocks and live photo files per relatório, never a removed one, another file kind or another company\'s rows', async () => {
    const relatorioId = newId();
    const blocks = [newId(), newId(), newId()];
    const photos = [newId(), newId(), newId()];
    const cover = newId();
    const removedAt = '2026-09-29T12:00:00.000Z';
    const pushed = await pushOk(companyA, [
      relatorioCreate(idsA, relatorioId, newId()),
      ...blocks.map((id) => blockCreate(idsA, relatorioId, id, 'disjuntor_mt')),
      ...photos.map((id) => relatorioFileCreate(idsA, relatorioId, id, 'photo')),
      relatorioFileCreate(idsA, relatorioId, cover, 'cover_photo'),
      op(idsA, { kind: 'put', scope: 'relatorio', relatorio_id: relatorioId, path: `block/${blocks[2]}/removed_at`, value: removedAt }),
      op(idsA, { kind: 'put', scope: 'relatorio', relatorio_id: relatorioId, path: `file/${photos[2]}/removed_at`, value: removedAt }),
    ]);
    expect(pushed.rejected).toEqual([]);

    // Company B's relatório with its own rows: never counted in A's summary, and A's never in B's.
    const otherId = newId();
    const other = await pushOk(companyB, [
      relatorioCreate(idsB, otherId, newId()),
      blockCreate(idsB, otherId, newId(), 'disjuntor_mt'),
      relatorioFileCreate(idsB, otherId, newId(), 'photo'),
    ]);
    expect(other.rejected).toEqual([]);

    const summaryOf = async (company: Company) => {
      const page = await pullOk(company, `/api/sync/company?since=0`);
      return page.summary!.relatorios;
    };
    const a = await summaryOf(companyA);
    expect(a.find((r) => r.id === relatorioId)?.progress).toEqual({ sheets: 2, photos: 2 });
    expect(a.some((r) => r.id === otherId)).toBe(false);
    const b = await summaryOf(companyB);
    expect(b.find((r) => r.id === otherId)?.progress).toEqual({ sheets: 1, photos: 1 });
    expect(b.some((r) => r.id === relatorioId)).toBe(false);
  });
});

describe('6.3/6.5-API-001 a photo caption and removal through the sync route', () => {
  it('applies file/{id}/caption and file/{id}/removed_at (and its clearing) and pulls them back on the relatório stream', async () => {
    const relatorioId = newId();
    const photoId = newId();
    written.entityIds.add(photoId);
    const create = op(idsA, {
      kind: 'create',
      scope: 'relatorio',
      relatorio_id: relatorioId,
      path: `file/${photoId}`,
      value: {
        id: photoId,
        company_id: companyA.companyId,
        relatorio_id: relatorioId,
        kind: 'photo',
        sha256: 'ab'.repeat(32),
        mime: 'image/jpeg',
        size: 1024,
        uploaded_at: null,
        variants: null,
        removed_at: null,
        captured_at: '2026-09-06T11:12:30.000Z',
        tz_offset: -180,
        coords: null,
        local_seq: 1,
        block_id: null,
        item_key: null,
        caption: 'Detalhe da chave seccionadora do Cubículo Enel',
        reading_kind: null,
        reading_target: null,
        reading_status: 'none',
      },
    });
    const created = await pushOk(companyA, [relatorioCreate(idsA, relatorioId, newId()), create]);
    expect(created.rejected).toEqual([]);

    const newCaption = 'Detalhe da limpeza e reaperto realizada na chave seccionadora';
    const caption = op(idsA, { kind: 'put', scope: 'relatorio', relatorio_id: relatorioId, path: `file/${photoId}/caption`, value: newCaption });
    const removed = op(idsA, { kind: 'put', scope: 'relatorio', relatorio_id: relatorioId, path: `file/${photoId}/removed_at`, value: '2026-09-25T12:00:00.000Z' });
    const edits = await pushOk(companyA, [caption, removed]);
    expect(edits.rejected).toEqual([]);
    expect(edits.applied).toHaveLength(2);

    const rowOf = async () =>
      (await db.select({ row: entities.row, removed_at: entities.removed_at }).from(entities).where(and(eq(entities.entity, 'file'), eq(entities.id, photoId))))[0]!;
    const tombstoned = await rowOf();
    expect(tombstoned.row).toMatchObject({ caption: newCaption, removed_at: '2026-09-25T12:00:00.000Z' });
    expect(tombstoned.removed_at).not.toBeNull();

    // "Desfazer": the tombstone cleared, the photo back with its caption.
    const restore = op(idsA, { kind: 'put', scope: 'relatorio', relatorio_id: relatorioId, path: `file/${photoId}/removed_at`, value: null, prev_op_id: removed.op_id });
    const restored = await pushOk(companyA, [restore]);
    expect(restored.rejected).toEqual([]);
    expect((await rowOf()).row).toMatchObject({ removed_at: null, caption: newCaption });

    const page = await pullOk(companyA, `/api/sync/relatorios/${relatorioId}?since=0`);
    expect((page.ops as Op[]).map((o) => o.op_id)).toEqual([created.applied[0]!.op_id, create.op_id, caption.op_id, removed.op_id, restore.op_id]);
    expect((page.ops as Op[]).map((o) => o.path).slice(1)).toEqual([`file/${photoId}`, `file/${photoId}/caption`, `file/${photoId}/removed_at`, `file/${photoId}/removed_at`]);
  });
});

describe('Story 14.2 (contract 17): Local › Painel › Coluna through POST /api/sync/ops', () => {
  const blankSe = { type: null, primary_kv: null, secondary_kv: null, installed_kva: null };
  const blankEnv = { altitude_m: null, temperature_c: null, humidity_pct: null };
  const scoped = (relatorioId: string) => ({ scope: 'relatorio' as const, relatorio_id: relatorioId });

  function localCreate(relatorioId: string, id: string, extra: Record<string, unknown> = {}): Op {
    written.entityIds.add(id);
    return op(idsA, {
      ...scoped(relatorioId),
      kind: 'create',
      path: `location/${id}`,
      value: { id, relatorio_id: relatorioId, parent_id: null, kind: 'cabine', name: 'Cabine de transformação', order_key: 'a0', removed_at: null, se: blankSe, env: blankEnv, agrupar_por_tipo: false, ...extra },
    });
  }
  function childCreate(relatorioId: string, id: string, kind: 'painel' | 'coluna', parentId: string | null, name: string, orderKey = 'a0'): Op {
    written.entityIds.add(id);
    // Built by hand past `makeOp` for the row the schema refuses (a painel with no parent): the route must answer it, not the helper.
    const good = op(idsA, { ...scoped(relatorioId), kind: 'create', path: `location/${id}`, value: { id, relatorio_id: relatorioId, parent_id: newId(), kind, name, order_key: orderKey, removed_at: null } });
    return { ...good, value: { ...(good.value as Record<string, unknown>), parent_id: parentId } as Op['value'] };
  }
  function blockAt(relatorioId: string, id: string, locationId: string): Op {
    const base = blockCreate(idsA, relatorioId, id, 'chave_seccionadora');
    return { ...base, value: { ...(base.value as Record<string, unknown>), location_id: locationId } as Op['value'] };
  }
  const put = (relatorioId: string, path: string, value: unknown, kind: 'put' | 'remove' = 'put'): Op => op(idsA, { ...scoped(relatorioId), kind, path, value: value as Op['value'] });
  const rowOf = async (entity: string, id: string) =>
    (await db.select({ row: entities.row }).from(entities).where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, entity), eq(entities.id, id))))[0]?.row;

  /** A relatório with one local, one painel under it and one coluna in the painel; a coluna directly under the local too. */
  async function tree() {
    const ids = { relatorio: newId(), local: newId(), painel: newId(), coluna: newId(), legado: newId() };
    const log = [
      relatorioCreate(idsA, ids.relatorio, newId()),
      localCreate(ids.relatorio, ids.local),
      childCreate(ids.relatorio, ids.painel, 'painel', ids.local, 'Painel de média tensão'),
      childCreate(ids.relatorio, ids.coluna, 'coluna', ids.painel, 'Coluna 5'),
      childCreate(ids.relatorio, ids.legado, 'coluna', ids.local, 'Coluna 1', 'a1'),
    ];
    const result = await pushOk(companyA, log);
    expect(result.rejected).toEqual([]);
    return { ...ids, log, seqs: result.applied.map((a) => a.seq) };
  }

  it('accepts a painel tree with a Função, and the server rows equal the kernel replay of the same log, byte for byte', async () => {
    const t = await tree();
    const onLocal = newId();
    const onColuna = newId();
    const edits = [
      put(t.relatorio, `location/${t.local}/funcao`, 'transformacao'),
      blockAt(t.relatorio, onLocal, t.local),
      blockAt(t.relatorio, onColuna, t.coluna),
      put(t.relatorio, `location/${t.painel}/name`, 'Painel A'),
      put(t.relatorio, `location/${t.painel}/order_key`, 'a5'),
      put(t.relatorio, `location/${t.painel}/removed_at`, null, 'remove'),
      put(t.relatorio, `location/${t.painel}/removed_at`, null),
      put(t.relatorio, `block/${onLocal}/location_id`, t.legado),
      put(t.relatorio, `location/${t.local}/funcao`, 'Medição'),
    ];
    const result = await pushOk(companyA, edits);
    expect(result.rejected).toEqual([]);
    expect(result.applied.map((a) => a.op_id)).toEqual(edits.map((o) => o.op_id));

    const log = [...t.log, ...edits].map((o, i) => ({ ...o, seq: i + 1 }));
    const pure = replay(log);
    const checks: [string, string][] = [
      ['location', t.local],
      ['location', t.painel],
      ['location', t.coluna],
      ['location', t.legado],
      ['block', onLocal],
      ['block', onColuna],
    ];
    for (const [entity, id] of checks) {
      const server = await rowOf(entity, id);
      expect(server, `${entity} ${id}`).toBeDefined();
      expect(canonicalJson(server as never)).toBe(canonicalJson(pure.get(entityKey(entity as never, id)) as never));
    }
    expect(await rowOf('location', t.painel)).toMatchObject({ kind: 'painel', parent_id: t.local, name: 'Painel A', order_key: 'a5', removed_at: null });
    expect(await rowOf('location', t.local)).toMatchObject({ kind: 'cabine', funcao: 'Medição' });
    expect(await rowOf('block', onLocal)).toMatchObject({ location_id: t.legado });

    // The stream carries the painel create and the funcao puts for every device on contract 17.
    const page = await pullOk(companyA, `/api/sync/relatorios/${t.relatorio}?since=0`);
    const paths = (page.ops as Op[]).map((o) => o.path);
    expect(paths).toContain(`location/${t.painel}`);
    expect(paths.filter((path) => path === `location/${t.local}/funcao`)).toHaveLength(2);
  });

  it('matrix "Block on a painel" and "Data on a painel": every refusal answers op_invalid, 200, and writes nothing; the rest of the push applies', async () => {
    const t = await tree();
    const before = { painel: await rowOf('location', t.painel), coluna: await rowOf('location', t.coluna), local: await rowOf('location', t.local) };
    const held = newId();
    expect((await pushOk(companyA, [blockAt(t.relatorio, held, t.coluna)])).rejected).toEqual([]);
    const strayBlock = newId();
    const refused = [
      blockAt(t.relatorio, strayBlock, t.painel),
      put(t.relatorio, `block/${held}/location_id`, t.painel),
      put(t.relatorio, `location/${t.painel}/se/type`, 'BLINDADA'),
      put(t.relatorio, `location/${t.painel}/env/temperature_c`, { raw: '25', unit: '°C', state: 'measured' }),
      put(t.relatorio, `location/${t.painel}/agrupar_por_tipo`, true),
      put(t.relatorio, `location/${t.painel}/funcao`, 'primaria'),
      put(t.relatorio, `location/${t.coluna}/funcao`, 'primaria'),
      // A blank or non-string Função fails the row schema.
      put(t.relatorio, `location/${t.local}/funcao`, '   '),
      put(t.relatorio, `location/${t.local}/funcao`, 7),
      // A painel with no parent fails the row schema.
      childCreate(t.relatorio, newId(), 'painel', null, 'Sem local'),
    ];
    const good = put(t.relatorio, `location/${t.local}/funcao`, 'entrada');
    // On a coluna, se/env/agrupar_por_tipo stay the silent no-op they always were: applied, nothing changed.
    const silent = [put(t.relatorio, `location/${t.coluna}/se/type`, 'X'), put(t.relatorio, `location/${t.coluna}/agrupar_por_tipo`, true)];
    const result = await pushOk(companyA, [...refused, good, ...silent]);
    expect(result.rejected).toEqual(refused.map((o) => ({ op_id: o.op_id, code: 'op_invalid' })));
    expect(result.applied.map((a) => a.op_id)).toEqual([good.op_id, ...silent.map((o) => o.op_id)]);

    const stored = await storedIds([...refused.map((o) => o.op_id), good.op_id]);
    for (const o of refused) expect(stored.has(o.op_id), o.path).toBe(false);
    expect(stored.has(good.op_id)).toBe(true);
    expect(await rowOf('block', strayBlock)).toBeUndefined();
    expect(await rowOf('block', held)).toMatchObject({ location_id: t.coluna });
    expect(await rowOf('location', t.painel)).toEqual(before.painel);
    expect(await rowOf('location', t.coluna)).toEqual(before.coluna);
    expect(await rowOf('location', t.local)).toEqual({ ...(before.local as object), funcao: 'entrada' });
  });

  it('coordinator review 2026-10-13: a block op naming a location id that is no uuid is refused as op_invalid, never a failed query; the rest of the push applies', async () => {
    const t = await tree();
    const held = newId();
    expect((await pushOk(companyA, [blockAt(t.relatorio, held, t.coluna)])).rejected).toEqual([]);
    const strayBlock = newId();
    // Only a non-conforming client sends these: the entities id column is a uuid, so the value must never reach the row lookup.
    const refused = [put(t.relatorio, `block/${held}/location_id`, 'not-a-uuid'), blockAt(t.relatorio, strayBlock, 'not-a-uuid')];
    const good = put(t.relatorio, `location/${t.painel}/name`, 'Painel depois');
    const res = await push(companyA, { ops: [...refused, good] });
    expect(res.status, await res.clone().text()).toBe(200);
    const result = syncPushResponseSchema.parse(await res.json());
    written.opIds.add(good.op_id);
    expect(result.rejected).toEqual(refused.map((o) => ({ op_id: o.op_id, code: 'op_invalid' })));
    expect(result.applied.map((a) => a.op_id)).toEqual([good.op_id]);

    const stored = await storedIds([...refused.map((o) => o.op_id), good.op_id]);
    for (const o of refused) expect(stored.has(o.op_id), o.path).toBe(false);
    expect(stored.has(good.op_id)).toBe(true);
    expect(await rowOf('block', strayBlock)).toBeUndefined();
    expect(await rowOf('block', held)).toMatchObject({ location_id: t.coluna });
    expect(await rowOf('location', t.painel)).toMatchObject({ name: 'Painel depois' });
  });

  it('Epic 14 QA Q-11: a file op naming a block id that is no uuid is refused as op_invalid, never a failed query; the rest of the push applies', async () => {
    const t = await tree();
    const photo = newId();
    expect((await pushOk(companyA, [relatorioFileCreate(idsA, t.relatorio, photo, 'photo')])).rejected).toEqual([]);
    const strayPhoto = newId();
    const strayCreate = relatorioFileCreate(idsA, t.relatorio, strayPhoto, 'photo');
    const refused = [put(t.relatorio, `file/${photo}/block_id`, 'not-a-uuid'), { ...strayCreate, value: { ...(strayCreate.value as object), block_id: 'not-a-uuid' } as Op['value'] }];
    const good = put(t.relatorio, `location/${t.painel}/name`, 'Painel com foto');
    const res = await push(companyA, { ops: [...refused, good] });
    expect(res.status, await res.clone().text()).toBe(200);
    const result = syncPushResponseSchema.parse(await res.json());
    written.opIds.add(good.op_id);
    expect(result.rejected).toEqual(refused.map((o) => ({ op_id: o.op_id, code: 'op_invalid' })));
    expect(result.applied.map((a) => a.op_id)).toEqual([good.op_id]);
    const stored = await storedIds(refused.map((o) => o.op_id));
    for (const o of refused) expect(stored.has(o.op_id), o.path).toBe(false);
    expect(await rowOf('file', strayPhoto)).toBeUndefined();
    expect(await rowOf('file', photo)).toMatchObject({ block_id: null });
  });

  it('a client batch holding a block on a painel is refused whole, as any batch with a permanent refusal is', async () => {
    const t = await tree();
    const batchId = newId();
    const novo = newId();
    const blockId = newId();
    const batch = [
      { ...childCreate(t.relatorio, novo, 'painel', t.local, 'Painel 2', 'a2'), batch_id: batchId },
      { ...blockAt(t.relatorio, blockId, novo), batch_id: batchId },
    ];
    const alone = put(t.relatorio, `location/${t.painel}/name`, 'Painel renomeado');
    const result = await pushOk(companyA, [...batch, alone]);
    expect(result.rejected).toEqual(batch.map((o) => ({ op_id: o.op_id, code: 'op_invalid' })));
    expect(result.applied.map((a) => a.op_id)).toEqual([alone.op_id]);
    expect(await rowOf('location', novo)).toBeUndefined();
    expect(await rowOf('block', blockId)).toBeUndefined();
    expect(await rowOf('location', t.painel)).toMatchObject({ name: 'Painel renomeado' });
  });
});

describe('Story 14.3 (contract 18): Verificações do local through POST /api/sync/ops', () => {
  const blankSe = { type: null, primary_kv: null, secondary_kv: null, installed_kva: null };
  const blankEnv = { altitude_m: null, temperature_c: null, humidity_pct: null };
  const scoped = (relatorioId: string) => ({ scope: 'relatorio' as const, relatorio_id: relatorioId });
  /** A second tablet of the same user, for the two-device rows of the matrix. */
  const idsA2: Ids = { ...idsA, device: 'tablet-test-a2' };
  const EMERGENCIA = 'iluminacao_de_emergencia_autonomia_minima_de_2_h';
  const EXTINTOR = 'extintor_de_incendio_carregado_lacrado_dentro_da_validade_sinalizado_e_desobstruido';
  const [LUVAS, TAPETE, VARA] = SITE_ITEM_KEYS;
  /** What a device stamps on a put over an empty cell (`stampSeen`): it saw nothing standing. */
  const SAW_EMPTY = { standing_op_id: null, seen_conflict_op_id: null };

  const put = (relatorioId: string, path: string, value: unknown, extra: Partial<OpInput> = {}, ids: Ids = idsA): Op =>
    op(ids, { ...scoped(relatorioId), kind: 'put', path, value: value as Op['value'], ...extra });
  const sitePut = (relatorioId: string, locationId: string, itemKey: string, field: 'result' | 'observation', value: unknown, extra: Partial<OpInput> = {}, ids: Ids = idsA): Op =>
    put(relatorioId, locationChecklistPath(locationId, itemKey, field), value, { meta: SAW_EMPTY, ...extra }, ids);
  const rowOf = async (entity: string, id: string) =>
    (await db.select({ row: entities.row }).from(entities).where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, entity), eq(entities.id, id))))[0]?.row;

  function relatorioOn(seedVersion: string, relatorioId: string, projectId: string, status = 'rascunho'): Op {
    const base = relatorioCreate(idsA, relatorioId, projectId);
    return { ...base, value: { ...(base.value as Record<string, unknown>), seed_version: seedVersion, status } as Op['value'] };
  }
  function locationCreate(relatorioId: string, id: string, kind: 'cabine' | 'painel' | 'coluna', parentId: string | null, name: string): Op {
    written.entityIds.add(id);
    const base = { id, relatorio_id: relatorioId, parent_id: parentId, kind, name, order_key: 'a0', removed_at: null };
    return op(idsA, { ...scoped(relatorioId), kind: 'create', path: `location/${id}`, value: kind === 'cabine' ? { ...base, se: blankSe, env: blankEnv, agrupar_por_tipo: false } : base });
  }

  /** A relatório on `seedVersion` with one local, one painel under it and one coluna in the painel. */
  async function site(seedVersion = 'v4', status = 'rascunho') {
    const ids = { relatorio: newId(), project: newId(), local: newId(), painel: newId(), coluna: newId() };
    const log = [
      projectCreate(idsA, ids.project),
      relatorioOn(seedVersion, ids.relatorio, ids.project, status),
      locationCreate(ids.relatorio, ids.local, 'cabine', null, 'Cabine de transformação'),
      locationCreate(ids.relatorio, ids.painel, 'painel', ids.local, 'Painel de média tensão'),
      locationCreate(ids.relatorio, ids.coluna, 'coluna', ids.painel, 'Coluna 1'),
    ];
    const result = await pushOk(companyA, log);
    expect(result.rejected).toEqual([]);
    return { ...ids, log };
  }

  /** Everything the server holds of one relatório stream, removed after a test that let the server write into it (jobs, files, revisions). */
  async function dropRelatorio(relatorioId: string): Promise<void> {
    await db.delete(ops).where(and(eq(ops.company_id, companyA.companyId), eq(ops.relatorio_id, relatorioId)));
    await db.delete(entities).where(and(eq(entities.company_id, companyA.companyId), eq(entities.relatorio_id, relatorioId)));
  }

  it('matrix "Item answered", "Two devices, same item", "Site photo" and "NC to point": the batch is accepted and the server rows equal the kernel replay of the same log, byte for byte', async () => {
    const t = await site();
    const photoId = newId();
    const pointId = newId();
    written.entityIds.add(photoId).add(pointId);
    const c = sitePut(t.relatorio, t.local, LUVAS!, 'result', 'C');
    const photoBase = relatorioFileCreate(idsA, t.relatorio, photoId, 'photo');
    const edits = [
      c,
      // Sequential on one device: C, then NC over it, with its observation.
      sitePut(t.relatorio, t.local, LUVAS!, 'result', 'NC', { prev_op_id: c.op_id, meta: { standing_op_id: c.op_id, seen_conflict_op_id: null } }),
      sitePut(t.relatorio, t.local, LUVAS!, 'observation', 'Luvas com furos ou ressecadas'),
      sitePut(t.relatorio, t.local, EXTINTOR, 'result', 'C'),
      sitePut(t.relatorio, t.local, EXTINTOR, 'observation', 'CO2 6 kg dentro da sala, validade 03/2027'),
      sitePut(t.relatorio, t.local, 'bacia_de_contencao_de_oleo', 'result', 'NA'),
      // Two devices, the same item, neither saw the other: C lands first, NC stands.
      sitePut(t.relatorio, t.local, EMERGENCIA, 'result', 'C'),
      sitePut(t.relatorio, t.local, EMERGENCIA, 'result', 'NC', {}, idsA2),
      sitePut(t.relatorio, t.local, EMERGENCIA, 'observation', 'Luminária de emergência inoperante', {}, idsA2),
      // The other order: NC lands first, the concurrent C does not displace it.
      sitePut(t.relatorio, t.local, TAPETE!, 'result', 'NC', {}, idsA2),
      sitePut(t.relatorio, t.local, TAPETE!, 'result', 'C'),
      // Different items on two devices both stand.
      sitePut(t.relatorio, t.local, VARA!, 'result', 'C', {}, idsA2),
      // An answer, then cleared (the undo of a put): unanswered again.
      sitePut(t.relatorio, t.local, 'ventilacao', 'result', null),
      // A photo on the NC item and the point created from it.
      { ...photoBase, value: { ...(photoBase.value as Record<string, unknown>), item_key: EMERGENCIA, location_id: t.local } as Op['value'] },
      put(t.relatorio, `file/${photoId}/caption`, 'Verificação de iluminação de emergência (autonomia mínima de 2 h) da Cabine de transformação'),
      op(idsA, {
        ...scoped(t.relatorio),
        kind: 'create',
        path: `point/${pointId}`,
        value: {
          id: pointId,
          relatorio_id: t.relatorio,
          text: `Luminária de emergência inoperante ${photoToken(photoId)}`,
          equipment_id: null,
          origin: 'manual',
          order_key: 'a0',
          removed_at: null,
          action: null,
          priority: null,
          deadline: null,
          owner: null,
          location_id: t.local,
        },
      }),
    ];
    const result = await pushOk(companyA, edits);
    expect(result.rejected).toEqual([]);
    expect(result.applied.map((a) => a.op_id)).toEqual(edits.map((o) => o.op_id));

    const pure = replay([...t.log, ...edits].map((o, i) => ({ ...o, seq: i + 1 })));
    const checks: [string, string][] = [
      ['location', t.local],
      ['location', t.painel],
      ['location', t.coluna],
      ['file', photoId],
      ['point', pointId],
      ['relatorio', t.relatorio],
    ];
    for (const [entity, id] of checks) {
      const server = await rowOf(entity, id);
      expect(server, `${entity} ${id}`).toBeDefined();
      expect(canonicalJson(server as never), `${entity} ${id}`).toBe(canonicalJson(pure.get(entityKey(entity as never, id)) as never));
    }
    const local = (await rowOf('location', t.local)) as unknown as { checklist: Record<string, { result?: { value: unknown; merge?: { rule: string } }; observation?: { value: unknown } }> };
    expect(local.checklist[LUVAS!]).toMatchObject({ result: { value: 'NC' }, observation: { value: 'Luvas com furos ou ressecadas' } });
    expect(local.checklist[EXTINTOR]).toMatchObject({ result: { value: 'C' }, observation: { value: 'CO2 6 kg dentro da sala, validade 03/2027' } });
    expect(local.checklist.bacia_de_contencao_de_oleo).toMatchObject({ result: { value: 'NA' } });
    // NC stands over a concurrent C whichever landed first (`nc_over_c`), with the NC device's observation.
    expect(local.checklist[EMERGENCIA]).toMatchObject({ result: { value: 'NC', merge: { rule: 'nc_over_c' } }, observation: { value: 'Luminária de emergência inoperante' } });
    expect(local.checklist[TAPETE!]).toMatchObject({ result: { value: 'NC', merge: { rule: 'nc_over_c' } } });
    expect(local.checklist[VARA!]).toMatchObject({ result: { value: 'C' } });
    expect(local.checklist.ventilacao).toMatchObject({ result: { value: null } });
    expect(await rowOf('file', photoId)).toMatchObject({ location_id: t.local, item_key: EMERGENCIA, block_id: null });
    expect(await rowOf('point', pointId)).toMatchObject({ location_id: t.local, equipment_id: null });
    // A painel and a coluna hold no checklist.
    expect(await rowOf('location', t.painel)).not.toHaveProperty('checklist');

    // The stream carries the site puts for every device on contract 18.
    const page = await pullOk(companyA, `/api/sync/relatorios/${t.relatorio}?since=0`);
    const paths = (page.ops as Op[]).map((o) => o.path);
    expect(paths.filter((path) => path.startsWith(`location/${t.local}/checklist/`))).toHaveLength(13);
    expect(paths).toContain(locationChecklistPath(t.local, EMERGENCIA, 'result'));
  });

  it('matrix "Wrong kind" and "Wrong key or seed": every refusal is answered per op with 200 and writes nothing (op_invalid for a wrong kind or seed, op_path_unknown for a path no family parses, as every such path); the rest of the push applies', async () => {
    const t = await site();
    const old = await site('v3');
    const before = { local: await rowOf('location', t.local), painel: await rowOf('location', t.painel), coluna: await rowOf('location', t.coluna), oldLocal: await rowOf('location', old.local) };
    const good = sitePut(t.relatorio, t.local, EMERGENCIA, 'result', 'NC');
    /** A well-formed op whose path is replaced after `makeOp`: the route must answer it, not the helper. */
    const withPath = (path: string): Op => ({ ...sitePut(t.relatorio, t.local, EMERGENCIA, 'result', 'C'), path });
    const invalid = [
      // Wrong kind: the checklist lives on the local, never on a painel or a coluna (`LocationKindError`).
      sitePut(t.relatorio, t.painel, EMERGENCIA, 'result', 'C'),
      sitePut(t.relatorio, t.coluna, EMERGENCIA, 'observation', 'x'),
      // Wrong seed: a relatório on v3 ships no site list (`SeedPathError`).
      sitePut(old.relatorio, old.local, EMERGENCIA, 'result', 'C'),
      sitePut(old.relatorio, old.local, EXTINTOR, 'observation', 'x'),
      // Put only: the family takes no remove.
      { ...sitePut(t.relatorio, t.local, EMERGENCIA, 'result', null), kind: 'remove' as const },
    ];
    // Wrong key: a sheet item key, a key no list holds, and a field the family does not have.
    // `parsePath` knows no such path, so the route answers what it answers every unknown path.
    const unknown = [
      withPath(`location/${t.local}/checklist/contatos/result`),
      withPath(`location/${t.local}/checklist/item_inexistente/observation`),
      withPath(`location/${t.local}/checklist/${EMERGENCIA}/photo`),
    ];
    const refused = [...invalid, ...unknown];
    const result = await pushOk(companyA, [...refused, good]);
    expect(result.rejected).toEqual([
      ...invalid.map((o) => ({ op_id: o.op_id, code: 'op_invalid' })),
      ...unknown.map((o) => ({ op_id: o.op_id, code: 'op_path_unknown' })),
    ]);
    expect(result.applied.map((a) => a.op_id)).toEqual([good.op_id]);

    const stored = await storedIds([...refused.map((o) => o.op_id), good.op_id]);
    for (const o of refused) expect(stored.has(o.op_id), `${o.kind} ${o.path}`).toBe(false);
    expect(stored.has(good.op_id)).toBe(true);
    expect(await rowOf('location', t.painel)).toEqual(before.painel);
    expect(await rowOf('location', t.coluna)).toEqual(before.coluna);
    expect(await rowOf('location', old.local)).toEqual(before.oldLocal);
    // Only the good put changed the local.
    expect(await rowOf('location', t.local)).toEqual({ ...(before.local as object), checklist: { [EMERGENCIA]: { result: { value: 'NC', source_suggestion_id: null, op_id: good.op_id } } } });
  });

  it('a client batch holding one refused site put is refused whole, as any batch with a permanent refusal is', async () => {
    const t = await site();
    const batchId = newId();
    const batch = [
      sitePut(t.relatorio, t.local, EMERGENCIA, 'result', 'C', { batch_id: batchId }),
      sitePut(t.relatorio, t.painel, EMERGENCIA, 'result', 'C', { batch_id: batchId }),
    ];
    const alone = sitePut(t.relatorio, t.local, EXTINTOR, 'result', 'NA');
    const result = await pushOk(companyA, [...batch, alone]);
    expect(result.rejected).toEqual(batch.map((o) => ({ op_id: o.op_id, code: 'op_invalid' })));
    expect(result.applied.map((a) => a.op_id)).toEqual([alone.op_id]);
    expect(await rowOf('location', t.local)).toMatchObject({ checklist: { [EXTINTOR]: { result: { value: 'NA' } } } });
    expect(((await rowOf('location', t.local)) as unknown as { checklist: Record<string, unknown> }).checklist[EMERGENCIA]).toBeUndefined();
  });

  it(
    'matrix "Edit in Emitido": with nothing edited the generate answers unchanged; a site put on the Emitido relatório makes the next generate build revision 2, whose document prints the answer',
    async () => {
      const t = await site('v4', 'em_revisao');
      const generate = (lastOpId: string | null) =>
        authed(companyA, `/api/relatorios/${t.relatorio}/generate`, { method: 'POST', body: JSON.stringify({ last_op_id: lastOpId, file_ids_expected: [] }) });
      /** Every op of the relatório stream, page by page. */
      const pullAll = async (): Promise<Op[]> => {
        const all: Op[] = [];
        let since = 0;
        for (;;) {
          const page = await pullOk(companyA, `/api/sync/relatorios/${t.relatorio}?since=${since}`);
          const pageOps = page.ops as Op[];
          all.push(...pageOps);
          const last = pageOps.at(-1)?.seq;
          if (last === undefined || last === null || last >= page.seq) return all;
          since = last;
        }
      };
      /** Polls the stream until the revision with `number` exists, or the job failed. */
      const waitForRevision = async (jobId: string, number: number) => {
        const deadline = Date.now() + 150_000;
        for (;;) {
          const pulled = await pullAll();
          if (pulled.some((o) => o.path === `generation_job/${jobId}/status` && o.value === 'failed')) {
            throw new Error(`generate job ${jobId} failed: ${String(pulled.find((o) => o.path === `generation_job/${jobId}/error`)?.value)}`);
          }
          const created = pulled.find((o) => o.kind === 'create' && o.path.startsWith('revision/') && (o.value as { number: number }).number === number);
          if (created !== undefined && pulled.some((o) => o.path === `generation_job/${jobId}/result`)) return revisionRowSchema.parse(created.value);
          if (Date.now() > deadline) throw new Error(`revision ${number} did not arrive`);
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      };
      try {
        // In the field: one site answer and the parecer (the only blocking pre-issue row).
        const answered = sitePut(t.relatorio, t.local, EXTINTOR, 'result', 'C');
        const parecer = setupPut(idsA, t.relatorio, 'parecer', { verdict: 'apto_com_restricoes', text: null, text_status: null, text_basis: null });
        expect((await pushOk(companyA, [answered, parecer])).rejected).toEqual([]);

        const first = await generate(parecer.op_id);
        expect(first.status, await first.clone().text()).toBe(202);
        const queued = generateResponseSchema.parse(await first.json());
        if (queued.outcome !== 'queued') throw new Error(`expected queued, got ${queued.outcome}`);
        expect(queued.revision_number).toBe(1);
        const revision1 = await waitForRevision(queued.job_id, 1);

        // "Marcar como enviado ao cliente": Emitido. The status itself is never an edit, so the generate answers the revision it has.
        const issued = put(t.relatorio, 'relatorio/status', 'emitido');
        expect((await pushOk(companyA, [issued])).rejected).toEqual([]);
        expect(await rowOf('relatorio', t.relatorio)).toMatchObject({ status: 'emitido' });
        const same = await generate(issued.op_id);
        expect(same.status, await same.clone().text()).toBe(200);
        expect(generateResponseSchema.parse(await same.json())).toEqual({ outcome: 'unchanged', revision_id: revision1.id, revision_number: 1 });

        // A site item answered on the Emitido relatório, in the batch the device writes: the put and the Em revisão status op.
        const batchId = newId();
        const nc = sitePut(t.relatorio, t.local, EMERGENCIA, 'result', 'NC', { batch_id: batchId });
        const observation = sitePut(t.relatorio, t.local, EMERGENCIA, 'observation', 'Duas luminárias de emergência sem carga', { batch_id: batchId });
        const reopened = put(t.relatorio, 'relatorio/status', 'em_revisao', { batch_id: batchId, prev_op_id: issued.op_id });
        expect((await pushOk(companyA, [nc, observation, reopened])).rejected).toEqual([]);
        expect(await rowOf('relatorio', t.relatorio)).toMatchObject({ status: 'em_revisao' });

        const second = await generate(reopened.op_id);
        expect(second.status, await second.clone().text()).toBe(202);
        const requeued = generateResponseSchema.parse(await second.json());
        if (requeued.outcome !== 'queued') throw new Error(`expected queued, got ${requeued.outcome}`);
        expect(requeued.revision_number).toBe(2);
        const revision2 = await waitForRevision(requeued.job_id, 2);
        expect(revision2.number).toBe(2);
        expect(revision2.id).not.toBe(revision1.id);
        expect(revision2.snapshot_seq).toBeGreaterThan(revision1.snapshot_seq);

        // The document of revision 2 prints the local with its site table and the answers, though the local holds no equipment.
        const res = await authed(companyA, `/api/revisions/${revision2.id}/docx`);
        expect(res.status).toBe(200);
        const structure = extractStructure(Buffer.from(await res.arrayBuffer()));
        expect(structure.headings.filter((h) => h.level === 2).map((h) => h.text)).toEqual(['9.1 Cabine de transformação']);
        const tables = structure.tables.filter((table) => table[0]![0] === 'VERIFICAÇÕES DO LOCAL');
        expect(tables).toHaveLength(1);
        expect(tables[0]).toContainEqual(['8. EXTINTOR DE INCÊNDIO CARREGADO, LACRADO, DENTRO DA VALIDADE, SINALIZADO E DESOBSTRUÍDO', 'X', '', '', '']);
        expect(tables[0]).toContainEqual(['11. ILUMINAÇÃO DE EMERGÊNCIA (AUTONOMIA MÍNIMA DE 2 H)', '', 'X', '', 'Duas luminárias de emergência sem carga']);
        expect(structure.tables[1]![1]).toEqual(['Revisão do documento', 'Rev. 2']);
      } finally {
        await dropRelatorio(t.relatorio);
      }
    },
    360_000,
  );
});

describe('Story 14.2, second pass: a location removal batch and its restore through POST /api/sync/ops', () => {
  const blankSe = { type: null, primary_kv: null, secondary_kv: null, installed_kva: null };
  const blankEnv = { altitude_m: null, temperature_c: null, humidity_pct: null };
  const scoped = (relatorioId: string) => ({ scope: 'relatorio' as const, relatorio_id: relatorioId });

  function locationCreate(relatorioId: string, id: string, kind: 'cabine' | 'painel' | 'coluna', parentId: string | null, name: string, orderKey: string): Op {
    written.entityIds.add(id);
    const base = { id, relatorio_id: relatorioId, parent_id: parentId, kind, name, order_key: orderKey, removed_at: null };
    return op(idsA, { ...scoped(relatorioId), kind: 'create', path: `location/${id}`, value: kind === 'cabine' ? { ...base, se: blankSe, env: blankEnv, agrupar_por_tipo: false } : base });
  }
  function equipmentWith(projectId: string, id: string, tag: string): Op {
    const base = equipmentCreate(idsA, id, projectId);
    return { ...base, value: { ...(base.value as Record<string, unknown>), tag, type: 'chave_seccionadora' } as Op['value'] };
  }
  function sheetAt(relatorioId: string, id: string, locationId: string, equipmentId: string, orderKey: string): Op {
    const base = blockCreate(idsA, relatorioId, id, 'chave_seccionadora');
    return { ...base, value: { ...(base.value as Record<string, unknown>), location_id: locationId, equipment_id: equipmentId, order_key: orderKey } as Op['value'] };
  }
  /** One client batch: every op carries the same `batch_id` and the same `client_ts`, as the device's commit stamps it. */
  function batchOf(relatorioId: string, projectId: string, kind: 'remove' | 'put', ids: { locationIds: string[]; blockIds: string[]; equipmentIds: string[] }, at: string): Op[] {
    const batchId = newId();
    const one = (input: Parameters<typeof op>[1]): Op => ({ ...op(idsA, { ...input, batch_id: batchId }), client_ts: at });
    return [
      ...ids.locationIds.map((id) => one({ ...scoped(relatorioId), kind, path: `location/${id}/removed_at`, value: null })),
      ...ids.blockIds.map((id) => one({ ...scoped(relatorioId), kind, path: `block/${id}/removed_at`, value: null })),
      ...ids.equipmentIds.map((id) => one({ kind, scope: 'project', project_id: projectId, path: `equipment/${id}/removed_at`, value: null })),
    ];
  }
  /** Every location, block and equipment row of a kernel state, removed ones included: what a device hands the plans. */
  function rowsIn(state: EntityState): { locations: LocationRow[]; blocks: BlockRow[]; equipment: EquipmentRow[] } {
    const out = { locations: [] as LocationRow[], blocks: [] as BlockRow[], equipment: [] as EquipmentRow[] };
    for (const [key, row] of state) {
      const entity = splitEntityKey(key).entity;
      if (entity === 'location') out.locations.push(row as LocationRow);
      else if (entity === 'block') out.blocks.push(row as BlockRow);
      else if (entity === 'equipment') out.equipment.push(row as EquipmentRow);
    }
    return out;
  }
  const stored = async (entity: string, id: string) =>
    (await db.select({ row: entities.row, removed_at: entities.removed_at }).from(entities).where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, entity), eq(entities.id, id))))[0];
  const sheetsInSummary = async (relatorioId: string) => (await pullOk(companyA, '/api/sync/company?since=0')).summary!.relatorios.find((row) => row.id === relatorioId)?.progress?.sheets;

  it('a painel with two colunas and their sheets leaves in one batch and comes back in one: the stored rows, the server snapshot and the summary agree with the kernel', async () => {
    const projectId = newId();
    const relatorioId = newId();
    const local = newId();
    const painel = newId();
    const [coluna1, coluna2, outra] = [newId(), newId(), newId()];
    const equipment = { a: newId(), b: newId(), shared: newId(), fora: newId() };
    const sheets = { a: newId(), b: newId(), shared: newId(), keeper: newId(), fora: newId() };
    for (const id of Object.values(equipment)) written.entityIds.add(id);
    const created = [
      projectCreate(idsA, projectId),
      relatorioCreate(idsA, relatorioId, projectId),
      locationCreate(relatorioId, local, 'cabine', null, 'Subestação', 'a0'),
      locationCreate(relatorioId, painel, 'painel', local, 'Painel 1', 'a0'),
      locationCreate(relatorioId, coluna1, 'coluna', painel, 'Coluna 1', 'a0'),
      locationCreate(relatorioId, coluna2, 'coluna', painel, 'Coluna 2', 'a1'),
      // A coluna directly under the local: it stays, with one sheet of its own and one holding the shared equipment.
      locationCreate(relatorioId, outra, 'coluna', local, 'Coluna 9', 'a1'),
      equipmentWith(projectId, equipment.a, 'SEC-C01'),
      equipmentWith(projectId, equipment.b, 'SEC-C02'),
      equipmentWith(projectId, equipment.shared, 'SEC-C02-2'),
      equipmentWith(projectId, equipment.fora, 'SEC-C09'),
      sheetAt(relatorioId, sheets.a, coluna1, equipment.a, 'a0'),
      sheetAt(relatorioId, sheets.b, coluna2, equipment.b, 'a0'),
      sheetAt(relatorioId, sheets.shared, coluna2, equipment.shared, 'a1'),
      sheetAt(relatorioId, sheets.keeper, outra, equipment.shared, 'a0'),
      sheetAt(relatorioId, sheets.fora, outra, equipment.fora, 'a1'),
    ];
    const first = await pushOk(companyA, created);
    expect(first.rejected).toEqual([]);

    const log: Op[] = created.map((o, i) => ({ ...o, seq: i + 1 }));
    const pushed = (batch: Op[]) => log.push(...batch.map((o, i) => ({ ...o, seq: log.length + i + 1 })));
    /** The server snapshot against the kernel replay of the same log. The company's own `empresa` row is not this log's. */
    const snapshotsAgree = async () => {
      const kernel = buildSnapshot(replay(log), relatorioId);
      const server = await toSnapshot(db, asCompanyId(companyA.companyId), relatorioId);
      expect(serializeSnapshot({ ...server, empresa: null })).toBe(serializeSnapshot({ ...kernel, empresa: null }));
      return kernel;
    };
    const before = await snapshotsAgree();
    expect(progress(before).sheets_total).toBe(5);
    expect(await sheetsInSummary(relatorioId)).toBe(5);

    // The removal, planned by the kernel on the rows a device holds: the painel, its two colunas, their three
    // sheets, and two of the three equipment rows (the third is held by a sheet outside the removal).
    const visibility = { companyDownloaded: true, summaries: [], heldRelatorioIds: [], downloadedStreamIds: [] };
    const held = rowsIn(replay(log));
    const plan = locationRemovalPlan({ locations: held.locations, blocks: held.blocks, otherBlocks: [], locationId: painel, projectId, relatorioId, visibility })!;
    expect(plan).toEqual({
      kind: 'painel',
      locationId: painel,
      locationIds: [painel, coluna1, coluna2],
      blockIds: [sheets.a, sheets.b, sheets.shared],
      equipmentIds: [equipment.a, equipment.b],
      counts: { paineis: 0, colunas: 2, sheets: 3, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 },
    });
    const removedAt = '2026-10-13T15:00:00.000Z';
    const removal = batchOf(relatorioId, projectId, 'remove', plan, removedAt);
    const removed = await pushOk(companyA, removal);
    expect(removed.rejected).toEqual([]);
    expect(removed.applied.map((a) => a.op_id)).toEqual(removal.map((o) => o.op_id));
    pushed(removal);

    // Every row of the batch carries the batch's one timestamp; the rows outside it are untouched.
    const tombstoned: [string, string][] = [
      ...plan.locationIds.map((id): [string, string] => ['location', id]),
      ...plan.blockIds.map((id): [string, string] => ['block', id]),
      ...plan.equipmentIds.map((id): [string, string] => ['equipment', id]),
    ];
    for (const [entity, id] of tombstoned) {
      const record = await stored(entity, id);
      expect(record?.row, `${entity} ${id}`).toMatchObject({ removed_at: removedAt });
      expect(record?.removed_at, `${entity} ${id}`).not.toBeNull();
    }
    const kept: [string, string][] = [['location', local], ['location', outra], ['block', sheets.keeper], ['block', sheets.fora], ['equipment', equipment.shared], ['equipment', equipment.fora]];
    for (const [entity, id] of kept) expect((await stored(entity, id))?.row, `${entity} ${id}`).toMatchObject({ removed_at: null });
    const pure = replay(log);
    for (const [entity, id] of [...tombstoned, ...kept]) {
      expect(canonicalJson((await stored(entity, id))!.row as never), `${entity} ${id}`).toBe(canonicalJson(pure.get(entityKey(entity as never, id)) as never));
    }

    const after = await snapshotsAgree();
    expect(after.locations.map((row) => row.id).sort()).toEqual([local, outra].sort());
    expect(after.blocks.map((row) => row.id).sort()).toEqual([sheets.keeper, sheets.fora].sort());
    expect(after.equipment.map((row) => row.id).sort()).toEqual([equipment.shared, equipment.fora].sort());
    expect(progress(after).sheets_total).toBe(2);
    expect(await sheetsInSummary(relatorioId)).toBe(2);

    // The relatório's stream hands the whole batch to every other device in the order it was written (it
    // carries its project's ops too); the project's stream carries the equipment tombstones (AD-5).
    const inBatch = (page: SyncPullResponse) => (page.ops as Op[]).filter((o) => o.batch_id === removal[0]!.batch_id);
    const streamed = inBatch(await pullOk(companyA, `/api/sync/relatorios/${relatorioId}?since=0`));
    expect(streamed.map((o) => o.path)).toEqual(removal.map((o) => o.path));
    expect(streamed.map((o) => o.kind)).toEqual(removal.map(() => 'remove'));
    expect(new Set(streamed.map((o) => o.client_ts))).toEqual(new Set([removedAt]));
    const onProject = inBatch(await pullOk(companyA, `/api/sync/projects/${projectId}?since=0`));
    expect(onProject.map((o) => o.path)).toEqual(plan.equipmentIds.map((id) => `equipment/${id}/removed_at`));

    // The restore, planned on the rows after the removal: the same rows come back in one batch.
    const afterRows = rowsIn(replay(log));
    const back = locationRestorePlan({ ...afterRows, locationId: painel })!;
    expect(back).toMatchObject({ locationIds: plan.locationIds, blockIds: plan.blockIds, equipmentIds: plan.equipmentIds, counts: { paineis: 0, colunas: 2, sheets: 3, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 } });
    const restore = batchOf(relatorioId, projectId, 'put', back, '2026-10-13T15:05:00.000Z');
    const restored = await pushOk(companyA, restore);
    expect(restored.rejected).toEqual([]);
    expect(restored.applied.map((a) => a.op_id)).toEqual(restore.map((o) => o.op_id));
    pushed(restore);

    for (const [entity, id] of tombstoned) {
      const record = await stored(entity, id);
      expect(record?.row, `${entity} ${id}`).toMatchObject({ removed_at: null });
      expect(record?.removed_at, `${entity} ${id}`).toBeNull();
    }
    const again = replay(log);
    for (const [entity, id] of [...tombstoned, ...kept]) {
      expect(canonicalJson((await stored(entity, id))!.row as never), `${entity} ${id}`).toBe(canonicalJson(again.get(entityKey(entity as never, id)) as never));
    }
    const restoredSnapshot = await snapshotsAgree();
    expect(serializeSnapshot(restoredSnapshot)).toBe(serializeSnapshot(before));
    expect(progress(restoredSnapshot).sheets_total).toBe(5);
    expect(await sheetsInSummary(relatorioId)).toBe(5);
  });

  it('a sheet another device moves into, and one it creates in, a removed coluna are accepted and stay out of the server snapshot, as in the kernel replay', async () => {
    const projectId = newId();
    const relatorioId = newId();
    const [local, painel, coluna, outra] = [newId(), newId(), newId(), newId()];
    const equipment = { inside: newId(), mover: newId(), fica: newId(), nova: newId() };
    const sheets = { inside: newId(), mover: newId(), fica: newId(), nova: newId() };
    for (const id of Object.values(equipment)) written.entityIds.add(id);
    const created = [
      projectCreate(idsA, projectId),
      relatorioCreate(idsA, relatorioId, projectId),
      locationCreate(relatorioId, local, 'cabine', null, 'Subestação', 'a0'),
      locationCreate(relatorioId, painel, 'painel', local, 'Painel 1', 'a0'),
      locationCreate(relatorioId, coluna, 'coluna', painel, 'Coluna 1', 'a0'),
      locationCreate(relatorioId, outra, 'coluna', local, 'Coluna 9', 'a1'),
      equipmentWith(projectId, equipment.inside, 'SEC-C01'),
      equipmentWith(projectId, equipment.mover, 'SEC-C09'),
      equipmentWith(projectId, equipment.fica, 'SEC-C09-2'),
      sheetAt(relatorioId, sheets.inside, coluna, equipment.inside, 'a0'),
      sheetAt(relatorioId, sheets.mover, outra, equipment.mover, 'a0'),
      sheetAt(relatorioId, sheets.fica, outra, equipment.fica, 'a1'),
    ];
    expect((await pushOk(companyA, created)).rejected).toEqual([]);
    const log: Op[] = created.map((o, i) => ({ ...o, seq: i + 1 }));
    const pushed = (batch: Op[]) => log.push(...batch.map((o, i) => ({ ...o, seq: log.length + i + 1 })));

    // The painel leaves with its coluna and the sheet on it, planned by the kernel.
    const visibility = { companyDownloaded: true, summaries: [], heldRelatorioIds: [], downloadedStreamIds: [] };
    const held = rowsIn(replay(log));
    const plan = locationRemovalPlan({ locations: held.locations, blocks: held.blocks, otherBlocks: [], locationId: painel, projectId, relatorioId, visibility })!;
    expect(plan).toMatchObject({ locationIds: [painel, coluna], blockIds: [sheets.inside], equipmentIds: [equipment.inside] });
    const removal = batchOf(relatorioId, projectId, 'remove', plan, '2026-10-13T16:00:00.000Z');
    expect((await pushOk(companyA, removal)).rejected).toEqual([]);
    pushed(removal);

    // Another device, which has not pulled the removal: it moves a live sheet into the coluna and creates one there.
    const tablet: Ids = { ...idsA, device: `${DEVICE_A}-outro` };
    const move = op(tablet, { ...scoped(relatorioId), kind: 'put', path: `block/${sheets.mover}/location_id`, value: coluna });
    const novoEquipamento = equipmentCreate(tablet, equipment.nova, projectId);
    const novaBase = blockCreate(tablet, relatorioId, sheets.nova, 'chave_seccionadora');
    const late = [
      move,
      { ...novoEquipamento, value: { ...(novoEquipamento.value as Record<string, unknown>), tag: 'SEC-C01-2', type: 'chave_seccionadora' } as Op['value'] },
      { ...novaBase, value: { ...(novaBase.value as Record<string, unknown>), location_id: coluna, equipment_id: equipment.nova, order_key: 'a1' } as Op['value'] },
    ];
    const result = await pushOk(companyA, late);
    expect(result.rejected).toEqual([]);
    expect(result.applied.map((a) => a.op_id)).toEqual(late.map((o) => o.op_id));
    pushed(late);

    // Both rows are stored live on the removed coluna: no tombstone of their own hides them.
    for (const id of [sheets.mover, sheets.nova]) expect((await stored('block', id))?.row, id).toMatchObject({ location_id: coluna, removed_at: null });
    expect((await stored('location', coluna))?.row).toMatchObject({ removed_at: '2026-10-13T16:00:00.000Z' });

    // The server snapshot reads the removed location rows, so the kernel's one liveness rule drops both sheets.
    const kernel = buildSnapshot(replay(log), relatorioId);
    const server = await toSnapshot(db, asCompanyId(companyA.companyId), relatorioId);
    expect(server.blocks.map((row) => row.id)).toEqual([sheets.fica]);
    expect(server.blocks.some((row) => row.id === sheets.mover || row.id === sheets.nova)).toBe(false);
    expect(server.locations.map((row) => row.id).sort()).toEqual([local, outra].sort());
    expect(serializeSnapshot({ ...server, empresa: null })).toBe(serializeSnapshot({ ...kernel, empresa: null }));
  });
});
