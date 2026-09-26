import { expectedFileIds, isJobActive, toIso } from '@app/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { now } from '../../clock.ts';
import { pendingUploadCount } from '../../db/file-store.ts';
import { generationJobRow, lastOpIdFor } from '../../db/generate-store.ts';
import { toSnapshot } from '../../db/snapshot.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { previewPdfUrl, SyncRequestError } from '../../sync/client.ts';
import { DEFAULT_TIMING, type GenerateTiming } from './use-generate.ts';

/*
 * Story 7.5 (FR-73): "Pré-visualizar". The press opens a blank tab at once (a tab opened
 * later, after the network, is a pop-up the browser blocks), drains the outbox like the
 * issue, asks for the preview job behind the same barrier, pulls the relatório stream until
 * the job is done, then points the tab at `preview.pdf` (RASCUNHO on every page, no revision
 * number). Nothing is written by the device: no status op, no revision. A failure closes the
 * tab and says so beside the button.
 */

export type PreviewPhase = { kind: 'idle' } | { kind: 'working' } | { kind: 'failed' };

export interface PreviewState {
  phase: PreviewPhase;
  start: () => void;
}

const MAX_ROUNDS = 10;

/** A tab the press opened; null when the browser refused it (the PDF then opens in a fresh one at the end). */
type Tab = Pick<Window, 'close' | 'location'> | null;

function openBlankTab(): Tab {
  const tab = window.open('', '_blank');
  if (tab === null) return null;
  try {
    tab.opener = null;
  } catch {
    // A tab whose opener cannot be reset stays as it is.
  }
  return tab;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function usePreview(relatorioId: string, timing: GenerateTiming = DEFAULT_TIMING): PreviewState {
  const db = useSession().database;
  const sync = useSync();
  const syncRef = useRef(sync);
  syncRef.current = sync;
  const [phase, setPhase] = useState<PreviewPhase>({ kind: 'idle' });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (tab: Tab) => {
      if (db === null) throw new Error('no device store');
      const engine = syncRef.current;
      if (engine.preview === undefined) throw new Error('no preview route');
      // Drain: the outbox and the uploads, a bounded number of cycles.
      for (let round = 0; ; round++) {
        await engine.syncNow().catch(() => undefined);
        const unsent = await db.outbox.where('status').anyOf('pending', 'sent').count();
        if (unsent === 0 && (await pendingUploadCount(db)) === 0) break;
        if (round >= MAX_ROUNDS) throw new Error('outbox did not drain');
        await wait(timing.retryMs);
      }
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
      // Pull until the job is done (its file named) or ends without one.
      for (;;) {
        await engine.syncRelatorio(relatorioId).catch(() => undefined);
        const job = await generationJobRow(db, jobId);
        if (job !== null && job.status === 'done' && job.result_file_id !== null) {
          const url = previewPdfUrl(relatorioId, job.result_file_id);
          if (tab === null) window.open(url, '_blank', 'noopener');
          else tab.location.href = url;
          return;
        }
        if (job !== null && (job.status === 'failed' || job.status === 'done' || !isJobActive(job, toIso(now())))) throw new Error(`preview job ${jobId} ended without a file`);
        if (!mounted.current) return;
        await wait(timing.pollMs);
      }
    },
    [db, relatorioId, timing.pollMs, timing.retryMs],
  );

  const start = useCallback(() => {
    if (phase.kind === 'working' || !syncRef.current.online || db === null) return;
    const tab = openBlankTab();
    setPhase({ kind: 'working' });
    run(tab).then(
      () => {
        if (mounted.current) setPhase({ kind: 'idle' });
      },
      (error: unknown) => {
        console.error('preview failed', error);
        tab?.close();
        if (mounted.current) setPhase({ kind: 'failed' });
      },
    );
  }, [phase.kind, db, run]);

  return { phase, start };
}
