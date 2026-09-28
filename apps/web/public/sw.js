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
 *     outbox (`hold-shell`, hold true) a sentinel records, for the user whose outbox it
 *     is, the build the page is running — the shell version stamped into its document,
 *     which the page sends — so the pin follows the shell the job started on, even when
 *     that is newer than the worker receiving the message (a first launch whose document
 *     came from the network). Every worker generation — the old one restarted with a
 *     fresh scope, or a new one the browser activated — reads that sentinel and, on every
 *     read, resolves it to the shell cache of that version (`releng-shell-<version>`,
 *     installing, waiting or active alike). That cache is never deleted, and navigations
 *     and shell assets are answered from it. While no cache holds the version yet,
 *     navigations stay network-first, where that build came from. A page that does not
 *     name its build pins the receiving worker's own cache.
 *   - The outbox is per user (`releng-{user_id}`), so the sentinel keeps one hold per
 *     user. When a page reports an empty outbox (hold false) only that user's hold goes;
 *     once no user holds, the sentinel is deleted, the next navigation is network-first
 *     again, which is how the new build is served on the next launch, and the older
 *     shell caches are dropped then. `activate-shell` is refused while another user
 *     holds, so one user's empty outbox never swaps the shell under another's backlog.
 *
 * The two quoted tokens below are rewritten in `dist/sw.js` by the `shellPrecache()`
 * plugin in `vite.config.ts`, which knows the hashed filenames and digests every emitted
 * file into the version (the same version it stamps into `index.html`). While they are
 * still strings this is the dev copy, and the fallback list keeps the dev server usable.
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
 * cache cleanup can ever take it. Body: `{"holds": [hold, ...]}`, one hold per user whose
 * outbox has work, in the order they were first written. A hold is `{"user", "version"}`,
 * the shell version the page runs (its cache is `releng-shell-<version>`), or, from a page
 * that does not say which build it runs, `{"user", "shell": "<cache name>"}`, the
 * receiving worker's own cache.
 *
 * Sentinels written before holds were per user are still read, as one hold of no user:
 * `{"entry": "/assets/index-<hash>.js"}` (resolved to the oldest shell cache holding that
 * chunk) or `{"shell": "<cache name>"}`. So are the messages of a page from before (no
 * `user`, an entry path in `shell`). A hold of no user was the whole device's pin, so the
 * next user who reports adopts it: their release drops it, and it never refuses their
 * `activate-shell`.
 */
const HOLD_CACHE = 'releng-hold';
const HOLD_KEY = '/__shell-hold';

const NO_SENTINEL = { present: false, corrupt: false, holds: [] };

/** A version as the build stamps it: a hex digest, or a test's suffixed one. Never a token. */
const VERSION_PATTERN = /^[0-9a-z][0-9a-z-]*$/i;

/**
 * This worker's copy of the sentinel: a promise of what is on disk. Only a cache of it —
 * a fresh worker scope starts without it and reads the sentinel on the first request
 * that needs it. The caches it pins are resolved from it on every read, not memoized,
 * because the cache of a build can appear later (its worker still installing when the
 * page reported it).
 */
let sentinelMemo;

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

const text = (body, key) => (body !== null && typeof body === 'object' && typeof body[key] === 'string' ? body[key] : null);

/** One hold as read from disk, or null when it names nothing. */
function holdOf(body, user) {
  const version = text(body, 'version');
  const hold = {
    user,
    version: version !== null && VERSION_PATTERN.test(version) ? version : null,
    entry: text(body, 'entry'),
    shell: text(body, 'shell'),
  };
  return hold.version === null && hold.entry === null && hold.shell === null ? null : hold;
}

/**
 * The sentinel as it is on disk. A body that cannot be parsed, or a hold that names
 * nothing, is `corrupt`: it pins nothing and is dropped as stale.
 */
