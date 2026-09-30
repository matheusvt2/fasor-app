import { sortByOrderKey } from '../ops/order-key.ts';
import {
  blockConfigSchema,
  isEquipmentBlockType,
  isSectionBlockType,
  MAX_QUANTITY,
  type BlockConfig,
  type SkeletonNode,
  type TemplateBlock,
} from '../schemas/block-config.ts';
import type { BlockRow, LocationRow, RelatorioRow, TemplateRow } from '../schemas/entities.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { locationBlocks } from '../relatorio/tree.ts';

/*
 * Story 11.3 (FR-14): "Salvar como template" projects a relatório's structure into a
 * Template row, the inverse of `instantiateTemplate`: the live cabines (with their
 * "Agrupar por tipo") each followed by their live colunas, every live equipment block's
 * `BlockConfig` (sub-block and subtype overrides included) placed on its node with the
 * quantity of each run of equal configs, and the live section blocks with their own text.
 * Nothing the relatório holds as data is carried: no sheet value, no not-tested mark, no
 * conclusion, no photo, no point, no equipment id or TAG (TAGs are regenerated when a
 * relatório is created from the template). Sections 7 and 9 are generated, never carried.
 */

/** The toast of a template saved from a relatório: "Template Porto Seguro salvo". authored. */
export function templateSavedText(name: string): string {
  return `Template ${name} salvo`;
}

/** A block's `BlockConfig` as a template carries it; the seed's default when the stored config does not parse. */
function equipmentConfigOf(block: BlockRow, seedVersion: string): BlockConfig {
  const config = block.config;
  const parsed = blockConfigSchema.safeParse(
    typeof config === 'object' && config !== null && !Array.isArray(config) ? { ...config, block_type: block.block_type } : null,
  );
  if (parsed.success) {
    const { block_type, subtype, role, sub_blocks, na_defaults } = parsed.data;
    return {
      block_type,
      ...(subtype === undefined ? {} : { subtype }),
      ...(role === undefined ? {} : { role }),
      sub_blocks: structuredClone(sub_blocks),
      na_defaults: [...na_defaults],
    };
  }
  return defaultBlockConfig(block.seed_version || seedVersion, block.block_type as BlockConfig['block_type']);
}

/** A section block's own text (`config.section_text`), null when the seed's text is in force. */
function sectionTextOf(block: BlockRow): string | null {
  const config = block.config;
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return null;
  const text = (config as Record<string, unknown>).section_text;
  return typeof text === 'string' ? text : null;
}

/** Plain-data equality with key order ignored (two configs written by different paths compare equal). */
function sameConfig(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, i) => sameConfig(value, b[i]));
  }
  const keysA = Object.keys(a).filter((key) => (a as Record<string, unknown>)[key] !== undefined);
  const keysB = Object.keys(b).filter((key) => (b as Record<string, unknown>)[key] !== undefined);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => sameConfig((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/**
 * The Template row "Salvar como template" creates from `snapshot`, under `id` and `name`,
 * on the relatório's seed version, at version 1, live and not archived. A coluna whose
 * cabine is not live is skipped with its blocks (a template's coluna always sits under a
 * cabine), and so is a location nested under a coluna.
 */
export function templateFromRelatorio(
  snapshot: { relatorio: Pick<RelatorioRow, 'seed_version'>; locations: readonly LocationRow[]; blocks: readonly BlockRow[] },
  meta: { id: string; name: string },
): TemplateRow {
  const seedVersion = snapshot.relatorio.seed_version;
  const live = sortByOrderKey(snapshot.locations.filter((row) => row.removed_at === null));

  const skeleton: SkeletonNode[] = [];
  for (const cabine of live) {
    if (cabine.kind !== 'cabine' || cabine.parent_id !== null) continue;
    skeleton.push({ ref: cabine.id, kind: 'cabine', parent_ref: null, name: cabine.name, agrupar_por_tipo: cabine.agrupar_por_tipo });
    for (const coluna of live) {
      if (coluna.kind === 'coluna' && coluna.parent_id === cabine.id) skeleton.push({ ref: coluna.id, kind: 'coluna', parent_ref: cabine.id, name: coluna.name });
    }
  }

  const blocks: TemplateBlock[] = [];

  const sections = sortByOrderKey(snapshot.blocks.filter((block) => block.removed_at === null && block.location_id === null && isSectionBlockType(block.block_type)));
  for (const block of sections) {
    blocks.push({
      block_type: block.block_type as TemplateBlock['block_type'],
      sub_blocks: {},
      na_defaults: [],
      quantity: 1,
      skeleton_location_ref: null,
      section_text: sectionTextOf(block),
    });
  }

  for (const node of skeleton) {
    let run: { entry: TemplateBlock; config: BlockConfig } | null = null;
    for (const block of locationBlocks(snapshot.blocks, node.ref)) {
      if (!isEquipmentBlockType(block.block_type)) continue;
      const config = equipmentConfigOf(block, seedVersion);
      if (run !== null && run.entry.quantity < MAX_QUANTITY && sameConfig(run.config, config)) {
        run.entry.quantity += 1;
        continue;
      }
      run = { entry: { ...config, quantity: 1, skeleton_location_ref: node.ref, section_text: null }, config };
      blocks.push(run.entry);
    }
  }

  return { id: meta.id, name: meta.name, version: 1, seed_version: seedVersion, blocks, skeleton, archived_at: null, removed_at: null };
}
