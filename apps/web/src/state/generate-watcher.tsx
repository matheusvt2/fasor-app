import { isJobActive, latestRevision, readyToast, toIso, type GenerationJobRow, type RevisionRow } from '@app/domain';
import { useEffect } from 'react';
import { now } from '../clock.ts';
import { generationJobRow, revisionRows } from '../db/generate-store.ts';
import { useLiveQuery } from '../db/live.ts';
import { clearGenerateAwaiting, readAllGenerateAwaiting, type GenerateAwaiting } from '../db/prefs.ts';
import type { AppDatabase } from '../db/schema.ts';
import { useSession } from './session.tsx';
import { useSync } from './sync.tsx';
import { useToast, type ShowToastOptions } from './toast.tsx';

/*
 * R4 (Story 4.8 review, closed in Story 7.5): the ready toast of a pressed "Gerar relatório"
 * arrives wherever the user is, not only on the Sumário. The press records its wait in
 * `local_prefs` (`generate_awaiting:{relatorio}`); this watcher, mounted once per session
 * beside the sync provider, pulls each waited relatório's stream until its revision arrives,
 * then raises the toast and clears the wait. The Export dialog's own finish goes through the
 * same `finishGenerate`, so one revision yields one toast whichever of the two sees it first.
 * A failed or expired job clears the wait silently: the dialog shows the failure when it is
 * opened again.
 *
 * Status flow 2026-10-10 (AD-22): a revision's arrival writes no status. The relatório stays
 * Em revisão (generated, not yet sent to the client) until the user presses "Marcar como
 * enviado ao cliente", the one emitter of `issue`.
 */

/**
 * The finish of each revision on this device store in this session, by revision id: one
 * toast each. The promise is kept so a second caller waits for the first one's finish.
 */
const finishing = new WeakMap<AppDatabase, Map<string, Promise<void>>>();

/**
 * The one finish of an arrived revision: the ready toast, the wait cleared (no status op).
 * Resolves to true for the caller that did it, false when another caller did (the watcher
 * and the Export dialog may both see the revision arrive); either resolves only once the
 * finish is written.
 */
export async function finishGenerate(
  db: AppDatabase,
  relatorioId: string,
  revision: RevisionRow,
  showToast: (text: string, options?: ShowToastOptions) => void,
): Promise<boolean> {
  let inFlight = finishing.get(db);
  if (inFlight === undefined) {
    inFlight = new Map();
    finishing.set(db, inFlight);
  }
  const running = inFlight.get(revision.id);
  if (running !== undefined) {
    await running;
    return false;
  }
  const work = (async () => {
    // Review F-04 (Q-1): a job outcome holds the toast slot for its full time; what comes meanwhile queues.
    showToast(readyToast(revision.number), { outcome: true });
    await clearGenerateAwaiting(db, relatorioId).catch(() => undefined);
  })();
  inFlight.set(revision.id, work);
  await work;
  return true;
}

interface Watched {
  relatorioId: string;
  wait: GenerateAwaiting;
  revisions: RevisionRow[];
  job: GenerationJobRow | null;
}

const NOTHING: Watched[] = [];

async function watched(db: AppDatabase): Promise<Watched[]> {
  const waits = await readAllGenerateAwaiting(db);
  return Promise.all(
    waits.map(async ({ relatorioId, ...wait }) => ({ relatorioId, wait, revisions: await revisionRows(db, relatorioId), job: await generationJobRow(db, wait.job_id) })),
  );
}

/** Mounted once inside the session's providers (`app.tsx`); renders nothing. */
export function GenerateWatcher({ pollMs = 3000 }: { pollMs?: number }) {
  const session = useSession();
  const db = session.database;
  const { syncRelatorio, online } = useSync();
  const { showToast } = useToast();
  const entries = useLiveQuery(() => (db === null ? Promise.resolve(NOTHING) : watched(db)), [db], NOTHING);

  useEffect(() => {
    if (db === null) return;
    for (const entry of entries) {
      const arrived = entry.revisions.find((row) => row.number === entry.wait.number);
      if (arrived !== undefined) {
        void finishGenerate(db, entry.relatorioId, arrived, showToast);
        continue;
      }
      const job = entry.job;
      if (job === null) continue;
      if (job.status === 'failed') {
        void clearGenerateAwaiting(db, entry.relatorioId).catch(() => undefined);
      } else if (job.status === 'done') {
        // Done with no revision of the number waited for (a stale local number): the newest one is the answer.
        const latest = latestRevision(entry.revisions);
        if (latest !== null) void finishGenerate(db, entry.relatorioId, latest, showToast);
        else void clearGenerateAwaiting(db, entry.relatorioId).catch(() => undefined);
      } else if (!isJobActive(job, toIso(now()))) {
        void clearGenerateAwaiting(db, entry.relatorioId).catch(() => undefined);
      }
    }
  }, [db, entries, showToast]);

  // While anything is awaited, pull those relatórios' streams; the Export dialog pulls too when open.
  const awaited = entries.map((entry) => entry.relatorioId).join(',');
  useEffect(() => {
    if (awaited === '' || !online) return;
    const ids = awaited.split(',');
    const timer = setInterval(() => {
      for (const id of ids) void syncRelatorio(id).catch(() => undefined);
    }, pollMs);
    return () => clearInterval(timer);
  }, [awaited, online, syncRelatorio, pollMs]);

  return null;
}
