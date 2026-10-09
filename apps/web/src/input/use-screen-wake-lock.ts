import { KEEP_SCREEN_ON_DEFAULT, WAKE_LOCK_IDLE_MS, wakeLockWanted } from '@app/domain';
import { useEffect } from 'react';
import { now } from '../clock.ts';
import { useLiveQuery } from '../db/live.ts';
import { readKeepScreenOn } from '../db/prefs.ts';
import type { AppDatabase } from '../db/schema.ts';
import { useSession } from '../state/session.tsx';

/*
 * Review 2026-10-08 (FLD-1): the screen stays awake while a ficha, the camera or a reading wait
 * is shown, so an auto-lock never costs the engineer 3-6 touches (and a glove) mid-sheet.
 *
 * One module-level manager owns the single `WakeLockSentinel`. Each surface that wants the
 * screen on is a holder (`useScreenWakeLock(active)`); the manager counts them, listens to
 * `pointerdown` and `keydown` (capture) and to `visibilitychange`, and asks the kernel's
 * `wakeLockWanted` each time: the "Manter a tela ligada" switch on, a holder, the page
 * visible, a touch or key within ten minutes. The browser drops the sentinel when the page
 * is hidden (its `release` event); the next visible page or interaction takes a new one.
 *
 * The Screen Wake Lock API is optional: absent, or a `request` that rejects or throws
 * (battery saver, a policy), shows nothing and is retried only on the next interaction or
 * visibility change. A `request` that has not settled after `WAKE_LOCK_REQUEST_LIMIT_MS` counts
 * as refused the same way; a sentinel it brings later is kept only while still wanted and none
 * is held.
 */

/** How long a `request` may hang before it counts as refused (the next touch asks again). */
export const WAKE_LOCK_REQUEST_LIMIT_MS = 3_000;

interface Sentinel {
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
}

interface WakeLockApi {
  request: (type: 'screen') => Promise<Sentinel>;
}

/** The manager's state, one per page. */
const state = {
  holders: 0,
  /** The switch as the holders read it; null until read (no lock is asked for before). */
  enabled: null as boolean | null,
  lastInteraction: now().getTime(),
  sentinel: null as Sentinel | null,
  requesting: false,
  /** The request in flight, by number: a late answer to an abandoned one is told apart. */
  request: 0,
  requestTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  idleTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  listening: false,
};

function wakeLockApi(): WakeLockApi | null {
  if (typeof navigator === 'undefined') return null;
  const lock = (navigator as Navigator & { wakeLock?: Partial<WakeLockApi> }).wakeLock;
  return lock !== undefined && lock !== null && typeof lock.request === 'function' ? (lock as WakeLockApi) : null;
}

function visible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

function idleMs(): number {
  return now().getTime() - state.lastInteraction;
}

function wanted(): boolean {
  return wakeLockWanted({ enabled: state.enabled === true, holders: state.holders, visible: visible(), idleMs: idleMs() });
}

function release(): void {
  const sentinel = state.sentinel;
  state.sentinel = null;
  if (sentinel !== null) void sentinel.release().catch(() => undefined);
}

function acquire(): void {
  const lock = wakeLockApi();
  if (lock === null) return;
  state.requesting = true;
  const id = ++state.request;
  const settled = () => {
    if (state.request !== id) return;
    clearTimeout(state.requestTimer);
    state.requesting = false;
  };
  let request: Promise<Sentinel>;
  try {
    request = lock.request('screen');
  } catch {
    settled();
    return;
  }
  // A hang counts as refused: the next touch or visibility change asks again.
  clearTimeout(state.requestTimer);
  state.requestTimer = setTimeout(settled, WAKE_LOCK_REQUEST_LIMIT_MS);
  request.then(
    (sentinel) => {
      settled();
      // Released or no longer wanted while it was being asked for (or one is already held,
      // a late answer to a request given up on): given back at once.
      if (!wanted() || state.sentinel !== null) {
        void sentinel.release().catch(() => undefined);
        return;
      }
      state.sentinel = sentinel;
      sentinel.addEventListener('release', () => {
        if (state.sentinel === sentinel) state.sentinel = null;
      });
    },
    () => {
      // Refused: nothing is shown; the next interaction or visibility change asks again.
      settled();
    },
  );
}

