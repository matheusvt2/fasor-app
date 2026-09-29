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
 */

/** The `reading_status` a `reading_kind` put writes with it, or nothing. */
export function readingKindPutStatus(current: { reading_kind?: unknown }, value: unknown): { reading_status: 'queued' | 'none' } | Record<string, never> {
  if (value === null || value === undefined) return { reading_status: 'none' };
  return value === current.reading_kind ? {} : { reading_status: 'queued' };
}

/** Whether a client may put `reading_kind = value` on this photo row (null when the row is absent). */
export function clientReadingKindPutAllowed(photo: { kind?: unknown; reading_kind?: unknown } | null | undefined, value: unknown): boolean {
  if (value === null) return true;
  return value === 'plate' && photo != null && photo.kind === 'photo' && photo.reading_kind === 'panel';
}
