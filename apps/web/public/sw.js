/*
 * AD-8 / AR-7: the app-shell precache, and nothing else.
 *
 * What this worker deliberately does NOT do, because the web-only decision forbids it:
 * no web app manifest, no install prompt, no Background Sync API, no periodic sync, no
 * `navigator.storage.persist()`, and no caching of `/api/*` — the sync engine owns the
 * network and its own retry table.
 *
 * `install` never calls `skipWaiting()`. A new shell waits until the page tells it to
 * take over, and the page only says so on a launch where the outbox holds no pending or
 * sent row (`src/sw/register.ts`). A worker cannot read the user's Dexie database, so
 * the activation rule lives where the backlog is known.
 *
 * The two quoted tokens below are rewritten in `dist/sw.js` by the `shellPrecache()`
 * plugin in `vite.config.ts`, which knows the hashed filenames. While they are still
 * strings this is the dev copy, and the fallback list keeps the dev server usable.
 */

const PRECACHE = '__PRECACHE_MANIFEST__';
const SHELL_VERSION = '__SHELL_VERSION__';

/**
 * The built list, or the dev fallback when the build has not stamped one in: a stamped
 * `PRECACHE` is an array, and a stamped `SHELL_VERSION` is a hash that cannot begin with
 * the token's underscores.
 */
const SHELL_URLS = typeof PRECACHE === 'string' ? ['/', '/sprite.svg'] : PRECACHE;
const CACHE_NAME = `releng-shell-${SHELL_VERSION.startsWith('__') ? 'dev' : SHELL_VERSION}`;

/** Same-origin paths of the precache list, for the cache-first lookup. */
const SHELL_PATHS = new Set(SHELL_URLS);

/**
 * AD-8, set by the page: a new shell is installed and waiting, and the outbox still
 * holds work, so this shell must keep serving until the backlog drains.
 */
let holdShell = false;

/**
 * The one decision this worker makes about a request. Pure, so the rule can be read and
 * tested on its own (`src/sw/sw-plan.test.ts`).
 *
 * The `hold` branch is what keeps a job on one shell version. Navigation is network-first
 * — that is how a new build is ever discovered — but while a waiting shell is being held
 * back for a non-empty outbox, the network would happily serve the *new* `index.html` and
 * its new hashed assets over the old cached ones. The tab would then be running a shell
 * whose assets the active cache does not have, and the first moment it went offline it
 * would fall back to the old cached `/`: a version flip in the middle of a job. So while
 * the page says "hold", navigations come from this shell's cache, and the flip happens
 * once, on the launch that promotes the waiting worker.
 */
function shellPlan(input) {
  if (input.isApi) return 'passthrough';
  if (input.mode === 'navigate') return input.hold ? 'cache-first' : 'network-first';
  return input.isShellPath ? 'cache-first' : 'passthrough';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // A shell precache is all or nothing. A cached `/` whose hashed JS or CSS is
      // missing boots into an empty page offline, which is worse than no cache at all:
      // so one failed URL fails the install, the partial cache is thrown away, and the
      // previously installed worker (if any) keeps serving until the next attempt.
      const cache = await caches.open(CACHE_NAME);
      try {
        await Promise.all(SHELL_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
      } catch (error) {
        console.warn('shell precache failed; this worker will not install', error);
        await caches.delete(CACHE_NAME);
        throw error;
      }
      await dropOrphanShellCaches();
    })(),
  );
});

/**
 * A worker that installs while another waits replaces that waiting one, and the browser
 * discards it without ever running its `activate` — so its cache is orphaned. On a device
 * whose outbox never drains, one such cache accumulates per deploy.
 *
 * `activate` deletes every shell cache but its own, so the *oldest* surviving one is
 * always the active worker's: everything created before it was deleted when it took over,
 * and everything created after it is a discarded install. Keep that one and this one,
 * delete what is in between. `caches.keys()` answers in creation order.
 */
async function dropOrphanShellCaches() {
  const shells = (await caches.keys()).filter((name) => name.startsWith('releng-shell-'));
  const active = shells.find((name) => name !== CACHE_NAME);
  await Promise.all(
    shells.filter((name) => name !== CACHE_NAME && name !== active).map((name) => caches.delete(name)),
  );
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith('releng-shell-') && name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/*
 * The two things the page tells this worker, because only the page can read the user's
 * per-user Dexie database:
 *   - `activate-shell`, posted to the *waiting* worker when the backlog is zero (AD-8);
 *   - `hold-shell`, posted to the *active* worker whenever the backlog changes while a
 *     new shell is waiting, so this one keeps serving the version the job started on.
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'activate-shell') self.skipWaiting();
  else if (data.type === 'hold-shell') holdShell = data.hold === true;
});

async function fromCacheFirst(request, url) {
  // A navigation is answered by the cached document, whatever path it asked for: this is
  // a single-page app and `/` is the only document in the shell.
  const key = request.mode === 'navigate' ? '/' : url.pathname;
  const cached = await caches.match(key, { cacheName: CACHE_NAME });
  return cached ?? fetch(request);
}

async function fromNetworkFirst(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cached = await caches.match('/', { cacheName: CACHE_NAME });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const plan = shellPlan({
    // The sync engine, the uploader and the typed action calls reach the network
    // themselves and fail as they always did; the worker never stands between them.
    isApi: url.pathname === '/api' || url.pathname.startsWith('/api/'),
    mode: request.mode,
    isShellPath: SHELL_PATHS.has(url.pathname),
    hold: holdShell,
  });

  if (plan === 'passthrough') return;
  event.respondWith(plan === 'cache-first' ? fromCacheFirst(request, url) : fromNetworkFirst(request));
});
