import { expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_SEED } from './merged-fixtures.ts';

/**
 * Helpers for the three FR-54 scenarios (NFR-17). They run against the built bundle on
 * the preview server, so everything here talks to a real service worker, a real Dexie
 * store and the real `drafts` table.
 */

/**
 * The dev-only field fixture. `idle` overrides the 500 ms field-commit timer: a draft is
 * text that has *not* been committed, and a test that had to hide the tab inside 500 ms
 * would be a race, not a check.
 */
export const fixturePath = (idleMs = 60_000) => `/__fixture/field?idle=${idleMs}`;

/** Matches the API routes only; the dev server's own module paths must keep loading. */
export const isApiRequest = (url: URL) => url.pathname.startsWith('/api/');

/** `releng.last-session`, the pointer that tells a cold open which database to open. */
const LAST_SESSION_KEY = 'releng.last-session';

/**
 * Signs in for the durability projects and leaves the tab on Home, with a live session
 * cookie, a database and the local pointer the app itself wrote.
 *
 * It does not use the Login form, and the reason is the harness, not the product. The
 * session cookie is `Secure` (AD-9, Story 1.3) and the preview server here is plain
 * http on localhost: Chromium stores such a cookie on localhost, WebKit refuses it, so
 * the form path cannot hold a session on the WebKit project at all. On the HTTPS origin
 * of Story 1.7 — the one the manual iPad script uses, and the one a real device sees —
 * the form works everywhere. So the session is established through the same
 * `/api/auth/*` route the form calls and re-added to the browser without the `Secure`
 * attribute, which changes nothing the server sees. Story 1.3's own form test
 * (`1.3-E2E-001`) still drives the real form on desktop Chrome.
 */
export async function signInForDurability(
  page: Page,
  context: BrowserContext,
  email: string,
): Promise<void> {
  // A same-origin document first, so the cookie and the pointer have somewhere to land.
  await goToNeutralDocument(page);
  const baseURL = new URL(page.url()).origin;
  const signIn = await page.request.post('/api/auth/sign-in/email', {
    data: { email, password: TEST_SEED.password },
  });
  expect(signIn.ok(), `sign-in answered ${signIn.status()}`).toBe(true);
  const header = (await signIn.headersArray()).find((entry) => entry.name.toLowerCase() === 'set-cookie');
  expect(header, 'sign-in set no cookie').toBeDefined();
  const pair = header!.value.split(';')[0]!;
  const split = pair.indexOf('=');
  await context.addCookies([
    {
      name: pair.slice(0, split),
      value: pair.slice(split + 1),
      url: baseURL,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  // This browser has never held this user's database, so the first load is AD-8's
  // "session cookie present, database absent" and the app correctly shows the one-time
  // recovery screen. Press through it the way a user would; the app writes the
  // `releng.last-session` pointer on that same load, which is what lets the later
  // offline scenarios reach Home with no network.
  await page.goto('/');
  const recovery = page.getByRole('button', { name: 'Baixar do servidor' });
  const home = page.getByRole('group', { name: 'Relatórios por status' });
  await expect(recovery.or(home).first()).toBeVisible({ timeout: 30_000 });
  if (await recovery.isVisible()) await recovery.click();
  await expect(home).toBeVisible({ timeout: 30_000 });
}

/** Waits until the app-shell worker controls the page and the shell is in its cache. */
export async function waitForShellCache(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    // `claim()` runs on activate, but the load that registered the worker is not
    // controlled until it takes over, which is a later turn of the event loop.
    for (let attempt = 0; attempt < 100 && navigator.serviceWorker.controller === null; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    for (let attempt = 0; attempt < 100; attempt++) {
      const names = (await caches.keys()).filter((name) => name.startsWith('releng-shell-'));
      if (names.length > 0) {
        const cache = await caches.open(names[0]!);
        const urls = (await cache.keys()).map((request) => new URL(request.url).pathname);
        if (urls.includes('/')) return urls.sort();
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('the app shell never reached the cache');
  });
}

/**
 * Keeps this scenario's context free of a service worker.
 *
 * Playwright only intercepts requests that pass through a service worker on Chromium, so
 * on WebKit a controlled page silently ignores `page.route` and a scenario that thinks it
 * cut the network would be running with the network up. The two scenarios that use this
 * are about the outbox and the network, not about the shell; the shell has its own.
 */
export async function withoutServiceWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (navigator.serviceWorker === undefined) return;
    navigator.serviceWorker.register = () => Promise.reject(new Error('no shell worker in this scenario'));
  });
}

/** The tab going away: `visibilitychange` with the document hidden, as iPadOS fires it. */
export async function hideTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // The persist is one Dexie write per source; give it a turn before the tab closes.
  await page.waitForTimeout(300);
}

