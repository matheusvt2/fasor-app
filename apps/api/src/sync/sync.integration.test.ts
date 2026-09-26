import {
  accountResponseSchema,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  errorResponseSchema,
  makeOp,
  syncPullResponseSchema,
  syncPushResponseSchema,
  userRowSchema,
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
