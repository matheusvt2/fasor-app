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

/** Unregisters every worker on this origin, swallowing every failure. */
export async function unregisterServiceWorkers(deps: RegisterDeps = {}): Promise<number> {
  const container = deps.container ?? defaultContainer();
  if (container === undefined || typeof container.getRegistrations !== 'function') return 0;
  try {
    const registrations = await container.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    return registrations.length;
  } catch (error) {
    (deps.log ?? warn)('could not unregister a service worker', error);
    return 0;
  }
}

/** What the gate did, so a caller (and the test) can tell the three outcomes apart. */
export type PromoteResult = 'promoted' | 'held-back' | 'nothing-waiting';

/**
 * AD-8, the other half of the activation rule: while a new shell waits and work is still
 * on its way to the server, the *active* shell must keep answering navigations from its
 * own cache, or the network would hand the tab the new document and its new hashed assets
 * long before the swap is allowed to happen.
 *
 * Nothing to wait for, or nothing pending, and the hold is released: navigation goes back
 * to network-first, which is how the next build is discovered at all.
 */
export function shouldHoldShell(registration: ServiceWorkerRegistration | null, backlog: number): boolean {
  if (registration?.waiting == null && registration?.installing == null) return false;
  return backlog > 0;
}

/** Tells the active worker whether to hold. Returns what was sent, or null when nobody heard. */
export function holdShell(registration: ServiceWorkerRegistration | null, backlog: number): boolean | null {
  const active = registration?.active;
  if (!active) return null;
  const hold = shouldHoldShell(registration, backlog);
  active.postMessage({ type: 'hold-shell', hold });
  return hold;
}

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
