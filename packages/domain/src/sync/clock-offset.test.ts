import { describe, expect, it } from 'vitest';
import { CLOCK_SKEW_MS } from '../ops/attribution.ts';
import { CLOCK_OFFSET_TOLERANCE_MS, clockOffsetEstimate, monotonicNowMs, nextClockOffset } from './clock-offset.ts';

/* e20f (2026-11-04): the device learns its clock offset from the server's Date header. */

const SERVER = 'Wed, 04 Nov 2026 07:49:09 GMT';
const SERVER_MS = Date.parse(SERVER);

describe('clockOffsetEstimate', () => {
  it('is the server instant at the middle of its second minus the middle of the round trip', () => {
    // A device 30 min fast: it sent at server + 30 min and heard back 200 ms later.
    const sent = SERVER_MS + 30 * 60_000;
    expect(clockOffsetEstimate(SERVER, sent, sent + 200)).toBe(-30 * 60_000 + 500 - 100);
    // A device 3 days slow.
    const slow = SERVER_MS - 3 * 86_400_000;
    expect(clockOffsetEstimate(SERVER, slow, slow)).toBe(3 * 86_400_000 + 500);
    // A correct clock reads within a second of zero.
    expect(Math.abs(clockOffsetEstimate(SERVER, SERVER_MS + 400, SERVER_MS + 600)!)).toBeLessThan(1000);
  });

  it('is null with no header, an unparsable one, a negative round trip, or one longer than the tolerance', () => {
    expect(clockOffsetEstimate(null, 0, 10)).toBeNull();
    expect(clockOffsetEstimate('', 0, 10)).toBeNull();
    expect(clockOffsetEstimate('not a date', 0, 10)).toBeNull();
    expect(clockOffsetEstimate(SERVER, SERVER_MS, SERVER_MS - 1)).toBeNull();
    expect(clockOffsetEstimate(SERVER, SERVER_MS, SERVER_MS + 60_000)).not.toBeNull();
    expect(clockOffsetEstimate(SERVER, SERVER_MS, SERVER_MS + 60_001)).toBeNull();
  });
});

describe('nextClockOffset', () => {
  it('keeps the applied offset with no estimate', () => {
    expect(nextClockOffset(0, null)).toBe(0);
    expect(nextClockOffset(-1_800_000, null)).toBe(-1_800_000);
  });

  it('keeps the applied offset for an estimate within the tolerance of it, equal included (no ordering churn)', () => {
    expect(CLOCK_OFFSET_TOLERANCE_MS).toBe(60_000);
    const applied = -1_800_000;
    expect(nextClockOffset(applied, applied)).toBe(applied);
    expect(nextClockOffset(applied, applied + CLOCK_OFFSET_TOLERANCE_MS)).toBe(applied);
    expect(nextClockOffset(applied, applied - CLOCK_OFFSET_TOLERANCE_MS)).toBe(applied);
    expect(nextClockOffset(applied, applied + CLOCK_OFFSET_TOLERANCE_MS + 1)).toBe(applied + CLOCK_OFFSET_TOLERANCE_MS + 1);
    expect(nextClockOffset(applied, applied - CLOCK_OFFSET_TOLERANCE_MS - 1)).toBe(applied - CLOCK_OFFSET_TOLERANCE_MS - 1);
  });

  it('is 0 for an estimate within the tolerance of zero (a small true skew), and the rounded estimate otherwise', () => {
    expect(nextClockOffset(-1_800_000, 0)).toBe(0);
    expect(nextClockOffset(-1_800_000, CLOCK_OFFSET_TOLERANCE_MS)).toBe(0);
    expect(nextClockOffset(-1_800_000, -CLOCK_OFFSET_TOLERANCE_MS)).toBe(0);
    expect(nextClockOffset(0, CLOCK_OFFSET_TOLERANCE_MS + 1)).toBe(CLOCK_OFFSET_TOLERANCE_MS + 1);
    expect(nextClockOffset(0, -CLOCK_OFFSET_TOLERANCE_MS - 1)).toBe(-CLOCK_OFFSET_TOLERANCE_MS - 1);
    expect(nextClockOffset(0, -1_799_600.4)).toBe(-1_799_600);
    expect(nextClockOffset(0, 259_200_500)).toBe(259_200_500);
  });
});

describe('monotonicNowMs (e20f review)', () => {
  const LAST = 1_000_000_000;
  it('is the corrected instant with nothing issued yet, or when it is not behind the last one issued', () => {
    expect(monotonicNowMs(null, LAST - 5)).toBe(LAST - 5);
    expect(monotonicNowMs(LAST, LAST)).toBe(LAST);
    expect(monotonicNowMs(LAST, LAST + 1)).toBe(LAST + 1);
  });

  it('holds the last issued instant while the corrected one is behind it by at most half the skew, and jumps past that gap', () => {
    expect(CLOCK_SKEW_MS / 2).toBe(300_000);
    expect(monotonicNowMs(LAST, LAST - 1)).toBe(LAST);
    expect(monotonicNowMs(LAST, LAST - CLOCK_SKEW_MS / 2)).toBe(LAST);
    expect(monotonicNowMs(LAST, LAST - CLOCK_SKEW_MS / 2 - 1)).toBe(LAST - CLOCK_SKEW_MS / 2 - 1);
  });
});
