import { describe, expect, it } from 'vitest';
import { entityKey } from '../ops/apply.ts';
import type { Op } from '../ops/op.ts';
import { blockFieldPath, blockPath, equipmentPath, locationAgruparPath } from '../ops/path.ts';
import { groupForPrint } from '../print/group-for-print.ts';
import { section9Layout } from '../print/section-9.ts';
import { section11Instruments, section11Layout } from '../print/section-11.ts';
import type { BlockRow, JsonValue, RegistryRow } from '../schemas/entities.ts';
import { buildSnapshot, createSnapshotBuilder, serializeSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { findDefinition } from '../seed/definitions.ts';
import { templateFromRelatorio } from '../templates/from-relatorio.ts';
import { atMinutes, opFactory, T0, TEST_COMPANY, TEST_PROJECT } from '../test-support.ts';
import { nextSheet, sheetOrder } from './ficha.ts';
import { movePlan, moveTargets } from './move.ts';
import { panelLocation } from './panel.ts';
import { preIssue } from './pre-issue.ts';
import { locationProgress, locationProgressIndex, progress, progressCounterText } from './progress.ts';
import { ALL_HERE, blockIdOf, fold, locationId, removalFixture, removalOps, restoreOps, rowsIn, type RemovalFixture } from './removal.test-support.ts';
import { locationRemovalPlan, locationRestorePlan, removedAncestorIds } from './removal.ts';
import { restorableEntries, strandedSheetDetailText } from './sumario.ts';
import { firstInTree, locationChoices, locationTree, newEquipmentBlock, paletteLocationFor, siblingLocations, treeNodes, type TreeLocationNode } from './tree.ts';

/*
 * 14.2-UNIT, second pass (2026-10-13): what reads a relatório after a location left it. The
 * criterion: the location, the locations under it and their sheets are absent from the
 * tree, the counters, the pre-issue list, the move and palette targets, section 9, section
 * 11 and a template saved from the relatório, and a sheet another device created in, or
 * moved into, the removed location is absent too, by one ancestor-liveness rule.
 *
 * Two shapes of the same removal are read. "Backstop": only the painel's own row carries a
 * tombstone (the colunas and sheets under it are live rows), which is what the derived rule
 * alone must hide. "Batch": the plan's explicit tombstones on every row.
 */

const T1 = atMinutes(T0, 10);
const T2 = atMinutes(T0, 20);
const T3 = atMinutes(T0, 30);

const PAINEL_1_TAGS = ['DJ-C02', 'SEC-C01', 'SEC-C01-2', 'TP-C02'];
const REST_TAGS = ['CE-GERADORES', 'DJ-C09', 'SEC-C01-3', 'TR-1', 'TR-2'];

const painel1 = (f: RemovalFixture) => locationId(f.state, 'Painel 1', 'Subestação');

/** Only the location's own row is tombstoned: what another device's late write leaves the derived rule to hide. */
function tombstoneRowOnly(f: RemovalFixture, id: string, at: Date = T1): void {
  fold(f.state, removalOps(f.relatorioId, { locationIds: [id], blockIds: [], equipmentIds: [] }, at));
}

/** The plan's whole batch. */
function removeByPlan(f: RemovalFixture, id: string, at: Date = T1): void {
  const rows = rowsIn(f.state);
  const plan = locationRemovalPlan({ locations: rows.locations, blocks: rows.blocks, otherBlocks: [], locationId: id, projectId: TEST_PROJECT, relatorioId: f.relatorioId, visibility: ALL_HERE })!;
  fold(f.state, removalOps(f.relatorioId, plan, at));
}

const SHAPES: readonly (readonly [string, (f: RemovalFixture, id: string) => void])[] = [
  ['backstop (the location row alone)', tombstoneRowOnly],
  ['batch (every row tombstoned)', removeByPlan],
];

const tagsIn = (snapshot: Pick<RelatorioSnapshot, 'equipment'>) => snapshot.equipment.map((row) => row.tag).sort();
const locationNodes = (tree: readonly TreeLocationNode[]) => treeNodes(tree).filter((node): node is TreeLocationNode => node.kind !== 'equipment');

/** The raw rows of the state as a hand-built reader input: removed rows included, nothing filtered. */
function rawInput(f: RemovalFixture): RelatorioSnapshot {
  const snapshot = buildSnapshot(f.state, f.relatorioId);
  const rows = rowsIn(f.state);
  return { ...snapshot, locations: rows.locations, blocks: rows.blocks, equipment: rows.equipment };
}

describe('14.2-UNIT the snapshot builders: one ancestor-liveness rule', () => {
  it.each(SHAPES)('%s: the painel, its colunas, their sheets and their equipment are out of both builders', (_name, removeIt) => {
    const f = removalFixture();
    const build = createSnapshotBuilder();
    const before = build(f.state, f.relatorioId);
    expect(tagsIn(before)).toEqual([...PAINEL_1_TAGS, ...REST_TAGS].sort());
    const painel = painel1(f);
    const under = rowsIn(f.state).locations.filter((row) => row.parent_id === painel).map((row) => row.id);
    removeIt(f, painel);
    const reference = buildSnapshot(f.state, f.relatorioId);
    const incremental = build(f.state, f.relatorioId);
    expect(serializeSnapshot(incremental)).toBe(serializeSnapshot(reference));
    for (const snapshot of [reference, incremental]) {
      expect(snapshot.locations.map((row) => row.name).sort()).toEqual(['Coluna 1', 'Coluna 9', 'Geradores', 'Painel 2', 'Subestação']);
      expect(snapshot.locations.some((row) => row.id === painel || under.includes(row.id))).toBe(false);
      expect(snapshot.blocks.filter((block) => block.location_id !== null)).toHaveLength(5);
      expect(snapshot.blocks.some((block) => block.location_id !== null && under.includes(block.location_id))).toBe(false);
      expect(tagsIn(snapshot)).toEqual(REST_TAGS);
    }
    // The builder's identity guarantee holds: a row the removal did not touch is the object the last call returned.
    const untouched = blockIdOf(f.state, 'CE-GERADORES');
    expect(incremental.blocks.find((block) => block.id === untouched)).toBe(before.blocks.find((block) => block.id === untouched));
    expect(build(f.state, f.relatorioId)).toBe(incremental);
  });

  it('a sheet another device created in, or moved into, the removed location is absent; one naming a location the state does not hold is kept', () => {
    const f = removalFixture();
    const build = createSnapshotBuilder();
    const painel = painel1(f);
    const coluna1 = locationId(f.state, 'Coluna 1', 'Painel 1');
    const coluna2 = locationId(f.state, 'Coluna 2', 'Painel 1');
    removeByPlan(f, painel);
    const ops = opFactory(T2);
    // A device that had not seen the removal: a new sheet in Coluna 1, and SEC-C01-3 moved from Painel 2 into Coluna 2.
    const created = newEquipmentBlock({
      blockId: '019966b0-0156-7000-8000-000000000001',
      equipmentId: '019966b0-0156-7000-8000-000000000002',
      relatorioId: f.relatorioId,
      projectId: TEST_PROJECT,
      locationId: coluna1,
      type: 'tc',
      tag: 'TC-C01',
      seedVersion: 'v3',
      orderKey: 'z0',
    });
    const moved = blockIdOf(f.state, 'SEC-C01-3');
    const late: Op[] = [
      ops.op({ kind: 'create', scope: 'project', path: equipmentPath(created.equipment.id), value: created.equipment as unknown as JsonValue, device_id: 'tablet-other' }),
      ops.op({ kind: 'create', relatorio_id: f.relatorioId, path: blockPath(created.block.id), value: created.block as unknown as JsonValue, device_id: 'tablet-other' }),
      ops.op({ kind: 'put', relatorio_id: f.relatorioId, path: blockFieldPath(moved, 'location_id'), value: coluna2, device_id: 'tablet-other' }),
    ];
    fold(f.state, late);
    // The rows are live in the state: only the rule hides them.
    const rows = rowsIn(f.state);
    expect(rows.blocks.find((row) => row.id === created.block.id)).toMatchObject({ removed_at: null, location_id: coluna1 });
    expect(rows.blocks.find((row) => row.id === moved)).toMatchObject({ removed_at: null, location_id: coluna2 });
    // A block naming a location this state never held (its create not pulled yet): kept, as before the rule.
    const orphan = newEquipmentBlock({
      blockId: '019966b0-0156-7000-8000-000000000003',
      equipmentId: '019966b0-0156-7000-8000-000000000004',
      relatorioId: f.relatorioId,
      projectId: TEST_PROJECT,
      locationId: '019966b0-0156-7000-8000-000000000005',
      type: 'tp',
      tag: 'TP-AVULSO',
      seedVersion: 'v3',
      orderKey: 'z1',
    });
    fold(f.state, [
      ops.op({ kind: 'create', scope: 'project', path: equipmentPath(orphan.equipment.id), value: orphan.equipment as unknown as JsonValue, device_id: 'tablet-other' }),
      ops.op({ kind: 'create', relatorio_id: f.relatorioId, path: blockPath(orphan.block.id), value: orphan.block as unknown as JsonValue, device_id: 'tablet-other' }),
    ]);
    const reference = buildSnapshot(f.state, f.relatorioId);
    const incremental = build(f.state, f.relatorioId);
    expect(serializeSnapshot(incremental)).toBe(serializeSnapshot(reference));
    for (const snapshot of [reference, incremental]) {
      expect(snapshot.blocks.some((block) => block.id === created.block.id)).toBe(false);
      expect(snapshot.blocks.some((block) => block.id === moved)).toBe(false);
      expect(snapshot.blocks.some((block) => block.id === orphan.block.id)).toBe(true);
      expect(tagsIn(snapshot)).toEqual(['CE-GERADORES', 'DJ-C09', 'TP-AVULSO', 'TR-1', 'TR-2']);
      // Every reader of the snapshot counts without them.
      expect(progress(snapshot).sheets_total).toBe(5);
    }
    // The painel restored: what left with it and what the other device put there are all visible again.
    fold(f.state, restoreOps(f.relatorioId, locationRestorePlan({ ...rowsIn(f.state), locationId: painel })!, T3));
    const back = buildSnapshot(f.state, f.relatorioId);
    expect(serializeSnapshot(build(f.state, f.relatorioId))).toBe(serializeSnapshot(back));
    expect(tagsIn(back)).toEqual([...PAINEL_1_TAGS, ...REST_TAGS, 'TC-C01', 'TP-AVULSO'].sort());
  });
});

describe('14.2-UNIT the tree, the counters and the targets without the removed location', () => {
  it.each(SHAPES)('%s: read from the snapshot and from the raw rows alike', (_name, removeIt) => {
    const f = removalFixture();
    const painel = painel1(f);
    const coluna1 = locationId(f.state, 'Coluna 1', 'Painel 1');
    const local = locationId(f.state, 'Subestação');
    const full = locationNodes(locationTree(buildSnapshot(f.state, f.relatorioId)));
    expect(full.find((node) => node.id === local)!.counterText).toBe('0 de 8');
    expect(full.find((node) => node.name === 'Painel 2')).toMatchObject({ position: 2, siblings: 2 });
    removeIt(f, painel);
    for (const input of [buildSnapshot(f.state, f.relatorioId), rawInput(f)]) {
      const tree = locationTree(input);
      // No node of the painel, and none of its colunas drawn as a root.
      expect(tree.map((root) => root.name)).toEqual(['Subestação', 'Geradores']);
      expect(locationNodes(tree).map((node) => node.controlName)).toEqual(['Subestação', 'Coluna 9 de Subestação', 'Painel 2 de Subestação', 'Coluna 1 de Painel 2 de Subestação', 'Geradores']);
      expect(treeNodes(tree).filter((node) => node.kind === 'equipment').map((node) => node.tag)).toEqual(['TR-1', 'TR-2', 'DJ-C09', 'SEC-C01-3', 'CE-GERADORES']);
      // The counters close up, and each drawn node's counter is still `locationProgress` of that node.
      const nodes = locationNodes(tree);
      expect(nodes.find((node) => node.id === local)!.counterText).toBe('0 de 4');
      expect(nodes.find((node) => node.id === local)!.railMeta).toBe('Local · Primária · 1 painel · 0 de 4 fichas');
      const index = locationProgressIndex(input);
      for (const node of nodes) {
        expect(node.counterText).toBe(progressCounterText(locationProgress(input, node.id)));
        expect(index(node.id)).toEqual(locationProgress(input, node.id));
      }
      // Sibling positions close the gap.
      expect(nodes.find((node) => node.name === 'Painel 2')).toMatchObject({ position: 1, siblings: 1 });
      expect(siblingLocations(input.locations, local, 'painel').map((row) => row.name)).toEqual(['Painel 2']);
      expect(siblingLocations(input.locations, painel)).toEqual([]);
      // The removed painel and its colunas count nothing and lead nowhere.
      expect(locationProgress(input, painel).sheets_total).toBe(0);
      expect(locationProgress(input, coluna1).sheets_total).toBe(0);
      expect(index(coluna1).sheets_total).toBe(0);
      expect(firstInTree(input, painel)).toBeNull();
      expect(firstInTree(input, coluna1)).toBeNull();
      // "Próxima ficha" walks past it.
      expect(sheetOrder(input).map((node) => node.tag)).toEqual(['TR-1', 'TR-2', 'DJ-C09', 'SEC-C01-3', 'CE-GERADORES']);
      expect(nextSheet(input, blockIdOf(f.state, 'DJ-C09'))).toMatchObject({ blockId: blockIdOf(f.state, 'SEC-C01-3') });
    }
  });

  it.each(SHAPES)('%s: the move and palette targets leave it out', (_name, removeIt) => {
    const f = removalFixture();
    const painel = painel1(f);
    const coluna1 = locationId(f.state, 'Coluna 1', 'Painel 1');
    removeIt(f, painel);
    const raw = rawInput(f);
    const labels = ['Subestação', 'Subestação › Coluna 9', 'Subestação › Painel 2 › Coluna 1', 'Geradores'];
    expect(locationChoices(raw.locations).map((choice) => choice.label)).toEqual(labels);
    expect(locationChoices(buildSnapshot(f.state, f.relatorioId).locations).map((choice) => choice.label)).toEqual(labels);
    const sheet = raw.blocks.find((block) => block.id === blockIdOf(f.state, 'TR-1'))!;
    expect(moveTargets(raw.locations, sheet).map((target) => target.label)).toEqual(labels.slice(1));
    // A move into a coluna of the removed painel is refused on fresh rows: the location is gone.
    const move = { blocks: raw.blocks, locations: raw.locations, equipment: raw.equipment, blockId: sheet.id, rename: false };
    expect(movePlan({ ...move, targetId: coluna1 })).toEqual({ kind: 'refused', reason: 'location-gone' });
    expect(movePlan({ ...move, targetId: painel })).toEqual({ kind: 'refused', reason: 'location-gone' });
    expect(movePlan({ ...move, targetId: locationId(f.state, 'Coluna 1', 'Painel 2') })).toMatchObject({ kind: 'move' });
    // The palette opens on neither, and a panel label never lands in the removed painel.
    expect(paletteLocationFor(raw, coluna1, null)).toBeNull();
    expect(paletteLocationFor(raw, painel, null)).toBeNull();
    expect(paletteLocationFor(raw, locationId(f.state, 'Painel 2', 'Subestação'), null)).toBe(locationId(f.state, 'Coluna 1', 'Painel 2'));
    expect(panelLocation(raw.locations, coluna1, 2)).toBeNull();
    // From the local, "Coluna 2" existed only in the removed painel: nothing matches, the block is proposed on the local.
    expect(panelLocation(raw.locations, locationId(f.state, 'Subestação'), 2)).toMatchObject({ location: { name: 'Subestação' }, matched: false });
  });

  it('a location whose parent is absent from the input is still drawn as a root (an op applied before its parent arrived)', () => {
    const f = removalFixture();
    const snapshot = buildSnapshot(f.state, f.relatorioId);
    const painel = painel1(f);
    const withoutPainel = { ...snapshot, locations: snapshot.locations.filter((row) => row.id !== painel) };
    const tree = locationTree(withoutPainel);
    expect(tree.map((root) => root.name).sort()).toEqual(['Coluna 1', 'Coluna 2', 'Geradores', 'Subestação']);
    expect(treeNodes(tree).filter((node) => node.kind === 'equipment')).toHaveLength(9);
    expect(firstInTree(withoutPainel, locationId(f.state, 'Coluna 1', 'Painel 1'))).toBe(blockIdOf(f.state, 'SEC-C01'));
  });
});

describe('14.2-UNIT the pre-issue list and the progress without the removed location', () => {
  it.each(SHAPES)('%s: a painel', (_name, removeIt) => {
    const f = removalFixture();
    const before = buildSnapshot(f.state, f.relatorioId);
    expect(progress(before)).toMatchObject({ sheets_concluded: 0, sheets_total: 9 });
    const text = (snapshot: RelatorioSnapshot, kind: string) => preIssue(snapshot).filter((row) => row.kind === kind).map((row) => row.text);
    expect(text(before, 'sheets')).toEqual(['0 de 9']);
    expect(text(before, 'sheets_empty')).toEqual(['9 fichas vazias']);
    removeIt(f, painel1(f));
    const after = buildSnapshot(f.state, f.relatorioId);
    expect(progress(after)).toMatchObject({ sheets_concluded: 0, sheets_total: 5 });
    expect(text(after, 'sheets')).toEqual(['0 de 5']);
    expect(text(after, 'sheets_empty')).toEqual(['5 fichas vazias']);
  });

  it.each(SHAPES)('%s: a local leaves every row that named it', (_name, removeIt) => {
    const f = removalFixture();
    const names = (snapshot: RelatorioSnapshot) => preIssue(snapshot).filter((row) => row.kind === 'cabine_incompleta').map((row) => row.text);
    expect(names(buildSnapshot(f.state, f.relatorioId))).toEqual(['Subestação: faltam 6 campos', 'Geradores: faltam 6 campos']);
    removeIt(f, locationId(f.state, 'Subestação'));
    const after = buildSnapshot(f.state, f.relatorioId);
    expect(names(after)).toEqual(['Geradores: faltam 6 campos']);
    expect(preIssue(after).some((row) => row.text.includes('Subestação'))).toBe(false);
    expect(progress(after).sheets_total).toBe(1);
    expect(after.locations.map((row) => row.name)).toEqual(['Geradores']);
  });
});

describe('14.2-UNIT the print without the removed painel', () => {
  const shape = (snapshot: RelatorioSnapshot, scheme?: 'ordem_de_campo' | 'por_local_e_tipo') => groupForPrint(snapshot, scheme).subsections.map((s) => [s.kind, s.title, s.blockIds.length]);

  it.each(SHAPES)('%s: groupForPrint and section9Layout in field order', (_name, removeIt) => {
    const f = removalFixture();
    const before = buildSnapshot(f.state, f.relatorioId);
    expect(shape(before)).toEqual([['cabine', 'Subestação', 3], ['painel', 'Painel 1', 4], ['painel', 'Painel 2', 1], ['cabine', 'Geradores', 1]]);
    expect(section9Layout(before, 9, 'RELATÓRIOS DOS ENSAIOS')!.subsections.map((s) => s.heading)).toEqual(['9.1 Subestação', 'PAINEL 1', 'PAINEL 2', '9.2 Geradores']);
    const painel = painel1(f);
    removeIt(f, painel);
    for (const input of [buildSnapshot(f.state, f.relatorioId), rawInput(f)]) {
      expect(shape(input)).toEqual([['cabine', 'Subestação', 3], ['painel', 'Painel 2', 1], ['cabine', 'Geradores', 1]]);
      expect(groupForPrint(input).subsections.some((s) => s.painelId === painel)).toBe(false);
      const layout = section9Layout(input, 9, 'RELATÓRIOS DOS ENSAIOS')!;
      expect(layout.subsections.map((s) => [s.heading, s.sheets.map((sheet) => sheet.title)])).toEqual([
        ['9.1 Subestação', ['TRANSFORMADOR DE FORÇA TR-1', 'TRANSFORMADOR DE FORÇA TR-2', 'DISJUNTOR MT DJ-C09']],
        ['PAINEL 2', ['CHAVE SECCIONADORA SEC-C01-3']],
        ['9.2 Geradores', ['CABOS DE ENTRADA CE-GERADORES']],
      ]);
    }
  });

  it.each(SHAPES)('%s: grouped by type, no heading and no group of the removed painel', (_name, removeIt) => {
    const f = removalFixture();
    const local = locationId(f.state, 'Subestação');
    fold(f.state, [opFactory(T0).op({ kind: 'put', relatorio_id: f.relatorioId, path: locationAgruparPath(local), value: true })]);
    const painel = painel1(f);
    const before = groupForPrint(buildSnapshot(f.state, f.relatorioId), 'por_local_e_tipo');
    expect(before.subsections.filter((s) => s.painelId === painel).map((s) => s.kind)).toEqual(['painel', 'seccionadoras', 'disjuntores', 'tps_tcs']);
    const gone = PAINEL_1_TAGS.map((tag) => blockIdOf(f.state, tag));
    removeIt(f, painel);
    for (const input of [buildSnapshot(f.state, f.relatorioId), rawInput(f)]) {
      const grouping = groupForPrint(input, 'por_local_e_tipo');
      expect(grouping.subsections.some((s) => s.painelId === painel)).toBe(false);
      expect(grouping.subsections.some((s) => s.title === 'Painel 1')).toBe(false);
      expect(grouping.subsections.flatMap((s) => s.blockIds).some((id) => gone.includes(id))).toBe(false);
      expect(grouping.subsections.flatMap((s) => s.blockIds)).toHaveLength(5);
    }
  });

  it.each(SHAPES)('%s: section 11 prints no instrument only a sheet of the removed painel named', (_name, removeIt) => {
    const f = removalFixture();
    const instrument: Extract<RegistryRow, { kind: 'instrument' }> = {
      id: '019966b0-0157-7000-8000-000000000001',
      company_id: TEST_COMPANY,
      kind: 'instrument',
      code: '2E',
      name: 'Megôhmetro',
      manufacturer: 'Megabras',
      model: 'MD-5075x',
      serial: null,
      cert_number: '1001/26',
      laboratory: null,
      calibrated_at: null,
      calibration_interval_months: null,
      rbc_accredited: null,
      test_isolacao: null,
      test_resistencia_contato: null,
      test_relacao_transformacao: null,
      certificate_file_id: null,
      removed_at: null,
    } as Extract<RegistryRow, { kind: 'instrument' }>;
    f.state.set(entityKey('registry', instrument.id), instrument);
    // DJ-C02 (Painel 1 › Coluna 2) copied the instrument's header into its first test.
    const blockId = blockIdOf(f.state, 'DJ-C02');
    const block = f.state.get(entityKey('block', blockId)) as BlockRow;
    const testKey = findDefinition('v3', 'disjuntor_mt')!.tests[0]!.key;
    const header = { instrument_id: instrument.id, code: instrument.code, manufacturer: instrument.manufacturer, model: instrument.model, serial: null, cert_number: instrument.cert_number, calibrated_at: null, valid_until: null, test_parameter: null };
    const cell = { value: header as never, source_suggestion_id: null, op_id: '019966b0-0157-7000-8000-000000000002' };
    f.state.set(entityKey('block', blockId), { ...block, sheet: { ...block.sheet, test: { ...block.sheet.test, [testKey]: { ...(block.sheet.test[testKey] ?? { cells: {} }), instrument: cell } } } });
    const before = buildSnapshot(f.state, f.relatorioId);
    expect(before.instruments.map((row) => row.code)).toEqual(['2E']);
    expect(section11Instruments(before).map((entry) => entry.code)).toEqual(['2E']);
    removeIt(f, painel1(f));
    const after = buildSnapshot(f.state, f.relatorioId);
    expect(after.instruments).toEqual([]);
    expect(section11Instruments(after)).toEqual([]);
    // The raw rows, with the instrument still handed in: the sheet is not in the tree, so nothing names it.
    const raw = { ...rawInput(f), instruments: [instrument] };
    expect(section11Instruments(raw)).toEqual([]);
    expect(section11Layout(raw, { number: 11, title: 'CERTIFICADOS' })).toEqual(section11Layout(after, { number: 11, title: 'CERTIFICADOS' }));
  });
});

describe('14.2-UNIT templateFromRelatorio skips a removed location and what hangs under it', () => {
  const META = { id: '019966b0-0158-7000-8000-000000000001', name: 'Sem o painel' };

  it.each(SHAPES)('%s: a painel, from the snapshot and from the raw rows alike', (_name, removeIt) => {
    const f = removalFixture();
    const painel = painel1(f);
    const under = rowsIn(f.state).locations.filter((row) => row.parent_id === painel).map((row) => row.id);
    const before = templateFromRelatorio(buildSnapshot(f.state, f.relatorioId), META);
    expect(before.skeleton.map((node) => node.name)).toEqual(['Subestação', 'Coluna 9', 'Painel 1', 'Coluna 1', 'Coluna 2', 'Painel 2', 'Coluna 1', 'Geradores']);
    expect(before.blocks.reduce((n, block) => n + block.quantity, 0)).toBe(9);
    removeIt(f, painel);
    const fromSnapshot = templateFromRelatorio(buildSnapshot(f.state, f.relatorioId), META);
    const fromRaw = templateFromRelatorio(rawInput(f), META);
    expect(fromRaw).toEqual(fromSnapshot);
    for (const template of [fromSnapshot, fromRaw]) {
      expect(template.skeleton.map((node) => node.name)).toEqual(['Subestação', 'Coluna 9', 'Painel 2', 'Coluna 1', 'Geradores']);
      expect(template.skeleton.some((node) => node.ref === painel || under.includes(node.ref))).toBe(false);
      expect(template.blocks.some((block) => block.skeleton_location_ref !== null && under.includes(block.skeleton_location_ref))).toBe(false);
      expect(template.blocks.reduce((n, block) => n + block.quantity, 0)).toBe(5);
    }
  });

  it.each(SHAPES)('%s: a local', (_name, removeIt) => {
    const f = removalFixture();
    removeIt(f, locationId(f.state, 'Subestação'));
    const fromSnapshot = templateFromRelatorio(buildSnapshot(f.state, f.relatorioId), META);
    expect(templateFromRelatorio(rawInput(f), META)).toEqual(fromSnapshot);
    expect(fromSnapshot.skeleton.map((node) => node.name)).toEqual(['Geradores']);
    expect(fromSnapshot.blocks.map((block) => [block.block_type, block.quantity])).toEqual([['cabos_entrada', 1]]);
  });
});

describe('Epic 14 QA ledger (h): a live sheet stranded under a location removed before the newest revision', () => {
  it('is its own restore entry whatever the cut; restoring it brings back only its removed ancestors, the sheets the removal tombstoned stay removed', () => {
    const f = removalFixture();
    const painel = painel1(f);
    const coluna1 = locationId(f.state, 'Coluna 1', 'Painel 1');
    // Device A removes the painel (every row it saw tombstoned) at T1.
    removeByPlan(f, painel, T1);
    // Device B, offline, had created a sheet in Coluna 1; it syncs after A, at T2.
    const ops = opFactory(T2);
    const created = newEquipmentBlock({
      blockId: '019966b0-0157-7000-8000-000000000001',
      equipmentId: '019966b0-0157-7000-8000-000000000002',
      relatorioId: f.relatorioId,
      projectId: TEST_PROJECT,
      locationId: coluna1,
      type: 'tc',
      tag: 'TC-C01',
      seedVersion: 'v3',
      orderKey: 'z0',
    });
    fold(f.state, [
      ops.op({ kind: 'create', scope: 'project', path: equipmentPath(created.equipment.id), value: created.equipment as unknown as JsonValue, device_id: 'tablet-other' }),
      ops.op({ kind: 'create', relatorio_id: f.relatorioId, path: blockPath(created.block.id), value: created.block as unknown as JsonValue, device_id: 'tablet-other' }),
    ]);
    // A revision is emitted between (its created_at after the removal): the painel's own entry is cut.
    const since = atMinutes(T0, 25).toISOString();
    const rows = rowsIn(f.state);
    const entries = restorableEntries({ ...rows, since });
    expect(entries.some((entry) => entry.kind === 'location')).toBe(false);
    expect(entries).toEqual([
      {
        kind: 'block',
        stranded: true,
        id: created.block.id,
        name: 'TC-C01',
        detail: 'Subestação › Painel 1 › Coluna 1 · restaura Painel 1 › Coluna 1',
        label: 'TC-C01 — Subestação › Painel 1 › Coluna 1 · restaura Painel 1 › Coluna 1',
        equipmentId: created.equipment.id,
        removed_at: T1.toISOString(),
      },
    ]);
    // With no cut the painel's own entry is offered and brings the sheet back with it: listed once.
    expect(restorableEntries({ ...rows, since: null }).map((entry) => [entry.kind, entry.id])).toEqual([['location', painel]]);
    expect(locationRestorePlan({ ...rows, locationId: painel })!.counts.sheets).toBe(PAINEL_1_TAGS.length + 1);
    // Its restore: the removed painel and coluna above it, root first, nothing else.
    expect(removedAncestorIds(rows.locations, coluna1)).toEqual([painel, coluna1]);
    fold(f.state, restoreOps(f.relatorioId, { locationIds: removedAncestorIds(rows.locations, coluna1), blockIds: [], equipmentIds: [] }, T3));
    const back = buildSnapshot(f.state, f.relatorioId);
    expect(back.blocks.some((block) => block.id === created.block.id)).toBe(true);
    // The sheets the removal tombstoned stay removed, and Coluna 2 with them.
    expect(tagsIn(back)).toEqual([...REST_TAGS, 'TC-C01'].sort());
    expect(back.locations.some((row) => row.id === locationId(f.state, 'Coluna 2', 'Painel 1'))).toBe(false);
    // Nothing stranded is left to offer.
    expect(restorableEntries({ ...rowsIn(f.state), since }).filter((entry) => entry.kind === 'block' && entry.stranded === true)).toEqual([]);
    expect(strandedSheetDetailText('Sala dos trafos', ['Sala dos trafos'])).toBe('Sala dos trafos · restaura Sala dos trafos');
  });
});
