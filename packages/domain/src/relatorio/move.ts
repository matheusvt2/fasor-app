import { isEquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, EquipmentRow, LocationRow } from '../schemas/entities.ts';
import { blockTypeLabel, locationChoices, newBlockOrderKey, type LocationChoice } from './tree.ts';
import { normalizeTag, suggestTag, type TagLocation } from './tag.ts';

/*
 * Story 11.2 (FR-20): "Mover para…" moves an equipment block to another live location in
 * one batch: `block/{id}/location_id`, `block/{id}/order_key` (last in the target) and,
 * when the engineer accepts the re-suggestion, `equipment/{id}/tag`. The sheet, its photos,
 * checks, measurements and observations hang off the block id, so they follow it. The
 * targets, the TAG re-suggestion, its question and every sentence the move says are
 * composed here (AD-1/AD-13); the surface writes the ops only.
 */

/**
 * The locations a block can move to: every live cabine and coluna in tree order, labelled
 * by its path ("1° Subsolo › Coluna 9"), the block's own location left out.
 */
export function moveTargets(locations: readonly LocationRow[], block: Pick<BlockRow, 'location_id'>): LocationChoice[] {
  return locationChoices(locations).filter((choice) => choice.id !== block.location_id);
}

/** The Move dialog's question once a target is picked: "Sugerir TAG para Coluna 9?" (FR-20). */
export function moveTagQuestion(location: Pick<TagLocation, 'name'>): string {
  return `Sugerir TAG para ${location.name}?`;
}

/** The Move dialog's rename checkbox: "Renomear para SEC-C09". authored. */
export function renameToText(tag: string): string {
  return `Renomear para ${tag}`;
}

/**
 * The move's announcement and toast: "SEC-C05 movida para a Coluna 9" for a coluna, a
 * cabine's name without the article ("DJ-OXIGENIO movida para Oxigênio"), as
 * `blockCreatedText` words it. authored.
 */
export function blockMovedToText(tag: string, location: TagLocation): string {
  return location.kind === 'coluna' ? `${tag} movida para a ${location.name}` : `${tag} movida para ${location.name}`;
}

/** The TAG a move re-suggests, with the dialog's question and the rename checkbox's label. */
export interface MoveTagSuggestion {
  tag: string;
  question: string;
  renameLabel: string;
}

/**
 * The TAG the block would get in `target` (`suggestTag`, free among the project's live
 * equipment other than its own row), or null when there is nothing to offer: a section
 * block, a transformer (its `TR-n` never depends on the location), a block with no
 * equipment row here, or a suggestion equal to the current TAG.
 */
export function moveTagSuggestion(
  block: Pick<BlockRow, 'block_type' | 'equipment_id'>,
  equipment: Pick<EquipmentRow, 'id' | 'tag' | 'removed_at'> | undefined,
  target: TagLocation,
  allEquipment: readonly Pick<EquipmentRow, 'id' | 'tag' | 'removed_at'>[],
): MoveTagSuggestion | null {
  if (!isEquipmentBlockType(block.block_type) || block.block_type === 'transformador_forca') return null;
  if (equipment === undefined || block.equipment_id === null || equipment.id !== block.equipment_id) return null;
  const others = allEquipment.filter((row) => row.id !== equipment.id);
  const tag = suggestTag(block.block_type, { kind: target.kind, name: target.name }, others);
  if (normalizeTag(tag) === normalizeTag(equipment.tag)) return null;
  return { tag, question: moveTagQuestion(target), renameLabel: renameToText(tag) };
}

/** What one move writes, computed on the rows as they are at commit time. */
export type MovePlan =
  | {
      kind: 'move';
      blockId: string;
      targetId: string;
      /** The block's `order_key` in the target: after its last live block. */
      orderKey: string;
      /** The equipment renamed with the move, or null when the TAG stays. */
      rename: { equipmentId: string; tag: string } | null;
      /** The announcement and toast, naming the TAG the block has after the move. */
      text: string;
    }
  | { kind: 'refused'; reason: 'gone' | 'location-gone' | 'same-location' };

/**
 * The move of `blockId` to `targetId` on fresh rows: refused when the block is no longer a
 * live equipment block, when the target is no longer a live location, or when the block
 * already sits there; otherwise its new `order_key` and, with `rename`, the TAG suggestion
 * recomputed now (a TAG taken meanwhile yields the next free one; none left to offer, no
 * rename).
 */
export function movePlan(input: {
  blocks: readonly BlockRow[];
  locations: readonly LocationRow[];
  equipment: readonly Pick<EquipmentRow, 'id' | 'tag' | 'removed_at'>[];
  blockId: string;
  targetId: string;
  rename: boolean;
}): MovePlan {
  const block = input.blocks.find((row) => row.id === input.blockId && row.removed_at === null);
  if (block === undefined || block.location_id === null || !isEquipmentBlockType(block.block_type)) return { kind: 'refused', reason: 'gone' };
  const target = input.locations.find((row) => row.id === input.targetId && row.removed_at === null);
  if (target === undefined) return { kind: 'refused', reason: 'location-gone' };
  if (block.location_id === target.id) return { kind: 'refused', reason: 'same-location' };
  const own = block.equipment_id === null ? undefined : input.equipment.find((row) => row.id === block.equipment_id && row.removed_at === null);
  const suggestion = input.rename ? moveTagSuggestion(block, own, target, input.equipment) : null;
  const rename = suggestion === null || own === undefined ? null : { equipmentId: own.id, tag: suggestion.tag };
  // The name the sentence gives the block: its TAG, else (no live equipment row here, or a
  // blank TAG) the seed's name of its type, never the raw slug.
  const current = rename?.tag ?? own?.tag ?? '';
  const tag = current.trim() === '' ? blockTypeLabel(block.seed_version, block.block_type) : current;
  return {
    kind: 'move',
    blockId: block.id,
    targetId: target.id,
    orderKey: newBlockOrderKey(input.blocks, target.id, null),
    rename,
    text: blockMovedToText(tag, { kind: target.kind, name: target.name }),
  };
}
