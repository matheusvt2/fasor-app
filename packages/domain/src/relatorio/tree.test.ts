import { describe, expect, it } from 'vitest';
import type { BlockRow, Cell, EquipmentRow, LocationRow, SuggestionRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { TEST_PROJECT, TEST_RELATORIO, TEST_USER } from '../test-support.ts';
import { locationPathText } from './location-path.ts';
import {
  blockHoldsData,
  blockTypeLabel,
  duplicateTagSuggestion,
  equipmentPathText,
  firstInTree,
  locationBlocks,
  locationChoices,
  locationTree,
  newBlockOrderKey,
  newEquipmentBlock,
  newLocation,
  notTestedReasonText,
  paletteItems,
  railHeadText,
  SHEET_STATE_GLYPH,
  siblingLocations,
  treeNodes,
  treePathTo,
  type TreeEquipmentNode,
  type TreeLocationNode,
} from './tree.ts';

/*
 * 4.4-UNIT: the location tree the Sumário's section 9 and the rail draw, over a small
 * hand-built relatório: cabines A and B, B with a block of its own and colunas 4 and 5,
 * a location nested under Coluna 4, a removed block, a cabine with nothing in it.
 */

const id = (n: number) => `019966b0-0060-7000-8000-${n.toString(16).padStart(12, '0')}`;

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

const coluna = (n: number, name: string, parent: number, order_key: string): LocationRow => ({
  id: id(n),
  relatorio_id: TEST_RELATORIO,
  parent_id: id(parent),
  kind: 'coluna',
  name,
  order_key,
  removed_at: null,
});

function sheet(n: number, location: number, tag: string, order_key: string, type: BlockRow['block_type'] = 'chave_seccionadora'): { block: BlockRow; equipment: EquipmentRow } {
  return newEquipmentBlock({
    blockId: id(1000 + n),
    equipmentId: id(2000 + n),
    relatorioId: TEST_RELATORIO,
    projectId: TEST_PROJECT,
    locationId: id(location),
    type: type as never,
    tag,
    seedVersion: 'v1',
    orderKey: order_key,
  });
}

const filled: Cell = { value: 'BLUTRAFOS', source_suggestion_id: null, op_id: id(9001) };

function relatorio(): Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment' | 'suggestions'> {
  const locations = [
    cabine(1, 'Cabine A', 'a1'),
    cabine(2, 'Cabine B', 'a0', { se: { type: 'SE', primary_kv: { raw: '13.8', unit: null, state: 'measured' }, secondary_kv: null, installed_kva: null }, agrupar_por_tipo: true }),
    coluna(3, 'Coluna 5', 2, 'a1'),
    coluna(4, 'Coluna 4', 2, 'a0'),
    coluna(5, 'Nicho', 4, 'a0'),
    cabine(6, 'Cabine Vazia', 'a2'),
  ];
  const rows = [
    sheet(1, 2, 'CE-B', 'a0', 'cabos_entrada'),
    sheet(2, 3, 'SEC-C05', 'a1'),
    sheet(3, 3, 'DJ-C05', 'a0', 'disjuntor_mt'),
    sheet(4, 4, 'SEC-C04', 'a0'),
    sheet(5, 5, 'TP-NICHO', 'a0', 'tp'),
    sheet(6, 1, 'CE-A', 'a0', 'cabos_entrada'),
    sheet(7, 3, 'TC-C05', 'a2', 'tc'),
  ];
  const blocks = rows.map((r) => r.block);
  // SEC-C05: not tested; DJ-C05: concluded; SEC-C04: one filled cell; TC-C05: removed.
  blocks[1] = { ...blocks[1]!, not_tested: { reason: 'solicitacao_cliente', text: null, at: '2026-09-07T10:00:00.000Z', by: TEST_USER } };
  blocks[2] = { ...blocks[2]!, concluded_by: { actor_id: TEST_USER, at: '2026-09-07T11:00:00.000Z' } };
  blocks[3] = { ...blocks[3]!, sheet: { ...blocks[3]!.sheet, nameplate: { fabricante: filled } } };
  blocks[6] = { ...blocks[6]!, removed_at: '2026-09-07T12:00:00.000Z' };
  return {
    locations,
    blocks,
    equipment: rows.map((r) => r.equipment),
    suggestions: [],
  };
}

const eq = (node: TreeLocationNode) => node.equipment.map((row) => row.tag);

