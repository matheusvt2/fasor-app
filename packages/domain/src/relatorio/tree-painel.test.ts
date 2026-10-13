import { describe, expect, it } from 'vitest';
import { cabineOf } from './cabine.ts';
import { nextSheet, previousCabineEnv, sheetOrder } from './ficha.ts';
import { locationPathText } from './location-path.ts';
import { movePlan, moveTargets } from './move.ts';
import { panelLocation } from './panel.ts';
import { cabineSemEquipamentoText, preIssue } from './pre-issue.ts';
import { cabineLocationIds, locationProgress, progressCounterText } from './progress.ts';
import { cabineMetaText } from './sumario.ts';
import {
  duplicateTagSuggestion,
  firstInTree,
  locationChoices,
  locationControlName,
  locationTree,
  newEquipmentBlock,
  newLocation,
  paletteItems,
  paletteLocationFor,
  siblingLocations,
  TREE_MAX_LEVEL,
  treeNodes,
  treePathTo,
  type TreeEquipmentNode,
  type TreeLocationNode,
} from './tree.ts';
import type { BlockRow, EquipmentRow, LocationRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { photoCabineId } from '../photos/gallery.ts';
import { addCabine, addColuna, addPainel, setQuantity } from '../templates/compose.ts';
import { emptyTemplate } from '../templates/list.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_RELATORIO, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from './instantiate.ts';

/*
 * 14.2-UNIT: Local › Painel › Coluna in the tree the Sumário's section 9 and the rail draw.
 * A hand-built relatório:
 *
 *   Cabine de transformação (local, Função transformação)   two transformers directly on it
 *     Coluna legado (a coluna directly under the local, the shape before the painel level)
 *     Painel de média tensão                                 Coluna 5, Coluna 6 (one seccionadora each)
 *     Painel B                                               Coluna 5 (one seccionadora)
 *     Painel vazio                                           no coluna
 *   Cubículo Enel (local, no Função)                         one cable set directly on it
 *   Local novo (local, Função "Medição")                     nothing under it
 */

const id = (n: number) => `019966b0-0142-7000-8000-${n.toString(16).padStart(12, '0')}`;

const cabine = (n: number, name: string, order_key: string, over: Partial<Extract<LocationRow, { kind: 'cabine' }>> = {}): LocationRow => ({
  id: id(n),
  relatorio_id: TEST_RELATORIO,
  parent_id: null,
  kind: 'cabine',
  name,
  order_key,
  removed_at: null,
  se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
  env: { altitude_m: null, temperature_c: null, humidity_pct: null },
  agrupar_por_tipo: false,
  ...over,
});
const painel = (n: number, name: string, parent: number, order_key: string): LocationRow => ({ id: id(n), relatorio_id: TEST_RELATORIO, parent_id: id(parent), kind: 'painel', name, order_key, removed_at: null });
const coluna = (n: number, name: string, parent: number, order_key: string): LocationRow => ({ id: id(n), relatorio_id: TEST_RELATORIO, parent_id: id(parent), kind: 'coluna', name, order_key, removed_at: null });

function sheet(n: number, location: number, tag: string, order_key: string, type: BlockRow['block_type']): { block: BlockRow; equipment: EquipmentRow } {
  return newEquipmentBlock({ blockId: id(1000 + n), equipmentId: id(2000 + n), relatorioId: TEST_RELATORIO, projectId: TEST_PROJECT, locationId: id(location), type: type as never, tag, seedVersion: 'v1', orderKey: order_key });
}

const LOCAL = 1;
const LEGADO = 2;
const PNL_MT = 3;
const PNL_B = 4;
const PNL_VAZIO = 5;
const MT_C5 = 6;
const MT_C6 = 7;
const B_C5 = 8;
const ENEL = 9;
const NOVO = 10;

function relatorio(): Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment' | 'suggestions'> {
  const locations: LocationRow[] = [
    cabine(LOCAL, 'Cabine de transformação', 'a0', { funcao: 'transformacao', se: { type: 'Alvenaria', primary_kv: { raw: '13.8', unit: null, state: 'measured' }, secondary_kv: null, installed_kva: null } }),
    // The children of the local share one `order_key` space; the legacy coluna is keyed AFTER the first painel on purpose.
    painel(PNL_MT, 'Painel de média tensão', LOCAL, 'a0'),
    coluna(LEGADO, 'Coluna legado', LOCAL, 'a1'),
    painel(PNL_B, 'Painel B', LOCAL, 'a2'),
    painel(PNL_VAZIO, 'Painel vazio', LOCAL, 'a3'),
    coluna(MT_C6, 'Coluna 6', PNL_MT, 'a1'),
    coluna(MT_C5, 'Coluna 5', PNL_MT, 'a0'),
    coluna(B_C5, 'Coluna 5', PNL_B, 'a0'),
    cabine(ENEL, 'Cubículo Enel', 'a1'),
    cabine(NOVO, 'Local novo', 'a2', { funcao: 'Medição' }),
  ];
  const rows = [
    sheet(1, LOCAL, 'TR-1', 'a0', 'transformador_forca'),
    sheet(2, LOCAL, 'TR-2', 'a1', 'transformador_forca'),
    sheet(3, LEGADO, 'DJ-LEGADO', 'a0', 'disjuntor_mt'),
    sheet(4, MT_C5, 'SEC-C05', 'a0', 'chave_seccionadora'),
    sheet(5, MT_C6, 'SEC-C06', 'a0', 'chave_seccionadora'),
    sheet(6, B_C5, 'SEC-C05-2', 'a0', 'chave_seccionadora'),
    sheet(7, ENEL, 'CE-ENEL', 'a0', 'cabos_entrada'),
  ];
  const blocks = rows.map((row) => row.block);
  // TR-1 is concluded; SEC-C05 of the first painel too.
  blocks[0] = { ...blocks[0]!, concluded_by: { actor_id: TEST_USER, at: '2026-10-13T11:00:00.000Z' } };
  blocks[3] = { ...blocks[3]!, concluded_by: { actor_id: TEST_USER, at: '2026-10-13T11:05:00.000Z' } };
  return { locations, blocks, equipment: rows.map((row) => row.equipment), suggestions: [] };
}

