import { expectedFileIds, GENERATE_JOB_EXPIRE_S, isJobActive, toIso } from '@app/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { now } from '../../clock.ts';
import { generationJobRow, lastOpIdFor } from '../../db/generate-store.ts';
import { toSnapshot } from '../../db/snapshot.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { previewPdfUrl, SyncRequestError } from '../../sync/client.ts';
import { publishReAuth } from '../../api/auth-client.ts';
import { isSessionExpired, isUnauthorized, SessionExpiredError } from './session-expired.tsx';
import { setPreviewTabStep, writePreviewTab } from './preview-tab.ts';
import { DeadOpsError, drainForServerJob, isJobAborted, throwIfAborted, wait } from './server-job.ts';
import { DEFAULT_TIMING, type GenerateTiming } from './use-generate.ts';

/*
 * Story 7.5 (FR-73): "Pré-visualizar". The press opens a blank tab at once (a tab opened
 * later, after the network, is a pop-up the browser blocks), drains the outbox like the
 * issue, asks for the preview job behind the same barrier, pulls the relatório stream until
 * the job is done, then points the tab at `preview.pdf` (RASCUNHO on every page, no revision
 * number). Meanwhile the tab shows a waiting page with the step and a bar (`preview-tab.ts`).
 * Nothing is written by the device: no status op, no revision. A failure closes the
 * tab and says so beside the button.
 *
 * Review fixes 2026-10-08 (QW25): like "Gerar relatório", a dead op held in the outbox stops the
 * press before anything is asked of the server (no tab, no drain, no POST; `blocked`, the button
 * stays enabled and the next press checks again), and one found mid-drain closes the tab the
 * same way. `cancel()` (the dialog closed) and an unmount abort the press in flight: its waits
 * stop, no POST follows, the tab closes and nothing reads as failed.
 */

export type PreviewPhase =
  | { kind: 'idle' }
  | { kind: 'working' }
  /** A dead op is held in the outbox: nothing was asked; the sentence says why (`deadOpsPreviewReason`). */
  | { kind: 'blocked' }
  | { kind: 'failed'; sessionExpired?: boolean };

export interface PreviewState {
  phase: PreviewPhase;
  /** The button is disabled offline ("Sem conexão"), like "Gerar relatório". */
  online: boolean;
  start: () => void;
  /** Stops the press in flight (the dialog closed): no POST after it, the tab closed, no failure line. */
  cancel: () => void;
}

const MAX_ROUNDS = 10;

/** A tab the press opened; null when the browser refused it (the PDF then opens in a fresh one at the end). */
type Tab = Window | null;

function openBlankTab(): Tab {
  const tab = window.open('', '_blank');
  if (tab === null) return null;
  try {
    tab.opener = null;
  } catch {
    // A tab whose opener cannot be reset stays as it is.
  }
  // Review 2026-10-06: a blank tab for the whole job read as broken; it says what is happening.
  writePreviewTab(tab);
  return tab;
}

/** One press: its abort and the blank tab it opened. */
interface Press {
  controller: AbortController;
  tab: Tab;
}