async function readSentinel() {
  const response = await caches.match(HOLD_KEY, { cacheName: HOLD_CACHE });
  if (!response) return NO_SENTINEL;
  const body = await response.json().catch(() => null);
  if (body !== null && typeof body === 'object' && Array.isArray(body.holds)) {
    const holds = body.holds.map((item) => holdOf(item, text(item, 'user'))).filter((hold) => hold !== null);
    return { present: true, corrupt: holds.length !== body.holds.length, holds };
  }
  const legacy = holdOf(body === null ? null : { entry: text(body, 'entry'), shell: text(body, 'shell') }, null);
  return legacy === null ? { present: true, corrupt: true, holds: [] } : { present: true, corrupt: false, holds: [legacy] };
}

/**
 * A hold is stale when it can never pin anything again: one naming a cache that is gone.
 * A hold naming a build — its version, or a legacy entry chunk — is never stale (no cache
 * may hold that build *yet*) and waits for `hold: false` or for its cache to appear.
 */
const isStale = async (hold) => hold.version === null && hold.entry === null && !(await caches.has(hold.shell));

/** The oldest shell cache holding `entry` — installing, waiting or active alike — or null. */
async function cacheHolding(entry) {
  for (const cacheName of await shellCacheNames()) {
    if (await caches.match(entry, { cacheName })) return cacheName;
  }
  return null;
}

/** The cache one hold pins now, or null: a version's own cache, only once a worker made it. */
async function resolveHold(hold) {
  if (hold.version !== null) {
    const cacheName = `${SHELL_PREFIX}${hold.version}`;
    return (await caches.has(cacheName)) ? cacheName : null;
  }
  if (hold.entry !== null) return cacheHolding(hold.entry);
  return (await caches.has(hold.shell)) ? hold.shell : null;
}

/**
 * The pinned cache names, first-written hold first, or none when nothing is held — or
 * when no held build is in any cache yet, which leaves navigations network-first, where
 * that build came from. Stale holds are dropped through the pin-write queue, and only if
 * they are still stale on disk then, so a fresh pin written in the meantime is never
 * wiped. Throws when Cache Storage itself fails. Never called from inside the queue,
 * because it waits on the queue.
 */
async function resolvePins(sentinel) {
  if (!sentinel.present) return [];
  const pins = [];
  let stale = sentinel.corrupt;
  for (const hold of sentinel.holds) {
    if (await isStale(hold)) {
      stale = true;
      continue;
    }
    const cacheName = await resolveHold(hold);
    if (cacheName !== null && !pins.includes(cacheName)) pins.push(cacheName);
  }
  if (stale) await queueHoldWrite(dropStaleHolds);
  return pins;
}

async function dropStaleHolds() {
  try {
    const now = await readSentinel();
    const live = [];
    for (const hold of now.holds) if (!(await isStale(hold))) live.push(hold);
    if (!now.present || (!now.corrupt && live.length === now.holds.length)) return;
    await writeHolds(live);
    sentinelMemo = undefined;
  } catch (error) {
    console.warn('could not drop a stale shell hold', error);
  }
}

/** Writes the holds, or deletes the sentinel once none is left. Answers what is on disk. */
async function writeHolds(holds) {
  if (holds.length === 0) {
    await caches.delete(HOLD_CACHE);
    return NO_SENTINEL;
  }
  const body = {
    holds: holds.map((hold) => {
      const build =
        hold.version !== null ? { version: hold.version } : hold.entry !== null ? { entry: hold.entry } : { shell: hold.shell };
      return { user: hold.user, ...build };
    }),
  };
  const cache = await caches.open(HOLD_CACHE);
  await cache.put(HOLD_KEY, new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }));
  return { present: true, corrupt: false, holds };
}

/** Reads the sentinel afresh and resolves it. Throws when Cache Storage fails. */
async function readPinsStrict() {
  return resolvePins(await readSentinel());
}

/** The pins, or none — and none, with a warning, when Cache Storage cannot answer. */
async function readPins() {
  try {
    return await readPinsStrict();
  } catch (error) {
    console.warn('shell hold unreadable; serving as unheld', error);
    return [];
  }
}

