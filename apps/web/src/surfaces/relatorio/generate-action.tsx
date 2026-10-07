import type { AuditTarget, SumarioRowKey } from '@app/domain';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { ExportDialog } from '../export/export-dialog.tsx';

export interface GenerateActionProps {
  /** The relatório the Export dialog generates. */
  relatorioId: string;
  /** The id of the foot's `.btn-reason` (`generateReason`), which describes the button. */
  reasonId: string;
  /** "Ver no sumário": the dialog closed, the Sumário marks the rows its warnings stand on. */
  onSeeInSumario: (rows: SumarioRowKey[]) => void;
  /** Story 13.8: an audit finding's "Ver", the Sumário's own (`seeAuditTarget`). */
  onSeeAuditTarget?: (target: AuditTarget) => void;
}

/** The Sumário's search parameter that holds the Export dialog open (Story 7.5). */
export const EXPORT_PARAM = 'exportar';

/**
 * The foot's primary "Gerar relatório" (`40-relatorio-overview.html`), which opens the
 * Export dialog (`73-exportar.html`). Story 7.5: the dialog's open state is the Sumário's
 * `?exportar=1`, so the setup's "Voltar para Gerar relatório" and the browser's back reopen
 * it; the button always opens it (the mock's), and a blocking row stops "Gerar relatório"
 * inside the dialog, where its reason and its way to Dados do relatório are; the foot's
 * `generateReason` says it here. The dialog returns the focus here when it closes.
 */
export function GenerateAction({ relatorioId, reasonId, onSeeInSumario, onSeeAuditTarget }: GenerateActionProps) {
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const open = search.get(EXPORT_PARAM) === '1';
  const setOpen = (next: boolean) => {
    if (next === open) return;
    setSearch(
      (current) => {
        const params = new URLSearchParams(current);
        if (next) params.set(EXPORT_PARAM, '1');
        else params.delete(EXPORT_PARAM);
        return params;
      },
      // Opening is a step back can undo; closing replaces it.
      { replace: !next },
    );
  };
  return (
    <>
      <Button variant="primary" aria-describedby={reasonId} onPress={() => setOpen(true)}>
        <svg className="ico" aria-hidden="true">
          <use href="/sprite.svg#i-doc" />
        </svg>
        {copy.sumario.generate}
      </Button>
      <ExportDialog
        relatorioId={relatorioId}
        isOpen={open}
        onOpenChange={setOpen}
        onEditInSetup={(etapa) => void navigate(`/relatorio/${relatorioId}/setup?etapa=${etapa}${etapa === 6 ? '&volta=exportar' : ''}`)}
        onSeeInSumario={(rows) => {
          setOpen(false);
          onSeeInSumario(rows);
        }}
        {...(onSeeAuditTarget === undefined
          ? {}
          : {
              onSeeAuditTarget: (target: AuditTarget) => {
                // A section is marked on the Sumário behind the dialog, which closes first; a
                // sheet or the gallery is a navigation, and "Voltar" reopens the dialog (`?exportar=1`).
                if (target.kind === 'section') setOpen(false);
                onSeeAuditTarget(target);
              },
            })}
      />
    </>
  );
}
