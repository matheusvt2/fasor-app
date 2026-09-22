// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

/*
 * AD-8's hold across worker lifetimes: "a new shell activates only on the next launch
 * when the outbox is empty" (Story 1.8, retro A3, QA D-1).
 *
 * A browser stops an idle worker whenever it likes, and once every tab is closed it
 * activates a waiting worker by itself. Neither can be forced reliably in a unit test
 * with a real browser, but both are only a matter of *which global scope* runs next. So
 * the real `public/sw.js` is stamped the way `shellPrecache()` stamps it and loaded into
 * a fresh `vm` context per worker generation, over one shared in-memory Cache Storage:
 *
 *   - a restart is a new context with the same version and no install, no activate and
 *     no message;
 *   - a browser-driven activation is a new context with a new version that installs and
 *     activates while the old one's job is still pinned.
 */

const ORIGIN = 'https://app.test';
const source = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');

const pathOf = (key: string | { url: string }): string =>
  new URL(typeof key === 'string' ? key : key.url, ORIGIN).pathname;

class FakeRequest {
  readonly url: string;
  readonly mode: string;
  readonly method: string;
  readonly cache: string | undefined;
  constructor(url: string, init: { mode?: string; method?: string; cache?: string } = {}) {
    this.url = new URL(url, ORIGIN).href;
    this.mode = init.mode ?? 'cors';
    this.method = init.method ?? 'GET';
    this.cache = init.cache;
  }
}

/** The server: whatever build is deployed right now, and whether the device has signal. */
class Network {
  online = true;
  files = new Map<string, string>();
  readonly asked: string[] = [];

  deploy(files: Record<string, string>): void {
    this.files = new Map(Object.entries(files));
  }

  async fetch(request: FakeRequest | string): Promise<Response> {
    const path = pathOf(request);
    this.asked.push(path);
    if (!this.online) throw new TypeError('Failed to fetch');
    const body = this.files.get(path);
    return body === undefined ? new Response('not found', { status: 404 }) : new Response(body, { status: 200 });
  }
}

class FakeCache {
  readonly entries = new Map<string, Response>();
  constructor(private readonly network: Network) {}

  async match(key: string | { url: string }): Promise<Response | undefined> {
    return this.entries.get(pathOf(key))?.clone();
  }

  async put(key: string | { url: string }, response: Response): Promise<void> {
    this.entries.set(pathOf(key), response.clone());
  }

  async add(request: FakeRequest): Promise<void> {
    const response = await this.network.fetch(request);
    if (!response.ok) throw new TypeError(`precache of ${pathOf(request)} answered ${response.status}`);
    await this.put(request, response);
  }
}

/** Cache Storage, shared by every worker generation. `keys()` answers in creation order. */
class FakeCacheStorage {
  readonly store = new Map<string, FakeCache>();
  broken = false;
  constructor(private readonly network: Network) {}

  private check(): void {
    if (this.broken) throw new DOMException('the cache storage is unavailable', 'UnknownError');
  }

  async open(name: string): Promise<FakeCache> {
    this.check();
    let cache = this.store.get(name);
    if (cache === undefined) {
      cache = new FakeCache(this.network);
      this.store.set(name, cache);
    }
    return cache;
  }

  /** Runs once, right after the next `has()` has read its answer: an interleaving point. */
  afterNextHas: (() => Promise<void>) | null = null;

  async has(name: string): Promise<boolean> {
    this.check();
    const answer = this.store.has(name);
    const hook = this.afterNextHas;
    this.afterNextHas = null;
    if (hook !== null) await hook();
    return answer;
  }

  async delete(name: string): Promise<boolean> {
    this.check();
    return this.store.delete(name);
  }

  async keys(): Promise<string[]> {
    this.check();
    return [...this.store.keys()];
  }

  async match(key: string | { url: string }, options: { cacheName?: string } = {}): Promise<Response | undefined> {
    this.check();
    if (options.cacheName !== undefined) return this.store.get(options.cacheName)?.match(key);
    for (const cache of this.store.values()) {
      const hit = await cache.match(key);
      if (hit) return hit;
    }
    return undefined;
  }

