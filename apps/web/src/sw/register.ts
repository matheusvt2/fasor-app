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
 * AD-8, the other half of the activation rule: while work is still on its way to the
 * server, the active worker must keep answering navigations from the shell the job
 * started on, or the network would hand the tab the new document and its new hashed
 * assets long before the swap is allowed to happen.
 *
 * The hold is the backlog alone, whether or not a new shell is waiting right now. Once
 * every tab closes the browser activates a waiting worker by itself, and after that
 * nothing is waiting any more — yet the job must stay on its shell. The worker records
 * the hold as a pin in Cache Storage (`public/sw.js`), which every worker generation
 * reads; the page only has to keep reporting the backlog.
 *
 * Backlog zero releases the pin: navigation goes back to network-first, which is how the
 * next build is served on the next launch.
 */
export function shouldHoldShell(backlog: number): boolean {
  return backlog > 0;
}

/**
 * Which build this page is running: the same-origin path of the hashed chunk this code
 * was loaded from. In a build that is one of the precached `/assets/*` files, so the
 * worker can pin the cache holding it — which may be newer than the worker itself, when
 * this launch's document came from the network. Undefined outside http(s) (tests).
 */
export function currentShellEntry(moduleUrl: string = import.meta.url): string | undefined {
  try {
    const url = new URL(moduleUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.pathname : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Tells the active worker whether to hold, and which build this page runs (`shell`,
 * omitted when unknown; an older worker ignores it). Returns what was sent, or null when
 * nobody heard.
 */
export function holdShell(
  registration: ServiceWorkerRegistration | null,
  backlog: number,
  shell: string | undefined = currentShellEntry(),
): boolean | null {
  const active = registration?.active;
  if (!active) return null;
  const hold = shouldHoldShell(backlog);
  active.postMessage(shell === undefined ? { type: 'hold-shell', hold } : { type: 'hold-shell', hold, shell });
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
