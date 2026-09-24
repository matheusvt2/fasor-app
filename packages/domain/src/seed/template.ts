import {
  EQUIPMENT_BLOCK_TYPES,
  SECTION_BLOCK_TYPES,
  isEquipmentBlockType,
  type BlockConfig,
  type EquipmentBlockType,
  type Role,
  type SkeletonNode,
  type SubBlockConfig,
  type SubBlockKey,
  type Subtype,
  type TemplateBlock,
} from '../schemas/block-config.ts';
import type { TemplateRow } from '../schemas/entities.ts';
import { getDefinition, naDefaultsFor, SEED_VERSION } from './definitions.ts';

/*
 * Story 3.2: the seeded "Cabine primária — padrão" template, built once here and used by
 * both emitters -- the provisioning CLI (`apps/api/src/db/seed.ts`, a server op) and the
 * Templates surface's empty state (a device op). Both write the same row through one
 * `template/{id}` create; the caller supplies the id (the kernel never mints one, TC-2).
 *
 * The skeleton and per-location quantities reproduce the reference job (addendum §3):
 * 25 seccionadoras, 21 disjuntores, 11 TP, 11 TC, 8 transformadores, 4 cabos de entrada,
 * 9 cabos de saída and 5 para-raios.
 */

export const STANDARD_TEMPLATE_NAME = 'Cabine primária — padrão';

/** FR-11: sub-blocks that ship switched off in a new BlockConfig. */
export const DEFAULT_OFF_SUB_BLOCKS: readonly SubBlockKey[] = ['ia_ip_display'];

/** Sub-blocks every sheet carries, shown as "Sempre" rather than a toggle (Story 3.5). */
export const LOCKED_SUB_BLOCKS: readonly SubBlockKey[] = ['checklist', 'conclusion'];

export interface BlockConfigOptions {
  subtype?: Subtype;
  role?: Role;
}

/**
 * The default `BlockConfig` of a block type under a seed version: every sub-block of its
 * definition on, `ia_ip_display` off, and the subtype's NA defaults. A section block has
 * no sub-blocks.
 */
export function defaultBlockConfig(
  seedVersion: string,
  blockType: BlockConfig['block_type'],
  options: BlockConfigOptions = {},
): BlockConfig {
  const sub_blocks: Partial<Record<SubBlockKey, SubBlockConfig>> = {};
  if (isEquipmentBlockType(blockType)) {
    for (const key of getDefinition(seedVersion, 'cabine_primaria', blockType).sub_blocks) {
      sub_blocks[key] = { enabled: !DEFAULT_OFF_SUB_BLOCKS.includes(key) };
    }
  }
  return {
    block_type: blockType,
    ...(options.subtype === undefined ? {} : { subtype: options.subtype }),
    ...(options.role === undefined ? {} : { role: options.role }),
    sub_blocks,
    na_defaults: isEquipmentBlockType(blockType) ? naDefaultsFor(seedVersion, blockType, options.subtype) : [],
  };
}

// --- the standard template's composition -----------------------------------

interface Placement {
  type: EquipmentBlockType;
  quantity: number;
  role?: Role;
}

/** Every seccionadora of the reference job is manual (Story 3.2 AC). */
const SUBTYPE_OF: Partial<Record<EquipmentBlockType, Subtype>> = { chave_seccionadora: 'manual' };

const one = (type: EquipmentBlockType, role?: Role): Placement => ({ type, quantity: 1, ...(role ? { role } : {}) });

/** Which columns of the 1° Subsolo hold which equipment, and how many (reference job 9.2-9.4). */
const SUBSOLO_COLUMNS: Readonly<Record<number, Placement[]>> = {
  1: [one('chave_seccionadora')],
  2: [{ type: 'chave_seccionadora', quantity: 2 }, one('disjuntor_mt'), one('tp'), one('tc')],
  3: [
    one('chave_seccionadora'),
    { type: 'disjuntor_mt', quantity: 2 },
    { type: 'tp', quantity: 2 },
    { type: 'tc', quantity: 2 },
  ],
  4: [one('disjuntor_mt'), one('tp'), one('tc')],
  5: [one('chave_seccionadora'), one('disjuntor_mt')],
  6: [one('chave_seccionadora'), one('disjuntor_mt')],
  7: [one('chave_seccionadora'), one('disjuntor_mt')],
  8: [one('chave_seccionadora'), one('disjuntor_mt')],
  10: [one('chave_seccionadora'), one('disjuntor_mt')],
  11: [one('chave_seccionadora'), one('disjuntor_mt')],
  12: [one('chave_seccionadora'), one('disjuntor_mt')],
  13: [one('chave_seccionadora'), one('disjuntor_mt')],
  14: [one('disjuntor_mt'), one('tp'), one('tc')],
  16: [one('disjuntor_mt'), one('tp'), one('tc')],
  17: [one('chave_seccionadora')],
};

const SUBSOLO_COLUMN_COUNT = 17;

interface CabineSpec {
  ref: string;
  name: string;
  agrupar_por_tipo: boolean;
  /** Blocks placed on the cabine itself, with no column. */
  blocks: Placement[];
}

