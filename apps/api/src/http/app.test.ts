import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, resolveStaticTarget } from './app.ts';

const up = async () => undefined;
const probes = { db: up, queue: up, storage: up, libreoffice: up };

describe('static bundle serving + SPA fallback', () => {
  let staticDir: string;

  beforeEach(async () => {
    staticDir = await mkdtemp(join(tmpdir(), 'app-static-'));
    await writeFile(join(staticDir, 'index.html'), '<!doctype html><title>shell</title>');
    await writeFile(join(staticDir, 'app.js'), 'console.log("hi")');
  });

  afterEach(async () => {
    await rm(staticDir, { recursive: true, force: true });
  });

  it('falls back to index.html for an unknown non-API path', async () => {
    const app = createApp(probes, { staticDir });
    const res = await app.request('/some/client/route');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('shell');
  });

  it('serves an existing static file as-is', async () => {
    const app = createApp(probes, { staticDir });
    const res = await app.request('/app.js');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('console.log("hi")');
  });

  it('404s an unknown /api/* path instead of falling back to the SPA shell', async () => {
    const app = createApp(probes, { staticDir });
    const res = await app.request('/api/unknown-route');
    expect(res.status).toBe(404);
  });

  it('404s the bare /api path', async () => {
    const app = createApp(probes, { staticDir });
    const res = await app.request('/api');
    expect(res.status).toBe(404);
  });

  it('404s gracefully when the static dir has no index.html (partial build)', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'app-static-empty-'));
    try {
      const app = createApp(probes, { staticDir: emptyDir });
      const res = await app.request('/');
      expect(res.status).toBe(404);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  it('picks up a static dir that starts existing only after createApp runs', async () => {
    const lateDir = join(tmpdir(), `app-static-late-${Date.now()}`);
    const app = createApp(probes, { staticDir: lateDir });

    const before = await app.request('/');
    expect(before.status).toBe(404);

    await mkdir(lateDir, { recursive: true });
    await writeFile(join(lateDir, 'index.html'), '<!doctype html><title>late</title>');
    try {
      const after = await app.request('/');
      expect(after.status).toBe(200);
      expect(await after.text()).toContain('late');
    } finally {
      await rm(lateDir, { recursive: true, force: true });
    }
  });

  it('resolveStaticTarget does not escape the static dir on a traversal attempt', async () => {
    const target = await resolveStaticTarget(staticDir, '/../../../../../../../../etc/passwd');
    expect(target).toBe(join(staticDir, 'index.html'));
  });
});
