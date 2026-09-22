import { syncBadgeLabel, type SyncBadgeState, type SyncCounts } from '@app/domain';
import { useEffect, useRef, useState } from 'react';

export interface SyncAnnouncerProps {
  state: SyncBadgeState;
  counts: SyncCounts;
}

/**
 * UX-DR8, Accessibility floor: "live regions announce transitions, not counts". The
 * badge itself is not live; this hidden `role="status"` region writes the state word
 * once, when the state changes, and stays silent while only the counts move
 * ("3 pendentes" → "5 pendentes" is not an event a screen reader should interrupt for).
 *
 * The first render writes nothing: arriving on a surface is not a transition.
 */
export function SyncAnnouncer({ state, counts }: SyncAnnouncerProps) {
  const previous = useRef<SyncBadgeState | null>(null);
  const countsRef = useRef(counts);
  countsRef.current = counts;
  const [message, setMessage] = useState('');

  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (before === null || before === state) return;
    setMessage(syncBadgeLabel(state, countsRef.current));
    // `state` is the only dependency on purpose: a count change must not re-run this
    // effect, which is what "announce transitions, not counts" means.
  }, [state]);

  return (
    <p className="visually-hidden" role="status" data-testid="sync-announcer">
      {message}
    </p>
  );
}
