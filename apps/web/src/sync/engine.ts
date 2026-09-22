import { isAutoPulled, SYNC_PUSH_MAX_OPS, toIso, type Clock, type NewId, type Op, type SyncSummary } from '@app/domain';
import { COMPANY_STREAM, type AppDatabase, type SyncStateRow } from '../db/schema.ts';
import {
  applyPulled,
  markAcked,
  markDead,
  markSent,
  readSyncState,
  takePending,
  writeSyncState,
} from '../db/sync-store.ts';
import { opOf } from '../db/commit.ts';
import type { Timers } from '../input/field-commit.ts';
import { SyncRequestError, type SyncClient, type SyncFailure } from './client.ts';
import { backoffMs, batches, classifyFailure, isUnreachableFailure, MAX_ATTEMPTS, parsePulled, type FailureAction } from './policy.ts';

/*
 * AD-8, AD-24: one fixed cycle, push -> pull company -> pull each relatorio, run
 * on launch, on `online`, every 60 s and on "Sincronizar agora". The timer, the
 * button and the events all call the same `runCycle()`; a mutex makes a
 * concurrent call a no-op.
 */

export type CycleResult = 'ran' | 'busy' | 'offline' | 'paused';

export interface EngineStatus {
  running: boolean;
  paused: boolean;
  /** A pull answered 426: pulls stop, pushes continue, the app shows "Atualizar". */
  outdated: boolean;
  lastResult: CycleResult | null;
  /**
   * The failure that ended a phase of the last finished cycle, or null when it ran clean.
   * Published when the cycle ends, never cleared when the next one starts: the badge reads
   * it (an unreachable server is not "Sincronizado"), and a retry in flight must not make
   * it flash back to ok before the server has actually answered.
   */
  lastFailure: SyncFailure | null;
  /** `superseded` entries reported since the tab opened (shown, never persisted). */
  supersededCount: number;
}

export interface SyncEngineDeps {
  db: AppDatabase;
  client: SyncClient;
  timers: Timers;
  random: () => number;
  now: Clock;
  newId: NewId;
  isOnline: () => boolean;
  onReAuth: () => void;
  onOutdated: () => void;
  onChange: (status: EngineStatus) => void;
  /** Subscribes to the `online` event; returns the unsubscribe. Defaults to `window`. */
  subscribeOnline?: (listener: () => void) => () => void;
  intervalMs?: number;
}

export interface SyncEngine {
  runCycle(): Promise<CycleResult>;
  /**
   * AD-8's "Em revisão and Emitido relatórios are pulled on open": creates the stream's
   * `sync_state` row and runs one cycle. From then on the existing pull rule — every
   * relatório that already holds a `sync_state` row — keeps it fresh, so no new route
   * and no new phase is needed.
   */
  syncRelatorio(relatorioId: string): Promise<CycleResult>;
  start(): void;
  /** Final: ends the in-flight cycle at its next step and silences the engine (a new session builds a new engine). */
  stop(): void;
  pause(): void;
  resume(): void;
  status(): EngineStatus;
}

export const SYNC_INTERVAL_MS = 60_000;

const defaultSubscribeOnline = (listener: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', listener);
  return () => window.removeEventListener('online', listener);
};

/** Thrown inside a cycle to end it: the policy said stop, re-auth or outdated, or the retries ran out. */
class PhaseEnd extends Error {
  constructor(
    readonly action: FailureAction | 'exhausted',
    readonly failure: SyncFailure,
  ) {
    super(`sync phase ended: ${action}`);
  }
}

function emptyState(id: string): SyncStateRow {
  return {
    id,
    cursor_seq: 0,
    complete: false,
    files_pending: 0,
    downloaded_at: null,
    last_sync_at: null,
    last_push_at: [],
  };
}

