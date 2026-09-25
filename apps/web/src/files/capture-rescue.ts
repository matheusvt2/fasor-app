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
}

export interface CaptureRescue {
  /** Saves one shot: stored here, sent straight to the server, or held in memory. */
  save(input: PhotoCaptureInput, deps: RescueDeps): Promise<SaveOutcome>;
  /** Tries every held shot once more; resolves to how many are still held. */
  retryHeld(deps: RescueDeps): Promise<number>;
  heldCount(): number;
}

export function createCaptureRescue(): CaptureRescue {
  let held: PhotoCaptureInput[] = [];

  async function attempt(input: PhotoCaptureInput, deps: RescueDeps): Promise<SaveOutcome> {
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
      if (outcome === 'held') held.push(input);
      return outcome;
    },
    async retryHeld(deps) {
      const waiting = held;
      held = [];
      for (const input of waiting) {
        let outcome: SaveOutcome;
        try {
          outcome = await attempt(input, deps);
        } catch {
          outcome = 'held';
        }
        if (outcome === 'held') held.push(input);
      }
      return held.length;
    },
    heldCount: () => held.length,
  };
}

/**
 * The page's one rescue list: a shot held in memory outlives the camera view that took it,
 * so the next capture session of this tab still retries it.
 */
export const sessionCaptureRescue: CaptureRescue = createCaptureRescue();

/**
 * Pushes the shot's `file/{id}` create op and PUTs its bytes, bypassing the local store.
 * Throws unless the server applied the op and took the bytes.
 */
export async function sendPhotoDirect(
  input: PhotoCaptureInput,
  deps: { client: Pick<SyncClient, 'pushOps' | 'uploadFile'>; deviceId: string; localSeq: number; newId: NewId; now: Date },
): Promise<void> {
  const op: Op = makeOp({ ...photoCreateDraft(input, deps.localSeq), device_id: deps.deviceId }, { newId: deps.newId, now: deps.now });
  const pushed = await deps.client.pushOps([op]);
  if (!pushed.applied.some((entry) => entry.op_id === op.op_id)) throw new Error('photo create not applied');
  await deps.client.uploadFile(input.fileId, input.original, input.sha256);
}
