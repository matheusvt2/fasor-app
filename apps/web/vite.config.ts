/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

const PRECACHE_TOKEN = "'__PRECACHE_MANIFEST__'";
const VERSION_TOKEN = "'__SHELL_VERSION__'";
/** The version placeholder in `index.html` (`<meta name="shell-version">`). */
const DOCUMENT_VERSION_TOKEN = '__SHELL_VERSION__';

/** Every file under `dir`, recursively, sorted so the hash does not depend on readdir order. */
async function filesUnder(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await filesUnder(path)));
    else found.push(path);
  }
  return found.sort();
}

/**
 * Stamps a built shell in `outDir` and answers its version. The version digests every
 * emitted file's bytes — the document (with its version placeholder still in place), the
 * hashed chunks and assets (the icon sprite among them), and everything copied from
 * `public/` — as the sorted list of `path sha256(bytes)`; only `sw.js` is left out, since
 * it is about to carry the result. So a deploy that changes nothing but markup, styles or
 * the sprite is a new version: a new `sw.js` (the browser installs a new worker) and a new
 * cache name.
 *
 * The version is then written into `index.html`'s `<meta name="shell-version">`, which
 * is how the page names its build to the worker (`currentShellVersion` in
 * `src/sw/register.ts`), and into `sw.js`, whose cache is `releng-shell-<version>`.
 */
export async function stampShell(outDir: string, precache: readonly string[]): Promise<string> {
  const document = resolve(outDir, 'index.html');
  const worker = resolve(outDir, 'sw.js');
  const html = await readFile(document, 'utf8');
  if (!html.includes(DOCUMENT_VERSION_TOKEN)) {
    throw new Error(`${document} does not carry the shell version placeholder; index.html changed shape`);
  }
  const source = await readFile(worker, 'utf8');
  if (!source.includes(PRECACHE_TOKEN) || !source.includes(VERSION_TOKEN)) {
    throw new Error(`${worker} does not carry the precache tokens; public/sw.js changed shape`);
  }
  const lines: string[] = [];
  for (const file of await filesUnder(outDir)) {
    const path = relative(outDir, file).split(sep).join('/');
    if (path === 'sw.js') continue;
    lines.push(`${path} ${createHash('sha256').update(await readFile(file)).digest('hex')}`);
  }
  const version = createHash('sha256').update(lines.sort().join('\n')).digest('hex').slice(0, 12);
  await writeFile(document, html.replaceAll(DOCUMENT_VERSION_TOKEN, version));
  await writeFile(
    worker,
    source.replace(PRECACHE_TOKEN, JSON.stringify(precache)).replace(VERSION_TOKEN, JSON.stringify(version)),
  );
  return version;
}

/** The icon sprite as the build emits it: `src/styles/sprite.svg` under its content-hashed name. */
const HASHED_SPRITE = /^\/assets\/sprite-[^/]+\.svg$/;

/**
 * The precache list of a built shell, from the file names of its bundle: the document,
 * once, as `/`, then every emitted chunk and asset (the hashed JS and CSS, the self-hosted
 * Inter woff2 and the icon sprite). The sourcemaps are a debugging aid, not part of the
 * shell, and `sw.js` comes from `public/`, so it is never in the bundle.
 *
 * Every path but `/` carries a content hash, the sprite included (fix batch e26u): a path
 * two builds share is answered by whichever worker is in control, from its own cache,
 * which is how a new build's page drew the old build's sprite on its first launch. So a
 * bundle with no hashed sprite is refused, rather than shipped with icons that go blank
 * offline.
 */
export function shellPrecacheList(fileNames: readonly string[]): string[] {
  const emitted = fileNames
    .filter((name) => !name.endsWith('.map') && !name.endsWith('.html'))
    .map((name) => `/${name}`)
    .sort();
  if (!emitted.some((path) => HASHED_SPRITE.test(path))) {
    throw new Error(
      'the bundle emits no hashed icon sprite (assets/sprite-<hash>.svg); src/styles/sprite.ts must import it as an asset',
    );
  }
  return ['/', ...emitted];
}

/**
 * AR-7: `public/sw.js` is copied verbatim by Vite, so the built copy is rewritten here,
 * after the bundle exists and its hashed filenames are known. The precache list is the
 * app shell and nothing else (`shellPrecacheList`). The version, which names the cache
 * and is stamped into the document, is `stampShell`'s digest.
 */
function shellPrecache(): Plugin {
  let outDir = 'dist';
  let precache: string[] = [];
  return {
    name: 'shell-precache',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    generateBundle(_options, bundle) {
      try {
        precache = shellPrecacheList(Object.values(bundle).map((chunk) => chunk.fileName));
      } catch (error) {
        this.error(error instanceof Error ? error.message : String(error));
      }
    },
    async closeBundle() {
      try {
        await stampShell(outDir, precache);
      } catch (error) {
        this.error(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), shellPrecache()],
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  // The durability scenarios run against the built bundle: under `vite dev` the document
  // references `/src/main.tsx` and an unbounded module graph, so a precached shell there
  // could not boot offline.
  preview: {
    host: true,
    port: 5200,
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // F-GATE-1: the 5 s default flaked under load; 15 s gives headroom without masking a
    // real hang.
    testTimeout: 15_000,
    // TST-V1: a focused `it.only` fails the run (Vitest allows it outside CI by default).
    allowOnly: false,
  },
});
