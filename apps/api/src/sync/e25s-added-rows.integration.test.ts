import {
  asBlockDefinition,
  choiceValue,
  companyBlockType,
  companySubBlocksOf,
  CONTRACT_VERSION,
  equipmentTypePath,
  equipmentTypeVersionPath,
  evaluateSheetMeasurements,
  MIN_CONTRACT_VERSION,
  sheetTestRowCellPath,
  sheetTestRowPath,
  syncPullResponseSchema,
  type BlockRow,
  type EquipmentTypeVersionRow,
  type JsonValue,
  type Op,
} from '@app/domain';
import { ADDED_ROWS_DEFINITION, BATTERIES_TEST, NO_KEY_TEST, POINTS_TEST, reading } from '@app/domain/fixtures/added-rows';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../ids.ts';
import { companyA, routeHarness, type SeededRelatorio } from './rules.test-support.ts';

/*
 * 25.14-API-001 (Story 25.14, batch e25s, contract 54) through `POST /api/sync/ops` and the pulls: a row the technician
 * adds to a measurement test whose definition carries `added_rows`. On a seed only the v16 Malha's continuity test carries
 * the key (Story 25.16, "Adicionar ponto" alone), so the whole key's definition is the kernel's fixture company type (`@app/domain/fixtures/added-rows`), published by
 * company A and placed on a v16 relatório. The new paths (a row's name, which adds it; its readings; its removal and
 * restore) are applied and stored under the test; a test whose definition lacks the key, a seeded one, a row that
 * does not exist and a row past the test's maximum are refused `op_invalid`; two devices that each add a row keep
 * both; a version-53 pull of the relatório holding the row is answered 426 contract_outdated. Values invented.
 */

const h = routeHarness('tablet-e25s14');

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

const DEVICE_X = 'tablet-e25s14-x';
const DEVICE_Y = 'tablet-e25s14-y';

interface Placed {
  relatorio: SeededRelatorio;
  blockId: string;
  version: EquipmentTypeVersionRow;
}

