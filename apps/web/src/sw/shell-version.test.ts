// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { shellPrecacheList, stampShell } from '../../vite.config.ts';

/*
 * B7 (deferred-work 321, 327): the shell version digests every emitted file's bytes, the
 * document included, and is stamped into both the document and the worker. Run over a
 * built shell laid out on disk the way `vite build` leaves it, with the real
 * `public/sw.js` and a document carrying the real placeholder of `index.html`.
 */

const workerSource = await readFile(resolve(__dirname, '../../public/sw.js'), 'utf8');
const documentSource = await readFile(resolve(__dirname, '../../index.html'), 'utf8');
const PRECACHE = ['/', '/assets/index-a.js', '/assets/sprite-a.svg'];

let outDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'shell-version-'));
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

/** A built shell: the document, one hashed chunk, the hashed sprite and the unstamped worker. */
async function build(files: { document?: string; script?: string; sprite?: string } = {}): Promise<void> {
  await mkdir(join(outDir, 'assets'), { recursive: true });
  await writeFile(join(outDir, 'index.html'), files.document ?? documentSource);
  await writeFile(join(outDir, 'assets/index-a.js'), files.script ?? 'script A');
  await writeFile(join(outDir, 'assets/sprite-a.svg'), files.sprite ?? '<svg></svg>');
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
    await build({ document: documentSource.replace('</title>', '</title><meta name="x" />') });
    expect(await stampShell(outDir, PRECACHE)).not.toBe(before);
  });

  it('is a new version when only the sprite or a chunk changes', async () => {
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

/*
 * Fix batch e26u: the precache list names the icon sprite by its hashed name, never by a
 * path two builds share. `/sprite.svg` was such a path: on the first launch after a deploy
 * the old worker answered it from its own cache, and a symbol the new build added drew
 * nothing.
 */
describe('shellPrecacheList', () => {
  const BUNDLE = [
    'index.html',
    'assets/index-B1.js',
    'assets/index-B1.js.map',
    'assets/sprite-C3.svg',
    'assets/index-A2.css',
    'assets/inter-latin-wght-normal-D4.woff2',
  ];
  const withoutSprite = BUNDLE.filter((name) => !name.includes('sprite'));

  it('lists the document once, then every emitted file under its hashed name, the sprite among them', () => {
    expect(shellPrecacheList(BUNDLE)).toEqual([
      '/',
      '/assets/index-A2.css',
      '/assets/index-B1.js',
      '/assets/inter-latin-wght-normal-D4.woff2',
      '/assets/sprite-C3.svg',
    ]);
  });

  it('names no path that two builds share but the document', () => {
    const list = shellPrecacheList(BUNDLE);
    expect(list.filter((path) => !/^\/assets\/[^/]+-[^/.]+\.[a-z0-9]+$/.test(path))).toEqual(['/']);
    expect(list).not.toContain('/sprite.svg');
  });

  it('refuses a bundle that emits no hashed sprite, rather than shipping icons no cache holds', () => {
    expect(() => shellPrecacheList(withoutSprite)).toThrow(/no hashed icon sprite/);
    expect(() => shellPrecacheList([...withoutSprite, 'sprite.svg'])).toThrow(/no hashed icon sprite/);
  });
});
