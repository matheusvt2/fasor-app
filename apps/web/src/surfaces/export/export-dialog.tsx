import {
  generatingReason,
  generatingText,
  idleReason,
  nextEditNote,
  readyTitle,
  revisionMetaSegments,
  revisionRowSegments,
  type RevisionRow,
} from '@app/domain';
import { useId } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Button, StatusPill, TextButton } from '../../components/index.ts';
import { DialogShell } from '../../components/dialog-shell.tsx';
import { copy } from '../../copy/pt-br.ts';
import { revisionDocxUrl } from '../../sync/client.ts';
import { DEFAULT_TIMING, useGenerate, type GenerateTiming } from './use-generate.ts';
import './export.css';

export interface ExportDialogProps {
  relatorioId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Test hook: shorter waits than the 3 s poll and 2 s retry of the product. */
  timing?: GenerateTiming;
}

/** The dialog's title element, which labels it. */
const TITLE_ID = 'export-title';

/** Opens a revision's DOCX in a new tab; the server answers it as a download. */
function openDocx(revisionId: string): void {
  window.open(revisionDocxUrl(revisionId), '_blank', 'noopener');
}

/**
 * The Export dialog of `73-exportar.html` (Story 4.8, FR-62, FR-74): "Gerar relatório"
 * with its reason, the working line, the failed line, the result block with "DOCX — abrir
 * no Word" and the "Revisões" list. Mounted by the Sumário's "Gerar relatório" once Story
 * 4.3 lands; until then by the dev-only export fixture route. Out of the slice here: the
 * pre-issue list, the document control summary, "Pré-visualizar", the share buttons and
 * the PDF row (Epic 11).
 */
export function ExportDialog({ relatorioId, isOpen, onOpenChange, timing = DEFAULT_TIMING }: ExportDialogProps) {
  const state = useGenerate(relatorioId, timing);
  const { phase, relatorio, revisions, nextNumber, userNames, online } = state;
  const whoOf = (row: RevisionRow) => userNames[row.created_by] ?? null;
  const downloadingReasonId = useId();

  const generateRow = (options: { disabledReason?: string; reason?: string }) => (
    <div className="generate-row">
      <Button
        variant="primary"
        isDisabled={options.disabledReason !== undefined}
        disabledReason={options.disabledReason}
        onPress={state.start}
      >
        {copy.export.generate}
      </Button>
      {options.disabledReason === undefined && options.reason !== undefined ? <span className="btn-reason">{options.reason}</span> : null}
    </div>
  );

  let body: React.ReactNode;
  if (phase.kind === 'ready') {
    const revision = revisions.find((r) => r.id === phase.revisionId) ?? revisions.find((r) => r.number === phase.number) ?? null;
    const meta = revision === null ? null : revisionMetaSegments(revision, whoOf(revision));
    body = (
      <>
        <h2 className="t-display">{readyTitle(phase.number)}</h2>
        {meta === null ? null : (
          <p className="t-meta ink-secondary">
            <time dateTime={meta.datetime}>{meta.dateText}</time>
            {meta.after}
          </p>
        )}
        <div className="result-block">
          <div className="result-row">
            {/* A revision this device has not pulled yet: the row waits with its reason (the hook asks for the stream). */}
            <AriaButton
              className="rr-open"
              aria-disabled={revision === null || undefined}
              aria-describedby={revision === null ? downloadingReasonId : undefined}
              onPress={() => revision !== null && openDocx(revision.id)}
            >
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-download" />
              </svg>
              <span className="rr-text">{copy.export.openDocx}</span>
            </AriaButton>
            {revision === null ? (
              <span className="btn-reason" id={downloadingReasonId}>
                {copy.export.downloadingRevision}
              </span>
            ) : null}
          </div>
        </div>
        <div className="row-wrap">
          {relatorio === null ? null : <StatusPill status={relatorio.status} />}
          <span className="t-meta ink-secondary">{nextEditNote(phase.number)}</span>
        </div>
        <Button variant="secondary" block onPress={state.reset}>
          {copy.export.generateAgain}
        </Button>
      </>
    );
  } else if (phase.kind === 'working') {
    body = (
      <>
        <div className="gen-progress" role="status">
          <span className="progress-counter" data-state="pending">
            <span className="dot" aria-hidden="true" />
            {generatingText(phase.number)}
          </span>
          <span>{copy.export.canClose}</span>
        </div>
        {generateRow({ disabledReason: generatingReason(phase.number) })}
      </>
    );
  } else {
    const disabledReason = !online
      ? copy.export.offlineReason
      : phase.kind === 'flushing' || phase.kind === 'requesting'
        ? copy.export.flushing
        : undefined;
    const reason = phase.kind === 'blocked' ? copy.export.deadOpsReason : idleReason(nextNumber);
    body = (
      <>
        {phase.kind === 'failed' ? (
          <div className="gen-error" role="alert">
            <span>{copy.export.failed}</span>
            <TextButton onPress={state.start}>{copy.export.retry}</TextButton>
          </div>
        ) : null}
        {generateRow({ disabledReason, reason })}
      </>
    );
  }

  return (
    <DialogShell className="export-dialog" isOpen={isOpen} onOpenChange={onOpenChange} aria-labelledby={TITLE_ID}>
      <div className="export-state">
        <h2 className="dialog-title" id={TITLE_ID}>
          {copy.export.title}
        </h2>
        {body}
      </div>
      <div>
        <p className="field-label revisions-label">{copy.export.revisionsLabel}</p>
        {revisions.length === 0 ? (
          <p className="section-note">{copy.export.noRevisions}</p>
        ) : (
          revisions.map((row) => {
            const segments = revisionRowSegments(row, whoOf(row));
            return (
              <div className="revision-row" key={row.id}>
                <span className="rev-text">
                  {segments.before}
                  <time dateTime={segments.datetime}>{segments.dateText}</time>
                  {segments.after}
                </span>
                <span className="rev-files">
                  <TextButton onPress={() => openDocx(row.id)}>
                    <svg className="ico" aria-hidden="true">
                      <use href="/sprite.svg#i-download" />
                    </svg>
                    {copy.export.revisionDocx}
                  </TextButton>
                </span>
              </div>
            );
          })
        )}
      </div>
    </DialogShell>
  );
}
