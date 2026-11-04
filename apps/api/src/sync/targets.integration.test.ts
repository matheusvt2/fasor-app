import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { entities, ops } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { companyA, companyB, routeHarness } from './rules.test-support.ts';

/*
 * Story 20.10 (contract 29, security pass S5): every op lands on a row that exists in the relatório
 * it names. Every push goes through `POST /api/sync/ops` with a session of the company's user. A
 * refused op is never logged, so no orphan op hides in a stream nobody pulls.
 */

const h = routeHarness('tablet-target-rules');

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

const statusOf = async (relatorioId: string) => (await h.rowOf<{ status: string }>(companyA, 'relatorio', relatorioId))?.status;

/** The ops the company's log holds under a relatório id (the orphans S5 found). */
async function loggedUnder(companyId: string, relatorioId: string): Promise<string[]> {
  const rows = await h.db
    .select({ op_id: ops.op_id })
    .from(ops)
    .where(and(eq(ops.company_id, companyId), eq(ops.relatorio_id, relatorioId)));
  return rows.map((row) => row.op_id);
}

describe('S5: a put on a row that does not exist in the relatório it names', () => {
  it('a put naming a relatório the company does not hold (another company\'s, or none) is refused; no orphan op is stored', async () => {
    const theirs = await h.seedRelatorio(companyB);
    const unknown = newId();
    const onTheirs = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/local', relatorio_id: theirs.relatorioId, value: 'Invasão' });
    const onNone = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/local', relatorio_id: unknown, value: 'Órfã' });
    const result = await h.push(companyA, [onTheirs, onNone]);
    expect(result.rejected).toEqual([
      { op_id: onTheirs.op_id, code: 'op_target_missing' },
      { op_id: onNone.op_id, code: 'op_target_missing' },
    ]);
    expect(await loggedUnder(companyA.companyId, theirs.relatorioId)).toEqual([]);
    expect(await loggedUnder(companyA.companyId, unknown)).toEqual([]);
    expect((await h.rowOf<{ setup: { local: string | null } }>(companyB, 'relatorio', theirs.relatorioId))?.setup.local).toBeNull();
  });

  it('a put on a block id that does not exist is refused', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const missing = h.clientOp(companyA, { kind: 'put', path: `sheet/${newId()}/observations`, relatorio_id: relatorioId, value: 'Nenhum bloco' });
    expect((await h.push(companyA, [missing])).rejected).toEqual([{ op_id: missing.op_id, code: 'op_target_missing' }]);
    expect(await h.logged(missing.op_id)).toBe(false);
  });

  it('a put on R1\'s block filed under R2 is refused; under R1 it applies', async () => {
    const r1 = await h.seedRelatorio(companyA);
    const r2 = await h.seedRelatorio(companyA);
    const block = r1.blocks[0]!.id;
    const misfiled = h.clientOp(companyA, { kind: 'put', path: `sheet/${block}/observations`, relatorio_id: r2.relatorioId, value: 'No relatório errado' });
    const filed = h.clientOp(companyA, { kind: 'put', path: `sheet/${block}/observations`, relatorio_id: r1.relatorioId, value: 'No relatório certo' });
    const result = await h.push(companyA, [misfiled, filed]);
    expect(result.rejected).toEqual([{ op_id: misfiled.op_id, code: 'op_target_missing' }]);
    expect(result.applied.map((a) => a.op_id)).toEqual([filed.op_id]);
    expect(await loggedUnder(companyA.companyId, r2.relatorioId)).not.toContain(misfiled.op_id);
  });

  it('a create filed under a relatório the company does not hold, and a relatório create filed under another relatório, are refused', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const pointId = newId();
    // The row names the envelope's relatório (opSchema checks that), which the company does not hold.
    const strayRelatorio = newId();
    const stray = h.clientOp(companyA, {
      kind: 'create',
      path: `point/${pointId}`,
      relatorio_id: strayRelatorio,
      value: { id: pointId, relatorio_id: strayRelatorio, text: 'x', equipment_id: null, origin: 'manual', order_key: 'a0', removed_at: null },
    });
    const otherId = newId();
    const misfiledRelatorio = h.clientOp(companyA, {
      kind: 'create',
      path: `relatorio/${otherId}`,
      relatorio_id: relatorioId,
      value: {
        id: otherId,
        project_id: newId(),
        template_id: null,
        template_version: null,
        seed_version: 'v1',
        status: 'rascunho',
        setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null },
        export: { scheme: 'por_local_e_tipo' },
        preview_file_id: null,
        removed_at: null,
      },
    });
    const result = await h.push(companyA, [stray, misfiledRelatorio]);
    expect(result.rejected).toEqual([
      { op_id: stray.op_id, code: 'op_target_missing' },
      { op_id: misfiledRelatorio.op_id, code: 'op_target_missing' },
    ]);
    expect(await h.rowOf(companyA, 'point', pointId)).toBeUndefined();
    expect(await h.rowOf(companyA, 'relatorio', otherId)).toBeUndefined();
  });
});

