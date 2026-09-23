import {
  EQUIPMENT_BLOCK_TYPES,
  isEquipmentBlockType,
  isSectionBlockType,
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
 * `blocks` and `skeleton` are two last-writer-wins fields, so a block may point at a node
 * another device removed (an orphan). Nothing here or in the view counts one, and every
 * function that returns `blocks` from a whole composition starts from `withoutOrphans`,
 * so the composer's next write drops it (Design Notes, "Concurrency choice").
 *
 * The kernel never mints an id: a new cabine or coluna ref is the caller's (the web's
 * uuidv7 `newId`, TC-2).
 */

/** The two fields a composition is made of. */
export type Composition = Pick<TemplateRow, 'blocks' | 'skeleton'>;

/** A composition plus the seed version its new blocks are configured under. */
export type SeededComposition = Pick<TemplateRow, 'blocks' | 'skeleton' | 'seed_version'>;

type CabineNode = Extract<SkeletonNode, { kind: 'cabine' }>;
type ColunaNode = Extract<SkeletonNode, { kind: 'coluna' }>;

/** UX-DR30: the Quantity stepper counts 0 to 99 of one type at one node. */
export const MAX_QUANTITY = 99;

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

function colunasOf(skeleton: readonly SkeletonNode[], cabineRef: string): ColunaNode[] {
  return skeleton.filter((node): node is ColunaNode => node.kind === 'coluna' && node.parent_ref === cabineRef);
}

