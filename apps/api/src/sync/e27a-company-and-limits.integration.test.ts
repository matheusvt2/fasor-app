import { CONTRACT_VERSION, defaultEmpresaRow, locationEnvPath, makeOp, type Op } from '@app/domain';
import { and, eq, inArray, isNull, sql as drizzleSql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { now } from '../clock.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { portoSeguro } from '@app/domain/fixtures/porto-seguro';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { sampleRelatorioIds, sampleRelatorioLog, seedSampleRelatorio } from '../db/sample-relatorio.ts';
import { entities, ops } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { applyOps } from './apply.ts';
import { companyA, routeHarness, type Company } from './rules.test-support.ts';

/*
 * Stories 27.1 and 27.2 (contract 56, batch e27a). Every client push goes through
 * `POST /api/sync/ops` with a session of Empresa A's user (`routeHarness`).
 */

const h = routeHarness('tablet-e27a');
/** Throwaway companies (no user, no session) the script tests write into; dropped in `afterAll`. */
const throwaway: string[] = [];

beforeAll(() => h.setup(), 60_000);
afterAll(async () => {
  for (const id of throwaway) {
    await h.db.delete(ops).where(eq(ops.company_id, id));
    await h.db.delete(entities).where(eq(entities.company_id, id));
  }
  await h.cleanup();
});

/** The live `empresa` registry rows of a company, by id. */
async function liveEmpresaIds(companyId: string): Promise<string[]> {
  const rows = await h.db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'registry'), isNull(entities.removed_at), drizzleSql`${entities.row}->>'kind' = 'empresa'`));
  return rows.map((row) => row.id).sort();
}

/** An `empresa` create of `company`'s user (client) for row `id`. */
function empresaCreate(company: Company, id: string, name: string): Op {
  return h.clientOp(company, { kind: 'create', scope: 'company', path: `registry/empresa/${id}`, value: { ...defaultEmpresaRow(id), name } });
}