describe('4.4-UNIT locationTree', () => {
  it('orders cabines by order_key; under B its own blocks first, then its colunas, each with its blocks; removed rows absent', () => {
    const tree = locationTree(relatorio());
    expect(tree.map((node) => node.name)).toEqual(['Cabine B', 'Cabine A', 'Cabine Vazia']);
    const b = tree[0]!;
    expect(eq(b)).toEqual(['CE-B']);
    expect(b.locations.map((node) => node.name)).toEqual(['Coluna 4', 'Coluna 5']);
    expect(eq(b.locations[1]!)).toEqual(['DJ-C05', 'SEC-C05']);
    // Deeper locations nest generically; past the second level they indent as the second.
    const nicho = b.locations[0]!.locations[0]!;
    expect(nicho).toMatchObject({ name: 'Nicho', kind: 'coluna', level: 2 });
    expect(nicho.equipment[0]).toMatchObject({ tag: 'TP-NICHO', level: 2 });
    expect(b.level).toBe(0);
    expect(b.equipment[0]!.level).toBe(1);
    expect(b.locations[1]!.level).toBe(1);
    expect(b.locations[1]!.equipment[0]!.level).toBe(2);
    expect(treeNodes(tree).some((node) => node.kind === 'equipment' && node.tag === 'TC-C05')).toBe(false);
  });

  it('gives each row its position among its own siblings', () => {
    const tree = locationTree(relatorio());
    expect(tree.map((node) => [node.position, node.siblings])).toEqual([[1, 3], [2, 3], [3, 3]]);
    const c5 = tree[0]!.locations[1]!;
    expect(c5.equipment.map((row) => [row.tag, row.position, row.siblings])).toEqual([['DJ-C05', 1, 2], ['SEC-C05', 2, 2]]);
  });

  it('draws each equipment row with its AD-18 state, glyph and word; not tested carries its reason', () => {
    const rows = treeNodes(locationTree(relatorio())).filter((node): node is TreeEquipmentNode => node.kind === 'equipment');
    const byTag = new Map(rows.map((row) => [row.tag, row]));
    expect(byTag.get('SEC-C05')).toMatchObject({ state: 'nao_ensaiada', glyph: '⊘', stateAttr: 'nao-ensaiada', stateWord: 'Não ensaiada', stateText: 'Não ensaiada · Solicitação do cliente' });
    expect(byTag.get('DJ-C05')).toMatchObject({ state: 'concluida', glyph: '✓', stateAttr: 'concluida', stateText: 'Concluída' });
    expect(byTag.get('SEC-C04')).toMatchObject({ state: 'em_preenchimento', glyph: '●', stateAttr: 'em-preenchimento', stateText: 'Em preenchimento' });
    expect(byTag.get('CE-B')).toMatchObject({ state: 'vazia', glyph: '○', stateAttr: 'vazia', stateText: 'Vazia' });
    expect(byTag.get('SEC-C04')!.typeLabel).toBe('Chave seccionadora');
    expect(byTag.get('SEC-C05')).toMatchObject({ sumarioStateAttr: 'nao-ensaiada', holdsData: true });
    expect(byTag.get('DJ-C05')).toMatchObject({ sumarioStateAttr: 'ok', holdsData: true });
    expect(byTag.get('SEC-C04')).toMatchObject({ sumarioStateAttr: 'doing', holdsData: true });
    expect(byTag.get('CE-B')).toMatchObject({ sumarioStateAttr: 'empty', holdsData: false });
    expect(SHEET_STATE_GLYPH).toEqual({ concluida: '✓', em_preenchimento: '●', vazia: '○', nao_ensaiada: '⊘' });
  });

  it('a pending suggestion for an empty block never makes it filled (AD-12: a suggestion row, never a cell)', () => {
    const snapshot = relatorio();
    const ceB = snapshot.blocks[0]!;
    const pending: SuggestionRow = {
      id: id(8001),
      relatorio_id: TEST_RELATORIO,
      target_path: `sheet/${ceB.id}/nameplate/fabricante`,
      value: 'BLUTRAFOS',
      trust: 'suggested',
      mode: 'fill',
      source: { photo_id: id(8002), bbox: [0, 0, 10, 10], ocr_token_ids: [], reading_run_id: id(8003) },
      status: 'pending',
      prompt_version: 'v1',
    };
    const withSuggestion = { ...snapshot, suggestions: [pending] };
    const tree = locationTree(withSuggestion);
    const row = treeNodes(tree).find((node): node is TreeEquipmentNode => node.kind === 'equipment' && node.tag === 'CE-B')!;
    expect(row).toMatchObject({ state: 'vazia', holdsData: false });
  });

  it('writes the cabine meta and every location counter; a coluna has no meta', () => {
    const tree = locationTree(relatorio());
    expect(tree[0]!.meta).toBe('SE · 13,8 kV · agrupar por tipo');
    expect(tree[0]!.agruparPorTipo).toBe(true);
    expect(tree[2]!.meta).toBe('—');
    // B: CE-B, SEC-C04, TP-NICHO, DJ-C05 (concluded), SEC-C05 (not tested) -> 2 of 5.
    expect(tree[0]!.counterText).toBe('2 de 5');
    expect(tree[0]!.counterState).toBe('pending');
    expect(tree[0]!.locations[1]).toMatchObject({ meta: '', counterText: '2 de 2', counterState: 'complete', agruparPorTipo: null });
    expect(tree[2]!.counterText).toBe('0 de 0');
  });

  it('firstInTree: the first block depth first; null for a cabine with no live equipment', () => {
    const snapshot = relatorio();
    expect(firstInTree(snapshot, id(2))).toBe(id(1001));
    expect(firstInTree(snapshot, id(6))).toBeNull();
    // Without its own block, B's first sheet is the first in Coluna 4 (SEC-C04), not Coluna 5.
    const withoutOwn = { ...snapshot, blocks: snapshot.blocks.map((b) => (b.id === id(1001) ? { ...b, removed_at: '2026-09-08T00:00:00.000Z' } : b)) };
    expect(firstInTree(withoutOwn, id(2))).toBe(id(1004));
  });

  it('marks the rows whose TAG another live equipment row of the project shares', () => {
    const snapshot = relatorio();
    const elsewhere: EquipmentRow = { id: id(3001), project_id: TEST_PROJECT, tag: 'sec-c05 ', type: 'chave_seccionadora', last_nameplate: null, removed_at: null };
    const tree = locationTree(snapshot, [...snapshot.equipment, elsewhere]);
    const rows = treeNodes(tree).filter((node): node is TreeEquipmentNode => node.kind === 'equipment');
    expect(rows.filter((row) => row.duplicate).map((row) => row.tag)).toEqual(['SEC-C05']);
    // A removed holder never counts.
    const gone = locationTree(snapshot, [...snapshot.equipment, { ...elsewhere, removed_at: '2026-09-08T00:00:00.000Z' }]);
    expect(treeNodes(gone).some((node) => node.kind === 'equipment' && node.duplicate)).toBe(false);
  });

  it('treePathTo: the location ids down to a block or a location', () => {
    const tree = locationTree(relatorio());
    expect(treePathTo(tree, { blockId: id(1005) })).toEqual([id(2), id(4), id(5)]);
    expect(treePathTo(tree, { locationId: id(3) })).toEqual([id(2), id(3)]);
    expect(treePathTo(tree, { blockId: 'nope' })).toEqual([]);
  });
});

