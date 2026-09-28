import { z } from 'zod';
import { uuidV7Schema } from '../ids.ts';

/*
 * Story 8.4: what a plate photo's `reading_target` names (the row keeps it as untyped JSON,
 * contract 5). The device writes it at capture with `plateReadingTarget` (batch P); the
 * reading job parses it with `plateReadingTargetSchema` and refuses a photo whose target
 * does not parse. Extra keys are kept (the entity's contract says `{block_id, block_type, ...}`).
 */

export const plateReadingTargetSchema = z.looseObject({
  block_id: uuidV7Schema,
  block_type: z.string().min(1),
});
export type PlateReadingTarget = z.infer<typeof plateReadingTargetSchema>;

/** The `reading_target` of a plate photo taken for `blockId`. */
export function plateReadingTarget(blockId: string, blockType: string): PlateReadingTarget {
  return { block_id: blockId, block_type: blockType };
}

/*
 * Story 9.1: what a display photo's `reading_target` names. A shot of a Measurement table
 * ("Ler visor" on a table) names its block, the test (`table_key` holds the seed test key,
 * Conflict 4 of the Epic 9 context) and the cell the values start at (`start_cell`, the op
 * path's row across the test's tables and column). A shot of the thermo-hygrometer ("Ler
 * visor" in "Da cabine") names only its cabine. Extra keys are kept.
 */

const cellIndexSchema = z.number().int().nonnegative();

export const displayCellTargetSchema = z.looseObject({
  block_id: uuidV7Schema,
  block_type: z.string().min(1),
  table_key: z.string().min(1),
  start_cell: z.object({ row: cellIndexSchema, col: cellIndexSchema }),
});
export type DisplayCellTarget = z.infer<typeof displayCellTargetSchema>;

export const displayEnvTargetSchema = z.looseObject({ location_id: uuidV7Schema });
export type DisplayEnvTarget = z.infer<typeof displayEnvTargetSchema>;

export const displayReadingTargetSchema = z.union([displayCellTargetSchema, displayEnvTargetSchema]);
export type DisplayReadingTarget = z.infer<typeof displayReadingTargetSchema>;

/** The `reading_target` of a display shot of a Measurement table: the values start at `start`. */
export function displayCellTarget(blockId: string, blockType: string, testKey: string, start: { row: number; col: number }): DisplayCellTarget {
  return { block_id: blockId, block_type: blockType, table_key: testKey, start_cell: { row: start.row, col: start.col } };
}

/** The `reading_target` of a thermo-hygrometer shot of a cabine. */
export function displayEnvTarget(locationId: string): DisplayEnvTarget {
  return { location_id: locationId };
}

/** True for a cell target (a Measurement table), false for a cabine's environment. */
export function isDisplayCellTarget(target: DisplayReadingTarget): target is DisplayCellTarget {
  return 'block_id' in target && typeof (target as { block_id?: unknown }).block_id === 'string' && 'start_cell' in target;
}

/*
 * Story 9.5: what an NC row's photo `reading_target` names (the draft of that row's
 * observation, `reading_kind: nc_obs`): the block, its type and the checklist item. Extra
 * keys are kept.
 */
export const ncObsReadingTargetSchema = z.looseObject({
  block_id: uuidV7Schema,
  block_type: z.string().min(1),
  item_key: z.string().min(1),
});
export type NcObsReadingTarget = z.infer<typeof ncObsReadingTargetSchema>;

/**
 * The pg-boss `singletonKey` of a reading job: one queued and one active job per
 * `(photo, kind)` under the queue's `stately` policy.
 */
export function readingSingletonKey(photoId: string, readingKind: string): string {
  return `${photoId}:${readingKind}`;
}
