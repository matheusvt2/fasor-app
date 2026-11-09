import {
  blockConfigWithSubBlock,
  blockPath,
  choiceCellValue,
  choiceValue,
  CONTRACT_VERSION,
  EMPTY_DEFINITION_CONTEXT,
  MIN_CONTRACT_VERSION,
  newEquipmentBlock,
  sheetNameplatePath,
  sheetTestCellPath,
  sheetTestValuePath,
  type BlockRow,
  type JsonValue,
} from '@app/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../ids.ts';
import { companyA, routeHarness } from './rules.test-support.ts';

/*
 * Batch e23e (Stories 23.13, 23.18, 23.20 and 23.21; contract 39) through `POST /api/sync/ops`: on a
 * v13 relatório a config switching the thermography, its value and cells, a polarity cell of the
 * TC's ratio and a Malha de aterramento block with its readings are accepted; a polarity outside its
 * options is refused, and so is a Malha block on a v12 relatório; a version-38 bundle's pull is
 * answered 426. Values invented.
 */

const h = routeHarness('tablet-e23e');

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' });

/** The equipment and block creates of one Malha de aterramento at the relatório's local. */
function malhaCreates(seeded: { relatorioId: string; projectId: string; locationId: string }, seedVersion: string) {
  const built = newEquipmentBlock({
    definitions: EMPTY_DEFINITION_CONTEXT,
    blockId: newId(),
    equipmentId: newId(),
    relatorioId: seeded.relatorioId,
    projectId: seeded.projectId,
    locationId: seeded.locationId,
    type: 'malha_aterramento',
    tag: 'MA-SUBESTACAO',
    // A v12 block is built on v13's definition (v12 ships none) and carries the relatório's version, as an old client would send it.
    seedVersion: 'v13',
    orderKey: 'z0',
  });
  const block: BlockRow = { ...built.block, seed_version: seedVersion };
  return {
    block,
    equipment: h.clientOp(companyA, { kind: 'create', scope: 'project', project_id: seeded.projectId, path: `equipment/${built.equipment.id}`, value: built.equipment as unknown as JsonValue }),
    create: h.clientOp(companyA, { kind: 'create', path: blockPath(block.id), relatorio_id: seeded.relatorioId, value: block as unknown as JsonValue }),
  };
}

