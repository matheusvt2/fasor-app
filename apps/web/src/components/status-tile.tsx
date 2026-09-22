import { statusTileLabel, type RelatorioStatus } from '@app/domain';
import { ToggleButton } from 'react-aria-components';
import { StatusPill } from './status-pill.tsx';

export interface StatusTileProps {
  status: RelatorioStatus;
  count: number;
  isPressed: boolean;
  onPress: () => void;
}

/**
 * One tile of the Home status board (`20-home.html`): the count in `display` size over
 * the Status pill. The mock draws the tiles as plain navigation buttons, but UX-DR63
 * and EXPERIENCE.md make them a filter, so the tile is a real toggle button —
 * `aria-pressed` lands on the visible element, and `src/styles/app.css` (not the locked
 * `components.css`) gives the pressed state its look.
 */
export function StatusTile({ status, count, isPressed, onPress }: StatusTileProps) {
  return (
    <ToggleButton
      className="status-tile"
      isSelected={isPressed}
      onChange={onPress}
      aria-label={statusTileLabel(status, count)}
      data-status={status}
    >
      <span className={count === 0 ? 'tile-count is-zero' : 'tile-count'} aria-hidden="true">
        {count}
      </span>
      <StatusPill status={status} />
    </ToggleButton>
  );
}
