import {
  blockPath,
  choiceValue,
  companyBlockType,
  CONTRACT_VERSION,
  defaultBlockConfigIn,
  definitionContext,
  duplicateSeededType,
  EMPTY_DEFINITION_CONTEXT,
  equipmentTypePath,
  equipmentTypeVersionPath,
  MIN_CONTRACT_VERSION,
  newEquipmentBlock,
  sheetChecklistPath,
  sheetNameplatePath,
  sheetTestCellPath,
  sheetTestValuePath,
  type BlockRow,
  type EquipmentTypeVersionRow,
  type JsonValue,
} from '@app/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../ids.ts';
import { companyA, routeHarness } from './rules.test-support.ts';

/*
 * Batch e24s (Stories 24.10 to 24.12; contract 45) through `POST /api/sync/ops`: on a v14 relatório
 * the transformer's new items and the Inspeção de QGBT's function test and thermography are
 * accepted, and refused on a v13 relatório whose lists lack them; a company type duplicated from
 * the v14 transformer publishes with its `dry_items` stored whole; a version-44
 * bundle's pull is answered 426. Values invented.
 */

const h = routeHarness('tablet-e24s');

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' });

/** The equipment and block creates of one Inspeção de QGBT at the relatório's local, on `seedVersion`. */
function inspectionCreates(seeded: { relatorioId: string; projectId: string; locationId: string }, seedVersion: string) {
  const built = newEquipmentBlock({
    definitions: EMPTY_DEFINITION_CONTEXT,
    blockId: newId(),
    equipmentId: newId(),
    relatorioId: seeded.relatorioId,
    projectId: seeded.projectId,
    locationId: seeded.locationId,
    type: 'inspecao_qgbt',
    tag: 'IQ-01',
    seedVersion,
    orderKey: 'z0',
  });
  return {
    block: built.block,
    equipment: h.clientOp(companyA, { kind: 'create', scope: 'project', project_id: seeded.projectId, path: `equipment/${built.equipment.id}`, value: built.equipment as unknown as JsonValue }),
    create: h.clientOp(companyA, { kind: 'create', path: blockPath(built.block.id), relatorio_id: seeded.relatorioId, value: built.block as unknown as JsonValue }),
  };
}

