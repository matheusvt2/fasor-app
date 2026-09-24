import {
  expectedFileIds,
  isJobActive,
  jobExpiresAt,
  latestRevision,
  nextRevisionNumber,
  readyToast,
  statusTable,
  toIso,
  type GenerationJobRow,
  type RelatorioRow,
  type RevisionRow,
  type StatusEvent,
} from '@app/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { now } from '../../clock.ts';
import { commitBatch } from '../../db/commit.ts';
import { pendingUploadCount } from '../../db/file-store.ts';
import { lastOpIdFor, useLatestGenerationJob, useRelatorio, useRevisions } from '../../db/generate-store.ts';
import { clearGenerateAwaiting, readGenerateAwaiting, writeGenerateAwaiting } from '../../db/prefs.ts';
import { toSnapshot } from '../../db/snapshot.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { useToast } from '../../state/toast.tsx';
import { SyncRequestError } from '../../sync/client.ts';

/*
 * Story 4.8 (AD-15, UX-DR58): the Export dialog's state machine. "Gerar relatório" first
 * drains the outbox ("Enviando…"), stops on a dead op, then calls the generate barrier
 * with the device's newest op and the files it expects stored; a 409 is answered with a
 * sync and a retry; a 202 emits `relatorio/status` per `statusTable(status, 'generate')`,
 * records the wait in `local_prefs` ("pode fechar": a closed dialog, a navigation or a
 * reload picks it up again) and polls the relatório stream until the revision arrives
 * (toast, `issue` op) or the job fails. Every sentence with a number is the kernel's;
 * every write is an op.
 */

export type GeneratePhase =
  | { kind: 'idle' }
  /** The outbox is being drained before the request. */
  | { kind: 'flushing' }
  /** A dead op can never reach the server: the button is back with the sentence beside it. */
  | { kind: 'blocked' }
  | { kind: 'requesting'; number: number }
  | { kind: 'working'; number: number; jobId: string }
  | { kind: 'failed' }
  | { kind: 'ready'; number: number; revisionId: string | null; unchanged: boolean };

export interface GenerateTiming {
  /** How often the relatório stream is pulled while a job runs. */
  pollMs: number;
  /** The wait before a retry after a 409, and between flush rounds. */
  retryMs: number;
}

export const DEFAULT_TIMING: GenerateTiming = { pollMs: 3000, retryMs: 2000 };

const MAX_NOT_CAUGHT_UP_RETRIES = 10;
const MAX_FLUSH_ROUNDS = 10;

export interface GenerateState {
  phase: GeneratePhase;
  relatorio: RelatorioRow | null;
  revisions: RevisionRow[];
  latestJob: GenerationJobRow | null;
  /** The number the next generate allocates (kernel). */
  nextNumber: number;
  /** Names of the users this device knows, for "who" on a revision row. */
  userNames: Readonly<Record<string, string>>;
  online: boolean;
  start: () => void;
  reset: () => void;
}

const jobIsActive = (job: GenerationJobRow | null): job is GenerationJobRow =>
  job !== null && isJobActive(job, toIso(now()));

