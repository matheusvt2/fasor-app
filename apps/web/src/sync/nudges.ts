import type { Timers } from '../input/field-commit.ts';
import { COMMIT_SYNC_WINDOW_MS, onCommit } from './commit-signal.ts';

/*
 * Story 25.3 (M03): the moments that ask the engine for a cycle besides the launch, `online`,
 * the 60 s tick and "Sincronizar agora": a local commit (coalesced) and the app coming back to
 * the front. Each returns its unsubscribe; the sync provider wires them to `engine.nudge`, which
 * does nothing offline, paused or stopped and runs at most one cycle at a time.
 */

const globalTimers: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

/**
 * Story 25.3, Design Notes D1: the first commit announced arms one timer of
 * `COMMIT_SYNC_WINDOW_MS`; every commit announced before it fires joins it; the timer nudges once.
 * The window is never restarted, so continuous typing never starves it.
 */
export function followCommits(nudge: () => void, timers: Timers = globalTimers, windowMs: number = COMMIT_SYNC_WINDOW_MS): () => void {
  let handle: unknown = null;
  const stop = onCommit(() => {
    if (handle !== null) return;
    handle = timers.setTimeout(() => {
      handle = null;
      nudge();
    }, windowMs);
  });
  return () => {
    stop();
    if (handle !== null) timers.clearTimeout(handle);
    handle = null;
  };
}

/** Story 25.3: the page turning visible again (back from the camera, another app, a locked screen) nudges once. */
export function followVisible(nudge: () => void, target: Document | undefined = typeof document === 'undefined' ? undefined : document): () => void {
  if (target === undefined) return () => {};
  const onChange = () => {
    if (target.visibilityState === 'visible') nudge();
  };
  target.addEventListener('visibilitychange', onChange);
  return () => target.removeEventListener('visibilitychange', onChange);
}