/** Asks the kernel and holds or releases the lock accordingly; while held, re-checks when the idle limit would pass. */
function evaluate(): void {
  clearTimeout(state.idleTimer);
  state.idleTimer = undefined;
  if (!wanted()) {
    release();
    return;
  }
  state.idleTimer = setTimeout(evaluate, Math.max(0, WAKE_LOCK_IDLE_MS - idleMs()) + 1);
  if (state.sentinel !== null || state.requesting) return;
  acquire();
}

const onInteraction = () => {
  state.lastInteraction = now().getTime();
  evaluate();
};

const onVisibility = () => {
  // Coming back to the page counts as an interaction (the engineer just unlocked the tablet).
  if (visible()) state.lastInteraction = now().getTime();
  evaluate();
};

function listen(on: boolean): void {
  if (typeof window === 'undefined' || state.listening === on) return;
  state.listening = on;
  const method = on ? 'addEventListener' : 'removeEventListener';
  window[method]('pointerdown', onInteraction, true);
  window[method]('keydown', onInteraction, true);
  document[method]('visibilitychange', onVisibility);
}

/** One surface wants the screen on; the returned function gives it back. */
export function holdScreenWakeLock(): () => void {
  // The first holder came with a tap (the one that opened the sheet or the camera): it counts
  // as an interaction, so a sheet opened long after the app loaded is not taken for idle.
  if (state.holders === 0) state.lastInteraction = now().getTime();
  state.holders += 1;
  listen(true);
  evaluate();
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    state.holders -= 1;
    // The touch and key listeners stay once installed: the idle time always counts from the
    // last real touch, so a sheet opened long after an earlier one is not taken for idle.
    evaluate();
  };
}

/** The "Manter a tela ligada" switch as stored on this device (the holders and Conta report it). */
export function setKeepScreenOn(on: boolean): void {
  if (state.enabled === on) return;
  state.enabled = on;
  evaluate();
}

/** Test seam: the manager back to a fresh page. */
export function resetScreenWakeLockForTests(): void {
  clearTimeout(state.idleTimer);
  clearTimeout(state.requestTimer);
  listen(false);
  Object.assign(state, { holders: 0, enabled: null, lastInteraction: now().getTime(), sentinel: null, requesting: false, request: 0, requestTimer: undefined, idleTimer: undefined, listening: false });
}

/**
 * The device's database where there is a session; null where a surface renders without one (a
 * component test of the camera): the switch then reads its default. `useSession` reads its
 * context before it throws, so the hook order is the same either way.
 */
function useDeviceDatabase(): AppDatabase | null {
  try {
    return useSession().database;
  } catch {
    return null;
  }
}

/** "Manter a tela ligada" on this device: null until read; on by default (also with no database). */
export function useKeepScreenOn(): boolean | null {
  const db = useDeviceDatabase();
  const stored = useLiveQuery(() => (db === null ? Promise.resolve(KEEP_SCREEN_ON_DEFAULT) : readKeepScreenOn(db)), [db], null) ?? null;
  return db === null ? KEEP_SCREEN_ON_DEFAULT : stored;
}

/** While `active`, this surface wants the screen kept on (the switch, visibility and idle time decide). */
export function useScreenWakeLock(active: boolean): void {
  const enabled = useKeepScreenOn();
  useEffect(() => {
    if (enabled !== null) setKeepScreenOn(enabled);
  }, [enabled]);
  useEffect(() => {
    if (!active) return;
    return holdScreenWakeLock();
  }, [active]);
}
