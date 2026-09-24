import { orderKeyBetween, sortByOrderKey } from '../ops/order-key.ts';
import { EQUIPMENT_BLOCK_TYPES, isEquipmentBlockType, type EquipmentBlockType } from '../schemas/block-config.ts';
import { emptySheet, type BlockRow, type EquipmentRow, type JsonValue, type LocationRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getDefinition, getSeed } from '../seed/definitions.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { defaultCabineName, defaultColunaName } from '../templates/text.ts';
import { plural } from '../text/plural.ts';
import { integrityFindings } from './integrity.ts';
import { locationPathText } from './location-path.ts';
import { locationProgress, progressCounterState, progressCounterText } from './progress.ts';
import { isEquipmentBlock, sheetState, sheetStateLabel, type SheetState } from './sheet-state.ts';
import { cabineMetaText } from './sumario.ts';
import { suggestTag, type TagEquipment } from './tag.ts';

/*
 * Stories 4.4 and 4.5: the location tree as data, the one structure the Sumário's section
 * 9 and the rail both draw (EXPERIENCE.md › Relatório tree). Cabine › Coluna/Cubículo ›
 * Equipamento in `order_key` order, a location's own blocks before the locations under it,
 * every equipment row with its AD-18 state, glyph and word, every location with its
 * counter, and the cabine's read-only data line. Depth is not enforced (a block may hang
 * off any node); rows past the second level indent as the second (DESIGN.md: 24 px per
 * level, two levels drawn). The surface renders this and decides nothing.
 */

/** DESIGN.md › Relatório tree: the text glyph before each state word (`aria-hidden` where drawn). */
export const SHEET_STATE_GLYPH: Readonly<Record<SheetState, string>> = {
  concluida: '✓',
  em_preenchimento: '●',
  vazia: '○',
  nao_ensaiada: '⊘',
};

/** The rail's `.tree-state[data-state]` value of a state (`shell-foot.html`). */
export type TreeStateAttr = 'concluida' | 'em-preenchimento' | 'vazia' | 'nao-ensaiada';

const STATE_ATTR: Readonly<Record<SheetState, TreeStateAttr>> = {
  concluida: 'concluida',
  em_preenchimento: 'em-preenchimento',
  vazia: 'vazia',
  nao_ensaiada: 'nao-ensaiada',
};

/** The Sumário's `.s9-state[data-state]` value of a state: the mock's `ok`/`doing`/`empty`, and `nao-ensaiada` (DESIGN.md's fourth state). */
export type SumarioStateAttr = 'ok' | 'doing' | 'empty' | 'nao-ensaiada';

const SUMARIO_STATE_ATTR: Readonly<Record<SheetState, SumarioStateAttr>> = {
  concluida: 'ok',
  em_preenchimento: 'doing',
  vazia: 'empty',
  nao_ensaiada: 'nao-ensaiada',
};

/** The deepest indent the tree draws; a location nested further indents as this one. */
export const TREE_MAX_LEVEL = 2;

const SEP = ' · ';

export interface TreeEquipmentNode {
  kind: 'equipment';
  blockId: string;
  equipmentId: string | null;
  locationId: string;
  /** The equipment's TAG, "" when this device holds no equipment row for it. */
  tag: string;
  /** What a label names the row by: the TAG, else the type. */
  name: string;
  blockType: string;
  /** The seed's name of the block type ("Chave seccionadora"). */
  typeLabel: string;
  state: SheetState;
  stateAttr: TreeStateAttr;
  /** The same state as the Sumário's `.s9-state[data-state]` value (`40-relatorio-overview.html`). */
  sumarioStateAttr: SumarioStateAttr;
  /** The sheet holds something the engineer would lose (`blockHoldsData`): "Remover" asks first. */
  holdsData: boolean;
  glyph: string;
  /** "Concluída". */
  stateWord: string;
  /** The word, and for a sheet not tested its reason: "Não ensaiada · Solicitação do cliente". */
  stateText: string;
  /** 1-based position among the live blocks of the same location, and how many there are. */
  position: number;
  siblings: number;
  /** Another live equipment row of the project carries the same TAG (an `integrity` finding). */
  duplicate: boolean;
  level: number;
}

export interface TreeLocationNode {
  kind: 'cabine' | 'coluna';
  id: string;
  parentId: string | null;
  name: string;
  level: number;
  /** The cabine's read-only data line, "—" when it holds none; "" on a coluna. */
  meta: string;
  /** "3 de 9": the sheets concluded on this node and every node under it. */
  counterText: string;
  counterState: 'complete' | 'pending';
  /** 1-based position among the live locations of the same parent, and how many there are. */
  position: number;
  siblings: number;
  /** The cabine's "Agrupar por tipo" flag; null on a coluna. */
  agruparPorTipo: boolean | null;
  /** The first equipment block under this node in tree order, or null when it holds none. */
  firstBlockId: string | null;
  /** The node's own blocks, in `order_key` order. */
  equipment: TreeEquipmentNode[];
  /** The locations under it, in `order_key` order. */
  locations: TreeLocationNode[];
}

