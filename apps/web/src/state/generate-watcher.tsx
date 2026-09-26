import { isJobActive, issueOnRevision, latestRevision, putRelatorioStatusOp, readyToast, toIso, type GenerationJobRow, type RevisionRow } from '@app/domain';
import { useEffect, useMemo } from 'react';
import { now } from '../clock.ts';
import { commitBatch } from '../db/commit.ts';
import { editedSinceSnapshot, generationJobRow, relatorioRow, revisionRows } from '../db/generate-store.ts';
import { useLiveQuery } from '../db/live.ts';
import { clearGenerateAwaiting, readAllGenerateAwaiting, type GenerateAwaiting } from '../db/prefs.ts';
import type { AppDatabase } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { useSession } from './session.tsx';
import { useSync } from './sync.tsx';
import { useToast } from './toast.tsx';

/*
 * R4 (Story 4.8 review, closed in Story 7.5): the ready toast and the `issue` status op of a
 * pressed "Gerar relatório" arrive wherever the user is, not only on the Sumário. The press
 * records its wait in `local_prefs` (`generate_awaiting:{relatorio}`); this watcher, mounted
 * once per session beside the sync provider, pulls each waited relatório's stream until its
 * revision arrives, then writes the `issue` op, raises the toast and clears the wait. The
 * Export dialog's own finish goes through the same `finishGenerate`, so one revision yields
 * one op and one toast whichever of the two sees it first. A failed or expired job clears the
 * wait silently: the dialog shows the failure when it is opened again.
 */

export type GenerateAuthor = { id: string; companyId: string };

/**
 * Epic 4 retro items 19, 20: the `issue` op for a revision that arrived (or an `unchanged`
 * answer naming one), decided by the kernel at the moment of the write, from the status the
 * store holds then: `issueOnRevision` gives no status when anything of the relatório's
 * stream was edited after the revision's snapshot.
 */
export async function emitIssueFor(db: AppDatabase, author: GenerateAuthor, relatorioId: string, revision: Pick<RevisionRow, 'snapshot_seq'>): Promise<void> {
  const current = await relatorioRow(db, relatorioId);
  if (current === null) return;
  const next = issueOnRevision(current.status, await editedSinceSnapshot(db, relatorioId, revision.snapshot_seq));
  if (next === null) return;
  await commitBatch(db, [putRelatorioStatusOp(author, relatorioId, next)], { newId, now });
}

/** The revisions already finished on this device store in this session: one op and one toast each. */
const finished = new WeakMap<AppDatabase, Set<string>>();

/**
 * The one finish of an arrived revision: the `issue` op, the ready toast, the wait cleared.
 * Resolves to true for the caller that did it, false when it was already done (the watcher
 * and the Export dialog may both see the revision arrive).
 */
export async function finishGenerate(
  db: AppDatabase,
  author: GenerateAuthor | null,
  relatorioId: string,
  revision: RevisionRow,
  showToast: (text: string) => void,
): Promise<boolean> {
  let done = finished.get(db);
  if (done === undefined) {
    done = new Set();
    finished.set(db, done);
  }
  if (done.has(revision.id)) return false;
  done.add(revision.id);
  if (author !== null) await emitIssueFor(db, author, relatorioId, revision).catch((error: unknown) => console.error('issue status op failed', error));
  showToast(readyToast(revision.number));
  await clearGenerateAwaiting(db, relatorioId).catch(() => undefined);
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
  const userId = session.user?.id ?? null;
  const companyId = session.user?.companyId ?? null;
  const author = useMemo(() => (userId === null || companyId === null ? null : { id: userId, companyId }), [userId, companyId]);
  const { syncRelatorio, online } = useSync();
  const { showToast } = useToast();
  const entries = useLiveQuery(() => (db === null ? Promise.resolve(NOTHING) : watched(db)), [db], NOTHING);

  useEffect(() => {
    if (db === null) return;
    for (const entry of entries) {
      const arrived = entry.revisions.find((row) => row.number === entry.wait.number);
      if (arrived !== undefined) {
        void finishGenerate(db, author, entry.relatorioId, arrived, showToast);
        continue;
      }
      const job = entry.job;
      if (job === null) continue;
      if (job.status === 'failed') {
        void clearGenerateAwaiting(db, entry.relatorioId).catch(() => undefined);
      } else if (job.status === 'done') {
        // Done with no revision of the number waited for (a stale local number): the newest one is the answer.
        const latest = latestRevision(entry.revisions);
        if (latest !== null) void finishGenerate(db, author, entry.relatorioId, latest, showToast);
        else void clearGenerateAwaiting(db, entry.relatorioId).catch(() => undefined);
      } else if (!isJobActive(job, toIso(now()))) {
        void clearGenerateAwaiting(db, entry.relatorioId).catch(() => undefined);
      }
    }
  }, [db, entries, author, showToast]);

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
