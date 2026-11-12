/*
 * Story 25.3 (M03): every local commit that leaves an op in the outbox says so here, once its
 * transaction has committed. `db/commit.ts` is the one place a commit of this device passes
 * (pulls do not), so it announces; the sync provider listens and asks the engine to send it,
 * coalescing the announcements of `COMMIT_SYNC_WINDOW_MS` into one push-only pass (fix batch e25x,
 * A2: `SyncEngine.pushNow`, `state/sync.tsx`).
 * Nothing here knows the engine, and a listener's failure never reaches the write.
 */

/**
 * Story 25.3, Design Notes D1: the coalescing window. Fixed from the first announcement and
 * never restarted, so continuous typing never starves it: the first edit is sent within this
 * window plus one cycle.
 */
export const COMMIT_SYNC_WINDOW_MS = 2_000;

type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribes to this device's commits; returns the unsubscribe. */
export function onCommit(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Called by `db/commit.ts` after a transaction that wrote at least one outbox op has committed. */
export function announceCommit(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      console.error('commit listener failed', error);
    }
  }
}
