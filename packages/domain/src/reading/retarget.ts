import { captionSkipReason, type CaptionCandidate } from './prose.ts';

/*
 * E9-Q2/Q3 (contract 9): the rules of a `file/{id}/reading_kind` put, once for the device and
 * the server.
 *
 * - `readingKindPutStatus` is what the put does to `reading_status` (`applyOp`): a kind that
 *   differs from the stored one queues the photo's reading; the same kind again changes
 *   nothing (never a second paid reading); null leaves the photo a plain one (`none`). It never
 *   refuses: a replay on the device must always apply.
 * - `clientReadingKindPutAllowed` is which puts a client may push at all (the push route's
 *   refusal, `op_invalid`): exactly the Story 9.2 re-target of a panel photo to its new block's
 *   plate (`panel` -> `plate`, allowed while the panel reading runs: that job ends superseded)
 *   and the undo of it (null). Any other kind, or `plate` on a photo that is not a panel one,
 *   is refused.
 * - Contract 14 (ledger 1131, batch C): a gallery import batch creates its photos with no
 *   reading and asks for the caption reading once the batch is answered, so a client may also
 *   put `caption` on a photo with no reading yet (`reading_kind` null, `reading_status: none`)
 *   and no context (`captionSkipReason` null: no sheet, no caption, no "Pessoas na foto" mark).
 *   A marked photo, or one already read, can never be queued by a client.
 */

/** The `reading_status` a `reading_kind` put writes with it, or nothing. */
export function readingKindPutStatus(current: { reading_kind?: unknown }, value: unknown): { reading_status: 'queued' | 'none' } | Record<string, never> {
  if (value === null || value === undefined) return { reading_status: 'none' };
  return value === current.reading_kind ? {} : { reading_status: 'queued' };
}

/** The photo row fields `clientReadingKindPutAllowed` reads. */
export type ReadingKindPutPhoto = {
  kind?: unknown;
  reading_kind?: unknown;
  reading_status?: unknown;
  block_id?: unknown;
  caption?: unknown;
  people_in_photo?: unknown;
};

/** Whether a client may put `reading_kind = value` on this photo row (null when the row is absent). */
export function clientReadingKindPutAllowed(photo: ReadingKindPutPhoto | null | undefined, value: unknown): boolean {
  if (value === null) return true;
  if (photo == null || photo.kind !== 'photo') return false;
  if (value === 'plate') return photo.reading_kind === 'panel';
  if (value === 'caption') return captionPutAllowed(photo);
  return false;
}

function captionPutAllowed(photo: ReadingKindPutPhoto): boolean {
  if ((photo.reading_kind ?? null) !== null || photo.reading_status !== 'none') return false;
  if (photo.caption !== undefined && photo.caption !== null && typeof photo.caption !== 'string') return false;
  const candidate: CaptionCandidate = {
    block_id: (photo.block_id ?? null) as CaptionCandidate['block_id'],
    caption: (photo.caption ?? null) as CaptionCandidate['caption'],
    people_in_photo: photo.people_in_photo === true,
  };
  return captionSkipReason(candidate) === null;
}
