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

/**
 * The pg-boss `singletonKey` of a reading job: one queued and one active job per
 * `(photo, kind)` under the queue's `stately` policy.
 */
export function readingSingletonKey(photoId: string, readingKind: string): string {
  return `${photoId}:${readingKind}`;
}
