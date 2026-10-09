import { toIso } from '@app/domain';
import { useEffect, useState } from 'react';
import { now } from '../clock.ts';

/*
 * Review 2026-10-08 (CAPT-16): the one ticking clock of the reading waits (the sheet's wait
 * lines and the panel dialog's), so the two never drift apart.
 */

/** The device clock as an ISO string, read again every `everyMs` while `active` (and once when it turns active). */
export function useNowIso(everyMs: number, active = true): string {
  const [iso, setIso] = useState(() => toIso(now()));
  useEffect(() => {
    if (!active) return;
    setIso(toIso(now()));
    const timer = setInterval(() => setIso(toIso(now())), everyMs);
    return () => clearInterval(timer);
  }, [everyMs, active]);
  return iso;
}