describe('what keeps applying', () => {
  it('in-batch creates: a local, an equipment, a block and its values created in one offline batch apply in order', async () => {
    const { relatorioId, projectId } = await h.seedRelatorio(companyA);
    const local = newId();
    const equipment = newId();
    const block = newId();
    const batchId = newId();
    const blankNumber = null;
    const batch = [
      h.clientOp(companyA, {
        kind: 'create',
        path: `location/${local}`,
        relatorio_id: relatorioId,
        batch_id: batchId,
        value: {
          id: local,
          relatorio_id: relatorioId,
          parent_id: null,
          kind: 'cabine',
          name: 'Cabine nova',
          order_key: 'z0',
          removed_at: null,
          se: { type: null, primary_kv: blankNumber, secondary_kv: blankNumber, installed_kva: blankNumber },
          env: { altitude_m: blankNumber, temperature_c: blankNumber, humidity_pct: blankNumber },
          agrupar_por_tipo: false,
        },
      }),
      h.clientOp(companyA, { kind: 'create', scope: 'project', project_id: projectId, path: `equipment/${equipment}`, batch_id: batchId, value: { id: equipment, project_id: projectId, tag: 'TR-NOVO', type: 'transformador_forca', last_nameplate: null, removed_at: null } }),
      h.clientOp(companyA, {
        kind: 'create',
        path: `block/${block}`,
        relatorio_id: relatorioId,
        batch_id: batchId,
        value: {
          id: block,
          relatorio_id: relatorioId,
          location_id: local,
          equipment_id: equipment,
          block_type: 'transformador_forca',
          config: { block_type: 'transformador_forca', sub_blocks: {}, na_defaults: [] },
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
      }),
      h.clientOp(companyA, { kind: 'put', path: `location/${local}/se/type`, relatorio_id: relatorioId, value: 'Abrigada', batch_id: batchId }),
      h.clientOp(companyA, { kind: 'put', path: `sheet/${block}/observations`, relatorio_id: relatorioId, value: 'Criado offline', batch_id: batchId }),
      h.clientOp(companyA, { kind: 'put', scope: 'project', project_id: projectId, path: `equipment/${equipment}/tag`, value: 'TR-NOVO-1', batch_id: batchId }),
    ];
    const result = await h.push(companyA, batch);
    expect(result.rejected).toEqual([]);
    expect(result.applied.map((a) => a.op_id)).toEqual(batch.map((op) => op.op_id));
    expect((await h.rowOf<{ sheet: { observations: { value: unknown } } }>(companyA, 'block', block))?.sheet.observations.value).toBe('Criado offline');
    expect((await h.rowOf<{ tag: string }>(companyA, 'equipment', equipment))?.tag).toBe('TR-NOVO-1');
  });

  it('a put on a tombstoned row still applies (LWW), and an equipment put filed under another obra is refused', async () => {
    const { relatorioId, blocks, projectId } = await h.seedRelatorio(companyA);
    const block = blocks[0]!.id;
    const removed = h.clientOp(companyA, { kind: 'remove', path: `block/${block}/removed_at`, relatorio_id: relatorioId });
    expect((await h.push(companyA, [removed])).rejected).toEqual([]);
    const onTombstone = h.clientOp(companyA, { kind: 'put', path: `sheet/${block}/observations`, relatorio_id: relatorioId, value: 'Depois da remoção' });
    expect((await h.push(companyA, [onTombstone])).rejected).toEqual([]);
    expect((await h.rowOf<{ sheet: { observations: { value: unknown } } }>(companyA, 'block', block))?.sheet.observations.value).toBe('Depois da remoção');

    const equipment = blocks[0]!.equipmentId;
    const otherObra = h.clientOp(companyA, { kind: 'put', scope: 'project', project_id: newId(), path: `equipment/${equipment}/tag`, value: 'TR-X' });
    const ownObra = h.clientOp(companyA, { kind: 'put', scope: 'project', project_id: projectId, path: `equipment/${equipment}/tag`, value: 'TR-Y' });
    const result = await h.push(companyA, [otherObra, ownObra]);
    expect(result.rejected).toEqual([{ op_id: otherObra.op_id, code: 'op_target_missing' }]);
    expect((await h.rowOf<{ tag: string }>(companyA, 'equipment', equipment))?.tag).toBe('TR-Y');
  });
});

describe('the responsible engineer and the removal of an issued relatório', () => {
  it('a responsible_user_id that is no user of the company is refused op_value_invalid, in a put and in a create; the company\'s user applies', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const nobody = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/responsible_user_id', relatorio_id: relatorioId, value: newId() });
    const foreign = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/responsible_user_id', relatorio_id: relatorioId, value: companyB.userId });
    const own = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/responsible_user_id', relatorio_id: relatorioId, value: companyA.userId });
    const result = await h.push(companyA, [nobody, foreign, own]);
    expect(result.rejected).toEqual([
      { op_id: nobody.op_id, code: 'op_value_invalid' },
      { op_id: foreign.op_id, code: 'op_value_invalid' },
    ]);
    expect(result.applied.map((a) => a.op_id)).toEqual([own.op_id]);

    const createdId = newId();
    const born = h.clientOp(companyA, {
      kind: 'create',
      path: `relatorio/${createdId}`,
      relatorio_id: createdId,
      value: {
        id: createdId,
        project_id: newId(),
        template_id: null,
        template_version: null,
        seed_version: 'v1',
        status: 'rascunho',
        setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: newId(), cover_photo_file_id: null },
        export: { scheme: 'por_local_e_tipo' },
        preview_file_id: null,
        removed_at: null,
      },
    });
    expect((await h.push(companyA, [born])).rejected).toEqual([{ op_id: born.op_id, code: 'op_value_invalid' }]);
    expect(await h.rowOf(companyA, 'relatorio', createdId)).toBeUndefined();
  });

  it('an Emitido relatório is not removed (op_forbidden); after a back move to Em revisão the removal applies', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    await h.queueIssueJob(companyA, relatorioId);
    const toRevision = h.statusOp(companyA, relatorioId, 'em_revisao', null);
    expect((await h.push(companyA, [toRevision])).rejected).toEqual([]);
    await h.cutRevision(companyA, relatorioId);
    const sent = h.statusOp(companyA, relatorioId, 'emitido', toRevision.op_id);
    expect((await h.push(companyA, [sent])).rejected).toEqual([]);

    const putRemoval = h.clientOp(companyA, { kind: 'put', path: 'relatorio/removed_at', relatorio_id: relatorioId, value: new Date().toISOString() });
    const remove = h.clientOp(companyA, { kind: 'remove', path: 'relatorio/removed_at', relatorio_id: relatorioId });
    const refused = await h.push(companyA, [putRemoval, remove]);
    expect(refused.rejected).toEqual([
      { op_id: putRemoval.op_id, code: 'op_forbidden' },
      { op_id: remove.op_id, code: 'op_forbidden' },
    ]);
    expect((await h.rowOf<{ removed_at: string | null }>(companyA, 'relatorio', relatorioId))?.removed_at).toBeNull();

    const back = h.statusOp(companyA, relatorioId, 'em_revisao', sent.op_id);
    expect((await h.push(companyA, [back])).rejected).toEqual([]);
    expect(await statusOf(relatorioId)).toBe('em_revisao');
    const removal = h.clientOp(companyA, { kind: 'remove', path: 'relatorio/removed_at', relatorio_id: relatorioId });
    expect((await h.push(companyA, [removal])).rejected).toEqual([]);
    expect((await h.rowOf<{ removed_at: string | null }>(companyA, 'relatorio', relatorioId))?.removed_at).not.toBeNull();
    // The restore (a put of null) is always allowed.
    const restore = h.clientOp(companyA, { kind: 'put', path: 'relatorio/removed_at', relatorio_id: relatorioId, value: null, prev_op_id: removal.op_id });
    expect((await h.push(companyA, [restore])).rejected).toEqual([]);
    const live = await h.db
      .select({ removed_at: entities.removed_at })
      .from(entities)
      .where(and(eq(entities.company_id, companyA.companyId), eq(entities.id, relatorioId), eq(entities.entity, 'relatorio')));
    expect(live).toEqual([{ removed_at: null }]);
  });
});
