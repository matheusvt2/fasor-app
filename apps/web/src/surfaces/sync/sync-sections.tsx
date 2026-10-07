import {
  avatarInitial,
  decisionsCountText,
  lastSendText,
  leiturasNaFilaText,
  morePhotosText,
  sendingCounts,
  sendingGroupText,
  SYNC_ROW_STATE_TEXT,
  sugestoesText,
  type DownloadRow,
  type PendingPhotoRow,
  type PendingSheetRow,
  type QueuedReadingRow,
  type SyncDecisionRow,
} from '@app/domain';
import { useId, type ReactNode } from 'react';
import { UploadPill } from '../../components/photo-row.tsx';
import { copy } from '../../copy/pt-br.ts';
import type { SyncState } from '../../state/sync.tsx';

/*
 * Story 10.4 (FR-60): the sections of `85-sync.html` below the headline, in its order. Each
 * renders the kernel's rows (`packages/domain/src/sync/status.ts`) in the mock's elements
 * and derives nothing. None is a live region: the badge announcer is the only one (epic-10
 * Conflict 8).
 */

/** The `.progress-track` of a row's state, decoration only (the text beside it says the figure). */
function ProgressTrack({ percent }: { percent: number }) {
  return (
    <span className="progress-track" aria-hidden="true">
      <i style={{ width: `${percent}%` }} />
    </span>
  );
}

/** "Como funciona a mesclagem": collapsed by default, the explanations behind it (`85-sync.html` lines 36-47). */
export function HowItWorks() {
  const how = copy.sync.how;
  return (
    <details className="sync-how">
      <summary className="sh-how">
        <svg className="ico" aria-hidden="true">
          <use href="/sprite.svg#i-chev-down" />
        </svg>
        {how.label}
      </summary>
      <div className="how-body">
        <p>{how.intro}</p>
        <ul>
          {how.rules.map((rule) => (
            <li key={rule.strong}>
              <strong>{rule.strong}</strong> {rule.text}
            </li>
          ))}
        </ul>
        <p>
          {how.closing.before} <strong>{how.closing.strong}</strong> {how.closing.after}
        </p>
      </div>
    </details>
  );
}

/** Story 8.2 and 10.4: the readings still queued, one row per photo, and the suggestions waiting for a tap. */
export function ReadingsSection({ sync, rows }: { sync: SyncState; rows: readonly QueuedReadingRow[] }) {
  const headingId = useId();
  if (sync.counts.readings_queued === 0 && sync.counts.suggestions_pending === 0) return null;
  return (
    <section className="section" aria-labelledby={headingId} data-testid="sync-readings">
      <div className="section-head">
        <h2 id={headingId}>{copy.sync.readingsHeading}</h2>
      </div>
      <ul className="sync-list">
        {rows.map((row) => (
          <li className="sync-row" key={row.id} data-testid="sync-reading-row" data-photo-id={row.id}>
            <span className="sr-body">
              <span className="sr-primary">{row.primary}</span>
              {row.secondary === '' ? null : <span className="sr-secondary">{row.secondary}</span>}
            </span>
            <span className="sr-state" data-tone="pending">
              {row.stateText}
            </span>
          </li>
        ))}
        {sync.counts.readings_queued > 0 ? (
          <li className="sync-row" data-testid="sync-readings-queued">
            <span className="sr-body">
              <span className="sr-primary">{leiturasNaFilaText(sync.counts.readings_queued)}</span>
            </span>
            <span className="sr-state" data-tone="pending" />
          </li>
        ) : null}
        {sync.counts.suggestions_pending > 0 ? (
          <li className="sync-row" data-testid="sync-suggestions-pending">
            <span className="sr-body">
              <span className="sr-primary">{sugestoesText(sync.counts.suggestions_pending)}</span>
            </span>
            <span className="sr-state" data-tone="pending" />
          </li>
        ) : null}
      </ul>
    </section>
  );
}

