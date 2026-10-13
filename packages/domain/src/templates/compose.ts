import {
  EQUIPMENT_BLOCK_TYPES,
  isEquipmentBlockType,
  isSectionBlockType,
  MAX_QUANTITY,
  SUB_BLOCK_KEYS,
  type BlockConfig,
  type EquipmentBlockType,
  type SectionBlockType,
  type SkeletonNode,
  type SubBlockKey,
  type TemplateBlock,
} from '../schemas/block-config.ts';
import type { TemplateRow } from '../schemas/entities.ts';
import { defaultBlockConfig, LOCKED_SUB_BLOCKS, zeroTotals } from '../seed/template.ts';

/*
 * Story 3.4: the Template composer's edits, as pure functions over the two fields a
 * template composition is made of. Each takes the current value and returns a new one
 * (never mutating its input), and each result is a value `templateRowSchema` accepts, so
 * the surface writes it as one `template/{id}/blocks` or `template/{id}/skeleton` put.
 *
 * Story 14.2: the skeleton is Local › Painel › Coluna. A `cabine` node is the local: it
 * carries the Função and "Agrupar por tipo", takes equipment directly and holds zero or more
 * painéis; a `painel` only groups colunas and takes no block; a `coluna` takes equipment. A
 * coluna directly under a cabine (every template written before the painel level, the
 * seeded standard one included) stays valid and is never rewritten into a painel.
 *
 * `blocks` and `skeleton` are two last-writer-wins fields, so a block may point at a node
 * another device removed (an orphan), or at a painel. Nothing here or in the view counts
 * one, and every function that returns `blocks` from a whole composition starts from
 * `withoutOrphans`, so the composer's next write drops it (Design Notes, "Concurrency choice").
 *
 * The kernel never mints an id: a new node's ref is the caller's (the web's uuidv7
 * `newId`, TC-2).
 */

/** The two fields a composition is made of. */
export type Composition = Pick<TemplateRow, 'blocks' | 'skeleton'>;

/** A composition plus the seed version its new blocks are configured under. */
export type SeededComposition = Pick<TemplateRow, 'blocks' | 'skeleton' | 'seed_version'>;

type CabineNode = Extract<SkeletonNode, { kind: 'cabine' }>;
type PainelNode = Extract<SkeletonNode, { kind: 'painel' }>;
type ColunaNode = Extract<SkeletonNode, { kind: 'coluna' }>;

/** A requested quantity brought into 0..MAX_QUANTITY (a fraction is floored). */
export function clampQuantity(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_QUANTITY, Math.max(0, Math.floor(n)));
}

/**
 * A quantity the user typed: digits only, clamped to MAX_QUANTITY. `null` for anything
 * else ("abc", "-3", "2,5", or nothing typed), which the stepper answers by restoring the
 * value it had, with no op.
 */
export function parseQuantityInput(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return clampQuantity(Number(trimmed));
}

/**
 * A position typed in a Position box (EXPERIENCE.md › Block card): 1-based, digits only,
 * out-of-range clamped to the ends. Returns the 0-based index to move to, or `null` for
 * anything that is not a number (the box then shows its position again, with no op).
 */
export function parsePositionInput(text: string, siblings: number): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed) || siblings < 1) return null;
  return Math.min(siblings, Math.max(1, Number(trimmed))) - 1;
}

// --- skeleton ----------------------------------------------------------------

function cabinesOf(skeleton: readonly SkeletonNode[]): CabineNode[] {
  return skeleton.filter((node): node is CabineNode => node.kind === 'cabine');
}

/** The painéis of one cabine, in their current order. */
function paineisOf(skeleton: readonly SkeletonNode[], cabineRef: string): PainelNode[] {
  return skeleton.filter((node): node is PainelNode => node.kind === 'painel' && node.parent_ref === cabineRef);
}

/** The colunas directly under one parent (a painel, or a cabine for the shape before the painel level), in their current order. */
function colunasOf(skeleton: readonly SkeletonNode[], parentRef: string): ColunaNode[] {
  return skeleton.filter((node): node is ColunaNode => node.kind === 'coluna' && node.parent_ref === parentRef);
}

/** The order of every sibling list of a skeleton: what an edit replaces one list of. */
interface SkeletonOrder {
  cabines: readonly CabineNode[];
  paineisOf: (cabineRef: string) => readonly PainelNode[];
  colunasOf: (parentRef: string) => readonly ColunaNode[];
}

