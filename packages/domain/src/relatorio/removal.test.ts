import { describe, expect, it } from 'vitest';
import { entityKey, readPath } from '../ops/apply.ts';
import type { Op } from '../ops/op.ts';
import { invertBatch } from '../ops/outbox.ts';
import type { BlockRow, EquipmentRow, LocationRow } from '../schemas/entities.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import { atMinutes, idSequence, T0, TEST_PROJECT } from '../test-support.ts';
import { integrityFindings } from './integrity.ts';
import { ALL_HERE, blockIdOf, fold, locationId, removalFixture, removalOps, restoreOps, rowsIn, tagsOf, type RemovalFixture } from './removal.test-support.ts';
import {
  locationRemovalConfirmLabel,
  locationRemovalConfirmText,
  locationRemovalConfirmTitle,
  locationRemovalPlan,
  locationRemovedText,
  locationRestoreDetailText,
  locationRestoredText,
  locationRestorePlan,
  removedAncestorIds,
  RESTORE_REMOVED_LABEL,
  type LocationRemovalPlan,
} from './removal.ts';
import { restorableBlocks, restorableEntries } from './sumario.ts';
import { locationControlName, locationTree, newEquipmentBlock, treeNodes, type TreeEquipmentNode } from './tree.ts';

/*
 * 14.2-UNIT, second pass (2026-10-13): "Remover" of a coluna, a painel and a local in the
 * relatório tree and its restore. The plans on the fixture of `removal.test-support.ts`,
 * the batch folded by `applyOp` and inverted by `invertBatch`, the texts, and the restore
 * list. The readers of a removed location (the snapshot, the tree, the print) are in
 * `removal-readers.test.ts`.
 */

const T1 = atMinutes(T0, 10);
const T2 = atMinutes(T0, 20);
const T3 = atMinutes(T0, 30);
const T4 = atMinutes(T0, 40);
const iso = (at: Date) => at.toISOString();

/** The removal plan of a location on the fixture's rows as they are now, every relatório of the obra here. */
function planOf(f: RemovalFixture, id: string, over: Partial<Parameters<typeof locationRemovalPlan>[0]> = {}): LocationRemovalPlan | null {
  const rows = rowsIn(f.state);
  return locationRemovalPlan({ locations: rows.locations, blocks: rows.blocks, otherBlocks: [], locationId: id, projectId: TEST_PROJECT, relatorioId: f.relatorioId, visibility: ALL_HERE, ...over });
}

/** Removes a location: its plan turned into one batch at `at` and folded. */
function remove(f: RemovalFixture, id: string, at: Date): { plan: LocationRemovalPlan; ops: Op[] } {
  const plan = planOf(f, id);
  if (plan === null) throw new Error('the location is not live');
  const ops = removalOps(f.relatorioId, plan, at);
  fold(f.state, ops);
  return { plan, ops };
}

function restore(f: RemovalFixture, id: string, at: Date): Op[] {
  const plan = locationRestorePlan({ ...rowsIn(f.state), locationId: id });
  if (plan === null) throw new Error('the location is not removed');
  const ops = restoreOps(f.relatorioId, plan, at);
  fold(f.state, ops);
  return ops;
}

/** Removes one sheet on its own, as "Remover" of a sheet does: the block and its freed equipment. */
function removeSheet(f: RemovalFixture, tag: string, at: Date): string {
  const blockId = blockIdOf(f.state, tag);
  const block = rowsIn(f.state).blocks.find((row) => row.id === blockId)!;
  fold(f.state, removalOps(f.relatorioId, { locationIds: [], blockIds: [blockId], equipmentIds: [block.equipment_id!] }, at));
  return blockId;
}

const names = (f: RemovalFixture, ids: readonly string[]) => ids.map((id) => locationControlName(rowsIn(f.state).locations, id));
const equipmentTags = (f: RemovalFixture, ids: readonly string[]) => ids.map((id) => rowsIn(f.state).equipment.find((row) => row.id === id)!.tag);