export type TreeNode = TreeLocationNode | TreeEquipmentNode;

/** The seed's name of a block type ("Chave seccionadora"), the type itself when the seed has none. */
export function blockTypeLabel(seedVersion: string, blockType: string): string {
  if (!isEquipmentBlockType(blockType)) return blockType;
  try {
    return getDefinition(seedVersion, 'cabine_primaria', blockType).label;
  } catch {
    return blockType;
  }
}

/** Why a sheet was not tested, as the seed words it (or the typed text of "Outro"); null when it was tested. */
export function notTestedReasonText(block: Pick<BlockRow, 'not_tested' | 'seed_version'>): string | null {
  const notTested = block.not_tested;
  if (notTested === null) return null;
  if (notTested.reason === 'outro' && notTested.text !== null && notTested.text.trim() !== '') return notTested.text.trim();
  try {
    return getSeed(block.seed_version, 'cabine_primaria').not_tested_reasons.find((r) => r.key === notTested.reason)?.label ?? notTested.reason;
  } catch {
    return notTested.reason;
  }
}

/** A sheet holds something the engineer would lose: any state but empty (the remove Confirm asks). */
export function blockHoldsData(block: BlockRow): boolean {
  return sheetState(block) !== 'vazia';
}

/** The live locations of a relatório in `order_key` order. */
function liveLocations(locations: readonly LocationRow[]): LocationRow[] {
  return sortByOrderKey(locations.filter((location) => location.removed_at === null));
}

/** The live locations under `parentId` (null: the roots), in `order_key` order: a location's reorder siblings. */
export function siblingLocations(locations: readonly LocationRow[], parentId: string | null): LocationRow[] {
  return liveLocations(locations).filter((location) => location.parent_id === parentId);
}

/** The live equipment blocks of one location, in `order_key` order: a block's reorder siblings. */
export function locationBlocks(blocks: readonly BlockRow[], locationId: string): BlockRow[] {
  return sortByOrderKey(blocks.filter((block) => block.removed_at === null && block.location_id === locationId && isEquipmentBlock(block)));
}

/**
 * The location tree of a snapshot: its root locations (the cabines), each with its own
 * blocks and the locations under it. `equipment` is the project's (removed rows included);
 * it names the TAGs and finds the duplicates, which a snapshot alone (the equipment of
 * live blocks) could miss across relatórios.
 */
export function locationTree(
  snapshot: Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment'>,
  equipment: readonly Pick<EquipmentRow, 'id' | 'tag' | 'removed_at'>[] = snapshot.equipment,
): TreeLocationNode[] {
  const locations = liveLocations(snapshot.locations);
  const liveIds = new Set(locations.map((location) => location.id));
  const tags = new Map<string, string>();
  for (const row of [...snapshot.equipment, ...equipment]) tags.set(row.id, row.tag);
  const duplicated = new Set(integrityFindings({ equipment }).flatMap((finding) => finding.equipment_ids));

  const equipmentNode = (block: BlockRow, position: number, siblings: number, level: number): TreeEquipmentNode => {
    const state = sheetState(block);
    const word = sheetStateLabel(state);
    const reason = notTestedReasonText(block);
    const tag = block.equipment_id === null ? '' : (tags.get(block.equipment_id) ?? '');
    const typeLabel = blockTypeLabel(block.seed_version, block.block_type);
    return {
      kind: 'equipment',
      blockId: block.id,
      equipmentId: block.equipment_id,
      locationId: block.location_id!,
      tag,
      name: tag === '' ? typeLabel : tag,
      blockType: block.block_type,
      typeLabel,
      state,
      stateAttr: STATE_ATTR[state],
      sumarioStateAttr: SUMARIO_STATE_ATTR[state],
      holdsData: blockHoldsData(block),
      glyph: SHEET_STATE_GLYPH[state],
      stateWord: word,
      stateText: reason === null ? word : `${word}${SEP}${reason}`,
      position,
      siblings,
      duplicate: block.equipment_id !== null && duplicated.has(block.equipment_id),
      level,
    };
  };

  const build = (location: LocationRow, depth: number, position: number, siblings: number): TreeLocationNode => {
    const own = locationBlocks(snapshot.blocks, location.id);
    const children = locations.filter((row) => row.parent_id === location.id);
    const childNodes = children.map((child, i) => build(child, depth + 1, i + 1, children.length));
    const counts = locationProgress(snapshot, location.id);
    const equipmentNodes = own.map((block, i) => equipmentNode(block, i + 1, own.length, Math.min(depth + 1, TREE_MAX_LEVEL)));
    return {
      kind: location.kind,
      id: location.id,
      parentId: location.parent_id,
      name: location.name,
      level: Math.min(depth, TREE_MAX_LEVEL),
      meta: cabineMetaText(location),
      counterText: progressCounterText(counts),
      counterState: progressCounterState(counts),
      position,
      siblings,
      agruparPorTipo: location.kind === 'cabine' ? location.agrupar_por_tipo : null,
      firstBlockId: equipmentNodes[0]?.blockId ?? childNodes.find((child) => child.firstBlockId !== null)?.firstBlockId ?? null,
      equipment: equipmentNodes,
      locations: childNodes,
    };
  };

  // A location whose parent is not live (never on this device, or removed) is drawn as a
  // root, so its blocks never vanish from the tree.
  const roots = locations.filter((location) => location.parent_id === null || !liveIds.has(location.parent_id));
  return roots.map((root, i) => build(root, 0, i + 1, roots.length));
}

