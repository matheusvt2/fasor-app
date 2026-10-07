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

export interface ReadingWait {
  /** "Lendo…" under 10 s, then "Lendo… 12 s", from a minute "Lendo… 2 min 05 s". */
  text: string;
  /** From 10 s: the line offers "Cancelar". */
  cancellable: boolean;
  /** From 120 s: the line adds the still-reading note (the device now polls every 60 s). */
  stillReading: boolean;
}

const READING = 'Lendo…';

/**
 * The wait line of a pending reading started at `startedAt`, read at `nowIso`. The age is
 * clamped at 0 s (a tablet clock behind the server's never reads a negative age).
 */
export function readingWait(startedAt: string, nowIso: string): ReadingWait {
  const start = Date.parse(startedAt);
  const now = Date.parse(nowIso);
  const ageMs = Number.isFinite(start) && Number.isFinite(now) ? Math.max(0, now - start) : 0;
  const cancellable = ageMs >= READING_CANCEL_AFTER_MS;
  const stillReading = ageMs >= READING_FAST_POLL_WINDOW_MS;
  if (!cancellable) return { text: READING, cancellable, stillReading };
  const seconds = Math.floor(ageMs / 1000);
  const elapsed = seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;
  return { text: `${READING} ${elapsed}`, cancellable, stillReading };
}

/** The pending suggestions read from a photo whose reading was cancelled on this device: each is discarded. */
export function cancelledReadingSuggestions<T extends Pick<SuggestionRow, 'status' | 'source'>>(pending: readonly T[], cancelledPhotoIds: ReadonlySet<string> | readonly string[]): T[] {
  const cancelled = cancelledPhotoIds instanceof Set ? cancelledPhotoIds : new Set(cancelledPhotoIds as readonly string[]);
  if (cancelled.size === 0) return [];
  return pending.filter((row) => row.status === 'pending' && cancelled.has(row.source.photo_id));
}