/** The memoized sentinel for this worker's lifetime. A failed read is not memoized. */
function currentSentinel() {
  if (sentinelMemo === undefined) {
    const load = readSentinel().catch((error) => {
      if (sentinelMemo === load) sentinelMemo = undefined;
      throw error;
    });
    sentinelMemo = load;
  }
  return sentinelMemo;
}

/** The pins for a request: the memoized sentinel, resolved now. None, with a warning, on failure. */
async function currentPins() {
  try {
    return await resolvePins(await currentSentinel());
  } catch (error) {
    console.warn('shell hold unreadable; serving as unheld', error);
    return [];
  }
}

/** Runs one sentinel write after every earlier one. The queue itself never rejects. */
function queueHoldWrite(write) {
  const next = holdWrites.then(write);
  holdWrites = next.catch(() => null);
  return next;
}

/** Whether `hold` is this user's: their own, or one of no user, which the next reporter adopts. */
const heldBy = (hold, user) => hold.user === user || hold.user === null;

/**
 * `hold: true`: pin the build the user's page runs unless that user already has a live
 * hold. The first one wins, because it names the shell the job started on — a worker the
 * browser activated later must keep serving that one, not pin itself. A stale hold is
 * overwritten. A page that does not say which build it runs pins this worker's cache.
 * Other users' holds are left exactly as they are.
 */
async function pinIfAbsent(user, build) {
  const now = await readSentinel();
  const holds = [...now.holds];
  let index = holds.findIndex((hold) => hold.user === user);
  if (index < 0) index = holds.findIndex((hold) => heldBy(hold, user));
  const existing = index < 0 ? null : holds[index];
  if (existing !== null && !(await isStale(existing))) {
    // A hold on a build no cache holds (its build was deleted under a tab that kept
    // running it, or has not been precached yet) gives way to a hold that does resolve:
    // the page's build when a cache holds it, or — from a page that does not name its
    // build — this worker's own cache. A hold naming a build no cache holds either keeps
    // the existing pin: that build may still be installing.
    const namesBuild = existing.version !== null || existing.entry !== null;
    const keep =
      !namesBuild ||
      (await resolveHold(existing)) !== null ||
      (build !== null && (await resolveHold(build)) === null);
    if (keep) {
      if (existing.user === user && !now.corrupt) return now;
      holds[index] = { ...existing, user };
      return writeHolds(holds);
    }
  }
  const next = { user, ...(build ?? { version: null, entry: null, shell: CACHE_NAME }) };
  if (index < 0) holds.push(next);
  else holds[index] = next;
  return writeHolds(holds);
}

/** `hold: false`: this user's outbox is empty. Only their hold goes; other users' stay. */
async function releasePin(user) {
  const now = await readSentinel();
  if (!now.present) return NO_SENTINEL;
  return writeHolds(now.holds.filter((hold) => !heldBy(hold, user)));
}

/**
 * A failed write or release serves as unheld for now but is not memoized: the next
 * request re-reads the sentinel, so the memo never disagrees with the disk for long.
 */
function setHold(hold, user, build) {
  const write = queueHoldWrite(() => (hold ? pinIfAbsent(user, build) : releasePin(user)));
  const memo = write.catch((error) => {
    console.warn('could not record the shell hold; serving as unheld', error);
    if (sentinelMemo === memo) sentinelMemo = undefined;
    return NO_SENTINEL;
  });
  sentinelMemo = memo;
  return memo;
}

/**
 * `activate-shell`: the page saw its user's outbox empty. Refused while another user's
 * outbox still holds this device's shell, whose job must stay on it (AD-8). A sentinel
 * that cannot be read is served as unheld, as every other read of it is.
 */
