import { expectedFileIds, GENERATE_JOB_EXPIRE_S, isJobActive, toIso } from '@app/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { now } from '../../clock.ts';
import { pendingUploadCount } from '../../db/file-store.ts';
import { generationJobRow, lastOpIdFor } from '../../db/generate-store.ts';
import { toSnapshot } from '../../db/snapshot.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { previewPdfUrl, SyncRequestError } from '../../sync/client.ts';
import { publishReAuth } from '../../api/auth-client.ts';
import { isSessionExpired, isUnauthorized, SessionExpiredError } from './session-expired.tsx';
import { setPreviewTabStep, writePreviewTab } from './preview-tab.ts';
import { DEFAULT_TIMING, type GenerateTiming } from './use-generate.ts';

/*
 * Story 7.5 (FR-73): "Pré-visualizar". The press opens a blank tab at once (a tab opened
 * later, after the network, is a pop-up the browser blocks), drains the outbox like the
 * issue, asks for the preview job behind the same barrier, pulls the relatório stream until
 * the job is done, then points the tab at `preview.pdf` (RASCUNHO on every page, no revision
 * number). Meanwhile the tab shows a waiting page with the step and a bar (`preview-tab.ts`).
 * Nothing is written by the device: no status op, no revision. A failure closes the
 * tab and says so beside the button.
 */

export type PreviewPhase = { kind: 'idle' } | { kind: 'working' } | { kind: 'failed'; sessionExpired?: boolean };

export interface PreviewState {
  phase: PreviewPhase;
  /** The button is disabled offline ("Sem conexão"), like "Gerar relatório". */
  online: boolean;
  start: () => void;
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const mounted = useRef(true);
  /** The press in flight: a second press while it runs does nothing (one tab, one job). */
  const busy = useRef(false);
  /** The blank tab of the press in flight; closed when the surface goes away before the PDF is in it. */
  const openTab = useRef<Tab>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      openTab.current?.close();
      openTab.current = null;
    };
  }, []);

  const run = useCallback(
    async (tab: Tab) => {
      if (db === null) throw new Error('no device store');
      const engine = syncRef.current;
      if (engine.preview === undefined) throw new Error('no preview route');
      // Drain: the outbox and the uploads, a bounded number of cycles.
      for (let round = 0; ; round++) {
        if (reAuthRequired.current) throw new SessionExpiredError();
        await engine.syncNow().catch(() => undefined);
        const unsent = await db.outbox.where('status').anyOf('pending', 'sent').count();
        if (unsent === 0 && (await pendingUploadCount(db)) === 0) break;
        if (round >= MAX_ROUNDS) throw new Error('outbox did not drain');
        await wait(timing.retryMs);
      }
      if (tab !== null) setPreviewTabStep(tab, 'generating');
      // Ask, answering a 409 with a sync and a retry, as the issue does.
      let jobId: string | null = null;
      for (let attempt = 0; jobId === null; attempt++) {
        const [lastOpId, snapshot] = await Promise.all([lastOpIdFor(db, relatorioId), toSnapshot(db, relatorioId)]);
        try {
          jobId = (await engine.preview(relatorioId, { last_op_id: lastOpId, file_ids_expected: expectedFileIds(snapshot) })).job_id;
        } catch (error) {
          const notCaughtUp = error instanceof SyncRequestError && error.failure.kind === 'http' && error.failure.code === 'not_caught_up';
          if (!notCaughtUp || attempt >= MAX_ROUNDS) throw error;
          await engine.syncNow().catch(() => undefined);
          await wait(timing.retryMs);
        }
      }
      // Pull until the job is done (its file named) or ends without one; a job row that
      // never arrives is given up once a job of its own would have expired.
      const askedAt = now().getTime();
      for (;;) {
        await engine.syncRelatorio(relatorioId).catch(() => undefined);
        const job = await generationJobRow(db, jobId);
        if (job !== null && job.status === 'done' && job.result_file_id !== null) {
          if (!mounted.current) return;
          const url = previewPdfUrl(relatorioId, job.result_file_id);
          openTab.current = null;
          if (tab === null) window.open(url, '_blank', 'noopener');
          else tab.location.href = url;
          return;
        }
        if (job !== null && (job.status === 'failed' || job.status === 'done' || !isJobActive(job, toIso(now())))) throw new Error(`preview job ${jobId} ended without a file`);
        if (job === null && now().getTime() - askedAt > GENERATE_JOB_EXPIRE_S * 1000) throw new Error(`preview job ${jobId} never arrived`);
        if (!mounted.current) return;
        await wait(timing.pollMs);
      }
    },
    [db, relatorioId, timing.pollMs, timing.retryMs],
  );

  const start = useCallback(() => {
    if (busy.current || !syncRef.current.online || db === null) return;
    busy.current = true;
    const tab = openBlankTab();
    openTab.current = tab;
    setPhase({ kind: 'working' });
    run(tab)
      .then(
        () => {
          if (mounted.current) setPhase({ kind: 'idle' });
        },
        (error: unknown) => {
          console.error('preview failed', error);
          tab?.close();
          // F-12 / W-23: a 401 is a session that expired: the re-auth banner and its own words.
          const expired = isSessionExpired(error) || reAuthRequired.current;
          if (isUnauthorized(error)) publishReAuth();
          if (mounted.current) setPhase(expired ? { kind: 'failed', sessionExpired: true } : { kind: 'failed' });
        },
      )
      .finally(() => {
        busy.current = false;
        if (openTab.current === tab) openTab.current = null;
      });
  }, [db, run]);

  return { phase, online: sync.online, start };
}
