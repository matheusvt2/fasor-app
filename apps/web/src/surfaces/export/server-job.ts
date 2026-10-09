import { pendingUploadCount } from '../../db/file-store.ts';
import type { AppDatabase } from '../../db/schema.ts';
import type { SyncState } from '../../state/sync.tsx';
import { SessionExpiredError } from './session-expired.tsx';

/*
 * Review fixes 2026-10-08 (QW25: XC-V2, XC-7, WEB-6, WDT-V1): the drain "Pré-visualizar" and
 * "Conferir antes de emitir" run before asking the server for a job, once, with the guards
 * "Gerar relatório" already had and they lacked. Each round stops on an abort (the dialog
 * closed, the surface unmounted), on a session known to be gone, and on a dead op (an op the
 * server refused can never reach it, so the barrier would judge server state without the
 * engineer's edit); otherwise it syncs and ends once the outbox and the uploads are empty. The
 * waits between rounds and between ask attempts are abortable.
 */

/** A dead op is held in the outbox: the job is not asked for ("Há alterações rejeitadas…"). */
export class DeadOpsError extends Error {
  constructor() {
    super('a dead op is held in the outbox');
    this.name = 'DeadOpsError';
  }
}

/** The press was cancelled (the dialog closed, the surface went away): never a failure. */
export class JobAborted extends Error {
  constructor() {
    super('server job aborted');
    this.name = 'JobAborted';
  }
}

/** True for an abort of the press, which is never shown nor logged as a failure. */
export function isJobAborted(error: unknown): boolean {
  return error instanceof JobAborted;
}

/** Throws `JobAborted` once `signal` is aborted. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new JobAborted();
}

/** Waits `ms`, or rejects with `JobAborted` as soon as `signal` aborts. */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new JobAborted());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new JobAborted());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** The outbox rows the server refused for good. */
export async function deadOpCount(db: AppDatabase): Promise<number> {
  return db.outbox.where('status').equals('dead').count();
}

export interface DrainOptions {
  /** Rounds after the first before the drain gives up ("outbox did not drain"). */
  maxRounds: number;
  /** The wait between rounds. */
  retryMs: number;
  signal?: AbortSignal;
  /** Whether the session is known to be gone (`session.reAuthRequired`), read at every round. */
  isSessionExpired: () => boolean;
}

/**
 * Drains the outbox and the uploads before a server job is asked for. Throws `JobAborted`,
 * `SessionExpiredError`, `DeadOpsError`, or an error once `maxRounds` rounds left work behind.
 */
export async function drainForServerJob(db: AppDatabase, engine: Pick<SyncState, 'syncNow'>, options: DrainOptions): Promise<void> {
  const { maxRounds, retryMs, signal, isSessionExpired } = options;
  for (let round = 0; ; round++) {
    throwIfAborted(signal);
    if (isSessionExpired()) throw new SessionExpiredError();
    await engine.syncNow().catch(() => undefined);
    throwIfAborted(signal);
    if (isSessionExpired()) throw new SessionExpiredError();
    if ((await deadOpCount(db)) > 0) throw new DeadOpsError();
    const unsent = await db.outbox.where('status').anyOf('pending', 'sent').count();
    if (unsent === 0 && (await pendingUploadCount(db)) === 0) return;
    if (round >= maxRounds) throw new Error('outbox did not drain');
    await wait(retryMs, signal);
  }
}

/**
 * Review fixes 2026-10-08: the checks before every ask of the server (the first and each retry
 * after a `409`): no abort, no session known to be gone, no dead op. `lastOpIdFor` skips dead
 * ops, so a retry without this check could pass the barrier without the refused edit.
 */
export async function guardBeforeAsk(db: AppDatabase, options: Pick<DrainOptions, 'signal' | 'isSessionExpired'>): Promise<void> {
  throwIfAborted(options.signal);
  if (options.isSessionExpired()) throw new SessionExpiredError();
  if ((await deadOpCount(db)) > 0) throw new DeadOpsError();
  throwIfAborted(options.signal);
}
