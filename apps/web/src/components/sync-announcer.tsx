import { syncAnnouncementText, type SyncBadgeState } from '@app/domain';
import { useEffect, useRef, useState } from 'react';

export interface SyncAnnouncerProps {
  state: SyncBadgeState;
}

/** How long an announced word stays in the region before it is cleared. */
export const SYNC_ANNOUNCEMENT_CLEAR_MS = 5_000;

/**
 * UX-DR8, Accessibility floor: "live regions announce transitions, not counts". The
 * badge itself is not live; this hidden `role="status"` region writes the transition
 * word once, when the state changes, and stays silent while only the counts move
 * ("3 pendentes" → "5 pendentes" is not an event a screen reader should interrupt for).
 *
 * Review fixes 2026-10-06 (F-23, D10): the word comes from `syncAnnouncementText` and holds no
 * count (the region used to keep the count of the moment it changed, "223 pendentes" beside a
 * badge at 227), and it is cleared after `SYNC_ANNOUNCEMENT_CLEAR_MS`, so a virtual cursor
 * never reads a stale one.
 *
 * The first render writes nothing: arriving on a surface is not a transition.
 */
export function SyncAnnouncer({ state }: SyncAnnouncerProps) {
  const previous = useRef<SyncBadgeState | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (before === null || before === state) return;
    setMessage(syncAnnouncementText(state));
    const clear = setTimeout(() => setMessage(''), SYNC_ANNOUNCEMENT_CLEAR_MS);
    return () => clearTimeout(clear);
  }, [state]);

  return (
    <p className="visually-hidden" role="status" data-testid="sync-announcer">
      {message}
    </p>
  );
}
