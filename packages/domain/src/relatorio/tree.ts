import type { RelatorioSummary } from '../contract/sync.ts';
import { orderKeyBetween, sortByOrderKey } from '../ops/order-key.ts';
import { isEquipmentBlockType, type EquipmentBlockType } from '../schemas/block-config.ts';
import { emptySheet, type BlockRow, type EquipmentRow, type JsonValue, type LocationRow, type SuggestionRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { equipmentTypesOf, findDefinition, findSeed, isLibraryType, siteItems } from '../seed/definitions.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { defaultCabineName, defaultColunaName, defaultPainelName } from '../templates/text.ts';
import { plural } from '../text/plural.ts';
import { integrityFindings } from './integrity.ts';
import { funcaoLabel } from './local.ts';
import { liveLocationIds } from './location-live.ts';
import { locationPathText } from './location-path.ts';
import { blocksProgress, fichasCountText, locationProgressIndex, progressCounterState, progressCounterText, type Progress } from './progress.ts';
import { isEquipmentBlock, sheetState, sheetStateLabel, type SheetState } from './sheet-state.ts';
import { siteCounterText, siteLocals, siteRailMetaText, siteResultOf, siteRowText } from './site-checklist.ts';
import { cabineMissingText, cabineProgress } from './cabine.ts';
import { CABINE_META_NONE, cabineMetaText } from './sumario.ts';
import { suggestTag, type TagEquipment, type TagLocation } from './tag.ts';

/*
 * Stories 4.4 and 4.5: the location tree as data, the one structure the Sumário's section
 * 9 and the rail both draw (EXPERIENCE.md › Relatório tree). Story 14.2: Local › Painel ›
 * Coluna › Equipamento. The root row (`kind = cabine`) is the local: it holds equipment
 * directly and zero or more painéis; a painel only groups colunas; a coluna holds equipment.
 * A coluna directly under a local (every tree written before the painel level) is drawn
 * directly under it, as before. Everything is in `order_key` order, a location's own blocks
 * before the locations under it, the colunas directly under a local before its painéis;
 * every equipment row carries its AD-18 state, glyph and word, every location its counter
 * and its meta lines. Depth is not enforced (a block may hang off any node); rows past the
 * third level indent as the third (DESIGN.md: 24 px per level). The surface renders this
 * and decides nothing.
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

/**
 * The deepest indent the tree draws; a location nested further indents as this one. Story
 * 14.2: three, the level of a sheet inside a coluna of a painel (local 0, painel 1, coluna 2).
 */
export const TREE_MAX_LEVEL = 3;

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
  /**
   * Review fixes 2026-10-06 (F-07): what `railMetaText` holds after the TAG (`'' `, or
   * `' · Solicitação do cliente'`; the reason alone when there is no TAG), so the rail can keep
   * the TAG on one line: `railMetaText === tag + railMetaRest`.
   */
  railMetaRest: string;
  /** 1-based position among the live blocks of the same location, and how many there are. */
  position: number;
  siblings: number;
  /** Another live equipment row of the project carries the same TAG (an `integrity` finding). */
  duplicate: boolean;
  level: number;
}