describe('27.1-API-001 the server refuses a second live empresa row', () => {
  it('a company holding A refuses the create of B (op_forbidden); A is unchanged, a put on A and a re-sent create of A still apply', async () => {
    expect(await liveEmpresaIds(companyA.companyId), 'Empresa A holds no empresa row before the test').toEqual([]);
    const a = newId();
    const b = newId();
    const createA = empresaCreate(companyA, a, 'Empresa Primeira');
    expect((await h.push(companyA, [createA])).rejected).toEqual([]);

    const createB = empresaCreate(companyA, b, 'Empresa Segunda');
    const refused = await h.push(companyA, [createB]);
    expect(refused.rejected).toEqual([{ op_id: createB.op_id, code: 'op_forbidden' }]);
    expect(await h.logged(createB.op_id)).toBe(false);
    expect(await h.rowOf(companyA, 'registry', b)).toBeUndefined();
    expect(await h.rowOf(companyA, 'registry', a)).toMatchObject({ id: a, name: 'Empresa Primeira', form_revision: 'Revisão 01' });

    const rename = h.clientOp(companyA, { kind: 'put', scope: 'company', path: `registry/empresa/${a}/name`, value: 'Empresa Primeira S.A.' });
    expect((await h.push(companyA, [rename])).rejected).toEqual([]);
    expect((await h.push(companyA, [createA])).rejected).toEqual([]);
    expect(await h.rowOf(companyA, 'registry', a)).toMatchObject({ name: 'Empresa Primeira S.A.' });
    expect(await liveEmpresaIds(companyA.companyId)).toEqual([a]);

    // The row is the test's alone: the next suites on Empresa A start with none.
    await h.db.delete(entities).where(and(eq(entities.company_id, companyA.companyId), inArray(entities.id, [a, b])));
  });

  it('two creates in one push: the first applies, the second is refused alone', async () => {
    const a = newId();
    const b = newId();
    const first = empresaCreate(companyA, a, 'Empresa Uma');
    const second = empresaCreate(companyA, b, 'Empresa Duas');
    const result = await h.push(companyA, [first, second]);
    expect(result.applied.map((x) => x.op_id)).toEqual([first.op_id]);
    expect(result.rejected).toEqual([{ op_id: second.op_id, code: 'op_forbidden' }]);
    expect(await liveEmpresaIds(companyA.companyId)).toEqual([a]);
    await h.db.delete(entities).where(and(eq(entities.company_id, companyA.companyId), inArray(entities.id, [a, b])));
  });

  it('e27a-review R5: a client op can restore a removed empresa row (a put of null on its removed_at); while another live one exists the restore is refused op_forbidden, and the restore of the only row still applies', async () => {
    expect(await liveEmpresaIds(companyA.companyId), 'Empresa A holds no empresa row before the test').toEqual([]);
    const a = newId();
    const b = newId();
    const removedAt = (id: string) => h.clientOp(companyA, { kind: 'remove', scope: 'company', path: `registry/empresa/${id}/removed_at`, value: null });
    const restore = (id: string) => h.clientOp(companyA, { kind: 'put', scope: 'company', path: `registry/empresa/${id}/removed_at`, value: null });
    // B is created, then removed: the company holds no live row, so A's create applies.
    expect((await h.push(companyA, [empresaCreate(companyA, b, 'Empresa Removida')])).rejected).toEqual([]);
    expect((await h.push(companyA, [removedAt(b)])).rejected).toEqual([]);
    expect(await liveEmpresaIds(companyA.companyId)).toEqual([]);
    expect((await h.push(companyA, [empresaCreate(companyA, a, 'Empresa Viva')])).rejected).toEqual([]);
    expect(await liveEmpresaIds(companyA.companyId)).toEqual([a]);

    // The path exists: a put of null on B's removed_at is the restore the registry panels' "Desfazer" writes. While A is live it is refused.
    const revive = restore(b);
    expect((await h.push(companyA, [revive])).rejected).toEqual([{ op_id: revive.op_id, code: 'op_forbidden' }]);
    expect(await h.logged(revive.op_id)).toBe(false);
    expect(await liveEmpresaIds(companyA.companyId)).toEqual([a]);
    expect((await h.rowOf<{ removed_at: string | null }>(companyA, 'registry', b))?.removed_at).not.toBeNull();

    // With A removed, B is the company's only row: its restore applies.
    expect((await h.push(companyA, [removedAt(a)])).rejected).toEqual([]);
    const only = restore(b);
    expect((await h.push(companyA, [only])).rejected).toEqual([]);
    expect(await liveEmpresaIds(companyA.companyId)).toEqual([b]);
    await h.db.delete(entities).where(and(eq(entities.company_id, companyA.companyId), inArray(entities.id, [a, b])));
  });
});

describe('27.1-API-002 the scripts of Task 1, on a company that already has an empresa row', () => {
  it('seedSampleRelatorio (seed-users.ts --sample-relatorio), run twice: one live empresa row, and every row of the company has its op', async () => {
    const companyId = newId();
    throwaway.push(companyId);
    const empresaId = newId();
    const create = makeOp(
      { kind: 'create', scope: 'company', company_id: companyId, project_id: null, relatorio_id: null, path: `registry/empresa/${empresaId}`, value: { ...defaultEmpresaRow(empresaId), name: 'Empresa do Cadastro' }, prev_op_id: null, batch_id: null, meta: null, actor_id: 'user-e27a', device_id: 'tablet-e27a' },
      { newId, now: new Date() },
    );
    expect((await applyOps(h.db, asCompanyId(companyId), [create], { now, origin: 'server' })).rejected).toEqual([]);

    await seedSampleRelatorio(h.db, companyId);
    await seedSampleRelatorio(h.db, companyId);
    expect(sampleRelatorioIds(companyId).relatorioId).toBeTruthy();

    expect(await liveEmpresaIds(companyId)).toEqual([empresaId]);
    const rows = await h.db.select({ entity: entities.entity, id: entities.id }).from(entities).where(eq(entities.company_id, companyId));
    const paths = (await h.db.select({ path: ops.path }).from(ops).where(eq(ops.company_id, companyId))).map((row) => row.path);
    expect(rows.length).toBeGreaterThan(1);
    const orphans = rows.filter((row) => !paths.some((path) => path.split('/').includes(row.id)));
    expect(orphans, 'entity rows with no op naming them').toEqual([]);
  });

  it('27.1-API-003 the Porto Seguro replay test\'s reclaim (`porto-seguro.integration.test.ts` beforeAll, ops deleted by the fixtures\' fixed op ids in any company) cannot reach a company the sample relatório was seeded into: its op ids are derived per company and meet neither fixture\'s', () => {
    const fixed = new Set([...portoSeguro.log, ...portoSeguroSmall.log].map((op) => op.op_id));
    for (const companyId of [newId(), newId()]) {
      const sampleOps = sampleRelatorioLog(companyId).map((op) => op.op_id);
      expect(sampleOps.length).toBeGreaterThan(0);
      expect(sampleOps.filter((id) => fixed.has(id))).toEqual([]);
    }
  });
});