  /** The sentinel, as the next worker would read it. */
  async pin(): Promise<unknown> {
    const response = await this.store.get(HOLD_CACHE)?.match(HOLD_KEY);
    return response === undefined ? null : response.json();
  }

  async writePin(shell: string): Promise<void> {
    const cache = await this.open(HOLD_CACHE);
    await cache.put(HOLD_KEY, new Response(JSON.stringify({ shell })));
  }
}

const HOLD_CACHE = 'releng-hold';
const HOLD_KEY = '/__shell-hold';

type Handler = (event: unknown) => void;

interface Extendable {
  waitUntil: (promise: Promise<unknown>) => void;
}

/** Runs one extendable event and waits for everything it extended itself with. */
async function settle(extra: Promise<unknown>[]): Promise<void> {
  let seen = 0;
  while (seen < extra.length) {
    const batch = extra.slice(seen);
    seen = extra.length;
    await Promise.allSettled(batch);
  }
  // Surface a rejected waitUntil as a failure, the way a browser fails the event.
  await Promise.all(extra);
}

interface Build {
  version: string;
  precache: string[];
  files: Record<string, string>;
}

/** One worker global scope: a fresh module evaluation of the real `public/sw.js`. */
function startWorker(caches: FakeCacheStorage, network: Network, build: Build) {
  const handlers = new Map<string, Handler>();
  const warnings: unknown[][] = [];
  const calls = { skipWaiting: 0, claim: 0 };
  const self = {
    location: new URL('/sw.js', ORIGIN),
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: async () => {
      calls.skipWaiting += 1;
    },
    clients: {
      claim: async () => {
        calls.claim += 1;
      },
    },
  };
  const stamped = source
    .replace("'__PRECACHE_MANIFEST__'", JSON.stringify(build.precache))
    .replace("'__SHELL_VERSION__'", JSON.stringify(build.version));
  expect(stamped).not.toContain('__SHELL_VERSION__');
  const context = vm.createContext({
    self,
    caches,
    fetch: (request: FakeRequest) => network.fetch(request),
    Request: FakeRequest,
    Response,
    URL,
    DOMException,
    console: { warn: (...args: unknown[]) => warnings.push(args), log: () => {}, error: () => {} },
  });
  vm.runInContext(stamped, context);

  async function extendable(type: string, fields: Record<string, unknown> = {}): Promise<void> {
    const extra: Promise<unknown>[] = [];
    const event: Extendable & Record<string, unknown> = { ...fields, waitUntil: (p) => void extra.push(p) };
    handlers.get(type)?.(event);
    await settle(extra);
  }

  return {
    cacheName: `releng-shell-${build.version}`,
    warnings,
    calls,
    install: () => extendable('install'),
    activate: () => extendable('activate'),
    message: (data: unknown) => extendable('message', { data }),
    /** The response body the worker answered with, or 'passthrough' when it did not answer. */
    async request(path: string, mode = 'no-cors'): Promise<string> {
      const extra: Promise<unknown>[] = [];
      let answer = null as Promise<Response> | null;
      const event = {
        request: new FakeRequest(path, { mode }),
        respondWith: (response: Promise<Response>) => {
          answer = response;
          extra.push(response);
        },
        waitUntil: (p: Promise<unknown>) => void extra.push(p),
      };
      handlers.get('fetch')?.(event);
      if (answer === null) return 'passthrough';
      const response: Response = await answer;
      await settle(extra);
      return response.text();
    },
    navigate(path = '/') {
      return this.request(path, 'navigate');
    },
  };
}

type Worker = ReturnType<typeof startWorker>;

const BUILD_A: Build = {
  version: 'aaaaaaaaaaaa',
  precache: ['/', '/assets/index-a.js', '/sprite.svg'],
  files: { '/': 'document A', '/assets/index-a.js': 'script A', '/sprite.svg': 'sprite A' },
};

const BUILD_B: Build = {
  version: 'bbbbbbbbbbbb',
  precache: ['/', '/assets/index-b.js', '/sprite.svg'],
  files: { '/': 'document B', '/assets/index-b.js': 'script B', '/sprite.svg': 'sprite B' },
};

