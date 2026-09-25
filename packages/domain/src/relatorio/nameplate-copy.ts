import type { BlockRow, EquipmentRow, JsonValue } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { plural } from '../text/plural.ts';
import { isCellFilled, isEquipmentBlock } from './sheet-state.ts';

/*
 * Story 5.3, FR-34, AR-24: the two copy chips of an empty nameplate group.
 *
 * - "Igual à ⟨TAG⟩?" (`suggestNameplateCopy`): another live block of this relatório, of the
 *   same block type and manufacturer, whose plate holds a manufacturer. The target's own
 *   manufacturer is known from its own FABRICAÇÃO cell or, failing that, from its
 *   equipment's last issued plate; when neither names one (the usual empty group), the
 *   chip asks "same as ⟨TAG⟩?" about the most recently edited same-type plate, and the
 *   engineer decides.
 * - "Copiar da última visita (⟨TAG⟩)" (`lastNameplateCopy`): the equipment's
 *   `last_nameplate`, projected onto the keys the target block's definition has now.
 * Both copy plain values (the chips write ordinary `sheet/{b}/nameplate/{key}` ops).
 */

/** The nameplate field kind that names the manufacturer (`FABRICAÇÃO`). */
const MANUFACTURER_KIND = 'manufacturer';

function definitionOf(block: Pick<BlockRow, 'seed_version' | 'block_type'>): BlockDefinition | null {
  try {
    return getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
  } catch {
    return null;
  }
}

function manufacturerKey(definition: BlockDefinition): string | null {
  return definition.nameplate.find((field) => field.kind === MANUFACTURER_KIND)?.key ?? null;
}

/** A manufacturer value compared the way two plates agree: trimmed, case folded. */
function sameText(a: unknown, b: unknown): boolean {
  return typeof a === 'string' && typeof b === 'string' && a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');
}

/** True when the block holds no filled nameplate cell. */
export function nameplateIsEmpty(block: Pick<BlockRow, 'sheet'>): boolean {
  return !Object.values(block.sheet.nameplate).some(isCellFilled);
}

/**
 * "Igual à ⟨TAG⟩?": the filled nameplate values of `source` whose keys the target's
 * definition carries, in the definition's order, never a `per_unit` field (seed v2, D-3:
 * IDENTIFICAÇÃO, Nº SÉRIE and TAG belong to one physical unit). A v1 definition flags
 * none, so a v1 relatório copies as it always did (AR-20).
 */
export function nameplateCopyFields(source: Pick<BlockRow, 'sheet'>, definition: BlockDefinition): { fieldKey: string; value: JsonValue }[] {
  const out: { fieldKey: string; value: JsonValue }[] = [];
  for (const field of definition.nameplate) {
    if (field.per_unit === true) continue;
    const cell = source.sheet.nameplate[field.key];
    if (cell !== undefined && isCellFilled(cell)) out.push({ fieldKey: field.key, value: cell.value as JsonValue });
  }
  return out;
}

/** "Igual à ⟨TAG⟩?": the plate to copy onto `blockId`, or null when none applies. */
export function suggestNameplateCopy(
  snapshot: { readonly blocks: readonly BlockRow[]; readonly equipment: readonly EquipmentRow[] },
  blockId: string,
): { sourceBlockId: string; tag: string } | null {
  const target = snapshot.blocks.find((row) => row.id === blockId);
  if (target === undefined || target.removed_at !== null) return null;
  const definition = definitionOf(target);
  if (definition === null || definition.nameplate.length === 0) return null;
  const key = manufacturerKey(definition);
  if (key === null) return null;
  const equipment = target.equipment_id === null ? undefined : snapshot.equipment.find((row) => row.id === target.equipment_id);
  const ownCell = target.sheet.nameplate[key];
  const known: unknown = isCellFilled(ownCell) ? ownCell!.value : (equipment?.last_nameplate?.fields[key] ?? null);

  const candidates = snapshot.blocks.filter((block) => {
    if (block.id === target.id || block.removed_at !== null || !isEquipmentBlock(block)) return false;
    if (block.relatorio_id !== target.relatorio_id || block.block_type !== target.block_type) return false;
    const cell = block.sheet.nameplate[key];
    if (!isCellFilled(cell)) return false;
    return known === null || known === undefined || sameText(cell!.value, known);
  });
  if (candidates.length === 0) return null;
  // The most recently edited plate first: the one the engineer just filled.
  candidates.sort((a, b) => {
    const at = a.last_modified_at ?? '';
    const bt = b.last_modified_at ?? '';
    if (at !== bt) return at < bt ? 1 : -1;
    return a.id < b.id ? -1 : 1;
  });
  const source = candidates[0]!;
  const tag = source.equipment_id === null ? '' : (snapshot.equipment.find((row) => row.id === source.equipment_id)?.tag ?? '');
  return { sourceBlockId: source.id, tag };
}

/**
 * "Copiar da última visita": the equipment's last issued plate, keeping only the keys the
 * target definition carries now (AR-24) and the values that say something, the `per_unit`
 * ones included: it is the same equipment (`source-deltas.md` row 50). Never fetches;
 * an equipment row with no `last_nameplate` copies nothing.
 */
export function lastNameplateCopy(equipment: Pick<EquipmentRow, 'last_nameplate'>, definition: BlockDefinition): { fieldKey: string; value: unknown }[] {
  const fields = equipment.last_nameplate?.fields;
  if (fields === undefined) return [];
  const out: { fieldKey: string; value: unknown }[] = [];
  for (const field of definition.nameplate) {
    if (!Object.hasOwn(fields, field.key)) continue;
    const value = fields[field.key];
    if (!isCellFilled({ value: value as JsonValue, source_suggestion_id: null, op_id: '' })) continue;
    out.push({ fieldKey: field.key, value });
  }
  return out;
}

/** The nameplate field the block's TAG prefills. */
const TAG_KEY = 'tag';

/**
 * Story 12.3 (J-09, `source-deltas.md` row 49): the value the nameplate TAG field shows
 * while it has no cell of its own: the block's equipment TAG. A plain value, editable;
 * nothing is written until the engineer types (a typed or cleared cell stops following the
 * block). Null when the definition has no TAG field, the cell exists, or the block has no
 * TAG.
 */
export function nameplateTagPrefill(snapshot: { readonly blocks: readonly BlockRow[]; readonly equipment: readonly Pick<EquipmentRow, 'id' | 'tag'>[] }, blockId: string): string | null {
  const block = snapshot.blocks.find((row) => row.id === blockId);
  if (block === undefined || block.removed_at !== null || block.equipment_id === null) return null;
  const definition = definitionOf(block);
  if (definition === null || !definition.nameplate.some((field) => field.key === TAG_KEY)) return null;
  if (block.sheet.nameplate[TAG_KEY] !== undefined) return null;
  const tag = snapshot.equipment.find((row) => row.id === block.equipment_id)?.tag.trim() ?? '';
  return tag === '' ? null : tag;
}

/** "9 campos copiados", "1 campo copiado". */
export function camposCopiadosText(n: number): string {
  return plural(n, 'campo copiado', 'campos copiados');
}
