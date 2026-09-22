import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  errorResponseSchema,
  makeOp,
  syncPullResponseSchema,
  syncPushResponseSchema,
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
    value: { id: clientId, kind: 'client', name: 'Cliente de Teste', cnpj: null, address: null, removed_at: null },
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

describe('1.5-API-005 contract skew', () => {
  it('answers 426 on pulls below the minimum or without the header, and still accepts the push', async () => {
    for (const path of ['/api/sync/company?since=0', `/api/sync/relatorios/${newId()}?since=0`]) {
      const res = await pull(companyA, path, '0');
      expect(res.status).toBe(426);
      expect(errorResponseSchema.parse(await res.json()).code).toBe('contract_outdated');
    }
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
