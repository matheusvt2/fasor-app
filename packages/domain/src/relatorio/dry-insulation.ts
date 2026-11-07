import type { BlockRow, EquipmentRow } from '../schemas/entities.ts';
import { blockDefinitionIn, snapshotDefinitionContext, type DefinitionContext } from '../seed/definitions.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import type { BlockDefinition, SubtypeDef } from '../seed/schema.ts';
import { plural } from '../text/plural.ts';
import { nameplateTagPrefill } from './nameplate-copy.ts';
import { isOilFieldExcused, isOilUnit, oilRuleOf } from './oil-rule.ts';
import { enabledSubBlocksOf, isCellFilled } from './sheet-state.ts';

/*
 * Review 2026-10-08, Decision 2 (`source-deltas.md` row "Story 3.5 and FR-11", findings H-4
 * and MKT-7), amended 2026-10-09 (Matheus): a dry transformador de força, TP or TC whose
 * template carries no subtype.
 *
 * - A block with no subtype whose stored TIPO DE ISOLAÇÃO is EPÓXI or Á SECO, whatever wrote
 *   it, offers one chip, "Marcar N itens de óleo como NA" (`oilNaChipItems`, `oilNaChipText`),
 *   while at least one of the dry subtype's oil items has no value yet and the chip was not
 *   used on this block on this device. Confirming the insulation writes no mark by itself (seed
 *   v1 offers no oil option, so an oil-filled unit is forced to pick a dry value). The items
 *   are the block's own seed definition's (`subtypes[*].na_defaults` of the subtype whose label
 *   is the value), never a second list; a cell holding C, NC or NA is never counted.
 * - VOL. ÓLEO stops counting as a missing nameplate field on a block whose subtype is dry or
 *   whose stored insulation is dry (`nameplateMissingKeys`, the one "missing" rule of the
 *   plate: `sheetProgress` and the field's missing marker both read it).
 * No chip on a block that has a subtype (its `na_defaults` already display NA) or whose type has
 * no TIPO DE ISOLAÇÃO. The checklist is a locked sub-block, so its switch is never read here.
 *
 * Story 14.11 (seed v6): a block whose definition has an oil rule (`oil-rule.ts`) goes through
 * that rule instead: it is dry when the rule reads it non-oil, the chip is never offered (its
 * oil items already show NA), and its oil fields are excused by the rule. v1 to v5 keep all of
 * the above unchanged.
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

/** e22h: through the context, so a company sheet reads its version's plate and rule. */
function definitionOf(block: Pick<BlockRow, 'seed_version' | 'block_type' | 'config'>, ctx: DefinitionContext): BlockDefinition | null {
  return blockDefinitionIn(ctx, block);
}

/** A dry unit: its config subtype is `epoxi` or `a_seco`, or its stored TIPO DE ISOLAÇÃO names one. */
export function isDryBlock(block: Pick<BlockRow, 'config' | 'sheet' | 'seed_version' | 'block_type'>, ctx: DefinitionContext): boolean {
  if (oilRuleOf(block, ctx) !== null) return isOilUnit(block, ctx) === false;
  const subtype = subtypeOf(block);
  if (subtype !== null && DRY_SUBTYPE_KEYS.has(subtype)) return true;
  const cell = block.sheet.nameplate[INSULATION_FIELD_KEY];
  if (!isCellFilled(cell)) return false;
  return drySubtypeOfInsulation(definitionOf(block, ctx), cell!.value) !== null;
}

/**
 * The oil items the chip "Marcar N itens de óleo como NA" would mark on `block` (read fresh,
 * inside the edit, when it is tapped), in the definition's checklist order: the dry subtype's
 * `na_defaults` whose result cell is not filled, on a block with no subtype whose stored TIPO
 * DE ISOLAÇÃO is dry. Empty once `used` (the device flag of this block), and when the stored
 * insulation is not dry, the block has a subtype or its type has no TIPO DE ISOLAÇÃO. The chip
 * shows while this is non-empty.
 */
export function oilNaChipItems(block: Pick<BlockRow, 'config' | 'sheet' | 'seed_version' | 'block_type'>, options: { used: boolean }, ctx: DefinitionContext): string[] {
  if (options.used || subtypeOf(block) !== null || oilRuleOf(block, ctx) !== null) return [];
  const definition = definitionOf(block, ctx);
  if (definition === null || definition.checklist === null) return [];
  const cell = block.sheet.nameplate[INSULATION_FIELD_KEY];
  if (!isCellFilled(cell)) return [];
  const subtype = drySubtypeOfInsulation(definition, cell!.value);
  if (subtype === null) return [];
  const marks = new Set<string>(subtype.na_defaults);
  return definition.checklist.filter((item) => marks.has(item.key) && !isCellFilled(block.sheet.checklist[item.key]?.result)).map((item) => item.key);
}

