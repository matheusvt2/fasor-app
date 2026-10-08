import {
  documentControlRows,
  empresaRegistered,
  exportPrecheck,
  failedReason,
  generatingReason,
  generatingText,
  idleReason,
  issueConfirmText,
  missingFilesText,
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
  type AuditTarget,
  type RevisionFileFormat,
  type RevisionRow,
  type SumarioRowKey,
} from '@app/domain';
import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Button, StatusPill, TextButton } from '../../components/index.ts';
import { DialogShell } from '../../components/dialog-shell.tsx';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { relatorioState } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { useAiFeatures } from '../../state/ai-features.tsx';
import { useSession } from '../../state/session.tsx';
import { useSyncActions } from '../../state/sync-actions.ts';
import { AuditFindings } from './audit-findings.tsx';
import { downloadRevisionFile, fetchRevisionFile, hasShareSheet, shareFile, shareRevisionFile, type RevisionFileRef } from './revision-file.ts';
import { useAudit } from './use-audit.ts';
import { DEFAULT_TIMING, useGenerate, type GenerateTiming } from './use-generate.ts';
import { useIssueConfirmation, usePreIssue } from './use-pre-issue.ts';
import { usePreview } from './use-preview.ts';
import { isSessionExpired, isUnauthorized, SessionExpiredNote } from './session-expired.tsx';
import { publishReAuth } from '../../api/auth-client.ts';
import './export.css';
import { useRelatorioSnapshot } from '../../db/relatorio-snapshot.ts';

export interface ExportDialogProps {
  relatorioId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** "Editar em Dados do relatório": opens the setup at `etapa` (6 from the blocking row, which comes back here). */
  onEditInSetup?: (etapa: number) => void;
  /** "Ver no sumário": closes the dialog and highlights the Sumário rows these warnings stand on. */
  onSeeInSumario?: (rows: SumarioRowKey[]) => void;
  /**
   * Story 13.8: an audit finding's "Ver": a section closes the dialog and marks its Sumário row,
   * a sheet (or one of its rows) opens the sheet, a photo the gallery. Absent, no "Ver".
   */
  onSeeAuditTarget?: (target: AuditTarget) => void;
  /** Test hook: shorter waits than the 3 s poll and 2 s retry of the product. */
  timing?: GenerateTiming;
}

/** The dialog's title element, which labels it. */
const TITLE_ID = 'export-title';

/**
 * The Export dialog of `73-exportar.html` (Stories 4.8 and 7.5, FR-62, FR-73, FR-74):
 * "Antes de emitir" (the one blocking row with its way to Dados do relatório, the lines only
 * the dialog can say, and the count of the warnings that stay on the Sumário rows), the
 * read-only document control summary (a `dl`, UX-DR67), the section 9 fact line,
 * "Pré-visualizar" (the RASCUNHO draft in a new tab) beside "Gerar relatório" with its
 * reason, the working line, the failed line, the result block with "DOCX — abrir no Word"
 * and "PDF — enviar ao cliente" (each with share where the system has it, Story 11.1) and
 * the "Revisões" list with a DOCX and a PDF button per revision. Every file button hands over
 * the file itself (E11-Q1, `revision-file.ts`): it reads "Baixando…" while the bytes come and
 * words a failure beside its row. Mounted by the Sumário's
 * "Gerar relatório" (`surfaces/relatorio/generate-action.tsx`).
 */