const byName = (tree: readonly TreeLocationNode[], name: string): TreeLocationNode => {
  const found = treeNodes(tree).find((node): node is TreeLocationNode => node.kind !== 'equipment' && node.name === name);
  if (found === undefined) throw new Error(`no location "${name}" in the tree`);
  return found;
};
const tags = (node: TreeLocationNode) => node.equipment.map((row) => row.tag);

describe('14.2-UNIT locationTree: three levels', () => {
  const tree = locationTree(relatorio());
  const local = tree[0]!;

  it('draws a local, its own equipment, the colunas directly under it, then its painéis with their colunas', () => {
    expect(tree.map((node) => [node.kind, node.name])).toEqual([
      ['cabine', 'Cabine de transformação'],
      ['cabine', 'Cubículo Enel'],
      ['cabine', 'Local novo'],
    ]);
    expect(tags(local)).toEqual(['TR-1', 'TR-2']);
    // The legacy coluna comes first whatever its order_key says among the painéis.
    expect(local.locations.map((node) => [node.kind, node.name])).toEqual([
      ['coluna', 'Coluna legado'],
      ['painel', 'Painel de média tensão'],
      ['painel', 'Painel B'],
      ['painel', 'Painel vazio'],
    ]);
    const mt = byName(tree, 'Painel de média tensão');
    expect(mt.equipment).toEqual([]);
    expect(mt.locations.map((node) => node.name)).toEqual(['Coluna 5', 'Coluna 6']);
    expect(tags(mt.locations[0]!)).toEqual(['SEC-C05']);
    expect(byName(tree, 'Painel vazio').locations).toEqual([]);
  });

  it('levels: local 0, painel 1, its coluna 2, the sheet in it 3; a legacy coluna 1 and its sheet 2; a direct sheet 1', () => {
    expect(TREE_MAX_LEVEL).toBe(3);
    const mt = byName(tree, 'Painel de média tensão');
    expect(local.level).toBe(0);
    expect(local.equipment[0]!.level).toBe(1);
    expect(mt.level).toBe(1);
    expect(mt.locations[0]!.level).toBe(2);
    expect(mt.locations[0]!.equipment[0]!.level).toBe(3);
    const legado = byName(tree, 'Coluna legado');
    expect(legado.level).toBe(1);
    expect(legado.equipment[0]!.level).toBe(2);
  });

  it('positions are among the reorder siblings: the same kind under the same parent', () => {
    expect(tree.map((node) => [node.position, node.siblings])).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(local.locations.map((node) => [node.name, node.position, node.siblings])).toEqual([
      ['Coluna legado', 1, 1],
      ['Painel de média tensão', 1, 3],
      ['Painel B', 2, 3],
      ['Painel vazio', 3, 3],
    ]);
    expect(byName(tree, 'Painel de média tensão').locations.map((node) => [node.position, node.siblings])).toEqual([[1, 2], [2, 2]]);
    const all = relatorio().locations;
    expect(siblingLocations(all, id(LOCAL)).map((row) => row.name)).toEqual(['Painel de média tensão', 'Coluna legado', 'Painel B', 'Painel vazio']);
    expect(siblingLocations(all, id(LOCAL), 'painel').map((row) => row.name)).toEqual(['Painel de média tensão', 'Painel B', 'Painel vazio']);
    expect(siblingLocations(all, id(LOCAL), 'coluna').map((row) => row.name)).toEqual(['Coluna legado']);
    expect(siblingLocations(all, id(PNL_MT), 'coluna').map((row) => row.name)).toEqual(['Coluna 5', 'Coluna 6']);
  });

  it('carries the Função on the local only, and leads its Sumário meta with the label', () => {
    expect(local.funcao).toBe('transformacao');
    expect(local.meta).toBe('Transformação · Alvenaria · 13,8 kV');
    expect(byName(tree, 'Painel de média tensão').funcao).toBeNull();
    expect(byName(tree, 'Coluna legado').funcao).toBeNull();
    expect(byName(tree, 'Cubículo Enel').funcao).toBeNull();
    // A typed Função reads as typed; a local nothing hangs under closes its line with "sem painéis".
    expect(byName(tree, 'Local novo').meta).toBe('Medição · sem painéis');
    expect(byName(tree, 'Cubículo Enel').meta).toBe('sem painéis');
    const rows = relatorio().locations;
    expect(cabineMetaText(rows.find((row) => row.name === 'Local novo')!)).toBe('Medição');
    expect(cabineMetaText(rows.find((row) => row.name === 'Cubículo Enel')!)).toBe('—');
    expect(cabineMetaText(rows.find((row) => row.name === 'Painel B')!)).toBe('');
  });

  it('words the painel and coluna meta lines as the mocks do, an empty painel saying why', () => {
    expect(byName(tree, 'Painel de média tensão')).toMatchObject({ meta: 'Painel · 2 colunas', railMeta: 'Painel · 2 colunas · 1 de 2', counterText: '1 de 2', agruparPorTipo: null, metaMissing: null });
    expect(byName(tree, 'Painel B')).toMatchObject({ meta: 'Painel · 1 coluna', railMeta: 'Painel · 1 coluna · 0 de 1' });
    expect(byName(tree, 'Painel vazio')).toMatchObject({ meta: 'Painel · sem colunas', railMeta: 'Painel · sem colunas', counterText: '0 de 0', firstBlockId: null });
    const mt = byName(tree, 'Painel de média tensão');
    expect(mt.locations[0]).toMatchObject({ meta: '', railMeta: '1 de 1' });
    expect(byName(tree, 'Coluna legado')).toMatchObject({ meta: '', railMeta: '0 de 1' });
  });

  it('names the controls of a painel with its local ("Painel B de Cabine de transformação") and of a coluna with what it sits in; a local reads its own name (coordinator review 2026-10-13; second pass, rule 9)', () => {
    expect(byName(tree, 'Painel de média tensão').controlName).toBe('Painel de média tensão de Cabine de transformação');
    expect(byName(tree, 'Painel B').controlName).toBe('Painel B de Cabine de transformação');
    expect(local.controlName).toBe('Cabine de transformação');
    // Second pass (rule 9): a coluna is named with its painel's control name, a legacy coluna with its local.
    expect(byName(tree, 'Coluna legado').controlName).toBe('Coluna legado de Cabine de transformação');
    expect(byName(tree, 'Coluna 6').controlName).toBe('Coluna 6 de Painel de média tensão de Cabine de transformação');
    // Two locals whose first painel is the default "Painel 1": the control names differ.
    const twins = locationTree({
      locations: [cabine(LOCAL, 'Cubículo Enel', 'a0'), cabine(ENEL, 'Geradores', 'a1'), painel(PNL_MT, 'Painel 1', LOCAL, 'a0'), painel(PNL_B, 'Painel 1', ENEL, 'a0')],
      blocks: [],
      equipment: [],
    });
    expect(twins.map((node) => node.locations.map((child) => child.controlName))).toEqual([['Painel 1 de Cubículo Enel'], ['Painel 1 de Geradores']]);
  });

  it('second pass (rule 9): the default "Coluna 1" of two painéis, and of the "Painel 1" of two locals, never share a control name', () => {
    const locations = [
      cabine(LOCAL, 'Cubículo Enel', 'a0'),
      cabine(ENEL, 'Geradores', 'a1'),
      painel(PNL_MT, 'Painel 1', LOCAL, 'a0'),
      painel(PNL_B, 'Painel 2', LOCAL, 'a1'),
      painel(PNL_VAZIO, 'Painel 1', ENEL, 'a0'),
      coluna(MT_C5, 'Coluna 1', PNL_MT, 'a0'),
      coluna(B_C5, 'Coluna 1', PNL_B, 'a0'),
      coluna(MT_C6, 'Coluna 1', PNL_VAZIO, 'a0'),
      coluna(LEGADO, 'Coluna 1', ENEL, 'a0'),
    ];
    const names = treeNodes(locationTree({ locations, blocks: [], equipment: [] }))
      .filter((node): node is TreeLocationNode => node.kind === 'coluna')
      .map((node) => node.controlName);
    expect(names).toEqual(['Coluna 1 de Painel 1 de Cubículo Enel', 'Coluna 1 de Painel 2 de Cubículo Enel', 'Coluna 1 de Geradores', 'Coluna 1 de Painel 1 de Geradores']);
    expect(new Set(names).size).toBe(names.length);
    // The same name from the rows alone, for every drawn node and for a row the tree no longer draws.
    for (const node of treeNodes(locationTree({ locations, blocks: [], equipment: [] }))) {
      if (node.kind !== 'equipment') expect(locationControlName(locations, node.id)).toBe(node.controlName);
    }
    const removed = locations.map((row) => (row.id === id(PNL_MT) || row.id === id(MT_C5) ? { ...row, removed_at: T0.toISOString() } : row));
    expect(locationControlName(removed, id(MT_C5))).toBe('Coluna 1 de Painel 1 de Cubículo Enel');
    expect(locationControlName(removed, id(PNL_MT))).toBe('Painel 1 de Cubículo Enel');
    // A parent the list does not hold ends the name there; an unknown id has none.
    expect(locationControlName([coluna(MT_C5, 'Coluna 1', PNL_MT, 'a0')], id(MT_C5))).toBe('Coluna 1');
    expect(locationControlName(locations, id(9999))).toBe('');
  });

  it('a coluna whose name does not say "Coluna" is led by the word on the rail', () => {
    const snapshot = relatorio();
    const renamed = { ...snapshot, locations: snapshot.locations.map((row) => (row.id === id(MT_C5) ? { ...row, name: 'Entrada' } : row)) };
    expect(byName(locationTree(renamed), 'Entrada').railMeta).toBe('Coluna · 1 de 1');
  });

  it('words the local rail line: "Local", the Função, its painéis (or colunas, or none) and the sheets', () => {
    expect(local.railMeta).toBe('Local · Transformação · 3 painéis · 2 de 6 fichas');
    expect(byName(tree, 'Cubículo Enel').railMeta).toBe('Local · sem painéis · 0 de 1 fichas');
    expect(byName(tree, 'Local novo').railMeta).toBe('Local · Medição · sem painéis · 0 de 0 fichas');
    // A local from before the painel level (colunas directly under it) counts them.
    const snapshot = relatorio();
    const legacy = { ...snapshot, locations: snapshot.locations.filter((row) => row.kind !== 'painel' && ![MT_C5, MT_C6, B_C5].map(id).includes(row.id)) };
    const root = locationTree(legacy)[0]!;
    expect(root.railMeta).toBe('Local · Transformação · 1 coluna · 1 de 3 fichas');
    expect(root.meta).toBe('Transformação · Alvenaria · 13,8 kV');
  });

  it('counts the local own blocks apart ("Equipamentos no local · 1 de 2"), and every level over what hangs under it', () => {
    expect(local.ownCounterText).toBe('1 de 2');
    expect(local.counterText).toBe('2 de 6');
    expect(byName(tree, 'Cubículo Enel').ownCounterText).toBe('0 de 1');
    expect(byName(tree, 'Local novo').ownCounterText).toBeNull();
    expect(byName(tree, 'Painel de média tensão').ownCounterText).toBeNull();
    expect(byName(tree, 'Coluna legado').ownCounterText).toBeNull();
    for (const node of treeNodes(tree)) {
      if (node.kind === 'equipment') continue;
      expect(node.counterText, node.name).toBe(progressCounterText(locationProgress(relatorio(), node.id)));
    }
  });

  it('walks in drawing order: the direct sheets, the legacy coluna, then each painel (sheetOrder, firstInTree, treePathTo)', () => {
    const snapshot = relatorio();
    const order = treeNodes(tree).filter((node): node is TreeEquipmentNode => node.kind === 'equipment').map((node) => node.tag);
    expect(order).toEqual(['TR-1', 'TR-2', 'DJ-LEGADO', 'SEC-C05', 'SEC-C06', 'SEC-C05-2', 'CE-ENEL']);
    expect(sheetOrder(snapshot).map((node) => node.tag)).toEqual(order);
    expect(firstInTree(snapshot, id(LOCAL))).toBe(id(1001));
    expect(firstInTree(snapshot, id(PNL_MT))).toBe(id(1004));
    expect(firstInTree(snapshot, id(PNL_VAZIO))).toBeNull();
    // With nothing directly on the local, the legacy coluna leads, before any painel.
    const noDirect = { ...snapshot, blocks: snapshot.blocks.filter((block) => block.location_id !== id(LOCAL)) };
    expect(firstInTree(noDirect, id(LOCAL))).toBe(id(1003));
    expect(treePathTo(tree, { blockId: id(1006) })).toEqual([id(LOCAL), id(PNL_B), id(B_C5)]);
    expect(treePathTo(tree, { locationId: id(MT_C6) })).toEqual([id(LOCAL), id(PNL_MT), id(MT_C6)]);
    // "Próxima coluna" jumps locations across the painel boundary.
    expect(nextSheet(snapshot, id(1005))).toEqual({ kind: 'coluna', blockId: id(1006) });
    expect(nextSheet(snapshot, id(1001))).toEqual({ kind: 'ficha', blockId: id(1002) });
  });

  it('matrix "Legacy coluna beside painéis": the coluna is drawn directly under its local, exactly as a tree with no painel draws it', () => {
    const snapshot = relatorio();
    const legado = byName(tree, 'Coluna legado');
    const withoutPaineis = { ...snapshot, locations: snapshot.locations.filter((row) => row.kind !== 'painel' && ![MT_C5, MT_C6, B_C5].map(id).includes(row.id)) };
    const before = byName(locationTree(withoutPaineis), 'Coluna legado');
    expect(legado).toEqual(before);
    expect(legado.parentId).toBe(id(LOCAL));
  });

  it('matrix "Local with no painel": a cabine with colunas only keeps the tree it had (kind, level, order, meta, positions)', () => {
    const locations: LocationRow[] = [cabine(21, '1° Subsolo', 'a0', { agrupar_por_tipo: true }), coluna(23, 'Coluna 2', 21, 'a1'), coluna(22, 'Coluna 1', 21, 'a0')];
    const rows = [sheet(31, 22, 'SEC-C01', 'a0', 'chave_seccionadora'), sheet(32, 23, 'DJ-C02', 'a0', 'disjuntor_mt')];
    const [root] = locationTree({ locations, blocks: rows.map((r) => r.block), equipment: rows.map((r) => r.equipment) });
    expect(root).toMatchObject({ kind: 'cabine', level: 0, meta: 'agrupar por tipo', funcao: null, ownCounterText: null, position: 1, siblings: 1 });
    expect(root!.locations.map((node) => [node.kind, node.name, node.level, node.position, node.siblings, node.meta])).toEqual([
      ['coluna', 'Coluna 1', 1, 1, 2, ''],
      ['coluna', 'Coluna 2', 1, 2, 2, ''],
    ]);
    expect(root!.locations[0]!.equipment[0]!.level).toBe(2);
  });
});