export interface TreeLocationNode {
  /** `cabine` is the local (the root row); a `painel` groups colunas; a `coluna` holds equipment. */
  kind: 'cabine' | 'painel' | 'coluna';
  id: string;
  parentId: string | null;
  name: string;
  /**
   * The name the row's own controls read ("Expandir …", "Mais opções de …", "Reordenar …",
   * "Posição de …"), `locationControlName`. A painel is named with its local, as
   * `40-relatorio-overview.html` words it ("Painel de entrada de Cubículo Enel"): every
   * local's first painel is "Painel 1" by default, so the painel alone would name the
   * controls of two locals alike. A coluna is named with what it sits in, for the same
   * reason ("Coluna 1 de Painel 1 de Cubículo Enel"; directly under a local, "Coluna 5 de
   * 1° Subsolo"). A local reads its own name.
   */
  controlName: string;
  level: number;
  /** The local's Função as stored (a reserved key or a typed name); null when it holds none, and on a painel or a coluna. */
  funcao: string | null;
  /**
   * The Sumário row's meta line (`40-relatorio-overview.html`). A local: its read-only data
   * line led by its Função ("Transformação · Alvenaria · 13,8 kV"), "sem painéis" closing it
   * while nothing hangs under it, "—" when it holds none. A painel: "Painel · 17 colunas",
   * "Painel · sem colunas". "" on a coluna.
   */
  meta: string;
  /** Story 12.3: "falta a umidade" / "faltam 3 campos" after the meta while a cabine field is empty; null otherwise (and on a painel or a coluna). */
  metaMissing: string | null;
  /**
   * The rail row's meta line (`shell-foot.html` `rail-tree`): "Local · Entrada · 1 painel ·
   * 3 de 9 fichas" for a local, "Painel · 1 coluna · 3 de 9" for a painel, and a coluna's
   * counter, led by "Coluna" when its name does not say it ("Coluna · 3 de 9", "2 de 4").
   */
  railMeta: string;
  /** "3 de 9": the sheets concluded on this node and every node under it. */
  counterText: string;
  counterState: 'complete' | 'pending';
  /** "0 de 2": the sheets concluded among the local's own blocks ("Equipamentos no local"); null when it holds none, and on a painel or a coluna. */
  ownCounterText: string | null;
  /**
   * 1-based position among its reorder siblings, and how many there are: the roots among the
   * roots, any other location among the live locations of the same parent and the same kind.
   */
  position: number;
  siblings: number;
  /** The cabine's "Agrupar por tipo" flag; null on a painel or a coluna. */
  agruparPorTipo: boolean | null;
  /** The first equipment block under this node in tree order, or null when it holds none. */
  firstBlockId: string | null;
  /**
   * Story 14.3: the local's site checklist ("Verificações do local"); null on a painel, a
   * coluna, a location drawn as a root that is not a cabine, and on every node of a relatório
   * whose seed version ships no site list (or when the caller gave no relatório row).
   */
  site: TreeSiteNode | null;
  /** The node's own blocks, in `order_key` order. */
  equipment: TreeEquipmentNode[];
  /** The locations under it in drawing order: the colunas directly under it, then its painéis, each in `order_key` order. */
  locations: TreeLocationNode[];
}

/** Story 14.3: a local's site checklist as its Sumário row and its rail row draw it (`40-relatorio-overview.html` `.s9-verif`, `shell-foot.html`). */
export interface TreeSiteNode {
  answered: number;
  total: number;
  /** "Verificações do local · 12 de 19": the Sumário row's button. */
  text: string;
  /** "12 de 19": the rail row's `.tree-state` text. */
  railCounter: string;
  /** "19 itens · uma vez por local": the rail row's `.tree-meta`. */
  railMeta: string;
  /** Nothing answered, some answered, every item answered. Derived, never stored. */
  state: 'vazia' | 'pending' | 'concluida';
  /** The rail's `.tree-state[data-state]` value of `state`. */
  railStateAttr: TreeStateAttr;
  /** The glyph before the rail counter (`aria-hidden` where drawn): the sheet states' own. */
  glyph: string;
}

const SITE_STATE: Readonly<Record<TreeSiteNode['state'], SheetState>> = { vazia: 'vazia', pending: 'em_preenchimento', concluida: 'concluida' };

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

/**
 * The live locations of a relatório in `order_key` order: not removed and under no removed
 * location (`liveLocationIds`, the snapshot's own rule), so raw rows and a snapshot's read alike.
 */
function liveLocations(locations: readonly LocationRow[]): LocationRow[] {
  const live = liveLocationIds(locations);
  return sortByOrderKey(locations.filter((location) => live.has(location.id)));
}

