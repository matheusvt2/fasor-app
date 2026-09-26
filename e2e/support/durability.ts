import { copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, type BrowserContext, type Page, type Route } from '@playwright/test';
import { SEED_PASSWORD } from './merged-fixtures.ts';

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
    data: { email, password: SEED_PASSWORD },
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
    // AD-8's storage reading, from a device with nothing left — 100 MB free, well under
    // the provisional 500 MB threshold.
    //
    // PLACEHOLDER: nothing in the app reads this yet. `storageHeadroom()` and the kernel's
    // `storageLow()` ship and are unit-tested, but no surface calls them, because AD-8
    // marks the 500 MB `[ASSUMPTION]` until the manual iPad check returns a real number
    // and the spine's banner priority has no eighth slot for a storage-low kind. The
    // scenario that will read it is the storage-low banner of Epic 6, once Matheus files
    // `test-artifacts/manual/ipad-YYYY-MM-DD.md`. Until then the refusal path — the
    // `QuotaExceededError` above and the toast it raises — is the whole of 1.8-E2E-003.
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

/**
 * The shell pin the worker keeps in Cache Storage (`public/sw.js`): the entry chunk of the
 * pinned build (or, from a page that did not name it, a cache name), or null when nothing
 * is held.
 */
export async function readShellPin(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const response = await caches.match('/__shell-hold', { cacheName: 'releng-hold' });
    if (response === undefined) return null;
    const body = (await response.json()) as { entry?: unknown; shell?: unknown };
    if (typeof body.entry === 'string') return body.entry;
    return typeof body.shell === 'string' ? body.shell : null;
  });
}

/** The `releng-shell-*` caches on this origin, in creation order. */
export async function shellCacheNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => (await caches.keys()).filter((name) => name.startsWith('releng-shell-')));
}

/** Whether the registration has a worker installed and waiting. */
export async function hasWaitingShell(page: Page): Promise<boolean> {
  return page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting != null);
}

/** Marks the document the "new build" serves, so a test can tell the two shells apart. */
export const NEXT_BUILD_MARKER = '<meta name="shell-build" content="next">';

/** The built worker `vite preview` serves; the test and the preview server share the disk. */
const BUILT_WORKER = fileURLToPath(new URL('../../apps/web/dist/sw.js', import.meta.url));
const BUILT_DOCUMENT = fileURLToPath(new URL('../../apps/web/dist/index.html', import.meta.url));

/**
 * Simulates a deploy without a second build: from now on the server hands out a `sw.js`
 * whose stamped `SHELL_VERSION` differs (a new cache name) and whose precache list names a
 * distinct entry chunk (`index-<hash>-next.js`, a copy of the current one), and a
 * document carrying `NEXT_BUILD_MARKER` that loads that entry. Returns the undo, which
 * the test must run.
 *
 * The worker script is rewritten on disk rather than routed: the browser's update check
 * for a worker's main script never reaches Playwright's routing (no request event, no
 * route), while `vite preview` serves `dist/` with a fresh stat on every request. The
 * document is routed on the context, which on Chromium also covers the requests the
 * worker makes itself (its precache and its network-first navigations).
 */
export async function serveNextBuild(context: BrowserContext): Promise<() => Promise<void>> {
  // A distinct entry chunk, as a real build has: a copy of the current one under a new
  // name, named by the next worker's precache list and by the next document.
  const entry = /src="(\/assets\/index-[^"]+\.js)"/.exec(await readFile(BUILT_DOCUMENT, 'utf8'))?.[1];
  if (entry === undefined) throw new Error(`${BUILT_DOCUMENT} references no entry chunk`);
  const nextEntry = entry.replace(/\.js$/, '-next.js');
  const nextEntryFile = fileURLToPath(new URL(`../../apps/web/dist${nextEntry}`, import.meta.url));
  await copyFile(fileURLToPath(new URL(`../../apps/web/dist${entry}`, import.meta.url)), nextEntryFile);

  const original = await readFile(BUILT_WORKER, 'utf8');
  const next = original
    .replace(/const SHELL_VERSION = "([0-9a-f]+)";/, (_match, version: string) => `const SHELL_VERSION = "${version}-next";`)
    .replaceAll(`"${entry}"`, `"${nextEntry}"`);
  if (!next.includes('-next";') || !next.includes(`"${nextEntry}"`)) {
    throw new Error(`${BUILT_WORKER} carries no stamped SHELL_VERSION or entry to change`);
  }
  await writeFile(BUILT_WORKER, next);
  const isDocument = (url: URL) => url.pathname === '/';
  const markDocument = async (route: Route) => {
    const response = await route.fetch();
    const body = (await response.text())
      .replace('<head>', `<head>${NEXT_BUILD_MARKER}`)
      .replaceAll(entry, nextEntry);
    await route.fulfill({ response, body });
  };
  await context.route(isDocument, markDocument);
  return async () => {
    await context.unroute(isDocument, markDocument);
    await writeFile(BUILT_WORKER, original);
    await rm(nextEntryFile, { force: true });
  };
}

/** The entry chunk the page is running, as the worker's pin names it. */
export async function runningEntry(page: Page): Promise<string> {
  return page.evaluate(() => {
    const src = document.querySelector('script[type="module"][src]')?.getAttribute('src');
    if (src == null) throw new Error('the document loads no module script');
    return new URL(src, location.href).pathname;
  });
}

/** Asks the browser to look for a new `sw.js` now and waits until one is installed and waiting. */
export async function installNextShell(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  });
  await expect.poll(() => hasWaitingShell(page), { timeout: 30_000 }).toBe(true);
}

/**
 * Stops every service worker the browser runs, as it does to an idle one whenever it
 * likes: the next event starts the script again in a fresh global scope. Chromium only.
 */
export async function stopServiceWorkers(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.stopAllWorkers');
  } finally {
    await cdp.detach();
  }
}

/**
 * Closes every tab of the context and opens a fresh, blank one. With no client left the
 * browser activates a waiting worker on its own, whatever the page said — Chromium does
 * it when the next navigation into the scope arrives (CDP shows the version still
 * `installed` while no tab is open), so follow this with a navigation and
 * `waitForSettledShell`.
 *
 * Returns only once CDP reports that no worker version controls a client any more: a
 * navigation that started while a closed tab was still counted would become the old
 * worker's client and hold the activation back. Chromium only.
 */
export async function closeEveryTab(context: BrowserContext): Promise<Page> {
  for (const open of context.pages()) await open.close();
  const fresh = await context.newPage();
  const cdp = await context.newCDPSession(fresh);
  const controlled = new Map<string, number>();
  cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
    for (const version of versions) controlled.set(version.versionId, version.controlledClients?.length ?? 0);
  });
  try {
    await cdp.send('ServiceWorker.enable');
    await expect
      .poll(() => controlled.size > 0 && [...controlled.values()].every((count) => count === 0), { timeout: 15_000 })
      .toBe(true);
  } finally {
    await cdp.detach();
  }
  return fresh;
}

/**
 * Waits until the worker lifecycle has settled: nothing installing or waiting, and an
 * activated worker. Proves a waiting worker was really taken over by the browser rather
 * than merely not reported.
 */
export async function waitForSettledShell(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return (
            registration !== undefined &&
            registration.installing === null &&
            registration.waiting === null &&
            registration.active?.state === 'activated'
          );
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
}
