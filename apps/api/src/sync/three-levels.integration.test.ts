import {
  CONTRACT_VERSION,
  hasPointSource,
  lastResults,
  sectionEightEntries,
  makeOp,
  MIN_CONTRACT_VERSION,
  previousResultsFor,
  SERVER_DEVICE_ID,
  sheetNameplatePath,
  sheetTestCellPath,
  syncPushResponseSchema,
  type EquipmentRow,
  type Op,
  type PointRow,
} from '@app/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { liveRevisions } from '../db/repositories/revisions.ts';
import { entities } from '../db/schema.ts';
import { firstIssuedAtOf } from '../jobs/generate/job.ts';
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

/**
 * The `equipment/{id}/last_results` puts the generate job writes for revision `revisionNumber` of `seeded` (1 by
 * default), applied as the server applies them. Fix batch e23w (W2-1): the first issue instant is read as the job
 * reads it (`firstIssuedAtOf` over the relatório's live revisions).
 */
async function project(company: Company, seeded: SeededRelatorio, revisionNumber = 1): Promise<Op[]> {
  const snapshot = await snapshotOf(company, seeded.relatorioId);
  const at = new Date();
  const firstIssuedAt = firstIssuedAtOf(revisionNumber > 1 ? await liveRevisions(h.db, asCompanyId(company.companyId), seeded.relatorioId) : [], at.toISOString());
  const puts = lastResults(snapshot, { revisionNumber, issuedAt: at.toISOString(), firstIssuedAt }).map((entry) =>
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
  // Fix batch e24h: ~~and replaces the derived entry~~; the restricted test lists nothing until the point is written.
  it('a create with origin restricao and its test_key is accepted and is the one section 8 entry; an origin the contract does not know is refused', async () => {
    const seeded = await h.seedRelatorio(companyA);
    const cable = seeded.blocks.find((block) => block.blockType === 'cabos_entrada')!;
    const relatorio_id = seeded.relatorioId;
    const reading = (row: number, raw: string) => h.clientOp(companyA, { kind: 'put', path: sheetTestCellPath(cable.id, 'isolacao', row, 1), relatorio_id, value: measured(raw, 'GΩ') });
    expect((await h.push(companyA, [reading(0, '5'), reading(1, '5'), reading(2, '1.5')])).rejected).toEqual([]);

    const before = await snapshotOf(companyA, relatorio_id);
    expect(hasPointSource(before)).toBe(true);
    expect(sectionEightEntries(before)).toEqual([]);
    const entry = { text: 'Ensaio de isolação: valor dentro do critério, com restrição (Fase C: abaixo de 50 % da maior leitura)' };

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
    // The stored point is the one entry.
    expect(sectionEightEntries(await snapshotOf(companyA, relatorio_id)).map((one) => one.point.id)).toEqual([pointId]);
  });

  // Batch e23h (contract 37): the version-35 refusal stands; the current pull speaks the current number.
  it('speaks contract 36 or later: a version-35 pull is answered 426 contract_outdated, the current one is answered', async () => {
    expect(CONTRACT_VERSION).toBeGreaterThanOrEqual(36);
    expect(MIN_CONTRACT_VERSION).toBeGreaterThanOrEqual(36);
    for (const path of ['/api/sync/company?since=0', `/api/sync/relatorios/${newId()}?since=0`, `/api/sync/projects/${newId()}?since=0`]) {
      const old = await h.authed(companyA, path, { headers: { 'x-contract-version': '35' } });
      expect(old.status, path).toBe(426);
      expect(((await old.json()) as { code?: string }).code).toBe('contract_outdated');
    }
    const current = await h.authed(companyA, '/api/sync/company?since=0', { headers: { 'x-contract-version': String(CONTRACT_VERSION) } });
    expect(current.status).toBe(200);
  });
});

