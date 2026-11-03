import { syncResultKind } from '@app/domain';
import type { AppDatabase } from '../db/schema.ts';
import { SyncRequestError } from '../sync/client.ts';
import type { CycleResult, EngineStatus } from '../sync/engine.ts';
import { flushTelemetry } from './flush.ts';
import { observeReadingResults } from './readings.ts';
import { track } from './track.ts';

/*
 * Epic 18 (AD-28), moved out of `state/sync.tsx` by Story 18.4 (retro finding A3): what the
 * sync engine and its requests say about usage, as pure functions over what they hand over.
 * `observeCycle` turns a status change into a `sync_result` (and drains the queue);
 * `failureCode` and `failureOutcome` read a failed request; `syncWaitOutcome` ends the
 * "Sincronizar agora" wait. Never touches the op log.
 */

/**
 * What a status change of the engine says about usage. A cycle that ran queues its
 * `sync_result`, looks for readings that landed, then drains the usage-event queue
 * (`flushTelemetry`); a cycle that found the device offline is tracked only on the way into
 * offline (the 60 s tick would otherwise write one row a minute); `busy` and `paused` track
 * nothing.
 */
export function observeCycle(db: AppDatabase, previous: EngineStatus, next: EngineStatus): void {
  try {
    if (previous.running && !next.running && next.lastResult === 'ran') {
      track({ name: 'sync_result', kind: syncResultKind({ outdated: next.outdated, failure: next.lastFailure }) });
      void observeReadingResults(db).then(() => flushTelemetry(db));
      return;
    }
    if (next.lastResult === 'offline' && previous.lastResult !== 'offline') track({ name: 'sync_result', kind: 'offline' });
  } catch {
    // An event is never worth a failure.
  }
}

/** The api error code a failed request carried, if any. */
export function failureCode(error: unknown): string | undefined {
  return error instanceof SyncRequestError && error.failure.kind === 'http' ? error.failure.code : undefined;
}

/** How a failed request ended, for its `wait`: no network `offline`, a 4xx `refused`, anything else `fail`. */
export function failureOutcome(error: unknown): 'offline' | 'refused' | 'fail' {
  if (error instanceof SyncRequestError && error.failure.kind === 'network') return 'offline';
  if (error instanceof SyncRequestError && error.failure.kind === 'http' && error.failure.status < 500) return 'refused';
  return 'fail';
}

/**
 * The outcome of a "Sincronizar agora" wait: how the cycle it ran ended (a 426 is `refused`;
 * a cycle that started online and lost the network reads `offline`, as the generate and
 * preview waits do, E18-A1 R-E2).
 */
export function syncWaitOutcome(result: CycleResult, status: Pick<EngineStatus, 'lastFailure' | 'outdated'>): 'ok' | 'fail' | 'offline' | 'refused' {
  if (result === 'offline') return 'offline';
  if (result === 'paused' || status.outdated) return 'refused';
  const failure = status.lastFailure;
  if (failure === null) return 'ok';
  return failure.kind === 'network' ? 'offline' : 'fail';
}
