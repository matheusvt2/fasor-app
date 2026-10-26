import {
  advanceOnGenerate,
  canMarkSent,
  expectedFileIds,
  idleRevisionNumber,
  isJobActive,
  jobExpiresAt,
  latestRevision,
  nextRevisionNumber,
  notCaughtUpDetailsSchema,
  notCaughtUpRetryable,
  putRelatorioStatusOp,
  revisionsBeforeEditsBanner,
  toIso,
  type GenerateOutcome,
  type GenerationJobRow,
  type RelatorioRow,
  type RevisionRow,
} from '@app/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { now } from '../../clock.ts';
import { commitBatch } from '../../db/commit.ts';
import { pendingUploadCount, pendingUploads } from '../../db/file-store.ts';
import {
  lastOpIdFor,
  relatorioRow,
  revisionRows,
  useEditedSinceRead,
  useLatestGenerationJob,
  useMarkedSentSince,
  useRelatorio,
  useRevisions,
} from '../../db/generate-store.ts';
import { clearGenerateAwaiting, readGenerateAwaiting, writeGenerateAwaiting } from '../../db/prefs.ts';
import { toSnapshot } from '../../db/snapshot.ts';
import { newId } from '../../ids.ts';
import { finishGenerate } from '../../state/generate-watcher.tsx';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { useToast } from '../../state/toast.tsx';
import { SyncRequestError } from '../../sync/client.ts';
import { publishReAuth } from '../../api/auth-client.ts';
import { isSessionExpired, isUnauthorized } from './session-expired.tsx';
import { markSentNow } from './use-mark-sent.ts';

/*
 * Story 4.8 (AD-15, UX-DR58): the Export dialog's state machine. "Gerar relatório" first
 * drains the outbox ("Enviando…"), stops on a dead op, then calls the generate barrier
 * with the device's newest op and the files it expects stored; a 409 is answered with a
 * sync and a retry; a 202 emits `relatorio/status` per the kernel's `advanceOnGenerate`,
 * records the wait in `local_prefs` ("pode fechar": a closed dialog, a navigation or a
 * reload picks it up again) and polls the relatório stream until the revision arrives
 * (toast) or the job fails. Every sentence with a number is the kernel's; every write is an op.
 *
 * Status flow 2026-10-10 (AD-22): a revision's arrival writes no status; the relatório stays
 * Em revisão until "Marcar como enviado ao cliente" (`markSent`) writes the `issue` op.
 *
 * 2026-10-13 (AD-22, Matheus): a queued generate from Emitido reopens the relatório as
 * Em revisão (revision N+1 is not with the client); an `unchanged` answer leaves Emitido alone.
 * The rule is the kernel's (`advanceOnGenerate`), read here with the server's answer.
 */

