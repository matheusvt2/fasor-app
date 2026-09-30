import type { RelatorioSummary } from '../contract/sync.ts';
import { orderKeyBetween, sortByOrderKey } from '../ops/order-key.ts';
import { EQUIPMENT_BLOCK_TYPES, isEquipmentBlockType, type EquipmentBlockType } from '../schemas/block-config.ts';
import { emptySheet, type BlockRow, type EquipmentRow, type JsonValue, type LocationRow, type SuggestionRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { findDefinition, findSeed } from '../seed/definitions.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { defaultCabineName, defaultColunaName } from '../templates/text.ts';
import { plural } from '../text/plural.ts';
import { integrityFindings } from './integrity.ts';
import { locationPathText } from './location-path.ts';
import { locationProgressIndex, progressCounterState, progressCounterText } from './progress.ts';
import { isEquipmentBlock, sheetState, sheetStateLabel, type SheetState } from './sheet-state.ts';
import { cabineMissingText, cabineProgress } from './cabine.ts';
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
  /** The rail row's `.tree-meta`: the TAG, and for a sheet not tested its reason ("SEC-C05 · Solicitação do cliente"); the rail's state keeps the word alone. */
  railMetaText: string;
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
  /** Story 12.3: "falta a umidade" / "faltam 3 campos" after the meta while a cabine field is empty; null otherwise (and on a coluna). */
  metaMissing: string | null;
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
  return findDefinition(seedVersion, blockType)?.label ?? blockType;
}

/** Why a sheet was not tested, as the seed words it (or the typed text of "Outro"); null when it was tested. */
export function notTestedReasonText(block: Pick<BlockRow, 'not_tested' | 'seed_version'>): string | null {
  const notTested = block.not_tested;
  if (notTested === null) return null;
  if (notTested.reason === 'outro' && notTested.text !== null && notTested.text.trim() !== '') return notTested.text.trim();
  return findSeed(block.seed_version)?.not_tested_reasons.find((r) => r.key === notTested.reason)?.label ?? notTested.reason;
}

/** A sheet holds something the engineer would lose: any state but empty (the remove Confirm asks). */
export function blockHoldsData(block: BlockRow): boolean {
  return sheetState(block) !== 'vazia';
}

/**
 * True when another live block (of any relatório in `blocks`) references the equipment
 * `blockId` names (Epic 4 QA Q4): a later relatório of the obra reuses the project's
 * equipment, so removing one of its sheets must not tombstone the row another sheet holds.
 */
export function equipmentSharedElsewhere(blocks: readonly Pick<BlockRow, 'id' | 'equipment_id' | 'removed_at'>[], equipmentId: string, blockId: string): boolean {
  return blocks.some((block) => block.id !== blockId && block.removed_at === null && block.equipment_id === equipmentId);
}

/**
 * Whether removing the sheet `blockId` also frees (tombstones) its equipment `equipmentId`
 * (E9 sweep B15). Only when this device can see every sheet that could hold it: no other
 * live block in `blocks` (this relatório's and the obra's other relatórios on this device)
 * references it (`equipmentSharedElsewhere`), the company stream was pulled to the end
 * (`companyDownloaded`: before that an empty summary says nothing), and every other
 * relatório of the project the company summary lists is held here with its stream pulled
 * to the end (`downloadedStreamIds`, as `newRelatorioEquipmentReady` reads them). A
 * relatório of the obra this device never pulled, or pulled only in part, may hold the
 * equipment through a block this device cannot see, so the equipment stays live.
 */
