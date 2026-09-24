import { useState } from 'react';
import { Button } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { ExportDialog } from '../export/export-dialog.tsx';

export interface GenerateActionProps {
  /** The relatório the Export dialog generates. */
  relatorioId: string;
  /** The id of the foot's `.btn-reason` (`generateReason`), which describes the button. */
  reasonId: string;
  /** True when a blocking Sumário row (`preIssue` severity `blocking`) stops the generation. */
  blocked: boolean;
}

/**
 * The foot's primary "Gerar relatório" (`40-relatorio-overview.html`), which opens the
 * Export dialog (`73-exportar.html`, Story 4.8). While a blocking row stands, the button
 * is `aria-disabled` and the foot's `generateReason` says why; otherwise it opens the
 * dialog, and the dialog returns the focus here when it closes.
 */
export function GenerateAction({ relatorioId, reasonId, blocked }: GenerateActionProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="primary"
        // One pointer at the reason either way: the shared-reason prop while blocked, a plain
        // description otherwise (Button joins the two, so naming both would repeat the id).
        aria-describedby={blocked ? undefined : reasonId}
        isDisabled={blocked}
        disabledReasonId={blocked ? reasonId : undefined}
        onPress={() => setOpen(true)}
      >
        <svg className="ico" aria-hidden="true">
          <use href="/sprite.svg#i-doc" />
        </svg>
        {copy.sumario.generate}
      </Button>
      <ExportDialog relatorioId={relatorioId} isOpen={open} onOpenChange={setOpen} />
    </>
  );
}
