/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

const PRECACHE_TOKEN = "'__PRECACHE_MANIFEST__'";
const VERSION_TOKEN = "'__SHELL_VERSION__'";

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
 * AR-7: `public/sw.js` is copied verbatim by Vite, so the built copy is rewritten here,
 * after the bundle exists and its hashed filenames are known. The precache list is the
 * app shell and nothing else — the document, every emitted chunk and asset (the hashed
 * JS and CSS and the self-hosted Inter woff2), and `/sprite.svg`.
 *
 * The cache name carries a hash of that list *and of the content that is not hashed into
 * a filename* — the document and everything copied from `public/`. Without that, a change
 * to `sprite.svg` or to `index.html` alone would produce a byte-identical `sw.js`: no new
 * worker would install, and the stale sprite would be served cache-first forever.
 */
function shellPrecache(): Plugin {
  let outDir = 'dist';
  let publicDir: string | false = false;
  let precache: string[] = [];
  return {
    name: 'shell-precache',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const emitted = Object.values(bundle)
        .map((chunk) => chunk.fileName)
        // `sw.js` and `sprite.svg` come from `public/`, so they are never in the bundle;
        // the sourcemaps are a debugging aid, not part of the shell; and the document is
        // precached once, as `/`.
        .filter((name) => !name.endsWith('.map') && !name.endsWith('.html'))
        .map((name) => `/${name}`)
        .sort();
      precache = ['/', ...emitted, '/sprite.svg'];
    },
    async closeBundle() {
      const target = resolve(outDir, 'sw.js');
      const source = await readFile(target, 'utf8');
      if (!source.includes(PRECACHE_TOKEN) || !source.includes(VERSION_TOKEN)) {
        this.error(`${target} does not carry the precache tokens; public/sw.js changed shape`);
      }
      const digest = createHash('sha256').update(precache.join('\n'));
      // The document, plus every file copied verbatim from `public/` except this script
      // (which is about to carry the hash we are computing).
      digest.update(await readFile(resolve(outDir, 'index.html')));
      for (const file of publicDir === false ? [] : await filesUnder(publicDir)) {
        if (relative(publicDir as string, file) === 'sw.js') continue;
        digest.update(relative(publicDir as string, file));
        digest.update(await readFile(file));
      }
      const version = digest.digest('hex').slice(0, 12);
      const stamped = source
        .replace(PRECACHE_TOKEN, JSON.stringify(precache))
        .replace(VERSION_TOKEN, JSON.stringify(version));
      await writeFile(target, stamped);
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
  },
});