/**
 * The live locations under `parentId` (null: the roots), in `order_key` order. With `kind`,
 * only those of that kind: a location's reorder siblings (Story 14.2: a painel moves among
 * the painéis of its local, a coluna among the colunas of its painel or local).
 */
export function siblingLocations(locations: readonly LocationRow[], parentId: string | null, kind?: LocationRow['kind']): LocationRow[] {
  return liveLocations(locations).filter((location) => location.parent_id === parentId && (kind === undefined || location.kind === kind));
}

/**
 * A location's children in drawing order (Story 14.2): the colunas directly under it first,
 * then its painéis, each group keeping its `order_key` order. With no painel among them the
 * list is returned as it is, so a tree written before the painel level reads exactly as before.
 */
function drawingOrder(children: readonly LocationRow[]): readonly LocationRow[] {
  if (!children.some((child) => child.kind === 'painel')) return children;
  return [...children.filter((child) => child.kind !== 'painel'), ...children.filter((child) => child.kind === 'painel')];
}

const SEM_PAINEIS = 'sem painéis';
const SEM_COLUNAS = 'sem colunas';

/** "Coluna 5", "coluna-5": a name that already says what the row is. */
function saysColuna(name: string): boolean {
  const lead = name.trim().split(/[\s-]+/)[0] ?? '';
  return lead.localeCompare('Coluna', 'pt-BR', { sensitivity: 'base' }) === 0;
}