describe('27.2-API-001 the new limits on the server', () => {
  const env = (relatorioId: string, cabineId: string, field: string, raw: string, unit: string, batchId?: string) =>
    h.clientOp(companyA, { kind: 'put', path: locationEnvPath(cabineId, field), relatorio_id: relatorioId, value: { raw, unit, state: 'measured' }, ...(batchId === undefined ? {} : { batch_id: batchId }) });
  type CabineLike = { env: { humidity_pct: unknown; temperature_c: unknown } };

  it('a humidity of 150 % is refused op_value_invalid by the fold and never logged; 0 and 100 apply; a temperature of 999 °C applies', async () => {
    const { relatorioId, locationId } = await h.seedRelatorio(companyA);
    const over = env(relatorioId, locationId, 'humidity_pct', '150', '%');
    const below = env(relatorioId, locationId, 'humidity_pct', '-0.1', '%');
    const result = await h.push(companyA, [over, below]);
    expect(result.rejected).toEqual([
      { op_id: over.op_id, code: 'op_value_invalid' },
      { op_id: below.op_id, code: 'op_value_invalid' },
    ]);
    expect(await h.logged(over.op_id)).toBe(false);
    expect((await h.rowOf<CabineLike>(companyA, 'location', locationId))?.env.humidity_pct).toBeNull();

    for (const raw of ['0', '100']) expect((await h.push(companyA, [env(relatorioId, locationId, 'humidity_pct', raw, '%')])).rejected, raw).toEqual([]);
    expect((await h.rowOf<CabineLike>(companyA, 'location', locationId))?.env.humidity_pct).toEqual({ raw: '100', unit: '%', state: 'measured' });
    // Improbable, not impossible: remarked on the device, stored here.
    expect((await h.push(companyA, [env(relatorioId, locationId, 'temperature_c', '999', '°C')])).rejected).toEqual([]);
    expect((await h.rowOf<CabineLike>(companyA, 'location', locationId))?.env.temperature_c).toEqual({ raw: '999', unit: '°C', state: 'measured' });
  });

  it('an op an older device queued with 150 % lands in its rejected list alone; the rest of its batch applies', async () => {
    const { relatorioId, locationId } = await h.seedRelatorio(companyA);
    const batchId = newId();
    const temperature = env(relatorioId, locationId, 'temperature_c', '22', '°C', batchId);
    const queued = env(relatorioId, locationId, 'humidity_pct', '150', '%', batchId);
    h.track([temperature, queued]);
    const res = await h.authed(companyA, '/api/sync/ops', { method: 'POST', body: JSON.stringify({ ops: [temperature, queued] }), headers: { 'x-contract-version': '55' } });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as { applied: { op_id: string }[]; rejected: { op_id: string; code: string }[] };
    expect(body.applied.map((x) => x.op_id)).toEqual([temperature.op_id]);
    expect(body.rejected).toEqual([{ op_id: queued.op_id, code: 'op_value_invalid' }]);
  });

  it('contract 56: a version-55 pull is answered 426 contract_outdated; the current one is answered', async () => {
    // Batch e27b (seed v17) moved the contract to 57: 55 stays refused.
    expect(CONTRACT_VERSION).toBeGreaterThanOrEqual(56);
    const pull = (contract: string) => h.authed(companyA, '/api/sync/company?since=0', { headers: { 'x-contract-version': contract } });
    const old = await pull('55');
    expect(old.status).toBe(426);
    expect(((await old.json()) as { code?: string }).code).toBe('contract_outdated');
    expect((await pull(String(CONTRACT_VERSION))).status).toBe(200);
  });
});
