import { syncBadgeLabel, type SyncBadgeState, type SyncCounts } from '@app/domain';
import { Button as AriaButton, type PressEvent } from 'react-aria-components';

export interface SyncBadgeProps {
  state: SyncBadgeState;
  counts: SyncCounts;
  /** `.is-compact`: the relatório card variant (no pill border). */
  compact?: boolean;
  /** When given, the badge sits inside a button (the App bar badge opens Sync status). */
  onPress?: (event: PressEvent) => void;
}

/**
 * `.sync-badge[data-state]` from `key-sync-status.html`: one dot and always a word,
 * the word from the kernel's `syncBadgeLabel`. It announces nothing yet: the live
 * region that announces transitions (never counts) belongs to Story 1.6.
 *
 * The badge is always the span (React Aria's Button owns a `data-pending` attribute of
 * its own, so the counts cannot live on the button); with `onPress` the span is wrapped.
 */
export function SyncBadge({ state, counts, compact = false, onPress }: SyncBadgeProps) {
  const label = syncBadgeLabel(state, counts);
  const className = ['sync-badge', compact && 'is-compact'].filter(Boolean).join(' ');
  const badge = (
    <span
      className={className}
      data-state={state}
      data-testid="sync-badge"
      data-pending={counts.pending + counts.sent}
      data-dead={counts.dead}
    >
      <span className="pill">
        <span className="dot" aria-hidden="true" />
        {label}
      </span>
    </span>
  );
  if (onPress) {
    return (
      <AriaButton className="sync-badge-btn" onPress={onPress}>
        {badge}
      </AriaButton>
    );
  }
  return badge;
}