/** Each cabine followed by its colunas, both in their current order. */
function canonical(cabines: readonly CabineNode[], colunasOfCabine: (ref: string) => readonly ColunaNode[]): SkeletonNode[] {
  const out: SkeletonNode[] = [];
  for (const cabine of cabines) out.push(cabine, ...colunasOfCabine(cabine.ref));
  return out;
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

/** Appends a cabine (Agrupar por tipo off) after the last one. */
export function addCabine(skeleton: readonly SkeletonNode[], ref: string, name: string): SkeletonNode[] {
  assertFreshRef(skeleton, ref);
  const cabine: CabineNode = { ref, kind: 'cabine', parent_ref: null, name, agrupar_por_tipo: false };
  return canonical([...cabinesOf(skeleton), cabine], (r) => colunasOf(skeleton, r));
}

/** Appends a coluna after the last coluna of a cabine. */
export function addColuna(skeleton: readonly SkeletonNode[], cabineRef: string, ref: string, name: string): SkeletonNode[] {
  assertFreshRef(skeleton, ref);
  if (nodeOf(skeleton, cabineRef).kind !== 'cabine') throw new Error(`"${cabineRef}" is not a cabine`);
  const coluna: ColunaNode = { ref, kind: 'coluna', parent_ref: cabineRef, name };
  return canonical(cabinesOf(skeleton), (r) => (r === cabineRef ? [...colunasOf(skeleton, r), coluna] : colunasOf(skeleton, r)));
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

function moveWithin<T>(items: readonly T[], from: number, toIndex: number): T[] {
  const out = [...items];
  const to = Math.min(out.length - 1, Math.max(0, Math.floor(toIndex)));
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved!);
  return out;
}

/**
 * Moves a node to `toIndex` (0-based, clamped to the ends) among its siblings: a cabine
 * among the cabines, a coluna among the colunas of its own cabine.
 */
export function moveNode(skeleton: readonly SkeletonNode[], ref: string, toIndex: number): SkeletonNode[] {
  const node = nodeOf(skeleton, ref);
  if (node.kind === 'cabine') {
    const cabines = cabinesOf(skeleton);
    return canonical(moveWithin(cabines, cabines.indexOf(node), toIndex), (r) => colunasOf(skeleton, r));
  }
  const siblings = colunasOf(skeleton, node.parent_ref);
  const moved = moveWithin(siblings, siblings.indexOf(node), toIndex);
  return canonical(cabinesOf(skeleton), (r) => (r === node.parent_ref ? moved : colunasOf(skeleton, r)));
}

/** The composition's blocks with every orphan (a block on a node the skeleton lacks) dropped. */
export function withoutOrphans(template: Composition): TemplateBlock[] {
  const nodes = new Set(template.skeleton.map((node) => node.ref));
  return template.blocks.filter(
    (block) => isSectionBlockType(block.block_type) || (block.skeleton_location_ref !== null && nodes.has(block.skeleton_location_ref)),
  );
}

/**
 * Removes a node, and with a cabine its colunas, together with every block placed on any
 * of them. Both fields change, so the caller writes both in one batch (one undo).
 */
export function removeNode(template: Composition, ref: string): Composition {
  const node = nodeOf(template.skeleton, ref);
  const gone = new Set([ref, ...(node.kind === 'cabine' ? colunasOf(template.skeleton, ref).map((c) => c.ref) : [])]);
  const skeleton = template.skeleton.filter((n) => !gone.has(n.ref));
  const blocks = withoutOrphans(template).filter((b) => b.skeleton_location_ref === null || !gone.has(b.skeleton_location_ref));
  return { blocks, skeleton };
}

// --- quantities per node -----------------------------------------------------

/** How many blocks of one equipment type a node holds, over every entry of that type there. */
export function quantityAt(template: Composition, ref: string, type: EquipmentBlockType): number {
  if (!template.skeleton.some((n) => n.ref === ref)) return 0;
  let total = 0;
  for (const block of template.blocks) {
    if (block.block_type === type && block.skeleton_location_ref === ref) total += block.quantity;
  }
  return total;
}

/**
 * Sets the quantity of one equipment type at one node (clamped to 0..MAX_QUANTITY) and
 * returns the new `blocks`. A node may hold several entries of one type (the standard
 * template's para-raio entrada and saída at the Cubículo Enel): a rise goes to the last
 * entry of that type there, a fall takes from the last entry backwards, removing each
 * entry that reaches zero. A type with no entry at the node gets a new one, placed after
 * the node's other blocks, with the type's config from its other placements
 * (`typeConfigFor`) or, for a type the template does not hold yet, `defaultBlockConfig`.
 */
export function setQuantity(template: SeededComposition, ref: string, type: EquipmentBlockType, n: number): TemplateBlock[] {
  nodeOf(template.skeleton, ref);
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
  /** 1-based position among its siblings, and how many siblings there are. */
  position: number;
  siblings: number;
  /** The equipment placed on this node itself, per type. */
  quantities: Record<EquipmentBlockType, number>;
  /** How many equipment blocks sit on this node itself. */
  blockCount: number;
}

export interface ComposerColuna extends ComposerNodeBase {
  kind: 'coluna';
  parent_ref: string;
}

export interface ComposerCabine extends ComposerNodeBase {
  kind: 'cabine';
  agrupar_por_tipo: boolean;
  colunas: ComposerColuna[];
  /** The cabine's own blocks plus those of its colunas, per type, and their sum. */
  totals: Record<EquipmentBlockType, number>;
  totalBlockCount: number;
}

export type ComposerNode = ComposerCabine | ComposerColuna;

export interface ComposerSection {
  /** Index among the section blocks, the argument `moveSection` and friends take. */
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
  colunaCount: number;
  /** Every equipment block of the composition (the sum of every quantity). */
  blockCount: number;
}

function sum(totals: Record<EquipmentBlockType, number>): number {
  return EQUIPMENT_BLOCK_TYPES.reduce((acc, type) => acc + totals[type], 0);
}

/**
 * What the composer draws: the cabines in order, each with its colunas in order and the
 * quantities per type on every node; then the section blocks in order with their
 * FO.SERV-03 number. An orphan block counts nowhere.
 */
export function composerView(template: Composition): ComposerView {
  const perNode = new Map<string, Record<EquipmentBlockType, number>>();
  for (const node of template.skeleton) perNode.set(node.ref, zeroTotals());
  for (const block of template.blocks) {
    if (!isEquipmentBlockType(block.block_type) || block.skeleton_location_ref === null) continue;
    const quantities = perNode.get(block.skeleton_location_ref);
    if (quantities !== undefined) quantities[block.block_type] += block.quantity;
  }

  const cabineNodes = cabinesOf(template.skeleton);
  const totals = zeroTotals();
  let colunaCount = 0;
  const cabines = cabineNodes.map((cabine, i): ComposerCabine => {
    const colunaNodes = colunasOf(template.skeleton, cabine.ref);
    colunaCount += colunaNodes.length;
    const own = perNode.get(cabine.ref)!;
    const cabineTotals = { ...own };
    const colunas = colunaNodes.map((coluna, j): ComposerColuna => {
      const quantities = perNode.get(coluna.ref)!;
      for (const type of EQUIPMENT_BLOCK_TYPES) cabineTotals[type] += quantities[type];
      return {
        kind: 'coluna',
        ref: coluna.ref,
        parent_ref: cabine.ref,
        name: coluna.name,
        position: j + 1,
        siblings: colunaNodes.length,
        quantities,
        blockCount: sum(quantities),
      };
    });
    for (const type of EQUIPMENT_BLOCK_TYPES) totals[type] += cabineTotals[type];
    return {
      kind: 'cabine',
      ref: cabine.ref,
      name: cabine.name,
      agrupar_por_tipo: cabine.agrupar_por_tipo,
      position: i + 1,
      siblings: cabineNodes.length,
      quantities: own,
      blockCount: sum(own),
      colunas,
      totals: cabineTotals,
      totalBlockCount: sum(cabineTotals),
    };
  });

  const sectionBlocks = template.blocks.filter((b) => isSectionBlockType(b.block_type));
  const sections = sectionBlocks.map(
    (block, index): ComposerSection => ({
      index,
      block_type: block.block_type as SectionBlockType,
      number: sectionNumber(block.block_type as SectionBlockType),
      position: index + 1,
      siblings: sectionBlocks.length,
      section_text: block.section_text,
    }),
  );

  return { cabines, sections, totals, cabineCount: cabines.length, colunaCount, blockCount: sum(totals) };
}

/** A node of the view by its ref, or null. */
export function findComposerNode(view: ComposerView, ref: string | null): ComposerNode | null {
  if (ref === null) return null;
  for (const cabine of view.cabines) {
    if (cabine.ref === ref) return cabine;
    const coluna = cabine.colunas.find((c) => c.ref === ref);
    if (coluna !== undefined) return coluna;
  }
  return null;
}