describe('23.18 to 23.21-INT the thermography, the polarity and the Malha de aterramento through the route (contract 39)', () => {
  it('a v13 config switching the thermography, its value and cells, a TC polarity and a Malha block with its readings are accepted', async () => {
    const seeded = await h.seedRelatorio(companyA);
    const relatorio_id = seeded.relatorioId;
    const pr = seeded.blocks.find((block) => block.blockType === 'para_raio')!;
    const tc = seeded.blocks.find((block) => block.blockType === 'tc')!;
    const prRow = (await h.rowOf<BlockRow>(companyA, 'block', pr.id))!;
    expect(Object.keys((prRow.config as { sub_blocks: Record<string, unknown> }).sub_blocks)).toContain('termografia');

    const put = (path: string, value: unknown) => h.clientOp(companyA, { kind: 'put', path, relatorio_id, value: value as JsonValue });
    const off = put(`block/${pr.id}/config`, blockConfigWithSubBlock(prRow.config, 'termografia', false));
    expect((await h.push(companyA, [off])).rejected).toEqual([]);
    const on = put(`block/${pr.id}/config`, blockConfigWithSubBlock((await h.rowOf<BlockRow>(companyA, 'block', pr.id))!.config, 'termografia', true));
    const writes = [
      on,
      put(sheetTestValuePath(pr.id, 'termografia', 'em_carga'), choiceValue('sim')),
      put(sheetTestCellPath(pr.id, 'termografia', 0, 0), measured('20', '°C')),
      put(sheetNameplatePath(tc.id, 'funcao_tc'), 'FATURAMENTO'),
      put(sheetNameplatePath(tc.id, 'exatidao'), '0,3S'),
      put(sheetTestCellPath(tc.id, 'relacao_transformacao', 0, 5), choiceCellValue('INVERTIDA')),
    ];
    expect((await h.push(companyA, writes)).rejected).toEqual([]);
    const storedPr = (await h.rowOf<BlockRow>(companyA, 'block', pr.id))!;
    expect((storedPr.config as { sub_blocks: Record<string, unknown> }).sub_blocks.termografia).toEqual({ enabled: true });
    expect(storedPr.sheet.test.termografia!.values!.em_carga!.value).toEqual(choiceValue('sim'));
    expect(storedPr.sheet.test.termografia!.cells['0']!['0']!.value).toEqual(measured('20', '°C'));
    const storedTc = (await h.rowOf<BlockRow>(companyA, 'block', tc.id))!;
    expect(storedTc.sheet.test.relacao_transformacao!.cells['0']!['5']!.value).toEqual(choiceCellValue('INVERTIDA'));

    const malha = malhaCreates(seeded, 'v13');
    expect((await h.push(companyA, [malha.equipment, malha.create])).rejected).toEqual([]);
    const readings = [
      put(sheetNameplatePath(malha.block.id, 'valor_projeto_ohm'), measured('2', 'Ω')),
      put(sheetTestCellPath(malha.block.id, 'resistencia_malha', 0, 0), measured('3', 'Ω')),
      put(sheetTestCellPath(malha.block.id, 'continuidade_malha', 4, 0), measured('0.6', 'Ω')),
    ];
    expect((await h.push(companyA, readings)).rejected).toEqual([]);
    const storedMalha = (await h.rowOf<BlockRow>(companyA, 'block', malha.block.id))!;
    expect(storedMalha.block_type).toBe('malha_aterramento');
    expect(storedMalha.sheet.test.resistencia_malha!.cells['0']!['0']!.value).toEqual(measured('3', 'Ω'));
  });

  it('a polarity outside its options and a Malha block on a v12 relatório are refused op_invalid', async () => {
    const seeded = await h.seedRelatorio(companyA);
    const tc = seeded.blocks.find((block) => block.blockType === 'tc')!;
    const put = (path: string, value: unknown) => h.clientOp(companyA, { kind: 'put', path, relatorio_id: seeded.relatorioId, value: value as JsonValue });
    const outside = put(sheetTestCellPath(tc.id, 'relacao_transformacao', 1, 5), choiceCellValue('TALVEZ'));
    const number = put(sheetTestCellPath(tc.id, 'relacao_transformacao', 2, 5), measured('1', null));
    const refused = await h.push(companyA, [outside, number]);
    expect(refused.rejected.map((one) => one.op_id).sort()).toEqual([outside.op_id, number.op_id].sort());
    expect(refused.rejected.every((one) => one.code === 'op_invalid')).toBe(true);

    const v12 = await h.seedRelatorio(companyA, new Date(), 'v12');
    const malha = malhaCreates(v12, 'v12');
    const result = await h.push(companyA, [malha.equipment, malha.create]);
    expect(result.rejected.map((one) => [one.op_id, one.code])).toEqual([[malha.create.op_id, 'op_invalid']]);
    expect(await h.rowOf<BlockRow>(companyA, 'block', malha.block.id)).toBeUndefined();
  });

  it('speaks contract 39: a version-38 pull is answered 426 contract_outdated, the current one is answered', async () => {
    expect(CONTRACT_VERSION).toBeGreaterThanOrEqual(39);
    expect(MIN_CONTRACT_VERSION).toBeGreaterThanOrEqual(39);
    for (const path of ['/api/sync/company?since=0', `/api/sync/relatorios/${newId()}?since=0`, `/api/sync/projects/${newId()}?since=0`]) {
      const old = await h.authed(companyA, path, { headers: { 'x-contract-version': '38' } });
      expect(old.status, path).toBe(426);
      expect(((await old.json()) as { code?: string }).code).toBe('contract_outdated');
    }
    const current = await h.authed(companyA, '/api/sync/company?since=0', { headers: { 'x-contract-version': String(CONTRACT_VERSION) } });
    expect(current.status).toBe(200);
  });
});
