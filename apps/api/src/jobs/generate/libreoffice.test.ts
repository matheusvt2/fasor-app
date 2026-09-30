import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { convertToPdf, LibreOfficeFailedError, LibreOfficeTimeoutError, MAX_CERTIFICATE_PAGES, pageRangeFilter, pngSizeFilter, rasterizePdfPages } from './libreoffice.ts';
import { samplePdf } from './sample-pdf.test-support.ts';

/*
 * `convertToPdf` without LibreOffice: a fake `soffice` shell script on the PATH plays the
 * four outcomes (hangs, exits non-zero, exits clean without a PDF, writes the PDF), so the
 * timeout kill, the failure mapping, the output check and the fault short-circuit are
 * covered where the tools image has no soffice at all.
 */

const binDir = mkdtempSync(join(tmpdir(), 'fake-soffice-'));
const script = join(binDir, 'soffice');
const marker = join(binDir, 'ran');
const originalPath = process.env.PATH;

function fakeSoffice(body: string): void {
  writeFileSync(script, `#!/bin/sh\ntouch "${marker}"\n${body}\n`);
  chmodSync(script, 0o755);
  rmSync(marker, { force: true });
}

/** The job directories `convertToPdf` leaves under the tmpdir for this job id. */
const jobDirs = (jobId: string) => readdirSync(tmpdir()).filter((name) => name.startsWith(`generate-${jobId}-`));

beforeAll(() => {
  process.env.PATH = `${binDir}:${originalPath ?? ''}`;
});

afterAll(() => {
  process.env.PATH = originalPath;
  rmSync(binDir, { recursive: true, force: true });
});

const input = Buffer.from('PK fake docx');

describe('convertToPdf over a fake soffice', () => {
  it('kills a conversion that outlives the timeout and removes the job directory', async () => {
    fakeSoffice('sleep 5');
    const started = Date.now();
    await expect(convertToPdf(input, { jobId: 'timeout', timeoutMs: 300 })).rejects.toBeInstanceOf(LibreOfficeTimeoutError);
    expect(Date.now() - started).toBeLessThan(4000);
    expect(jobDirs('timeout')).toEqual([]);
    expect(existsSync(marker)).toBe(true);
  }, 10_000);

  it('maps a non-zero exit to LibreOfficeFailedError', async () => {
    fakeSoffice('echo "boom" >&2\nexit 1');
    await expect(convertToPdf(input, { jobId: 'exit1', timeoutMs: 2000 })).rejects.toBeInstanceOf(LibreOfficeFailedError);
    expect(jobDirs('exit1')).toEqual([]);
  });

  it('maps a clean exit that wrote no PDF to LibreOfficeFailedError', async () => {
    fakeSoffice('exit 0');
    await expect(convertToPdf(input, { jobId: 'nopdf', timeoutMs: 2000 })).rejects.toBeInstanceOf(LibreOfficeFailedError);
    expect(jobDirs('nopdf')).toEqual([]);
  });

  it('resolves with the bytes soffice wrote into --outdir', async () => {
    fakeSoffice('out=""\nwhile [ $# -gt 0 ]; do if [ "$1" = "--outdir" ]; then out="$2"; fi; shift; done\nprintf "%%PDF-fake" > "$out/relatorio.pdf"');
    const pdf = await convertToPdf(input, { jobId: 'ok', timeoutMs: 2000 });
    expect(pdf.toString('utf8')).toBe('%PDF-fake');
    expect(jobDirs('ok')).toEqual([]);
  });

  it('rejects with LibreOfficeTimeoutError before any spawn when the fault is injected', async () => {
    fakeSoffice('exit 0');
    await expect(convertToPdf(input, { jobId: 'fault', timeoutMs: 2000, fault: 'libreoffice_timeout' })).rejects.toBeInstanceOf(LibreOfficeTimeoutError);
    expect(existsSync(marker)).toBe(false);
    expect(jobDirs('fault')).toEqual([]);
  });
});

/*
 * 7.3-UNIT: `rasterizePdfPages` over the same fake soffice. The fake records each run's
 * arguments (one per line, runs separated by "--") and writes what the real one would:
 * the one-page PDF for a `pdf:` conversion, a PNG stand-in for a `png:` one.
 */
