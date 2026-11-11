import { isEquipmentKind } from '../schemas/block-config.ts';
import type { BlockRow, EquipmentRow, LocationRow } from '../schemas/entities.ts';
import { liveLocationIds } from './location-live.ts';
import { typeVersionOf } from '../schemas/block-config.ts';
import { type DefinitionContext } from '../seed/definitions.ts';
import { blockTypeLabelIn, locationChoices, newBlockOrderKey, type LocationChoice } from './tree.ts';
import { type TagLocation } from './tag.ts';

/*
 * Story 11.2 (FR-20): "Mover para…" moves an equipment block to another live location in
 * one batch: `block/{id}/location_id`, `block/{id}/order_key` (last in the target) and,
 * when the engineer accepts the re-suggestion, `equipment/{id}/tag`. The sheet, its photos,
 * checks, measurements and observations hang off the block id, so they follow it. The
 * targets, the TAG re-suggestion, its question and every sentence the move says are
 * composed here (AD-1/AD-13); the surface writes the ops only. Story 24.8 (batch e24b): the
 * re-suggestion is gone (`moveTagSuggestion`); a move writes the block's two fields only.
 */

/**
 * The locations a block can move to: every live local and coluna in tree order, labelled
 * by its path ("1° Subsolo › Coluna 9"), the block's own location left out. A painel is
 * never one (`locationChoices`): it only groups colunas.
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
 * The TAG rename a move offers. Story 24.8 (batch e24b): always null. The suggestion is
 * `PREFIX-NN` free in the obra and no longer depends on the local, so a move has no TAG of the
 * target to offer, for any type, and the Move dialog shows no rename checkbox. The equipment's
 * reuse key (Story 24.21) keeps the old local's code: a moved sheet's equipment is still found
 * by the template's placement it was born at. It takes no input: nothing of the block or the
 * target enters the answer any more.
 */
export function moveTagSuggestion(): MoveTagSuggestion | null {
  return null;
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
  | { kind: 'refused'; reason: 'gone' | 'location-gone' | 'same-location' | 'not-a-block-location' };

/**
 * The move of `blockId` to `targetId` on fresh rows: refused when the block is no longer a
 * live equipment block, when the target is no longer a live location, when the target is a
 * painel (`not-a-block-location`, Story 14.2: a painel takes no block), or when the block
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
  /** Story 14.6: the company's type versions, naming a company block without a TAG; seeded types only when omitted. */
  definitions: DefinitionContext;
}): MovePlan {
  const block = input.blocks.find((row) => row.id === input.blockId && row.removed_at === null);
  // Story 14.6: a company type's sheet moves as any other; its TAG is never renamed by the move (no prefix without its definition).
  if (block === undefined || block.location_id === null || !isEquipmentKind(block.block_type)) return { kind: 'refused', reason: 'gone' };
  // Live by the tree's rule: a target removed, or under a removed location, is gone.
  const target = liveLocationIds(input.locations).has(input.targetId) ? input.locations.find((row) => row.id === input.targetId) : undefined;
  if (target === undefined) return { kind: 'refused', reason: 'location-gone' };
  if (target.kind === 'painel') return { kind: 'refused', reason: 'not-a-block-location' };
  if (block.location_id === target.id) return { kind: 'refused', reason: 'same-location' };
  const own = block.equipment_id === null ? undefined : input.equipment.find((row) => row.id === block.equipment_id && row.removed_at === null);
  // Story 24.8: no move renames a TAG any more (`moveTagSuggestion`); `rename` is read as before.
  const suggestion = input.rename ? moveTagSuggestion() : null;
  const rename = suggestion === null || own === undefined ? null : { equipmentId: own.id, tag: suggestion.tag };
  // The name the sentence gives the block: its TAG, else (no live equipment row here, or a
  // blank TAG) the seed's name of its type, never the raw slug.
  const current = rename?.tag ?? own?.tag ?? '';
  const tag = current.trim() === '' ? blockTypeLabelIn(input.definitions, block.seed_version, block.block_type, typeVersionOf(block.config)) : current;
  return {
    kind: 'move',
    blockId: block.id,
    targetId: target.id,
    orderKey: newBlockOrderKey(input.blocks, target.id, null),
    rename,
    text: blockMovedToText(tag, { kind: target.kind, name: target.name }),
  };
}