describe('24.11-API-001 and 24.12 the v14 transformer\'s and Inspeção de QGBT\'s new items through the route (contract 45)', () => {
  it('a v14 transformer takes TANQUE E ALETAS, LIMPEZA DAS BOBINAS and TRINCAS NA RESINA; a v13 one refuses them op_invalid', async () => {
    const v14 = await h.seedRelatorio(companyA);
    const transformer = v14.blocks.find((block) => block.blockType === 'transformador_forca')!;
    const put = (relatorio_id: string, path: string, value: unknown) => h.clientOp(companyA, { kind: 'put', path, relatorio_id, value: value as JsonValue });
    const writes = [
      put(v14.relatorioId, sheetNameplatePath(transformer.id, 'tipo_de_isolacao'), 'EPÓXI'),
      put(v14.relatorioId, sheetChecklistPath(transformer.id, 'tanque_e_aletas', 'result'), 'NA'),
      put(v14.relatorioId, sheetChecklistPath(transformer.id, 'limpeza_das_bobinas', 'result'), 'C'),
      put(v14.relatorioId, sheetChecklistPath(transformer.id, 'trincas_na_resina', 'result'), 'NC'),
      put(v14.relatorioId, sheetChecklistPath(transformer.id, 'trincas_na_resina', 'observation'), 'trinca na resina da bobina'),
    ];
    expect((await h.push(companyA, writes)).rejected).toEqual([]);
    const stored = (await h.rowOf<BlockRow>(companyA, 'block', transformer.id))!;
    expect(stored.seed_version).toBe('v14');
    expect(stored.sheet.checklist.trincas_na_resina!.result!.value).toBe('NC');

    // The crossing to oil, as the device sends it: the field and the dry items' clears in one batch, each chained on the cell it clears.
    const batchId = newId();
    const clear = (path: string, prev: string | undefined, value: unknown = null) =>
      h.clientOp(companyA, { kind: 'put', path, relatorio_id: v14.relatorioId, value: value as JsonValue, batch_id: batchId, prev_op_id: prev ?? null });
    const crossing = [
      clear(sheetNameplatePath(transformer.id, 'tipo_de_isolacao'), stored.sheet.nameplate.tipo_de_isolacao?.op_id, 'ÓLEO ISOLANTE'),
      clear(sheetChecklistPath(transformer.id, 'limpeza_das_bobinas', 'result'), stored.sheet.checklist.limpeza_das_bobinas?.result?.op_id),
      clear(sheetChecklistPath(transformer.id, 'trincas_na_resina', 'result'), stored.sheet.checklist.trincas_na_resina?.result?.op_id),
      clear(sheetChecklistPath(transformer.id, 'trincas_na_resina', 'observation'), stored.sheet.checklist.trincas_na_resina?.observation?.op_id),
    ];
    expect((await h.push(companyA, crossing)).rejected).toEqual([]);
    const crossed = (await h.rowOf<BlockRow>(companyA, 'block', transformer.id))!;
    expect(crossed.sheet.checklist.trincas_na_resina!.result!.value).toBeNull();

    const v13 = await h.seedRelatorio(companyA, new Date(), 'v13');
    const old = v13.blocks.find((block) => block.blockType === 'transformador_forca')!;
    const refused = put(v13.relatorioId, sheetChecklistPath(old.id, 'trincas_na_resina', 'result'), 'C');
    const result = await h.push(companyA, [refused]);
    expect(result.rejected.map((one) => [one.op_id, one.code])).toEqual([[refused.op_id, 'op_invalid']]);
  });

  it('a v14 Inspeção de QGBT takes TESTE DE FUNCIONAMENTO, REAPERTO GERAL and its thermography; a v13 one refuses the test and the item', async () => {
    const v14 = await h.seedRelatorio(companyA);
    const inspection = inspectionCreates(v14, 'v14');
    expect(Object.keys((inspection.block.config as { sub_blocks: Record<string, unknown> }).sub_blocks)).toContain('termografia');
    expect((await h.push(companyA, [inspection.equipment, inspection.create])).rejected).toEqual([]);
    const put = (relatorio_id: string, path: string, value: unknown) => h.clientOp(companyA, { kind: 'put', path, relatorio_id, value: value as JsonValue });
    const writes = [
      put(v14.relatorioId, sheetChecklistPath(inspection.block.id, 'reaperto_geral', 'result'), 'C'),
      put(v14.relatorioId, sheetChecklistPath(inspection.block.id, 'teste_de_funcionamento', 'result'), 'NC'),
      put(v14.relatorioId, sheetChecklistPath(inspection.block.id, 'teste_de_funcionamento', 'observation'), 'DPS com indicação de falha'),
      put(v14.relatorioId, sheetTestValuePath(inspection.block.id, 'termografia', 'em_carga'), choiceValue('sim')),
      put(v14.relatorioId, sheetTestCellPath(inspection.block.id, 'termografia', 0, 0), measured('10', '°C')),
    ];
    expect((await h.push(companyA, writes)).rejected).toEqual([]);
    const stored = (await h.rowOf<BlockRow>(companyA, 'block', inspection.block.id))!;
    expect(stored.sheet.checklist.teste_de_funcionamento!.result!.value).toBe('NC');
    expect(stored.sheet.test.termografia!.cells['0']!['0']!.value).toEqual(measured('10', '°C'));

    const v13 = await h.seedRelatorio(companyA, new Date(), 'v13');
    const old = inspectionCreates(v13, 'v13');
    expect((await h.push(companyA, [old.equipment, old.create])).rejected).toEqual([]);
    const item = put(v13.relatorioId, sheetChecklistPath(old.block.id, 'teste_de_funcionamento', 'result'), 'C');
    const cell = put(v13.relatorioId, sheetTestCellPath(old.block.id, 'termografia', 0, 0), measured('10', '°C'));
    const result = await h.push(companyA, [item, cell]);
    expect(result.rejected.map((one) => one.op_id).sort()).toEqual([item.op_id, cell.op_id].sort());
    expect(result.rejected.every((one) => one.code === 'op_invalid')).toBe(true);
  });

  it('a company type duplicated from the v14 transformer publishes with its `dry_items`, and its sheet takes the dry items', async () => {
    const { derived_from, draft } = duplicateSeededType('v14', 'transformador_forca');
    expect(draft.oil_rule?.dry_items).toEqual(['ventiladores', 'limpeza_das_bobinas', 'trincas_na_resina']);
    const typeId = newId();
    const versionId = newId();
    const version: EquipmentTypeVersionRow = { id: versionId, type_id: typeId, version: 1, definition: draft as EquipmentTypeVersionRow['definition'], published_by: companyA.userId, published_at: new Date().toISOString() };
    const create = h.clientOp(companyA, { kind: 'create', scope: 'company', path: equipmentTypePath(typeId), value: { id: typeId, derived_from, draft, retired_at: null, removed_at: null, latest_version: 0 } as unknown as JsonValue });
    const publish = h.clientOp(companyA, { kind: 'create', scope: 'company', path: equipmentTypeVersionPath(versionId), value: version as unknown as JsonValue });
    const published = await h.push(companyA, [create, publish]);
    expect(published.rejected, JSON.stringify(published.rejected)).toEqual([]);
    const stored = (await h.rowOf<EquipmentTypeVersionRow>(companyA, 'equipment_type_version', versionId))!;
    expect(stored.definition.oil_rule?.dry_items).toEqual(['ventiladores', 'limpeza_das_bobinas', 'trincas_na_resina']);

    // A sheet of the copy on a v14 relatório answers a dry item.
    const seeded = await h.seedRelatorio(companyA);
    const blockId = newId();
    const blockType = companyBlockType(typeId);
    const ctx = definitionContext([version], [{ id: typeId, derived_from, draft: null, retired_at: null, removed_at: null, latest_version: 1 }]);
    const config = defaultBlockConfigIn(ctx, 'v14', blockType, { version: 1, id: versionId });
    const block = h.clientOp(companyA, {
      kind: 'create',
      path: blockPath(blockId),
      relatorio_id: seeded.relatorioId,
      value: {
        id: blockId,
        relatorio_id: seeded.relatorioId,
        location_id: seeded.locationId,
        equipment_id: seeded.blocks[0]!.equipmentId,
        block_type: blockType,
        config,
        seed_version: 'v14',
        order_key: 'zz',
        feeds_block_id: null,
        not_tested: null,
        concluded_by: null,
        sheet: { nameplate: {}, checklist: {}, test: {}, conclusion: {}, observations: null },
        created_by: null,
        first_edited_at: null,
        last_modified_by: null,
        last_modified_at: null,
        removed_at: null,
      } as unknown as JsonValue,
    });
    const answer = h.clientOp(companyA, { kind: 'put', path: sheetChecklistPath(blockId, 'limpeza_das_bobinas', 'result'), relatorio_id: seeded.relatorioId, value: 'C' });
    expect((await h.push(companyA, [block, answer])).rejected).toEqual([]);
    expect((await h.rowOf<BlockRow>(companyA, 'block', blockId))!.sheet.checklist.limpeza_das_bobinas!.result!.value).toBe('C');
  });

  it('speaks contract 45: a version-44 pull is answered 426 contract_outdated on every stream, the current one is answered', async () => {
    expect(CONTRACT_VERSION).toBeGreaterThanOrEqual(45);
    expect(MIN_CONTRACT_VERSION).toBeGreaterThanOrEqual(45);
    for (const path of ['/api/sync/company?since=0', `/api/sync/relatorios/${newId()}?since=0`, `/api/sync/projects/${newId()}?since=0`]) {
      const old = await h.authed(companyA, path, { headers: { 'x-contract-version': '44' } });
      expect(old.status, path).toBe(426);
      expect(((await old.json()) as { code?: string }).code).toBe('contract_outdated');
    }
    const current = await h.authed(companyA, '/api/sync/company?since=0', { headers: { 'x-contract-version': String(CONTRACT_VERSION) } });
    expect(current.status).toBe(200);
  });
});