describe('14.2-UNIT locationRemovalPlan', () => {
  it('a painel: itself, its colunas in tree order, every sheet on them and the equipment they free', () => {
    const f = removalFixture();
    const painel = locationId(f.state, 'Painel 1', 'Subestação');
    const plan = planOf(f, painel)!;
    expect(plan.kind).toBe('painel');
    expect(plan.locationId).toBe(painel);
    expect(names(f, plan.locationIds)).toEqual(['Painel 1 de Subestação', 'Coluna 1 de Painel 1 de Subestação', 'Coluna 2 de Painel 1 de Subestação']);
    expect(tagsOf(f.state, plan.blockIds)).toEqual(['SEC-C01', 'SEC-C01-2', 'DJ-C02', 'TP-C02']);
    expect(equipmentTags(f, plan.equipmentIds)).toEqual(['SEC-C01', 'SEC-C01-2', 'DJ-C02', 'TP-C02']);
    expect(plan.counts).toEqual({ paineis: 0, colunas: 2, sheets: 4 });
  });

  it('a local with sheets directly on it, a coluna directly under it and painéis: the local first, then tree order', () => {
    const f = removalFixture();
    const plan = planOf(f, locationId(f.state, 'Subestação'))!;
    expect(plan.kind).toBe('cabine');
    expect(names(f, plan.locationIds)).toEqual([
      'Subestação',
      'Coluna 9 de Subestação',
      'Painel 1 de Subestação',
      'Coluna 1 de Painel 1 de Subestação',
      'Coluna 2 de Painel 1 de Subestação',
      'Painel 2 de Subestação',
      'Coluna 1 de Painel 2 de Subestação',
    ]);
    expect(tagsOf(f.state, plan.blockIds)).toEqual(['TR-1', 'TR-2', 'DJ-C09', 'SEC-C01', 'SEC-C01-2', 'DJ-C02', 'TP-C02', 'SEC-C01-3']);
    expect(plan.equipmentIds).toHaveLength(8);
    expect(plan.counts).toEqual({ paineis: 2, colunas: 4, sheets: 8 });
    // The other local is untouched.
    expect(plan.locationIds).not.toContain(locationId(f.state, 'Geradores'));
    expect(plan.blockIds).not.toContain(blockIdOf(f.state, 'CE-GERADORES'));
  });

  it('a coluna of a painel and a coluna directly under a local: the coluna and its sheets alone', () => {
    const f = removalFixture();
    const legacy = planOf(f, locationId(f.state, 'Coluna 9', 'Subestação'))!;
    expect(legacy).toMatchObject({ kind: 'coluna', counts: { paineis: 0, colunas: 0, sheets: 1 } });
    expect(names(f, legacy.locationIds)).toEqual(['Coluna 9 de Subestação']);
    expect(tagsOf(f.state, legacy.blockIds)).toEqual(['DJ-C09']);
    const inPainel = planOf(f, locationId(f.state, 'Coluna 2', 'Painel 1'))!;
    expect(inPainel).toMatchObject({ kind: 'coluna', counts: { paineis: 0, colunas: 0, sheets: 2 } });
    expect(tagsOf(f.state, inPainel.blockIds)).toEqual(['DJ-C02', 'TP-C02']);
    // A location with nothing under it and no sheet: itself alone, every count zero.
    fold(f.state, removalOps(f.relatorioId, { locationIds: [], blockIds: [blockIdOf(f.state, 'CE-GERADORES')], equipmentIds: [] }, T1));
    expect(planOf(f, locationId(f.state, 'Geradores'))).toMatchObject({ kind: 'cabine', blockIds: [], equipmentIds: [], counts: { paineis: 0, colunas: 0, sheets: 0 } });
  });

  it('a sheet and a coluna already removed inside are skipped: they left before and keep their own timestamp', () => {
    const f = removalFixture();
    const gone = removeSheet(f, 'SEC-C01-2', T1);
    const coluna2 = locationId(f.state, 'Coluna 2', 'Painel 1');
    remove(f, coluna2, T2);
    const plan = planOf(f, locationId(f.state, 'Painel 1', 'Subestação'))!;
    expect(names(f, plan.locationIds)).toEqual(['Painel 1 de Subestação', 'Coluna 1 de Painel 1 de Subestação']);
    expect(plan.locationIds).not.toContain(coluna2);
    expect(tagsOf(f.state, plan.blockIds)).toEqual(['SEC-C01']);
    expect(plan.blockIds).not.toContain(gone);
    expect(equipmentTags(f, plan.equipmentIds)).toEqual(['SEC-C01']);
    expect(plan.counts).toEqual({ paineis: 0, colunas: 1, sheets: 1 });
  });

  it('null for a location that is not live: removed, under a removed location, or unknown', () => {
    const f = removalFixture();
    const painel = locationId(f.state, 'Painel 1', 'Subestação');
    const coluna1 = locationId(f.state, 'Coluna 1', 'Painel 1');
    // Only the painel's own row is tombstoned: its coluna is live by its row and hidden by the rule.
    fold(f.state, removalOps(f.relatorioId, { locationIds: [painel], blockIds: [], equipmentIds: [] }, T1));
    expect(planOf(f, painel)).toBeNull();
    expect(planOf(f, coluna1)).toBeNull();
    expect(planOf(f, '019966b0-0159-7000-8000-000000000001')).toBeNull();
    expect(planOf(f, locationId(f.state, 'Painel 2', 'Subestação'))).not.toBeNull();
  });

  describe('the equipment a removal frees', () => {
    /** The fixture with the two seccionadoras of Painel 1 › Coluna 1 edited by `edit`, and the plan of Painel 1 on it. */
    const shared = (edit: (blocks: BlockRow[], f: RemovalFixture) => BlockRow[], over: Partial<Parameters<typeof locationRemovalPlan>[0]> = {}) => {
      const f = removalFixture();
      const rows = rowsIn(f.state);
      const blocks = edit(rows.blocks, f);
      const plan = locationRemovalPlan({
        locations: rows.locations,
        blocks,
        otherBlocks: [],
        locationId: locationId(f.state, 'Painel 1', 'Subestação'),
        projectId: TEST_PROJECT,
        relatorioId: f.relatorioId,
        visibility: ALL_HERE,
        ...over,
      })!;
      return { f, plan, tags: equipmentTags(f, plan.equipmentIds) };
    };
    const equipmentIdOf = (f: RemovalFixture, tag: string) => rowsIn(f.state).equipment.find((row) => row.tag === tag)!.id;
    const pointAt = (f: RemovalFixture, blocks: BlockRow[], tag: string, toTag: string) =>
      blocks.map((block) => (block.id === blockIdOf(f.state, tag) ? { ...block, equipment_id: equipmentIdOf(f, toTag) } : block));

    it('an equipment two sheets of the removal share is freed, and once', () => {
      // SEC-C01-2's sheet holds SEC-C01's equipment: both sheets leave, so nothing else holds it.
      const { tags, plan } = shared((blocks, f) => pointAt(f, blocks, 'SEC-C01-2', 'SEC-C01'));
      expect(tags).toEqual(['SEC-C01', 'DJ-C02', 'TP-C02']);
      expect(plan.blockIds).toHaveLength(4);
    });

    it('an equipment a sheet outside the removal holds stays live', () => {
      // The sheet of Painel 2 holds SEC-C01's equipment and stays in the relatório.
      const { tags } = shared((blocks, f) => pointAt(f, blocks, 'SEC-C01-3', 'SEC-C01'));
      expect(tags).toEqual(['SEC-C01-2', 'DJ-C02', 'TP-C02']);
    });

    it('an equipment a live sheet of another relatório of the obra holds stays live; a removed one does not hold it', () => {
      const other = (f: RemovalFixture, removed_at: string | null) => [{ id: '019966b0-0159-7000-8000-000000000002', equipment_id: equipmentIdOf(f, 'DJ-C02'), removed_at }];
      const f = removalFixture();
      expect(equipmentTags(f, planOf(f, locationId(f.state, 'Painel 1', 'Subestação'), { otherBlocks: other(f, null) })!.equipmentIds)).toEqual(['SEC-C01', 'SEC-C01-2', 'TP-C02']);
      expect(equipmentTags(f, planOf(f, locationId(f.state, 'Painel 1', 'Subestação'), { otherBlocks: other(f, iso(T1)) })!.equipmentIds)).toEqual(['SEC-C01', 'SEC-C01-2', 'DJ-C02', 'TP-C02']);
    });

    it('nothing is freed while a relatório of the obra this device cannot see may hold it', () => {
      const f = removalFixture();
      const painel = locationId(f.state, 'Painel 1', 'Subestação');
      // The company stream not pulled to the end: an empty summary says nothing.
      expect(planOf(f, painel, { visibility: { ...ALL_HERE, companyDownloaded: false } })).toMatchObject({ equipmentIds: [], counts: { sheets: 4 } });
      // Another relatório of the obra the summary lists is not held here.
      const elsewhere = { id: '019966b0-0159-7000-8000-000000000003', project_id: TEST_PROJECT };
      expect(planOf(f, painel, { visibility: { ...ALL_HERE, summaries: [elsewhere] } })!.equipmentIds).toEqual([]);
      // Held and pulled to the end: it was asked (`otherBlocks` holds none of these), so they are freed.
      expect(planOf(f, painel, { visibility: { ...ALL_HERE, summaries: [elsewhere], heldRelatorioIds: [elsewhere.id], downloadedStreamIds: [elsewhere.id] } })!.equipmentIds).toHaveLength(4);
      // The sheets leave either way: every one carries its own tombstone.
      expect(planOf(f, painel, { visibility: { ...ALL_HERE, companyDownloaded: false } })!.blockIds).toHaveLength(4);
    });
  });
});