/**
 * Makes every `outbox` write fail the way a full device does, and reports a low
 * `storage.estimate`. Installed before any script runs; armed later through
 * `setWritesRefused` so sign-in still works.
 */
export async function installRefusedWrites(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const flags = window as unknown as { __refuseWrites?: boolean };
    flags.__refuseWrites = false;
    const realPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function put(this: IDBObjectStore, ...args: Parameters<typeof realPut>) {
      if (flags.__refuseWrites === true && this.name === 'outbox') {
        throw new DOMException('the quota for this origin is exhausted', 'QuotaExceededError');
      }
      return realPut.apply(this, args) as IDBRequest<IDBValidKey>;
    };
    // AD-8's storage reading, from a device with nothing left.
    if (navigator.storage !== undefined) {
      navigator.storage.estimate = async () => ({ usage: 1_900_000_000, quota: 2_000_000_000 });
    }
  });
}

export async function setWritesRefused(page: Page, refused: boolean): Promise<void> {
  await page.evaluate((value) => {
    (window as unknown as { __refuseWrites?: boolean }).__refuseWrites = value;
  }, refused);
}

/**
 * Replaces `navigator.serviceWorker.ready` with a registration that has a worker waiting
 * and records what the page posts to it.
 *
 * AD-8's activation rule is a decision the *page* makes over the user's outbox, not
 * something the worker lifecycle does by itself, so this is where it can be observed:
 * the app runs the real `promoteWaitingShell` against the real `outboxBacklog` of the
 * real database, and the recorded messages say what it decided.
 */
export async function installWaitingShell(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const recorder = window as unknown as { __shellMessages?: unknown[]; __shellGateRuns?: number };
    recorder.__shellMessages = [];
    // Reading `ready` is the gate starting: it is the first thing `useShellUpdate` does,
    // so it is the positive signal that the check ran at all. Without it, "no message was
    // posted" would also pass for a gate that never ran, or was deleted.
    recorder.__shellGateRuns = 0;
    const waiting = {
      postMessage: (data: unknown) => {
        recorder.__shellMessages!.push(data);
      },
    };
    Object.defineProperty(navigator.serviceWorker, 'ready', {
      configurable: true,
      get: () => {
        recorder.__shellGateRuns! += 1;
        return Promise.resolve({ waiting } as unknown as ServiceWorkerRegistration);
      },
    });
  });
}

export async function shellMessages(page: Page): Promise<unknown[]> {
  return page.evaluate(() => (window as unknown as { __shellMessages?: unknown[] }).__shellMessages ?? []);
}

/** How many times the page has asked for the registration, i.e. run the activation gate. */
export async function shellGateRuns(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __shellGateRuns?: number }).__shellGateRuns ?? 0);
}

/**
 * A same-origin document that is not the app: `/api/health` is public and is the one
 * path the service worker is required to leave alone. Storage can be emptied from here
 * with no Dexie connection open and nothing to re-create the database behind the test.
 */
export async function goToNeutralDocument(page: Page): Promise<void> {
  await page.goto('/api/health');
}

/** Deletes this user's device database, as an origin eviction does. */
export async function deleteDeviceDatabase(page: Page, database: string): Promise<void> {
  await page.evaluate(async (name) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      // Dexie closes its connection on `versionchange`, so this resolves; the timeout is
      // only here so a browser that does not would fail loudly instead of hanging.
      request.onblocked = () => setTimeout(() => reject(new Error('delete blocked')), 5_000);
    });
  }, database);
}

/** The `releng.last-session` pointer, which an eviction takes with the database. */
export async function clearSessionPointer(page: Page): Promise<void> {
  await page.evaluate((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* no site data on this origin */
    }
  }, LAST_SESSION_KEY);
}

/** Asserts the page raised no uncaught error while `run` was executing. */
export async function withoutPageErrors(page: Page, run: () => Promise<void>): Promise<void> {
  const errors: string[] = [];
  const listener = (error: Error) => errors.push(`${error.name}: ${error.message}`);
  page.on('pageerror', listener);
  try {
    await run();
  } finally {
    page.off('pageerror', listener);
  }
  expect(errors, `the page raised ${errors.join(', ')}`).toEqual([]);
}
