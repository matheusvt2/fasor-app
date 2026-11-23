import type { AuditTarget, SumarioRowKey } from '@app/domain';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { RETURN_PARAM, RETURN_TO_EXPORT } from '../../state/back-target.tsx';
import { ExportDialog } from '../export/export-dialog.tsx';
import { spriteHref } from '../../styles/sprite.ts';

export interface GenerateActionProps {
  /** The relatório the Export dialog generates. */
  relatorioId: string;
  /** The id of the foot's `.btn-reason` (`generateReason`), which describes the button. */
  reasonId: string;
  /** "Ver no sumário": the dialog closed, the Sumário marks the rows its warnings stand on. */
  onSeeInSumario: (rows: SumarioRowKey[]) => void;
  /** Story 13.8: an audit finding's "Ver", the Sumário's own (`seeAuditTarget`). */
  onSeeAuditTarget?: (target: AuditTarget) => void;
  /**
   * Story 26.5: the role does not hold `relatorio.issue`: the button is disabled, described by the
   * foot's one shared line (`reasonId`), and the dialog never opens, even from `?exportar=1`.
   */
  isDisabled?: boolean;
}

/** The Sumário's search parameter that holds the Export dialog open (Story 7.5). */
export const EXPORT_PARAM = 'exportar';

/**
 * Story 29.2: the mark the history entry pushed by opening the dialog carries, so a close by Esc, a
 * tap outside or "Cancelar" takes that entry back off (a back) instead of leaving a second entry of
 * the Sumário behind it, which a later back would land on without moving.
 */
const EXPORT_OPENED = 'exportOpened';

function openedHere(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as Record<string, unknown>)[EXPORT_OPENED] === true;
}

/**
 * The foot's primary "Gerar relatório" (`40-relatorio-overview.html`), which opens the
 * Export dialog (`73-exportar.html`). Story 7.5: the dialog's open state is the Sumário's
 * `?exportar=1`, so the setup's "Voltar para Gerar relatório" and the browser's back reopen
 * it; the button always opens it (the mock's), and a blocking row stops "Gerar relatório"
 * inside the dialog, where its reason and its way to Dados do relatório are; the foot's
 * `generateReason` says it here. The dialog returns the focus here when it closes.
 */
export function GenerateAction({ relatorioId, reasonId, onSeeInSumario, onSeeAuditTarget, isDisabled = false }: GenerateActionProps) {
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const open = search.get(EXPORT_PARAM) === '1' && !isDisabled;
  /** `cancel`: the dialog's own close (Esc, scrim, Cancelar), which pops the entry its opening pushed. */
  const setOpen = (next: boolean, how: 'cancel' | 'replace' = 'replace') => {
    if (next === open) return;
    if (!next && how === 'cancel' && openedHere(location.state)) {
      void navigate(-1);
      return;
    }
    const state: unknown = location.state;
    setSearch(
      (current) => {
        const params = new URLSearchParams(current);
        if (next) params.set(EXPORT_PARAM, '1');
        else params.delete(EXPORT_PARAM);
        return params;
      },
      // Opening is a step back can undo (marked, Story 29.2); closing otherwise replaces it.
      next ? { state: { ...(typeof state === 'object' && state !== null ? state : {}), [EXPORT_OPENED]: true } } : { replace: true },
    );
  };
  return (
    <>
      <Button
        variant="primary"
        aria-describedby={isDisabled ? undefined : reasonId}
        isDisabled={isDisabled}
        disabledReasonId={isDisabled ? reasonId : undefined}
        data-telemetry="sumario.export"
        onPress={() => setOpen(true)}
      >
        <svg className="ico" aria-hidden="true">
          <use href={spriteHref('i-doc')} />
        </svg>
        {copy.sumario.generate}
      </Button>
      <ExportDialog
        relatorioId={relatorioId}
        isOpen={open}
        onOpenChange={(next) => setOpen(next, 'cancel')}
        onEditInSetup={(etapa) => void navigate(`/relatorio/${relatorioId}/setup?etapa=${etapa}${etapa === 6 ? '&volta=exportar' : ''}`)}
        // Story 25.7: a stale conclusion text's "Abrir ficha", with `?volta=exportar` so the sheet's "Voltar" reopens the dialog.
        onOpenSheet={(blockId) => void navigate(`/relatorio/${relatorioId}/ficha/${blockId}?${RETURN_PARAM}=${RETURN_TO_EXPORT}`)}
        onSeeInSumario={(rows) => {
          setOpen(false);
          onSeeInSumario(rows);
        }}
        {...(onSeeAuditTarget === undefined
          ? {}
          : {
              onSeeAuditTarget: (target: AuditTarget) => {
                // A section is marked on the Sumário behind the dialog, which closes first; a
                // sheet or the gallery is a navigation with `?volta=exportar` (review F-11), so
                // its App bar "Voltar" and the browser's back both reopen the dialog (`?exportar=1`).
                if (target.kind === 'section') setOpen(false);
                onSeeAuditTarget(target);
              },
            })}
      />
    </>
  );
}
