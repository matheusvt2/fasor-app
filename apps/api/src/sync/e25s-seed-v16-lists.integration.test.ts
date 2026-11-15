import { CONTRACT_VERSION, MIN_CONTRACT_VERSION, sheetChecklistPath, type BlockRow, type JsonValue } from '@app/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../ids.ts';
import { companyA, routeHarness } from './rules.test-support.ts';

/*
 * 25.18-API-001 (Story 25.18, batch e25s, contract 54) through `POST /api/sync/ops`: on a v16 relatório the TC's
 * item 7 on its secondary (`secundario_fechado_ou_curto_circuitado`, a new `ITEM_KEYS` value) takes an NC and its
 * phrase; the v16 TP, whose list does not ask it, and a v15 TC refuse it `op_invalid`; a version-53 pull is
 * answered 426 contract_outdated on every stream. Values invented.
 */

const h = routeHarness('tablet-e25s18');

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

const ITEM = 'secundario_fechado_ou_curto_circuitado';

describe('25.18-API-001 the v16 TC\'s item on its secondary through the route (contract 54)', () => {
  it('a v16 TC takes the item NC with its phrase; the v16 TP and a v15 TC refuse it op_invalid', async () => {
    const v16 = await h.seedRelatorio(companyA, new Date(), 'v16');
    const tc = v16.blocks.find((block) => block.blockType === 'tc')!;
    const tp = v16.blocks.find((block) => block.blockType === 'tp')!;
    expect(tc, 'the standard template places a TC').toBeDefined();
    expect(tp, 'the standard template places a TP').toBeDefined();
    const put = (relatorio_id: string, path: string, value: unknown) => h.clientOp(companyA, { kind: 'put', path, relatorio_id, value: value as JsonValue });
    const writes = [put(v16.relatorioId, sheetChecklistPath(tc.id, ITEM, 'result'), 'NC'), put(v16.relatorioId, sheetChecklistPath(tc.id, ITEM, 'observation'), 'secundário aberto nos bornes')];
    expect((await h.push(companyA, writes)).rejected).toEqual([]);
    const stored = (await h.rowOf<BlockRow>(companyA, 'block', tc.id))!;
    expect(stored.seed_version).toBe('v16');
    expect(stored.sheet.checklist[ITEM]!.result!.value).toBe('NC');
    expect(stored.sheet.checklist[ITEM]!.observation!.value).toBe('secundário aberto nos bornes');

    const onTp = put(v16.relatorioId, sheetChecklistPath(tp.id, ITEM, 'result'), 'C');
    const v15 = await h.seedRelatorio(companyA, new Date(), 'v15');
    const oldTc = v15.blocks.find((block) => block.blockType === 'tc')!;
    const onV15 = put(v15.relatorioId, sheetChecklistPath(oldTc.id, ITEM, 'result'), 'C');
    const result = await h.push(companyA, [onTp, onV15]);
    expect(result.rejected.map((one) => one.op_id).sort()).toEqual([onTp.op_id, onV15.op_id].sort());
    expect(result.rejected.every((one) => one.code === 'op_invalid')).toBe(true);
  });

  it('speaks contract 54: a version-53 pull is answered 426 contract_outdated on every stream, the current one is answered', async () => {
    expect(CONTRACT_VERSION).toBeGreaterThanOrEqual(54);
    expect(MIN_CONTRACT_VERSION).toBeGreaterThanOrEqual(54);
    for (const path of ['/api/sync/company?since=0', `/api/sync/relatorios/${newId()}?since=0`, `/api/sync/projects/${newId()}?since=0`]) {
      const old = await h.authed(companyA, path, { headers: { 'x-contract-version': '53' } });
      expect(old.status, path).toBe(426);
      expect(((await old.json()) as { code?: string }).code).toBe('contract_outdated');
    }
    const current = await h.authed(companyA, '/api/sync/company?since=0', { headers: { 'x-contract-version': String(CONTRACT_VERSION) } });
    expect(current.status).toBe(200);
  });
});
