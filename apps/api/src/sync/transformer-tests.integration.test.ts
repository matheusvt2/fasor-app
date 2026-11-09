import {
  blockConfigWithSubBlock,
  choiceValue,
  CONTRACT_VERSION,
  lastResults,
  MIN_CONTRACT_VERSION,
  sheetNameplatePath,
  sheetTestCellPath,
  sheetTestValuePath,
  type BlockRow,
  type JsonValue,
} from '@app/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { newId } from '../ids.ts';
import { companyA, routeHarness } from './rules.test-support.ts';
import { toSnapshot } from './snapshot.ts';

/*
 * Batch e23t (Stories 23.15, 23.17 and 23.19; contract 38) through `POST /api/sync/ops`: a v13
 * block's config naming the three new measurement tests is accepted, and so are a cell of the
 * winding table, the oil sampling's choice and its reason, and a fuse reading; a cell of a test key
 * no definition holds is refused; a version-37 bundle's pull is answered 426. The issue's
 * `last_results` keeps a winding reading's value at 75 °C. Values invented.
 */

const h = routeHarness('tablet-e23t');

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' });

describe('23.15-INT the new measurement tests through the route (contract 38)', () => {
  it('a config switching them, their cells and values are accepted on a v13 sheet; an unknown test key is refused', async () => {
    const seeded = await h.seedRelatorio(companyA);
    const relatorio_id = seeded.relatorioId;
    const tf = seeded.blocks.find((block) => block.blockType === 'transformador_forca')!;
    const sc = seeded.blocks.find((block) => block.blockType === 'chave_seccionadora')!;
    const tfRow = await h.rowOf<BlockRow>(companyA, 'block', tf.id);
    const subBlocks = (row: BlockRow | undefined) => Object.keys((row!.config as { sub_blocks: Record<string, unknown> }).sub_blocks);
    expect(subBlocks(tfRow)).toEqual(expect.arrayContaining(['resistencia_enrolamento', 'coleta_oleo']));
    expect(subBlocks(tfRow)).not.toContain('ia_ip_display');

    const put = (path: string, value: unknown) => h.clientOp(companyA, { kind: 'put', path, relatorio_id, value: value as JsonValue });
    const off = put(`block/${tf.id}/config`, blockConfigWithSubBlock(tfRow!.config, 'resistencia_enrolamento', false));
    expect((await h.push(companyA, [off])).rejected).toEqual([]);
    const on = put(`block/${tf.id}/config`, blockConfigWithSubBlock((await h.rowOf<BlockRow>(companyA, 'block', tf.id))!.config, 'resistencia_enrolamento', true));
    const writes = [
      on,
      put(sheetNameplatePath(tf.id, 'tipo_de_isolacao'), 'ÓLEO ISOLANTE'),
      put(sheetNameplatePath(tf.id, 'material_enrolamento'), 'Cu'),
      put(sheetNameplatePath(tf.id, 'temperatura_oleo_c'), measured('30', '°C')),
      put(sheetTestCellPath(tf.id, 'resistencia_enrolamento', 0, 0), measured('1', 'Ω')),
      put(sheetTestCellPath(tf.id, 'resistencia_enrolamento', 0, 1), measured('1.01', 'Ω')),
      put(sheetTestCellPath(tf.id, 'resistencia_enrolamento', 0, 2), measured('1.03', 'Ω')),
      put(sheetTestCellPath(tf.id, 'coleta_oleo', 0, 0), choiceValue('nao_coletado')),
      put(sheetTestValuePath(tf.id, 'coleta_oleo', 'motivo'), choiceValue('sem_ponto_de_coleta')),
      put(sheetNameplatePath(sc.id, 'tipo_seccionadora'), 'SOB CARGA COM FUSÍVEIS'),
      put(sheetTestCellPath(sc.id, 'resistencia_fusiveis', 2, 0), measured('12', 'mΩ')),
    ];
    expect((await h.push(companyA, writes)).rejected).toEqual([]);
    const stored = (await h.rowOf<BlockRow>(companyA, 'block', tf.id))!;
    expect((stored.config as { sub_blocks: Record<string, unknown> }).sub_blocks.resistencia_enrolamento).toEqual({ enabled: true });
    expect(stored.sheet.test.resistencia_enrolamento!.cells['0']!['2']!.value).toEqual(measured('1.03', 'Ω'));
    expect(stored.sheet.test.coleta_oleo!.values!.motivo!.value).toEqual(choiceValue('sem_ponto_de_coleta'));

    const unknown = put(sheetTestCellPath(tf.id, 'resistencia_nao_existe', 0, 0), measured('1', 'Ω'));
    const outside = put(sheetTestCellPath(tf.id, 'resistencia_enrolamento', 9, 0), measured('1', 'Ω'));
    const refused = await h.push(companyA, [unknown, outside]);
    expect(refused.rejected.map((one) => one.op_id).sort()).toEqual([unknown.op_id, outside.op_id].sort());
    expect(refused.rejected.every((one) => one.code === 'op_invalid')).toBe(true);

    // The issue's projection keeps the winding readings at 75 °C (Cu, 30 °C of oil: x 310/265).
    const snapshot = await toSnapshot(h.db, asCompanyId(companyA.companyId), relatorio_id);
    const entry = lastResults(snapshot, { revisionNumber: 1, issuedAt: new Date().toISOString() }).find((one) => one.equipmentId === tf.equipmentId)!;
    const winding = Object.entries(entry.value.readings).filter(([key]) => key.startsWith('resistencia_enrolamento|'));
    expect(winding.map(([, reading]) => reading.corrected)).toEqual([
      { raw: '1.17', unit: 'Ω' },
      { raw: '1.182', unit: 'Ω' },
      { raw: '1.205', unit: 'Ω' },
    ]);
  });

  it('speaks contract 38: a version-37 pull is answered 426 contract_outdated, the current one is answered', async () => {
    expect(CONTRACT_VERSION).toBeGreaterThanOrEqual(38);
    expect(MIN_CONTRACT_VERSION).toBeGreaterThanOrEqual(38);
    for (const path of ['/api/sync/company?since=0', `/api/sync/relatorios/${newId()}?since=0`, `/api/sync/projects/${newId()}?since=0`]) {
      const old = await h.authed(companyA, path, { headers: { 'x-contract-version': '37' } });
      expect(old.status, path).toBe(426);
      expect(((await old.json()) as { code?: string }).code).toBe('contract_outdated');
    }
    const current = await h.authed(companyA, '/api/sync/company?since=0', { headers: { 'x-contract-version': String(CONTRACT_VERSION) } });
    expect(current.status).toBe(200);
  });
});
