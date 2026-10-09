import { sheetNameplatePath } from '../ops/path.ts';
import type { BlockRow, EquipmentRow } from '../schemas/entities.ts';
import { findDefinition } from '../seed/definitions.ts';
import type { BlockDefinition, SubtypeDef } from '../seed/schema.ts';
import { plural } from '../text/plural.ts';
import { nameplateTagPrefill } from './nameplate-copy.ts';
import { enabledSubBlocksOf, isCellFilled } from './sheet-state.ts';

/*
 * Review 2026-10-08, Decision 2 (`source-deltas.md` row "Story 3.5 and FR-11", findings H-4
 * and MKT-7): a dry transformador de força, TP or TC whose template carries no subtype.
 *
 * - Confirming a nameplate TIPO DE ISOLAÇÃO of EPÓXI or Á SECO on a block with no subtype
 *   writes, in the same batch, the matching dry subtype's `na_defaults` as NA result cells on
 *   the oil items that have no value yet (`dryInsulationNaItems`). The items are the block's
 *   own seed definition's (`subtypes[*].na_defaults` of the subtype whose label is the value),
 *   never a second list. A cell holding C, NC or NA is never written; a cleared one is.
 * - VOL. ÓLEO stops counting as a missing nameplate field on a block whose subtype is dry or
 *   whose stored insulation is dry (`nameplateMissingKeys`, the one "missing" rule of the
 *   plate: `sheetProgress` and the field's missing marker both read it).
 * No marks on a block that has a subtype (its `na_defaults` already display NA), whose
 * checklist sub-block is disabled, or whose type has no TIPO DE ISOLAÇÃO.
 */

/** The nameplate field that names the insulation (`TIPO DE ISOLAÇÃO`, seed v1). */
export const INSULATION_FIELD_KEY = 'tipo_de_isolacao';

/** The nameplate field a dry unit leaves empty (`VOL. ÓLEO`, seed v1). */
export const OIL_VOLUME_FIELD_KEY = 'vol_oleo';

/** The subtype keys that name a dry unit (FR-11). */
const DRY_SUBTYPE_KEYS: ReadonlySet<string> = new Set(['epoxi', 'a_seco']);

/**
 * The dry subtype an insulation value names on this definition: the subtype whose label
 * equals the value (`EPÓXI` → `epoxi`, `Á SECO` → `a_seco`), else null (an empty or other
 * value, or a definition with no TIPO DE ISOLAÇÃO or no dry subtype).
 */
export function drySubtypeOfInsulation(definition: Pick<BlockDefinition, 'nameplate' | 'subtypes'> | null, value: unknown): SubtypeDef | null {
  if (definition === null || typeof value !== 'string' || value.trim() === '') return null;
  if (!definition.nameplate.some((field) => field.key === INSULATION_FIELD_KEY)) return null;
  return definition.subtypes.find((subtype) => DRY_SUBTYPE_KEYS.has(subtype.key) && subtype.label === value) ?? null;
}

/** The block's config subtype, when its config names one. */
function subtypeOf(block: Pick<BlockRow, 'config'>): string | null {
  const config = block.config;
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return null;
  const subtype = (config as { subtype?: unknown }).subtype;
  return typeof subtype === 'string' ? subtype : null;
}

function definitionOf(block: Pick<BlockRow, 'seed_version' | 'block_type'>): BlockDefinition | null {
  return findDefinition(block.seed_version, block.block_type);
}

/** A dry unit: its config subtype is `epoxi` or `a_seco`, or its stored TIPO DE ISOLAÇÃO names one. */
export function isDryBlock(block: Pick<BlockRow, 'config' | 'sheet' | 'seed_version' | 'block_type'>): boolean {
  const subtype = subtypeOf(block);
  if (subtype !== null && DRY_SUBTYPE_KEYS.has(subtype)) return true;
  const cell = block.sheet.nameplate[INSULATION_FIELD_KEY];
  if (!isCellFilled(cell)) return false;
  return drySubtypeOfInsulation(definitionOf(block), cell!.value) !== null;
}

/**
 * The oil items to mark NA when TIPO DE ISOLAÇÃO is set to `value` on `block` (read fresh,
 * inside the edit), in the definition's checklist order: the dry subtype's `na_defaults`
 * whose result cell is not filled. Empty when the value is not dry, the block has a subtype,
 * its checklist is disabled or its type has no TIPO DE ISOLAÇÃO.
 */
export function dryInsulationNaItems(block: Pick<BlockRow, 'config' | 'sheet' | 'seed_version' | 'block_type'>, value: unknown): string[] {
  if (subtypeOf(block) !== null) return [];
  if (!enabledSubBlocksOf(block).has('checklist')) return [];
  const definition = definitionOf(block);
  if (definition === null || definition.checklist === null) return [];
  const subtype = drySubtypeOfInsulation(definition, value);
  if (subtype === null) return [];
  const marks = new Set<string>(subtype.na_defaults);
  return definition.checklist.filter((item) => marks.has(item.key) && !isCellFilled(block.sheet.checklist[item.key]?.result)).map((item) => item.key);
}

/** Whether a suggestion's `target_path` is this block's TIPO DE ISOLAÇÃO cell. */
export function isInsulationTarget(blockId: string, targetPath: string): boolean {
  return targetPath === sheetNameplatePath(blockId, INSULATION_FIELD_KEY);
}

/**
 * The nameplate fields of the block still missing (the one rule of "missing" on the plate):
 * every field of its definition whose cell is not filled, except a TAG field shown prefilled
 * from the block's TAG (Story 12.3, needs `equipment`) and VOL. ÓLEO on a dry block
 * (`isDryBlock`). Empty for an unknown block, one with no definition or a disabled nameplate.
 */
export function nameplateMissingKeys(
  snapshot: { readonly blocks: readonly BlockRow[]; readonly equipment?: readonly Pick<EquipmentRow, 'id' | 'tag'>[] | undefined },
  blockId: string,
): ReadonlySet<string> {
  const block = snapshot.blocks.find((row) => row.id === blockId);
  if (block === undefined || !enabledSubBlocksOf(block).has('nameplate')) return new Set();
  const definition = definitionOf(block);
  if (definition === null) return new Set();
  const prefilled = snapshot.equipment === undefined ? null : nameplateTagPrefill({ blocks: snapshot.blocks, equipment: snapshot.equipment }, block.id);
  const dry = isDryBlock(block);
  const missing = new Set<string>();
  for (const field of definition.nameplate) {
    if (isCellFilled(block.sheet.nameplate[field.key])) continue;
    if (field.key === 'tag' && prefilled !== null) continue;
    if (field.key === OIL_VOLUME_FIELD_KEY && dry) continue;
    missing.add(field.key);
  }
  return missing;
}

// --- the texts ---------------------------------------------------------------------------

// authored: the count of oil items a dry insulation marked NA (review 2026-10-08, Decision 2).
/** "1 item de óleo marcado NA", "8 itens de óleo marcados NA". */
export function oilItemsNaText(n: number): string {
  return plural(n, 'item de óleo marcado NA', 'itens de óleo marcados NA');
}

// authored: a confirmation toast followed by its oil marks, "… — confirmado · 8 itens de óleo marcados NA".
/** `text` with the oil marks appended (`text · 8 itens de óleo marcados NA`); `text` unchanged for 0. */
export function withOilItemsNaText(text: string, n: number): string {
  return n === 0 ? text : `${text} · ${oilItemsNaText(n)}`;
}
