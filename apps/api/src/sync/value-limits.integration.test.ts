import { errorResponseSchema, SYNC_PUSH_MAX_BYTES, TEXT_CAPS } from '@app/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../ids.ts';
import { companyA, routeHarness } from './rules.test-support.ts';

/*
 * Story 20.9 (contract 29, security pass S4): every op value has a size and a type the server
 * enforces, and the push body is capped at 4 MiB. Every push goes through `POST /api/sync/ops`
 * with a session of Empresa A's user. A refused op is never logged; stored rows are never touched.
 */

const h = routeHarness('tablet-value-rules');

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

type RelatorioRowLike = { setup: { additional_info: string | null; site_altitude_m: number | null } };
type BlockRowLike = { sheet: { observations: { value: unknown } | null } };

describe('S4: a value outside its field\'s cap, type or range', () => {
  it('an additional_info of 20 001 characters is refused op_value_invalid; 20 000 are applied', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const put = (text: string) => h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/additional_info', relatorio_id: relatorioId, value: text });
    const over = put('x'.repeat(TEXT_CAPS.long + 1));
    const overResult = await h.push(companyA, [over]);
    expect(overResult.rejected).toEqual([{ op_id: over.op_id, code: 'op_value_invalid' }]);
    expect(await h.logged(over.op_id)).toBe(false);
    expect((await h.rowOf<RelatorioRowLike>(companyA, 'relatorio', relatorioId))?.setup.additional_info).toBeNull();

    const atCap = put('y'.repeat(TEXT_CAPS.long));
    expect((await h.push(companyA, [atCap])).rejected).toEqual([]);
    expect((await h.rowOf<RelatorioRowLike>(companyA, 'relatorio', relatorioId))?.setup.additional_info).toHaveLength(TEXT_CAPS.long);
  });

  it('sheet observations as an object and a site altitude of -99 999 m are refused; -500 m is applied', async () => {
    const { relatorioId, blocks } = await h.seedRelatorio(companyA);
    const object = h.clientOp(companyA, { kind: 'put', path: `sheet/${blocks[0]!.id}/observations`, relatorio_id: relatorioId, value: { texto: 'em objeto' } });
    const deep = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/site_altitude_m', relatorio_id: relatorioId, value: -99_999 });
    const shore = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/site_altitude_m', relatorio_id: relatorioId, value: -500 });
    const result = await h.push(companyA, [object, deep, shore]);
    expect(result.rejected).toEqual([
      { op_id: object.op_id, code: 'op_value_invalid' },
      { op_id: deep.op_id, code: 'op_value_invalid' },
    ]);
    expect(result.applied.map((a) => a.op_id)).toEqual([shore.op_id]);
    expect((await h.rowOf<BlockRowLike>(companyA, 'block', blocks[0]!.id))?.sheet.observations).toBeNull();
    expect((await h.rowOf<RelatorioRowLike>(companyA, 'relatorio', relatorioId))?.setup.site_altitude_m).toBe(-500);
  });

  it('the refused value of a client batch is refused alone: the batch\'s other ops apply', async () => {
    const { relatorioId, blocks } = await h.seedRelatorio(companyA);
    const batchId = newId();
    const fine = h.clientOp(companyA, { kind: 'put', path: `sheet/${blocks[0]!.id}/observations`, relatorio_id: relatorioId, value: 'Fica', batch_id: batchId });
    const oversized = h.clientOp(companyA, { kind: 'put', path: `sheet/${blocks[1]!.id}/observations`, relatorio_id: relatorioId, value: 'z'.repeat(TEXT_CAPS.long + 1), batch_id: batchId });
    const result = await h.push(companyA, [fine, oversized]);
    expect(result.applied.map((a) => a.op_id)).toEqual([fine.op_id]);
    expect(result.rejected).toEqual([{ op_id: oversized.op_id, code: 'op_value_invalid' }]);
  });
});

describe('S4 body: the push body cap', () => {
  it('a push over 4 MiB (the 5 MB string of the security pass) is answered 413 body_too_large whole; nothing of it is applied', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const huge = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/additional_info', relatorio_id: relatorioId, value: 'x'.repeat(5 * 1024 * 1024) });
    const small = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/local', relatorio_id: relatorioId, value: 'Subestação' });
    h.track([huge, small]);
    const body = JSON.stringify({ ops: [small, huge] });
    expect(Buffer.byteLength(body)).toBeGreaterThan(SYNC_PUSH_MAX_BYTES);
    const res = await h.pushRaw(companyA, body);
    expect(res.status).toBe(413);
    expect(errorResponseSchema.parse(await res.json()).code).toBe('body_too_large');
    expect(await h.logged(small.op_id)).toBe(false);
    expect(await h.logged(huge.op_id)).toBe(false);
  });

  it('a push just under the cap is read and answered per op', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const fine = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/local', relatorio_id: relatorioId, value: 'Subestação' });
    // A value refused by its cap, sized so the body stays under 4 MiB: the route reads it and refuses the op alone.
    const big = h.clientOp(companyA, { kind: 'put', path: 'relatorio/setup/additional_info', relatorio_id: relatorioId, value: 'x'.repeat(SYNC_PUSH_MAX_BYTES - 64 * 1024) });
    const result = await h.push(companyA, [fine, big]);
    expect(result.applied.map((a) => a.op_id)).toEqual([fine.op_id]);
    expect(result.rejected).toEqual([{ op_id: big.op_id, code: 'op_value_invalid' }]);
  });
});
