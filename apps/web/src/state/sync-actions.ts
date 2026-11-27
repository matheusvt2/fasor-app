import { createContext, use } from 'react';
import { SyncContext, useSync as syncState, type SyncState } from './sync.tsx';

/*
 * W-8 (full review 2026-09-30): the sync provider's stable callbacks, apart from its live
 * data. A component that only acts (fetches a file, retries an upload, resends) reads these
 * through `useSyncActions()` and does not re-render when the outbox, a sync row or the
 * engine status changes, which happens on every committed keystroke. `useSync()` still
 * returns the whole state, actions included.
 */

/** The callbacks of `SyncState`, stable for the session. */
export type SyncActions = Pick<
  SyncState,
  'syncNow' | 'pullCompany' | 'syncRelatorio' | 'syncProject' | 'resendDead' | 'retryUpload' | 'fetchFile' | 'generate' | 'preview' | 'rereadPhoto' | 'audit' | 'retranscribeAudio' | 'aiWrite' | 'aiWriteOutcome'
>;

export const SyncActionsContext = createContext<SyncActions | null>(null);

/**
 * The provider's actions. A tree with no actions context (a test double that provides the
 * whole state, or mocks `useSync`) is served from the state, which carries the same
 * callbacks. Both contexts are read with `use`, which React allows after a condition, so
 * the state is never read (nor subscribed to) under the real provider.
 */
export function useSyncActions(): SyncActions {
  const actions = use(SyncActionsContext);
  if (actions !== null) return actions;
  return syncState();
}

/**
 * e26s (2026-11-22): the company pull for a surface that writes a server-only row through a route
 * (the roles grid, the user dialog): one pull now, so the device's store holds the new row at once.
 * A no-op where no sync provider is mounted (a surface's unit test).
 */
export function useCompanyPull(): () => void {
  const actions = use(SyncActionsContext);
  const state = use(SyncContext);
  const pull = actions?.pullCompany ?? state?.pullCompany;
  return () => {
    void pull?.().catch(() => undefined);
  };
}
