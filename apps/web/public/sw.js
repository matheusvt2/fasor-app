/*
 * AD-8 / AR-7: the app-shell precache, and nothing else.
 *
 * What this worker deliberately does NOT do, because the web-only decision forbids it:
 * no web app manifest, no install prompt, no Background Sync API, no periodic sync, no
 * `navigator.storage.persist()`, and no caching of `/api/*` — the sync engine owns the
 * network and its own retry table.
 *
 * The lifecycle, as it really is. AD-8: "the service worker activates a new shell on the
 * next launch only when the outbox is empty".
 *
 *   - `install` never calls `skipWaiting()`. A new shell waits, and the page promotes it
 *     (`activate-shell`) only on a launch where the outbox holds no pending or sent row
 *     (`src/sw/register.ts`). A worker cannot read the user's Dexie database, so the
 *     backlog is only ever known by the page.
 *   - That gate alone cannot keep the rule: once every tab is closed the browser
 *     activates a waiting worker by itself, whatever the page said, and the browser also
 *     stops an idle worker whenever it likes, taking every module variable with it. So
 *     the hold is a *pin* kept in Cache Storage: while the page reports a non-empty
 *     outbox (`hold-shell`, hold true) a sentinel names the shell cache the job started
 *     on. Every worker generation — the old one restarted with a fresh scope, or a new
 *     one the browser activated — reads that sentinel, keeps the pinned cache alive and
 *     answers navigations and shell assets from it.
 *   - When the page reports an empty outbox (hold false) the sentinel is deleted, the
 *     next navigation is network-first again, which is how the new build is served on
 *     the next launch, and the older shell caches are dropped then.
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
const SHELL_PREFIX = 'releng-shell-';
const CACHE_NAME = `${SHELL_PREFIX}${SHELL_VERSION.startsWith('__') ? 'dev' : SHELL_VERSION}`;

/** Same-origin paths of the precache list, for the cache-first lookup. */
const SHELL_PATHS = new Set(SHELL_URLS);

/**
 * The directories the build writes its hashed files into (`/assets/`). A tab running an
 * older, pinned shell asks for *that* shell's hashed files, which this worker's own list
 * does not name; they are still shell assets, and are looked up in the shell caches.
 */
const ASSET_DIRS = [
  ...new Set(
    SHELL_URLS.filter((url) => url.lastIndexOf('/') > 0).map((url) => url.slice(0, url.lastIndexOf('/') + 1)),
  ),
];

/**
 * The pin. Its own cache, whose name does not start with `releng-shell-`, so no shell
 * cache cleanup can ever take it. Body: `{"shell": "<cache name>"}`.
 */
const HOLD_CACHE = 'releng-hold';
const HOLD_KEY = '/__shell-hold';

/**
 * This worker's copy of the pin: a promise of the pinned cache name, or of null when
 * nothing is held. Only a cache of the sentinel — a fresh worker scope starts without it
 * and reads the sentinel on the first request that needs it.
 */
let pinned;

/** Pin writes and releases, one at a time, so a quick true-then-false lands in order. */
let holdWrites = Promise.resolve(null);

/**
 * The one decision this worker makes about a request. Pure, so the rule can be read and
 * tested on its own (`src/sw/sw-plan.test.ts`).
 *
 * The `hold` branch is what keeps a job on one shell version. Navigation is network-first
 * — that is how a new build is ever discovered — but while the outbox still holds work,
 * the network would happily serve the *new* `index.html` and its new hashed assets over
 * the old cached ones: a version flip in the middle of a job. So while a shell is pinned,
 * navigations come from the pinned cache, and the flip happens once, on the first launch
 * after the backlog drained.
 */
function shellPlan(input) {
  if (input.isApi) return 'passthrough';
  if (input.mode === 'navigate') return input.hold ? 'cache-first' : 'network-first';
  return input.isShellPath ? 'cache-first' : 'passthrough';
}

/**
 * The sentinel as it is on disk: whether one exists, and the cache it names (null when it
 * cannot be parsed). No judgement about whether that cache still exists.
 */
