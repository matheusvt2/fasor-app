import { CLOCK_OFFSET_TOLERANCE_MS, CLOCK_SKEW_MS } from './clock-constants.ts';

/*
 * e20f (2026-11-04, integrated review of 76cbdb79): a device whose clock is wrong stamps ops the
 * server refuses (`op_attribution`, Story 20.8). The device learns how far its clock is from the
 * server's from the HTTP `Date` header every answer carries (no contract field), and stamps with
 * its raw clock plus that offset. The server's check is unchanged.
 */

// E20-A1 (R-12): defined in the leaf `sync/clock-constants.ts`, re-exported here unchanged.
export { CLOCK_OFFSET_TOLERANCE_MS };

/**
 * The server clock minus the device clock, read from one answer: the `Date` header (`serverDate`,
 * whole seconds, so its instant is taken at the middle of its second) against the middle of the
 * request's round trip (`sentAtMs`, `receivedAtMs`, the device's raw clock). Null when the header
 * is absent or unparsable, or when the round trip is negative or longer than
 * `CLOCK_OFFSET_TOLERANCE_MS` (an answer that slow may err by more than the tolerance, so a
 * correct clock behind a slow answer would get an offset and flip back).
 */
export function clockOffsetEstimate(serverDate: string | null, sentAtMs: number, receivedAtMs: number): number | null {
  if (serverDate === null) return null;
  const serverMs = Date.parse(serverDate);
  if (Number.isNaN(serverMs)) return null;
  if (!Number.isFinite(sentAtMs) || !Number.isFinite(receivedAtMs)) return null;
  const roundTrip = receivedAtMs - sentAtMs;
  if (roundTrip < 0 || roundTrip > CLOCK_OFFSET_TOLERANCE_MS) return null;
  return serverMs + 500 - (sentAtMs + roundTrip / 2);
}

/**
 * The offset to apply after an estimate: `applied` when there is no estimate or it lies within
 * `CLOCK_OFFSET_TOLERANCE_MS` of `applied`; otherwise 0 when the estimate lies within the
 * tolerance of zero, else the estimate rounded to the millisecond.
 */
export function nextClockOffset(applied: number, estimate: number | null): number {
  if (estimate === null || !Number.isFinite(estimate)) return applied;
  if (Math.abs(estimate - applied) <= CLOCK_OFFSET_TOLERANCE_MS) return applied;
  if (Math.abs(estimate) <= CLOCK_OFFSET_TOLERANCE_MS) return 0;
  return Math.round(estimate);
}

/**
 * e20f review: the instant the device stamps next, never earlier than the last one it issued in
 * this session. When the applied offset moves back (a device a few minutes fast learns its
 * offset with its own ops still pending), the corrected clock jumps back, and a later edit would
 * sort before an earlier one of the same path (`byClientTsThenOpId`). So while the corrected
 * instant lies behind `lastIssuedMs` by at most `CLOCK_SKEW_MS / 2`, the last issued instant is
 * returned (the clock holds until real time catches up); past that gap (a clock more than five
 * minutes fast, whose pending stamps the server refuses anyway and "Reenviar" stamps again) the
 * corrected instant is returned.
 */
export function monotonicNowMs(lastIssuedMs: number | null, correctedMs: number): number {
  if (lastIssuedMs === null || correctedMs >= lastIssuedMs) return correctedMs;
  return lastIssuedMs - correctedMs <= CLOCK_SKEW_MS / 2 ? lastIssuedMs : correctedMs;
}

/**
 * E20-A1 (R-3, amended in review loop 1): where the device's raw clock stood against its
 * monotonic clock at one instant of a page (both in milliseconds; on the web the monotonic one is
 * the page's monotonic high-resolution time on the raw clock's scale of its load, which a change
 * of the system clock does not move). It is never compared across pages.
 */
export interface ClockOffsetBasis {
  readonly rawMs: number;
  readonly monotonicMs: number;
}

/**
 * E20-A1 (R-3): at load, whether a stored offset learned when the raw clock read `learnedRawMs`
 * no longer holds: the raw clock now reads more than `CLOCK_OFFSET_TOLERANCE_MS` before that
 * instant, so it was set back while the app was closed. A clock set forward while closed cannot
 * be told from time passing and is kept; the next answer corrects it.
 */
export function storedClockOffsetStale(learnedRawMs: number, nowRawMs: number): boolean {
  if (!Number.isFinite(learnedRawMs) || !Number.isFinite(nowRawMs)) return true;
  return nowRawMs < learnedRawMs - CLOCK_OFFSET_TOLERANCE_MS;
}

/**
 * E20-A1 (R-3): within a page, how the raw clock moved against the monotonic one since `anchor`:
 * `stale` when it moved back by more than `CLOCK_OFFSET_TOLERANCE_MS` (the device's clock was set
 * back while the app ran), `forward` when it moved ahead by more (a sleep, since the monotonic
 * clock stops while a tablet sleeps, or a clock set forward: the two cannot be told apart, so the
 * offset is kept and the anchor moves there), else `same`.
 */
export function clockOffsetDrift(anchor: ClockOffsetBasis, current: ClockOffsetBasis): 'same' | 'forward' | 'stale' {
  const values = [anchor.rawMs, anchor.monotonicMs, current.rawMs, current.monotonicMs];
  if (!values.every(Number.isFinite)) return 'stale';
  const drift = current.rawMs - current.monotonicMs - (anchor.rawMs - anchor.monotonicMs);
  if (drift < -CLOCK_OFFSET_TOLERANCE_MS) return 'stale';
  return drift > CLOCK_OFFSET_TOLERANCE_MS ? 'forward' : 'same';
}