const BUILD_C: Build = {
  version: 'cccccccccccc',
  precache: ['/', '/assets/index-c.js', '/sprite.svg'],
  files: { '/': 'document C', '/assets/index-c.js': 'script C', '/sprite.svg': 'sprite C' },
};

const A = `releng-shell-${BUILD_A.version}`;
const B = `releng-shell-${BUILD_B.version}`;
const C = `releng-shell-${BUILD_C.version}`;

let network: Network;
let caches: FakeCacheStorage;

beforeEach(() => {
  network = new Network();
  caches = new FakeCacheStorage(network);
});

/** A build deployed and its worker installed and activated, as on a first visit. */
async function firstVisit(build: Build): Promise<Worker> {
  network.deploy(build.files);
  const worker = startWorker(caches, network, build);
  await worker.install();
  await worker.activate();
  return worker;
}

/** A new build deployed, and its worker installed and waiting. */
async function deployAndInstall(build: Build): Promise<Worker> {
  network.deploy(build.files);
  const worker = startWorker(caches, network, build);
  await worker.install();
  return worker;
}

const shellCaches = async () => (await caches.keys()).filter((name) => name.startsWith('releng-shell-'));

describe('no new build, work pending', () => {
  it('pins its own cache and answers navigations from it', async () => {
    const worker = await firstVisit(BUILD_A);
    await worker.message({ type: 'hold-shell', hold: true });
    expect(await caches.pin()).toEqual({ shell: A });

    // Same bytes as PR #8: while held, the cached document, never the network's.
    network.deploy({ ...BUILD_A.files, '/': 'document A, re-served by the server' });
    expect(await worker.navigate()).toBe('document A');
    expect(await worker.request('/assets/index-a.js')).toBe('script A');
  });

  it('answers navigations network-first when nothing is pending', async () => {
    const worker = await firstVisit(BUILD_A);
    await worker.message({ type: 'hold-shell', hold: false });
    network.deploy({ ...BUILD_A.files, '/': 'document A, from the network' });
    expect(await worker.navigate()).toBe('document A, from the network');
  });

  it('falls back to the cached document offline', async () => {
    const worker = await firstVisit(BUILD_A);
    network.online = false;
    expect(await worker.navigate('/sync')).toBe('document A');
  });

  it('never answers /api, held or not', async () => {
    const worker = await firstVisit(BUILD_A);
    await worker.message({ type: 'hold-shell', hold: true });
    expect(await worker.request('/api/sync/ops', 'cors')).toBe('passthrough');
    expect(await worker.navigate('/api/health')).toBe('passthrough');
    expect(await worker.request('/elsewhere.txt', 'no-cors')).toBe('passthrough');
  });
});

describe('a restarted worker, held', () => {
  it('derives the hold from the sentinel alone, with no message in its fresh scope', async () => {
    const first = await firstVisit(BUILD_A);
    await first.message({ type: 'hold-shell', hold: true });

    // A new build reaches the server; the browser stops the idle worker and starts it
    // again for the next navigation: same script, fresh global scope, no message.
    const next = await deployAndInstall(BUILD_B);
    const restarted = startWorker(caches, network, BUILD_A);
    expect(await restarted.navigate()).toBe('document A');
    expect(await restarted.request('/assets/index-a.js')).toBe('script A');
    expect(next.calls.skipWaiting).toBe(0);
  });

  it('is what fails without the pin: the same restart serves the new document', async () => {
    await firstVisit(BUILD_A);
    await deployAndInstall(BUILD_B);
    const restarted = startWorker(caches, network, BUILD_A);
    expect(await restarted.navigate()).toBe('document B');
  });
});

