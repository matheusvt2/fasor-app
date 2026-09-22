import { useEffect } from 'react';
import { outboxBacklog } from '../db/sync-store.ts';
import type { AppDatabase } from '../db/schema.ts';
import { promoteWaitingShell } from './register.ts';

/*
 * AD-8: "the service worker activates a new shell on the next launch only when the
 * outbox is empty". This is that launch. It runs once per mounted session, for a
 * signed-in user with a database, so the backlog it counts is the one that matters.
 */

/** Asks the waiting shell to take over, once, if and only if the backlog is zero. */
export function useShellUpdate(db: AppDatabase | null): void {
  useEffect(() => {
    if (db === null) return;
    const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
    if (container === undefined || container.ready === undefined) return;
    let cancelled = false;
    void container.ready
      .then(async (registration) => {
        if (cancelled) return;
        await promoteWaitingShell(registration, () => outboxBacklog(db));
      })
      // A refused worker, a closed database: the old shell keeps serving and the next
      // launch tries again. Never a reason to interrupt the session.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [db]);
}
