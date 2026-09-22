/*
 * AR-7/AD-8: registering the app-shell worker, and the activation gate.
 *
 * The gate lives in the page because the rule is about the user's pending work and a
 * worker cannot read the per-user Dexie database. `promoteWaitingShell` takes the
 * backlog as a function so this module imports nothing from `src/db`, and both of its
 * branches are directly testable.
 */

export interface RegisterDeps {
  /** Defaults to `navigator.serviceWorker`; absent in jsdom, in tests and on iOS in a private window. */
  container?: ServiceWorkerContainer;
  log?: (message: string, error: unknown) => void;
}

function defaultContainer(): ServiceWorkerContainer | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
}

const warn = (message: string, error: unknown) => console.warn(message, error);

/**
 * Registers `/sw.js` at the root scope. Every failure is swallowed: a browser that
 * refuses the worker (private mode, an insecure origin) must still run the app — it
 * simply does not survive a cold open with no network.
 */
export async function registerServiceWorker(deps: RegisterDeps = {}): Promise<ServiceWorkerRegistration | null> {
  const container = deps.container ?? defaultContainer();
  if (container === undefined || typeof container.register !== 'function') return null;
  try {
    return await container.register('/sw.js', { scope: '/' });
  } catch (error) {
    (deps.log ?? warn)('service worker registration failed', error);
    return null;
  }
}

/** What the gate did, so a caller (and the test) can tell the three outcomes apart. */
export type PromoteResult = 'promoted' | 'held-back' | 'nothing-waiting';

/**
 * AD-8: "the service worker activates a new shell on the next launch only when the
 * outbox is empty". A waiting worker is promoted only when the backlog is zero; with
 * work pending the page keeps running the old shell and the next launch tries again.
 */
export async function promoteWaitingShell(
  registration: ServiceWorkerRegistration | null,
  backlog: () => Promise<number>,
): Promise<PromoteResult> {
  const waiting = registration?.waiting;
  if (!waiting) return 'nothing-waiting';
  const count = await backlog();
  if (count > 0) return 'held-back';
  waiting.postMessage({ type: 'activate-shell' });
  return 'promoted';
}