/**
 * A nameplate field the block excuses: VOL. ÓLEO on a dry block of seeds v1 to v5
 * (`isDryBlock`), and on seed v6 on every field of the oil rule a non-oil unit excuses
 * (`isOilFieldExcused`). Never missing, printed "-" whatever is stored. False for a block with
 * no definition.
 */
export function isNameplateFieldExcused(block: Pick<BlockRow, 'config' | 'sheet' | 'seed_version' | 'block_type'>, fieldKey: string, ctx: DefinitionContext): boolean {
  const definition = definitionOf(block, ctx);
  if (definition === null) return false;
  if (definition.oil_rule !== undefined) return isOilFieldExcused(block, fieldKey, ctx);
  return fieldKey === OIL_VOLUME_FIELD_KEY && isDryBlock(block, ctx);
}

/**
 * Stories 16.4 and 17.3, QA G1 (2026-10-28): whether the nameplate field offers the "N/A"
 * control. An excused field prints "-" whatever is stored, so it offers no N/A; every other
 * field of the plate does.
 */
export function nameplateAcceptsNotApplicable(block: Pick<BlockRow, 'config' | 'sheet' | 'seed_version' | 'block_type'>, fieldKey: string, ctx: DefinitionContext): boolean {
  return !isNameplateFieldExcused(block, fieldKey, ctx);
}

/**
 * The nameplate fields of the block still missing (the one rule of "missing" on the plate):
 * every field of its definition whose cell is not filled, except a TAG field shown prefilled
 * from the block's TAG (Story 12.3, needs `equipment`), VOL. ÓLEO on a dry block
 * (`isDryBlock`; seed v6: every oil field the oil rule excuses) and a field the seed marks
 * `optional` (seed v6, the QGBT's SELV/PELV mark). Empty for an unknown block, one with no definition or a disabled nameplate.
 */
export function nameplateMissingKeys(
  snapshot: { readonly blocks: readonly BlockRow[]; readonly equipment?: readonly Pick<EquipmentRow, 'id' | 'tag'>[] | undefined; readonly equipment_types?: RelatorioSnapshot['equipment_types'] },
  blockId: string,
): ReadonlySet<string> {
  const block = snapshot.blocks.find((row) => row.id === blockId);
  if (block === undefined || !enabledSubBlocksOf(block).has('nameplate')) return new Set();
  // Story 14.6: a company sheet's plate is its version's, from the snapshot.
  const ctx = snapshotDefinitionContext(snapshot);
  const definition = blockDefinitionIn(ctx, block);
  if (definition === null) return new Set();
  const prefilled =
    snapshot.equipment === undefined
      ? null
      : nameplateTagPrefill({ blocks: snapshot.blocks, equipment: snapshot.equipment, ...(snapshot.equipment_types === undefined ? {} : { equipment_types: snapshot.equipment_types }) }, block.id);
  const missing = new Set<string>();
  for (const field of definition.nameplate) {
    if (isCellFilled(block.sheet.nameplate[field.key])) continue;
    if (field.key === 'tag' && prefilled !== null) continue;
    // VOL. ÓLEO on a dry v1-v5 block; seed v6: the rule's oil fields on a non-oil unit (Story 14.11).
    if (isNameplateFieldExcused(block, field.key, ctx)) continue;
    // A field the seed marks optional (Story 14.9).
    if (field.optional === true) continue;
    missing.add(field.key);
  }
  return missing;
}

// --- the texts ---------------------------------------------------------------------------

// authored: the undo toast of the chip, the count of oil items it marked NA (review 2026-10-08, Decision 2).
/** "1 item de óleo marcado NA", "8 itens de óleo marcados NA". */
export function oilItemsNaText(n: number): string {
  return plural(n, 'item de óleo marcado NA', 'itens de óleo marcados NA');
}

// authored: the chip under TIPO DE ISOLAÇÃO on a dry block (amendment 2026-10-09).
/** "Marcar 1 item de óleo como NA", "Marcar 8 itens de óleo como NA". */
export function oilNaChipText(n: number): string {
  return `Marcar ${plural(n, 'item de óleo', 'itens de óleo')} como NA`;
}