async function readSentinel() {
  const response = await caches.match(HOLD_KEY, { cacheName: HOLD_CACHE });
  if (!response) return { present: false, name: null };
  const body = await response.json().catch(() => null);
  return { present: true, name: body !== null && typeof body.shell === 'string' ? body.shell : null };
}

const isStale = async (sentinel) => sentinel.present && (sentinel.name === null || !(await caches.has(sentinel.name)));

/**
 * The pinned cache name, read from the sentinel, or null. A sentinel naming a cache that
 * no longer exists (or one that cannot be parsed) is stale: nothing is held, and it is
 * deleted — through the pin-write queue, and only if the sentinel on disk is still that
 * same stale one, so a fresh pin written in the meantime is never wiped. Throws when
 * Cache Storage itself fails; `readPin` is the forgiving form. Never called from inside
 * the queue, because it waits on the queue.
 */
async function readPinStrict() {
  const sentinel = await readSentinel();
  if (!sentinel.present) return null;
  if (!(await isStale(sentinel))) return sentinel.name;
  await queueHoldWrite(() => dropStalePin(sentinel.name));
  return null;
}

async function dropStalePin(name) {
  try {
    const now = await readSentinel();
    if (now.name === name && (await isStale(now))) await caches.delete(HOLD_CACHE);
  } catch (error) {
    console.warn('could not drop a stale shell hold', error);
  }
}

/** The pin, or null — and null, with a warning, when Cache Storage cannot answer. */
async function readPin() {
  try {
    return await readPinStrict();
  } catch (error) {
    console.warn('shell hold unreadable; serving as unheld', error);
    return null;
  }
}

/** The memoized pin for this worker's lifetime. A failed read is not memoized. */
function currentPin() {
  if (pinned === undefined) {
    const load = readPinStrict().catch((error) => {
      console.warn('shell hold unreadable; serving as unheld', error);
      if (pinned === load) pinned = undefined;
      return null;
    });
    pinned = load;
  }
  return pinned;
}

/** Runs one sentinel write after every earlier one. The queue itself never rejects. */
function queueHoldWrite(write) {
  const next = holdWrites.then(write);
  holdWrites = next.catch(() => null);
  return next;
}

/**
 * `hold: true`: pin this worker's shell unless a live pin already exists. The first one
 * wins, because it names the shell the job started on — a worker the browser activated
 * later must keep serving that one, not pin itself. A stale sentinel is overwritten.
 */
async function pinIfAbsent() {
  const existing = await readSentinel();
  if (existing.present && !(await isStale(existing))) return existing.name;
  const cache = await caches.open(HOLD_CACHE);
  await cache.put(
    HOLD_KEY,
    new Response(JSON.stringify({ shell: CACHE_NAME }), { headers: { 'content-type': 'application/json' } }),
  );
  return CACHE_NAME;
}

/** `hold: false`: the outbox is empty, the next launch may take the new shell. */
async function releasePin() {
  await caches.delete(HOLD_CACHE);
  return null;
}

/**
 * A failed write or release serves as unheld for now but is not memoized: the next
 * request re-reads the sentinel, so the memo never disagrees with the disk for long.
 */
function setHold(hold) {
  const write = queueHoldWrite(() => (hold ? pinIfAbsent() : releasePin()));
  const memo = write.catch((error) => {
    console.warn('could not record the shell hold; serving as unheld', error);
    if (pinned === memo) pinned = undefined;
    return null;
  });
  pinned = memo;
  return memo;
}

const shellCacheNames = async () => (await caches.keys()).filter((name) => name.startsWith(SHELL_PREFIX));

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
 * `activate` deletes every shell cache but its own and the pinned one, so the *oldest*
 * surviving cache that is neither pinned nor this one is the active worker's: everything
 * created before it was deleted when it took over (unless pinned), and everything created
 * after it is a discarded install. Keep the pin, that one and this one; delete the rest.
 * `caches.keys()` answers in creation order. When the pinned shell is also the active
 * one, the oldest other survivor is a discarded install and is kept by mistake — at most
 * one extra cache, gone at the next activation — which is the safe side of the error.
 */
