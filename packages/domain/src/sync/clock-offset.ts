import { CLOCK_SKEW_MS } from '../ops/attribution.ts';

/*
 * e20f (2026-11-04, integrated review of 76cbdb79): a device whose clock is wrong stamps ops the
 * server refuses (`op_attribution`, Story 20.8). The device learns how far its clock is from the
 * server's from the HTTP `Date` header every answer carries (no contract field), and stamps with
 * its raw clock plus that offset. The server's check is unchanged.
 */

/**
 * How close two offset estimates must be to count as the same (60 s). The `Date` header has a
 * one-second resolution and a round trip adds its own error; an estimate inside this band of
 * the applied offset changes nothing, so the stamps of one device do not churn their order, and
 * an estimate inside this band of zero is a correct clock (offset 0).
 */
export const CLOCK_OFFSET_TOLERANCE_MS = 60_000;

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