export type GeneratePhase =
  | { kind: 'idle' }
  /** The outbox is being drained before the request. */
  | { kind: 'flushing' }
  /** A dead op can never reach the server: the button is back with the sentence beside it. */
  | { kind: 'blocked' }
  | { kind: 'requesting'; number: number }
  | { kind: 'working'; number: number; jobId: string }
  /**
   * `missingFiles`: the server still misses that many files and no upload of this device
   * will bring them (E9 sweep B14), so the request failed without retrying.
   */
  | { kind: 'failed'; missingFiles?: number; sessionExpired?: boolean }
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
  /**
   * The number the idle line promises (Q11): the last revision's own while nothing was
   * edited since its snapshot (a press answers it again), else `nextNumber`.
   */
  idleNumber: number;
  /** Names of the users this device knows, for "who" on a revision row. */
  userNames: Readonly<Record<string, string>>;
  online: boolean;
  /** Whether anything was edited since the newest revision (true until the first read lands). */
  edited: boolean;
  /**
   * Story 16.2: the banner under the dialog's title (kernel sentence), or null: no revision,
   * nothing edited since the latest one, the edited read not landed yet for its snapshot, or
   * the `working` phase.
   */
  beforeEditsBanner: string | null;
  /** Story 16.2: every "Revisões" row predates edits (the read landed and says edited); kept in `working`. */
  beforeEdits: boolean;
  /** Decision 2 (2026-10-10): Em revisão, a revision on record, nothing edited since it. */
  canMarkSent: boolean;
  /** "Marcar como enviado ao cliente": one `issue` op when the kernel still offers it at the write. */
  markSent: () => Promise<void>;
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
  const newest = latestRevision(revisions);
  const latestSeq = newest?.snapshot_seq ?? null;
  // True (the next number) until the read lands for this snapshot, as before; `editedRead`
  // says whether it landed, so the 16.2 banner never flashes on an unedited relatório.
  const { edited, read: editedRead } = useEditedSinceRead(db, relatorioId, latestSeq);
  const markedSent = useMarkedSentSince(db, relatorioId, latestSeq);
  const idleNumber = idleRevisionNumber(revisions, edited);

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

  /**
   * One `relatorio/status` put when the kernel has a transition for `(current status, the
   * server's answer)` (`advanceOnGenerate`); nothing otherwise. The status is read from the device store at the moment of the write,
   * never from the render that scheduled it (Q11): a revision can arrive in a render whose
   * live `relatorio` is still null (a reload) or one op behind, and the op would then be
   * computed from the wrong row, or skipped.
   */
  const emitStatus = useCallback(
    async (outcome: GenerateOutcome) => {
      if (db === null || user === null) return;
      const current = await relatorioRow(db, relatorioId);
      if (current === null) return;
      const next = advanceOnGenerate(current.status, outcome);
      if (next === null) return;
      await commitBatch(db, [putRelatorioStatusOp({ id: user.id, companyId: user.companyId }, relatorioId, next)], { newId, now });
    },
    [db, user, relatorioId],
  );
  const emitStatusRef = useRef(emitStatus);
  emitStatusRef.current = emitStatus;

  /**
   * The revision arrived: R4 (Story 7.5), the app-level watcher's `finishGenerate` raises the
   * toast and clears the recorded wait, once per revision whichever of the two sees it
   * first; then the ready state. No status is written (2026-10-10): the result block's pill
   * reads the live row, Em revisão until the user marks the revision as sent.
   */
  const finishing = useRef<string | null>(null);
  const finishReady = useCallback(
    (revision: RevisionRow) => {
      // Once per revision while its finish runs (the live queries re-emit meanwhile); released
      // once ready is set, so a later finish of the same revision (the job-done branch after
      // "Gerar de novo") is not stranded in working.
      if (finishing.current === revision.id) return;
      finishing.current = revision.id;
      const ready = () => {
        if (mounted.current) setPhase({ kind: 'ready', number: revision.number, revisionId: revision.id, unchanged: false });
        finishing.current = null;
      };
      void (db === null ? Promise.resolve(false) : finishGenerate(db, relatorioId, revision, showToast))
        .catch((error: unknown) => console.error('generate finish failed', error))
        .then(ready);
    },
    [db, relatorioId, showToast],
  );

  // Resume. A wait this device recorded wins: revision present -> ready (toast);
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
                await emitStatusRef.current('queued');
              } catch (error) {
                console.error('generate status op failed', error);
              }
            }
            if (mounted.current) setPhase({ kind: 'working', number: answer.revision_number, jobId: answer.job_id });
          } else {
            // `unchanged`: the server answered the revision it already holds. The same table
            // path as a queued press: a relatório moved back to Em campo or Rascunho takes
            // `generate` (Em revisão); nothing is issued (2026-10-10), so it ends Em revisão.
            // An Emitido relatório stays Emitido (2026-10-13): the client has that revision.
            try {
              await emitStatusRef.current('unchanged');
            } catch (error) {
              console.error('generate status op failed', error);
            }
            // The answered revision is pulled when this device does not hold it yet (a fresh
            // device), so the result block has its files and the right revision to speak of.
            if (!(await revisionRows(db, relatorioId)).some((row) => row.id === answer.revision_id)) {
              await sync.syncRelatorio(relatorioId).catch(() => undefined);
            }
            if (mounted.current) setPhase({ kind: 'ready', number: answer.revision_number, revisionId: answer.revision_id, unchanged: true });
          }
          return;
        } catch (error) {
          const failure = error instanceof SyncRequestError && error.failure.kind === 'http' ? error.failure : null;
          const notCaughtUp = failure?.code === 'not_caught_up';
          if (!notCaughtUp) throw error;
          // E9 sweep B14: files no upload of this device will bring keep the barrier shut
          // however often it is asked again, so the request fails at once and says so.
          const details = notCaughtUpDetailsSchema.safeParse(failure?.details);
          if (details.success) {
            const uploads = await pendingUploads(db);
            const pending = new Set(uploads.filter((item) => item.upload_error?.state !== 'dead').map((item) => item.id));
            if (!notCaughtUpRetryable(details.data, pending)) {
              if (mounted.current) setPhase({ kind: 'failed', missingFiles: details.data.missing_files.length });
              return;
            }
          }
          if (++attempts >= MAX_NOT_CAUGHT_UP_RETRIES) throw error;
          await sync.syncNow();
          await new Promise((resolve) => setTimeout(resolve, timing.retryMs));
          if (!mounted.current) return;
        }
      }
    } catch (error) {
      // F-12 / W-23: a 401 is a session that expired: the re-auth banner and its own words.
      const expired = isSessionExpired(error);
      if (isUnauthorized(error)) publishReAuth();
      if (mounted.current) setPhase(expired ? { kind: 'failed', sessionExpired: true } : { kind: 'failed' });
    }
  }, [db, relatorioId, revisions, sync, timing.retryMs]);
  const requestRef = useRef(request);
  requestRef.current = request;

  // Flushing: wait for the outbox to drain and the uploads to land, then request. A
  // dead op stops it, going offline hands the button back with the offline reason, and a
  // cycle that leaves work behind is kicked again, a bounded number of times.
  const { counts, running, syncNow, online, outboxRead } = sync;
  useEffect(() => {
    if (phase.kind !== 'flushing' || db === null) return;
    // Until the provider's first read of the outbox lands, its counts are empty, not zero: a
    // press then must wait for the read, never send a relatório the server does not hold yet
    // (a 404, 4.8-E2E-001 on the rfp branch, whose launch delayed that first read).
    if (outboxRead === false) return;
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
  }, [phase.kind, db, online, outboxRead, counts.dead, counts.pending, counts.sent, running, syncNow, timing.retryMs]);

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

  const markSent = useCallback(async () => {
    if (db === null || user === null) return;
    await markSentNow(db, { id: user.id, companyId: user.companyId }, relatorioId).catch((error: unknown) => console.error('issue status op failed', error));
  }, [db, user, relatorioId]);
  // Never offered in the ready phase while the revision it shows is not on this device: the
  // newest held one would be an older revision, and marking that as sent would be wrong.
  const readyHeld = phase.kind !== 'ready' || revisions.some((row) => (phase.revisionId === null ? row.number === phase.number : row.id === phase.revisionId));
  const sendable = relatorio !== null && readyHeld && canMarkSent({ status: relatorio.status, latest: latestRevision(revisions)?.number ?? null, edited });

  const beforeEdits = newest !== null && editedRead && edited;
  const beforeEditsBanner = beforeEdits && phase.kind !== 'working' ? revisionsBeforeEditsBanner(newest, { edited, markedSent }) : null;

  return {
    phase,
    relatorio,
    revisions,
    latestJob,
    nextNumber,
    idleNumber,
    userNames: sync.userNames,
    online: sync.online,
    edited,
    beforeEditsBanner,
    beforeEdits,
    canMarkSent: sendable,
    markSent,
    start,
    reset,
  };
}