describe('14.2-UNIT a removal batch through applyOp', () => {
  const pick = (f: RemovalFixture) => {
    const rows = rowsIn(f.state);
    const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((row) => [row.id, row]));
    return { locations: byId(rows.locations), blocks: byId(rows.blocks), equipment: byId(rows.equipment) };
  };

  it('every row of one removal carries the batch timestamp, and the rest of the relatório is untouched', () => {
    const f = removalFixture();
    const before = pick(f);
    const { plan, ops } = remove(f, locationId(f.state, 'Painel 1', 'Subestação'), T1);
    // The order the surface writes: the location removes (target first), the block removes, the equipment removes.
    expect(ops.map((op) => `${op.kind} ${op.path}`)).toEqual([
      ...plan.locationIds.map((id) => `remove location/${id}/removed_at`),
      ...plan.blockIds.map((id) => `remove block/${id}/removed_at`),
      ...plan.equipmentIds.map((id) => `remove equipment/${id}/removed_at`),
    ]);
    expect(new Set(ops.map((op) => op.client_ts))).toEqual(new Set([iso(T1)]));
    const after = pick(f);
    for (const id of plan.locationIds) expect(after.locations.get(id)!.removed_at).toBe(iso(T1));
    for (const id of plan.blockIds) expect(after.blocks.get(id)!.removed_at).toBe(iso(T1));
    for (const id of plan.equipmentIds) expect(after.equipment.get(id)!.removed_at).toBe(iso(T1));
    const touched = new Set([...plan.locationIds, ...plan.blockIds, ...plan.equipmentIds]);
    for (const table of ['locations', 'blocks', 'equipment'] as const) {
      for (const [id, row] of after[table]) if (!touched.has(id)) expect(row).toBe(before[table].get(id));
    }
    // The removed painel is out of the snapshot with everything under it.
    const snapshot = buildSnapshot(f.state, f.relatorioId);
    expect(snapshot.locations.map((row) => row.name).sort()).toEqual(['Coluna 1', 'Coluna 9', 'Geradores', 'Painel 2', 'Subestação']);
    expect(snapshot.locations.some((row) => plan.locationIds.includes(row.id))).toBe(false);
    expect(snapshot.blocks.some((row) => plan.blockIds.includes(row.id))).toBe(false);
    expect(snapshot.equipment.map((row) => row.tag).sort()).toEqual(['CE-GERADORES', 'DJ-C09', 'SEC-C01-3', 'TR-1', 'TR-2']);
  });

  it('"Desfazer": the batch inverted by invertBatch gives back the starting rows, for a painel, a coluna and a local', () => {
    for (const [name, parent] of [['Painel 1', 'Subestação'], ['Coluna 2', 'Painel 1'], ['Coluna 9', 'Subestação'], ['Subestação', null]] as const) {
      const f = removalFixture();
      const start = new Map(f.state);
      const plan = planOf(f, locationId(f.state, name, parent))!;
      const ops = removalOps(f.relatorioId, plan, T1);
      // What each path held before its op applied, as the commit path records it (`readPath`).
      const before = new Map<string, unknown>();
      const state = new Map(f.state);
      for (const op of ops) {
        before.set(op.op_id, readPath(state, op));
        fold(state, [op]);
      }
      const inverses = invertBatch(ops, before, { newId: idSequence('019966b0-0154-7000-8000-'), now: T2 });
      expect(inverses).toHaveLength(ops.length);
      expect(inverses.every((op) => op.kind === 'put' && op.value === null)).toBe(true);
      fold(state, inverses);
      expect(state.size, name).toBe(start.size);
      for (const [key, row] of start) expect(state.get(key), `${name}: ${key}`).toEqual(row);
    }
  });
});