function orderOf(skeleton: readonly SkeletonNode[]): SkeletonOrder {
  return { cabines: cabinesOf(skeleton), paineisOf: (ref) => paineisOf(skeleton, ref), colunasOf: (ref) => colunasOf(skeleton, ref) };
}

/**
 * The canonical order (Story 14.2): each cabine, the colunas directly under it, then each
 * of its painéis followed by that painel's colunas; every sibling list in its current
 * order. A skeleton with no painel comes out as before: each cabine followed by its colunas.
 */
function canonical(order: SkeletonOrder): SkeletonNode[] {
  const out: SkeletonNode[] = [];
  for (const cabine of order.cabines) {
    out.push(cabine, ...order.colunasOf(cabine.ref));
    for (const painel of order.paineisOf(cabine.ref)) out.push(painel, ...order.colunasOf(painel.ref));
  }
  return out;
}

/** The skeleton in canonical order: what `instantiateTemplate` and every reader walk. */
export function canonicalSkeleton(skeleton: readonly SkeletonNode[]): SkeletonNode[] {
  return canonical(orderOf(skeleton));
}

/**
 * The node or section an edit names is no longer in the composition: another device
 * removed it and the pull brought that here between the tap and the write. The composer
 * writes nothing then; any other error from an edit function is a bug and surfaces.
 */
export class TemplateTargetGoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateTargetGoneError';
  }
}

function nodeOf(skeleton: readonly SkeletonNode[], ref: string): SkeletonNode {
  const node = skeleton.find((n) => n.ref === ref);
  if (node === undefined) throw new TemplateTargetGoneError(`template skeleton has no node "${ref}"`);
  return node;
}

function assertFreshRef(skeleton: readonly SkeletonNode[], ref: string): void {
  if (skeleton.some((n) => n.ref === ref)) throw new Error(`template skeleton already has a node "${ref}"`);
}

/**
 * Appends a cabine (the local; Agrupar por tipo off) after the last one, with the Função
 * the dialog chose (a reserved key of `FUNCAO_KEYS` or a typed name), none when absent.
 */
export function addCabine(skeleton: readonly SkeletonNode[], ref: string, name: string, funcao?: string | null): SkeletonNode[] {
  assertFreshRef(skeleton, ref);
  const cabine: CabineNode = {
    ref,
    kind: 'cabine',
    parent_ref: null,
    name,
    agrupar_por_tipo: false,
    ...(funcao === undefined || funcao === null ? {} : { funcao }),
  };
  const order = orderOf(skeleton);
  return canonical({ ...order, cabines: [...order.cabines, cabine] });
}

/** Appends a painel after the last painel of a cabine. */
export function addPainel(skeleton: readonly SkeletonNode[], cabineRef: string, ref: string, name: string): SkeletonNode[] {
  assertFreshRef(skeleton, ref);
  if (nodeOf(skeleton, cabineRef).kind !== 'cabine') throw new Error(`"${cabineRef}" is not a cabine`);
  const painel: PainelNode = { ref, kind: 'painel', parent_ref: cabineRef, name };
  const order = orderOf(skeleton);
  return canonical({ ...order, paineisOf: (r) => (r === cabineRef ? [...order.paineisOf(r), painel] : order.paineisOf(r)) });
}

/**
 * Appends a coluna after the last coluna of its parent: a painel, or, for the shape every
 * template had before the painel level, a cabine.
 */
export function addColuna(skeleton: readonly SkeletonNode[], parentRef: string, ref: string, name: string): SkeletonNode[] {
  assertFreshRef(skeleton, ref);
  if (nodeOf(skeleton, parentRef).kind === 'coluna') throw new Error(`"${parentRef}" is a coluna: a coluna sits under a painel or a cabine`);
  const coluna: ColunaNode = { ref, kind: 'coluna', parent_ref: parentRef, name };
  const order = orderOf(skeleton);
  return canonical({ ...order, colunasOf: (r) => (r === parentRef ? [...order.colunasOf(r), coluna] : order.colunasOf(r)) });
}

export function renameNode(skeleton: readonly SkeletonNode[], ref: string, name: string): SkeletonNode[] {
  nodeOf(skeleton, ref);
  return skeleton.map((node) => (node.ref === ref ? { ...node, name } : node));
}

