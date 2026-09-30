import type { PhotoFileRow } from '../schemas/entities.ts';

/*
 * Story 11.8 follow-up (`AI_FEATURES`): the reading kinds whose pipeline needs the LLM step
 * (structuring or prose). The api refuses them and the web hides their entry points while the
 * server's AI features are off; `display` is OCR only and stays on. Nothing else decides it.
 */

type PhotoReadingKind = NonNullable<PhotoFileRow['reading_kind']>;

export const AI_READING_KINDS: readonly PhotoReadingKind[] = ['plate', 'panel', 'caption', 'nc_obs'];

export function readingNeedsAi(kind: PhotoReadingKind): boolean {
  return AI_READING_KINDS.includes(kind);
}
