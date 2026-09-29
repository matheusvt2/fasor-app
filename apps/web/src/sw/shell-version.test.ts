// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stampShell } from '../../vite.config.ts';

/*
 * B7 (deferred-work 321, 327): the shell version digests every emitted file's bytes, the
 * document included, and is stamped into both the document and the worker. Run over a
 * built shell laid out on disk the way `vite build` leaves it, with the real
 * `public/sw.js` and a document carrying the real placeholder of `index.html`.
 */

const workerSource = await readFile(resolve(__dirname, '../../public/sw.js'), 'utf8');
const documentSource = await readFile(resolve(__dirname, '../../index.html'), 'utf8');
const PRECACHE = ['/', '/assets/index-a.js', '/sprite.svg'];

let outDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'shell-version-'));
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

/** A built shell: the document, one hashed chunk, the sprite and the unstamped worker. */
async function build(files: { document?: string; script?: string; sprite?: string } = {}): Promise<void> {
  await mkdir(join(outDir, 'assets'), { recursive: true });
  await writeFile(join(outDir, 'index.html'), files.document ?? documentSource);
  await writeFile(join(outDir, 'assets/index-a.js'), files.script ?? 'script A');
  await writeFile(join(outDir, 'sprite.svg'), files.sprite ?? '<svg></svg>');
  await writeFile(join(outDir, 'sw.js'), workerSource);
}

const stampedDocument = () => readFile(join(outDir, 'index.html'), 'utf8');
const stampedWorker = () => readFile(join(outDir, 'sw.js'), 'utf8');

describe('stampShell', () => {
  it('stamps one version into the document meta and the worker cache name', async () => {
    await build();
    const version = await stampShell(outDir, PRECACHE);
    expect(version).toMatch(/^[0-9a-f]{12}$/);
    expect(await stampedDocument()).toContain(`<meta name="shell-version" content="${version}" />`);
    expect(await stampedDocument()).not.toContain('__SHELL_VERSION__');
    const worker = await stampedWorker();
    expect(worker).toContain(`const SHELL_VERSION = "${version}";`);
    expect(worker).toContain(`const PRECACHE = ${JSON.stringify(PRECACHE)};`);
  });

  it('is the same version for the same bytes', async () => {
    await build();
    const first = await stampShell(outDir, PRECACHE);
    await build();
    expect(await stampShell(outDir, PRECACHE)).toBe(first);
  });

  it('is a new version when only index.html changes', async () => {
    await build();
    const before = await stampShell(outDir, PRECACHE);
    await build({ document: documentSource.replace('<title>PRODUTO</title>', '<title>PRODUTO</title><meta name="x" />') });
    expect(await stampShell(outDir, PRECACHE)).not.toBe(before);
  });

  it('is a new version when only a file copied from public/ or a chunk changes', async () => {
    await build();
    const before = await stampShell(outDir, PRECACHE);
    await build({ sprite: '<svg><symbol id="new"/></svg>' });
    const sprite = await stampShell(outDir, PRECACHE);
    expect(sprite).not.toBe(before);
    await build({ script: 'script A, edited' });
    expect(await stampShell(outDir, PRECACHE)).not.toBe(before);
  });

  it('refuses a document without the placeholder, rather than shipping an unnamed build', async () => {
    await build({ document: '<!doctype html><html><head></head><body></body></html>' });
    await expect(stampShell(outDir, PRECACHE)).rejects.toThrow(/placeholder/);
  });
});