describe('14.2-UNIT the palette, the choices and the move', () => {
  const snapshot = relatorio();

  it('matrix "Empty painel": paletteLocationFor is null for a painel with no coluna; a painel with colunas gives its current one', () => {
    expect(paletteLocationFor(snapshot, id(PNL_VAZIO), null)).toBeNull();
    expect(paletteLocationFor(snapshot, id(PNL_VAZIO), id(1004))).toBeNull();
    // The last coluna of the painel, or the one holding the last sheet worked on.
    expect(paletteLocationFor(snapshot, id(PNL_MT), null)).toBe(id(MT_C6));
    expect(paletteLocationFor(snapshot, id(PNL_MT), id(1004))).toBe(id(MT_C5));
    // A last sheet in another painel does not choose.
    expect(paletteLocationFor(snapshot, id(PNL_MT), id(1006))).toBe(id(MT_C6));
  });

  it('paletteLocationFor reads only coluna children: a local with none takes the block itself, one with a legacy coluna keeps the current coluna', () => {
    // Local with a legacy coluna and painéis: the legacy coluna stands (O5); the painéis are never the target.
    expect(paletteLocationFor(snapshot, id(LOCAL), null)).toBe(id(LEGADO));
    expect(paletteLocationFor(snapshot, id(LOCAL), id(1004))).toBe(id(LEGADO));
    // A local with no coluna under it (a masonry room, Cubículo Enel) is the target itself.
    expect(paletteLocationFor(snapshot, id(ENEL), null)).toBe(id(ENEL));
    expect(paletteLocationFor(snapshot, id(NOVO), null)).toBe(id(NOVO));
    // A local holding painéis only: the local itself, never a painel nor a painel's coluna.
    const noLegacy = { ...snapshot, locations: snapshot.locations.filter((row) => row.id !== id(LEGADO)) };
    expect(paletteLocationFor(noLegacy, id(LOCAL), id(1004))).toBe(id(LOCAL));
    // A location that is not live here gives null.
    expect(paletteLocationFor(snapshot, id(9999), null)).toBeNull();
    const removed = { ...snapshot, locations: snapshot.locations.map((row) => (row.id === id(ENEL) ? { ...row, removed_at: '2026-10-13T12:00:00.000Z' } : row)) };
    expect(paletteLocationFor(removed, id(ENEL), null)).toBeNull();
  });

  it('locationChoices and moveTargets leave painéis out, and a coluna path names its painel', () => {
    const choices = locationChoices(snapshot.locations);
    expect(choices.some((choice) => (choice.kind as string) === 'painel')).toBe(false);
    expect(choices.map((choice) => choice.label)).toEqual([
      'Cabine de transformação',
      'Cabine de transformação › Coluna legado',
      'Cabine de transformação › Painel de média tensão › Coluna 5',
      'Cabine de transformação › Painel de média tensão › Coluna 6',
      'Cabine de transformação › Painel B › Coluna 5',
      'Cubículo Enel',
      'Local novo',
    ]);
    const targets = moveTargets(snapshot.locations, { location_id: id(MT_C5) });
    expect(targets.map((target) => target.id)).not.toContain(id(PNL_MT));
    expect(targets.map((target) => target.id)).not.toContain(id(MT_C5));
    expect(targets).toHaveLength(choices.length - 1);
    expect(locationPathText(snapshot.locations, id(B_C5))).toBe('Cabine de transformação › Painel B › Coluna 5');
  });

  it('movePlan refuses a painel target (not-a-block-location) and moves to a coluna of a painel or to the local itself', () => {
    const input = { blocks: snapshot.blocks, locations: snapshot.locations, equipment: snapshot.equipment, blockId: id(1003), rename: false };
    expect(movePlan({ ...input, targetId: id(PNL_MT) })).toEqual({ kind: 'refused', reason: 'not-a-block-location' });
    expect(movePlan({ ...input, targetId: id(PNL_VAZIO) })).toEqual({ kind: 'refused', reason: 'not-a-block-location' });
    expect(movePlan({ ...input, targetId: id(MT_C6) })).toMatchObject({ kind: 'move', targetId: id(MT_C6), text: 'DJ-LEGADO movida para a Coluna 6' });
    expect(movePlan({ ...input, targetId: id(LOCAL) })).toMatchObject({ kind: 'move', targetId: id(LOCAL), text: 'DJ-LEGADO movida para Cabine de transformação' });
  });

  it('duplicateTagSuggestion and paletteItems never name a painel', () => {
    expect(duplicateTagSuggestion({ blockType: 'chave_seccionadora', locationId: id(PNL_MT), tag: 'SEC-X' }, snapshot.locations, snapshot.equipment)).toBe('SEC-X');
    expect(duplicateTagSuggestion({ blockType: 'chave_seccionadora', locationId: id(MT_C5), tag: 'SEC-C05' }, snapshot.locations, snapshot.equipment)).toBe('SEC-C05-3');
    const items = paletteItems('v1', { kind: 'cabine', name: 'Cabine de transformação' }, snapshot.equipment);
    expect(items.find((item) => item.type === 'transformador_forca')!.tag).toBe('TR-3');
    expect(items.find((item) => item.type === 'disjuntor_mt')!.tag).toBe('DJ-TRANSFORMACAO');
  });

  it('matrix "TAG collision across painéis": the palette opened on each of two painéis holding a "Coluna 5" gives SEC-C05 then SEC-C05-2, and the tree flags no duplicate', () => {
    // One local, two painéis, a "Coluna 5" in each, no sheet yet: the palette path of the tree
    // (`paletteLocationFor` on the painel, `paletteItems` on the coluna it gives, `newEquipmentBlock`).
    const P_A = 7001;
    const P_B = 7002;
    const A_C5 = 7003;
    const B_C5_NEW = 7004;
    const locations: LocationRow[] = [
      cabine(LOCAL, 'Cabine de transformação', 'a0'),
      painel(P_A, 'Painel A', LOCAL, 'a0'),
      painel(P_B, 'Painel B', LOCAL, 'a1'),
      coluna(A_C5, 'Coluna 5', P_A, 'a0'),
      coluna(B_C5_NEW, 'Coluna 5', P_B, 'a0'),
    ];
    const blocks: BlockRow[] = [];
    const equipment: EquipmentRow[] = [];
    const tapSeccionadora = (painelRef: number, n: number): string => {
      const target = paletteLocationFor({ locations, blocks }, id(painelRef), null);
      const row = locations.find((location) => location.id === target)!;
      // The palette never opens on the painel itself: its coluna is the block's place and the only name in the TAG.
      if (row.kind === 'painel') throw new Error('the palette target is a painel');
      expect(row).toMatchObject({ kind: 'coluna', name: 'Coluna 5', parent_id: id(painelRef) });
      const tag = paletteItems('v1', { kind: row.kind, name: row.name }, equipment).find((item) => item.type === 'chave_seccionadora')!.tag;
      const pair = newEquipmentBlock({ blockId: id(8000 + n), equipmentId: id(8100 + n), relatorioId: TEST_RELATORIO, projectId: TEST_PROJECT, locationId: row.id, type: 'chave_seccionadora', tag, seedVersion: 'v1', orderKey: 'a0' });
      blocks.push(pair.block);
      equipment.push(pair.equipment);
      return tag;
    };
    expect([tapSeccionadora(P_A, 1), tapSeccionadora(P_B, 2)]).toEqual(['SEC-C05', 'SEC-C05-2']);
    expect(blocks.map((block) => block.location_id)).toEqual([id(A_C5), id(B_C5_NEW)]);
    const drawn = treeNodes(locationTree({ locations, blocks, equipment })).filter((node): node is TreeEquipmentNode => node.kind === 'equipment');
    expect(drawn.map((node) => [node.tag, node.locationId, node.duplicate])).toEqual([
      ['SEC-C05', id(A_C5), false],
      ['SEC-C05-2', id(B_C5_NEW), false],
    ]);
    // A third tap, on the first painel again, goes on counting across both.
    expect(tapSeccionadora(P_A, 3)).toBe('SEC-C05-3');
  });

  it('panelLocation: a photo taken in a coluna of a painel finds the named coluna among that painel own colunas; a painel is never the place', () => {
    expect(panelLocation(snapshot.locations, id(MT_C5), 6)).toMatchObject({ location: { id: id(MT_C6) }, matched: true });
    // Painel B has no Coluna 6: the palette location stands, unmatched (never the other painel's coluna).
    expect(panelLocation(snapshot.locations, id(B_C5), 6)).toMatchObject({ location: { id: id(B_C5) }, matched: false });
    expect(panelLocation(snapshot.locations, id(PNL_MT), 5)).toBeNull();
    expect(panelLocation(snapshot.locations, id(LOCAL), null)).toMatchObject({ location: { id: id(LOCAL) }, matched: false });
  });

  describe('panelLocation with the palette on a local (coordinator review 2026-10-13)', () => {
    it('takes the only coluna of that number inside one of the local painéis', () => {
      // Coluna 6 exists in Painel de média tensão alone.
      expect(panelLocation(snapshot.locations, id(LOCAL), 6)).toMatchObject({ location: { id: id(MT_C6) }, matched: true });
      // Another local never reads this local's painéis.
      expect(panelLocation(snapshot.locations, id(ENEL), 6)).toMatchObject({ location: { id: id(ENEL) }, matched: false });
    });

    it('stays on the local, unmatched, when two painéis hold a coluna of that number; one left alone is taken', () => {
      // Coluna 5 exists in Painel de média tensão and in Painel B: the label does not say which.
      expect(panelLocation(snapshot.locations, id(LOCAL), 5)).toMatchObject({ location: { id: id(LOCAL) }, matched: false });
      const removeRow = (n: number) => snapshot.locations.map((row) => (row.id === id(n) ? { ...row, removed_at: T0.toISOString() } : row));
      // With Painel B's Coluna 5 removed, or Painel B itself removed, the one left is the only match.
      expect(panelLocation(removeRow(B_C5), id(LOCAL), 5)).toMatchObject({ location: { id: id(MT_C5) }, matched: true });
      expect(panelLocation(removeRow(PNL_B), id(LOCAL), 5)).toMatchObject({ location: { id: id(MT_C5) }, matched: true });
    });

    it('a coluna directly under the local still wins over the painéis, as before', () => {
      const direct5 = coluna(9001, 'Coluna 5', LOCAL, 'a9');
      const direct6 = coluna(9002, 'Coluna 6', LOCAL, 'a91');
      const rows = [...snapshot.locations, direct5, direct6];
      // Two painéis hold a Coluna 5 and one holds a Coluna 6: the local's own coluna is the place either way.
      expect(panelLocation(rows, id(LOCAL), 5)).toMatchObject({ location: { id: direct5.id }, matched: true });
      expect(panelLocation(rows, id(LOCAL), 6)).toMatchObject({ location: { id: direct6.id }, matched: true });
      // From a coluna directly under the local the search is the local's direct colunas alone, as before.
      expect(panelLocation(snapshot.locations, id(LEGADO), 6)).toMatchObject({ location: { id: id(LEGADO) }, matched: false });
    });
  });
});

