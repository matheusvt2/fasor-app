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
    })(),
  );
});

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

// The page's activation gate: posted only when the outbox backlog is zero (AD-8).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'activate-shell') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The sync engine, the uploader and the typed action calls reach the network
  // themselves and fail as they always did; the worker never stands between them.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch (error) {
          const cached = await caches.match('/', { cacheName: CACHE_NAME });
          if (cached) return cached;
          throw error;
        }
      })(),
    );
    return;
  }

  if (!SHELL_PATHS.has(url.pathname)) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(url.pathname, { cacheName: CACHE_NAME });
      return cached ?? fetch(request);
    })(),
  );
});
