import { ui } from '../copy/ui';

export type RelatorioStatus = 'rascunho' | 'em-campo' | 'em-revisao' | 'emitido';

export interface StatusPillProps {
  status: RelatorioStatus;
}

/**
 * `.status-pill[data-status]`. `status` is a TypeScript union, so a status outside the four
 * known values fails to compile — there is no runtime fallback ink to silently pick.
 */
export function StatusPill({ status }: StatusPillProps) {
  return (
    <span className="status-pill" data-status={status}>
      {ui.statusPill.label[status]}
    </span>
  );
}
