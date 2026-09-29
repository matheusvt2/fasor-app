import { formatShortDateTime, rejectedText, syncBadgeLabel } from '@app/domain';
import { useId, useState } from 'react';
import { Button, TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { useSync } from '../../state/sync.tsx';
import { DecisionsSection, DownloadingSection, HowItWorks, LastSendSection, ReadingsSection, SendingSection } from './sync-sections.tsx';
import { ResolvableDecisions } from './resolvable-decisions.tsx';
import './sync.css';

const NO_ROWS: readonly never[] = [];
const NO_UPLOADS = { rows: NO_ROWS, more: 0 };

/**
 * Sync status (FR-60, UX-DR13), the whole `mockups/prototype/screens/85-sync.html` surface:
 * the headline with the badge word and the kernel's counts, "Como funciona a mesclagem"
 * behind a collapsed disclosure, the compact summary badges, the primary "Sincronizar
 * agora" (decision C-4 puts it at the top, over the mock's foot text button), the cause
 * line, the rejected row, then Leituras, Enviando, Baixando, Último envio,
 * Decisões (with "Mesclado automaticamente") and the foot. Every row, count and word is the
 * kernel's; nothing here is a live region (epic-10 Conflict 8: the badge announces).
 */
export function SyncStatusSurface() {
  const sync = useSync();
  const titleId = useId();
  const [resending, setResending] = useState(false);

  const word = syncBadgeLabel(sync.badgeState, sync.counts);
  const decisions = sync.decisions ?? NO_ROWS;
  // E10-Q7: the headline, the badges and the Decisões count are the state's (kernel), never recounted here.
  const headline = sync.headline;
  const badges = sync.summaryBadges;
  const disabledReason = sync.running ? copy.sync.syncing : !sync.online ? copy.sync.offlineReason : undefined;

  async function resend() {
    if (resending) return;
    setResending(true);
    try {
      await sync.resendDead();
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="screen" data-route="/sync">
      <div className="content">
        <section className="section" aria-labelledby={titleId}>
          <div className="section-head">
            {/* The surface title is the App bar's <h1> (`shell-head.html`); the section keeps its own heading. */}
            <h2 id={titleId}>{copy.sync.title}</h2>
          </div>
          {/* The mock's `role="status"` is dropped (epic-10 Conflict 8): the surface is not live. */}
          <div className="sync-headline" data-tone={sync.badgeState}>
            <span className="sh-state">
              <span className="dot" aria-hidden="true" />
              {word}
            </span>
            <span className="sh-counts">{headline}</span>
            <HowItWorks />
          </div>

          {badges.length > 0 ? (
            <div className="sync-summary" data-testid="sync-summary">
              {badges.map((badge) => (
                <span className="sync-badge is-compact" data-state={badge.state} key={badge.state}>
                  <span className="pill">
                    <span className="dot" aria-hidden="true" />
                    {badge.text}
                  </span>
                </span>
              ))}
            </div>
          ) : null}

          <div className="sync-actions">
            <Button
              isDisabled={disabledReason !== undefined}
              disabledReason={disabledReason}
              onPress={() => void sync.syncNow()}
            >
              {copy.sync.syncNow}
            </Button>
          </div>

          {/* The badge reads "Sem conexão" for both causes (kernel); this line names the real one. */}
          {sync.online && sync.unreachable !== null ? (
            <p className="section-note sync-cause" data-testid="sync-unreachable">
              {sync.unreachable === 'session' ? copy.sync.sessionExpired : copy.sync.serverUnreachable}
            </p>
          ) : null}

          {sync.counts.dead > 0 ? (
            <ul className="sync-list">
              <li className="sync-row" data-testid="sync-rejected-row">
                <span className="sr-body">
                  <span className="sr-primary">{rejectedText(sync.counts.dead)}</span>
                </span>
                <span className="sr-state">
                  <TextButton
                    isDisabled={resending || !sync.online}
                    disabledReason={resending ? copy.sync.syncing : !sync.online ? copy.sync.offlineReason : undefined}
                    onPress={() => void resend()}
                  >
                    {copy.sync.resend}
                  </TextButton>
                </span>
              </li>
            </ul>
          ) : null}
        </section>

        <ReadingsSection sync={sync} rows={sync.readingsQueued ?? NO_ROWS} />
        <SendingSection
          sheets={sync.pendingSheets ?? NO_ROWS}
          uploads={sync.uploads ?? NO_UPLOADS}
          onRetry={(fileId) => void sync.retryUpload?.(fileId)}
        />
        <DownloadingSection rows={sync.downloads ?? NO_ROWS} />
        <LastSendSection sync={sync} />
        {/* Stories 10.2/10.3 (the X/S seam): with the provider's held decisions the rows carry
            their resolutions; the host stays mounted while the list is empty, so the undo toast
            of the last resolved one outlives its row. */}
        {sync.heldDecisions === undefined ? (
          <DecisionsSection decisions={decisions} merges={sync.merges} count={sync.decisionCount} />
        ) : (
          <ResolvableDecisions held={sync.heldDecisions} decisions={decisions} merges={sync.merges} />
        )}

        <p className="sync-foot">
          {sync.lastSyncAt === null ? (
            copy.sync.neverSynced
          ) : (
            <>
              {copy.sync.lastSync} <time dateTime={sync.lastSyncAt}>{formatShortDateTime(sync.lastSyncAt)}</time>
            </>
          )}{' '}
          · {copy.sync.footNote}
        </p>
      </div>
    </main>
  );
}