export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const intervalMs = deps.intervalMs ?? SYNC_INTERVAL_MS;
  const subscribeOnline = deps.subscribeOnline ?? defaultSubscribeOnline;
  const status: EngineStatus = {
    running: false,
    paused: false,
    outdated: false,
    lastResult: null,
    lastFailure: null,
    supersededCount: 0,
  };
  let timer: unknown = null;
  let unsubscribe: (() => void) | null = null;
  let started = false;
  /** Set by `stop()`: the in-flight cycle ends at its next step and reports nothing more. */
  let stopped = false;
  /** The failure of the cycle in flight; copied to `status.lastFailure` when it ends. */
  let cycleFailure: SyncFailure | null = null;
  /**
   * An `online` event arrived while a cycle was running. That cycle may already be past
   * its push, or ending on the offline check, so one more cycle runs as soon as it ends:
   * work committed offline must not wait for the 60 s tick (retro U3).
   */
  let onlineWhileRunning = false;

  const emit = () => {
    if (!stopped) deps.onChange({ ...status });
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      deps.timers.setTimeout(resolve, ms);
    });

  /** The phase end of a device that went offline: the next `online` event resumes, and it is no server verdict. */
  const OFFLINE: SyncFailure = { kind: 'network' };

  /**
   * Records a phase failure for this cycle. The device going offline is not recorded (the
   * badge says offline on its own, and after reconnecting nothing says the server failed),
   * and a failure that says the server was unreachable is never replaced by a later one
   * that does not (a push that hit 503, then a relatório pull that answered 404).
   */
  function recordFailure(failure: SyncFailure): void {
    if (failure === OFFLINE) return;
    if (cycleFailure !== null && isUnreachableFailure(cycleFailure) && !isUnreachableFailure(failure)) return;
    cycleFailure = failure;
  }

  /**
   * Runs a request with the retry table; throws PhaseEnd when the phase must end. Going
   * offline mid-cycle ends the phase at once: the `online` event is the next trigger, so
   * there is no retry storm against a dead network.
   */
  async function withRetry<T>(call: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      if (stopped || !deps.isOnline()) throw new PhaseEnd('stop', OFFLINE);
      try {
        return await call();
      } catch (error) {
        if (!(error instanceof SyncRequestError)) throw error;
        const action = classifyFailure(error.failure);
        if (action !== 'retry') throw new PhaseEnd(action, error.failure);
        if (attempt >= MAX_ATTEMPTS) throw new PhaseEnd('exhausted', error.failure);
        await sleep(backoffMs(attempt, deps.random));
      }
    }
  }

  async function pushPhase(): Promise<void> {
    const rows = await takePending(deps.db);
    if (rows.length === 0) return;
    // Every outbox row already carries this device's id: `commitBatch` stamps it (AD-3).
    for (const batch of batches(rows, SYNC_PUSH_MAX_OPS)) {
      const ops: Op[] = batch.map(opOf);
      await markSent(
        deps.db,
        ops.map((op) => op.op_id),
      );
      const response = await withRetry(() => deps.client.pushOps(ops));
      await markAcked(deps.db, response.applied);
      await markDead(deps.db, response.rejected);
      status.supersededCount += response.superseded.length;
      emit();
    }
  }

  /** Pulls one stream to its head, page by page; the cursor never passes an op the device cannot parse. */
  async function pullStream(
    id: string,
    fetchPage: (since: number) => Promise<{ ops: unknown[]; seq: number; summary?: SyncSummary }>,
  ): Promise<SyncSummary | undefined> {
    let state = (await readSyncState(deps.db, id)) ?? emptyState(id);
    let summary: SyncSummary | undefined;
    for (;;) {
      const previousCursor = state.cursor_seq;
      const page = await withRetry(() => fetchPage(previousCursor));
      summary ??= page.summary;
      const { ops, stoppedAt } = parsePulled(page.ops);
      try {
        await applyPulled(deps.db, ops);
      } catch (error) {
        // A row the schema refuses or a closed database: the stream ends here with the
        // cursor untouched, recorded as a failure, and the cycle carries on.
        if (error instanceof SyncRequestError) throw error;
        throw new PhaseEnd('stop', { kind: 'apply' });
      }
      const lastSeq = ops.at(-1)?.seq;
      const cursor = lastSeq === undefined ? previousCursor : Math.max(previousCursor, lastSeq);
      const complete = stoppedAt === undefined && cursor >= page.seq;
      const nowIso = toIso(deps.now());
      state = {
        ...state,
        cursor_seq: cursor,
        complete,
        downloaded_at: complete ? (state.downloaded_at ?? nowIso) : state.downloaded_at,
        last_sync_at: nowIso,
        last_push_at: page.summary?.last_push_at ?? state.last_push_at,
        // AD-8: the company summary is the only place a relatório the device never
        // downloaded appears. Story 1.5 read it and dropped it; Home needs it kept.
        relatorios: id === COMPANY_STREAM ? (page.summary?.relatorios ?? state.relatorios) : state.relatorios,
      };
      await writeSyncState(deps.db, state);
      // Stop on a bad op, at the head, on an empty page, or when the cursor did not move (a defensive guard).
      if (stoppedAt !== undefined || complete || ops.length === 0 || cursor === previousCursor) break;
    }
    return summary;
  }

  async function pullPhase(): Promise<void> {
    if (status.outdated) return;
    const summary = await pullStream(COMPANY_STREAM, (since) => deps.client.pullCompany(since));
    const wanted = new Set<string>();
    for (const r of summary?.relatorios ?? []) if (isAutoPulled(r.status)) wanted.add(r.id);
    // Relatorios opened before keep following their stream whatever their status now.
    for (const row of await deps.db.sync_state.toArray()) if (row.id !== COMPANY_STREAM) wanted.add(row.id);
    for (const id of wanted) {
      if (stopped || !deps.isOnline()) return;
      try {
        await pullStream(id, (since) => deps.client.pullRelatorio(id, since));
      } catch (error) {
        // A stream the server no longer knows (404) is skipped; anything else ends the phase.
        if (error instanceof PhaseEnd && error.action === 'stop') {
          recordFailure(error.failure);
          continue;
        }
        throw error;
      }
    }
  }

  async function runCycle(): Promise<CycleResult> {
    if (status.running) return 'busy';
    if (status.paused || stopped) return 'paused';
    if (!deps.isOnline()) {
      status.lastResult = 'offline';
      emit();
      return 'offline';
    }
    status.running = true;
    status.lastResult = null;
    cycleFailure = null;
    emit();
    try {
      await runPhase(pushPhase);
      // A 401 during the push pauses the engine: nothing else runs until sign-in.
      if (!status.paused && !stopped) await runPhase(pullPhase);
    } finally {
      status.running = false;
      status.lastResult = 'ran';
      status.lastFailure = cycleFailure;
      emit();
      if (onlineWhileRunning && !stopped) {
        onlineWhileRunning = false;
        deps.timers.setTimeout(() => void fireCycle(), 0);
      }
    }
    return 'ran';
  }

  /** Applies the end-of-phase policy: pause on re-auth, flag outdated, otherwise record and move on. */
  async function runPhase(phase: () => Promise<void>): Promise<void> {
    try {
      await phase();
    } catch (error) {
      if (!(error instanceof PhaseEnd)) throw error;
      recordFailure(error.failure);
      if (error.action === 'reauth') {
        status.paused = true;
        deps.onReAuth();
      } else if (error.action === 'outdated') {
        if (!status.outdated) {
          status.outdated = true;
          deps.onOutdated();
        }
      }
    }
  }

  /** A cycle nobody awaits (timer, `online`, launch): an unexpected error is logged, never unhandled. */
  const fireCycle = (): Promise<unknown> =>
    runCycle().catch((error: unknown) => {
      console.error('sync cycle failed', error);
    });

  const schedule = () => {
    timer = deps.timers.setTimeout(() => {
      void fireCycle().finally(() => {
        if (started) schedule();
      });
    }, intervalMs);
  };

  async function syncRelatorio(relatorioId: string): Promise<CycleResult> {
    const existing = await readSyncState(deps.db, relatorioId);
    if (existing === undefined) await writeSyncState(deps.db, emptyState(relatorioId));
    return runCycle();
  }

  return {
    runCycle,
    syncRelatorio,
    start() {
      if (started) return;
      started = true;
      unsubscribe = subscribeOnline(() => {
        if (status.running) onlineWhileRunning = true;
        else void fireCycle();
      });
      void fireCycle();
      schedule();
    },
    stop() {
      started = false;
      stopped = true;
      onlineWhileRunning = false;
      if (timer !== null) deps.timers.clearTimeout(timer);
      timer = null;
      unsubscribe?.();
      unsubscribe = null;
    },
    pause() {
      status.paused = true;
      emit();
    },
    resume() {
      if (!status.paused) return;
      status.paused = false;
      emit();
      void fireCycle();
    },
    status: () => ({ ...status }),
  };
}
