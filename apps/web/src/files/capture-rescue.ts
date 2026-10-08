import { makeOp, type NewId, type Op } from '@app/domain';
import { photoCreateDraft, type PhotoCaptureInput } from '../db/file-commit.ts';
import type { SyncClient } from '../sync/client.ts';

/*
 * Story 6.2 (FR-57, AR-7): what happens when the browser refuses to store a shot
 * (`QuotaExceededError` on the commit). Capture is still attempted and a captured photo
 * stays safe: online, its create op is pushed and its bytes PUT straight to the server
 * (the pull brings the row back, and the thumb refresh its server thumb); offline, it is
 * kept in memory, the surface shows the error toast, and it is tried again once on the
 * next shot or on "Concluir fotos".
 *
 * Story 13.6 (CAP-4): before either, the acknowledged originals the kernel allows are evicted
 * (`freeSpace`, sized to the shot) and the commit is tried once more. A shot still refused
 * offline is held, and the held list is observable (`subscribe`): while it is not empty the
 * camera blocks the next shot and the shell forces the storage banner.
 */

/** True for the browser's quota refusal, however Dexie wrapped it. */
export function isQuotaError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current !== null && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const { name } = current as { name?: unknown };
    if (name === 'QuotaExceededError') return true;
    const next = current as { inner?: unknown; cause?: unknown };
    current = next.inner ?? next.cause;
  }
  return false;
}

export type SaveOutcome = 'saved' | 'sent' | 'held';

export interface RescueDeps {
  isOnline: () => boolean;
  /** The normal path: `commitPhotoCapture`. */
  commit: (input: PhotoCaptureInput) => Promise<unknown>;
  /** The refusal path while online: push the create and PUT the bytes (`sendPhotoDirect`). */
  sendDirect: (input: PhotoCaptureInput) => Promise<void>;
  /**
   * Story 13.6: frees at least `neededBytes` of acknowledged originals where the kernel allows
   * (`runEviction`), before the refused commit is tried once more. A throw is ignored.
   */
  freeSpace?: (neededBytes: number) => Promise<unknown>;
}

export interface CaptureRescue {
  /** Saves one shot: stored here, sent straight to the server, or held in memory. */
  save(input: PhotoCaptureInput, deps: RescueDeps): Promise<SaveOutcome>;
  /** Tries every held shot once more; resolves to how many are still held. */
  retryHeld(deps: RescueDeps): Promise<number>;
  heldCount(): number;
  /** Story 13.6: called after every change of the held count; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** The bytes a shot needs on the device: its original and its thumb. */
export function shotBytes(input: Pick<PhotoCaptureInput, 'original' | 'thumb'>): number {
  return input.original.size + input.thumb.size;
}

export function createCaptureRescue(): CaptureRescue {
  let held: PhotoCaptureInput[] = [];
  const listeners = new Set<() => void>();
  let retrying: Promise<number> | null = null;

  function setHeld(next: PhotoCaptureInput[]): void {
    const changed = next.length !== held.length;
    held = next;
    if (changed) for (const listener of [...listeners]) listener();
  }

  async function attempt(input: PhotoCaptureInput, deps: RescueDeps): Promise<SaveOutcome> {
    try {
      await deps.commit(input);
      return 'saved';
    } catch (error) {
      if (!isQuotaError(error)) throw error;
    }
    // CAP-4: free what the kernel allows, sized to this shot, and try the device once more.
    try {
      await deps.freeSpace?.(shotBytes(input));
    } catch {
      // Eviction is best effort: the retry below still runs.
    }
    try {
      await deps.commit(input);
      return 'saved';
    } catch (error) {
      if (!isQuotaError(error)) throw error;
    }
    if (deps.isOnline()) {
      try {
        await deps.sendDirect(input);
        return 'sent';
      } catch {
        // Neither the device nor the server took it: it stays in memory.
      }
    }
    return 'held';
  }

  return {
    async save(input, deps) {
      const outcome = await attempt(input, deps);
      if (outcome === 'held') setHeld([...held, input]);
      return outcome;
    },
    retryHeld(deps) {
      // One retry at a time (the camera's open, a shot and "Concluir fotos" may ask together):
      // a second caller waits for the one running, so a held shot is never committed twice.
      if (retrying !== null) return retrying;
      const run = async (): Promise<number> => {
        // Each held shot leaves the list only once it was stored or sent, so the refused state
        // stays on while the retry is still running.
        for (const input of [...held]) {
          let outcome: SaveOutcome;
          try {
            outcome = await attempt(input, deps);
          } catch {
            outcome = 'held';
          }
          if (outcome !== 'held') setHeld(held.filter((shot) => shot !== input));
        }
        return held.length;
      };
      retrying = run().finally(() => {
        retrying = null;
      });
      return retrying;
    },
    heldCount: () => held.length,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * The page's one rescue list: a shot held in memory outlives the camera view that took it,
 * so the next capture session of this tab still retries it.
 */
export const sessionCaptureRescue: CaptureRescue = createCaptureRescue();

/** The file ids whose direct create the server already applied in this tab (a retry only re-PUTs). */
export const sessionAppliedCreates = new Set<string>();

/**
 * Pushes the shot's `file/{id}` create op and PUTs its bytes, bypassing the local store.
 * Throws unless the server applied the op and took the bytes. A shot whose create was
 * applied before (`applied`, the PUT failed) is not pushed again: a second create for the
 * same id would never apply, so the retry only sends the bytes.
 */
export async function sendPhotoDirect(
  input: PhotoCaptureInput,
  deps: {
    client: Pick<SyncClient, 'pushOps' | 'uploadFile'>;
    deviceId: string;
    localSeq: number;
    newId: NewId;
    now: Date;
    applied?: Set<string>;
  },
): Promise<void> {
  const applied = deps.applied ?? sessionAppliedCreates;
  if (!applied.has(input.fileId)) {
    const op: Op = makeOp({ ...photoCreateDraft(input, deps.localSeq), device_id: deps.deviceId }, { newId: deps.newId, now: deps.now });
    const pushed = await deps.client.pushOps([op]);
    if (!pushed.applied.some((entry) => entry.op_id === op.op_id)) throw new Error('photo create not applied');
    applied.add(input.fileId);
  }
  await deps.client.uploadFile(input.fileId, input.original, input.sha256);
}

const directSeqs = new Map<string, number>();
let lastIssuedSeq = 0;

/**
 * The `local_seq` of a shot sent straight to the server: reserved once per shot (a retry
 * keeps it) and never below a number already issued in this tab, so it cannot share one
 * with the next committed shot. The caller writes it back to `photo_seq` when it can.
 */
export function reserveDirectSeq(fileId: string, stored: number): number {
  const kept = directSeqs.get(fileId);
  if (kept !== undefined) return kept;
  const seq = Math.max(stored + 1, lastIssuedSeq + 1);
  lastIssuedSeq = seq;
  directSeqs.set(fileId, seq);
  return seq;
}
