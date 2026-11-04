import { describe, expect, it } from 'vitest';
import { CLOCK_SKEW_MS } from '../ops/attribution.ts';
import * as constants from './clock-constants.ts';
import { CLOCK_OFFSET_TOLERANCE_MS, clockOffsetDrift, clockOffsetEstimate, monotonicNowMs, nextClockOffset, storedClockOffsetStale } from './clock-offset.ts';

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

describe('clockOffsetDrift (E20-A1, R-3, review loop 1)', () => {
  const anchor = { rawMs: SERVER_MS, monotonicMs: 1_000 };
  it('is the same while both clocks move together, whatever time passes, and within the tolerance', () => {
    expect(clockOffsetDrift(anchor, { rawMs: SERVER_MS + 86_400_000, monotonicMs: 1_000 + 86_400_000 })).toBe('same');
    expect(clockOffsetDrift(anchor, { rawMs: SERVER_MS + CLOCK_OFFSET_TOLERANCE_MS, monotonicMs: 1_000 })).toBe('same');
    expect(clockOffsetDrift(anchor, { rawMs: SERVER_MS - CLOCK_OFFSET_TOLERANCE_MS, monotonicMs: 1_000 })).toBe('same');
  });

  it('a 2-hour sleep (the raw clock runs, the monotonic one stops) is a forward drift, kept', () => {
    expect(clockOffsetDrift(anchor, { rawMs: SERVER_MS + 2 * 3_600_000, monotonicMs: 1_000 })).toBe('forward');
  });

  it('a clock set back while running is stale; so is a reading that is not finite', () => {
    expect(clockOffsetDrift(anchor, { rawMs: SERVER_MS - CLOCK_OFFSET_TOLERANCE_MS - 1, monotonicMs: 1_000 })).toBe('stale');
    expect(clockOffsetDrift(anchor, { rawMs: SERVER_MS - 30 * 60_000, monotonicMs: 1_000 + 5_000 })).toBe('stale');
    expect(clockOffsetDrift(anchor, { rawMs: Number.NaN, monotonicMs: 0 })).toBe('stale');
  });
});

describe('storedClockOffsetStale (E20-A1, R-3, review loop 1)', () => {
  it('at load, drops an offset only when the raw clock reads before the learned instant past the tolerance (set back while closed)', () => {
    expect(storedClockOffsetStale(SERVER_MS, SERVER_MS - 30 * 60_000)).toBe(true);
    expect(storedClockOffsetStale(SERVER_MS, SERVER_MS - CLOCK_OFFSET_TOLERANCE_MS)).toBe(false);
    expect(storedClockOffsetStale(SERVER_MS, SERVER_MS + 3 * 86_400_000)).toBe(false);
    expect(storedClockOffsetStale(Number.NaN, SERVER_MS)).toBe(true);
  });
});

describe('the clock windows (E20-A1, R-12)', () => {
  it('live in a leaf module, re-exported unchanged by the modules that used to define them', () => {
    expect(CLOCK_OFFSET_TOLERANCE_MS).toBe(constants.CLOCK_OFFSET_TOLERANCE_MS);
    expect(CLOCK_SKEW_MS).toBe(constants.CLOCK_SKEW_MS);
    expect([constants.CLOCK_SKEW_MS, constants.CLOCK_OFFSET_TOLERANCE_MS]).toEqual([600_000, 60_000]);
  });
});