describe('14.2-UNIT newLocation', () => {
  const locations = relatorio().locations;

  it('names a painel and a coluna after their live siblings of that kind, last among every sibling of the parent', () => {
    const p = newLocation(locations, { id: id(5001), relatorioId: TEST_RELATORIO, kind: 'painel', parentId: id(LOCAL) });
    expect(p).toEqual({ id: id(5001), relatorio_id: TEST_RELATORIO, parent_id: id(LOCAL), kind: 'painel', name: 'Painel 4', order_key: p.order_key, removed_at: null });
    expect(p.order_key > 'a3').toBe(true);
    const c = newLocation(locations, { id: id(5002), relatorioId: TEST_RELATORIO, kind: 'coluna', parentId: id(PNL_MT) });
    expect(c).toMatchObject({ kind: 'coluna', parent_id: id(PNL_MT), name: 'Coluna 3' });
    expect(c.order_key > 'a1').toBe(true);
    // The first coluna of an empty painel is "Coluna 1".
    expect(newLocation(locations, { id: id(5003), relatorioId: TEST_RELATORIO, kind: 'coluna', parentId: id(PNL_VAZIO) })).toMatchObject({ name: 'Coluna 1', order_key: 'a0' });
    // A coluna directly under a local (the shape before the painel level) counts the colunas there, not the painéis.
    expect(newLocation(locations, { id: id(5004), relatorioId: TEST_RELATORIO, kind: 'coluna', parentId: id(LOCAL) })).toMatchObject({ name: 'Coluna 2', parent_id: id(LOCAL) });
  });

  it('a local takes the name and Função the dialog chose, and stores no funcao key when none was', () => {
    const chosen = newLocation(locations, { id: id(5005), relatorioId: TEST_RELATORIO, kind: 'cabine', parentId: null, name: 'Cabine primária — 1° Subsolo', funcao: 'primaria' });
    expect(chosen).toMatchObject({ kind: 'cabine', parent_id: null, name: 'Cabine primária — 1° Subsolo', funcao: 'primaria', agrupar_por_tipo: false, se: { type: null }, env: { humidity_pct: null } });
    expect(chosen.order_key > 'a2').toBe(true);
    const plain = newLocation(locations, { id: id(5006), relatorioId: TEST_RELATORIO, kind: 'cabine', parentId: null });
    expect(plain).toMatchObject({ kind: 'cabine', name: 'Cabine 4' });
    expect(Object.keys(plain)).not.toContain('funcao');
    expect(Object.keys(newLocation(locations, { id: id(5007), relatorioId: TEST_RELATORIO, kind: 'cabine', parentId: null, funcao: null }))).not.toContain('funcao');
  });

  it('refuses a local with a parent and a painel or coluna without one', () => {
    expect(() => newLocation(locations, { id: id(5008), relatorioId: TEST_RELATORIO, kind: 'cabine', parentId: id(LOCAL) })).toThrow(/parentId must be null/);
    expect(() => newLocation(locations, { id: id(5009), relatorioId: TEST_RELATORIO, kind: 'painel', parentId: null })).toThrow(/parentId must not be null/);
    expect(() => newLocation(locations, { id: id(5010), relatorioId: TEST_RELATORIO, kind: 'coluna', parentId: null })).toThrow(/parentId must not be null/);
  });
});

