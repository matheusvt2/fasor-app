import { choiceValue, CONTRACT_VERSION, MIN_CONTRACT_VERSION, sheetTestCellPath, sheetTestRowCellPath, sheetTestRowPath, sheetTestValuePath, type BlockRow, type JsonValue } from '@app/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../ids.ts';
import { companyA, routeHarness } from './rules.test-support.ts';

/*
 * 25.15-INT (batch e25s, Story 25.15, contract 54, the same number as Stories 25.14 and 25.18) through
 * `POST /api/sync/ops`: on a v16 relatório the thermography's answer, its reason, the text under "Outro", a reading
 * on the transformer's point and an added point are accepted; "Equipamento em carga" is refused there, and stays
 * accepted on a v15 relatório. A version-53 bundle's pull is answered 426. Values invented.
 */

const h = routeHarness('tablet-e25s-2515');

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

const TEST = 'termografia';
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' });

describe('25.15-INT the v16 thermography through the route (contract 54)', () => {
  it('a v16 answer, its reason and text, a point\'s reading and an added point are accepted; "Equipamento em carga" is refused', async () => {
    const seeded = await h.seedRelatorio(companyA, new Date(), 'v16');
    const relatorio_id = seeded.relatorioId;
    const tf = seeded.blocks.find((block) => block.blockType === 'transformador_forca')!;
    const dj = seeded.blocks.find((block) => block.blockType === 'disjuntor_mt')!;
    const put = (path: string, value: unknown) => h.clientOp(companyA, { kind: 'put', path, relatorio_id, value: value as JsonValue });
    const row = newId();
    const writes = [
      put(sheetTestValuePath(tf.id, TEST, 'realizacao'), choiceValue('realizada')),
      put(sheetTestCellPath(tf.id, TEST, 0, 0), measured('1.2', '°C')),
      put(sheetTestRowPath(tf.id, TEST, row, 'name'), 'Conexão do barramento'),
      put(sheetTestRowCellPath(tf.id, TEST, row, 0), measured('20', '°C')),
      put(sheetTestValuePath(dj.id, TEST, 'realizacao'), choiceValue('nao_realizada')),
      put(sheetTestValuePath(dj.id, TEST, 'motivo'), choiceValue('outro')),
      put(sheetTestValuePath(dj.id, TEST, 'motivo_texto'), 'Termovisor em calibração'),
    ];
    expect((await h.push(companyA, writes)).rejected).toEqual([]);
    const storedTf = (await h.rowOf<BlockRow>(companyA, 'block', tf.id))!;
    expect(storedTf.seed_version).toBe('v16');
    expect(storedTf.sheet.test[TEST]!.values!.realizacao!.value).toEqual(choiceValue('realizada'));
    expect(storedTf.sheet.test[TEST]!.added_rows![row]!.name!.value).toBe('Conexão do barramento');
    const storedDj = (await h.rowOf<BlockRow>(companyA, 'block', dj.id))!;
    expect(storedDj.sheet.test[TEST]!.values!.motivo_texto!.value).toBe('Termovisor em calibração');

    const load = put(sheetTestValuePath(tf.id, TEST, 'em_carga'), choiceValue('sim'));
    const refused = await h.push(companyA, [load]);
    expect(refused.rejected.map((one) => [one.op_id, one.code])).toEqual([[load.op_id, 'op_invalid']]);
  });

  it('a v15 relatório keeps "Equipamento em carga" and takes no answer of v16', async () => {
    const seeded = await h.seedRelatorio(companyA, new Date(), 'v15');
    const tf = seeded.blocks.find((block) => block.blockType === 'transformador_forca')!;
    const put = (path: string, value: unknown) => h.clientOp(companyA, { kind: 'put', path, relatorio_id: seeded.relatorioId, value: value as JsonValue });
    expect((await h.push(companyA, [put(sheetTestValuePath(tf.id, TEST, 'em_carga'), choiceValue('sim'))])).rejected).toEqual([]);
    const answer = put(sheetTestValuePath(tf.id, TEST, 'realizacao'), choiceValue('realizada'));
    const refused = await h.push(companyA, [answer]);
    expect(refused.rejected.map((one) => [one.op_id, one.code])).toEqual([[answer.op_id, 'op_invalid']]);
  });

  it('speaks contract 54: a version-53 pull is answered 426 contract_outdated, the current one is answered', async () => {
    expect(CONTRACT_VERSION).toBeGreaterThanOrEqual(54);
    expect(MIN_CONTRACT_VERSION).toBeGreaterThanOrEqual(54);
    const old = await h.authed(companyA, '/api/sync/company?since=0', { headers: { 'x-contract-version': '53' } });
    expect(old.status).toBe(426);
    const current = await h.authed(companyA, '/api/sync/company?since=0', { headers: { 'x-contract-version': String(CONTRACT_VERSION) } });
    expect(current.status).toBe(200);
  });
});