describe('the browser activates the new worker while the job is pinned', () => {
  async function browserActivated(): Promise<Worker> {
    const first = await firstVisit(BUILD_A);
    await first.message({ type: 'hold-shell', hold: true });
    const next = await deployAndInstall(BUILD_B);
    // Every tab closed: the browser activates the waiting worker, pending work or not.
    await next.activate();
    return next;
  }

  it('keeps the pinned cache and serves the old document and its assets from it', async () => {
    const next = await browserActivated();
    expect(await shellCaches()).toEqual([A, B]);
    expect(await next.navigate()).toBe('document A');
    // The old document asks for the old hashed files, which the new list does not name.
    expect(await next.request('/assets/index-a.js')).toBe('script A');
    expect(await next.request('/sprite.svg')).toBe('sprite A');
    expect(await caches.pin()).toEqual({ shell: A });
  });

  it('goes to the network for an asset the pinned shell does not have', async () => {
    const next = await browserActivated();
    network.deploy({ ...BUILD_B.files, '/assets/late.js': 'late script' });
    expect(await next.request('/assets/late.js')).toBe('late script');
  });

  it('survives its own restart, and a hold from the old page keeps the first pin', async () => {
    const next = await browserActivated();
    await next.message({ type: 'hold-shell', hold: true });
    expect(await caches.pin()).toEqual({ shell: A });

    const restarted = startWorker(caches, network, BUILD_B);
    expect(await restarted.navigate()).toBe('document A');
  });

  it('deletes every other shell cache on activate, but never the pinned one', async () => {
    await caches.open('releng-shell-older');
    const first = await firstVisit(BUILD_A);
    await caches.open('releng-shell-older-still');
    await first.message({ type: 'hold-shell', hold: true });
    const next = await deployAndInstall(BUILD_B);
    await next.activate();
    expect(await shellCaches()).toEqual([A, B]);
    expect(await caches.has(HOLD_CACHE)).toBe(true);
  });
});

describe('the backlog drains', () => {
  it('releases the pin: network-first, the new shell next, and the older caches dropped', async () => {
    const first = await firstVisit(BUILD_A);
    await first.message({ type: 'hold-shell', hold: true });
    const next = await deployAndInstall(BUILD_B);
    await next.activate();

    await next.message({ type: 'hold-shell', hold: false });
    expect(await caches.pin()).toBeNull();
    expect(await caches.has(HOLD_CACHE)).toBe(false);

    // The next launch: a fresh scope of the now-active worker.
    const launch = startWorker(caches, network, BUILD_B);
    expect(await launch.navigate()).toBe('document B');
    expect(await shellCaches()).toEqual([B]);
  });

  it('still answers an old tab from a surviving older cache before the cleanup runs', async () => {
    const first = await firstVisit(BUILD_A);
    await first.message({ type: 'hold-shell', hold: true });
    const next = await deployAndInstall(BUILD_B);
    await next.activate();
    await next.message({ type: 'hold-shell', hold: false });

    // The open tab still runs document A; the server no longer has script A.
    expect(await next.request('/assets/index-a.js')).toBe('script A');
  });

  it('lands true-then-false in order', async () => {
    const worker = await firstVisit(BUILD_A);
    await Promise.all([
      worker.message({ type: 'hold-shell', hold: true }),
      worker.message({ type: 'hold-shell', hold: false }),
    ]);
    expect(await caches.pin()).toBeNull();
    network.deploy(BUILD_B.files);
    expect(await worker.navigate()).toBe('document B');
  });

  it('never drops the cache of a worker that is installing or waiting', async () => {
    const worker = await firstVisit(BUILD_A);
    await deployAndInstall(BUILD_B);
    await worker.navigate();
    expect(await shellCaches()).toEqual([A, B]);
  });

  it('keeps the page-driven promotion: activate-shell is the only skipWaiting', async () => {
    const first = await firstVisit(BUILD_A);
    const next = await deployAndInstall(BUILD_B);
    await first.message({ type: 'hold-shell', hold: false });
    expect(next.calls.skipWaiting).toBe(0);
    await next.message({ type: 'activate-shell' });
    expect(next.calls.skipWaiting).toBe(1);
    await next.activate();
    expect(await shellCaches()).toEqual([B]);
  });
});