/** The three meta texts of one location row, by kind (the mocks' wording, see `TreeLocationNode`). */
function locationMetaTexts(location: LocationRow, children: readonly LocationRow[], counts: Progress): { meta: string; railMeta: string } {
  const counter = progressCounterText(counts);
  const colunas = children.filter((child) => child.kind === 'coluna').length;
  if (location.kind === 'coluna') return { meta: '', railMeta: saysColuna(location.name) ? counter : `Coluna${SEP}${counter}` };
  if (location.kind === 'painel') {
    const part = colunas > 0 ? plural(colunas, 'coluna', 'colunas') : SEM_COLUNAS;
    // A painel with no coluna holds no sheet: its rail line says why instead of "0 de 0".
    return { meta: `Painel${SEP}${part}`, railMeta: colunas > 0 ? `Painel${SEP}${part}${SEP}${counter}` : `Painel${SEP}${part}` };
  }
  const paineis = children.filter((child) => child.kind === 'painel').length;
  const data = cabineMetaText(location);
  // "sem painéis" closes the data line of a local nothing hangs under (the masonry room of the mock).
  const meta = children.length > 0 ? data : data === CABINE_META_NONE ? SEM_PAINEIS : `${data}${SEP}${SEM_PAINEIS}`;
  // authored: a local with colunas directly under it (a tree from before the painel level) counts them; the mock draws none.
  const under = paineis > 0 ? plural(paineis, 'painel', 'painéis') : colunas > 0 ? plural(colunas, 'coluna', 'colunas') : SEM_PAINEIS;
  const railMeta = ['Local', funcaoLabel(location.funcao), under, fichasCountText(counts)].filter((part): part is string => part !== null).join(SEP);
  return { meta, railMeta };
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

/** "Painel de entrada de Cubículo Enel": a painel named with its local (`40-relatorio-overview.html`, the painel row's chevron and Overflow). */
export function painelOfLocalText(painelName: string, localName: string): string {
  return `${painelName} de ${localName}`;
}

/**
 * "Coluna 1 de Painel 1 de Cubículo Enel", "Coluna 5 de 1° Subsolo": a coluna named with the
 * control name of what it sits in (its painel's, which carries the local, or its local's).
 * authored: the tree's join of the mock's two namings (`42-template-composer.html` names a
 * coluna with its painel in one place and with its local in another); default names repeat
 * across painéis and locals, so either alone would name two colunas alike.
 */
export function colunaOfParentText(colunaName: string, parentControlName: string): string {
  return `${colunaName} de ${parentControlName}`;
}

/**
 * A location's control name given the row above it and that row's control name (null at a
 * root): the one composition `TreeLocationNode.controlName` and `locationControlName` share.
 * A painel under a local and a coluna under a painel or a local are named with the parent;
 * any other row (a local, or a shape no client writes) reads its own name.
 */
function controlNameUnder(location: Pick<LocationRow, 'kind' | 'name'>, parent: { kind: LocationRow['kind']; controlName: string } | null): string {
  if (parent === null) return location.name;
  if (location.kind === 'painel' && parent.kind === 'cabine') return painelOfLocalText(location.name, parent.controlName);
  if (location.kind === 'coluna' && (parent.kind === 'painel' || parent.kind === 'cabine')) return colunaOfParentText(location.name, parent.controlName);
  return location.name;
}

/**
 * The name a location's controls read, from its rows alone (`TreeLocationNode.controlName`
 * for a drawn node; this one also names a location the tree no longer draws: the confirm,
 * the announcement and the restore entry of a removal). `locations` may hold removed rows:
 * a removed coluna still names its painel and its local. A parent the list does not hold
 * ends the name there; an id it does not hold yields "".
 */
export function locationControlName(locations: readonly Pick<LocationRow, 'id' | 'parent_id' | 'kind' | 'name'>[], locationId: string): string {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const seen = new Set<string>();
  const nameOf = (id: string): { kind: LocationRow['kind']; controlName: string } | null => {
    const location = byId.get(id);
    if (location === undefined || seen.has(id)) return null;
    seen.add(id);
    return { kind: location.kind, controlName: controlNameUnder(location, location.parent_id === null ? null : nameOf(location.parent_id)) };
  };
  return nameOf(locationId)?.controlName ?? '';
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

  // Story 14.3: the locals holding a site checklist (none without the relatório row, or on a seed with no site list).
  const siteList = relatorio === undefined ? [] : siteItems(relatorio.seed_version);
  const siteIds = new Set(relatorio === undefined ? [] : siteLocals({ relatorio, locations }).map((location) => location.id));
  const siteNode = (location: LocationRow): TreeSiteNode | null => {
    if (location.kind !== 'cabine' || !siteIds.has(location.id)) return null;
    const counts = { answered: siteList.filter((item) => siteResultOf(location, item.key) !== null).length, total: siteList.length };
    const state = counts.answered === 0 ? 'vazia' : counts.answered >= counts.total ? 'concluida' : 'pending';
    return {
      ...counts,
      text: siteRowText(counts),
      railCounter: siteCounterText(counts),
      railMeta: siteRailMetaText(counts.total),
      state,
      railStateAttr: STATE_ATTR[SITE_STATE[state]],
      glyph: SHEET_STATE_GLYPH[SITE_STATE[state]],
    };
  };

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
      railMetaRest: reason === null || reason === '' ? '' : tag === '' ? reason : `${SEP}${reason}`,
      position,
      siblings,
      duplicate: block.equipment_id !== null && duplicated.has(block.equipment_id),
      level,
    };
  };

  const build = (location: LocationRow, depth: number, position: number, siblings: number, parent: { kind: LocationRow['kind']; controlName: string } | null = null): TreeLocationNode => {
    const own = blocksAt.get(location.id) ?? [];
    const controlName = controlNameUnder(location, parent);
    const children = drawingOrder(childrenOf.get(location.id) ?? []);
    // A child's reorder siblings are the children of its own kind (a painel among the painéis).
    const sameKind = new Map<LocationRow['kind'], LocationRow[]>();
    for (const child of children) sameKind.set(child.kind, [...(sameKind.get(child.kind) ?? []), child]);
    const childNodes = children.map((child) => {
      const peers = sameKind.get(child.kind)!;
      return build(child, depth + 1, peers.indexOf(child) + 1, peers.length, { kind: location.kind, controlName });
    });
    const counts = progressOf(location.id);
    const equipmentNodes = own.map((block, i) => equipmentNode(block, i + 1, own.length, Math.min(depth + 1, TREE_MAX_LEVEL)));
    const texts = locationMetaTexts(location, children, counts);
    return {
      kind: location.kind,
      id: location.id,
      parentId: location.parent_id,
      name: location.name,
      controlName,
      level: Math.min(depth, TREE_MAX_LEVEL),
      funcao: location.kind === 'cabine' ? (location.funcao ?? null) : null,
      meta: texts.meta,
      // A cabine with no equipment block has no sheet to fill its data on: nothing is asked (as in `preIssue`).
      metaMissing: location.kind === 'cabine' && relatorio !== undefined && counts.sheets_total > 0 ? cabineMissingText(cabineProgress({ relatorio, locations }, location.id)) : null,
      railMeta: texts.railMeta,
      counterText: progressCounterText(counts),
      counterState: progressCounterState(counts),
      ownCounterText: location.kind === 'cabine' && own.length > 0 ? progressCounterText(blocksProgress(own, pending)) : null,
      position,
      siblings,
      agruparPorTipo: location.kind === 'cabine' ? location.agrupar_por_tipo : null,
      firstBlockId: equipmentNodes[0]?.blockId ?? childNodes.find((child) => child.firstBlockId !== null)?.firstBlockId ?? null,
      site: siteNode(location),
      equipment: equipmentNodes,
      locations: childNodes,
    };
  };

  // A location whose parent is absent from the input (never on this device: an op applied
  // before its parent's row arrived) is drawn as a root, so its blocks never vanish from the
  // tree. A location under a removed parent is not live (`liveLocationIds`) and is not drawn
  // at all: it left the relatório with its parent.
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
 * `blocks` and `locations` arrays. A location the tree does not draw (removed, under a
 * removed location, or in a parent cycle no root reaches) has none.
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
    for (const child of drawingOrder(childrenOf.get(location.id) ?? [])) {
      const found = visit(child);
      if (first === null) first = found;
    }
    index.set(location.id, first);
    return first;
  };
  // The roots are the tree's: a live location with no parent, or with one absent from the input.
  for (const root of locations) if (root.parent_id === null || !liveIds.has(root.parent_id)) visit(root);
  byLocations.set(rawLocations, index);
  return index;
}

