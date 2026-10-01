import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { CertificateUnreadableError, MAX_CERTIFICATE_PAGES, RasterizeTimeoutError, rasterizePdfPages } from './pdf-raster.ts';
import { samplePdf } from './sample-pdf.test-support.ts';

/*
 * 7.3-UNIT (review fixes 2026-09-30): `rasterizePdfPages` over the real `pdftoppm` of the
 * tools image (poppler-utils), and over a fake one on the PATH for the timeout.
 */

const rasterDirs = (jobId: string) => readdirSync(tmpdir()).filter((name) => name.startsWith(`rasterize-${jobId}-`));
const originalPath = process.env.PATH;
let fakeDir: string | null = null;

/** A `pdftoppm` on the PATH that touches a marker and then runs `body`. */
function fakePdftoppm(body: string): string {
  if (fakeDir !== null) rmSync(fakeDir, { recursive: true, force: true });
  fakeDir =mkdtempSync(join(tmpdir(), 'fake-pdftoppm-'));
  const marker = join(fakeDir, 'ran');
  writeFileSync(join(fakeDir, 'pdftoppm'), `#!/bin/sh\ntouch "${marker}"\n${body}\n`);
  chmodSync(join(fakeDir, 'pdftoppm'), 0o755);
  process.env.PATH = `${fakeDir}:${originalPath ?? ''}`;
  return marker;
}

afterEach(() => {
  process.env.PATH = originalPath;
  if (fakeDir !== null) rmSync(fakeDir, { recursive: true, force: true });
  fakeDir = null;
});

describe('rasterizePdfPages with pdftoppm', () => {
  it('writes one PNG per page, in page order, at the page size x 150 / 72', async () => {
    const pages = await rasterizePdfPages(samplePdf(3), { jobId: 'raster-ok' });
    expect(pages).toHaveLength(3);
    for (const page of pages) {
      const meta = await sharp(page).metadata();
      expect(meta.format).toBe('png');
      // A4 (595 x 842 pt) at 150 dpi.
      expect(Math.abs(meta.width! - 1240)).toBeLessThanOrEqual(2);
      expect(Math.abs(meta.height! - 1754)).toBeLessThanOrEqual(2);
    }
    expect(new Set(pages.map((p) => p.toString('base64'))).size).toBe(3);
    expect(rasterDirs('raster-ok')).toEqual([]);
  });

  it('keeps page order past nine pages (pdftoppm pads the page number)', async () => {
    const pages = await rasterizePdfPages(samplePdf(11, { width: 200, height: 100 }), { jobId: 'raster-eleven', dpi: 72 });
    expect(pages).toHaveLength(11);
    const one = await rasterizePdfPages(samplePdf(1, { width: 200, height: 100 }), { jobId: 'raster-one', dpi: 72 });
    expect(pages[0]!.equals(one[0]!)).toBe(true);
  });

  it('reports a file that is not a PDF as unreadable (permanent), before any pdftoppm run', async () => {
    const marker = fakePdftoppm('exit 0');
    await expect(rasterizePdfPages(Buffer.from('%PDF-1.4 not really'), { jobId: 'raster-garbage' })).rejects.toBeInstanceOf(CertificateUnreadableError);
    expect(existsSync(marker)).toBe(false);
  });

  it('reports a certificate over MAX_CERTIFICATE_PAGES pages as unreadable, before any pdftoppm run', async () => {
    const marker = fakePdftoppm('exit 0');
    await expect(rasterizePdfPages(samplePdf(MAX_CERTIFICATE_PAGES + 1), { jobId: 'raster-cap' })).rejects.toBeInstanceOf(CertificateUnreadableError);
    expect(existsSync(marker)).toBe(false);
  });

  it('maps a pdftoppm refusal (non-zero exit) to unreadable', async () => {
    fakePdftoppm('echo "Syntax Error" >&2\nexit 1');
    await expect(rasterizePdfPages(samplePdf(1), { jobId: 'raster-exit1' })).rejects.toBeInstanceOf(CertificateUnreadableError);
    expect(rasterDirs('raster-exit1')).toEqual([]);
  });

  it('kills a run past its timeout with RasterizeTimeoutError (transient) and removes its directory', async () => {
    fakePdftoppm('sleep 5');
    const started = Date.now();
    await expect(rasterizePdfPages(samplePdf(1), { jobId: 'raster-timeout', timeoutMs: 300 })).rejects.toBeInstanceOf(RasterizeTimeoutError);
    expect(Date.now() - started).toBeLessThan(4000);
    expect(rasterDirs('raster-timeout')).toEqual([]);
  }, 10_000);

  it('A-5: caps the run at the time left in the budget, and refuses to start past it', async () => {
    fakePdftoppm('sleep 5');
    const started = Date.now();
    await expect(rasterizePdfPages(samplePdf(1), { jobId: 'raster-budget', timeoutMs: 60_000, deadline: started + 400 })).rejects.toBeInstanceOf(RasterizeTimeoutError);
    expect(Date.now() - started).toBeLessThan(4000);
    const marker = fakePdftoppm('exit 0');
    await expect(rasterizePdfPages(samplePdf(1), { jobId: 'raster-spent', deadline: Date.now() - 1 })).rejects.toBeInstanceOf(RasterizeTimeoutError);
    expect(existsSync(marker)).toBe(false);
  }, 10_000);
});