/** Every node of a tree, depth first in drawing order (a location, its blocks, then the locations under it). */
export function treeNodes(tree: readonly TreeLocationNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (node: TreeLocationNode) => {
    out.push(node, ...node.equipment);
    node.locations.forEach(walk);
  };
  tree.forEach(walk);
  return out;
}

/** The location ids from the root down to the one holding `blockId` (or to `locationId` itself), for expanding the path. */
export function treePathTo(tree: readonly TreeLocationNode[], target: { blockId?: string; locationId?: string }): string[] {
  const walk = (node: TreeLocationNode, trail: string[]): string[] | null => {
    const path = [...trail, node.id];
    if (target.locationId === node.id) return path;
    if (target.blockId !== undefined && node.equipment.some((row) => row.blockId === target.blockId)) return path;
    for (const child of node.locations) {
      const found = walk(child, path);
      if (found !== null) return found;
    }
    return null;
  };
  for (const root of tree) {
    const found = walk(root, []);
    if (found !== null) return found;
  }
  return [];
}

/**
 * The cabine's first equipment block in depth-first tree order (its own blocks, then its
 * colunas'): where "Abrir primeira ficha (dados da cabine)" goes; null when it holds none.
 */
export function firstInTree(snapshot: Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment'>, cabineId: string): string | null {
  const node = treeNodes(locationTree(snapshot)).find((n): n is TreeLocationNode => n.kind !== 'equipment' && n.id === cabineId);
  return node?.firstBlockId ?? null;
}

/**
 * The TAG "Duplicar" suggests for a copy of a block: the next free TAG of its type in its
 * location ("SEC-C09-2"), the same scheme as the palette; the block's own TAG when its
 * type or location is unknown.
 */
export function duplicateTagSuggestion(
  block: { blockType: string; locationId: string; tag: string },
  locations: readonly Pick<LocationRow, 'id' | 'kind' | 'name'>[],
  equipment: readonly TagEquipment[],
): string {
  const location = locations.find((row) => row.id === block.locationId);
  if (location === undefined || !isEquipmentBlockType(block.blockType)) return block.tag;
  return suggestTag(block.blockType, { kind: location.kind, name: location.name }, equipment);
}

/** The rail head: "Árvore do relatório · 94 blocos", "Árvore do relatório · 1 bloco". */
export function railHeadText(n: number): string {
  return `Árvore do relatório${SEP}${plural(n, 'bloco', 'blocos')}`;
}

/** Where the live block holding an equipment row sits: "1° Subsolo › Coluna 5"; null when no live block of these holds it. */
export function equipmentPathText(
  blocks: readonly Pick<BlockRow, 'equipment_id' | 'location_id' | 'removed_at'>[],
  locations: readonly Pick<LocationRow, 'id' | 'parent_id' | 'name'>[],
  equipmentId: string,
): string | null {
  const block = blocks.find((row) => row.removed_at === null && row.equipment_id === equipmentId && row.location_id !== null);
  if (block === undefined) return null;
  const path = locationPathText(locations, block.location_id);
  return path === '' ? null : path;
}

/** One live location offered by the office palette's "Local": its id and its path. */
export interface LocationChoice {
  id: string;
  kind: 'cabine' | 'coluna';
  name: string;
  /** "1° Subsolo › Coluna 9". */
  label: string;
}