export function equipmentFreedByRemoval(input: {
  blocks: readonly Pick<BlockRow, 'id' | 'equipment_id' | 'removed_at'>[];
  equipmentId: string;
  blockId: string;
  projectId: string;
  relatorioId: string;
  companyDownloaded: boolean;
  summaries: readonly Pick<RelatorioSummary, 'id' | 'project_id'>[];
  heldRelatorioIds: ReadonlySet<string> | readonly string[];
  downloadedStreamIds: ReadonlySet<string> | readonly string[];
}): boolean {
  if (equipmentSharedElsewhere(input.blocks, input.equipmentId, input.blockId)) return false;
  if (!input.companyDownloaded) return false;
  const held = new Set(input.heldRelatorioIds);
  const downloaded = new Set(input.downloadedStreamIds);
  return input.summaries.every(
    (row) => row.project_id !== input.projectId || row.id === input.relatorioId || (held.has(row.id) && downloaded.has(row.id)),
  );
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

/** The live equipment blocks of every location, each in `order_key` order: `locationBlocks` for all locations in one pass. */
function liveBlocksByLocation(blocks: readonly BlockRow[]): Map<string, BlockRow[]> {
  const out = new Map<string, BlockRow[]>();
  for (const block of blocks) {
    if (block.removed_at !== null || block.location_id === null || !isEquipmentBlock(block)) continue;
    const bucket = out.get(block.location_id);
    if (bucket === undefined) out.set(block.location_id, [block]);
    else bucket.push(block);
  }
  for (const [id, bucket] of out) out.set(id, sortByOrderKey(bucket));
  return out;
}

/** Live locations (already in `order_key` order) grouped by `parent_id`, each group keeping that order. */
function childrenByParent(locations: readonly LocationRow[]): Map<string, LocationRow[]> {
  const out = new Map<string, LocationRow[]>();
  for (const location of locations) {
    if (location.parent_id === null) continue;
    const bucket = out.get(location.parent_id);
    if (bucket === undefined) out.set(location.parent_id, [location]);
    else bucket.push(location);
  }
  return out;
}

/*
 * K-17/K-2 (full review 2026-09-30): `locationTree` is memoized on the identity of what it
 * reads -- the `blocks`, `locations` and `equipment` arrays of the snapshot, the `equipment`
 * argument, the relatório row and the `pending` rows -- in nested WeakMaps. The device's
 * incremental snapshot builder keeps an array's identity while its rows do not change, so
 * the surfaces, the Sumário, the parecer and the points of one render share one build, and a
 * commit (a new `blocks` array) pays one. A caller that wraps the same arrays in a new
 * object still hits the cache: the key is the arrays, never the wrapper. The returned tree is
 * shared: callers read it and never mutate it.
 */
const NONE: object = {};
const treeMemo = new WeakMap<object, unknown>();

function memoized<T>(keys: readonly object[], compute: () => T): T {
  let map = treeMemo;
  for (const key of keys.slice(0, -1)) {
    let next = map.get(key) as WeakMap<object, unknown> | undefined;
    if (next === undefined) {
      next = new WeakMap();
      map.set(key, next);
    }
    map = next;
  }
  const last = keys[keys.length - 1]!;
  if (map.has(last)) return map.get(last) as T;
  const value = compute();
  map.set(last, value);
  return value;
}

/**
 * The location tree of a snapshot: its root locations (the cabines), each with its own
 * blocks and the locations under it. `equipment` is the project's (removed rows included);
 * it names the TAGs and finds the duplicates, which a snapshot alone (the equipment of
 * live blocks) could miss across relatórios.
 */
export function locationTree(
  snapshot: Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment'> & Partial<Pick<RelatorioSnapshot, 'relatorio'>>,
  equipment: readonly Pick<EquipmentRow, 'id' | 'tag' | 'removed_at'>[] = snapshot.equipment,
  /** Story 8.1: the device's pending suggestion rows; a block holding one is not concluded in the counters. */
  pending?: readonly SuggestionRow[],
): TreeLocationNode[] {
  return memoized([snapshot.blocks, snapshot.locations, snapshot.equipment, equipment, snapshot.relatorio ?? NONE, pending ?? NONE], () =>
    buildLocationTree(snapshot, equipment, pending),
  );
}

function buildLocationTree(
  snapshot: Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment'> & Partial<Pick<RelatorioSnapshot, 'relatorio'>>,
  equipment: readonly Pick<EquipmentRow, 'id' | 'tag' | 'removed_at'>[],
  pending: readonly SuggestionRow[] | undefined,
): TreeLocationNode[] {
  const locations = liveLocations(snapshot.locations);
  // The cabine's missing fields need the seed version; a caller without the relatório row gets none.
  const relatorio = snapshot.relatorio;
  const liveIds = new Set(locations.map((location) => location.id));
  const tags = new Map<string, string>();
  for (const row of [...snapshot.equipment, ...equipment]) tags.set(row.id, row.tag);
  const duplicated = new Set(integrityFindings({ equipment }).flatMap((finding) => finding.equipment_ids));
  const blocksAt = liveBlocksByLocation(snapshot.blocks);
  const childrenOf = childrenByParent(locations);
  const progressOf = locationProgressIndex(snapshot, pending);

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
      railMetaText: [tag, reason].filter((part): part is string => part !== null && part !== '').join(SEP),
      position,
      siblings,
      duplicate: block.equipment_id !== null && duplicated.has(block.equipment_id),
      level,
    };
  };

  const build = (location: LocationRow, depth: number, position: number, siblings: number): TreeLocationNode => {
    const own = blocksAt.get(location.id) ?? [];
    const children = childrenOf.get(location.id) ?? [];
    const childNodes = children.map((child, i) => build(child, depth + 1, i + 1, children.length));
    const counts = progressOf(location.id);
    const equipmentNodes = own.map((block, i) => equipmentNode(block, i + 1, own.length, Math.min(depth + 1, TREE_MAX_LEVEL)));
    return {
      kind: location.kind,
      id: location.id,
      parentId: location.parent_id,
      name: location.name,
      level: Math.min(depth, TREE_MAX_LEVEL),
      meta: cabineMetaText(location),
      // A cabine with no equipment block has no sheet to fill its data on: nothing is asked (as in `preIssue`).
      metaMissing: location.kind === 'cabine' && relatorio !== undefined && counts.sheets_total > 0 ? cabineMissingText(cabineProgress({ relatorio, locations }, location.id)) : null,
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

/*
 * K-2 (full review 2026-09-30): each tree node's `firstBlockId` found by one direct scan
 * with no tree build -- a location's own live equipment blocks by `order_key`, then its live
 * child locations by `order_key`, depth first, from the tree's roots -- memoized on the
 * `blocks` and `locations` arrays. A location the tree does not draw (removed, or in a parent
 * cycle no root reaches) has none.
 */
const firstMemo = new WeakMap<object, WeakMap<object, Map<string, string | null>>>();

function firstBlockIndex(blocks: readonly BlockRow[], rawLocations: readonly LocationRow[]): Map<string, string | null> {
  let byLocations = firstMemo.get(blocks);
  if (byLocations === undefined) {
    byLocations = new WeakMap();
    firstMemo.set(blocks, byLocations);
  }
  const held = byLocations.get(rawLocations);
  if (held !== undefined) return held;
  const locations = liveLocations(rawLocations);
  const liveIds = new Set(locations.map((location) => location.id));
  const blocksAt = liveBlocksByLocation(blocks);
  const childrenOf = childrenByParent(locations);
  const index = new Map<string, string | null>();
  const visit = (location: LocationRow): string | null => {
    // Every child is visited, as the tree builds every node; the first one found stands.
    let first = blocksAt.get(location.id)?.[0]?.id ?? null;
    for (const child of childrenOf.get(location.id) ?? []) {
      const found = visit(child);
      if (first === null) first = found;
    }
    index.set(location.id, first);
    return first;
  };
  for (const root of locations) if (root.parent_id === null || !liveIds.has(root.parent_id)) visit(root);
  byLocations.set(rawLocations, index);
  return index;
}

/**
 * The cabine's first equipment block in depth-first tree order (its own blocks, then its
 * colunas'): where "Abrir primeira ficha (dados da cabine)" goes; null when it holds none.
 */
export function firstInTree(snapshot: Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment'>, cabineId: string): string | null {
  return firstBlockIndex(snapshot.blocks, snapshot.locations).get(cabineId) ?? null;
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

/**
 * Where the palette opened from a cabine ("Adicionar bloco em ⟨cabine⟩", the cabine's
 * "Adicionar bloco") puts the block, EXPERIENCE.md's "current column": the coluna under
 * that cabine holding the last sheet worked on this device, else the cabine's last live
 * coluna, else the cabine itself (one with no colunas, as Cubículo Enel).
 */
export function paletteLocationFor(
  snapshot: Pick<RelatorioSnapshot, 'locations' | 'blocks'>,
  cabineId: string,
  lastSheetId: string | null,
): string {
  const colunas = siblingLocations(snapshot.locations, cabineId);
  const last = lastSheetId === null ? undefined : snapshot.blocks.find((block) => block.id === lastSheetId && block.removed_at === null);
  if (last?.location_id != null && colunas.some((coluna) => coluna.id === last.location_id)) return last.location_id;
  return colunas.at(-1)?.id ?? cabineId;
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