export function usePreview(relatorioId: string, timing: GenerateTiming = DEFAULT_TIMING): PreviewState {
  const session = useSession();
  const db = session.database;
  // F-12: a session already known to be gone stops the press at once (its words, not a drain that cannot finish).
  const reAuthRequired = useRef(session.reAuthRequired);
  reAuthRequired.current = session.reAuthRequired;
  const sync = useSync();
  const syncRef = useRef(sync);
  syncRef.current = sync;
  const [phase, setPhase] = useState<PreviewPhase>({ kind: 'idle' });
  /** The press in flight: a second press while it runs does nothing (one tab, one job). */
  const current = useRef<Press | null>(null);

  /** Aborts the press in flight and closes its tab; its outcome is then ignored. */
  const abortPress = useCallback(() => {
    const press = current.current;
    if (press === null) return false;
    current.current = null;
    press.controller.abort();
    press.tab?.close();
    return true;
  }, []);

  useEffect(() => () => void abortPress(), [abortPress]);

  // The refusal stands while a dead op does: once none is left (resent and accepted), it goes.
  const dead = sync.counts.dead;
  useEffect(() => {
    if (dead === 0) setPhase((current) => (current.kind === 'blocked' ? { kind: 'idle' } : current));
  }, [dead]);

  const run = useCallback(
    async (press: Press) => {
      if (db === null) throw new Error('no device store');
      const engine = syncRef.current;
      if (engine.preview === undefined) throw new Error('no preview route');
      const { tab } = press;
      const signal = press.controller.signal;
      // Drain: the outbox and the uploads, a bounded number of cycles; a dead op or a gone session stops it.
      await drainForServerJob(db, engine, { maxRounds: MAX_ROUNDS, retryMs: timing.retryMs, signal, isSessionExpired: () => reAuthRequired.current });
      if (tab !== null) setPreviewTabStep(tab, 'generating');
      // Ask, answering a 409 with a sync and a retry, as the issue does.
      let jobId: string | null = null;
      for (let attempt = 0; jobId === null; attempt++) {
        const [lastOpId, snapshot] = await Promise.all([lastOpIdFor(db, relatorioId), toSnapshot(db, relatorioId)]);
        throwIfAborted(signal);
        if (reAuthRequired.current) throw new SessionExpiredError();
        try {
          jobId = (await engine.preview(relatorioId, { last_op_id: lastOpId, file_ids_expected: expectedFileIds(snapshot) })).job_id;
        } catch (error) {
          const notCaughtUp = error instanceof SyncRequestError && error.failure.kind === 'http' && error.failure.code === 'not_caught_up';
          if (!notCaughtUp || attempt >= MAX_ROUNDS) throw error;
          throwIfAborted(signal);
          await engine.syncNow().catch(() => undefined);
          await wait(timing.retryMs, signal);
        }
      }
      // Pull until the job is done (its file named) or ends without one; a job row that
      // never arrives is given up once a job of its own would have expired.
      const askedAt = now().getTime();
      for (;;) {
        throwIfAborted(signal);
        await engine.syncRelatorio(relatorioId).catch(() => undefined);
        throwIfAborted(signal);
        const job = await generationJobRow(db, jobId);
        if (job !== null && job.status === 'done' && job.result_file_id !== null) {
          throwIfAborted(signal);
          const url = previewPdfUrl(relatorioId, job.result_file_id);
          // The tab is the PDF's now: an abort from here on leaves it open.
          press.tab = null;
          if (tab === null) window.open(url, '_blank', 'noopener');
          else tab.location.href = url;
          return;
        }
        if (job !== null && (job.status === 'failed' || job.status === 'done' || !isJobActive(job, toIso(now())))) throw new Error(`preview job ${jobId} ended without a file`);
        if (job === null && now().getTime() - askedAt > GENERATE_JOB_EXPIRE_S * 1000) throw new Error(`preview job ${jobId} never arrived`);
        await wait(timing.pollMs, signal);
      }
    },
    [db, relatorioId, timing.pollMs, timing.retryMs],
  );

  const start = useCallback(() => {
    if (current.current !== null || !syncRef.current.online || db === null) return;
    // Like "Gerar relatório": a dead op stops the press before anything is asked (no tab, no drain).
    if (syncRef.current.counts.dead > 0) {
      setPhase({ kind: 'blocked' });
      return;
    }
    const press: Press = { controller: new AbortController(), tab: null };
    press.tab = openBlankTab();
    current.current = press;
    setPhase({ kind: 'working' });
    const own = () => current.current === press;
    run(press)
      .then(
        () => {
          if (own()) setPhase({ kind: 'idle' });
        },
        (error: unknown) => {
          press.tab?.close();
          // An abort (the dialog closed, the surface went away) is never a failure.
          if (isJobAborted(error) || press.controller.signal.aborted) return;
          if (error instanceof DeadOpsError) {
            if (own()) setPhase({ kind: 'blocked' });
            return;
          }
          console.error('preview failed', error);
          // F-12 / W-23: a 401 is a session that expired: the re-auth banner and its own words.
          const expired = isSessionExpired(error) || reAuthRequired.current;
          if (isUnauthorized(error)) publishReAuth();
          if (own()) setPhase(expired ? { kind: 'failed', sessionExpired: true } : { kind: 'failed' });
        },
      )
      .finally(() => {
        if (own()) current.current = null;
      });
  }, [db, run]);

  const cancel = useCallback(() => {
    // A press in flight stops; a refusal shown goes with the dialog, and the next press checks again.
    if (abortPress()) setPhase({ kind: 'idle' });
    else setPhase((current) => (current.kind === 'blocked' ? { kind: 'idle' } : current));
  }, [abortPress]);

  return { phase, online: sync.online, start, cancel };
}
