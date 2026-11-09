import {
  CONTRACT_VERSION,
  derivedPoints,
  lastResults,
  makeOp,
  MIN_CONTRACT_VERSION,
  SERVER_DEVICE_ID,
  sheetNameplatePath,
  sheetTestCellPath,
  syncPushResponseSchema,
  type EquipmentRow,
  type Op,
  type PointRow,
} from '@app/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { newId } from '../ids.ts';
import { companyA, companyB, routeHarness, type Company, type SeededRelatorio } from './rules.test-support.ts';
import { toSnapshot } from './snapshot.ts';

/*
 * Batch e23v (Stories 23.5, 23.6 and 23.14; contract 36) through `POST /api/sync/ops`: a point
 * written from a restricted test's derived entry (`origin: 'restricao'` with its `test_key`) is
 * accepted and replaces that entry, an origin the contract does not know is refused, and a
 * version-35 bundle's pull is answered 426; the issue's `last_results` projection (AD-25, the put the
 * generate job writes in the revision's batch, applied here as the server writes it) keeps a v13
 * corrected reading's value at 20 °C and none of a v12 reading, and another company never reads it.
 * Values invented.
 */

const h = routeHarness('tablet-e23v');

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' });

/** The server's snapshot of a relatório of `company`, as the generate job freezes it. */
const snapshotOf = (company: Company, relatorioId: string) => toSnapshot(h.db, asCompanyId(company.companyId), relatorioId);

function pointValue(id: string, relatorioId: string, equipmentId: string, origin: string, text: string): PointRow {
  return { id, relatorio_id: relatorioId, text, equipment_id: equipmentId, origin: origin as PointRow['origin'], order_key: 'a0', removed_at: null, action: null, priority: null, deadline: null, owner: null, item_key: null, test_key: 'isolacao' };
}

/** The `equipment/{id}/last_results` puts the generate job writes for revision 1 of `seeded`, applied as the server applies them. */
async function project(company: Company, seeded: SeededRelatorio): Promise<Op[]> {
  const snapshot = await snapshotOf(company, seeded.relatorioId);
  const at = new Date();
  const puts = lastResults(snapshot, { revisionNumber: 1, issuedAt: at.toISOString() }).map((entry) =>
    makeOp(
      {
        kind: 'put',
        scope: 'project',
        company_id: company.companyId,
        project_id: seeded.projectId,
        relatorio_id: null,
        path: `equipment/${entry.equipmentId}/last_results`,
        value: entry.value as never,
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: 'system:generate',
        device_id: SERVER_DEVICE_ID,
      },
      { newId, now: at },
    ),
  );
  await h.serverApply(company, puts);
  return puts;
}

describe('23.6-INT a point written from a restricted test through the route (contract 36)', () => {
  it('a create with origin restricao and its test_key is accepted and replaces the derived entry; an origin the contract does not know is refused', async () => {
    const seeded = await h.seedRelatorio(companyA);
    const cable = seeded.blocks.find((block) => block.blockType === 'cabos_entrada')!;
    const relatorio_id = seeded.relatorioId;
    const reading = (row: number, raw: string) => h.clientOp(companyA, { kind: 'put', path: sheetTestCellPath(cable.id, 'isolacao', row, 1), relatorio_id, value: measured(raw, 'GΩ') });
    expect((await h.push(companyA, [reading(0, '5'), reading(1, '5'), reading(2, '1.5')])).rejected).toEqual([]);

    const key = `restricao:${cable.id}:isolacao`;
    const entry = derivedPoints(await snapshotOf(companyA, relatorio_id)).find((one) => one.key === key)!;
    expect(entry).toMatchObject({ kind: 'restricao', test_key: 'isolacao', equipment_id: cable.equipmentId, text: 'Ensaio de isolação: valor dentro do critério, com restrição (Fase C: abaixo de 50 % da maior leitura)' });

    const pointId = newId();
    const unknownId = newId();
    const create = (id: string, origin: string) => h.clientOp(companyA, { kind: 'create', path: `point/${id}`, relatorio_id, value: pointValue(id, relatorio_id, cable.equipmentId, origin, entry.text) });
    const point = create(pointId, 'restricao');
    // `makeOp` refuses an origin the contract does not know, so a hand-built op carries one, as an outdated or broken device would send it.
    const shaped = create(unknownId, 'restricao');
    const unknown = { ...shaped, value: { ...(shaped.value as Record<string, unknown>), origin: 'restrito' } };
    h.track([point]);
    const res = await h.pushRaw(companyA, { ops: [point, unknown] });
    expect(res.status, await res.clone().text()).toBe(200);
    const result = syncPushResponseSchema.parse(await res.json());
    expect(result.applied.map((applied) => applied.op_id)).toEqual([point.op_id]);
    expect(result.rejected).toEqual([{ op_id: unknown.op_id, code: 'op_invalid' }]);
    expect(await h.rowOf<PointRow>(companyA, 'point', pointId)).toMatchObject({ origin: 'restricao', test_key: 'isolacao', equipment_id: cable.equipmentId });
    expect(await h.rowOf<PointRow>(companyA, 'point', unknownId)).toBeUndefined();
    // The stored point replaces the entry it was written from.
    expect(derivedPoints(await snapshotOf(companyA, relatorio_id)).some((one) => one.key === key)).toBe(false);
  });

  it('speaks contract 36: a version-35 pull is answered 426 contract_outdated, the current one is answered', async () => {
    expect(CONTRACT_VERSION).toBe(36);
    expect(MIN_CONTRACT_VERSION).toBe(36);
    for (const path of ['/api/sync/company?since=0', `/api/sync/relatorios/${newId()}?since=0`, `/api/sync/projects/${newId()}?since=0`]) {
      const old = await h.authed(companyA, path, { headers: { 'x-contract-version': '35' } });
      expect(old.status, path).toBe(426);
      expect(((await old.json()) as { code?: string }).code).toBe('contract_outdated');
    }
    const current = await h.authed(companyA, '/api/sync/company?since=0', { headers: { 'x-contract-version': '36' } });
    expect(current.status).toBe(200);
  });
});

