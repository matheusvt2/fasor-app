import type { SuggestionRow } from '../schemas/entities.ts';

/*
 * Story 13.5 (WAIT-1, review-field-ux-2026-10-06): a pending reading shows its age and, from
 * 10 s, a way out. The device's sync engine polls every 5 s for the first 120 s of a running
 * reading (`READING_FAST_POLL_WINDOW_MS`), then every 60 s until the result or the failure
 * lands; past that window the line adds a still-reading note, so the slower cadence is never
 * a silent stop. A cancel is device-local (no contract change): the photo stays, and every
 * pending suggestion that reading produces, now or later, is discarded through the existing
 * `discardSuggestionOp` (`cancelledReadingSuggestions` says which).
 */

/** E78-Q8: how long a running reading is polled every 5 s before the cadence falls back to the 60 s interval. */
export const READING_FAST_POLL_WINDOW_MS = 120_000;

/** From this age a pending reading offers "Cancelar". */
export const READING_CANCEL_AFTER_MS = 10_000;

/**
 * The reading's start, as the device knows it: the newest of its capture, the moment the
 * server took its bytes (`bytes_acked_at`: a photo shot offline long ago starts there, not
 * at its capture), its newest pulled status op and a reread asked here.
 */
export function readingStartedAt(input: { captured_at: string; bytes_acked_at?: string | null; reading_status_at?: string | null; reread_at?: string | null }): string {
  let latest = input.captured_at;
  for (const at of [input.bytes_acked_at ?? null, input.reading_status_at ?? null, input.reread_at ?? null]) {
    if (at === null) continue;
    if (Date.parse(at) > Date.parse(latest)) latest = at;
  }
  return latest;
}

/**
 * Review 2026-10-08 (DG-4): where a reading's wait line counts from, or null while the server
 * does not hold the photo's bytes yet. A shot taken offline and sent on reconnect reads
 * "Lendo…" with no age, no "Cancelar" and no still-reading note until the server took its
 * bytes (`bytes_acked_at`, or `uploaded_at` on a photo another device sent), moved its
 * reading (a pulled status op) or was asked again here (`reread_at`); from then on, the
 * newest of those instants and the capture (`readingStartedAt`'s rule).
 */
export function readingWaitStart(input: {
  captured_at: string;
  bytes_acked_at?: string | null;
  uploaded_at?: string | null;
  reading_status_at?: string | null;
  reread_at?: string | null;
}): string | null {
  const held = [input.bytes_acked_at ?? null, input.uploaded_at ?? null, input.reading_status_at ?? null, input.reread_at ?? null].filter((at): at is string => at !== null);
  if (held.length === 0) return null;
  let latest = input.captured_at;
  for (const at of held) if (Date.parse(at) > Date.parse(latest)) latest = at;
  return latest;
}

export interface ReadingWait {
  /** "Lendo…" under 10 s, then "Lendo… 12 s", from a minute "Lendo… 2 min 05 s". */
  text: string;
  /** From 10 s: the line offers "Cancelar". */
  cancellable: boolean;
  /** From 120 s: the line adds the still-reading note (the device now polls every 60 s). */
  stillReading: boolean;
  /**
   * Review F-06: what the line's live region says. Unlike `text` it changes only at the
   * transitions (under 10 s, the 10 s "Cancelar" point, the 120 s still-reading point), so a
   * screen reader is not told every tick of the age.
   */
  announcement: string;
}

const READING = 'Lendo…';
// authored (review F-06): the 10 s transition, "Cancelar" is now offered.
const ANNOUNCE_CANCELLABLE = 'Lendo… já é possível cancelar.';
// authored (review F-06): the 120 s transition, the device now checks every minute.
const ANNOUNCE_STILL_READING = 'Lendo… a leitura está demorando; o app continua conferindo a cada minuto.';

/**
 * The wait line of a pending reading started at `startedAt`, read at `nowIso`. The age is
 * clamped at 0 s (a tablet clock behind the server's never reads a negative age). Review
 * 2026-10-08 (DG-4): a null start (`readingWaitStart`, the server does not hold the bytes
 * yet) is "Lendo…" alone, never cancellable, never still reading.
 */
export function readingWait(startedAt: string | null, nowIso: string): ReadingWait {
  if (startedAt === null) return { text: READING, cancellable: false, stillReading: false, announcement: READING };
  const start = Date.parse(startedAt);
  const now = Date.parse(nowIso);
  const ageMs = Number.isFinite(start) && Number.isFinite(now) ? Math.max(0, now - start) : 0;
  const cancellable = ageMs >= READING_CANCEL_AFTER_MS;
  const stillReading = ageMs >= READING_FAST_POLL_WINDOW_MS;
  if (!cancellable) return { text: READING, cancellable, stillReading, announcement: READING };
  const seconds = Math.floor(ageMs / 1000);
  const elapsed = seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;
  return { text: `${READING} ${elapsed}`, cancellable, stillReading, announcement: stillReading ? ANNOUNCE_STILL_READING : ANNOUNCE_CANCELLABLE };
}

/** The pending suggestions read from a photo whose reading was cancelled on this device: each is discarded. */
export function cancelledReadingSuggestions<T extends Pick<SuggestionRow, 'status' | 'source'>>(pending: readonly T[], cancelledPhotoIds: ReadonlySet<string> | readonly string[]): T[] {
  const cancelled = cancelledPhotoIds instanceof Set ? cancelledPhotoIds : new Set(cancelledPhotoIds as readonly string[]);
  if (cancelled.size === 0) return [];
  return pending.filter((row) => row.status === 'pending' && cancelled.has(row.source.photo_id));
}