export function ExportDialog({ relatorioId, isOpen, onOpenChange, onEditInSetup, onSeeInSumario, onSeeAuditTarget, timing = DEFAULT_TIMING }: ExportDialogProps) {
  const state = useGenerate(relatorioId, timing);
  const preview = usePreview(relatorioId, timing);
  // Story 13.8 (AI-3): the optional AI pass, never automatic and never in the way of the issue.
  const aiFeatures = useAiFeatures();
  const audit = useAudit(relatorioId, timing);
  const { phase, relatorio, revisions, idleNumber, userNames, online } = state;
  const whoOf = (row: RevisionRow) => userNames[row.created_by] ?? null;
  const downloadingReasonId = useId();
  const generateReasonId = useId();
  const db = useSession().database;
  const { resendDead } = useSyncActions();
  // The revision the result block offers, once this device holds its row.
  const readyRevision =
    phase.kind === 'ready' ? (revisions.find((r) => r.id === phase.revisionId) ?? revisions.find((r) => r.number === phase.number) ?? null) : null;
  const readyRevisionId = readyRevision?.id ?? null;
  const readyRevisionNumber = readyRevision?.number ?? null;

  // E11-Q1: the file presses in flight (each row reads its waiting word; presses on other
  // rows run beside it) and the row whose last press failed. Closing the dialog or another
  // revision in the result block clears both, and an answer from before that is ignored.
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState<string | null>(null);
  /** F-12 / W-23: the last failed file press failed because the session is gone. */
  const [failedSession, setFailedSession] = useState(false);
  const fileEpoch = useRef(0);
  useEffect(() => {
    fileEpoch.current++;
    setBusy(new Set());
    setFailed(null);
  }, [isOpen, readyRevisionId]);
  const runFile = (key: string, action: () => Promise<unknown>) => {
    if (busy.has(key)) return;
    const epoch = fileEpoch.current;
    const settle = (error: unknown | null) => {
      if (epoch !== fileEpoch.current) return;
      setBusy((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      setFailed((current) => (error !== null ? key : current === key ? null : current));
      if (error !== null) setFailedSession(isSessionExpired(error));
    };
    setBusy((current) => new Set(current).add(key));
    setFailed((current) => (current === key ? null : current));
    void action().then(
      () => settle(null),
      (error: unknown) => {
        // W-23: a 401 raises the re-auth banner and words the session, not the connection.
        if (isUnauthorized(error)) publishReAuth();
        settle(error ?? new Error('file failed'));
      },
    );
  };

  // Where a share sheet exists, the result block's two files are fetched as soon as the
  // revision is known, so "Compartilhar" hands a file in hand to the sheet inside the press
  // itself (iPadOS Safari drops a share whose user activation expired during a fetch).
  const [prefetched, setPrefetched] = useState<{ revisionId: string; files: Partial<Record<RevisionFileFormat, File>> } | null>(null);
  useEffect(() => {
    if (!isOpen || readyRevisionId === null || readyRevisionNumber === null || !hasShareSheet()) return;
    let cancelled = false;
    for (const format of ['docx', 'pdf'] as const) {
      fetchRevisionFile({ revisionId: readyRevisionId, number: readyRevisionNumber, format }).then(
        (fetched) => {
          if (cancelled) return;
          setPrefetched((current) =>
            current !== null && current.revisionId === readyRevisionId
              ? { revisionId: readyRevisionId, files: { ...current.files, [format]: fetched } }
              : { revisionId: readyRevisionId, files: { [format]: fetched } },
          );
        },
        // A failed prefetch leaves the press to fetch the file itself.
        () => undefined,
      );
    }
    return () => {
      cancelled = true;
    };
  }, [isOpen, readyRevisionId, readyRevisionNumber]);

  const download = (key: string, ref: RevisionFileRef) => runFile(key, () => downloadRevisionFile(ref));
  const share = (ref: RevisionFileRef, title: string) => {
    const inHand = prefetched !== null && prefetched.revisionId === ref.revisionId ? prefetched.files[ref.format] : undefined;
    // `shareFile` calls the sheet synchronously, inside this press.
    runFile(`share:${ref.format}`, () => (inHand === undefined ? shareRevisionFile(ref, title) : shareFile(inHand, title)));
  };
  const fileLabel = (key: string, label: string) => (busy.has(key) ? copy.export.fileBusy : label);
  const shareLabel = (format: RevisionFileFormat, label: string) => (busy.has(`share:${format}`) ? copy.export.sharing : label);
  const fileError = (...keys: string[]) =>
    failed !== null && keys.includes(failed) ? (
      failedSession ? (
        <SessionExpiredNote />
      ) : (
        <div className="gen-error" role="alert">
          <span>{copy.export.fileFailed}</span>
        </div>
      )
    ) : null;

  const entityState = useLiveQuery(() => (db === null ? Promise.resolve(null) : relatorioState(db, relatorioId)), [db, relatorioId], null);
  const snapshot = useRelatorioSnapshot(entityState, relatorioId);
  // Story 8.6: the device's pending suggestion rows (section 9's warning and the sheets count).
  const pending = useMemo(() => (entityState === null ? [] : pendingSuggestions(suggestionRowsOf(entityState, relatorioId))), [entityState, relatorioId]);
  const computed = useMemo(() => (snapshot === null ? null : progress(snapshot, pending)), [snapshot, pending]);
  const issues = usePreIssue(db, snapshot, computed, pending);
  const precheck = useMemo(() => exportPrecheck(issues), [issues]);
  // F-03 (D1): with empty sheets or blank fields, "Gerar relatório" first asks, naming the counts.
  const confirmCounts = useIssueConfirmation(snapshot);
  const confirmText = confirmCounts === null ? null : issueConfirmText(confirmCounts);
  const [confirming, setConfirming] = useState(false);
  const confirmId = useId();
  const generateRowRef = useRef<HTMLDivElement | null>(null);
  const wasConfirming = useRef(false);
  // A press before the relatório is read waits for the counts, so it never skips the question.
  const [pendingPress, setPendingPress] = useState(false);
  useEffect(() => {
    if (isOpen) return;
    setConfirming(false);
    setPendingPress(false);
  }, [isOpen]);
  useEffect(() => {
    // "Voltar" (or the issue itself) hands the focus back to the row's own primary.
    if (wasConfirming.current && !confirming) generateRowRef.current?.querySelector<HTMLElement>('.btn-primary')?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  const onGenerate = () => {
    if (confirmCounts === null) setPendingPress(true);
    else if (confirmText === null) state.start();
    else setConfirming(true);
  };
  useEffect(() => {
    if (!pendingPress || confirmCounts === null) return;
    setPendingPress(false);
    if (confirmText === null) state.start();
    else setConfirming(true);
  }, [pendingPress, confirmCounts, confirmText, state]);
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
    <div className="generate-row" ref={generateRowRef}>
      {options.withPreview ? previewButton : null}
      <Button
        variant="primary"
        isDisabled={options.disabledReason !== undefined}
        disabledReasonId={options.disabledReason === undefined ? undefined : generateReasonId}
        onPress={onGenerate}
      >
        {phase.kind === 'flushing' || phase.kind === 'requesting' || phase.kind === 'working' ? copy.export.generating : copy.export.generate}
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
    const revision = readyRevision;
    const meta = revision === null ? null : revisionMetaSegments(revision, whoOf(revision));
    const docxRef: RevisionFileRef | null = revision === null ? null : { revisionId: revision.id, number: revision.number, format: 'docx' };
    const pdfRef: RevisionFileRef | null = revision === null ? null : { revisionId: revision.id, number: revision.number, format: 'pdf' };
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
              onPress={() => docxRef !== null && download('result:docx', docxRef)}
            >
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-download" />
              </svg>
              <span className="rr-text">{fileLabel('result:docx', copy.export.openDocx)}</span>
            </AriaButton>
            {revision === null ? (
              <span className="btn-reason" id={downloadingReasonId}>
                {copy.export.downloadingRevision}
              </span>
            ) : hasShareSheet() && docxRef !== null ? (
              <AriaButton className="icon-btn" aria-label={shareLabel('docx', copy.export.shareDocx)} aria-busy={busy.has('share:docx') || undefined} onPress={() => share(docxRef, readyTitle(phase.number))}>
                <svg className="ico" aria-hidden="true">
                  <use href="/sprite.svg#i-share" />
                </svg>
              </AriaButton>
            ) : null}
          </div>
          <div className="result-row">
            {/* The PDF waits on the same pulled revision, described by the DOCX row's reason. */}
            <AriaButton
              className="rr-open"
              aria-disabled={revision === null || undefined}
              aria-describedby={revision === null ? downloadingReasonId : undefined}
              onPress={() => pdfRef !== null && download('result:pdf', pdfRef)}
            >
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-download" />
              </svg>
              <span className="rr-text">{fileLabel('result:pdf', copy.export.openPdf)}</span>
            </AriaButton>
            {pdfRef !== null && hasShareSheet() ? (
              <AriaButton className="icon-btn" aria-label={shareLabel('pdf', copy.export.sharePdf)} aria-busy={busy.has('share:pdf') || undefined} onPress={() => share(pdfRef, readyTitle(phase.number))}>
                <svg className="ico" aria-hidden="true">
                  <use href="/sprite.svg#i-share" />
                </svg>
              </AriaButton>
            ) : null}
          </div>
        </div>
        {fileError('result:docx', 'share:docx', 'result:pdf', 'share:pdf')}
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
    // The question stands only while it can still be answered: a reason (offline, a blocker,
    // a flush) or counts that dropped to zero put it away, never to come back without a press.
    const asking = confirming && disabledReason === undefined && confirmText !== null;
    if (confirming && !asking) setConfirming(false);
    const reason =
      phase.kind === 'blocked' ? copy.export.deadOpsReason : phase.kind === 'failed' ? failedReason(idleNumber) : idleReason(idleNumber);
    body = (
      <>
        {phase.kind === 'failed' && phase.sessionExpired === true ? <SessionExpiredNote /> : null}
        {phase.kind === 'failed' && phase.sessionExpired !== true ? (
          <div className="gen-error" role="alert">
            <span>{copy.export.failed}</span>
            {phase.missingFiles === undefined ? null : <span>{missingFilesText(phase.missingFiles)}</span>}
            {blocked ? null : <TextButton onPress={onGenerate}>{copy.export.retry}</TextButton>}
          </div>
        ) : null}
        {asking ? (
          // F-03 (D1): the question names what prints blank; "Pré-visualizar" is offered first,
          // "Voltar" issues nothing, and only "Emitir mesmo assim" issues.
          <div className="issue-confirm" role="group" aria-labelledby={confirmId}>
            <p className="t-body" id={confirmId}>
              {confirmText}
            </p>
            <div className="generate-row">
              {previewButton}
              <Button variant="secondary" autoFocus onPress={() => setConfirming(false)}>
                {copy.export.issueConfirmBack}
              </Button>
              <Button
                variant="primary"
                onPress={() => {
                  setConfirming(false);
                  state.start();
                }}
              >
                {copy.export.issueConfirmIssue}
              </Button>
            </div>
          </div>
        ) : (
          generateRow({ disabledReason, reason, withPreview: true })
        )}
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

        {!aiFeatures || phase.kind === 'ready' ? null : (
          // Story 13.8: after "Antes de emitir", before the document control. Information only:
          // nothing here changes the rows above, the count, the confirmation or "Gerar relatório".
          <div className="audit-block">
            <p className="field-label">{copy.audit.heading}</p>
            <p className="audit-note">{copy.audit.note}</p>
            <AuditFindings run={audit.display.done} onSee={onSeeAuditTarget} />
            {audit.failed ? (
              <div className="gen-error" role="alert">
                <span>{copy.audit.failed}</span>
              </div>
            ) : null}
            <div className="audit-actions">
              <Button
                variant="secondary"
                isDisabled={!audit.online || audit.running}
                disabledReason={!audit.online ? copy.audit.offlineReason : audit.running ? copy.audit.runningReason : undefined}
                onPress={audit.start}
              >
                {audit.running ? copy.audit.running : copy.audit.start}
              </Button>
            </div>
          </div>
        )}

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
            {snapshot === null || empresaRegistered(snapshot.empresa) ? null : <p className="pc-meta export-empresa-missing">{copy.export.empresaMissing}</p>}
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
          preview.phase.sessionExpired === true ? (
            <SessionExpiredNote />
          ) : (
            <div className="gen-error" role="alert">
              <span>{copy.export.previewFailed}</span>
            </div>
          )
        ) : null}
      </div>
      <div>
        <p className="field-label revisions-label">{copy.export.revisionsLabel}</p>
        {revisions.length === 0 ? (
          <p className="section-note">{copy.export.noRevisions}</p>
        ) : (
          revisions.map((row) => {
            const segments = revisionRowSegments(row, whoOf(row));
            const docxKey = `revision:${row.id}:docx`;
            const pdfKey = `revision:${row.id}:pdf`;
            return (
              <Fragment key={row.id}>
                <div className="revision-row">
                  <span className="rev-text">
                    {segments.before}
                    <time dateTime={segments.datetime}>{segments.dateText}</time>
                    {segments.after}
                  </span>
                  <span className="rev-files">
                    <TextButton onPress={() => download(docxKey, { revisionId: row.id, number: row.number, format: 'docx' })}>
                      <svg className="ico" aria-hidden="true">
                        <use href="/sprite.svg#i-download" />
                      </svg>
                      {fileLabel(docxKey, copy.export.revisionDocx)}
                    </TextButton>
                    <TextButton onPress={() => download(pdfKey, { revisionId: row.id, number: row.number, format: 'pdf' })}>
                      <svg className="ico" aria-hidden="true">
                        <use href="/sprite.svg#i-download" />
                      </svg>
                      {fileLabel(pdfKey, copy.export.revisionPdf)}
                    </TextButton>
                  </span>
                </div>
                {fileError(docxKey, pdfKey)}
              </Fragment>
            );
          })
        )}
      </div>
    </DialogShell>
  );
}
