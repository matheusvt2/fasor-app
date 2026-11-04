import { clockOffsetDrift, clockOffsetEstimate, monotonicNowMs, nextClockOffset, storedClockOffsetStale, type ClockOffsetBasis, type Clock } from '@app/domain';

/*
 * The one place apps/web reads the clock (TC-1); everything else takes `now` from here.
 *
 * e20f (2026-11-04): `now` is the device's clock corrected by the offset learned from the
 * server's `Date` header (`learnServerClock`, called by the sync client on every answer), so a
 * tablet whose clock is wrong still stamps ops the server accepts (Story 20.8). The offset is kept
 * in localStorage so an offline boot stamps with the last one learned at once.
 *
 * E20-A1 (R-3, amended in review loop 1): the offset is kept with the raw instant it was learned
 * or last confirmed at, in one value (`{"offset":…,"rawMs":…}`; a plain number is the format kept
 * before, still read). It is dropped at load when the raw clock now reads before that instant by
 * more than the tolerance (set back while the app was closed), and within a page when the raw
 * clock moved back against the monotonic one (set back while it ran): `storedClockOffsetStale`,
 * `clockOffsetDrift`. A forward drift (a sleep stops the monotonic clock) keeps it. Durations (an
 * idle timer, a "never arrived" expiry, a poll window) read `elapsedNowMs`, never the corrected
 * `now`, so a learned jump neither fires nor freezes them.
 */

const OFFSET_KEY = 'releng.clock-offset';

/** The device's own clock, uncorrected, in milliseconds: what the sync client times a round trip with. */
export function rawNowMs(): number {
  return Date.now();
}

/** A monotonic clock in milliseconds, for durations only: it never jumps when the system clock is set, and it is not an instant. */
export function elapsedNowMs(): number {
  return performance.now();
}

/**
 * The monotonic clock on the raw clock's scale: the raw instant this module loaded at, plus the
 * monotonic time elapsed since. The two move apart only when the system clock is set, or while
 * the device sleeps (the monotonic clock stops).
 */
const monotonicOrigin = rawNowMs() - elapsedNowMs();

/** Where the raw clock stands against the monotonic one now (`ClockOffsetBasis`). */
function basisNow(): ClockOffsetBasis {
  return { rawMs: rawNowMs(), monotonicMs: monotonicOrigin + elapsedNowMs() };
}

/** The stored offset and the raw instant it was learned at (null for the plain number kept before E20-A1). */
function readStored(): { offset: number; rawMs: number | null } {
  try {
    const raw = window.localStorage.getItem(OFFSET_KEY);
    if (raw === null) return { offset: 0, rawMs: null };
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'number') return { offset: Number.isFinite(parsed) ? Math.round(parsed) : 0, rawMs: null };
    const record = parsed as { offset?: unknown; rawMs?: unknown } | null;
    if (typeof record?.offset !== 'number' || !Number.isFinite(record.offset)) return { offset: 0, rawMs: null };
    return { offset: Math.round(record.offset), rawMs: typeof record.rawMs === 'number' ? record.rawMs : null };
  } catch {
    return { offset: 0, rawMs: null };
  }
}

function writeStored(offset: number, rawMs: number): void {
  try {
    if (offset === 0) window.localStorage.removeItem(OFFSET_KEY);
    else window.localStorage.setItem(OFFSET_KEY, JSON.stringify({ offset, rawMs }));
  } catch {
    // Private mode or blocked storage: the offset still applies for this session.
  }
}

const stored = readStored();
let appliedOffset = stored.offset;
// At load: set back while the app was closed, the offset is dropped.
if (appliedOffset !== 0 && stored.rawMs !== null && storedClockOffsetStale(stored.rawMs, rawNowMs())) {
  appliedOffset = 0;
  writeStored(0, rawNowMs());
}
/** The in-page anchor of the drift check, taken at load: a monotonic value from another page is never compared. */
let anchor: ClockOffsetBasis = basisNow();

/** Drops the applied offset when the device's clock was set back while the app ran (`clockOffsetDrift`); a forward drift moves the anchor. */
function dropStaleOffset(): void {
  if (appliedOffset === 0) return;
  const current = basisNow();
  const drift = clockOffsetDrift(anchor, current);
  if (drift === 'same') return;
  anchor = current;
  if (drift === 'forward') return;
  appliedOffset = 0;
  writeStored(0, current.rawMs);
}

/** The offset `now` adds to the device's clock (the server's clock minus the device's), in milliseconds. */
export function clockOffsetMs(): number {
  dropStaleOffset();
  return appliedOffset;
}

/** The last instant `now` returned in this session: the corrected clock never runs back past it by a small step (`monotonicNowMs`). */
let lastIssuedMs: number | null = null;

export const now: Clock = () => {
  dropStaleOffset();
  const issued = monotonicNowMs(lastIssuedMs, rawNowMs() + appliedOffset);
  lastIssuedMs = issued;
  return new Date(issued);
};

/**
 * One server answer's `Date` header, with the raw instants the request was sent and its answer
 * received: the kernel says whether the applied offset moves (`nextClockOffset`), and a new one is
 * kept for the next boot. E20-A1: an answer that confirms the applied offset also moves its raw
 * instant and the in-page anchor to now, so both checks measure from the latest confirmation.
 */
export function learnServerClock(serverDate: string | null, sentAtMs: number, receivedAtMs: number): void {
  dropStaleOffset();
  const estimate = clockOffsetEstimate(serverDate, sentAtMs, receivedAtMs);
  if (estimate === null) return;
  const next = nextClockOffset(appliedOffset, estimate);
  anchor = basisNow();
  if (next === appliedOffset && next === 0) return;
  appliedOffset = next;
  writeStored(next, anchor.rawMs);
}