/** The flag `instantiateTemplate` (Epic 4) copies onto the relatório's cabine. */
export function setAgruparPorTipo(skeleton: readonly SkeletonNode[], cabineRef: string, value: boolean): SkeletonNode[] {
  if (nodeOf(skeleton, cabineRef).kind !== 'cabine') throw new Error(`"${cabineRef}" is not a cabine`);
  return skeleton.map((node) => (node.ref === cabineRef && node.kind === 'cabine' ? { ...node, agrupar_por_tipo: value } : node));
}

/**
 * Sets a cabine's Função (Story 14.2): a reserved key or a typed name; null takes it away,
 * leaving the node as one that never held it. `instantiateTemplate` copies it onto the
 * relatório's cabine row.
 */
export function setFuncao(skeleton: readonly SkeletonNode[], cabineRef: string, funcao: string | null): SkeletonNode[] {
  if (nodeOf(skeleton, cabineRef).kind !== 'cabine') throw new Error(`"${cabineRef}" is not a cabine`);
  return skeleton.map((node) => {
    if (node.ref !== cabineRef || node.kind !== 'cabine') return node;
    if (funcao !== null) return { ...node, funcao };
    const rest: CabineNode = { ...node };
    delete rest.funcao;
    return rest;
  });
}

function moveWithin<T>(items: readonly T[], from: number, toIndex: number): T[] {
  const out = [...items];
  const to = Math.min(out.length - 1, Math.max(0, Math.floor(toIndex)));
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved!);
  return out;
}

/**
 * Moves a node to `toIndex` (0-based, clamped to the ends) among its siblings of the same
 * kind and parent: a cabine among the cabines, a painel among the painéis of its cabine, a
 * coluna among the colunas of its own painel (or cabine).
 */
export function moveNode(skeleton: readonly SkeletonNode[], ref: string, toIndex: number): SkeletonNode[] {
  const node = nodeOf(skeleton, ref);
  const order = orderOf(skeleton);
  if (node.kind === 'cabine') {
    return canonical({ ...order, cabines: moveWithin(order.cabines, order.cabines.indexOf(node), toIndex) });
  }
  if (node.kind === 'painel') {
    const siblings = order.paineisOf(node.parent_ref);
    const moved = moveWithin(siblings, siblings.indexOf(node), toIndex);
    return canonical({ ...order, paineisOf: (r) => (r === node.parent_ref ? moved : order.paineisOf(r)) });
  }
  const siblings = order.colunasOf(node.parent_ref);
  const moved = moveWithin(siblings, siblings.indexOf(node), toIndex);
  return canonical({ ...order, colunasOf: (r) => (r === node.parent_ref ? moved : order.colunasOf(r)) });
}

/**
 * The composition's blocks with every orphan dropped: a block on a node the skeleton lacks
 * and, Story 14.2, a block on a painel (a painel takes no block; one two devices folded
 * into, or one written by hand, is ignored by every reader like any other orphan).
 */
export function withoutOrphans(template: Composition): TemplateBlock[] {
  const nodes = new Set(template.skeleton.filter((node) => node.kind !== 'painel').map((node) => node.ref));
  return template.blocks.filter(
    (block) => isSectionBlockType(block.block_type) || (block.skeleton_location_ref !== null && nodes.has(block.skeleton_location_ref)),
  );
}

/** A node's ref and the ref of every node under it: a cabine's colunas, painéis and their colunas; a painel's colunas. */
function subtreeRefs(skeleton: readonly SkeletonNode[], ref: string): Set<string> {
  const gone = new Set([ref]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of skeleton) {
      if (node.parent_ref !== null && gone.has(node.parent_ref) && !gone.has(node.ref)) {
        gone.add(node.ref);
        grew = true;
      }
    }
  }
  return gone;
}

/**
 * Removes a node with everything under it (a cabine's colunas, its painéis and their
 * colunas; a painel's colunas), together with every block placed on any of them. Both
 * fields change, so the caller writes both in one batch (one undo).
 */
export function removeNode(template: Composition, ref: string): Composition {
  nodeOf(template.skeleton, ref);
  const gone = subtreeRefs(template.skeleton, ref);
  const skeleton = template.skeleton.filter((n) => !gone.has(n.ref));
  const blocks = withoutOrphans(template).filter((b) => b.skeleton_location_ref === null || !gone.has(b.skeleton_location_ref));
  return { blocks, skeleton };
}