/**
 * The local's first equipment block in depth-first tree order (its own blocks, then the
 * colunas directly under it, then its painéis' colunas): where "Abrir primeira ficha (dados
 * do local)" goes; null when it holds none.
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
  // A painel takes no block, so nothing is suggested for one (`TagLocation` never names it).
  if (location === undefined || location.kind === 'painel' || !isEquipmentBlockType(block.blockType)) return block.tag;
  return suggestTag(block.blockType, { kind: location.kind, name: location.name }, equipment);
}

/**
 * Where the palette opened on a location puts the block, EXPERIENCE.md's "current column"
 * (Story 14.2: only `coluna` children are read). From a local ("Adicionar equipamento") or a
 * painel ("Adicionar bloco em ⟨painel⟩"): the coluna directly under it holding the last sheet
 * worked on this device, else its last live coluna. With no coluna under it, a local takes
 * the block itself (a masonry room, or Cubículo Enel) and a painel gives null: it only
 * groups colunas, so there is nowhere to put a block until it has one. Null too for a
 * location that is not live here.
 */
export function paletteLocationFor(
  snapshot: Pick<RelatorioSnapshot, 'locations' | 'blocks'>,
  locationId: string,
  lastSheetId: string | null,
): string | null {
  const location = liveLocationIds(snapshot.locations).has(locationId) ? snapshot.locations.find((row) => row.id === locationId) : undefined;
  if (location === undefined) return null;
  const colunas = siblingLocations(snapshot.locations, locationId, 'coluna');
  const last = lastSheetId === null ? undefined : snapshot.blocks.find((block) => block.id === lastSheetId && block.removed_at === null);
  if (last?.location_id != null && colunas.some((coluna) => coluna.id === last.location_id)) return last.location_id;
  return colunas.at(-1)?.id ?? (location.kind === 'painel' ? null : locationId);
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

/** One live location a block can sit on, offered by the office palette's "Local": its id and its path. */
export interface LocationChoice {
  id: string;
  kind: 'cabine' | 'coluna';
  name: string;
  /** "1° Subsolo › Coluna 9", "Cabine primária › Painel de média tensão › Coluna 9". */
  label: string;
}

/**
 * Every live location a block can sit on, in tree order, labelled by its path (the office
 * palette's "Local" options). Story 14.2: a painel is left out (it takes no block); its
 * colunas are listed, and their path names it.
 */
export function locationChoices(locations: readonly LocationRow[]): LocationChoice[] {
  const live = liveLocations(locations);
  const liveIds = new Set(live.map((location) => location.id));
  const out: LocationChoice[] = [];
  const walk = (location: LocationRow) => {
    if (location.kind !== 'painel') out.push({ id: location.id, kind: location.kind, name: location.name, label: locationPathText(live, location.id) });
    drawingOrder(live.filter((row) => row.parent_id === location.id)).forEach(walk);
  };
  live.filter((location) => location.parent_id === null || !liveIds.has(location.parent_id)).forEach(walk);
  return out;
}

/**
 * Story 14.5: the heading of the library types, after the eight, in both palettes
 * (`42-template-composer.html`, `40-relatorio-overview.html`) and the words of their print
 * group in section 9 (`groupForPrint`, kind `outros`).
 */
export const LIBRARY_GROUP_LABEL = 'Outros equipamentos';

/**
 * The equipment types a palette offers under a seed version, in the groups it draws them in:
 * the eight FO.SERV-03 types first, under no heading, then the library types the version
 * ships under `LIBRARY_GROUP_LABEL` (none before v5, so that group is left out). Both
 * palettes read this, so neither offers a type its seed version has no definition of.
 */
export interface PaletteTypeGroup {
  key: 'seeded' | 'library';
  /** The group's heading, or null for the eight. */
  label: string | null;
  types: EquipmentBlockType[];
}

export function paletteTypeGroups(seedVersion: string): PaletteTypeGroup[] {
  const types = equipmentTypesOf(seedVersion);
  const library = types.filter((type) => isLibraryType(seedVersion, type));
  const groups: PaletteTypeGroup[] = [{ key: 'seeded', label: null, types: types.filter((type) => !library.includes(type)) }];
  if (library.length > 0) groups.push({ key: 'library', label: LIBRARY_GROUP_LABEL, types: library });
  return groups;
}

/** One equipment type of the field palette: its seed name and the TAG it would be born with here. */
export interface PaletteItem {
  type: EquipmentBlockType;
  label: string;
  tag: string;
  /** Story 14.5: a library type, drawn after the eight under `LIBRARY_GROUP_LABEL`. */
  library: boolean;
  /** Story 14.5: what a library type holds, "17 itens · até 6 ensaios"; null on the eight. */
  summary: string | null;
}

/**
 * The field palette's rows for a location: every type the seed version ships (the eight, then
 * its library types), each with its suggested TAG (`suggestTag`, the instantiation's scheme).
 */
export function paletteItems(seedVersion: string, location: TagLocation, equipment: readonly TagEquipment[]): PaletteItem[] {
  return paletteTypeGroups(seedVersion).flatMap((group) =>
    group.types.map((type) => ({
      type,
      label: blockTypeLabel(seedVersion, type),
      tag: suggestTag(type, { kind: location.kind, name: location.name }, equipment),
      library: group.key === 'library',
      summary: group.key === 'library' ? libraryTypeSummaryText(seedVersion, type) : null,
    })),
  );
}

/**
 * Story 14.5: the meta line of a library type in a palette, "17 itens · até 6 ensaios"
 * (`40-relatorio-overview.html`): its checklist's item count and how many measurement tests
 * it can hold ("até": some are switched off on the sheet). Null for a type that is not one.
 */
export function libraryTypeSummaryText(seedVersion: string, blockType: string): string | null {
  const definition = findDefinition(seedVersion, blockType);
  if (definition === null || definition.library !== true) return null;
  const tests = definition.tests.length + (definition.measurement_tests?.length ?? 0);
  const parts = [
    definition.checklist === null ? null : plural(definition.checklist.length, 'item', 'itens'),
    tests === 0 ? null : `até ${plural(tests, 'ensaio', 'ensaios')}`,
  ];
  return parts.filter((part): part is string => part !== null).join(SEP);
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

/** What `newLocation` reads: the row's kind, its parent, and what the Função dialog chose for a local. */
export interface NewLocationInput {
  id: string;
  relatorioId: string;
  kind: LocationRow['kind'];
  /** Null for a local (the root); the local's id for a painel; a painel's id, or a local's (the shape before the painel level), for a coluna. */
  parentId: string | null;
  /** The name to store; the default of the kind otherwise ("Cabine n", "Painel n", "Coluna n" after its live siblings of that kind, the first n no sibling of the kind already holds). */
  name?: string;
  /** A local's Função (a reserved key or a typed name); none when absent. Read for a local only. */
  funcao?: string | null;
}

/**
 * A new location as "Adicionar local" (at the root), "Adicionar painel" (under a local) or
 * "Adicionar coluna" (under a painel, or under a local for the shape before the painel
 * level) creates it: last among the live locations of its parent, named as given or
 * "Cabine ⟨n+1⟩" / "Painel ⟨n+1⟩" / "Coluna ⟨n+1⟩" after its live siblings of that kind (a
 * stored default name keeps "Cabine": only the on-screen noun of the level is "local"). A
 * local is born with no SE data, no environment, "Agrupar por tipo" off and, when one was
 * chosen, its Função.
 *
 * `locations` are the relatório's rows, removed ones included (Story 14.2, second pass: a
 * location can be removed and restored). The default number starts after the live siblings
 * of the kind and skips every one whose default name a sibling of that kind already holds,
 * live or removed: with "Coluna 2" of three removed the new one is "Coluna 4", not a second
 * "Coluna 3", and a restored coluna never meets its own name. The `order_key` goes after the
 * greatest one among every sibling, removed ones included, so a restored row keeps a place
 * of its own. With no removed sibling and no default name taken ahead, both are as before.
 */
export function newLocation(locations: readonly LocationRow[], input: NewLocationInput): LocationRow {
  const live = siblingLocations(locations, input.parentId);
  const every = locations.filter((row) => row.parent_id === input.parentId);
  const defaultName = input.kind === 'cabine' ? defaultCabineName : input.kind === 'painel' ? defaultPainelName : defaultColunaName;
  const taken = new Set(every.filter((row) => row.kind === input.kind).map((row) => row.name.trim()));
  let n = live.filter((row) => row.kind === input.kind).length + 1;
  while (taken.has(defaultName(n))) n += 1;
  const last = every.reduce<string | null>((greatest, row) => (greatest === null || row.order_key > greatest ? row.order_key : greatest), null);
  const order_key = orderKeyBetween(last, null);
  const base = { id: input.id, relatorio_id: input.relatorioId, order_key, removed_at: null };
  if (input.kind === 'cabine') {
    if (input.parentId !== null) throw new Error('a local sits at the root: parentId must be null');
    const funcao = input.funcao ?? null;
    return {
      ...base,
      parent_id: null,
      kind: 'cabine',
      name: input.name ?? defaultName(n),
      se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
      env: { altitude_m: null, temperature_c: null, humidity_pct: null },
      agrupar_por_tipo: false,
      // A local with no Função keeps the row shape from before the field existed.
      ...(funcao === null ? {} : { funcao }),
    };
  }
  if (input.parentId === null) throw new Error(`a ${input.kind} sits under another location: parentId must not be null`);
  return { ...base, parent_id: input.parentId, kind: input.kind, name: input.name ?? defaultName(n) };
}
