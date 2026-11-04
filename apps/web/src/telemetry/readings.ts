import type { UxOutcome } from '@app/domain';
import { now } from '../clock.ts';
import type { AppDatabase } from '../db/schema.ts';
import { filesPulledAfter, filesWrittenSince, lastPulledSeq, photoReadingStates, photoReadingStatesOf, type PhotoReadingState } from '../db/ux-events-store.ts';
import { track } from './track.ts';

/*
 * Epic 18, Story 18.1: a reading lands. After each finished sync cycle the device compares
 * its photos' reading statuses with the last look; a reading that was not yet finished and
 * is now done or failed queues a `reading_result` (its kind and outcome) and a `wait` of kind
 * `reading` from the shot being stored (`captured_at`) to the result reaching the device.
 * The first look of a database is the baseline: nothing that landed before it is tracked.
 *
 * E18-A1 (R-A14): only the baseline reads every photo. A later look reads, by key, the photos
 * pending at the last look, the `file` entities named by the ops pulled since it (a reading
 * lands through the pull) and those named by this device's own ops written since it (a photo
 * shot here enters `pending` at the first look after its commit); between looks the module
 * keeps only the pending ids, the highest pulled `seq` and the look's instant. Looks run one
 * after the other, so two cycles ending together never read the same last look.
 */

const PENDING = new Set<PhotoReadingState['status']>(['none', 'queued', 'running']);
const OUTCOME: Partial<Record<PhotoReadingState['status'], UxOutcome>> = { done: 'ok', failed: 'fail' };

interface LastLook {
  db: AppDatabase;
  /** The photos whose reading had not finished then. */
  pending: Set<string>;
  /** The highest pulled `seq` then: ops above it came in since. */
  seq: number;
  /** When it was taken: a photo captured after it was still pending then. */
  at: number;
}

let last: LastLook | null = null;
let looking: Promise<void> = Promise.resolve();

function idsOf(state: PhotoReadingState): { relatorio_id?: string; block_id?: string } {
  return {
    ...(state.relatorio_id === null ? {} : { relatorio_id: state.relatorio_id }),
    ...(state.block_id === null ? {} : { block_id: state.block_id }),
  };
}

/** Looks once at the device's readings and tracks the ones that landed since the last look, after any look in flight. Never rejects. */
export function observeReadingResults(db: AppDatabase, nowMs: number = now().getTime()): Promise<void> {
  const look = looking.then(() => lookOnce(db, nowMs));
  looking = look;
  return look;
}

async function lookOnce(db: AppDatabase, nowMs: number): Promise<void> {
  try {
    const before = last?.db === db ? last : null;
    let states: PhotoReadingState[];
    let seq: number;
    if (before === null) {
      seq = await lastPulledSeq(db);
      states = await photoReadingStates(db);
    } else {
      const pulled = await filesPulledAfter(db, before.seq);
      const written = await filesWrittenSince(db, before.at);
      seq = pulled.seq;
      states = await photoReadingStatesOf(db, [...before.pending, ...pulled.ids, ...written]);
    }
    const pending = new Set<string>();
    for (const state of states) {
      if (PENDING.has(state.status)) pending.add(state.id);
      const outcome = OUTCOME[state.status];
      if (before === null || outcome === undefined) continue;
      // Only a reading pending at the last look has landed now. A photo not pending then counts
      // as pending when it was captured after that look (shot, read and pulled within one
      // cycle); one captured before and seen finished (pulled from another device, or already
      // landed) was never waited for here.
      const pendingThen = before.pending.has(state.id) || Date.parse(state.captured_at) > before.at;
      if (!pendingThen) continue;
      track({ name: 'reading_result', kind: state.kind, outcome, ...idsOf(state) });
      const waited = nowMs - Date.parse(state.captured_at);
      if (Number.isFinite(waited) && waited >= 0) {
        track({ name: 'wait', kind: 'reading', outcome, duration_ms: Math.round(waited), ...idsOf(state) });
      }
    }
    last = { db, pending, seq, at: nowMs };
  } catch {
    // An event is never worth a failure.
  }
}

/** Forgets the last look (tests). */
export function resetReadingResultsForTests(): void {
  last = null;
  looking = Promise.resolve();
}