// --- quantities per node -----------------------------------------------------

/**
 * Sets the quantity of one equipment type at one node (clamped to 0..MAX_QUANTITY) and
 * returns the new `blocks`. A node may hold several entries of one type (the standard
 * template's para-raio entrada and saída at the Cubículo Enel): a rise goes to the last
 * entry of that type there, a fall takes from the last entry backwards, removing each
 * entry that reaches zero. A type with no entry at the node gets a new one, placed after
 * the node's other blocks, with the type's config from its other placements
 * (`typeConfigFor`) or, for a type the template does not hold yet, `defaultBlockConfig`.
 * The node is a cabine (the local itself) or a coluna; a painel throws.
 */
export function setQuantity(template: SeededComposition, ref: string, type: EquipmentBlockType, n: number): TemplateBlock[] {
  // Story 14.2: a painel only groups colunas. Placing a block on one is a caller's bug, not a
  // target another device removed, so it surfaces instead of being swallowed.
  if (nodeOf(template.skeleton, ref).kind === 'painel') throw new Error(`"${ref}" is a painel: a painel takes no block`);
  const target = clampQuantity(n);
  const blocks = withoutOrphans(template);
  const entries = blocks.flatMap((block, i) => (block.block_type === type && block.skeleton_location_ref === ref ? [i] : []));
  const current = entries.reduce((sum, i) => sum + blocks[i]!.quantity, 0);
  if (target === current) return blocks;

  if (target > current) {
    const last = entries.at(-1);
    if (last !== undefined) {
      blocks[last] = { ...blocks[last]!, quantity: blocks[last]!.quantity + (target - current) };
      return blocks;
    }
    // A type already placed elsewhere keeps its one per-type config (Story 3.5); a type new to
    // the whole template starts from the seed's default.
    const config = typeConfigFor(blocks, type) ?? typeConfigOf(defaultBlockConfig(template.seed_version, type));
    const entry: TemplateBlock = {
      block_type: type,
      ...config,
      quantity: target,
      skeleton_location_ref: ref,
      section_text: null,
    };
    const lastAtNode = blocks.findLastIndex((block) => block.skeleton_location_ref === ref);
    blocks.splice(lastAtNode === -1 ? blocks.length : lastAtNode + 1, 0, entry);
    return blocks;
  }

  let excess = current - target;
  for (const i of [...entries].reverse()) {
    if (excess === 0) break;
    const quantity = blocks[i]!.quantity;
    if (quantity > excess) {
      blocks[i] = { ...blocks[i]!, quantity: quantity - excess };
      excess = 0;
    } else {
      blocks.splice(i, 1);
      excess -= quantity;
    }
  }
  return blocks;
}

// --- sub-block defaults per equipment type (Story 3.5) -----------------------

/**
 * The part of a `BlockConfig` the Template composer sets per equipment type. One value is
 * shared by every placement of that type in a template, the model the seed's own
 * standard template follows (one subtype per type, `SUBTYPE_OF` in `seed/template.ts`).
 */
export type TypeConfig = Pick<BlockConfig, 'subtype' | 'sub_blocks' | 'na_defaults'>;

function typeConfigOf(config: TypeConfig): TypeConfig {
  const sub_blocks: BlockConfig['sub_blocks'] = {};
  for (const [key, value] of Object.entries(config.sub_blocks) as [SubBlockKey, NonNullable<BlockConfig['sub_blocks'][SubBlockKey]>][]) {
    sub_blocks[key] = structuredClone(value);
  }
  return {
    ...(config.subtype === undefined ? {} : { subtype: config.subtype }),
    sub_blocks,
    na_defaults: [...config.na_defaults],
  };
}

/**
 * The sub-blocks a sheet of this config carries, in `SUB_BLOCK_KEYS` order: every key
 * whose entry is not switched off, plus the locked `checklist` and `conclusion` of an
 * equipment block whatever their entry says. A section block carries none. The
 * renderer, `progress` and `groupForPrint` (Epic 4+) read a sheet's parts through this,
 * so a switched-off sub-block is omitted, never printed empty (FR-11).
 */
