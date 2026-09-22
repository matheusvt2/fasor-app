import { avatarInitial, formatShortDateTime, rejectedText, supersededText, syncBadgeLabel } from '@app/domain';
import { useId, useState } from 'react';
import { Button, TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { useSync } from '../../state/sync.tsx';
import './sync.css';

/**
 * Sync status (FR-60), the headline of Epic 10's surface from
 * `mockups/prototype/screens/85-sync.html`: the headline with the badge word and the
 * kernel's pending summary, the primary "Sincronizar agora" (decision C-4 puts it at
 * the top, over the mock's foot text button), the dead-op row with "Reenviar" (the
 * Sumário pre-issue list of Epic 5 takes it over later), "Último envio" and the foot.
 */
export function SyncStatusSurface() {
  const sync = useSync();
  const titleId = useId();
  const lastPushId = useId();
  const [resending, setResending] = useState(false);

  const word = syncBadgeLabel(sync.badgeState, sync.counts);
  const counts = sync.pendingText === '' ? copy.sync.nothingPending : copy.sync.waiting(sync.pendingText);
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
          <div className="sync-headline" data-tone={sync.badgeState} role="status">
            <span className="sh-state">
              <span className="dot" aria-hidden="true" />
              {word}
            </span>
            <span className="sh-counts">{counts}</span>
          </div>
          {/* The badge reads "Sem conexão" for both causes (kernel); this line names the real one. */}
          {sync.online && sync.unreachable !== null ? (
            <p className="section-note sync-cause" data-testid="sync-unreachable">
              {sync.unreachable === 'session' ? copy.sync.sessionExpired : copy.sync.serverUnreachable}
            </p>
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

          {sync.counts.dead > 0 || sync.supersededCount > 0 ? (
            <ul className="sync-list">
              {sync.counts.dead > 0 ? (
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
              ) : null}
              {sync.supersededCount > 0 ? (
                <li className="sync-row" data-testid="sync-superseded-row">
                  <span className="sr-body">
                    <span className="sr-primary">{supersededText(sync.supersededCount)}</span>
                  </span>
                  <span className="sr-state" data-tone="ok" />
                </li>
              ) : null}
            </ul>
          ) : null}
        </section>

        <section className="section" aria-labelledby={lastPushId}>
          <div className="section-head">
            <h2 id={lastPushId}>{copy.sync.lastPushHeading}</h2>
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
                  <li className="sync-row" key={`${push.user_id}:${push.device_id}`}>
                    <span className="avatar" aria-hidden="true">
                      {avatarInitial(name)}
                    </span>
                    <span className="sr-body">
                      <span className="sr-primary">{name}</span>
                      <span className="sr-secondary">{mine ? copy.sync.thisDevice : copy.sync.otherDevice}</span>
                    </span>
                    <span className="sr-state">
                      <time dateTime={push.at}>{formatShortDateTime(push.at)}</time>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="sync-foot">
          {sync.lastSyncAt === null ? (
            copy.sync.neverSynced
          ) : (
            <>
              {copy.sync.lastSync} <time dateTime={sync.lastSyncAt}>{formatShortDateTime(sync.lastSyncAt)}</time>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