/** "Enviando": the sheets with unsent ops, then the photos still to upload (errors retry from their pill). */
export function SendingSection({
  sheets,
  uploads,
  onRetry,
}: {
  sheets: readonly PendingSheetRow[];
  uploads: { rows: readonly PendingPhotoRow[]; more: number };
  onRetry: (fileId: string) => void;
}) {
  const headingId = useId();
  const moreId = useId();
  // E10-Q7: the group figures are the kernel's.
  const totals = sendingCounts(sheets, uploads);
  if (totals.sheets === 0 && totals.photos === 0) return null;
  return (
    <section className="section" aria-labelledby={headingId} data-testid="sync-sending">
      <div className="section-head">
        <h2 id={headingId}>{copy.sync.sendingHeading}</h2>
      </div>
      <p className="section-note">{copy.sync.sendingNote}</p>
      {totals.sheets > 0 ? (
        <>
          <p className="field-label sync-group-label">{sendingGroupText('sheets', totals.sheets)}</p>
          <ul className="sync-list">
            {sheets.map((row) => (
              <li className="sync-row" key={row.block_id} data-testid="sync-sheet-row" data-block-id={row.block_id}>
                <span className="sr-body">
                  <span className="sr-primary">{row.primary}</span>
                  <span className="sr-secondary">{row.secondary}</span>
                </span>
                <span className="sr-state" data-tone="pending">
                  {row.stateText}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {totals.photos > 0 ? (
        <>
          <p className="field-label sync-group-label">{sendingGroupText('photos', totals.photos)}</p>
          <ul className="sync-list">
            {uploads.rows.map((row) => (
              <li className="sync-row" key={row.id} data-testid="sync-photo-row" data-photo-id={row.id}>
                <span className="sr-body">
                  <span className="sr-primary">{row.primary}</span>
                  {row.secondary === '' ? null : <span className="sr-secondary">{row.secondary}</span>}
                </span>
                <UploadPill state={row.state} onRetry={() => onRetry(row.id)} />
              </li>
            ))}
            {uploads.more > 0 ? (
              <li className="sync-row" data-testid="sync-photo-more">
                <span className="sr-body">
                  <span className="sr-secondary" id={moreId}>
                    {morePhotosText(uploads.more)}
                  </span>
                </span>
              </li>
            ) : null}
          </ul>
        </>
      ) : null}
    </section>
  );
}

/** "Baixando": each relatório still coming down, with its line and percent. */
export function DownloadingSection({ rows }: { rows: readonly DownloadRow[] }) {
  const headingId = useId();
  if (rows.length === 0) return null;
  return (
    <section className="section" aria-labelledby={headingId} data-testid="sync-downloading">
      <div className="section-head">
        <h2 id={headingId}>{copy.sync.downloadingHeading}</h2>
      </div>
      <p className="section-note">{copy.sync.downloadingNote}</p>
      <ul className="sync-list">
        {rows.map((row) => (
          <li className="sync-row" key={row.relatorio_id} data-testid="sync-download-row" data-relatorio-id={row.relatorio_id}>
            <span className="sr-body">
              <span className="sr-primary">{row.primary}</span>
              <span className="sr-secondary">{row.secondary}</span>
            </span>
            <span className="sr-state" data-tone="pending">
              {row.percentText}
              {row.percent === null ? null : <ProgressTrack percent={row.percent} />}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Último envio": one row per `(user, device)` with the kernel's sentence. */
export function LastSendSection({ sync }: { sync: SyncState }) {
  const headingId = useId();
  return (
    <section className="section" aria-labelledby={headingId}>
      <div className="section-head">
        <h2 id={headingId}>{copy.sync.lastPushHeading}</h2>
      </div>
      <p className="section-note">{copy.sync.lastPushNote}</p>
      {sync.lastPushAt.length === 0 ? (
        <p className="section-note">{copy.sync.noPushYet}</p>
      ) : (
        <ul className="sync-list">
          {sync.lastPushAt.map((push) => {
            const name = sync.userNames[push.user_id] ?? push.user_id;
            const mine = push.device_id === sync.deviceId;
            return (
              <li className="sync-row" key={`${push.user_id}:${push.device_id}`} data-testid="sync-last-send-row">
                <span className="avatar" aria-hidden="true">
                  {avatarInitial(name)}
                </span>
                <span className="sr-body">
                  <span className="sr-primary">{lastSendText(name, push.at)}</span>
                  {/* F-14: no device word until this device's id is known, so its own row is never "Outro aparelho". */}
                  {sync.deviceId === null ? null : <span className="sr-secondary">{mine ? copy.sync.thisDevice : copy.sync.otherDevice}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * "Decisões": the open contradictions as conflict banners (Stories 10.2/10.3 fill the list and
 * wire the buttons; the banners are not `role="alert"` here, the surface is not live), then
 * "Mesclado automaticamente", the merges by rule of this tab session (Story 10.1).
 */
export function DecisionsSection({
  decisions,
  merges,
  count,
  actions,
}: {
  decisions: readonly SyncDecisionRow[];
  merges: SyncState['merges'];
  /** Stories 10.2/10.3: how many decisions wait (`decisionTotal`: one per contradicting cell, one per structure case; E10-Q7, never the rows' length). */
  count: number;
  /** Stories 10.2/10.3: a row's buttons (`.banner-actions`), from the host that resolves it. */
  actions?: (row: SyncDecisionRow) => ReactNode;
}) {
  const headingId = useId();
  if (decisions.length === 0 && merges.length === 0) return null;
  return (
    <section className="section" aria-labelledby={headingId} data-testid="sync-decisions">
      <div className="section-head">
        <h2 id={headingId}>{copy.sync.decisionsHeading}</h2>
        {decisions.length > 0 ? (
          <span className="sync-badge is-compact" data-state="conflict">
            <span className="pill">
              <span className="dot" aria-hidden="true" />
              {decisionsCountText(count)}
            </span>
          </span>
        ) : null}
      </div>
      <p className="section-note">{copy.sync.decisionsNote}</p>
      {decisions.length > 0 ? (
        <div className="conflict-list">
          {decisions.map((decision) => (
            <div className="banner" data-variant="conflict" key={decision.key} data-testid="sync-decision-row" data-kind={decision.kind}>
              <span className="banner-text">{decision.text}</span>
              {actions === undefined ? null : <span className="banner-actions">{actions(decision)}</span>}
            </div>
          ))}
        </div>
      ) : null}
      {merges.length > 0 ? (
        <>
          <p className="field-label sync-group-label is-spaced">{copy.sync.mergedLabel}</p>
          <ul className="sync-list">
            {merges.map((merge) => (
              <li className="sync-row" key={merge.key} data-testid="sync-merge-row" data-rule={merge.info.rule}>
                <span className="sr-body">
                  <span className="sr-primary">{merge.text}</span>
                  {merge.secondary === undefined || merge.secondary === '' ? null : <span className="sr-secondary">{merge.secondary}</span>}
                </span>
                <span className="sr-state" data-tone="ok">
                  {SYNC_ROW_STATE_TEXT.merged}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
