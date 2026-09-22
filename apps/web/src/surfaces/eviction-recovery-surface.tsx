import { PRODUTO, serverHoldsText } from '@app/domain';
import { useEffect, useId, useState } from 'react';
import { Button, TextButton } from '../components/index.ts';
import { copy } from '../copy/pt-br.ts';
import { useSession } from '../state/session.tsx';
import { useSync } from '../state/sync.tsx';

/**
 * AD-8: "if the origin's storage was evicted (session cookie present, database absent),
 * the app shows a one-time screen naming what the server holds and re-pulls".
 *
 * A full-surface replacement, like `ContractOutdatedSurface`: the user has a live
 * session and an empty device, and the one thing worth doing is downloading. What the
 * server holds is read from the company pull the sync engine already did; before that
 * pull there is nothing to count, and the screen says so rather than inventing a number.
 * No mock exists, so every string is authored.
 */
export function EvictionRecoverySurface() {
  const titleId = useId();
  const session = useSession();
  const sync = useSync();
  const [failed, setFailed] = useState(false);
  /** True between "the cycle we asked for returned" and "its outcome has been read". */
  const [awaitingOutcome, setAwaitingOutcome] = useState(false);

  const relatorios = sync.summaryRelatorios.length;
  const users = Object.keys(sync.userNames).length;
  const known = relatorios > 0 || users > 0;
  // Same contract as Sync status: a disabled control always carries its reason.
  const disabledReason = sync.running
    ? copy.recovery.running
    : !sync.online
      ? copy.recovery.offlineReason
      : undefined;

  const run = async () => {
    setFailed(false);
    const result = await sync.syncNow();
    // `busy` means the launch cycle is already doing this very pull: neither dismiss the
    // screen nor call it a failure, just let the user press again.
    if (result === 'busy') return;
    if (result !== 'ran') {
      setFailed(true);
      return;
    }
    // `ran` is not "worked": the engine swallows a phase failure and still answers
    // `ran`, so the verdict is read from `lastFailure` on the render after the cycle.
    setAwaitingOutcome(true);
  };

  useEffect(() => {
    if (!awaitingOutcome) return;
    setAwaitingOutcome(false);
    // A device that went offline mid-cycle records no failure (it is not the server's),
    // but the pull did not finish either.
    if (sync.lastFailure === null && sync.online) session.dismissRecovery();
    else setFailed(true);
  }, [awaitingOutcome, sync.lastFailure, sync.online, session]);

  return (
    <main className="screen" data-route="/recovery">
      <div className="content">
        <section className="section" aria-labelledby={titleId}>
          <div className="section-head">
            <h1 id={titleId}>{copy.recovery.title}</h1>
          </div>
          <p className="t-body">{copy.recovery.body(PRODUTO)}</p>
          <p className="t-body" data-testid="recovery-holds">
            {known ? serverHoldsText(relatorios, users) : copy.recovery.holdsUnknown}
          </p>
          {failed ? (
            <p className="section-note" role="alert">
              {copy.recovery.failed}
            </p>
          ) : null}
          <p style={{ marginTop: 'var(--sp-5)' }}>
            <Button
              onPress={() => void run()}
              isDisabled={disabledReason !== undefined}
              disabledReason={disabledReason}
            >
              {copy.recovery.action}
            </Button>
          </p>
          {/*
            The way out. `navigator.onLine` can be true with the server unreachable, and
            then the primary action fails every time: without this the user is held on a
            screen whose only action cannot succeed, with no path to Home.
          */}
          <p className="section-note">{copy.recovery.skipNote}</p>
          <p>
            <TextButton onPress={() => session.dismissRecovery()}>{copy.recovery.skipAction}</TextButton>
          </p>
        </section>
      </div>
    </main>
  );
}