describe('23.6-INT the issue\'s last_results keeps the corrected value (AD-25, contract 36)', () => {
  it('a v13 transformer at 40 °C of oil keeps its AT reading corrected to 20 °C; a v12 transformer\'s reading carries none; company B never reads either', async () => {
    const v13 = await h.seedRelatorio(companyA);
    const tf13 = v13.blocks.find((block) => block.blockType === 'transformador_forca')!;
    const plate = (seeded: SeededRelatorio, blockId: string, key: string, value: unknown) => h.clientOp(companyA, { kind: 'put', path: sheetNameplatePath(blockId, key), relatorio_id: seeded.relatorioId, value });
    const at = (seeded: SeededRelatorio, blockId: string, raw: string) => h.clientOp(companyA, { kind: 'put', path: sheetTestCellPath(blockId, 'isolacao', 0, 1), relatorio_id: seeded.relatorioId, value: measured(raw, 'GΩ') });
    expect(
      (await h.push(companyA, [plate(v13, tf13.id, 'tipo_de_isolacao', 'ÓLEO MINERAL'), plate(v13, tf13.id, 'temperatura_oleo_c', measured('40', '°C')), at(v13, tf13.id, '2')])).rejected,
    ).toEqual([]);
    const puts13 = await project(companyA, v13);
    const row13 = await h.rowOf<EquipmentRow>(companyA, 'equipment', tf13.equipmentId);
    expect(row13!.last_results).toMatchObject({ relatorio_id: v13.relatorioId, seed_version: 'v13', block_type: 'transformador_forca' });
    expect(Object.values(row13!.last_results!.readings)).toEqual([{ raw: '2', unit: 'GΩ', state: 'measured', corrected: { raw: '8', unit: 'GΩ' } }]);
    expect(puts13.find((op) => op.path === `equipment/${tf13.equipmentId}/last_results`)).toBeDefined();

    const v12 = await h.seedRelatorio(companyA, new Date(), 'v12');
    const tf12 = v12.blocks.find((block) => block.blockType === 'transformador_forca')!;
    expect((await h.push(companyA, [plate(v12, tf12.id, 'tipo_de_isolacao', 'ÓLEO MINERAL'), at(v12, tf12.id, '2')])).rejected).toEqual([]);
    await project(companyA, v12);
    const row12 = await h.rowOf<EquipmentRow>(companyA, 'equipment', tf12.equipmentId);
    expect(row12!.last_results).toMatchObject({ relatorio_id: v12.relatorioId, seed_version: 'v12' });
    expect(Object.values(row12!.last_results!.readings)).toEqual([{ raw: '2', unit: 'GΩ', state: 'measured' }]);

    // The projection lives on the obra's stream: company A pulls it with the value; company B's pull of the obra is refused,
    // and its own company stream never holds a last_results put.
    const pull = await h.authed(companyA, `/api/sync/projects/${v13.projectId}?since=0`);
    expect(pull.status, await pull.clone().text()).toBe(200);
    const projected = ((await pull.json()) as { ops: Op[] }).ops.find((op) => op.path === `equipment/${tf13.equipmentId}/last_results`)!;
    expect(Object.values((projected.value as { readings: Record<string, unknown> }).readings)).toEqual([{ raw: '2', unit: 'GΩ', state: 'measured', corrected: { raw: '8', unit: 'GΩ' } }]);
    expect((await h.authed(companyB, `/api/sync/projects/${v13.projectId}?since=0`)).status).toBe(404);
    expect(await h.rowOf<EquipmentRow>(companyB, 'equipment', tf13.equipmentId)).toBeUndefined();
    const own = await h.authed(companyB, '/api/sync/company?since=0');
    expect(((await own.json()) as { ops: Op[] }).ops.some((op) => op.path.endsWith('/last_results'))).toBe(false);
  });
});
