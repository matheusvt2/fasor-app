import { syncBadgeLabel, syncBadgeShortLabel, type SyncBadgeState, type SyncCounts } from '@app/domain';
import { Button as AriaButton, type PressEvent } from 'react-aria-components';
import { ui } from '../copy/ui.ts';

export interface SyncBadgeProps {
  state: SyncBadgeState;
  counts: SyncCounts;
  /** `.is-compact`: the relatório card variant (no pill border). */
  compact?: boolean;
  /** When given, the badge sits inside a button (the App bar badge opens Sync status). */
  onPress?: (event: PressEvent) => void;
}

/**
 * `.sync-badge[data-state]` from `shell-head.html`: one dot and always a word, both
 * words from the kernel — `.sync-long` ("Sincronizado") and `.sync-short` ("OK"), which
 * `components.css` swaps at narrow widths. The visible word therefore depends on the
 * viewport, so the accessible name is written out instead of inferred from the text:
 * it names the state, and the action when the badge is pressable.
 *
 * The badge is always the span (React Aria's Button owns a `data-pending` attribute of
 * its own, so the counts cannot live on the button); with `onPress` the span is wrapped.
 */
export function SyncBadge({ state, counts, compact = false, onPress }: SyncBadgeProps) {
  const long = syncBadgeLabel(state, counts);
  const short = syncBadgeShortLabel(state, counts);
  const name = onPress ? ui.syncBadge.pressableLabel(long) : ui.syncBadge.label(long);
  const className = ['sync-badge', compact && 'is-compact'].filter(Boolean).join(' ');
  const badge = (
    <span
      className={className}
      data-state={state}
      data-testid="sync-badge"
      data-pending={counts.pending + counts.sent}
      data-dead={counts.dead}
      // Without a button around it the span itself carries the name, and its two words
      // are decoration for the eye only.
      role={onPress ? undefined : 'img'}
      aria-label={onPress ? undefined : name}
    >
      <span className="pill" aria-hidden={onPress ? 'true' : undefined}>
        <span className="dot" aria-hidden="true" />
        <span className="sync-long">{long}</span>
        <span className="sync-short" aria-hidden="true">
          {short}
        </span>
      </span>
    </span>
  );
  if (onPress) {
    return (
      <AriaButton className="sync-badge-btn" onPress={onPress} aria-label={name}>
        {badge}
      </AriaButton>
    );
  }
  return badge;
}