async function activateUnlessHeld(user) {
  let others = [];
  try {
    for (const hold of (await readSentinel()).holds) {
      if (!heldBy(hold, user) && !(await isStale(hold))) others.push(hold);
    }
  } catch (error) {
    console.warn('shell hold unreadable; serving as unheld', error);
    others = [];
  }
  if (others.length === 0) await self.skipWaiting();
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
 * `activate` deletes every shell cache but its own and the pinned ones, so the *oldest*
 * surviving cache that is neither pinned nor this one is the active worker's: everything
 * created before it was deleted when it took over (unless pinned), and everything created
 * after it is a discarded install. Keep the pins, that one and this one; delete the rest.
 * `caches.keys()` answers in creation order. When the pinned shell is also the active
 * one, the oldest other survivor is a discarded install and is kept by mistake — at most
 * one extra cache, gone at the next activation — which is the safe side of the error.
 */
async function dropOrphanShellCaches() {
  const pins = await readPins();
  const shells = await shellCacheNames();
  const active = shells.find((name) => name !== CACHE_NAME && !pins.includes(name));
  await Promise.all(
    shells
      .filter((name) => name !== CACHE_NAME && !pins.includes(name) && name !== active)
      .map((name) => caches.delete(name)),
  );
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // The browser activates a waiting worker once no tab is left, pending work or not,
      // so this may be a new shell arriving mid-job: the pinned caches stay. Nothing is
      // memoized here; `currentPins` reads the sentinel on the next request.
      let pins = [];
      try {
        pins = await readPinsStrict();
      } catch (error) {
        console.warn('shell hold unreadable; serving as unheld', error);
      }
      const shells = await shellCacheNames();
      await Promise.all(
        shells.filter((name) => name !== CACHE_NAME && !pins.includes(name)).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/*
 * The two things the page tells this worker, because only the page can read the user's
 * per-user Dexie database. Both carry `user`, the signed-in user whose outbox it is
 * (absent from older pages):
 *   - `activate-shell`, posted to the *waiting* worker when that user's backlog is zero
 *     (AD-8), and refused while another user holds;
 *   - `hold-shell`, posted to the *active* worker on every backlog change: hold true
 *     while the outbox holds work, false once it is empty, and `version`, the shell
 *     version stamped into the page's document (absent when it has none; older pages
 *     sent `shell`, the path of the hashed chunk they run). Written to the sentinel
 *     inside `waitUntil`, so a worker stopped right after the message cannot lose it.
 */
function messageBuild(data) {
  if (typeof data.version === 'string' && VERSION_PATTERN.test(data.version)) {
    return { version: data.version, entry: null, shell: null };
  }
  if (typeof data.shell === 'string' && data.shell.startsWith('/')) return { version: null, entry: data.shell, shell: null };
  return null;
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;
  const user = typeof data.user === 'string' && data.user !== '' ? data.user : null;
  if (data.type === 'activate-shell') event.waitUntil(activateUnlessHeld(user));
  else if (data.type === 'hold-shell') {
    event.waitUntil(setHold(data.hold === true, user, messageBuild(data)));
  }
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
  // A navigation is answered by the pinned shell's document, whatever path it asked for:
  // this is a single-page app and `/` is the only document in the shell. Only the pinned
  // shell's: a pinned cache still being filled has no `/` yet, and another shell's
  // document would be a different build, so the network (where the page's build came
  // from) answers instead.
  if (request.mode === 'navigate') {
    let cached;
    try {
      cached = await caches.match('/', { cacheName: pin });
    } catch (error) {
      console.warn('shell cache unreadable; asking the network', error);
    }
    return cached ?? fromNetworkFirst(request);
  }
  let cached;
  try {
    cached = await fromShellCaches(url.pathname, pin);
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
    const pins = await readPins();
    const shells = await shellCacheNames();
    const own = shells.indexOf(CACHE_NAME);
    if (own <= 0) return;
    await Promise.all(shells.slice(0, own).filter((name) => !pins.includes(name)).map((name) => caches.delete(name)));
  } catch (error) {
    console.warn('could not drop older shell caches', error);
  }
}

async function respond(event, request, url, input) {
  // With several users holding, the first-written hold that resolves answers navigations.
  const pin = (await currentPins())[0] ?? null;
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
