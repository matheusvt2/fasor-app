import {
  avatarInitial,
  decisionKey,
  decisionText,
  formatShortDateTime,
  leiturasNaFilaText,
  rejectedText,
  sugestoesText,
  supersededText,
  syncBadgeLabel,
  uniqueHeldDecisions,
  type Decision,
} from '@app/domain';
import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import type { HeldDecisions } from '../../db/decision-store.ts';
import { useSync } from '../../state/sync.tsx';
import { ConflictDialog, type ConflictDialogDecision } from './conflict-dialog.tsx';
import { useDecisionActions, useDecisionTextContext, type DecisionActions } from './decision-actions.ts';
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
  const readingsId = useId();
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

          {sync.counts.dead > 0 || sync.supersededCount > 0 || sync.merges.length > 0 ? (
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
              {/* Story 10.1: one row per merge by rule of this session (`85-sync.html` "Mesclado
                  automaticamente" rows, minimal: the kernel's sentence only; Story 10.4 builds
                  the full section). */}
              {sync.merges.map((merge) => (
                <li className="sync-row" key={merge.key} data-testid="sync-merge-row" data-rule={merge.info.rule}>
                  <span className="sr-body">
                    <span className="sr-primary">{merge.text}</span>
                  </span>
                  <span className="sr-state" data-tone="ok" />
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {/* Story 8.2 (`85-sync.html` "Leituras"): the readings still queued and the suggestions
            still waiting for a tap on this device, each row only when it counts something. */}
        {sync.counts.readings_queued > 0 || sync.counts.suggestions_pending > 0 ? (
          <section className="section" aria-labelledby={readingsId} data-testid="sync-readings">
            <div className="section-head">
              <h2 id={readingsId}>{copy.sync.readingsHeading}</h2>
            </div>
            <ul className="sync-list">
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
        ) : null}

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

        {/* Mounted whenever the provider lists decisions (an empty list included), so the undo
            toast of the last resolved one outlives its row. */}
        {sync.decisions === undefined ? null : <DecisionsSection />}

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

/**
 * Stories 10.2/10.3 (`85-sync.html` lines 111-124, the X side of the X/S seam): the open
 * decisions of every relatório held on this device, one `.banner[data-variant=conflict]`
 * row each, never `role="alert"` (the surface is not live, epic-10 Conflict 8). A cell row
 * opens the Conflict view ("Resolver"); a removal row resolves in place ("Manter" /
 * "Remover"); a TAG row renames ("Renomear uma" opens the relatório's Sumário on the rename
 * dialog of the later one) or keeps both ("Manter as duas"). Rendered only when one waits.
 */
function DecisionsSection() {
  const sync = useSync();
  const headingId = useId();
  // A duplicate TAG referenced by two held relatórios of one project is one row.
  const held = useMemo(() => uniqueHeldDecisions(sync.decisions ?? []), [sync.decisions]);
  const actions = useDecisionActions();
  const [open, setOpen] = useState<{ relatorioId: string; key: string } | null>(null);
  const openEntry = open === null ? undefined : held.find((entry) => entry.relatorioId === open.relatorioId);
  const openDecision = openEntry?.decisions.find((decision) => decisionKey(decision) === open?.key);
  if (held.length === 0) return null;
  return (
    <section className="section" aria-labelledby={headingId} data-testid="sync-decisions">
      <div className="section-head">
        <h2 id={headingId}>{copy.sync.decisionsHeading}</h2>
      </div>
      <p className="section-note">{copy.sync.decisionsNote}</p>
      <div className="conflict-list">
        {held.flatMap((entry) =>
          entry.decisions.map((decision) => (
            <DecisionRow
              key={`${entry.relatorioId}:${decisionKey(decision)}`}
              entry={entry}
              decision={decision}
              onOpen={() => setOpen({ relatorioId: entry.relatorioId, key: decisionKey(decision) })}
              actions={actions}
            />
          )),
        )}
      </div>
      {openEntry === undefined || openDecision === undefined || openDecision.kind === 'duplicate_tag' ? null : (
        <DecisionDialog entry={openEntry} decision={openDecision} actions={actions} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}

function DecisionDialog({ entry, decision, actions, onClose }: { entry: HeldDecisions; decision: ConflictDialogDecision; actions: DecisionActions; onClose: () => void }) {
  const context = useDecisionTextContext(entry);
  return <ConflictDialog entry={entry} decision={decision} context={context} actions={actions} onClose={onClose} />;
}

function DecisionRow({ entry, decision, onOpen, actions }: { entry: HeldDecisions; decision: Decision; onOpen: () => void; actions: DecisionActions }) {
  const t = copy.conflict;
  const context = useDecisionTextContext(entry);
  const navigate = useNavigate();
  return (
    <div className="banner" data-variant="conflict" data-banner="decision" data-kind={decision.kind} data-testid="sync-decision-row">
      <span className="banner-text">{decisionText(decision, context)}</span>
      <span className="banner-actions">
        {decision.kind === 'cell' ? <TextButton onPress={onOpen}>{copy.sync.resolve}</TextButton> : null}
        {decision.kind === 'block_removal' ? (
          <>
            <TextButton onPress={() => void actions.keep(entry, decision, context)}>{t.keep}</TextButton>
            <TextButton tone="red" onPress={() => void actions.remove(entry, decision, context)}>
              {t.remove}
            </TextButton>
          </>
        ) : null}
        {decision.kind === 'duplicate_tag' ? (
          <>
            <TextButton onPress={() => void navigate(`/relatorio/${entry.relatorioId}`, { state: { renameEquipmentId: decision.later_equipment_id } })}>
              {t.renameOne}
            </TextButton>
            <TextButton onPress={() => void actions.keepBoth(entry, decision, context)}>{t.keepBoth}</TextButton>
          </>
        ) : null}
      </span>
    </div>
  );
}