/** Every live location in tree order, labelled by its path (the office palette's "Local" options). */
export function locationChoices(locations: readonly LocationRow[]): LocationChoice[] {
  const live = liveLocations(locations);
  const liveIds = new Set(live.map((location) => location.id));
  const out: LocationChoice[] = [];
  const walk = (location: LocationRow) => {
    out.push({ id: location.id, kind: location.kind, name: location.name, label: locationPathText(live, location.id) });
    live.filter((row) => row.parent_id === location.id).forEach(walk);
  };
  live.filter((location) => location.parent_id === null || !liveIds.has(location.parent_id)).forEach(walk);
  return out;
}

/** One equipment type of the field palette: its seed name and the TAG it would be born with here. */
export interface PaletteItem {
  type: EquipmentBlockType;
  label: string;
  tag: string;
}

/** The field palette's eight rows for a location: each type with its suggested TAG (`suggestTag`, the instantiation's scheme). */
export function paletteItems(seedVersion: string, location: Pick<LocationRow, 'kind' | 'name'>, equipment: readonly TagEquipment[]): PaletteItem[] {
  return EQUIPMENT_BLOCK_TYPES.map((type) => ({
    type,
    label: blockTypeLabel(seedVersion, type),
    tag: suggestTag(type, { kind: location.kind, name: location.name }, equipment),
  }));
}

export interface NewEquipmentBlockInput {
  blockId: string;
  equipmentId: string;
  relatorioId: string;
  projectId: string;
  locationId: string;
  type: EquipmentBlockType;
  tag: string;
  /** The relatório's seed version: the block is born on it. */
  seedVersion: string;
  orderKey: string;
  /** The config to copy ("Duplicar"); the seed's default for the type otherwise. */
  config?: JsonValue;
}

/**
 * The equipment row (project scope) and the block row one palette tap or one "Duplicar"
 * creates, in the shapes `instantiateTemplate` writes (Story 4.1): the TAG trimmed, the
 * sheet empty, nothing concluded or marked not tested.
 */
export function newEquipmentBlock(input: NewEquipmentBlockInput): { equipment: EquipmentRow; block: BlockRow } {
  const equipment: EquipmentRow = {
    id: input.equipmentId,
    project_id: input.projectId,
    tag: input.tag.trim(),
    type: input.type,
    last_nameplate: null,
    removed_at: null,
  };
  const block: BlockRow = {
    id: input.blockId,
    relatorio_id: input.relatorioId,
    location_id: input.locationId,
    equipment_id: input.equipmentId,
    block_type: input.type,
    config: input.config === undefined ? (defaultBlockConfig(input.seedVersion, input.type) as unknown as JsonValue) : structuredClone(input.config),
    seed_version: input.seedVersion,
    order_key: input.orderKey,
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: emptySheet(),
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
  return { equipment, block };
}

/**
 * The `order_key` of a new block in a location: right after `anchorBlockId` when it is one
 * of the location's live blocks ("Adicionar abaixo", "Duplicar"), else after the last one.
 */
export function newBlockOrderKey(blocks: readonly BlockRow[], locationId: string, anchorBlockId: string | null): string {
  const siblings = locationBlocks(blocks, locationId);
  const anchor = anchorBlockId === null ? undefined : siblings.find((block) => block.id === anchorBlockId);
  if (anchor !== undefined) {
    const at = siblings.indexOf(anchor);
    let upper = at + 1;
    while (upper < siblings.length && siblings[upper]!.order_key <= anchor.order_key) upper += 1;
    return orderKeyBetween(anchor.order_key, siblings[upper]?.order_key ?? null);
  }
  return orderKeyBetween(siblings.at(-1)?.order_key ?? null, null);
}

/**
 * A new location as "Adicionar coluna" (under a cabine) or "Adicionar cabine" (at the
 * root) creates it: named "Coluna ⟨n+1⟩" / "Cabine ⟨n+1⟩" after its live siblings, last
 * among them; a cabine with no SE data, no environment and "Agrupar por tipo" off.
 */
export function newLocation(locations: readonly LocationRow[], input: { id: string; relatorioId: string; parentId: string | null }): LocationRow {
  const siblings = siblingLocations(locations, input.parentId);
  const order_key = orderKeyBetween(siblings.at(-1)?.order_key ?? null, null);
  const base = { id: input.id, relatorio_id: input.relatorioId, parent_id: input.parentId, order_key, removed_at: null };
  if (input.parentId !== null) return { ...base, kind: 'coluna', name: defaultColunaName(siblings.length + 1) };
  return {
    ...base,
    kind: 'cabine',
    name: defaultCabineName(siblings.length + 1),
    se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
    env: { altitude_m: null, temperature_c: null, humidity_pct: null },
    agrupar_por_tipo: false,
  };
}