describe('14.2-UNIT locationRestorePlan', () => {
  it('brings back the location, the locations and sheets that left in the same removal, and the equipment it freed', () => {
    const f = removalFixture();
    const start = new Map(f.state);
    const painel = locationId(f.state, 'Painel 1', 'Subestação');
    const removal = remove(f, painel, T1).plan;
    const plan = locationRestorePlan({ ...rowsIn(f.state), locationId: painel })!;
    expect(plan.kind).toBe('painel');
    expect(plan.locationId).toBe(painel);
    expect(plan.locationIds).toEqual(removal.locationIds);
    expect(plan.blockIds).toEqual(removal.blockIds);
    expect(plan.equipmentIds).toEqual(removal.equipmentIds);
    expect(plan.counts).toEqual({ paineis: 0, colunas: 2, sheets: 4 });
    // The restore's batch folded: the starting rows again.
    fold(f.state, restoreOps(f.relatorioId, plan, T2));
    for (const [key, row] of start) expect(f.state.get(key), key).toEqual(row);
  });

  it('a sheet and a coluna removed on their own before the painel stay removed', () => {
    const f = removalFixture();
    const sheet = removeSheet(f, 'SEC-C01-2', T1);
    const coluna2 = locationId(f.state, 'Coluna 2', 'Painel 1');
    const colunaPlan = remove(f, coluna2, T2).plan;
    const painel = locationId(f.state, 'Painel 1', 'Subestação');
    remove(f, painel, T3);
    const plan = locationRestorePlan({ ...rowsIn(f.state), locationId: painel })!;
    expect(names(f, plan.locationIds)).toEqual(['Painel 1 de Subestação', 'Coluna 1 de Painel 1 de Subestação']);
    expect(tagsOf(f.state, plan.blockIds)).toEqual(['SEC-C01']);
    expect(equipmentTags(f, plan.equipmentIds)).toEqual(['SEC-C01']);
    expect(plan.counts).toEqual({ paineis: 0, colunas: 1, sheets: 1 });
    fold(f.state, restoreOps(f.relatorioId, plan, T4));
    const rows = rowsIn(f.state);
    expect(rows.locations.find((row) => row.id === painel)!.removed_at).toBeNull();
    expect(rows.locations.find((row) => row.id === coluna2)!.removed_at).toBe(iso(T2));
    expect(rows.blocks.find((row) => row.id === sheet)!.removed_at).toBe(iso(T1));
    for (const id of colunaPlan.blockIds) expect(rows.blocks.find((row) => row.id === id)!.removed_at).toBe(iso(T2));
    for (const id of colunaPlan.equipmentIds) expect(rows.equipment.find((row) => row.id === id)!.removed_at).toBe(iso(T2));
  });

  it('a location under a removed one comes back with the removed rows above it, those rows alone', () => {
    const f = removalFixture();
    const coluna1 = locationId(f.state, 'Coluna 1', 'Painel 1');
    const coluna2 = locationId(f.state, 'Coluna 2', 'Painel 1');
    const painel = locationId(f.state, 'Painel 1', 'Subestação');
    remove(f, coluna1, T1);
    remove(f, painel, T2);
    const rows = rowsIn(f.state);
    expect(removedAncestorIds(rows.locations, coluna1)).toEqual([painel, coluna1]);
    expect(removedAncestorIds(rows.locations, coluna2)).toEqual([painel, coluna2]);
    expect(removedAncestorIds(rows.locations, painel)).toEqual([painel]);
    expect(removedAncestorIds(rows.locations, locationId(f.state, 'Coluna 1', 'Painel 2'))).toEqual([]);
    expect(removedAncestorIds(rows.locations, null)).toEqual([]);
    expect(removedAncestorIds(rows.locations, '019966b0-0159-7000-8000-000000000004')).toEqual([]);
    const plan = locationRestorePlan({ ...rows, locationId: coluna1 })!;
    // The painel comes back alone, root first; Coluna 2 left in the painel's removal and stays out.
    expect(plan.locationIds).toEqual([painel, coluna1]);
    expect(tagsOf(f.state, plan.blockIds)).toEqual(['SEC-C01', 'SEC-C01-2']);
    expect(plan.counts).toEqual({ paineis: 0, colunas: 0, sheets: 2 });
    fold(f.state, restoreOps(f.relatorioId, plan, T3));
    const snapshot = buildSnapshot(f.state, f.relatorioId);
    expect(snapshot.locations.filter((row) => row.parent_id === painel).map((row) => row.id)).toEqual([coluna1]);
    expect(rowsIn(f.state).locations.find((row) => row.id === coluna2)!.removed_at).toBe(iso(T2));
  });

  it('counts what becomes visible: a coluna and the sheets another device left live under the removed painel', () => {
    const f = removalFixture();
    const painel = locationId(f.state, 'Painel 1', 'Subestação');
    const coluna1 = locationId(f.state, 'Coluna 1', 'Painel 1');
    remove(f, painel, T1);
    // Another device, not having seen the removal: a new coluna with a sheet, and a sheet in Coluna 1.
    const coluna3: LocationRow = { id: '019966b0-0159-7000-8000-000000000010', relatorio_id: f.relatorioId, parent_id: painel, kind: 'coluna', name: 'Coluna 3', order_key: 'a2', removed_at: null };
    const sheet = (n: number, at: string, tag: string) =>
      newEquipmentBlock({ blockId: `019966b0-0159-7000-8000-0000000000${n}1`, equipmentId: `019966b0-0159-7000-8000-0000000000${n}2`, relatorioId: f.relatorioId, projectId: TEST_PROJECT, locationId: at, type: 'tc', tag, seedVersion: 'v3', orderKey: 'z0' });
    const a = sheet(2, coluna3.id, 'TC-C03');
    const b = sheet(3, coluna1, 'TC-C01');
    f.state.set(entityKey('location', coluna3.id), coluna3);
    for (const row of [a, b]) {
      f.state.set(entityKey('block', row.block.id), row.block);
      f.state.set(entityKey('equipment', row.equipment.id), row.equipment);
    }
    const plan = locationRestorePlan({ ...rowsIn(f.state), locationId: painel })!;
    // Coluna 3 and the two new sheets are not removed, so nothing is written for them.
    expect(plan.locationIds).not.toContain(coluna3.id);
    expect(plan.blockIds).toHaveLength(4);
    expect(plan.blockIds).not.toContain(a.block.id);
    expect(plan.blockIds).not.toContain(b.block.id);
    expect(plan.counts).toEqual({ paineis: 0, colunas: 3, sheets: 6 });
  });

  it('an equipment another sheet kept live is left as it is; null for a location that is not removed', () => {
    const f = removalFixture();
    const painel = locationId(f.state, 'Painel 1', 'Subestação');
    expect(locationRestorePlan({ ...rowsIn(f.state), locationId: painel })).toBeNull();
    expect(locationRestorePlan({ ...rowsIn(f.state), locationId: '019966b0-0159-7000-8000-000000000005' })).toBeNull();
    // The removal left every equipment live (the device could not see the whole obra).
    const plan = planOf(f, painel, { visibility: { ...ALL_HERE, companyDownloaded: false } })!;
    fold(f.state, removalOps(f.relatorioId, plan, T1));
    const back = locationRestorePlan({ ...rowsIn(f.state), locationId: painel })!;
    expect(back.blockIds).toHaveLength(4);
    expect(back.equipmentIds).toEqual([]);
    // A coluna that left with the painel has a plan of its own: the painel comes back above it.
    expect(locationRestorePlan({ ...rowsIn(f.state), locationId: locationId(f.state, 'Coluna 1', 'Painel 1') })!.locationIds[0]).toBe(painel);
  });

  it('"Desfazer" of a restore puts the same timestamp back, so the removal is still one group', () => {
    const f = removalFixture();
    const painel = locationId(f.state, 'Painel 1', 'Subestação');
    remove(f, painel, T1);
    const removed = new Map(f.state);
    const plan = locationRestorePlan({ ...rowsIn(f.state), locationId: painel })!;
    const ops = restoreOps(f.relatorioId, plan, T2);
    const before = new Map<string, unknown>();
    for (const op of ops) {
      before.set(op.op_id, readPath(f.state, op));
      fold(f.state, [op]);
    }
    expect([...before.values()].every((value) => value === iso(T1))).toBe(true);
    fold(f.state, invertBatch(ops, before, { newId: idSequence('019966b0-0155-7000-8000-'), now: T3 }));
    const rows = rowsIn(f.state);
    for (const id of plan.locationIds) expect(rows.locations.find((row) => row.id === id)!.removed_at).toBe(iso(T1));
    for (const id of plan.blockIds) expect(rows.blocks.find((row) => row.id === id)!.removed_at).toBe(iso(T1));
    for (const id of plan.equipmentIds) expect(rows.equipment.find((row) => row.id === id)!.removed_at).toBe(iso(T1));
    for (const [key, row] of removed) expect(f.state.get(key), key).toEqual(row);
    expect(locationRestorePlan({ ...rowsIn(f.state), locationId: painel })).toEqual(plan);
  });
});

