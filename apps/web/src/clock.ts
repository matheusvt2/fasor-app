import { clockOffsetEstimate, monotonicNowMs, nextClockOffset, type Clock } from '@app/domain';

/*
 * The one place apps/web reads the clock (TC-1); everything else takes `now` from here.
 *
 * e20f (2026-11-04): `now` is the device's clock corrected by the offset learned from the
 * server's `Date` header (`learnServerClock`, called by the sync client on every answer), so a
 * tablet whose clock is wrong still stamps ops the server accepts (Story 20.8). The offset is kept
 * in localStorage so an offline boot stamps with the last one learned at once.
 */

const OFFSET_KEY = 'releng.clock-offset';

function readStoredOffset(): number {
  try {
    const raw = window.localStorage.getItem(OFFSET_KEY);
    if (raw === null) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  } catch {
    return 0;
  }
}

function writeStoredOffset(offset: number): void {
  try {
    if (offset === 0) window.localStorage.removeItem(OFFSET_KEY);
    else window.localStorage.setItem(OFFSET_KEY, String(offset));
  } catch {
    // Private mode or blocked storage: the offset still applies for this session.
  }
}

let appliedOffset = readStoredOffset();

/** The device's own clock, uncorrected, in milliseconds: what the sync client times a round trip with. */
export function rawNowMs(): number {
  return Date.now();
}

/** The offset `now` adds to the device's clock (the server's clock minus the device's), in milliseconds. */
export function clockOffsetMs(): number {
  return appliedOffset;
}

/** The last instant `now` returned in this session: the corrected clock never runs back past it by a small step (`monotonicNowMs`). */
let lastIssuedMs: number | null = null;

export const now: Clock = () => {
  const issued = monotonicNowMs(lastIssuedMs, rawNowMs() + appliedOffset);
  lastIssuedMs = issued;
  return new Date(issued);
};

/**
 * One server answer's `Date` header, with the raw instants the request was sent and its answer
 * received: the kernel says whether the applied offset moves (`nextClockOffset`), and a new one is
 * kept for the next boot.
 */
export function learnServerClock(serverDate: string | null, sentAtMs: number, receivedAtMs: number): void {
  const next = nextClockOffset(appliedOffset, clockOffsetEstimate(serverDate, sentAtMs, receivedAtMs));
  if (next === appliedOffset) return;
  appliedOffset = next;
  writeStoredOffset(next);
}
