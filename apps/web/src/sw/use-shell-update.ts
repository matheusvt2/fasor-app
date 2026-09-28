import { useEffect } from 'react';
import { useLiveQuery } from '../db/live.ts';
import { outboxBacklog } from '../db/sync-store.ts';
import { databaseName, type AppDatabase } from '../db/schema.ts';
import { holdShell, promoteWaitingShell } from './register.ts';

/*
 * AD-8: "the service worker activates a new shell on the next launch only when the outbox
 * is empty". Both halves of that rule live here, because the page is the only thing that
 * can read the user's per-user Dexie database:
 *
 *   - the waiting worker is promoted when the backlog is zero;
 *   - on every backlog change the active worker is told whether to hold (backlog above
 *     zero), whether or not a new shell is waiting: the worker keeps the hold as a pin
 *     in Cache Storage, so navigations keep coming from the shell the job started on even
 *     after the browser activates the new worker on its own, and the pin is released the
 *     moment the backlog reaches zero.
 *
 * The backlog is a live query rather than a single read, because the hold has to be
 * released the moment the last op is acked, not on the next launch.
 */

/** Unknown until Dexie answers: neither promote nor release the hold on a guess. */
const UNKNOWN: number | null = null;

/**
 * `userId` is the signed-in user, whose outbox `db` is: the worker keeps one hold per
 * user, so one user's empty outbox never releases another's (AD-8). Nothing is reported
 * while the open database is not that user's (a sign-in switching users).
 */
export function useShellUpdate(db: AppDatabase | null, userId: string | null): void {
  const owner = db !== null && userId !== null && db.name === databaseName(userId) ? userId : null;
  const backlog = useLiveQuery(
    () => (db === null ? Promise.resolve(UNKNOWN) : outboxBacklog(db)),
    [db],
    UNKNOWN,
  );

  useEffect(() => {
    if (db === null || owner === null || backlog === null) return;
    const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
    if (container === undefined || container.ready === undefined) return;
    let cancelled = false;
    void container.ready
      .then(async (registration) => {
        if (cancelled) return;
        holdShell(registration, backlog, owner);
        await promoteWaitingShell(registration, () => Promise.resolve(backlog), owner);
      })
      // A refused worker, a closed database: the old shell keeps serving and the next
      // launch tries again. Never a reason to interrupt the session.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [db, owner, backlog]);
}