describe('14.2-UNIT the texts of a location removal', () => {
  it('the confirmation: its title names the control name, its sentence the counts, its button the verb', () => {
    expect(locationRemovalConfirmTitle('Coluna 1 de Painel 1 de Cubículo Enel')).toBe('Remover Coluna 1 de Painel 1 de Cubículo Enel?');
    const tail = ' do relatório. Dá para recuperar até a emissão, em "Restaurar ficha removida".';
    expect(RESTORE_REMOVED_LABEL).toBe('Restaurar ficha removida');
    expect(locationRemovalConfirmText('painel', { paineis: 0, colunas: 2, sheets: 5 })).toBe(`O painel, 2 colunas e 5 fichas saem${tail}`);
    expect(locationRemovalConfirmText('coluna', { paineis: 0, colunas: 0, sheets: 1 })).toBe(`A coluna e 1 ficha saem${tail}`);
    expect(locationRemovalConfirmText('cabine', { paineis: 1, colunas: 2, sheets: 7 })).toBe(`O local, 1 painel, 2 colunas e 7 fichas saem${tail}`);
    expect(locationRemovalConfirmText('cabine', { paineis: 2, colunas: 1, sheets: 0 })).toBe(`O local, 2 painéis e 1 coluna saem${tail}`);
    // A zero part is left out; with nothing under it the verb is singular.
    expect(locationRemovalConfirmText('cabine', { paineis: 0, colunas: 0, sheets: 3 })).toBe(`O local e 3 fichas saem${tail}`);
    expect(locationRemovalConfirmText('painel', { paineis: 0, colunas: 0, sheets: 0 })).toBe(`O painel sai${tail}`);
    expect(locationRemovalConfirmLabel('coluna')).toBe('Remover coluna');
    expect(locationRemovalConfirmLabel('painel')).toBe('Remover painel');
    expect(locationRemovalConfirmLabel('cabine')).toBe('Remover local');
  });

  it('the announcements name the location by its control name, the participle agreeing with its kind', () => {
    expect(locationRemovedText('coluna', 'Coluna 1 de Painel 1 de Cubículo Enel')).toBe('Coluna 1 de Painel 1 de Cubículo Enel removida');
    expect(locationRemovedText('coluna', 'Entrada de Painel 1 de Cubículo Enel')).toBe('Coluna Entrada de Painel 1 de Cubículo Enel removida');
    expect(locationRemovedText('painel', 'Painel 1 de Cubículo Enel')).toBe('Painel 1 de Cubículo Enel removido');
    expect(locationRemovedText('cabine', 'Cubículo Enel')).toBe('Local Cubículo Enel removido');
    expect(locationRemovedText('cabine', 'Cabine primária')).toBe('Cabine primária removida');
    expect(locationRestoredText('painel', 'Painel 1 de Cubículo Enel')).toBe('Painel 1 de Cubículo Enel restaurado');
    expect(locationRestoredText('coluna', 'Coluna 1 de Painel 1 de Cubículo Enel')).toBe('Coluna 1 de Painel 1 de Cubículo Enel restaurada');
    expect(locationRestoredText('cabine', 'Geradores')).toBe('Local Geradores restaurado');
  });

  it('the restore entry detail: the kind, then what comes back with it', () => {
    expect(locationRestoreDetailText('painel', { paineis: 0, colunas: 2, sheets: 5 })).toBe('Painel · 2 colunas · 5 fichas');
    expect(locationRestoreDetailText('coluna', { paineis: 0, colunas: 0, sheets: 3 })).toBe('Coluna · 3 fichas');
    expect(locationRestoreDetailText('coluna', { paineis: 0, colunas: 0, sheets: 1 })).toBe('Coluna · 1 ficha');
    expect(locationRestoreDetailText('cabine', { paineis: 1, colunas: 2, sheets: 7 })).toBe('Local · 1 painel · 2 colunas · 7 fichas');
    expect(locationRestoreDetailText('cabine', { paineis: 0, colunas: 0, sheets: 0 })).toBe('Local');
  });
});