describe('a stale or unreadable pin', () => {
  it('treats a pin naming a cache that is gone as no hold, and deletes it', async () => {
    await firstVisit(BUILD_A);
    await caches.writePin('releng-shell-gone');
    const restarted = startWorker(caches, network, BUILD_A);
    network.deploy({ ...BUILD_A.files, '/': 'document A, from the network' });
    expect(await restarted.navigate()).toBe('document A, from the network');
    expect(await caches.has(HOLD_CACHE)).toBe(false);
    expect(restarted.warnings).toEqual([]);
  });

  it('never wipes a fresh pin written between the stale read and its delete', async () => {
    await firstVisit(BUILD_A);
    await caches.writePin('releng-shell-gone');
    const restarted = startWorker(caches, network, BUILD_A);
    // The request reads the stale sentinel; before its delete lands, a hold from the page
    // writes a live pin.
    caches.afterNextHas = () => caches.writePin(A);
    await restarted.navigate();
    expect(await caches.pin()).toEqual({ shell: A });
    // And the next worker generation is held by it.
    expect(await startWorker(caches, network, BUILD_A).navigate()).toBe('document A');
  });

  it('does not remember a failed hold write: the next request re-reads the sentinel', async () => {
    const first = await firstVisit(BUILD_A);
    await first.message({ type: 'hold-shell', hold: true });
    const restarted = startWorker(caches, network, BUILD_A);
    caches.broken = true;
    await restarted.message({ type: 'hold-shell', hold: false });
    expect(restarted.warnings.length).toBeGreaterThan(0);
    caches.broken = false;
    // The release never reached the disk, so the pin still holds.
    network.deploy({ ...BUILD_A.files, '/': 'document A, from the network' });
    expect(await restarted.navigate()).toBe('document A');
  });

  it('does not remember a failed read in activate', async () => {
    const first = await firstVisit(BUILD_A);
    await first.message({ type: 'hold-shell', hold: true });
    const next = await deployAndInstall(BUILD_B);
    // Only the pin read fails; everything after it answers.
    const realMatch = caches.match.bind(caches);
    let failures = 1;
    caches.match = async (key, options) => {
      if (failures > 0 && options?.cacheName === HOLD_CACHE) {
        failures -= 1;
        throw new DOMException('the cache storage is unavailable', 'UnknownError');
      }
      return realMatch(key, options);
    };
    await next.activate();
    expect(next.warnings.length).toBeGreaterThan(0);
    // Unheld at activation (today's behavior: cache A went), but the next request reads
    // the sentinel again instead of trusting a remembered "unheld". Cache A is back, so
    // the pin is live, and the held navigation is cache-first (falling through to B's copy)
    // rather than network-first.
    await caches.open(A);
    network.deploy({ ...BUILD_B.files, '/': 'document B, from the network' });
    expect(await next.navigate()).toBe('document B');
  });

  it('replaces a stale pin with its own on the next hold', async () => {
    const worker = await firstVisit(BUILD_A);
    await caches.writePin('releng-shell-gone');
    await worker.message({ type: 'hold-shell', hold: true });
    expect(await caches.pin()).toEqual({ shell: A });
  });

  it('behaves as unheld, with a warning and no throw, when Cache Storage fails', async () => {
    const first = await firstVisit(BUILD_A);
    await first.message({ type: 'hold-shell', hold: true });
    const restarted = startWorker(caches, network, BUILD_A);
    caches.broken = true;
    network.deploy({ ...BUILD_A.files, '/': 'document A, from the network' });
    expect(await restarted.navigate()).toBe('document A, from the network');
    expect(restarted.warnings.length).toBeGreaterThan(0);

    // A failed read is not remembered: once storage answers again, the pin holds.
    caches.broken = false;
    expect(await restarted.navigate()).toBe('document A');
  });
});

describe('install never takes the pinned cache', () => {
  it('keeps the pin and the active shell when a third build installs', async () => {
    const first = await firstVisit(BUILD_A);
    await first.message({ type: 'hold-shell', hold: true });
    const second = await deployAndInstall(BUILD_B);
    await second.activate();
    await deployAndInstall(BUILD_C);
    expect(await shellCaches()).toEqual([A, B, C]);
  });

  it('still drops a discarded waiting install', async () => {
    await firstVisit(BUILD_A);
    await deployAndInstall(BUILD_B);
    await deployAndInstall(BUILD_C);
    expect(await shellCaches()).toEqual([A, C]);
  });
});
