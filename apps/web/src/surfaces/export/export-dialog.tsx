import {
  buildSnapshot,
  documentControlRows,
  exportPrecheck,
  failedReason,
  generatingReason,
  generatingText,
  idleReason,
  nextEditNote,
  parecerMissingReason,
  pendingSuggestions,
  progress,
  readyTitle,
  revisionMetaSegments,
  revisionRowSegments,
  suggestionRowsOf,
  sumarioLineOf,
  sumarioRows,
  toIso,
  type RevisionRow,
  type SumarioRowKey,
} from '@app/domain';
import { useId, useMemo } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Button, StatusPill, TextButton } from '../../components/index.ts';
import { DialogShell } from '../../components/dialog-shell.tsx';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { relatorioState } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { revisionDocxUrl } from '../../sync/client.ts';
import { DEFAULT_TIMING, useGenerate, type GenerateTiming } from './use-generate.ts';
import { usePreIssue } from './use-pre-issue.ts';
import { usePreview } from './use-preview.ts';
import './export.css';

export interface ExportDialogProps {
  relatorioId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** "Editar em Dados do relatório": opens the setup at `etapa` (6 from the blocking row, which comes back here). */
  onEditInSetup?: (etapa: number) => void;
  /** "Ver no sumário": closes the dialog and highlights the Sumário rows these warnings stand on. */
  onSeeInSumario?: (rows: SumarioRowKey[]) => void;
  /** Test hook: shorter waits than the 3 s poll and 2 s retry of the product. */
  timing?: GenerateTiming;
}

/** The dialog's title element, which labels it. */
const TITLE_ID = 'export-title';

/** Opens a revision's DOCX in a new tab; the server answers it as a download. */
function openDocx(revisionId: string): void {
  window.open(revisionDocxUrl(revisionId), '_blank', 'noopener');
}

/** The system share sheet, only where the browser has one (mobile). */
const canShare = (): boolean => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

function shareDocx(revisionId: string, title: string): void {
  const url = new URL(revisionDocxUrl(revisionId), window.location.origin).toString();
  void navigator.share({ title, url }).catch(() => undefined);
}

/**
 * The Export dialog of `73-exportar.html` (Stories 4.8 and 7.5, FR-62, FR-73, FR-74):
 * "Antes de emitir" (the one blocking row with its way to Dados do relatório, the lines only
 * the dialog can say, and the count of the warnings that stay on the Sumário rows), the
 * read-only document control summary (a `dl`, UX-DR67), the section 9 fact line,
 * "Pré-visualizar" (the RASCUNHO draft in a new tab) beside "Gerar relatório" with its
 * reason, the working line, the failed line, the result block with "DOCX — abrir no Word"
 * (and share where the system has it) and the "Revisões" list. Mounted by the Sumário's
 * "Gerar relatório" (`surfaces/relatorio/generate-action.tsx`). Out of the slice: the PDF
 * row (Epic 11).
 */