describe('4.4/4.5-UNIT tree texts and writes', () => {
  it('locationPathText and equipmentPathText', () => {
    const snapshot = relatorio();
    expect(locationPathText(snapshot.locations, id(3))).toBe('Cabine B › Coluna 5');
    expect(locationPathText(snapshot.locations, id(5))).toBe('Cabine B › Coluna 4 › Nicho');
    expect(locationPathText(snapshot.locations, null)).toBe('');
    expect(equipmentPathText(snapshot.blocks, snapshot.locations, id(2002))).toBe('Cabine B › Coluna 5');
    expect(equipmentPathText(snapshot.blocks, snapshot.locations, id(2007))).toBeNull();
  });

  it('duplicateTagSuggestion: the next free TAG of the type in the location, the own TAG when unknown', () => {
    const snapshot = relatorio();
    expect(duplicateTagSuggestion({ blockType: 'chave_seccionadora', locationId: id(3), tag: 'SEC-C05' }, snapshot.locations, snapshot.equipment)).toBe('SEC-C05-2');
    expect(duplicateTagSuggestion({ blockType: 'chave_seccionadora', locationId: 'nope', tag: 'SEC-C05' }, snapshot.locations, snapshot.equipment)).toBe('SEC-C05');
    expect(duplicateTagSuggestion({ blockType: 'section_2', locationId: id(3), tag: 'X' }, snapshot.locations, snapshot.equipment)).toBe('X');
  });

  it('railHeadText', () => {
    expect(railHeadText(94)).toBe('Árvore do relatório · 94 blocos');
    expect(railHeadText(1)).toBe('Árvore do relatório · 1 bloco');
  });

  it('blockHoldsData is every state but empty', () => {
    const blocks = relatorio().blocks;
    expect(blocks.map(blockHoldsData)).toEqual([false, true, true, true, false, false, false]);
  });

  it('notTestedReasonText and blockTypeLabel read the seed', () => {
    const [b] = relatorio().blocks;
    expect(notTestedReasonText(b!)).toBeNull();
    expect(notTestedReasonText({ ...b!, not_tested: { reason: 'outro', text: ' Chuva ', at: '2026-09-07T10:00:00.000Z', by: TEST_USER } })).toBe('Chuva');
    expect(notTestedReasonText({ ...b!, not_tested: { reason: 'outro', text: null, at: '2026-09-07T10:00:00.000Z', by: TEST_USER } })).toBe('Outro');
    expect(blockTypeLabel('v1', 'disjuntor_mt')).toBe('Disjuntor MT');
    expect(blockTypeLabel('v1', 'section_2')).toBe('section_2');
  });

  it('newEquipmentBlock builds the equipment and block rows a palette tap creates, on the seed version given', () => {
    const { equipment, block } = newEquipmentBlock({
      blockId: id(4001),
      equipmentId: id(4002),
      relatorioId: TEST_RELATORIO,
      projectId: TEST_PROJECT,
      locationId: id(3),
      type: 'chave_seccionadora',
      tag: ' SEC-C09 ',
      seedVersion: 'v1',
      orderKey: 'a5',
    });
    expect(equipment).toEqual({ id: id(4002), project_id: TEST_PROJECT, tag: 'SEC-C09', type: 'chave_seccionadora', last_nameplate: null, removed_at: null });
    expect(block).toMatchObject({ id: id(4001), location_id: id(3), equipment_id: id(4002), block_type: 'chave_seccionadora', seed_version: 'v1', order_key: 'a5', not_tested: null, concluded_by: null, removed_at: null });
    expect((block.config as { block_type: string }).block_type).toBe('chave_seccionadora');
  });

  it('newBlockOrderKey places a new block after its anchor, else last', () => {
    const blocks = relatorio().blocks;
    const inC5 = locationBlocks(blocks, id(3)).map((b) => b.order_key);
    expect(inC5).toEqual(['a0', 'a1']);
    const afterDj = newBlockOrderKey(blocks, id(3), id(1003));
    expect(afterDj > 'a0' && afterDj < 'a1').toBe(true);
    expect(newBlockOrderKey(blocks, id(3), null) > 'a1').toBe(true);
    expect(newBlockOrderKey(blocks, id(6), null)).toBe('a0');
  });

  it('newLocation names a coluna and a cabine after their live siblings, last among them', () => {
    const locations = relatorio().locations;
    const col = newLocation(locations, { id: id(5001), relatorioId: TEST_RELATORIO, parentId: id(2) });
    expect(col).toMatchObject({ kind: 'coluna', name: 'Coluna 3', parent_id: id(2) });
    expect(col.order_key > 'a1').toBe(true);
    const cab = newLocation(locations, { id: id(5002), relatorioId: TEST_RELATORIO, parentId: null });
    expect(cab).toMatchObject({ kind: 'cabine', name: 'Cabine 4', parent_id: null, agrupar_por_tipo: false, se: { type: null }, env: { temperature_c: null } });
    expect(siblingLocations(locations, null).map((l) => l.name)).toEqual(['Cabine B', 'Cabine A', 'Cabine Vazia']);
  });

  it('paletteItems suggests each type TAG for the location; locationChoices labels live locations by path in tree order', () => {
    const snapshot = relatorio();
    const items = paletteItems('v1', { kind: 'coluna', name: 'Coluna 5' }, snapshot.equipment);
    expect(items).toHaveLength(8);
    expect(items.find((i) => i.type === 'chave_seccionadora')).toEqual({ type: 'chave_seccionadora', label: 'Chave seccionadora', tag: 'SEC-C05-2' });
    expect(items.find((i) => i.type === 'para_raio')!.tag).toBe('PR-C05');
    expect(locationChoices(snapshot.locations).map((c) => c.label)).toEqual([
      'Cabine B',
      'Cabine B › Coluna 4',
      'Cabine B › Coluna 4 › Nicho',
      'Cabine B › Coluna 5',
      'Cabine A',
      'Cabine Vazia',
    ]);
  });
});
