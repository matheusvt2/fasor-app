import type { UxOutcome } from '@app/domain';
import type { AppDatabase } from '../db/schema.ts';
import { photoReadingStates, type PhotoReadingState } from '../db/ux-events-store.ts';
import { track } from './track.ts';

/*
 * Epic 18, Story 18.1: a reading lands. After each finished sync cycle the device compares
 * its photos' reading statuses with the last look; a reading that was not yet finished and
 * is now done or failed queues a `reading_result` (its kind and outcome) and a `wait` of kind
 * `reading` from the shot being stored (`captured_at`) to the result reaching the device.
 * The first look of a session is the baseline: nothing that landed before it is tracked.
 */

const PENDING = new Set<PhotoReadingState['status']>(['none', 'queued', 'running']);
const OUTCOME: Partial<Record<PhotoReadingState['status'], UxOutcome>> = { done: 'ok', failed: 'fail' };

let seen: Map<string, PhotoReadingState['status']> | null = null;
let seenDb: AppDatabase | null = null;
/** When the last look was taken: a photo captured after it was still pending then. */
let seenAt: number | null = null;

function idsOf(state: PhotoReadingState): { relatorio_id?: string; block_id?: string } {
  return {
    ...(state.relatorio_id === null ? {} : { relatorio_id: state.relatorio_id }),
    ...(state.block_id === null ? {} : { block_id: state.block_id }),
  };
}

/** Looks once at the device's readings and tracks the ones that landed since the last look. Never rejects. */
export async function observeReadingResults(db: AppDatabase, nowMs: number = Date.now()): Promise<void> {
  try {
    const states = await photoReadingStates(db);
    const before = seenDb === db ? seen : null;
    const lastLook = seenDb === db ? seenAt : null;
    const next = new Map<string, PhotoReadingState['status']>();
    for (const state of states) {
      next.set(state.id, state.status);
      const previous = before?.get(state.id);
      const outcome = OUTCOME[state.status];
      if (before === null || outcome === undefined) continue;
      // Only a reading pending at the last look has landed now. A photo absent then counts as
      // pending when it was captured after that look (shot, read and pulled within one cycle);
      // one captured before and first seen finished (pulled from another device) was never
      // waited for here.
      const pendingThen =
        previous === undefined ? lastLook !== null && Date.parse(state.captured_at) > lastLook : PENDING.has(previous);
      if (!pendingThen) continue;
      track({ name: 'reading_result', kind: state.kind, outcome, ...idsOf(state) });
      const waited = nowMs - Date.parse(state.captured_at);
      if (Number.isFinite(waited) && waited >= 0) {
        track({ name: 'wait', kind: 'reading', outcome, duration_ms: Math.round(waited), ...idsOf(state) });
      }
    }
    seen = next;
    seenDb = db;
    seenAt = nowMs;
  } catch {
    // An event is never worth a failure.
  }
}

/** Forgets the last look (tests). */
export function resetReadingResultsForTests(): void {
  seen = null;
  seenDb = null;
  seenAt = null;
}
