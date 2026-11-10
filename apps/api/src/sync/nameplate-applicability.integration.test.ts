import {
  companyBlockType,
  companySubBlocksOf,
  CONTRACT_VERSION,
  duplicateSeededType,
  equipmentTypePath,
  equipmentTypeVersionPath,
  MIN_CONTRACT_VERSION,
  sheetNameplatePath,
  sheetTestCellPath,
  sheetTestPath,
  type BlockRow,
  type CompanyTypeDefinition,
} from '@app/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../ids.ts';
import { companyA, routeHarness } from './rules.test-support.ts';

/*
 * Batch e23b (Stories 23.7 to 23.9; contract 35) through `POST /api/sync/ops`: a cell of the v13
 * transformer's TTR is written on a tap of its plate's list and refused (`op_invalid`) on a row
 * the list does not hold; the applicability override is accepted as "applied" and null on a test
 * whose definition carries a condition (a company type duplicated from the v13 seccionadora, the
 * spec's fixture definition: no seeded test has one yet) and refused for any other value and on a
 * test without a condition; a version-34 bundle's pull is answered 426. Values invented.
 */

const h = routeHarness('tablet-e23b');

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' });

/** The v13 seccionadora copied, its contact resistance applying only with fuses. */
function fusedCopy(): CompanyTypeDefinition {
  const draft = duplicateSeededType('v13', 'chave_seccionadora').draft;
  const condition = { op: 'in' as const, field: 'tipo_seccionadora', values: ['SOB CARGA COM FUSÍVEIS'], unmet: 'sem fusíveis' };
  return { ...draft, tests: draft.tests.map((test) => (test.key === 'resistencia_contato' ? { ...test, applies_when: condition } : test)) };
}

describe('23.8-INT a cell of the v13 TTR through the route (contract 35)', () => {
  it('writes a tap of the plate\'s list and refuses a row the list does not hold, row 0 included once TAPS is filled', async () => {
    const seeded = await h.seedRelatorio(companyA);
    const transformer = seeded.blocks.find((block) => block.blockType === 'transformador_forca')!;
    const relatorio_id = seeded.relatorioId;
    const cell = (row: number) => h.clientOp(companyA, { kind: 'put', path: sheetTestCellPath(transformer.id, 'relacao_transformacao', row, 3), relatorio_id, value: measured('57.4', null) });
    // TAPS empty: the seeded row 0 is the table's, a tap row is not.
    const before = cell(0);
    const early = cell(12600);
    const first = await h.push(companyA, [before, early]);
    expect(first.rejected).toEqual([{ op_id: early.op_id, code: 'op_invalid' }]);
    const taps = h.clientOp(companyA, { kind: 'put', path: sheetNameplatePath(transformer.id, 'taps'), relatorio_id, value: measured('13.8;13.2;12.6;12;11.4', 'kV') });
    const onPlate = cell(12600);
    const offPlate = cell(12700);
    const rowZero = cell(0);
    const second = await h.push(companyA, [taps, onPlate, offPlate, rowZero]);
    expect(second.rejected).toEqual([
      { op_id: offPlate.op_id, code: 'op_invalid' },
      { op_id: rowZero.op_id, code: 'op_invalid' },
    ]);
    expect(second.applied.map((applied) => applied.op_id)).toEqual([taps.op_id, onPlate.op_id]);
    const row = await h.rowOf<BlockRow>(companyA, 'block', transformer.id);
    expect(row!.sheet.test.relacao_transformacao!.cells['12600']!['3']!.value).toEqual(measured('57.4', null));
    // Row 0's reading of before TAPS stays (off the plate, judged and printed by the kernel).
    expect(row!.sheet.test.relacao_transformacao!.cells['0']!['3']!.value).toEqual(measured('57.4', null));
  });
});

describe('e23z-INT item 3 a TTR row off the plate takes a clear through the route (no contract)', () => {
  it('a put of null on each filled cell of a tap dropped from TAPS is applied; a non-null put on it is refused', async () => {
    const seeded = await h.seedRelatorio(companyA);
    const transformer = seeded.blocks.find((block) => block.blockType === 'transformador_forca')!;
    const relatorio_id = seeded.relatorioId;
    const put = (row: number, col: number, value: unknown, prev_op_id: string | null = null) =>
      h.clientOp(companyA, { kind: 'put', path: sheetTestCellPath(transformer.id, 'relacao_transformacao', row, col), relatorio_id, value, prev_op_id });
    const taps = (value: string) => h.clientOp(companyA, { kind: 'put', path: sheetNameplatePath(transformer.id, 'taps'), relatorio_id, value: measured(value, 'kV') });
    // Five taps, the last read on two captures, then dropped from TAPS.
    const five = taps('13.8;13.2;12.6;12;11.4');
    const read = [put(11400, 3, measured('51.9', null)), put(11400, 4, measured('51.9', null))];
    const four = taps('13.8;13.2;12.6;12');
    const first = await h.push(companyA, [five, ...read, four]);
    expect(first.rejected).toEqual([]);
    // A value on the dropped row is refused; the clears of its two filled cells are applied.
    const value = put(11400, 3, measured('60', null), read[0]!.op_id);
    // As a device writes them: each names the cell's head op.
    const clears = [put(11400, 3, null, read[0]!.op_id), put(11400, 4, null, read[1]!.op_id)];
    const second = await h.push(companyA, [value, ...clears]);
    expect(second.rejected).toEqual([{ op_id: value.op_id, code: 'op_invalid' }]);
    expect(second.applied.map((applied) => applied.op_id)).toEqual(clears.map((op) => op.op_id));
    const row = await h.rowOf<BlockRow>(companyA, 'block', transformer.id);
    expect([3, 4].map((col) => row!.sheet.test.relacao_transformacao!.cells['11400']![String(col)]!.value)).toEqual([null, null]);
    // Cleared, the row holds nothing: even a clear is refused now.
    const third = await h.push(companyA, [put(11400, 3, null, clears[0]!.op_id)]);
    expect(third.rejected.map((rejected) => rejected.code)).toEqual(['op_invalid']);
  });

  it('speaks contract 40: a version-39 pull is answered 426 contract_outdated, the current one is answered', async () => {
    expect(CONTRACT_VERSION).toBeGreaterThanOrEqual(40);
    expect(MIN_CONTRACT_VERSION).toBeGreaterThanOrEqual(40);
    for (const path of ['/api/sync/company?since=0', `/api/sync/relatorios/${newId()}?since=0`, `/api/sync/projects/${newId()}?since=0`]) {
      const old = await h.authed(companyA, path, { headers: { 'x-contract-version': '39' } });
      expect(old.status, path).toBe(426);
      expect(((await old.json()) as { code?: string }).code).toBe('contract_outdated');
    }
    const current = await h.authed(companyA, '/api/sync/company?since=0', { headers: { 'x-contract-version': String(CONTRACT_VERSION) } });
    expect(current.status).toBe(200);
  });
});

