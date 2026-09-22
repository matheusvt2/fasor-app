import { useEffect } from 'react';
import { useLiveQuery } from '../db/live.ts';
import { outboxBacklog } from '../db/sync-store.ts';
import type { AppDatabase } from '../db/schema.ts';
import { holdShell, promoteWaitingShell } from './register.ts';

/*
 * AD-8: "the service worker activates a new shell on the next launch only when the outbox
 * is empty". Both halves of that rule live here, because the page is the only thing that
 * can read the user's per-user Dexie database:
 *
 *   - the waiting worker is promoted when the backlog is zero;
 *   - until then the active worker is told to hold, so navigations keep coming from the
 *     shell the job started on instead of the network serving the new build's document.
 *
 * The backlog is a live query rather than a single read, because the hold has to be
 * released the moment the last op is acked, not on the next launch.
 */

/** Unknown until Dexie answers: neither promote nor release the hold on a guess. */
const UNKNOWN: number | null = null;

export function useShellUpdate(db: AppDatabase | null): void {
  const backlog = useLiveQuery(
    () => (db === null ? Promise.resolve(UNKNOWN) : outboxBacklog(db)),
    [db],
    UNKNOWN,
  );

  useEffect(() => {
    if (db === null || backlog === null) return;
    const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
    if (container === undefined || container.ready === undefined) return;
    let cancelled = false;
    void container.ready
      .then(async (registration) => {
        if (cancelled) return;
        holdShell(registration, backlog);
        await promoteWaitingShell(registration, () => Promise.resolve(backlog));
      })
      // A refused worker, a closed database: the old shell keeps serving and the next
      // launch tries again. Never a reason to interrupt the session.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [db, backlog]);
}