describe('rasterizePdfPages over a fake soffice', () => {
  const argLog = join(binDir, 'args.log');
  const rasterDirs = (jobId: string) => readdirSync(tmpdir()).filter((name) => name.startsWith(`rasterize-${jobId}-`));
  const recording = [
    `for a in "$@"; do echo "$a" >> "${argLog}"; done`,
    `echo "--" >> "${argLog}"`,
    'out=""; conv=""',
    'while [ $# -gt 0 ]; do case "$1" in --outdir) out="$2"; shift;; --convert-to) conv="$2"; shift;; esac; shift; done',
  ].join('\n');
  /** The runs the fake saw, each as its argument list. */
  const runs = () =>
    readFileSync(argLog, 'utf8')
      .split('--\n')
      .filter((run) => run.trim() !== '')
      .map((run) => run.trim().split('\n'));

  it('cuts each page with PageRange and exports it as PNG at the page size x 150 / 72, one image per page', async () => {
    rmSync(argLog, { force: true });
    fakeSoffice(`${recording}\ncase "$conv" in pdf:*) printf "%%PDF-page" > "$out/certificado.pdf";; png:*) printf "PNG %s" "$conv" > "$out/certificado.png";; esac`);
    const pages = await rasterizePdfPages(samplePdf(3), { jobId: 'raster-ok', timeoutMs: 5000 });
    expect(pages).toHaveLength(3);
    const all = runs();
    expect(all).toHaveLength(6);
    for (const [i, run] of all.entries()) {
      const page = Math.floor(i / 2) + 1;
      expect(run.slice(0, 3)).toEqual(['--headless', '--norestore', '--nologo']);
      expect(run[3]).toMatch(/^-env:UserInstallation=file:\/\/.*\/profile$/);
      expect(run).toContain('--infilter=draw_pdf_import');
      const conversion = run[run.indexOf('--convert-to') + 1];
      const outdir = run[run.indexOf('--outdir') + 1]!;
      if (i % 2 === 0) {
        expect(conversion).toBe(pageRangeFilter(page));
        expect(conversion).toBe(`pdf:draw_pdf_Export:{"PageRange":{"type":"string","value":"${page}"}}`);
        expect(outdir).toMatch(new RegExp(`/page-${page}$`));
        expect(run.at(-1)).toMatch(/\/certificado\.pdf$/);
      } else {
        // A4 is 595 x 842 pt: 1240 x 1754 px at 150 dpi.
        expect(conversion).toBe(pngSizeFilter(1240, 1754));
        expect(conversion).toBe('png:draw_png_Export:{"PixelWidth":{"type":"long","value":"1240"},"PixelHeight":{"type":"long","value":"1754"}}');
        expect(outdir).toMatch(new RegExp(`/png-${page}$`));
        expect(run.at(-1)).toMatch(new RegExp(`/page-${page}/certificado\\.pdf$`));
      }
    }
    expect(pages.map((p) => p.toString('utf8'))).toEqual(new Array(3).fill(`PNG ${pngSizeFilter(1240, 1754)}`));
    expect(rasterDirs('raster-ok')).toEqual([]);
  }, 20_000);

  it('rasterizes a landscape page at its own size', async () => {
    rmSync(argLog, { force: true });
    fakeSoffice(`${recording}\ncase "$conv" in pdf:*) printf "%%PDF-page" > "$out/certificado.pdf";; png:*) printf "PNG" > "$out/certificado.png";; esac`);
    await rasterizePdfPages(samplePdf(1, { width: 842, height: 595 }), { jobId: 'raster-land', timeoutMs: 5000, dpi: 72 });
    expect(runs()[1]).toContain(pngSizeFilter(842, 595));
  }, 20_000);

  it('surfaces a hung soffice as LibreOfficeTimeoutError and a failing one as LibreOfficeFailedError, leaving no directory', async () => {
    fakeSoffice('sleep 5');
    await expect(rasterizePdfPages(samplePdf(2), { jobId: 'raster-timeout', timeoutMs: 300 })).rejects.toBeInstanceOf(LibreOfficeTimeoutError);
    expect(rasterDirs('raster-timeout')).toEqual([]);
    fakeSoffice('echo "boom" >&2\nexit 1');
    await expect(rasterizePdfPages(samplePdf(2), { jobId: 'raster-exit1', timeoutMs: 2000 })).rejects.toBeInstanceOf(LibreOfficeFailedError);
    expect(rasterDirs('raster-exit1')).toEqual([]);
    // A clean exit that wrote no PNG is a failure too.
    fakeSoffice('exit 0');
    await expect(rasterizePdfPages(samplePdf(1), { jobId: 'raster-nopng', timeoutMs: 2000 })).rejects.toBeInstanceOf(LibreOfficeFailedError);
  }, 20_000);

  it('rejects bytes that are not a PDF before any soffice run', async () => {
    fakeSoffice('exit 0');
    await expect(rasterizePdfPages(Buffer.from('not a pdf'), { jobId: 'raster-garbage', timeoutMs: 2000 })).rejects.toThrow();
    expect(existsSync(marker)).toBe(false);
  }, 20_000);

  it('refuses a certificate over MAX_CERTIFICATE_PAGES pages before any soffice run', async () => {
    fakeSoffice('exit 0');
    await expect(rasterizePdfPages(samplePdf(MAX_CERTIFICATE_PAGES + 1), { jobId: 'job-cap' })).rejects.toBeInstanceOf(LibreOfficeFailedError);
    expect(existsSync(marker)).toBe(false);
    expect(rasterDirs('job-cap')).toEqual([]);
  });
});

