import { AUDIT_RUN_EXPIRE_S, auditRunActive, auditRunningDetailsSchema, expectedFileIds, toIso, type AuditDisplay } from '@app/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { now } from '../../clock.ts';
import { auditRunRow, useLatestAuditRun } from '../../db/audit-store.ts';
import { lastOpIdFor } from '../../db/generate-store.ts';
import { toSnapshot } from '../../db/snapshot.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { SyncRequestError } from '../../sync/client.ts';
import { publishReAuth } from '../../api/auth-client.ts';
import { isSessionExpired, isUnauthorized, SessionExpiredError } from './session-expired.tsx';
import { DeadOpsError, drainForServerJob, isJobAborted, throwIfAborted, wait } from './server-job.ts';
import { DEFAULT_TIMING, type GenerateTiming } from './use-generate.ts';

/*
 * Story 13.8 (AI-3): "Conferir antes de emitir". One tap drains the outbox like the preview,
 * asks for one audit behind the same barrier (a `409 not_caught_up` is answered with a sync
 * and a retry; a `409 audit_running` waits on the run the server names, sending nothing),
 * then pulls the relatório stream until the run is done or failed. The device writes nothing:
 * no op, no status. What it shows comes from IndexedDB (`useLatestAuditRun`); this hook only
 * says whether a tap is in flight and whether the last tap could not even be asked.
 *
 * Review fixes 2026-10-08 (QW25): like "Gerar relatório", a dead op held in the outbox stops the
 * tap before anything is asked (`blocked`, the button stays enabled); the drain also stops on a
 * session known to be gone (`sessionExpired`: the sign-in note, not the generic failure); and
 * `cancel()` (the dialog closed) or an unmount aborts the tap in flight: no POST follows and
 * nothing reads as failed.
 */

export interface AuditState {
  /** The kernel's view of the relatório's runs on this device. */
  display: AuditDisplay;
  /** A tap is in flight (draining, asking or waiting on the run) or a run still counts as running: the button waits. */
  running: boolean;
  /** The last tap failed before or after its run (a request refused, a run failed or gone stale). */
  failed: boolean;
  /** The last tap found a dead op in the outbox and asked nothing (`copy.audit.deadOpsReason`). */
  blocked: boolean;
  /** The last tap failed because the session is gone: the sign-in note instead of the failure line. */
  sessionExpired: boolean;
  online: boolean;
  start: () => void;
  /** Stops the tap in flight (the dialog closed): no POST after it, nothing reads as failed. */
  cancel: () => void;
}

const MAX_ROUNDS = 10;

