import { describe, expect, it } from 'vitest';
import { entityKey, readPath } from '../ops/apply.ts';
import type { Op } from '../ops/op.ts';
import { invertBatch } from '../ops/outbox.ts';
import { sortByOrderKey } from '../ops/order-key.ts';
import type { BlockRow, EquipmentRow, LocationRow } from '../schemas/entities.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import { getDefinition } from '../seed/definitions.ts';
import { holdsConflictMarks } from '../merge/conflicts.ts';
import { stampSeen } from '../merge/stamp.ts';
import { atMinutes, idSequence, opFactory, T0, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { integrityFindings } from './integrity.ts';
import { ALL_HERE, blockIdOf, fold, locationId, removalFixture, removalOps, restoreOps, rowsIn, tagsOf, type RemovalFixture } from './removal.test-support.ts';
import {
  locationRemovalAsks,
  locationRemovalConfirmLabel,
  locationRemovalConfirmText,
  locationRemovalConfirmTitle,
  locationRemovalPlan,
  locationRemovedText,
  locationRestoreDetailText,
  locationRestoredText,
  locationRestorePlan,
  removedAncestorIds,
  restoredOrderKey,
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
    expect(plan.counts).toEqual({ paineis: 0, colunas: 2, sheets: 4, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 });
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
    expect(plan.counts).toEqual({ paineis: 2, colunas: 4, sheets: 8, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 });
    // The other local is untouched.
    expect(plan.locationIds).not.toContain(locationId(f.state, 'Geradores'));
    expect(plan.blockIds).not.toContain(blockIdOf(f.state, 'CE-GERADORES'));
  });

  it('a coluna of a painel and a coluna directly under a local: the coluna and its sheets alone', () => {
    const f = removalFixture();
    const legacy = planOf(f, locationId(f.state, 'Coluna 9', 'Subestação'))!;
    expect(legacy).toMatchObject({ kind: 'coluna', counts: { paineis: 0, colunas: 0, sheets: 1, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 } });
    expect(names(f, legacy.locationIds)).toEqual(['Coluna 9 de Subestação']);
    expect(tagsOf(f.state, legacy.blockIds)).toEqual(['DJ-C09']);
    const inPainel = planOf(f, locationId(f.state, 'Coluna 2', 'Painel 1'))!;
    expect(inPainel).toMatchObject({ kind: 'coluna', counts: { paineis: 0, colunas: 0, sheets: 2, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 } });
    expect(tagsOf(f.state, inPainel.blockIds)).toEqual(['DJ-C02', 'TP-C02']);
    // A location with nothing under it and no sheet: itself alone, every count zero.
    fold(f.state, removalOps(f.relatorioId, { locationIds: [], blockIds: [blockIdOf(f.state, 'CE-GERADORES')], equipmentIds: [] }, T1));
    expect(planOf(f, locationId(f.state, 'Geradores'))).toMatchObject({ kind: 'cabine', blockIds: [], equipmentIds: [], counts: { paineis: 0, colunas: 0, sheets: 0, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 } });
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
    expect(plan.counts).toEqual({ paineis: 0, colunas: 1, sheets: 1, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 });
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

describe('14.2-UNIT a location removal against another device (rule 10: nothing new in the merge)', () => {
  const ANA = '019966b0-0156-7000-8000-000000000001';
  const ANA_DEVICE = 'tablet-ana';
  /** One checklist result typed on another device: an edit of the sheet, attributed to its author. */
  function editOf(f: RemovalFixture, blockId: string, at: Date): Op {
    const block = rowsIn(f.state).blocks.find((row) => row.id === blockId)!;
    const item = getDefinition(block.seed_version, 'cabine_primaria', block.block_type).checklist![0]!.key;
    return opFactory(at, idSequence('019966b0-0157-7000-8000-')).op({ path: `sheet/${blockId}/checklist/${item}/result`, value: 'C', relatorio_id: f.relatorioId, actor_id: ANA, device_id: ANA_DEVICE });
  }
  /** The removal batch of a painel as the commit path stamps it on the rows this device holds (`stampSeen`). */
  function stampedRemoval(f: RemovalFixture, painel: string, at: Date): { plan: LocationRemovalPlan; ops: Op[] } {
    const plan = planOf(f, painel)!;
    return { plan, ops: removalOps(f.relatorioId, plan, at).map((op) => stampSeen(op, f.state)) };
  }
  const folded = (f: RemovalFixture, ops: readonly Op[]) => {
    const state = new Map(f.state);
    fold(state, ops);
    return rowsIn(state);
  };

  it('a sheet edited on another device and removed with its painel carries the removed-versus-edited mark, in either order; the location rows are simply removed', () => {
    const f = removalFixture();
    const painel = locationId(f.state, 'Painel 1', 'Subestação');
    const sheet = blockIdOf(f.state, 'SEC-C01');
    // This device plans and stamps the batch on its own rows: it has not seen the edit.
    const { plan, ops: removal } = stampedRemoval(f, painel, T2);
    expect(plan.blockIds).toContain(sheet);
    for (const op of removal) expect(op.meta, op.path).toEqual(op.path.startsWith('block/') ? { seen_modified_at: null } : null);
    const edit = editOf(f, sheet, T1);
    const mark = { removed_by: TEST_USER, removed_at: iso(T2), edited_by: ANA, edited_at: edit.client_ts };

    // (a) The edit lands first: the block remove's stamp differs from the row's `last_modified_at`.
    const editFirst = folded(f, [edit, ...removal]);
    const marked = editFirst.blocks.find((row) => row.id === sheet)!;
    expect(marked.last_modified_at).toBe(edit.client_ts);
    expect(marked).toMatchObject({ removed_at: iso(T2), removed_by: TEST_USER, removal_conflict: mark });
    expect(holdsConflictMarks(marked)).toBe(true);
    // The edit is kept on the tombstoned sheet.
    expect(Object.values(marked.sheet.checklist).map((cell) => cell.result?.value)).toEqual(['C']);
    // Every other sheet of the batch is a plain removal, and so is every location.
    for (const id of plan.blockIds.filter((id) => id !== sheet)) {
      const row = editFirst.blocks.find((block) => block.id === id)!;
      expect(row).toMatchObject({ removed_at: iso(T2), removed_by: TEST_USER });
      expect(row.removal_conflict).toBeUndefined();
    }
    for (const id of plan.locationIds) {
      const row = editFirst.locations.find((location) => location.id === id)!;
      expect(row.removed_at).toBe(iso(T2));
      expect(row).not.toHaveProperty('removal_conflict');
      expect(row).not.toHaveProperty('removed_by');
    }

    // (b) The removal lands first: the edit on the tombstoned sheet sets the same mark; the rows are equal.
    const removalFirst = folded(f, [...removal, edit]);
    expect(removalFirst.blocks.find((row) => row.id === sheet)).toEqual(marked);
    expect(removalFirst.locations).toEqual(editFirst.locations);
    expect(removalFirst.blocks).toEqual(editFirst.blocks);
  });

  it('a removal that saw the edit is plain: the stamp is the row\'s `last_modified_at`', () => {
    const f = removalFixture();
    const painel = locationId(f.state, 'Painel 1', 'Subestação');
    const sheet = blockIdOf(f.state, 'SEC-C01');
    const edit = editOf(f, sheet, T1);
    fold(f.state, [edit]);
    const { ops: removal } = stampedRemoval(f, painel, T2);
    expect(removal.find((op) => op.path === `block/${sheet}/removed_at`)!.meta).toEqual({ seen_modified_at: edit.client_ts });
    const row = folded(f, removal).blocks.find((block) => block.id === sheet)!;
    expect(row.removed_at).toBe(iso(T2));
    expect(row.removal_conflict).toBeUndefined();
  });

  it('the location\'s own `removed_at` is last-writer-wins: of two removes, and of a remove and a restore, the later log position stands', () => {
    const f = removalFixture();
    const painel = locationId(f.state, 'Painel 1', 'Subestação');
    const only = { locationIds: [painel], blockIds: [], equipmentIds: [] };
    const painelIn = (ops: readonly Op[]) => folded(f, ops).locations.find((row) => row.id === painel)!;
    // Two devices remove it; the one later in the log stands, whatever its clock says.
    const here = removalOps(f.relatorioId, only, T2);
    const there = removalOps(f.relatorioId, only, T1, ANA_DEVICE);
    expect(painelIn([...here, ...there]).removed_at).toBe(iso(T1));
    expect(painelIn([...there, ...here]).removed_at).toBe(iso(T2));
    expect(painelIn([...here, ...there])).not.toHaveProperty('removal_conflict');
    // A restore against a removal: again the later one in the log.
    const back = restoreOps(f.relatorioId, only, T3, ANA_DEVICE);
    expect(painelIn([...here, ...back]).removed_at).toBeNull();
    expect(painelIn([...back, ...here]).removed_at).toBe(iso(T2));
    expect(painelIn([...here, ...back, ...there]).removed_at).toBe(iso(T1));
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
    expect(plan.counts).toEqual({ paineis: 0, colunas: 2, sheets: 4, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 });
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
    expect(plan.counts).toEqual({ paineis: 0, colunas: 1, sheets: 1, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 });
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
    expect(plan.counts).toEqual({ paineis: 0, colunas: 0, sheets: 2, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 });
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
    expect(plan.counts).toEqual({ paineis: 0, colunas: 3, sheets: 6, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 });
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
    expect(locationRemovalConfirmText('painel', { paineis: 0, colunas: 2, sheets: 5, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 })).toBe(`O painel, 2 colunas e 5 fichas saem${tail}`);
    expect(locationRemovalConfirmText('coluna', { paineis: 0, colunas: 0, sheets: 1, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 })).toBe(`A coluna e 1 ficha saem${tail}`);
    expect(locationRemovalConfirmText('cabine', { paineis: 1, colunas: 2, sheets: 7, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 })).toBe(`O local, 1 painel, 2 colunas e 7 fichas saem${tail}`);
    expect(locationRemovalConfirmText('cabine', { paineis: 2, colunas: 1, sheets: 0, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 })).toBe(`O local, 2 painéis e 1 coluna saem${tail}`);
    // A zero part is left out; with nothing under it the verb is singular.
    expect(locationRemovalConfirmText('cabine', { paineis: 0, colunas: 0, sheets: 3, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 })).toBe(`O local e 3 fichas saem${tail}`);
    expect(locationRemovalConfirmText('painel', { paineis: 0, colunas: 0, sheets: 0, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 })).toBe(`O painel sai${tail}`);
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
    expect(locationRestoreDetailText('painel', { paineis: 0, colunas: 2, sheets: 5, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 })).toBe('Painel · 2 colunas · 5 fichas');
    expect(locationRestoreDetailText('coluna', { paineis: 0, colunas: 0, sheets: 3, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 })).toBe('Coluna · 3 fichas');
    expect(locationRestoreDetailText('coluna', { paineis: 0, colunas: 0, sheets: 1, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 })).toBe('Coluna · 1 ficha');
    expect(locationRestoreDetailText('cabine', { paineis: 1, colunas: 2, sheets: 7, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 })).toBe('Local · 1 painel · 2 colunas · 7 fichas');
    expect(locationRestoreDetailText('cabine', { paineis: 0, colunas: 0, sheets: 0, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 })).toBe('Local');
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

  it('at one timestamp a location comes before a block whatever their ids, then each kind by id', () => {
    const f = removalFixture();
    // Two locations and two sheets on a live location, all removed at T1.
    const coluna9 = locationId(f.state, 'Coluna 9', 'Subestação');
    const geradores = locationId(f.state, 'Geradores');
    remove(f, coluna9, T1);
    remove(f, geradores, T1);
    const tr1 = removeSheet(f, 'TR-1', T1);
    const tr2 = removeSheet(f, 'TR-2', T1);
    // A later removal still leads the list.
    const painel2 = locationId(f.state, 'Painel 2', 'Subestação');
    remove(f, painel2, T2);
    const rows = rowsIn(f.state);
    // TR-1 under an id below every location's: by id alone it would lead its timestamp.
    const LOW = '00000000-0000-7000-8000-000000000001';
    expect([coluna9, geradores].every((id) => LOW < id)).toBe(true);
    const blocks = rows.blocks.map((row) => (row.id === tr1 ? { ...row, id: LOW } : row));
    const listed = restorableEntries({ ...rows, blocks, since: null });
    expect(listed.map((entry) => [entry.kind, entry.id])).toEqual([
      ['location', painel2],
      ...[coluna9, geradores].sort().map((id) => ['location', id]),
      ...[LOW, tr2].sort().map((id) => ['block', id]),
    ]);
    expect(listed.map((entry) => entry.removed_at)).toEqual([iso(T2), iso(T1), iso(T1), iso(T1), iso(T1)]);
  });

  it('a removed sheet naming a location the rows do not hold is offered, with no place to name', () => {
    const f = removalFixture();
    const coluna9 = locationId(f.state, 'Coluna 9', 'Subestação');
    const sheet = removeSheet(f, 'DJ-C09', T1);
    const rows = rowsIn(f.state);
    expect(rows.blocks.find((row) => row.id === sheet)!.location_id).toBe(coluna9);
    // With its coluna among the rows it is listed with where it was.
    expect(restorableEntries({ ...rows, since: null }).map((entry) => [entry.kind, entry.id, entry.name, entry.detail])).toEqual([['block', sheet, 'DJ-C09', 'Subestação › Coluna 9']]);
    // A coluna this device never pulled: nothing says it left, so the sheet is still offered.
    const without = rows.locations.filter((row) => row.id !== coluna9);
    expect(restorableEntries({ ...rows, locations: without, since: null }).map((entry) => [entry.kind, entry.id, entry.name, entry.detail, entry.label])).toEqual([['block', sheet, 'DJ-C09', null, 'DJ-C09']]);
    // The same coluna among the rows but removed: the sheet waits for it.
    const removed = rows.locations.map((row) => (row.id === coluna9 ? { ...row, removed_at: iso(T2) } : row));
    expect(restorableEntries({ ...rows, locations: removed, since: null }).map((entry) => [entry.kind, entry.id])).toEqual([['location', coluna9]]);
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

  it('restorableBlocks is the block half by the same rule of place: a sheet on a removed location is not offered on its own', () => {
    const f = removalFixture();
    removeSheet(f, 'SEC-C01', T1);
    removeSheet(f, 'TR-1', T2);
    // The painel leaves afterwards with its colunas and their other three sheets.
    remove(f, locationId(f.state, 'Painel 1', 'Subestação'), T3);
    const rows = rowsIn(f.state);
    const half = restorableBlocks(rows.blocks, rows.equipment, rows.locations, null);
    expect(half.map((row) => [row.name, row.detail])).toEqual([['TR-1', 'Subestação']]);
    expect(entries(f).filter((entry) => entry.kind === 'block')).toEqual(half.map((row) => ({ ...row, kind: 'block' })));
    // With no location row to read, nothing says a location left: every removed block is listed, as before.
    expect(restorableBlocks(rows.blocks, rows.equipment)).toHaveLength(5);
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

describe('Epic 14 QA Q-6: a local holding site work asks first, and its sentence and restore entry name what leaves', () => {
  const OP = '019966b0-0153-7000-8000-000000000001';
  const cell = (value: string) => ({ value, source_suggestion_id: null, op_id: OP });
  // Two answered site items (one with an observation) and one observation with no answer.
  const CHECKLIST = {
    epi_disponivel: { result: cell('C') },
    tapete_ou_estrado_isolante: { result: cell('NC'), observation: cell('Tapete rasgado') },
    bacia_de_contencao_de_oleo: { observation: cell('Sem óleo') },
  };
  const withChecklist = (locations: readonly LocationRow[], id: string): LocationRow[] =>
    locations.map((row) => (row.id === id && row.kind === 'cabine' ? ({ ...row, checklist: CHECKLIST } as unknown as LocationRow) : row));

  it('counts the answered items, the live site photos and the live points naming the local; a local with only that asks', () => {
    const f = removalFixture();
    const ger = locationId(f.state, 'Geradores');
    removeSheet(f, 'CE-GERADORES', T1);
    const files = [
      { removed_at: null, location_id: ger },
      { removed_at: iso(T1), location_id: ger },
      { removed_at: null, location_id: null },
    ];
    const points = [{ removed_at: null, location_id: ger }, { removed_at: null }];
    const rows = rowsIn(f.state);
    const plan = planOf(f, ger, { locations: withChecklist(rows.locations, ger), files, points })!;
    expect(plan.counts).toEqual({ paineis: 0, colunas: 0, sheets: 0, siteAnswers: 2, sitePhotos: 1, sitePoints: 1 });
    expect(locationRemovalAsks(plan.counts)).toBe(true);
    expect(locationRemovalConfirmText('cabine', plan.counts)).toBe(
      'O local, 2 respostas das verificações, 1 foto e 1 ponto de atenção saem do relatório. Dá para recuperar até a emissão, em "Restaurar ficha removida".',
    );
    // An empty local still leaves at once; a painel or a coluna holds no site work.
    expect(locationRemovalAsks(planOf(f, ger)!.counts)).toBe(false);
    expect(planOf(f, locationId(f.state, 'Painel 1', 'Subestação'), { files, points })!.counts).toMatchObject({ siteAnswers: 0, sitePhotos: 0, sitePoints: 0 });
    // One answer alone is enough to ask.
    expect(locationRemovalAsks({ paineis: 0, colunas: 0, sheets: 0, siteAnswers: 1, sitePhotos: 0, sitePoints: 0 })).toBe(true);
  });

  it('the restore entry of the removed local names its site work, which comes back with it', () => {
    const f = removalFixture();
    const ger = locationId(f.state, 'Geradores');
    remove(f, ger, T2);
    const rows = rowsIn(f.state);
    const files = [{ removed_at: null, location_id: ger }];
    const points = [
      { removed_at: null, location_id: ger },
      { removed_at: null, location_id: ger },
    ];
    const entry = restorableEntries({ ...rows, locations: withChecklist(rows.locations, ger), since: null, files, points }).find((row) => row.id === ger)!;
    expect(entry).toMatchObject({ kind: 'location', detail: 'Local · 1 ficha · 2 respostas das verificações · 1 foto · 2 pontos de atenção' });
    expect(locationRestoreDetailText('cabine', { paineis: 0, colunas: 0, sheets: 0, siteAnswers: 19, sitePhotos: 2, sitePoints: 1 })).toBe('Local · 19 respostas das verificações · 2 fotos · 1 ponto de atenção');
  });
});

describe('Epic 14 QA Q-13: a restored row whose order key a live sibling took comes back right after it', () => {
  const R = 'rel';
  const id = (n: number) => `019966b0-0158-7000-8000-${String(n).padStart(12, '0')}`;
  const [PAINEL, A, B, C, D] = [1, 2, 3, 4, 5].map(id) as [string, string, string, string, string];
  const coluna = (rowId: string, name: string, orderKey: string, removedAt: string | null = null): LocationRow => ({ id: rowId, relatorio_id: R, parent_id: PAINEL, kind: 'coluna', name, order_key: orderKey, removed_at: removedAt });
  // The painel's local is not among the rows: an ancestor the input does not hold is not removed.
  const painel: LocationRow = { id: PAINEL, relatorio_id: R, parent_id: id(6), kind: 'painel', name: 'Painel 1', order_key: 'a0', removed_at: null };

  it('C moved between A and B, removed; D moved to the same place; C restored: one order_key put places C after D, no two live colunas share a key', () => {
    // A a0, C a1 (its move minted the key between A and B), B a2; C removed at T1; D moved into the hole mints a1 too.
    const locations = [painel, coluna(A, 'A', 'a0'), coluna(B, 'B', 'a2'), coluna(C, 'C', 'a1', iso(T1)), coluna(D, 'D', 'a1')];
    const plan = locationRestorePlan({ locations, blocks: [], equipment: [], locationId: C })!;
    expect(plan.locationIds).toEqual([C]);
    expect(plan.orderKeys).toHaveLength(1);
    const key = plan.orderKeys[0]!;
    expect(key.id).toBe(C);
    const after = locations.map((row) => (row.id === C ? { ...row, removed_at: null, order_key: key.orderKey } : row));
    const live = sortByOrderKey(after.filter((row) => row.parent_id === PAINEL && row.removed_at === null));
    expect(live.map((row) => row.name)).toEqual(['A', 'D', 'C', 'B']);
    expect(new Set(live.map((row) => row.order_key)).size).toBe(live.length);
    // With nothing in its slot, the row keeps its own key and no put is written.
    const free = locations.filter((row) => row.id !== D);
    expect(locationRestorePlan({ locations: free, blocks: [], equipment: [], locationId: C })!.orderKeys).toEqual([]);
  });

  it('restoredOrderKey: the block restore reads the same rule (null when the key is free; removed siblings never hold it)', () => {
    const siblings = [
      { id: A, order_key: 'a0', removed_at: null },
      { id: D, order_key: 'a1', removed_at: null },
      { id: B, order_key: 'a2', removed_at: null },
    ];
    const key = restoredOrderKey(siblings, { id: C, order_key: 'a1' })!;
    expect(key > 'a1' && key < 'a2').toBe(true);
    expect(restoredOrderKey(siblings, { id: C, order_key: 'a3' })).toBeNull();
    expect(restoredOrderKey([{ id: D, order_key: 'a1', removed_at: iso(T1) }], { id: C, order_key: 'a1' })).toBeNull();
  });
});
