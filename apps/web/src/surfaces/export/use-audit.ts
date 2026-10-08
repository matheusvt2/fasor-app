import { AUDIT_RUN_EXPIRE_S, auditRunActive, auditRunningDetailsSchema, expectedFileIds, toIso, type AuditDisplay } from '@app/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { now } from '../../clock.ts';
import { auditRunRow, useLatestAuditRun } from '../../db/audit-store.ts';
import { pendingUploadCount } from '../../db/file-store.ts';
import { lastOpIdFor } from '../../db/generate-store.ts';
import { toSnapshot } from '../../db/snapshot.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { SyncRequestError } from '../../sync/client.ts';
import { publishReAuth } from '../../api/auth-client.ts';
import { isUnauthorized } from './session-expired.tsx';
import { DEFAULT_TIMING, type GenerateTiming } from './use-generate.ts';

/*
 * Story 13.8 (AI-3): "Conferir antes de emitir". One tap drains the outbox like the preview,
 * asks for one audit behind the same barrier (a `409 not_caught_up` is answered with a sync
 * and a retry; a `409 audit_running` waits on the run the server names, sending nothing),
 * then pulls the relatório stream until the run is done or failed. The device writes nothing:
 * no op, no status. What it shows comes from IndexedDB (`useLatestAuditRun`); this hook only
 * says whether a tap is in flight and whether the last tap could not even be asked.
 */

export interface AuditState {
  /** The kernel's view of the relatório's runs on this device. */
  display: AuditDisplay;
  /** A tap is in flight (draining, asking or waiting on the run) or a run still counts as running: the button waits. */
  running: boolean;
  /** The last tap failed before or after its run (a request refused, a run failed or gone stale). */
  failed: boolean;
  online: boolean;
  start: () => void;
}

const MAX_ROUNDS = 10;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useAudit(relatorioId: string, timing: GenerateTiming = DEFAULT_TIMING): AuditState {
  const session = useSession();
  const db = session.database;
  const sync = useSync();
  const syncRef = useRef(sync);
  syncRef.current = sync;
  const display = useLatestAuditRun(db, relatorioId);
  const [busy, setBusy] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (db === null) throw new Error('no device store');
    const engine = syncRef.current;
    if (engine.audit === undefined) throw new Error('no audit route');
    for (let round = 0; ; round++) {
      await engine.syncNow().catch(() => undefined);
      const unsent = await db.outbox.where('status').anyOf('pending', 'sent').count();
      if (unsent === 0 && (await pendingUploadCount(db)) === 0) break;
      if (round >= MAX_ROUNDS) throw new Error('outbox did not drain');
      await wait(timing.retryMs);
    }
    let runId: string | null = null;
    for (let attempt = 0; runId === null; attempt++) {
      const [lastOpId, snapshot] = await Promise.all([lastOpIdFor(db, relatorioId), toSnapshot(db, relatorioId)]);
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
        await engine.syncNow().catch(() => undefined);
        await wait(timing.retryMs);
      }
    }
    // Pull until the run is finished; one that never arrives, or stops counting as running, is given up.
    const askedAt = now().getTime();
    for (;;) {
      await engine.syncRelatorio(relatorioId).catch(() => undefined);
      const row = await auditRunRow(db, runId);
      if (row !== null && row.status === 'done') return;
      if (row !== null && (row.status === 'failed' || !auditRunActive(row, toIso(now())))) throw new Error(`audit run ${runId} ended without findings`);
      if (row === null && now().getTime() - askedAt > AUDIT_RUN_EXPIRE_S * 1000) throw new Error(`audit run ${runId} never arrived`);
      if (!mounted.current) return;
      await wait(timing.pollMs);
    }
  }, [db, relatorioId, timing.pollMs, timing.retryMs]);

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
    if (inFlight.current || !syncRef.current.online || db === null) return;
    inFlight.current = true;
    setBusy(true);
    setRequestFailed(false);
    run()
      .then(
        () => undefined,
        (error: unknown) => {
          console.error('audit failed', error);
          if (isUnauthorized(error)) publishReAuth();
          if (mounted.current) setRequestFailed(true);
        },
      )
      .finally(() => {
        inFlight.current = false;
        if (mounted.current) setBusy(false);
      });
  }, [db, run]);

  return {
    display,
    running: busy || display.active !== null,
    failed: !busy && display.active === null && (requestFailed || display.failed),
    online: sync.online,
    start,
  };
}