const CABINES: CabineSpec[] = [
  {
    ref: 'enel',
    name: 'Cubículo Enel',
    agrupar_por_tipo: false,
    blocks: [
      one('cabos_entrada', 'entrada'),
      one('para_raio', 'entrada'),
      one('chave_seccionadora', 'entrada'),
      one('chave_seccionadora', 'saida'),
      one('tp'),
      one('tc'),
      one('disjuntor_mt'),
      one('para_raio', 'saida'),
      one('cabos_saida', 'saida'),
    ],
  },
  {
    ref: 'subsolo-1',
    name: '1° Subsolo',
    agrupar_por_tipo: true,
    blocks: [
      { type: 'transformador_forca', quantity: 5 },
      { type: 'cabos_saida', quantity: 5, role: 'alimentacao' },
    ],
  },
  {
    ref: 'oxigenio',
    name: 'Oxigênio',
    agrupar_por_tipo: false,
    blocks: [
      one('cabos_entrada'),
      one('chave_seccionadora'),
      one('para_raio', 'saida'),
      one('cabos_saida'),
      one('transformador_forca'),
    ],
  },
  ...(['a', 'b'] as const).map(
    (side): CabineSpec => ({
      ref: `cobertura-${side}`,
      name: `Cobertura ${side.toUpperCase()}`,
      agrupar_por_tipo: false,
      blocks: [
        one('cabos_entrada'),
        one('para_raio', 'entrada'),
        one('chave_seccionadora'),
        one('disjuntor_mt'),
        one('cabos_saida'),
        one('transformador_forca'),
      ],
    }),
  ),
  {
    ref: 'geradores',
    name: 'Geradores',
    agrupar_por_tipo: true,
    blocks: [
      { type: 'chave_seccionadora', quantity: 7 },
      { type: 'disjuntor_mt', quantity: 4 },
      { type: 'tp', quantity: 4 },
      { type: 'tc', quantity: 4 },
    ],
  },
];

function placed(seedVersion: string, placement: Placement, ref: string): TemplateBlock {
  const subtype = SUBTYPE_OF[placement.type];
  const config = defaultBlockConfig(seedVersion, placement.type, {
    ...(subtype === undefined ? {} : { subtype }),
    ...(placement.role === undefined ? {} : { role: placement.role }),
  });
  return { ...config, quantity: placement.quantity, skeleton_location_ref: ref, section_text: null };
}

export interface StandardTemplateInput {
  /** The new `template/{id}`, minted by the caller (uuidv7, AD-4). */
  id: string;
  seedVersion?: string;
}

/**
 * The "Cabine primária — padrão" template row: the section blocks 1-6, 8, 10 and 11 in
 * FO.SERV-03 order, then the equipment blocks location by location, over the skeleton
 * Cubículo Enel · 1° Subsolo (Coluna 1 to 17) · Oxigênio · Cobertura A · Cobertura B ·
 * Geradores. Pure: the same id gives the same row.
 */
export function standardTemplate({ id, seedVersion = SEED_VERSION }: StandardTemplateInput): TemplateRow {
  const skeleton: SkeletonNode[] = [];
  const blocks: TemplateBlock[] = SECTION_BLOCK_TYPES.map((type) => ({
    ...defaultBlockConfig(seedVersion, type),
    quantity: 1,
    skeleton_location_ref: null,
    section_text: null,
  }));

  for (const cabine of CABINES) {
    skeleton.push({
      ref: cabine.ref,
      kind: 'cabine',
      parent_ref: null,
      name: cabine.name,
      agrupar_por_tipo: cabine.agrupar_por_tipo,
    });
    for (const placement of cabine.blocks) blocks.push(placed(seedVersion, placement, cabine.ref));
    if (cabine.ref !== 'subsolo-1') continue;
    for (let n = 1; n <= SUBSOLO_COLUMN_COUNT; n++) {
      const ref = `${cabine.ref}/coluna-${n}`;
      skeleton.push({ ref, kind: 'coluna', parent_ref: cabine.ref, name: `Coluna ${n}` });
      for (const placement of SUBSOLO_COLUMNS[n] ?? []) blocks.push(placed(seedVersion, placement, ref));
    }
  }

  return {
    id,
    name: STANDARD_TEMPLATE_NAME,
    version: 1,
    seed_version: seedVersion,
    blocks,
    skeleton,
    archived_at: null,
    removed_at: null,
  };
}

/** Zero of every equipment block type, in `EQUIPMENT_BLOCK_TYPES` order. */
export function zeroTotals(): Record<EquipmentBlockType, number> {
  return Object.fromEntries(EQUIPMENT_BLOCK_TYPES.map((type) => [type, 0])) as Record<EquipmentBlockType, number>;
}

/**
 * Per-type totals of a template's equipment blocks, e.g. 25 chave_seccionadora. A block
 * whose node is gone from the skeleton (an orphan two devices folded into, Story 3.4) is
 * not counted: it is not part of the composition any reader shows or instantiates.
 */
export function templateTotals(template: Pick<TemplateRow, 'blocks' | 'skeleton'>): Record<EquipmentBlockType, number> {
  const nodes = new Set(template.skeleton.map((node) => node.ref));
  const totals = zeroTotals();
  for (const block of template.blocks) {
    if (!isEquipmentBlockType(block.block_type)) continue;
    if (block.skeleton_location_ref === null || !nodes.has(block.skeleton_location_ref)) continue;
    totals[block.block_type] += block.quantity;
  }
  return totals;
}

/** The template's equipment blocks across every type: the "94 blocos" of the "Novo relatório" dialog. */
export function templateBlockTotal(template: Pick<TemplateRow, 'blocks' | 'skeleton'>): number {
  return Object.values(templateTotals(template)).reduce((sum, count) => sum + count, 0);
}
