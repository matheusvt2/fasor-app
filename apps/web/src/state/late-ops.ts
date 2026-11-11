import { lateOpCount, syncLateAt } from '@app/domain';
import { useEffect, useMemo, useState } from 'react';
import { now } from '../clock.ts';

/*
 * Story 25.3 (M03): how many of the device's waiting ops (`pending`, `sent`) have waited more than one
 * minute, by the kernel's rule (`lateOpCount`), re-read by one timer at the instant the next one turns
 * late (`syncLateAt`), so the badge flips at 60 001 ms without waiting for another render. The rows are
 * the provider's live outbox; acked or dead rows never count.
 */
export function useLateOpCount(rows: readonly { status: string; client_ts: string }[]): number {
  const waiting = useMemo(() => rows.filter((row) => row.status === 'pending' || row.status === 'sent').map((row) => row.client_ts), [rows]);
  // Bumped by the timer below: the count is read again then.
  const [tick, setTick] = useState(0);
  const count = useMemo(() => {
    void tick;
    return lateOpCount(waiting, now().getTime());
  }, [waiting, tick]);
  useEffect(() => {
    const turns = syncLateAt(waiting, now().getTime());
    if (turns === null) return;
    const handle = globalThis.setTimeout(() => setTick((value) => value + 1), Math.max(0, turns - now().getTime()));
    return () => globalThis.clearTimeout(handle);
  }, [waiting, tick]);
  return count;
}
