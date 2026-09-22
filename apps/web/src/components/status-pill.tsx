import { statusLabel, statusPillId, type RelatorioStatus } from '@app/domain';

export interface StatusPillProps {
  status: RelatorioStatus;
}

/**
 * `.status-pill[data-status]`. The status is the kernel's (`RelatorioStatus`), and both the
 * `data-status` spelling and the pt-BR word come from the kernel (`statusPillId`,
 * `statusLabel`), so no component keeps a second copy of the four words.
 */
export function StatusPill({ status }: StatusPillProps) {
  return (
    <span className="status-pill" data-status={statusPillId(status)}>
      {statusLabel(status)}
    </span>
  );
}