export function enabledSubBlocks(config: Pick<BlockConfig, 'block_type' | 'sub_blocks'>): SubBlockKey[] {
  if (!isEquipmentBlockType(config.block_type)) return [];
  return SUB_BLOCK_KEYS.filter((key) => {
    if (LOCKED_SUB_BLOCKS.includes(key)) return true;
    const entry = config.sub_blocks[key];
    return entry !== undefined && entry.enabled !== false;
  });
}

/** The config of one equipment type in a composition (its first entry's), or null when the type is not placed. */
export function typeConfigFor(blocks: readonly TemplateBlock[], type: EquipmentBlockType): TypeConfig | null {
  const entry = blocks.find((block) => block.block_type === type);
  return entry === undefined ? null : typeConfigOf(entry);
}

/**
 * Sets the subtype, sub-blocks and NA defaults of every placement of one equipment type
 * at once (one `blocks` put, one undo). Quantities, refs and roles stay as they are.
 */
export function setTypeDefaults(blocks: readonly TemplateBlock[], type: EquipmentBlockType, config: TypeConfig): TemplateBlock[] {
  return blocks.map((block) => {
    if (block.block_type !== type) return block;
    const next: TemplateBlock = { ...block, ...typeConfigOf(config) };
    if (config.subtype === undefined) delete next.subtype;
    return next;
  });
}

// --- section blocks ----------------------------------------------------------

/** The FO.SERV-03 number of a section block type: `section_10` is 10. */
export function sectionNumber(type: SectionBlockType): number {
  return Number(type.slice('section_'.length));
}

function sectionBlock(type: SectionBlockType, seedVersion: string): TemplateBlock {
  return { ...defaultBlockConfig(seedVersion, type), quantity: 1, skeleton_location_ref: null, section_text: null };
}

/** Where each section block sits in `blocks`, in section order. */
function sectionSlots(blocks: readonly TemplateBlock[]): number[] {
  return blocks.flatMap((block, i) => (isSectionBlockType(block.block_type) ? [i] : []));
}

function slotOf(blocks: readonly TemplateBlock[], index: number): number {
  const slot = sectionSlots(blocks)[index];
  if (slot === undefined) throw new TemplateTargetGoneError(`template has no section block at index ${index}`);
  return slot;
}

/**
 * A section as a press captures it (E9 sweep B11): its type and how many sections of that
 * type come before it, the identity the section list keys its rows by. A section block
 * carries no id, so this is what survives a pull that reorders the sections; two sections
 * of one type that trade places cannot be told apart and never could be.
 */
export interface SectionRef {
  block_type: SectionBlockType;
  /** How many sections of `block_type` come before this one. */
  occurrence: number;
}

/**
 * The current index, among the section blocks, of the section a press captured: resolved
 * at write time, so a pull that reordered the sections in between acts on the same section.
 * Null when that section is no longer there (a pull removed it or changed its type): the
 * action then writes nothing.
 */
export function resolveSectionIndex(blocks: readonly TemplateBlock[], section: SectionRef): number | null {
  let seen = 0;
  let index = 0;
  for (const block of blocks) {
    if (!isSectionBlockType(block.block_type)) continue;
    if (block.block_type === section.block_type) {
      if (seen === section.occurrence) return index;
      seen += 1;
    }
    index += 1;
  }
  return null;
}

/** Appends a section block after every other section (the palette's "Seções" tap), under the row's seed version. */
export function addSection(blocks: readonly TemplateBlock[], type: SectionBlockType, seedVersion: string): TemplateBlock[] {
  const slots = sectionSlots(blocks);
  const out = [...blocks];
  out.splice(slots.length === 0 ? out.length : slots.at(-1)! + 1, 0, sectionBlock(type, seedVersion));
  return out;
}

/** Inserts a section block right below the section at `index` ("Adicionar abaixo"). */
export function addSectionBelow(
  blocks: readonly TemplateBlock[],
  index: number,
  type: SectionBlockType,
  seedVersion: string,
): TemplateBlock[] {
  const out = [...blocks];
  out.splice(slotOf(blocks, index) + 1, 0, sectionBlock(type, seedVersion));
  return out;
}

/** Moves the section at `index` to `toIndex` among the section blocks only (clamped to the ends). */
export function moveSection(blocks: readonly TemplateBlock[], index: number, toIndex: number): TemplateBlock[] {
  const slots = sectionSlots(blocks);
  slotOf(blocks, index);
  const moved = moveWithin(
    slots.map((slot) => blocks[slot]!),
    index,
    toIndex,
  );
  const out = [...blocks];
  slots.forEach((slot, k) => {
    out[slot] = moved[k]!;
  });
  return out;
}