describe('14.2-UNIT restorableEntries', () => {
  const entries = (f: RemovalFixture, since: string | null = null) => restorableEntries({ ...rowsIn(f.state), since });
  const labels = (f: RemovalFixture, since: string | null = null) => entries(f, since).map((entry) => entry.label);

  it('one entry per removed location, told by its kind, its control name and what comes back with it', () => {
    const f = removalFixture();
    expect(entries(f)).toEqual([]);
    const painel = locationId(f.state, 'Painel 1', 'Subestação');
    remove(f, painel, T1);
    // The colunas and the sheets that left with the painel are not listed: they come back with it.
    expect(entries(f)).toEqual([
      {
        kind: 'location',
        locationKind: 'painel',
        id: painel,
        name: 'Painel 1 de Subestação',
        detail: 'Painel · 2 colunas · 4 fichas',
        label: 'Painel 1 de Subestação — Painel · 2 colunas · 4 fichas',
        removed_at: iso(T1),
      },
    ]);
    const coluna = locationId(f.state, 'Coluna 9', 'Subestação');
    remove(f, coluna, T2);
    remove(f, locationId(f.state, 'Geradores'), T3);
    // Newest removal first.
    expect(entries(f).map((entry) => [entry.kind === 'location' ? entry.locationKind : 'block', entry.name, entry.detail])).toEqual([
      ['cabine', 'Geradores', 'Local · 1 ficha'],
      ['coluna', 'Coluna 9 de Subestação', 'Coluna · 1 ficha'],
      ['painel', 'Painel 1 de Subestação', 'Painel · 2 colunas · 4 fichas'],
    ]);
  });

  it('a local: one entry for everything under it; with nothing under it, the kind alone', () => {
    const f = removalFixture();
    remove(f, locationId(f.state, 'Subestação'), T1);
    expect(labels(f)).toEqual(['Subestação — Local · 2 painéis · 4 colunas · 8 fichas']);
    const g = removalFixture();
    removeSheet(g, 'CE-GERADORES', T1);
    remove(g, locationId(g.state, 'Geradores'), T2);
    // The sheet removed on its own before is not counted (it stays removed) nor listed (its location is not live).
    expect(entries(g).map((entry) => [entry.kind, entry.name, entry.detail])).toEqual([['location', 'Geradores', 'Local']]);
  });

  it('a sheet removed on its own before its location is listed by itself only while its location is live', () => {
    const f = removalFixture();
    const sheet = removeSheet(f, 'SEC-C01-2', T1);
    const painel = locationId(f.state, 'Painel 1', 'Subestação');
    expect(entries(f)).toEqual([
      { kind: 'block', id: sheet, name: 'SEC-C01-2', detail: 'Subestação › Painel 1 › Coluna 1', label: 'SEC-C01-2 — Subestação › Painel 1 › Coluna 1', equipmentId: expect.any(String), removed_at: iso(T1) },
    ]);
    remove(f, painel, T2);
    expect(entries(f).map((entry) => [entry.kind, entry.name, entry.detail])).toEqual([['location', 'Painel 1 de Subestação', 'Painel · 2 colunas · 3 fichas']]);
    restore(f, painel, T3);
    // The painel is back with what left with it; the sheet removed before is listed by itself again.
    expect(entries(f).map((entry) => [entry.kind, entry.name])).toEqual([['block', 'SEC-C01-2']]);
    expect(rowsIn(f.state).blocks.find((row) => row.id === sheet)!.removed_at).toBe(iso(T1));
  });

  it('a location removed on its own under a location removed later shows up once its parent is back', () => {
    const f = removalFixture();
    const coluna2 = locationId(f.state, 'Coluna 2', 'Painel 1');
    const painel = locationId(f.state, 'Painel 1', 'Subestação');
    remove(f, coluna2, T1);
    expect(labels(f)).toEqual(['Coluna 2 de Painel 1 de Subestação — Coluna · 2 fichas']);
    remove(f, painel, T2);
    expect(labels(f)).toEqual(['Painel 1 de Subestação — Painel · 1 coluna · 2 fichas']);
    restore(f, painel, T3);
    expect(labels(f)).toEqual(['Coluna 2 de Painel 1 de Subestação — Coluna · 2 fichas']);
    restore(f, coluna2, T4);
    expect(entries(f)).toEqual([]);
  });

  it('cuts at the newest revision: a removal before it is part of what was issued, for a location as for a sheet', () => {
    const f = removalFixture();
    removeSheet(f, 'TR-2', T1);
    remove(f, locationId(f.state, 'Painel 1', 'Subestação'), T2);
    remove(f, locationId(f.state, 'Coluna 9', 'Subestação'), T3);
    expect(entries(f).map((entry) => entry.name)).toEqual(['Coluna 9 de Subestação', 'Painel 1 de Subestação', 'TR-2']);
    expect(entries(f, iso(T1)).map((entry) => entry.name)).toEqual(['Coluna 9 de Subestação', 'Painel 1 de Subestação']);
    expect(entries(f, iso(T2)).map((entry) => entry.name)).toEqual(['Coluna 9 de Subestação']);
    expect(entries(f, iso(T3))).toEqual([]);
  });

  it('labels are unique across the whole list, locations and sheets together', () => {
    const f = removalFixture();
    const local = locationId(f.state, 'Subestação');
    // Two empty painéis of the same name under one local, removed one after the other.
    const painel = (n: number): LocationRow => ({ id: `019966b0-0159-7000-8000-00000000002${n}`, relatorio_id: f.relatorioId, parent_id: local, kind: 'painel', name: 'Painel 3', order_key: `b${n}`, removed_at: null });
    for (const row of [painel(1), painel(2)]) f.state.set(entityKey('location', row.id), row);
    remove(f, painel(1).id, T1);
    remove(f, painel(2).id, T2);
    removeSheet(f, 'TR-1', T3);
    expect(labels(f)).toEqual(['TR-1 — Subestação', 'Painel 3 de Subestação — Painel', 'Painel 3 de Subestação — Painel (2)']);
    expect(new Set(labels(f)).size).toBe(3);
    // The block half keeps `restorableBlocks`' shape and order.
    const rows = rowsIn(f.state);
    const blocksOnly = restorableBlocks(rows.blocks, rows.equipment, rows.locations, null);
    expect(entries(f).filter((entry) => entry.kind === 'block')).toEqual(blocksOnly.map((row) => ({ ...row, kind: 'block' })));
  });

  it('a restored TAG that was reused meanwhile is marked as a duplicate on both rows', () => {
    const f = removalFixture();
    const painel = locationId(f.state, 'Painel 1', 'Subestação');
    const original = blockIdOf(f.state, 'SEC-C01');
    remove(f, painel, T1);
    // SEC-C01 is free now: a new sheet of Painel 2 takes it.
    const reused = newEquipmentBlock({
      blockId: '019966b0-0159-7000-8000-000000000031',
      equipmentId: '019966b0-0159-7000-8000-000000000032',
      relatorioId: f.relatorioId,
      projectId: TEST_PROJECT,
      locationId: locationId(f.state, 'Coluna 1', 'Painel 2'),
      type: 'chave_seccionadora',
      tag: 'SEC-C01',
      seedVersion: 'v3',
      orderKey: 'z0',
    });
    f.state.set(entityKey('block', reused.block.id), reused.block);
    f.state.set(entityKey('equipment', reused.equipment.id), reused.equipment);
    const duplicates = () => {
      const snapshot = buildSnapshot(f.state, f.relatorioId);
      const equipment: EquipmentRow[] = rowsIn(f.state).equipment;
      return {
        marked: treeNodes(locationTree(snapshot, equipment))
          .filter((node): node is TreeEquipmentNode => node.kind === 'equipment' && node.duplicate)
          .map((node) => node.blockId),
        findings: integrityFindings({ equipment }).map((finding) => finding.tag),
      };
    };
    expect(duplicates()).toEqual({ marked: [], findings: [] });
    // The restore is not refused: both sheets come up marked.
    restore(f, painel, T2);
    const after = duplicates();
    expect(after.marked.sort()).toEqual([original, reused.block.id].sort());
    expect(after.findings).toHaveLength(1);
  });
});