async function dropOrphanShellCaches() {
  const pin = await readPin();
  const shells = await shellCacheNames();
  const active = shells.find((name) => name !== CACHE_NAME && name !== pin);
  await Promise.all(
    shells
      .filter((name) => name !== CACHE_NAME && name !== pin && name !== active)
      .map((name) => caches.delete(name)),
  );
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // The browser activates a waiting worker once no tab is left, pending work or not,
      // so this may be a new shell arriving mid-job: the pinned cache stays.
      // A failed read is not memoized: `currentPin` reads again on the next request.
      let pin = null;
      try {
        pin = await readPinStrict();
        pinned = Promise.resolve(pin);
      } catch (error) {
        console.warn('shell hold unreadable; serving as unheld', error);
      }
      const shells = await shellCacheNames();
      await Promise.all(shells.filter((name) => name !== CACHE_NAME && name !== pin).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

/*
 * The two things the page tells this worker, because only the page can read the user's
 * per-user Dexie database:
 *   - `activate-shell`, posted to the *waiting* worker when the backlog is zero (AD-8);
 *   - `hold-shell`, posted to the *active* worker on every backlog change: hold true
 *     while the outbox holds work, false once it is empty. Written to the sentinel inside
 *     `waitUntil`, so a worker stopped right after the message cannot lose it.
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'activate-shell') self.skipWaiting();
  else if (data.type === 'hold-shell') event.waitUntil(setHold(data.hold === true));
});

/**
 * `key` from the pinned shell, then this worker's, then any other shell cache still on
 * the device: hashed files are content-addressed, so any copy is the right copy, and an
 * open tab from an older shell keeps finding its assets for as long as they survive.
 */
async function fromShellCaches(key, pin) {
  const first = pin !== null && pin !== CACHE_NAME ? [pin, CACHE_NAME] : [CACHE_NAME];
  for (const cacheName of first) {
    const hit = await caches.match(key, { cacheName });
    if (hit) return hit;
  }
  for (const cacheName of (await shellCacheNames()).filter((name) => !first.includes(name))) {
    const hit = await caches.match(key, { cacheName });
    if (hit) return hit;
  }
  return undefined;
}

async function fromCacheFirst(request, url, pin) {
  // A navigation is answered by the cached document, whatever path it asked for: this is
  // a single-page app and `/` is the only document in the shell.
  const key = request.mode === 'navigate' ? '/' : url.pathname;
  let cached;
  try {
    cached = await fromShellCaches(key, pin);
  } catch (error) {
    console.warn('shell cache unreadable; asking the network', error);
  }
  return cached ?? fetch(request);
}

async function fromNetworkFirst(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cached = await fromShellCaches('/', null).catch(() => undefined);
    if (cached) return cached;
    throw error;
  }
}

/**
 * A navigation answered with nothing held: the job the older shells were kept for is
 * over, so every shell cache created before this worker's own goes, except a pin that
 * arrived since. Caches created *after* this one belong to a worker installing or
 * waiting right now, and are never touched here.
 */
async function dropStaleShellCaches() {
  try {
    const pin = await readPin();
    const shells = await shellCacheNames();
    const own = shells.indexOf(CACHE_NAME);
    if (own <= 0) return;
    await Promise.all(shells.slice(0, own).filter((name) => name !== pin).map((name) => caches.delete(name)));
  } catch (error) {
    console.warn('could not drop older shell caches', error);
  }
}

async function respond(event, request, url, input) {
  const pin = await currentPin();
  const plan = shellPlan({ ...input, hold: pin !== null });
  if (plan === 'cache-first') return fromCacheFirst(request, url, pin);
  event.waitUntil(dropStaleShellCaches());
  return fromNetworkFirst(request);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const input = {
    // The sync engine, the uploader and the typed action calls reach the network
    // themselves and fail as they always did; the worker never stands between them.
    isApi: url.pathname === '/api' || url.pathname.startsWith('/api/'),
    mode: request.mode,
    isShellPath: SHELL_PATHS.has(url.pathname) || ASSET_DIRS.some((dir) => url.pathname.startsWith(dir)),
  };

  // Whether a request is handled at all never depends on the hold (only *how* a
  // navigation is answered does), so it is decided before anything asynchronous.
  if (shellPlan({ ...input, hold: false }) === 'passthrough') return;
  event.respondWith(respond(event, request, url, input));
});