export function useGenerate(relatorioId: string, timing: GenerateTiming = DEFAULT_TIMING): GenerateState {
  const session = useSession();
  const sync = useSync();
  const { showToast } = useToast();
  const db = session.database;
  const user = session.user;

  const relatorio = useRelatorio(db, relatorioId);
  const revisions = useRevisions(db, relatorioId);
  const latestJob = useLatestGenerationJob(db, relatorioId);
  const nextNumber = nextRevisionNumber(revisions);

  const [phase, setPhase] = useState<GeneratePhase>({ kind: 'idle' });
  /** The wait recorded in `local_prefs`, read once on mount; null when none or once handled. */
  const [awaiting, setAwaiting] = useState<{ number: number; job_id: string } | null | undefined>(undefined);
  const flushRounds = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (db === null) return;
    let cancelled = false;
    readGenerateAwaiting(db, relatorioId).then(
      (entry) => {
        if (!cancelled) setAwaiting(entry);
      },
      () => {
        if (!cancelled) setAwaiting(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, relatorioId]);

  /** One `relatorio/status` put when the table has a row for `(current status, event)`; nothing otherwise. */
  const emitStatus = useCallback(
    async (event: StatusEvent) => {
      if (db === null || user === null || relatorio === null) return;
      const next = statusTable(relatorio.status, event);
      if (next === null) return;
      await commitBatch(
        db,
        [
          {
            kind: 'put',
            scope: 'relatorio',
            company_id: user.companyId,
            project_id: null,
            relatorio_id: relatorioId,
            path: 'relatorio/status',
            value: next,
            prev_op_id: null,
            batch_id: null,
            meta: null,
            actor_id: user.id,
          },
        ],
        { newId, now },
      );
    },
    [db, user, relatorio, relatorioId],
  );
  const emitStatusRef = useRef(emitStatus);
  emitStatusRef.current = emitStatus;

  /** The revision arrived: the toast, the `issue` op, the recorded wait cleared. */
  const finishReady = useCallback(
    (revision: RevisionRow) => {
      setPhase({ kind: 'ready', number: revision.number, revisionId: revision.id, unchanged: false });
      showToast(readyToast(revision.number));
      emitStatusRef.current('issue').catch((error: unknown) => console.error('issue status op failed', error));
      if (db !== null) void clearGenerateAwaiting(db, relatorioId).catch(() => undefined);
    },
    [db, relatorioId, showToast],
  );

  // Resume. A wait this device recorded wins: revision present -> ready (toast, issue op);
  // its job failed -> failed; its job still active -> working; anything else -> the entry
  // is stale and dropped. Without one, a job the server still runs (pulled) means the
  // dialog is working, whoever asked for it.
  useEffect(() => {
    if (phase.kind !== 'idle' || awaiting === undefined || db === null) return;
    if (awaiting !== null) {
      const arrived = revisions.find((r) => r.number === awaiting.number);
      if (arrived !== undefined) {
        setAwaiting(null);
        finishReady(arrived);
        return;
      }
      const job = latestJob?.id === awaiting.job_id ? latestJob : null;
      if (job !== null && job.status === 'failed') {
        setAwaiting(null);
        setPhase({ kind: 'failed' });
        void clearGenerateAwaiting(db, relatorioId).catch(() => undefined);
        return;
      }
      if (job === null || jobIsActive(job)) {
        setAwaiting(null);
        setPhase({ kind: 'working', number: awaiting.number, jobId: awaiting.job_id });
        return;
      }
      setAwaiting(null);
      void clearGenerateAwaiting(db, relatorioId).catch(() => undefined);
      return;
    }
    if (jobIsActive(latestJob)) setPhase({ kind: 'working', number: nextNumber, jobId: latestJob.id });
  }, [phase.kind, awaiting, db, relatorioId, latestJob, revisions, nextNumber, finishReady]);

  const request = useCallback(async () => {
    if (db === null) return;
    const number = nextRevisionNumber(revisions);
    setPhase({ kind: 'requesting', number });
    try {
      let attempts = 0;
      for (;;) {
        const [lastOpId, snapshot] = await Promise.all([lastOpIdFor(db, relatorioId), toSnapshot(db, relatorioId)]);
        try {
          const answer = await sync.generate(relatorioId, { last_op_id: lastOpId, file_ids_expected: expectedFileIds(snapshot) });
          if (answer.outcome === 'queued' || answer.outcome === 'running') {
            // Recorded and emitted whether or not the dialog is still open: the server job
            // runs either way, and the status op belongs to the press, not to the view.
            await writeGenerateAwaiting(db, relatorioId, { number: answer.revision_number, job_id: answer.job_id }).catch(() => undefined);
            if (answer.outcome === 'queued') {
              try {
                await emitStatusRef.current('generate');
              } catch (error) {
                console.error('generate status op failed', error);
              }
            }
            if (mounted.current) setPhase({ kind: 'working', number: answer.revision_number, jobId: answer.job_id });
          } else if (mounted.current) {
            setPhase({ kind: 'ready', number: answer.revision_number, revisionId: answer.revision_id, unchanged: true });
          }
          return;
        } catch (error) {
          const notCaughtUp = error instanceof SyncRequestError && error.failure.kind === 'http' && error.failure.code === 'not_caught_up';
          if (!notCaughtUp || ++attempts >= MAX_NOT_CAUGHT_UP_RETRIES) throw error;
          await sync.syncNow();
          await new Promise((resolve) => setTimeout(resolve, timing.retryMs));
          if (!mounted.current) return;
        }
      }
    } catch {
      if (mounted.current) setPhase({ kind: 'failed' });
    }
  }, [db, relatorioId, revisions, sync, timing.retryMs]);
  const requestRef = useRef(request);
  requestRef.current = request;

  // Flushing: wait for the outbox to drain and the uploads to land, then request. A
  // dead op stops it, going offline hands the button back with the offline reason, and a
  // cycle that leaves work behind is kicked again, a bounded number of times.
  const { counts, running, syncNow, online } = sync;
  useEffect(() => {
    if (phase.kind !== 'flushing' || db === null) return;
    if (!online) {
      setPhase({ kind: 'idle' });
      return;
    }
    if (counts.dead > 0) {
      setPhase({ kind: 'blocked' });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // One round: a cycle after `retryMs`, then the next round while nothing changed (a
    // change re-runs this effect and starts over); the rounds are bounded.
    const kick = () => {
      if (++flushRounds.current > MAX_FLUSH_ROUNDS) {
        setPhase({ kind: 'failed' });
        return;
      }
      timer = setTimeout(() => {
        void Promise.resolve(syncNow())
          .catch(() => undefined)
          .then(() => {
            if (!cancelled) kick();
          });
      }, timing.retryMs);
    };
    if (counts.pending + counts.sent > 0) {
      if (!running) kick();
    } else {
      pendingUploadCount(db)
        .then((uploads) => {
          if (cancelled) return;
          if (uploads === 0) void requestRef.current();
          else if (!running) kick();
        })
        .catch(() => {
          if (!cancelled) setPhase({ kind: 'failed' });
        });
    }
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [phase.kind, db, online, counts.dead, counts.pending, counts.sent, running, syncNow, timing.retryMs]);

  // Working: pull the stream until the revision arrives or the job ends without one.
  const { syncRelatorio } = sync;
  useEffect(() => {
    if (phase.kind !== 'working') return;
    const timer = setInterval(() => void syncRelatorio(relatorioId), timing.pollMs);
    return () => clearInterval(timer);
  }, [phase.kind, relatorioId, syncRelatorio, timing.pollMs]);

  useEffect(() => {
    if (phase.kind !== 'working') return;
    const arrived = revisions.find((r) => r.number === phase.number);
    if (arrived !== undefined) {
      finishReady(arrived);
      return;
    }
    const job = latestJob?.id === phase.jobId ? latestJob : null;
    if (job === null) return;
    if (job.status === 'failed') {
      setPhase({ kind: 'failed' });
      if (db !== null) void clearGenerateAwaiting(db, relatorioId).catch(() => undefined);
      return;
    }
    if (job.status === 'done') {
      // The job finished but no revision carries the number this dialog waited for (a
      // stale local number on the resume path): the newest revision is the answer.
      const latest = latestRevision(revisions);
      if (latest !== null) finishReady(latest);
      else {
        setPhase({ kind: 'failed' });
        if (db !== null) void clearGenerateAwaiting(db, relatorioId).catch(() => undefined);
      }
    }
  }, [phase, revisions, latestJob, db, relatorioId, finishReady]);

  // Working past the queue's expiry with no revision: the worker died mid-job (an api
  // restart), pg-boss dropped the job and nobody will write `failed`. The dialog stops
  // waiting at the instant the kernel stops counting the job as running.
  const workingJob = phase.kind === 'working' && latestJob?.id === phase.jobId ? latestJob : null;
  const expiresAt = workingJob === null ? null : jobExpiresAt(workingJob);
  useEffect(() => {
    if (expiresAt === null) return;
    const giveUp = () => {
      setPhase({ kind: 'failed' });
      if (db !== null) void clearGenerateAwaiting(db, relatorioId).catch(() => undefined);
    };
    const remaining = expiresAt - now().getTime();
    if (remaining <= 0) {
      giveUp();
      return;
    }
    const timer = setTimeout(giveUp, remaining);
    return () => clearTimeout(timer);
  }, [expiresAt, db, relatorioId]);

  // Ready with a revision this device has not pulled (an `unchanged` answer on a fresh
  // device): ask for the stream once, so the row and its download appear.
  useEffect(() => {
    if (phase.kind !== 'ready' || phase.revisionId === null) return;
    if (revisions.some((r) => r.id === phase.revisionId)) return;
    void syncRelatorio(relatorioId);
  }, [phase, revisions, relatorioId, syncRelatorio]);

  const start = useCallback(() => {
    if (!sync.online || db === null) return;
    flushRounds.current = 0;
    setPhase({ kind: 'flushing' });
    void sync.syncNow();
  }, [sync, db]);

  const reset = useCallback(() => setPhase({ kind: 'idle' }), []);

  return { phase, relatorio, revisions, latestJob, nextNumber, userNames: sync.userNames, online: sync.online, start, reset };
}