/*
 * Review 2026-09-30, A-5 and A-17 over the same fake soffice.
 */
describe('A-5 the certificate rasterization budget', () => {
  it('stops at the deadline with LibreOfficeTimeoutError instead of running every page', async () => {
    fakeSoffice(
      [
        'sleep 0.4',
        'out=""; conv=""',
        'while [ $# -gt 0 ]; do case "$1" in --outdir) out="$2"; shift;; --convert-to) conv="$2"; shift;; esac; shift; done',
        'case "$conv" in pdf:*) printf "%%PDF-page" > "$out/certificado.pdf";; png:*) printf "PNG" > "$out/certificado.png";; esac',
      ].join('\n'),
    );
    const started = Date.now();
    // Five pages are ten runs of 0.4 s: 4 s without a budget.
    await expect(rasterizePdfPages(samplePdf(5), { jobId: 'raster-budget', timeoutMs: 5000, deadline: started + 1000 })).rejects.toBeInstanceOf(LibreOfficeTimeoutError);
    expect(Date.now() - started).toBeLessThan(2500);
  }, 20_000);

  it('caps a run at the time left in the budget', async () => {
    fakeSoffice('sleep 5');
    const started = Date.now();
    await expect(rasterizePdfPages(samplePdf(1), { jobId: 'raster-cap', timeoutMs: 60_000, deadline: started + 500 })).rejects.toBeInstanceOf(LibreOfficeTimeoutError);
    expect(Date.now() - started).toBeLessThan(4000);
  }, 20_000);
});

describe('A-17 one soffice profile per process', () => {
  const argLog = join(binDir, 'profile-args.log');
  const profileOf = (line: string) => /-env:UserInstallation=(\S+)/.exec(line)?.[1];
  const profiles = () =>
    readFileSync(argLog, 'utf8')
      .split('\n')
      .map((line) => profileOf(line))
      .filter((profile): profile is string => profile !== undefined);
  const writing = (exit: string) =>
    [
      `echo "$*" >> "${argLog}"`,
      'out=""',
      'while [ $# -gt 0 ]; do if [ "$1" = "--outdir" ]; then out="$2"; fi; shift; done',
      exit === '0' ? 'printf "%%PDF-fake" > "$out/relatorio.pdf"' : `exit ${exit}`,
    ].join('\n');

  it('reuses the profile across conversions, and starts a fresh one after a failed run', async () => {
    rmSync(argLog, { force: true });
    fakeSoffice(writing('0'));
    await convertToPdf(input, { jobId: 'profile-1', timeoutMs: 2000 });
    await convertToPdf(input, { jobId: 'profile-2', timeoutMs: 2000 });
    fakeSoffice(writing('1'));
    await expect(convertToPdf(input, { jobId: 'profile-3', timeoutMs: 2000 })).rejects.toBeInstanceOf(LibreOfficeFailedError);
    fakeSoffice(writing('0'));
    await convertToPdf(input, { jobId: 'profile-4', timeoutMs: 2000 });
    const [first, second, third, fourth] = profiles();
    expect(first).toMatch(/^file:\/\/.*\/profile$/);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(fourth).not.toBe(first);
  });
});