describe('14.2-UNIT the readers of a cabine reach through its painéis', () => {
  const snapshot = relatorio();

  it('cabineOf, photoCabineId and cabineLocationIds find the local of a coluna inside a painel', () => {
    expect(cabineOf(snapshot.locations, id(B_C5))?.id).toBe(id(LOCAL));
    expect(cabineOf(snapshot.locations, id(PNL_MT))?.id).toBe(id(LOCAL));
    expect(photoCabineId({ block_id: id(1006) }, snapshot)).toBe(id(LOCAL));
    expect([...cabineLocationIds(snapshot.locations, id(LOCAL))].sort()).toEqual([LOCAL, LEGADO, PNL_MT, PNL_B, PNL_VAZIO, MT_C5, MT_C6, B_C5].map(id).sort());
    expect([...cabineLocationIds(snapshot.locations, id(ENEL))]).toEqual([id(ENEL)]);
  });

  it('"cabine anterior" stays the previous root by order_key, whatever sits under it', () => {
    const measured = (raw: string, unit: string) => ({ raw, unit, state: 'measured' as const });
    const locations = snapshot.locations.map((row) => (row.id === id(LOCAL) && row.kind === 'cabine' ? { ...row, env: { altitude_m: null, temperature_c: measured('25', '°C'), humidity_pct: measured('60', '%') } } : row));
    expect(previousCabineEnv(locations, id(ENEL))).toMatchObject({ cabineId: id(LOCAL), name: 'Cabine de transformação' });
    expect(previousCabineEnv(locations, id(LOCAL))).toBeNull();
  });

  it('the pre-issue "sem equipamento" row counts the sheets inside a painel, and reads "Local ⟨nome⟩"', () => {
    // A relatório born from a template: one local whose only sheet sits in a coluna of a painel, one local with nothing.
    let skeleton = addCabine([], 'loc', 'Subestação', 'primaria');
    skeleton = addPainel(skeleton, 'loc', 'pnl', 'Painel 1');
    skeleton = addColuna(skeleton, 'pnl', 'col', 'Coluna 1');
    skeleton = addCabine(skeleton, 'vazio', 'Geradores');
    const base = { ...emptyTemplate(id(7001), 'v3'), skeleton };
    const template = { ...base, blocks: setQuantity(base, 'col', 'chave_seccionadora', 1) };
    const { relatorioId, drafts } = instantiateTemplate(
      template,
      { id: TEST_PROJECT },
      { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null },
      { newId: idSequence('019966b0-0143-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
    );
    const ops = drafts.map((draft, i) => ({ ...makeOp({ ...draft, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0144-7000-8000-'), now: T0 }), seq: i + 1 }));
    const born = buildSnapshot(replay(ops), relatorioId);
    const rows = preIssue(born).filter((row) => row.kind === 'cabine_sem_equipamento');
    expect(rows.map((row) => row.text)).toEqual(['Local Geradores sem equipamento']);
    expect(cabineSemEquipamentoText('Cabine de transformação')).toBe('Cabine de transformação sem equipamento');
  });
});