/** Inserts a copy of the section at `index` right below it. */
export function duplicateSection(blocks: readonly TemplateBlock[], index: number): TemplateBlock[] {
  const slot = slotOf(blocks, index);
  const out = [...blocks];
  out.splice(slot + 1, 0, JSON.parse(JSON.stringify(blocks[slot]!)) as TemplateBlock);
  return out;
}

export function removeSection(blocks: readonly TemplateBlock[], index: number): TemplateBlock[] {
  const slot = slotOf(blocks, index);
  return blocks.filter((_, i) => i !== slot);
}

/**
 * Sets the plain-text boilerplate of the section at `index` (Story 3.6): a string is the
 * template's own text with `{name}` tokens, `null` puts the seed's text back in force.
 */
export function setSectionText(blocks: readonly TemplateBlock[], index: number, text: string | null): TemplateBlock[] {
  const slot = slotOf(blocks, index);
  return blocks.map((block, i) => (i === slot ? { ...block, section_text: text } : block));
}

// --- the composer's view model -------------------------------------------------

interface ComposerNodeBase {
  ref: string;
  name: string;
  /** 1-based position among its siblings of the same kind and parent, and how many there are. */
  position: number;
  siblings: number;
}

export interface ComposerColuna extends ComposerNodeBase {
  kind: 'coluna';
  /** Its painel, or its cabine for a coluna directly under one. */
  parent_ref: string;
  /** The equipment placed on this coluna, per type. */
  quantities: Record<EquipmentBlockType, number>;
  /** How many equipment blocks sit on this coluna. */
  blockCount: number;
}

/** Story 14.2: a painel groups colunas and takes no block of its own. */
export interface ComposerPainel extends ComposerNodeBase {
  kind: 'painel';
  /** Its cabine. */
  parent_ref: string;
  colunas: ComposerColuna[];
  /** The blocks of its colunas, per type, and their sum. */
  totals: Record<EquipmentBlockType, number>;
  totalBlockCount: number;
}

export interface ComposerCabine extends ComposerNodeBase {
  kind: 'cabine';
  agrupar_por_tipo: boolean;
  /** The local's Função as stored (a reserved key or a typed name); null when it holds none. */
  funcao: string | null;
  /** The equipment placed directly on the local, per type ("Equipamentos no local"). */
  quantities: Record<EquipmentBlockType, number>;
  /** How many equipment blocks sit directly on the local. */
  blockCount: number;
  /** The colunas directly under the cabine: the shape every template had before the painel level. */
  colunas: ComposerColuna[];
  paineis: ComposerPainel[];
  /** The cabine's own blocks plus those of every coluna under it (directly or in a painel), per type, and their sum. */
  totals: Record<EquipmentBlockType, number>;
  totalBlockCount: number;
}

export type ComposerNode = ComposerCabine | ComposerPainel | ComposerColuna;

/** A node a block can be placed on: the local itself or a coluna, never a painel. */
export type ComposerBlockNode = ComposerCabine | ComposerColuna;

export interface ComposerSection extends SectionRef {
  /**
   * Index among the section blocks when the view was drawn. An action resolves the index
   * again at write time (`resolveSectionIndex`) rather than trusting this one.
   */
  index: number;
  block_type: SectionBlockType;
  /** The FO.SERV-03 section number. */
  number: number;
  position: number;
  siblings: number;
  /** The template's own text for this section, or null with the seed's text in force (Story 3.6). */
  section_text: string | null;
}

export interface ComposerView {
  cabines: ComposerCabine[];
  sections: ComposerSection[];
  totals: Record<EquipmentBlockType, number>;
  cabineCount: number;
  /** Story 14.2: every painel of the skeleton. */
  painelCount: number;
  /** Every coluna of the skeleton, in a painel or directly under a cabine. */
  colunaCount: number;
  /** Every equipment block of the composition (the sum of every quantity). */
  blockCount: number;
}

function sum(totals: Record<EquipmentBlockType, number>): number {
  return EQUIPMENT_BLOCK_TYPES.reduce((acc, type) => acc + totals[type], 0);
}

/**
 * What the composer draws: the cabines (the locais) in order, each with the equipment
 * placed directly on it, the colunas directly under it and its painéis with their colunas,
 * all in order, and the quantities per type on every node that takes blocks; then the
 * section blocks in order with their FO.SERV-03 number. An orphan block, and a block on a
 * painel, counts nowhere.
 */
