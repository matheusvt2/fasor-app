import { describe, expect, it } from 'vitest';
import { cancelledReadingSuggestions, READING_CANCEL_AFTER_MS, READING_FAST_POLL_WINDOW_MS, readingStartedAt, readingWait } from './wait.ts';

/*
 * 13.5-UNIT: the wait line of a pending reading (WAIT-1) and the suggestions a cancel discards.
 */

const T0 = '2026-10-07T12:00:00.000Z';
const at = (ms: number) => new Date(Date.parse(T0) + ms).toISOString();

describe('13.5-UNIT the reading wait line', () => {
  it('the thresholds: Cancelar from 10 s, the still-reading note from the end of the 120 s fast-poll window', () => {
    expect(READING_CANCEL_AFTER_MS).toBe(10_000);
    expect(READING_FAST_POLL_WINDOW_MS).toBe(120_000);
  });

  it('reads "Lendo…" under 10 s, with nothing to cancel', () => {
    expect(readingWait(T0, T0)).toEqual({ text: 'Lendo…', cancellable: false, stillReading: false });
    expect(readingWait(T0, at(9_999))).toEqual({ text: 'Lendo…', cancellable: false, stillReading: false });
  });

  it('from 10 s the seconds and Cancelar; from a minute "M min SS s"; from 120 s the still-reading note', () => {
    expect(readingWait(T0, at(10_000))).toEqual({ text: 'Lendo… 10 s', cancellable: true, stillReading: false });
    expect(readingWait(T0, at(12_900))).toEqual({ text: 'Lendo… 12 s', cancellable: true, stillReading: false });
    expect(readingWait(T0, at(59_999)).text).toBe('Lendo… 59 s');
    expect(readingWait(T0, at(60_000)).text).toBe('Lendo… 1 min 00 s');
    expect(readingWait(T0, at(119_999))).toEqual({ text: 'Lendo… 1 min 59 s', cancellable: true, stillReading: false });
    expect(readingWait(T0, at(120_000))).toEqual({ text: 'Lendo… 2 min 00 s', cancellable: true, stillReading: true });
    expect(readingWait(T0, at(125_000)).text).toBe('Lendo… 2 min 05 s');
    expect(readingWait(T0, at(11 * 60_000 + 7_000)).text).toBe('Lendo… 11 min 07 s');
  });

  it('a start ahead of the device clock (server stamp, skewed tablet) reads 0 s, never negative; an unreadable time reads 0 s', () => {
    expect(readingWait(at(30_000), T0)).toEqual({ text: 'Lendo…', cancellable: false, stillReading: false });
    expect(readingWait('not a time', T0).text).toBe('Lendo…');
  });

  it('the start is the newest of the capture, the newest pulled status op and a reread asked here', () => {
    expect(readingStartedAt({ captured_at: T0 })).toBe(T0);
    expect(readingStartedAt({ captured_at: T0, reading_status_at: null, reread_at: null })).toBe(T0);
    expect(readingStartedAt({ captured_at: T0, reading_status_at: at(5_000), reread_at: null })).toBe(at(5_000));
    expect(readingStartedAt({ captured_at: T0, reading_status_at: at(5_000), reread_at: at(9_000) })).toBe(at(9_000));
    // A photo shot offline long ago counts from when the server took its bytes, before any status op.
    expect(readingStartedAt({ captured_at: T0, bytes_acked_at: at(3 * 3_600_000) })).toBe(at(3 * 3_600_000));
    expect(readingStartedAt({ captured_at: T0, bytes_acked_at: at(60_000), reading_status_at: at(65_000) })).toBe(at(65_000));
    expect(readingStartedAt({ captured_at: T0, bytes_acked_at: null })).toBe(T0);
    // A status op stamped before the capture (a skewed clock) does not move the start back.
    expect(readingStartedAt({ captured_at: T0, reading_status_at: at(-5_000) })).toBe(T0);
  });
});

describe('13.5-UNIT the suggestions a cancelled reading discards', () => {
  const row = (photo: string, status: 'pending' | 'confirmed' | 'discarded' = 'pending') => ({ status, source: { photo_id: photo, bbox: [0, 0, 1, 1] as [number, number, number, number], ocr_token_ids: [], reading_run_id: 'r' } });

  it('the pending rows read from a cancelled photo, now or later; the others untouched', () => {
    const rows = [row('a'), row('b'), row('a', 'confirmed'), row('a', 'discarded'), row('c')];
    expect(cancelledReadingSuggestions(rows, ['a'])).toEqual([rows[0]]);
    expect(cancelledReadingSuggestions(rows, new Set(['a', 'c']))).toEqual([rows[0], rows[4]]);
    expect(cancelledReadingSuggestions(rows, [])).toEqual([]);
  });
});
