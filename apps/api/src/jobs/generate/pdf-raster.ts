import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPageSizes } from './pdf-outline.ts';

/*
 * Story 7.3, review fixes 2026-09-30: section 11's certificate PDFs become page images with
 * poppler's `pdftoppm` (150 dpi PNG, one run per certificate) instead of two LibreOffice
 * runs per page. Two failures are told apart, because the job treats them differently:
 * `CertificateUnreadableError` is permanent (not a PDF, no pages, too many pages, pdftoppm
 * refusing the file), so the section prints the kernel's placeholder; every other throw
 * (the run timed out, the budget is spent, pdftoppm could not start) is transient and
 * fails the issue job, which a later press can retry.
 */

/** A certificate run is killed (SIGKILL) past this; a 20-page certificate takes a few seconds. */
export const DEFAULT_RASTERIZE_TIMEOUT_MS = 30_000;

/**
 * A-5: the time every certificate of one job may spend rasterizing, all together (the
 * caller sets the deadline once per job). With the conversion passes (at most three of
 * `DEFAULT_CONVERT_TIMEOUT_MS`) it stays inside the queue's 900 s expiry of a running job.
 */
export const CERTIFICATE_RASTERIZE_BUDGET_MS = 300_000;

/** A certificate longer than this is refused (permanent: the placeholder prints). */
export const MAX_CERTIFICATE_PAGES = 20;

/** The run outlived its timeout or the job's budget: transient, the issue job fails. */
export class RasterizeTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RasterizeTimeoutError';
  }
}

/** The file itself cannot become pages; waiting cannot fix it, so the placeholder prints. */
export class CertificateUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CertificateUnreadableError';
  }
}

export interface RasterizeOptions {
  jobId: string;
  /** Per pdftoppm run; default `DEFAULT_RASTERIZE_TIMEOUT_MS`. */
  timeoutMs?: number;
  /**
   * A-5: the instant (ms since the epoch) the whole rasterization must end by; the run's
   * timeout is the smaller of `timeoutMs` and the time left, and a run that would start past
   * it throws `RasterizeTimeoutError`. Absent: no total budget.
   */
  deadline?: number;
  /** Default 150 (Story 7.3: certificates print at 150 dpi). */
  dpi?: number;
}

export type Rasterizer = (pdf: Buffer, options: RasterizeOptions) => Promise<Buffer[]>;

function runPdftoppm(args: readonly string[], timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('pdftoppm', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`pdftoppm could not start: ${String(error)}`));
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) reject(new RasterizeTimeoutError(`pdftoppm killed after ${timeoutMs} ms`));
      else if (code !== 0) reject(new CertificateUnreadableError(`pdftoppm exited with ${code ?? signal}: ${stderr.trim()}`));
      else resolve();
    });
  });
}

/** `page-1.png`, `page-02.png`, ...: pdftoppm pads the number to the page count's width. */
const PAGE_FILE = /^page-(\d+)\.png$/;

/**
 * Every page of a PDF as a PNG at `dpi`, in page order: pdfjs reads the page count (a file it
 * cannot parse is unreadable), then one pdftoppm run writes every page into a temporary
 * directory, removed in every case.
 */
export async function rasterizePdfPages(pdf: Buffer, options: RasterizeOptions): Promise<Buffer[]> {
  let count: number;
  try {
    count = (await readPageSizes(pdf)).length;
  } catch (error) {
    throw new CertificateUnreadableError(`not a readable PDF: ${String(error)}`);
  }
  if (count === 0) throw new CertificateUnreadableError('certificate has no pages');
  if (count > MAX_CERTIFICATE_PAGES) throw new CertificateUnreadableError(`certificate has ${count} pages, more than ${MAX_CERTIFICATE_PAGES}`);
  const left = (options.deadline ?? Number.POSITIVE_INFINITY) - Date.now();
  if (left <= 0) throw new RasterizeTimeoutError('certificate rasterization exceeded its budget');
  const timeoutMs = Math.min(options.timeoutMs ?? DEFAULT_RASTERIZE_TIMEOUT_MS, left);
  const dir = await mkdtemp(join(tmpdir(), `rasterize-${options.jobId}-`));
  try {
    const input = join(dir, 'certificado.pdf');
    await writeFile(input, pdf);
    await runPdftoppm(['-r', String(options.dpi ?? 150), '-png', input, join(dir, 'page')], timeoutMs);
    const files = (await readdir(dir))
      .map((name) => ({ name, page: Number(PAGE_FILE.exec(name)?.[1] ?? Number.NaN) }))
      .filter((file) => Number.isInteger(file.page))
      .sort((a, b) => a.page - b.page);
    if (files.length !== count) throw new CertificateUnreadableError(`pdftoppm wrote ${files.length} of ${count} pages`);
    return await Promise.all(files.map((file) => readFile(join(dir, file.name))));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