export function composerView(template: Composition): ComposerView {
  const perNode = new Map<string, Record<EquipmentBlockType, number>>();
  for (const node of template.skeleton) if (node.kind !== 'painel') perNode.set(node.ref, zeroTotals());
  for (const block of template.blocks) {
    if (!isEquipmentBlockType(block.block_type) || block.skeleton_location_ref === null) continue;
    const quantities = perNode.get(block.skeleton_location_ref);
    if (quantities !== undefined) quantities[block.block_type] += block.quantity;
  }

  const add = (into: Record<EquipmentBlockType, number>, from: Record<EquipmentBlockType, number>) => {
    for (const type of EQUIPMENT_BLOCK_TYPES) into[type] += from[type];
  };
  const colunasView = (parentRef: string, into: Record<EquipmentBlockType, number>[]): ComposerColuna[] => {
    const nodes = colunasOf(template.skeleton, parentRef);
    return nodes.map((coluna, j): ComposerColuna => {
      const quantities = perNode.get(coluna.ref)!;
      for (const totals of into) add(totals, quantities);
      return { kind: 'coluna', ref: coluna.ref, parent_ref: parentRef, name: coluna.name, position: j + 1, siblings: nodes.length, quantities, blockCount: sum(quantities) };
    });
  };

  const cabineNodes = cabinesOf(template.skeleton);
  const totals = zeroTotals();
  let colunaCount = 0;
  let painelCount = 0;
  const cabines = cabineNodes.map((cabine, i): ComposerCabine => {
    const own = perNode.get(cabine.ref)!;
    const cabineTotals = { ...own };
    const colunas = colunasView(cabine.ref, [cabineTotals]);
    const painelNodes = paineisOf(template.skeleton, cabine.ref);
    const paineis = painelNodes.map((painel, j): ComposerPainel => {
      const painelTotals = zeroTotals();
      const painelColunas = colunasView(painel.ref, [painelTotals, cabineTotals]);
      colunaCount += painelColunas.length;
      return {
        kind: 'painel',
        ref: painel.ref,
        parent_ref: cabine.ref,
        name: painel.name,
        position: j + 1,
        siblings: painelNodes.length,
        colunas: painelColunas,
        totals: painelTotals,
        totalBlockCount: sum(painelTotals),
      };
    });
    colunaCount += colunas.length;
    painelCount += paineis.length;
    add(totals, cabineTotals);
    return {
      kind: 'cabine',
      ref: cabine.ref,
      name: cabine.name,
      agrupar_por_tipo: cabine.agrupar_por_tipo,
      funcao: cabine.funcao ?? null,
      position: i + 1,
      siblings: cabineNodes.length,
      quantities: own,
      blockCount: sum(own),
      colunas,
      paineis,
      totals: cabineTotals,
      totalBlockCount: sum(cabineTotals),
    };
  });

  const sectionBlocks = template.blocks.filter((b) => isSectionBlockType(b.block_type));
  const occurrences = sectionBlocks.map((block, index) => sectionBlocks.slice(0, index).filter((b) => b.block_type === block.block_type).length);
  const sections = sectionBlocks.map(
    (block, index): ComposerSection => ({
      index,
      block_type: block.block_type as SectionBlockType,
      occurrence: occurrences[index]!,
      number: sectionNumber(block.block_type as SectionBlockType),
      position: index + 1,
      siblings: sectionBlocks.length,
      section_text: block.section_text,
    }),
  );

  return { cabines, sections, totals, cabineCount: cabines.length, painelCount, colunaCount, blockCount: sum(totals) };
}

/** A node of the view by its ref (a local, a painel, or a coluna at either depth), or null. */
export function findComposerNode(view: ComposerView, ref: string | null): ComposerNode | null {
  if (ref === null) return null;
  for (const cabine of view.cabines) {
    if (cabine.ref === ref) return cabine;
    const coluna = cabine.colunas.find((c) => c.ref === ref);
    if (coluna !== undefined) return coluna;
    for (const painel of cabine.paineis) {
      if (painel.ref === ref) return painel;
      const inner = painel.colunas.find((c) => c.ref === ref);
      if (inner !== undefined) return inner;
    }
  }
  return null;
}