describe('23.6-INT the issue\'s last_results keeps the corrected value (AD-25, contract 36)', () => {
  it('a v13 transformer at 40 °C of oil keeps its AT reading corrected to 20 °C; a v12 transformer\'s reading carries none; company B never reads either', async () => {
    const v13 = await h.seedRelatorio(companyA, new Date(), 'v13'); // Pinned to v13 since seed v14 (Story 24.2).
    const tf13 = v13.blocks.find((block) => block.blockType === 'transformador_forca')!;
    const plate = (seeded: SeededRelatorio, blockId: string, key: string, value: unknown) => h.clientOp(companyA, { kind: 'put', path: sheetNameplatePath(blockId, key), relatorio_id: seeded.relatorioId, value });
    const at = (seeded: SeededRelatorio, blockId: string, raw: string) => h.clientOp(companyA, { kind: 'put', path: sheetTestCellPath(blockId, 'isolacao', 0, 1), relatorio_id: seeded.relatorioId, value: measured(raw, 'GΩ') });
    expect(
      (await h.push(companyA, [plate(v13, tf13.id, 'tipo_de_isolacao', 'ÓLEO ISOLANTE'), plate(v13, tf13.id, 'temperatura_oleo_c', measured('40', '°C')), at(v13, tf13.id, '2')])).rejected,
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

describe('e23w-INT W2-1 a re-issue never takes a later visit\'s place in last_results (AD-25 order rule)', () => {
  it('A issued, then B of the same obra issued over it, then A re-issued: B stays on top with prior A\'s re-issue, and A reads no previous visit', async () => {
    const a = await h.seedRelatorio(companyA);
    const tfA = a.blocks.find((block) => block.blockType === 'transformador_forca')!;
    const reading = (seeded: SeededRelatorio, blockId: string, raw: string) =>
      h.clientOp(companyA, { kind: 'put', path: sheetTestCellPath(blockId, 'isolacao', 0, 1), relatorio_id: seeded.relatorioId, value: measured(raw, 'GΩ') });
    expect((await h.push(companyA, [reading(a, tfA.id, '5')])).rejected).toEqual([]);
    await h.cutRevision(companyA, a.relatorioId, 1);
    await project(companyA, a);

    const equipment = await h.db
      .select({ row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'equipment'), eq(entities.project_id, a.projectId)));
    const b = await h.seedRelatorio(companyA, new Date(), undefined, { projectId: a.projectId, existingEquipment: equipment.map((one) => one.row as EquipmentRow) });
    const tfB = b.blocks.find((block) => block.blockType === 'transformador_forca')!;
    expect(tfB.equipmentId).toBe(tfA.equipmentId);
    expect((await h.push(companyA, [reading(b, tfB.id, '4')])).rejected).toEqual([]);
    await h.cutRevision(companyA, b.relatorioId, 1);
    await project(companyA, b);
    expect((await h.rowOf<EquipmentRow>(companyA, 'equipment', tfA.equipmentId))!.last_results).toMatchObject({ relatorio_id: b.relatorioId, prior: { relatorio_id: a.relatorioId, revision_number: 1 } });

    // A re-issued (revision 2) with a new reading: B keeps the top, its prior is A's revision 2.
    expect((await h.push(companyA, [reading(a, tfA.id, '6')])).rejected).toEqual([]);
    await h.cutRevision(companyA, a.relatorioId, 2);
    await project(companyA, a, 2);
    const top = (await h.rowOf<EquipmentRow>(companyA, 'equipment', tfA.equipmentId))!.last_results!;
    expect(top).toMatchObject({ relatorio_id: b.relatorioId, revision_number: 1 });
    expect(Object.values(top.readings)).toEqual([{ raw: '4', unit: 'GΩ', state: 'measured' }]);
    expect(top.prior).toMatchObject({ relatorio_id: a.relatorioId, revision_number: 2 });
    expect(Object.values(top.prior!.readings)).toEqual([{ raw: '6', unit: 'GΩ', state: 'measured' }]);
    expect((top.prior as Record<string, unknown>).prior).toBeUndefined();
    // A's sheet reads no previous visit (never B, a later one).
    const snapshot = await snapshotOf(companyA, a.relatorioId);
    const block = snapshot.blocks.find((one) => one.id === tfA.id)!;
    expect(previousResultsFor(snapshot.equipment.find((one) => one.id === tfA.equipmentId), block, a.relatorioId)).toBeNull();
  });

  it('A issued, then B over it and C over B: A re-issued (revision 2) writes nothing, C stays on top (a later visit unrelated to A by its chain)', async () => {
    const a = await h.seedRelatorio(companyA);
    const tfA = a.blocks.find((block) => block.blockType === 'transformador_forca')!;
    const reading = (seeded: SeededRelatorio, blockId: string, raw: string) =>
      h.clientOp(companyA, { kind: 'put', path: sheetTestCellPath(blockId, 'isolacao', 0, 1), relatorio_id: seeded.relatorioId, value: measured(raw, 'GΩ') });
    expect((await h.push(companyA, [reading(a, tfA.id, '5')])).rejected).toEqual([]);
    await h.cutRevision(companyA, a.relatorioId, 1);
    await project(companyA, a);
    const equipment = async () =>
      (
        await h.db
          .select({ row: entities.row })
          .from(entities)
          .where(and(eq(entities.company_id, companyA.companyId), eq(entities.entity, 'equipment'), eq(entities.project_id, a.projectId)))
      ).map((one) => one.row as EquipmentRow);
    // B over A, then C over B: C's prior is B, so C is unrelated to A by its chain.
    for (const raw of ['4', '3']) {
      const later = await h.seedRelatorio(companyA, new Date(), undefined, { projectId: a.projectId, existingEquipment: await equipment() });
      const tf = later.blocks.find((block) => block.blockType === 'transformador_forca')!;
      expect((await h.push(companyA, [reading(later, tf.id, raw)])).rejected).toEqual([]);
      await h.cutRevision(companyA, later.relatorioId, 1);
      await project(companyA, later);
    }
    const before = (await h.rowOf<EquipmentRow>(companyA, 'equipment', tfA.equipmentId))!.last_results!;
    expect(Object.values(before.readings)).toEqual([{ raw: '3', unit: 'GΩ', state: 'measured' }]);
    expect(before.prior?.relatorio_id).not.toBe(a.relatorioId);

    // A re-issued: its first issue (revision 1) is before C's, so C is a later visit and A writes nothing for it.
    expect((await h.push(companyA, [reading(a, tfA.id, '6')])).rejected).toEqual([]);
    await h.cutRevision(companyA, a.relatorioId, 2);
    const puts = await project(companyA, a, 2);
    expect(puts.some((op) => op.path === `equipment/${tfA.equipmentId}/last_results`)).toBe(false);
    expect((await h.rowOf<EquipmentRow>(companyA, 'equipment', tfA.equipmentId))!.last_results).toEqual(before);
  });

  it('firstIssuedAtOf: the earliest live revision\'s created_at, else the issue instant', () => {
    const at = (iso: string) => ({ created_at: iso });
    expect(firstIssuedAtOf([at('2026-11-05T10:00:00.000Z'), at('2026-11-01T10:00:00.000Z'), at('2026-11-03T10:00:00.000Z')], '2026-11-09T10:00:00.000Z')).toBe('2026-11-01T10:00:00.000Z');
    expect(firstIssuedAtOf([], '2026-11-09T10:00:00.000Z')).toBe('2026-11-09T10:00:00.000Z');
  });
});