describe('23.9-INT the applicability override through the route (contract 35)', () => {
  it('accepts "applied" and null on a test with a condition, refuses another value and a test without one', async () => {
    const definition = fusedCopy();
    const typeId = newId();
    const versionId = newId();
    const createType = h.clientOp(companyA, {
      kind: 'create',
      scope: 'company',
      path: equipmentTypePath(typeId),
      value: { id: typeId, derived_from: { seed_version: 'v13', block_type: 'chave_seccionadora' }, draft: definition, retired_at: null, removed_at: null, latest_version: 0 },
    });
    const publish = h.clientOp(companyA, {
      kind: 'create',
      scope: 'company',
      path: equipmentTypeVersionPath(versionId),
      value: { id: versionId, type_id: typeId, version: 1, definition, published_by: companyA.userId, published_at: new Date().toISOString() },
    });
    expect((await h.push(companyA, [createType, publish])).rejected).toEqual([]);

    const seeded = await h.seedRelatorio(companyA);
    const relatorio_id = seeded.relatorioId;
    const blockId = newId();
    const blockType = companyBlockType(typeId);
    const subBlocks = Object.fromEntries(companySubBlocksOf(definition).map((key) => [key, { enabled: key !== 'ia_ip_display' }]));
    const create = h.clientOp(companyA, {
      kind: 'create',
      path: `block/${blockId}`,
      relatorio_id,
      value: {
        id: blockId,
        relatorio_id,
        location_id: seeded.locationId,
        equipment_id: seeded.blocks[0]!.equipmentId,
        block_type: blockType,
        config: { block_type: blockType, sub_blocks: subBlocks, na_defaults: [], type_version: 1, type_version_id: versionId },
        seed_version: 'v13',
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
      },
    });
    const plate = h.clientOp(companyA, { kind: 'put', path: sheetNameplatePath(blockId, 'tipo_seccionadora'), relatorio_id, value: 'SEM CARGA' });
    expect((await h.push(companyA, [create, plate])).rejected).toEqual([]);

    const override = (testKey: string, value: unknown) => h.clientOp(companyA, { kind: 'put', path: sheetTestPath(blockId, testKey, 'applicability'), relatorio_id, value });
    const applied = override('resistencia_contato', 'applied');
    const wrongValue = override('resistencia_contato', 'sim');
    const noCondition = override('isolacao', 'applied');
    const result = await h.push(companyA, [applied, wrongValue, noCondition]);
    expect(result.rejected).toEqual([
      { op_id: wrongValue.op_id, code: 'op_invalid' },
      { op_id: noCondition.op_id, code: 'op_invalid' },
    ]);
    expect((await h.rowOf<BlockRow>(companyA, 'block', blockId))!.sheet.test.resistencia_contato!.applicability!.value).toBe('applied');
    const cleared = override('resistencia_contato', null);
    expect((await h.push(companyA, [cleared])).rejected).toEqual([]);
    expect((await h.rowOf<BlockRow>(companyA, 'block', blockId))!.sheet.test.resistencia_contato!.applicability!.value).toBeNull();
  });

  // Batch e23v (2026-11-09): contract 36 follows 35; a version-34 pull stays refused and the current one is answered.
  // Batch e23h (contract 37): the version-34 refusal stands; the current pull speaks the current number.
  it('speaks contract 35 or later: a version-34 pull is answered 426 contract_outdated', async () => {
    expect(CONTRACT_VERSION).toBeGreaterThanOrEqual(35);
    expect(MIN_CONTRACT_VERSION).toBeGreaterThanOrEqual(35);
    const old = await h.authed(companyA, '/api/sync/company?since=0', { headers: { 'x-contract-version': '34' } });
    expect(old.status).toBe(426);
    expect(((await old.json()) as { code?: string }).code).toBe('contract_outdated');
    const current = await h.authed(companyA, '/api/sync/company?since=0', { headers: { 'x-contract-version': String(CONTRACT_VERSION) } });
    expect(current.status).toBe(200);
  });
});
