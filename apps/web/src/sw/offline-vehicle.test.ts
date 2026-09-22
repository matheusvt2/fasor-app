import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * AD-8 / AR-7, the "Never" half of the offline vehicle: "no manifest install prompt, no
 * Background Sync API, no reliance on `persist()`". A source scan, because the only way
 * to prove an API is not used is to look for it everywhere rather than in one file.
 */

const webRoot = resolve(__dirname, '../..');

function filesUnder(dir: string, match: RegExp): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      found.push(...filesUnder(path, match));
    } else if (match.test(name)) found.push(path);
  }
  return found;
}

// Shipped source only: this very file names every API it is looking for.
const scanned = [
  ...filesUnder(join(webRoot, 'src'), /\.(tsx?|css)$/).filter((path) => !/\.test\.tsx?$/.test(path)),
  ...filesUnder(join(webRoot, 'public'), /\.(js|svg|json|webmanifest)$/),
  join(webRoot, 'index.html'),
];

/**
 * Code only. The comments are where these APIs are *named* — the service worker's own
 * header lists what it deliberately does not do — and a rule that forbids writing the
 * reason down would be the wrong rule.
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(^|\s)\/\/.*$/gm, ' ');
}

const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: 'a web app manifest', pattern: /rel=["']manifest["']|\.webmanifest/ },
  { name: 'an install prompt', pattern: /beforeinstallprompt|prompt\(\)\s*\/\/\s*install|appinstalled/i },
  { name: 'the Background Sync API', pattern: /\bsync\.register\b|SyncManager|periodicSync/ },
  { name: 'a persistent-storage request', pattern: /storage\.persist\s*\(|persisted\s*\(/ },
];

describe('the offline vehicle uses nothing the web-only decision forbids', () => {
  it('scans the whole web app, not a sample', () => {
    expect(scanned.length).toBeGreaterThan(40);
  });

  for (const { name, pattern } of FORBIDDEN) {
    it(`never reaches for ${name}`, () => {
      const offenders = scanned.filter((file) => pattern.test(code(file)));
      expect(offenders, `${name} appears in:\n${offenders.join('\n')}`).toEqual([]);
    });
  }

  it('ships no manifest file at all', () => {
    expect(filesUnder(join(webRoot, 'public'), /\.webmanifest$|^manifest\.json$/)).toEqual([]);
  });
});

describe('the service worker precaches the shell and leaves /api alone', () => {
  const sw = readFileSync(join(webRoot, 'public/sw.js'), 'utf8');

  it('carries the two tokens the build stamps over', () => {
    expect(sw).toContain("'__PRECACHE_MANIFEST__'");
    expect(sw).toContain("'__SHELL_VERSION__'");
  });

  it('never activates itself: the page decides when the outbox is empty (AD-8)', () => {
    // It is called once, inside the `activate-shell` message handler.
    expect(sw.match(/self\.skipWaiting\(\)/g)).toHaveLength(1);
    expect(sw).toMatch(/'activate-shell'\) self\.skipWaiting\(\)/);
    // `install` must not promote itself: everything between the install listener and
    // the next one is free of it.
    const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
    expect(install).not.toMatch(/self\.skipWaiting\(\)/);
  });

  it('excludes /api from the fetch handler', () => {
    expect(sw).toMatch(/pathname\.startsWith\('\/api\/'\)/);
  });
});

/*
 * Under `vite dev` the document references `/src/main.tsx` and an unbounded module graph,
 * so a precached `/` is a shell that cannot boot: the worker would serve a blank page
 * whenever the dev server is down. `import.meta.env.DEV` cannot express that — it is also
 * true for the `build:e2e` bundle, which is a real build and needs the worker — so the
 * guard is `import.meta.hot`, which only the dev server ever defines.
 */
describe('the worker is registered by a build, never by the dev server', () => {
  const main = readFileSync(join(webRoot, 'src/main.tsx'), 'utf8');

  it('guards the registration on import.meta.hot, not on import.meta.env.DEV', () => {
    expect(main).toMatch(
      /if \(import\.meta\.hot\) void unregisterServiceWorkers\(\);\s*\n\s*else void registerServiceWorker\(\);/,
    );
    // The comment above it explains why `DEV` is the wrong flag, so only the code counts.
    expect(code(join(webRoot, 'src/main.tsx'))).not.toContain('import.meta.env.DEV');
  });

  it('clears out a worker an earlier dev session left behind', () => {
    expect(main).toContain('unregisterServiceWorkers');
  });
});
