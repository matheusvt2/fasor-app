import { lateOpCount, SYNC_LATE_AFTER_MS, syncLateAt } from '@app/domain';
import { useEffect, useRef, useState } from 'react';
import { elapsedNowMs, now } from '../clock.ts';

/*
 * Story 25.3 (M03): how many of the device's waiting ops (`pending`, `sent`) have waited more than one
 * minute, by the kernel's rule (`lateOpCount`), re-read by one timer at the instant the next one turns
 * late (`syncLateAt`), so the badge flips at 60 001 ms without waiting for another render. The rows are
 * the provider's live outbox; acked or dead rows never count. `sinceMs`: when the device last became
 * able to send (online, reaching the server, not paused); a wait counts from it at the earliest.
 *
 * Fix batch e25x (A5, A7, Design Notes D3): a wait is a duration, so it is counted on the late clock, a
 * monotonic clock (`elapsedNowMs`) from a constant origin. `client_ts` is an instant of the corrected
 * clock: each waiting row is read against the corrected clock once, the first time this hook sees it,
 * and counted on from there with the late clock, so a learned clock offset or a set clock never moves a
 * wait already counted. The kernel gets those wait starts as ISO instants on the late clock's scale.
 */

/** The late clock's origin: a constant instant, so a wait start on its scale is an ISO instant the kernel parses. */
const LATE_CLOCK_ORIGIN_MS = Date.UTC(2000, 0, 1);

/** Fix batch e25x: the late clock, for durations only (never an instant to show or store). */
export function lateClockMs(): number {
  return LATE_CLOCK_ORIGIN_MS + elapsedNowMs();
}

/**
 * Fix batch e25x (A5): when the device last became able to send, on the late clock, computed in the
 * render itself: the first render and every change of `canSend` from false to true take the late clock
 * now. No state and no effect, so no render ever pairs `canSend` with an older instant.
 */
export function useCanSendSince(canSend: boolean): number {
  const seen = useRef<{ could: boolean; since: number } | null>(null);
  let state = seen.current;
  if (state === null || (canSend && !state.could)) state = { could: canSend, since: lateClockMs() };
  else if (state.could !== canSend) state = { could: canSend, since: state.since };
  seen.current = state;
  return state.since;
}

export function useLateOpCount(rows: readonly { op_id: string; status: string; client_ts: string }[], sinceMs: number = Number.NEGATIVE_INFINITY): number {
  // Fix batch e25x (A7): each waiting row's wait start on the late clock, fixed the first time it is seen.
  const starts = useRef(new Map<string, string>());
  // Bumped by the timer below: the count is read again then.
  const [tick, setTick] = useState(0);
  const clock = lateClockMs();
  const waiting: string[] = [];
  const present = new Set<string>();
  let corrected: number | null = null;
  for (const row of rows) {
    if (row.status !== 'pending' && row.status !== 'sent') continue;
    present.add(row.op_id);
    let start = starts.current.get(row.op_id);
    if (start === undefined) {
      const at = Date.parse(row.client_ts);
      if (Number.isNaN(at)) {
        // Passed as it is: the kernel counts a `client_ts` it cannot read as not late.
        start = row.client_ts;
      } else {
        corrected ??= now().getTime();
        // A `client_ts` ahead of the clock has waited nothing yet; the bound keeps the start on the clock's scale.
        const waited = Math.min(Math.max(0, corrected - at), LATE_CLOCK_ORIGIN_MS);
        start = new Date(clock - waited).toISOString();
      }
      starts.current.set(row.op_id, start);
    }
    waiting.push(start);
  }
  for (const id of starts.current.keys()) if (!present.has(id)) starts.current.delete(id);
  const count = lateOpCount(waiting, clock, sinceMs);
  const turns = syncLateAt(waiting, clock, sinceMs);
  useEffect(() => {
    if (turns === null) return;
    // Never longer than one late bound (A7: no overflowing delay, so no timer that fires at once in a loop).
    const delay = Math.min(Math.max(0, Math.ceil(turns - lateClockMs())), SYNC_LATE_AFTER_MS + 1);
    const handle = globalThis.setTimeout(() => setTick((value) => value + 1), delay);
    return () => globalThis.clearTimeout(handle);
  }, [turns, tick]);
  return count;
}
