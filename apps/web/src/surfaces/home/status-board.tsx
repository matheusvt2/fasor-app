import { RELATORIO_STATUSES, type RelatorioStatus } from '@app/domain';
import { StatusTile } from '../../components/status-tile.tsx';
import { copy } from '../../copy/pt-br.ts';

export interface StatusBoardProps {
  counts: Record<RelatorioStatus, number>;
  filter: RelatorioStatus | null;
  onFilter: (status: RelatorioStatus) => void;
}

/**
 * `20-home.html`'s `.status-board`: the four tiles in board order, counts from the
 * kernel, zeros shown rather than hidden. A tap filters the list below; the same tap
 * again clears it (the caller owns the state).
 */
export function StatusBoard({ counts, filter, onFilter }: StatusBoardProps) {
  return (
    <div className="status-board" role="group" aria-label={copy.home.statusHeading}>
      {RELATORIO_STATUSES.map((status) => (
        <StatusTile
          key={status}
          status={status}
          count={counts[status]}
          isPressed={filter === status}
          onPress={() => onFilter(status)}
        />
      ))}
    </div>
  );
}