/** Company A's fixture type, published as v1, and one block of it on a fresh v16 relatório, through the route. */
async function placed(): Promise<Placed> {
  const typeId = newId();
  const versionId = newId();
  const version = { id: versionId, type_id: typeId, version: 1, definition: ADDED_ROWS_DEFINITION, published_by: companyA.userId, published_at: new Date().toISOString() };
  const create = h.clientOp(companyA, {
    kind: 'create',
    scope: 'company',
    path: equipmentTypePath(typeId),
    value: { id: typeId, derived_from: null, draft: ADDED_ROWS_DEFINITION, retired_at: null, removed_at: null, latest_version: 0 },
  });
  const publish = h.clientOp(companyA, { kind: 'create', scope: 'company', path: equipmentTypeVersionPath(versionId), value: version });
  const published = await h.push(companyA, [create, publish]);
  expect(published.rejected, JSON.stringify(published.rejected)).toEqual([]);

  const relatorio = await h.seedRelatorio(companyA, new Date(), 'v16');
  const blockId = newId();
  const blockType = companyBlockType(typeId);
  const subBlocks = Object.fromEntries(companySubBlocksOf(ADDED_ROWS_DEFINITION).map((key) => [key, { enabled: true }]));
  const block = h.clientOp(companyA, {
    kind: 'create',
    path: `block/${blockId}`,
    relatorio_id: relatorio.relatorioId,
    value: {
      id: blockId,
      relatorio_id: relatorio.relatorioId,
      location_id: relatorio.locationId,
      equipment_id: relatorio.blocks[0]!.equipmentId,
      block_type: blockType,
      config: { block_type: blockType, sub_blocks: subBlocks, na_defaults: [], type_version: 1, type_version_id: versionId },
      seed_version: 'v16',
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
  const blocked = await h.push(companyA, [block]);
  expect(blocked.rejected, JSON.stringify(blocked.rejected)).toEqual([]);
  return { relatorio, blockId, version: version as unknown as EquipmentTypeVersionRow };
}

/** A put (or a `remove`) of company A on the relatório, from `deviceId` (the harness's device by default). */
function write(relatorioId: string, path: string, value: unknown, options: { kind?: 'put' | 'remove'; deviceId?: string } = {}): Op {
  return h.clientOp(companyA, { kind: options.kind ?? 'put', path, relatorio_id: relatorioId, value: value as JsonValue, ...(options.deviceId === undefined ? {} : { device_id: options.deviceId }) });
}

describe('25.14-API-001 a row added on the sheet through the route (contract 54)', () => {
  it('the new paths are applied and stored under the test: the name adds the row, a reading and a choice under it, a rename, a removal that keeps the readings and a restore', async () => {
    const { relatorio, blockId, version } = await placed();
    const rowId = newId();
    const batteryId = newId();
    const id = relatorio.relatorioId;
    const first = [
      write(id, sheetTestRowPath(blockId, POINTS_TEST, rowId, 'name'), null),
      write(id, sheetTestRowCellPath(blockId, POINTS_TEST, rowId, 0), reading('0.92', 'Ω')),
      write(id, sheetTestRowPath(blockId, POINTS_TEST, rowId, 'name'), 'Quadro geral de baixa tensão'),
      write(id, sheetTestRowPath(blockId, BATTERIES_TEST, batteryId, 'name'), 'Bateria 1'),
      write(id, sheetTestRowCellPath(blockId, BATTERIES_TEST, batteryId, 0), reading('13.6', 'V')),
      write(id, sheetTestRowCellPath(blockId, BATTERIES_TEST, batteryId, 1), choiceValue('ok')),
    ];
    const applied = await h.push(companyA, first);
    expect(applied.rejected, JSON.stringify(applied.rejected)).toEqual([]);
    expect(applied.applied).toHaveLength(first.length);

    const stored = (await h.rowOf<BlockRow>(companyA, 'block', blockId))!;
    const point = stored.sheet.test[POINTS_TEST]!.added_rows![rowId]!;
    expect(point.name!.value).toBe('Quadro geral de baixa tensão');
    expect(point.cells['0']!.value).toEqual(reading('0.92', 'Ω'));
    expect(stored.sheet.test[BATTERIES_TEST]!.added_rows![batteryId]!.cells['1']!.value).toEqual(choiceValue('ok'));
    // The server's row reads as the device's: the rows after the definition's, judged by their column's criterion.
    const definition = asBlockDefinition(version);
    const points = evaluateSheetMeasurements(stored, definition).find((test) => test.testKey === POINTS_TEST)!;
    expect(points.rows.map((row) => row.label)).toEqual(['Carcaças', 'Portas', 'Quadro geral de baixa tensão']);
    expect(points.rows[2]!.cells[0]!.verdict).toBe('out');

    // The removal keeps the readings under its tombstone; the restore brings both back.
    const removal = await h.push(companyA, [write(id, sheetTestRowPath(blockId, POINTS_TEST, rowId, 'removed_at'), null, { kind: 'remove' })]);
    expect(removal.rejected).toEqual([]);
    const removed = (await h.rowOf<BlockRow>(companyA, 'block', blockId))!.sheet.test[POINTS_TEST]!.added_rows![rowId]!;
    expect(removed.removed_at).not.toBeNull();
    expect(removed.cells['0']!.value).toEqual(reading('0.92', 'Ω'));
    const restore = await h.push(companyA, [write(id, sheetTestRowPath(blockId, POINTS_TEST, rowId, 'removed_at'), null)]);
    expect(restore.rejected).toEqual([]);
    const back = (await h.rowOf<BlockRow>(companyA, 'block', blockId))!;
    expect(back.sheet.test[POINTS_TEST]!.added_rows![rowId]!.removed_at).toBeNull();
    expect(evaluateSheetMeasurements(back, definition).find((test) => test.testKey === POINTS_TEST)!.rows.map((row) => row.label)).toEqual(['Carcaças', 'Portas', 'Quadro geral de baixa tensão']);

    // The relatório's stream carries every one of them to a current client.
    const pulled = await h.authed(companyA, `/api/sync/relatorios/${id}?since=0`, { headers: { 'x-contract-version': String(CONTRACT_VERSION) } });
    expect(pulled.status).toBe(200);
    const paths = (syncPullResponseSchema.parse(await pulled.json()).ops as { path: string }[]).map((op) => op.path);
    expect(paths).toContain(sheetTestRowCellPath(blockId, POINTS_TEST, rowId, 0));
    expect(paths).toContain(sheetTestRowPath(blockId, POINTS_TEST, rowId, 'removed_at'));
  });

  it('refused op_invalid: a test whose definition lacks the key, a seeded test, a reading of a row that does not exist, and a row past the test\'s maximum', async () => {
    const { relatorio, blockId } = await placed();
    const id = relatorio.relatorioId;
    const tp = relatorio.blocks.find((block) => block.blockType === 'tp')!;
    const onNoKey = write(id, sheetTestRowPath(blockId, NO_KEY_TEST, newId(), 'name'), 'Ponto');
    const onSeeded = write(id, sheetTestRowPath(tp.id, 'isolacao', newId(), 'name'), 'Ponto');
    const ghost = write(id, sheetTestRowCellPath(blockId, POINTS_TEST, newId(), 0), reading('0.1', 'Ω'));
    const tooLong = write(id, sheetTestRowPath(blockId, POINTS_TEST, newId(), 'name'), 'x'.repeat(81));
    const refused = await h.push(companyA, [onNoKey, onSeeded, ghost, tooLong]);
    expect(refused.rejected.map((one) => one.op_id).sort()).toEqual([onNoKey.op_id, onSeeded.op_id, ghost.op_id, tooLong.op_id].sort());
    const codes = new Map(refused.rejected.map((one) => [one.op_id, one.code]));
    expect([onNoKey, onSeeded, ghost].map((op) => codes.get(op.op_id))).toEqual(['op_invalid', 'op_invalid', 'op_invalid']);
    // A name over the cap is the push's value rule's to refuse first (Story 20.9), before the fold's own check.
    expect(codes.get(tooLong.op_id), JSON.stringify(refused.rejected)).toBe('op_value_invalid');

    // The batteries take 12; the thirteenth is refused, the twelve stand.
    const twelve = Array.from({ length: 12 }, (_, i) => write(id, sheetTestRowPath(blockId, BATTERIES_TEST, newId(), 'name'), `Bateria ${i + 1}`));
    expect((await h.push(companyA, twelve)).rejected).toEqual([]);
    const thirteenth = write(id, sheetTestRowPath(blockId, BATTERIES_TEST, newId(), 'name'), 'Bateria 13');
    const over = await h.push(companyA, [thirteenth]);
    expect(over.rejected.map((one) => [one.op_id, one.code])).toEqual([[thirteenth.op_id, 'op_invalid']]);
    const stored = (await h.rowOf<BlockRow>(companyA, 'block', blockId))!;
    expect(Object.keys(stored.sheet.test[BATTERIES_TEST]!.added_rows!)).toHaveLength(12);
    // Nothing of the refused ops reached the seeded TP's sheet.
    expect((await h.rowOf<BlockRow>(companyA, 'block', tp.id))!.sheet.test.isolacao?.added_rows).toBeUndefined();
  });

  it('two devices that each add a row while offline: both rows stand on the server, each with its reading; nothing merges two rows of one name', async () => {
    const { relatorio, blockId } = await placed();
    const id = relatorio.relatorioId;
    const x = newId();
    const y = newId();
    const fromX = [write(id, sheetTestRowPath(blockId, POINTS_TEST, x, 'name'), 'Ponto novo', { deviceId: DEVICE_X }), write(id, sheetTestRowCellPath(blockId, POINTS_TEST, x, 0), reading('0.2', 'Ω'), { deviceId: DEVICE_X })];
    const fromY = [write(id, sheetTestRowPath(blockId, POINTS_TEST, y, 'name'), 'Ponto novo', { deviceId: DEVICE_Y }), write(id, sheetTestRowCellPath(blockId, POINTS_TEST, y, 0), reading('0.3', 'Ω'), { deviceId: DEVICE_Y })];
    expect((await h.push(companyA, fromY)).rejected).toEqual([]);
    expect((await h.push(companyA, fromX)).rejected).toEqual([]);
    const rows = (await h.rowOf<BlockRow>(companyA, 'block', blockId))!.sheet.test[POINTS_TEST]!.added_rows!;
    expect(Object.keys(rows).sort()).toEqual([x, y].sort());
    expect(rows[x]!.cells['0']!.value).toEqual(reading('0.2', 'Ω'));
    expect(rows[y]!.cells['0']!.value).toEqual(reading('0.3', 'Ω'));
  });

  it('a version-53 client pulling the relatório that holds an added row is answered 426 contract_outdated; the current one is answered', async () => {
    expect(CONTRACT_VERSION).toBeGreaterThanOrEqual(54);
    expect(MIN_CONTRACT_VERSION).toBeGreaterThanOrEqual(54);
    const { relatorio, blockId } = await placed();
    const added = await h.push(companyA, [write(relatorio.relatorioId, sheetTestRowPath(blockId, POINTS_TEST, newId(), 'name'), 'Ponto')]);
    expect(added.rejected).toEqual([]);
    for (const path of [`/api/sync/relatorios/${relatorio.relatorioId}?since=0`, '/api/sync/company?since=0', `/api/sync/projects/${relatorio.projectId}?since=0`]) {
      const old = await h.authed(companyA, path, { headers: { 'x-contract-version': '53' } });
      expect(old.status, path).toBe(426);
      expect(((await old.json()) as { code?: string }).code).toBe('contract_outdated');
    }
    const current = await h.authed(companyA, `/api/sync/relatorios/${relatorio.relatorioId}?since=0`, { headers: { 'x-contract-version': String(CONTRACT_VERSION) } });
    expect(current.status).toBe(200);
  });
});