export function ExportDialog({ relatorioId, isOpen, onOpenChange, onEditInSetup, onSeeInSumario, timing = DEFAULT_TIMING }: ExportDialogProps) {
  const state = useGenerate(relatorioId, timing);
  const preview = usePreview(relatorioId, timing);
  const { phase, relatorio, revisions, idleNumber, userNames, online } = state;
  const whoOf = (row: RevisionRow) => userNames[row.created_by] ?? null;
  const downloadingReasonId = useId();
  const generateReasonId = useId();
  const db = useSession().database;
  const { resendDead } = useSync();

  const entityState = useLiveQuery(() => (db === null ? Promise.resolve(null) : relatorioState(db, relatorioId)), [db, relatorioId], null);
  const snapshot = useMemo(() => (entityState === null ? null : buildSnapshot(entityState, relatorioId)), [entityState, relatorioId]);
  // Story 8.6: the device's pending suggestion rows (section 9's warning and the sheets count).
  const pending = useMemo(() => (entityState === null ? [] : pendingSuggestions(suggestionRowsOf(entityState, relatorioId))), [entityState, relatorioId]);
  const computed = useMemo(() => (snapshot === null ? null : progress(snapshot, pending)), [snapshot, pending]);
  const issues = usePreIssue(db, snapshot, computed, pending);
  const precheck = useMemo(() => exportPrecheck(issues), [issues]);
  const blocked = precheck.blocking.length > 0;
  const control = useMemo(
    () => (snapshot === null ? [] : documentControlRows(snapshot, { revisionNumber: idleNumber, issuedAt: toIso(now()), art: snapshot.relatorio.setup.art_trt_number })),
    [snapshot, idleNumber],
  );
  // Section 10's Sumário line, the one the blocked reason names: the Sumário's own rows (E78-Q1,
  // virtual ones included), so the dialog and the foot always say the same "linha 10".
  const parecerLine = useMemo(
    () => (snapshot === null || computed === null ? null : sumarioLineOf(sumarioRows(snapshot, issues, computed), 'section_10')),
    [snapshot, issues, computed],
  );
  const summarizedRows = useMemo(() => {
    const explicit = new Set([...precheck.blocking, ...precheck.explicit]);
    return [...new Set(issues.filter((row) => !explicit.has(row)).map((row) => row.row))];
  }, [issues, precheck]);

  const previewButton = (
    // Offline, the row's one reason ("Gerar relatório precisa de conexão") names both buttons.
    <Button variant="secondary" isDisabled={!online} disabledReasonId={online ? undefined : generateReasonId} onPress={preview.start}>
      <svg className="ico" aria-hidden="true">
        <use href="/sprite.svg#i-doc" />
      </svg>
      {preview.phase.kind === 'working' ? copy.export.previewing : copy.export.preview}
    </Button>
  );

  const generateRow = (options: { disabledReason?: string; reason?: string; withPreview: boolean }) => (
    <div className="generate-row">
      {options.withPreview ? previewButton : null}
      <Button
        variant="primary"
        isDisabled={options.disabledReason !== undefined}
        disabledReasonId={options.disabledReason === undefined ? undefined : generateReasonId}
        onPress={state.start}
      >
        {copy.export.generate}
      </Button>
      {options.disabledReason === undefined ? null : (
        <span className="btn-reason" id={generateReasonId}>
          {options.disabledReason}
        </span>
      )}
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
            ) : canShare() ? (
              <AriaButton className="icon-btn" aria-label={copy.export.shareDocx} onPress={() => shareDocx(revision.id, readyTitle(phase.number))}>
                <svg className="ico" aria-hidden="true">
                  <use href="/sprite.svg#i-share" />
                </svg>
              </AriaButton>
            ) : null}
          </div>
        </div>
        <div className="row-wrap">
          {/* The status after the issue op (Q11): the hook's until the live row re-renders. */}
          {phase.status !== undefined ? <StatusPill status={phase.status} /> : relatorio === null ? null : <StatusPill status={relatorio.status} />}
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
        {generateRow({ disabledReason: generatingReason(phase.number), withPreview: false })}
      </>
    );
  } else {
    const disabledReason = !online
      ? copy.export.offlineReason
      : blocked
        ? parecerMissingReason(idleNumber, parecerLine)
        : phase.kind === 'flushing' || phase.kind === 'requesting'
          ? copy.export.flushing
          : undefined;
    const reason =
      phase.kind === 'blocked' ? copy.export.deadOpsReason : phase.kind === 'failed' ? failedReason(idleNumber) : idleReason(idleNumber);
    body = (
      <>
        {phase.kind === 'failed' ? (
          <div className="gen-error" role="alert">
            <span>{copy.export.failed}</span>
            {blocked ? null : <TextButton onPress={state.start}>{copy.export.retry}</TextButton>}
          </div>
        ) : null}
        {generateRow({ disabledReason, reason, withPreview: true })}
      </>
    );
  }

  const showPrecheck = phase.kind !== 'ready' && (precheck.blocking.length > 0 || precheck.explicit.length > 0 || precheck.summarizedCount > 0);

  return (
    <DialogShell className="export-dialog" isOpen={isOpen} onOpenChange={onOpenChange} aria-labelledby={TITLE_ID}>
      <div className="export-state">
        <h2 className="dialog-title" id={TITLE_ID}>
          {copy.export.title}
        </h2>

        {showPrecheck ? (
          <div>
            <p className="field-label precheck-label">{copy.export.precheckLabel}</p>
            <ul className="precheck">
              {precheck.blocking.map((row) => (
                <li className="is-blocking" key={row.id}>
                  <span className="pc-text">
                    <span className="pc-block">{row.text}</span>
                    {copy.export.blockingWhere}
                    <span className="pc-meta">{copy.export.blockingMeta}</span>
                  </span>
                  {onEditInSetup === undefined ? null : (
                    <span className="pc-actions">
                      <TextButton onPress={() => onEditInSetup(6)}>{copy.export.editInSetup}</TextButton>
                    </span>
                  )}
                </li>
              ))}
              {precheck.explicit.map((row) => (
                <li key={row.id}>
                  <span className="pc-text">{row.text}</span>
                  {row.kind === 'rejected' ? (
                    <span className="pc-actions">
                      <TextButton onPress={() => void resendDead()}>{copy.export.resend}</TextButton>
                    </span>
                  ) : null}
                </li>
              ))}
              {precheck.summarizedCount === 0 ? null : (
                <li>
                  <span className="pc-text">
                    {precheck.countText}
                    <span className="pc-meta">{copy.export.countMeta}</span>
                  </span>
                  {onSeeInSumario === undefined ? null : (
                    <span className="pc-actions">
                      <TextButton onPress={() => onSeeInSumario(summarizedRows)}>{copy.export.seeInSumario}</TextButton>
                    </span>
                  )}
                </li>
              )}
            </ul>
          </div>
        ) : null}

        {phase.kind === 'ready' || control.length === 0 ? null : (
          <div>
            <div className="doc-control-head">
              <p className="field-label">{copy.export.docControlLabel}</p>
              {onEditInSetup === undefined ? null : (
                <TextButton onPress={() => onEditInSetup(1)}>
                  {copy.export.editInSetup}
                  <svg className="ico ico-sm" aria-hidden="true">
                    <use href="/sprite.svg#i-chev-right" />
                  </svg>
                </TextButton>
              )}
            </div>
            <dl className="doc-control" aria-label={copy.export.docControlAria}>
              {control.map((row) => (
                <div className="dc-row" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {phase.kind === 'ready' ? null : (
          <p className="pc-meta export-sec9-note">
            {copy.export.sec9NoteBefore}
            <em>{copy.export.sec9NoteFlag}</em>
            {copy.export.sec9NoteAfter}
          </p>
        )}

        {body}

        {preview.phase.kind === 'failed' ? (
          <div className="gen-error" role="alert">
            <span>{copy.export.previewFailed}</span>
          </div>
        ) : null}
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