export function useAudit(relatorioId: string, timing: GenerateTiming = DEFAULT_TIMING): AuditState {
  const session = useSession();
  const db = session.database;
  const reAuthRequired = useRef(session.reAuthRequired);
  reAuthRequired.current = session.reAuthRequired;
  const sync = useSync();
  const syncRef = useRef(sync);
  syncRef.current = sync;
  const display = useLatestAuditRun(db, relatorioId);
  const [busy, setBusy] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  /** The tap in flight's abort; null when none runs. */
  const current = useRef<AbortController | null>(null);

  /** Aborts the tap in flight; its outcome is then ignored. */
  const abortTap = useCallback(() => {
    const controller = current.current;
    if (controller === null) return false;
    current.current = null;
    controller.abort();
    return true;
  }, []);

  useEffect(() => () => void abortTap(), [abortTap]);

  // The refusal stands while a dead op does: once none is left (resent and accepted), it goes.
  const dead = sync.counts.dead;
  useEffect(() => {
    if (dead === 0) setBlocked(false);
  }, [dead]);

  const run = useCallback(
    async (signal: AbortSignal) => {
      if (db === null) throw new Error('no device store');
      const engine = syncRef.current;
      if (engine.audit === undefined) throw new Error('no audit route');
      await drainForServerJob(db, engine, { maxRounds: MAX_ROUNDS, retryMs: timing.retryMs, signal, isSessionExpired: () => reAuthRequired.current });
      let runId: string | null = null;
      for (let attempt = 0; runId === null; attempt++) {
        const [lastOpId, snapshot] = await Promise.all([lastOpIdFor(db, relatorioId), toSnapshot(db, relatorioId)]);
        throwIfAborted(signal);
        if (reAuthRequired.current) throw new SessionExpiredError();
        try {
          runId = (await engine.audit(relatorioId, { last_op_id: lastOpId, file_ids_expected: expectedFileIds(snapshot) })).audit_run_id;
        } catch (error) {
          const failure = error instanceof SyncRequestError && error.failure.kind === 'http' ? error.failure : null;
          if (failure?.code === 'audit_running') {
            const details = auditRunningDetailsSchema.safeParse(failure.details);
            if (!details.success) throw error;
            runId = details.data.audit_run_id;
            break;
          }
          if (failure?.code !== 'not_caught_up' || attempt >= MAX_ROUNDS) throw error;
          throwIfAborted(signal);
          await engine.syncNow().catch(() => undefined);
          await wait(timing.retryMs, signal);
        }
      }
      // Pull until the run is finished; one that never arrives, or stops counting as running, is given up.
      const askedAt = now().getTime();
      for (;;) {
        throwIfAborted(signal);
        await engine.syncRelatorio(relatorioId).catch(() => undefined);
        const row = await auditRunRow(db, runId);
        if (row !== null && row.status === 'done') return;
        if (row !== null && (row.status === 'failed' || !auditRunActive(row, toIso(now())))) throw new Error(`audit run ${runId} ended without findings`);
        if (row === null && now().getTime() - askedAt > AUDIT_RUN_EXPIRE_S * 1000) throw new Error(`audit run ${runId} never arrived`);
        await wait(timing.pollMs, signal);
      }
    },
    [db, relatorioId, timing.pollMs, timing.retryMs],
  );

  // A run still active that no tap of this dialog is waiting on (the dialog reopened, a run
  // another device asked for): pull the stream until it ends, re-rendering on each round so a
  // run that outlives its age reads as failed.
  const activeId = display.active?.id ?? null;
  const [, setRound] = useState(0);
  useEffect(() => {
    if (activeId === null || busy) return;
    let stopped = false;
    void (async () => {
      while (!stopped) {
        await syncRef.current.syncRelatorio(relatorioId).catch(() => undefined);
        await wait(timing.pollMs);
        if (!stopped) setRound((round) => round + 1);
      }
    })();
    return () => {
      stopped = true;
    };
  }, [activeId, busy, relatorioId, timing.pollMs]);

  const start = useCallback(() => {
    if (current.current !== null || !syncRef.current.online || db === null) return;
    setRequestFailed(false);
    setSessionExpired(false);
    // Like "Gerar relatório": a dead op stops the tap before anything is asked.
    if (syncRef.current.counts.dead > 0) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    const controller = new AbortController();
    current.current = controller;
    const own = () => current.current === controller;
    setBusy(true);
    run(controller.signal)
      .then(
        () => undefined,
        (error: unknown) => {
          // An abort (the dialog closed, the surface went away) is never a failure.
          if (isJobAborted(error) || controller.signal.aborted || !own()) return;
          if (error instanceof DeadOpsError) {
            setBlocked(true);
            return;
          }
          console.error('audit failed', error);
          if (isUnauthorized(error)) publishReAuth();
          setSessionExpired(isSessionExpired(error) || reAuthRequired.current);
          setRequestFailed(true);
        },
      )
      .finally(() => {
        if (!own()) return;
        current.current = null;
        setBusy(false);
      });
  }, [db, run]);

  const cancel = useCallback(() => {
    // A refusal shown goes with the dialog; the next tap checks again.
    setBlocked(false);
    if (!abortTap()) return;
    setBusy(false);
    setRequestFailed(false);
    setSessionExpired(false);
  }, [abortTap]);

  const failed = !busy && display.active === null && (requestFailed || display.failed);
  return {
    display,
    running: busy || display.active !== null,
    failed,
    blocked: !busy && blocked,
    sessionExpired: failed && requestFailed && sessionExpired,
    online: sync.online,
    start,
    cancel,
  };
}
