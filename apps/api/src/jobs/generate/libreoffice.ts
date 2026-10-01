import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { readPageSizes } from './pdf-outline.ts';

const run = promisify(execFile);

/** Only proves the binary is installed; `GET /api/health.libreoffice` reads it. */
export async function probeLibreOffice(): Promise<void> {
  await run('soffice', ['--version'], { timeout: 2500 });
}

/** The conversion outlived `timeoutMs` (or the injected fault said so): the job fails with `libreoffice_timeout`. */
export class LibreOfficeTimeoutError extends Error {
  constructor(message = 'soffice did not finish in time') {
    super(message);
    this.name = 'LibreOfficeTimeoutError';
  }
}

/** soffice exited without writing the PDF. */
export class LibreOfficeFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibreOfficeFailedError';
  }
}

export type GenerateFault = 'libreoffice_timeout';

export interface ConvertOptions {
  jobId: string;
  /** Default 120 000 ms; the process is killed (SIGKILL) past it. */
  timeoutMs?: number;
  /** TC-3: `libreoffice_timeout` throws before soffice is spawned (`GENERATE_FAULT`, never in production). */
  fault?: GenerateFault | undefined;
}

export const DEFAULT_CONVERT_TIMEOUT_MS = 120_000;

/*
 * AD-15: generate concurrency is 1 per instance. Every conversion queues behind the
 * previous one on this module-level chain, whatever called it, so two jobs (or a job and
 * a stray retry) never run two soffice processes at once.
 */
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

/*
 * Review 2026-09-30, A-17: one `-env:UserInstallation` profile per process, created on the
 * first run and reused by every later one (a cold profile costs 1-3 s per soffice start, and
 * a job runs two or three conversions plus two runs per certificate page). Runs are already
 * one at a time (`serialize`), so no two share it at once. A run that fails (a timeout, a
 * crash, a non-zero exit) may leave it locked or half written: it is removed and the next
 * run starts a fresh one.
 */
let profileDir: string | null = null;

async function sofficeProfile(): Promise<string> {
  if (profileDir === null) profileDir = join(await mkdtemp(join(tmpdir(), 'soffice-')), 'profile');
  return profileDir;
}

async function discardProfile(): Promise<void> {
  const dir = profileDir;
  profileDir = null;
  if (dir !== null) await rm(join(dir, '..'), { recursive: true, force: true }).catch(() => undefined);
}

/** One soffice run with the process's profile; a failed run discards the profile. */
async function runWithProfile(args: readonly string[], timeoutMs: number): Promise<void> {
  const profile = await sofficeProfile();
  try {
    await runSoffice(profile, args, timeoutMs);
  } catch (error) {
    await discardProfile();
    throw error;
  }
}

/**
 * Converts a DOCX to PDF with LibreOffice headless: its own temporary directory, the
 * process's `-env:UserInstallation` profile (A-17), the process killed on timeout, the
 * directory removed in every case. The input is always the job's own DOCX (AD-15).
 */
export function convertToPdf(docx: Buffer, options: ConvertOptions): Promise<Buffer> {
  return serialize(async () => {
    if (options.fault === 'libreoffice_timeout') throw new LibreOfficeTimeoutError('fault injected: libreoffice_timeout');
    const dir = await mkdtemp(join(tmpdir(), `generate-${options.jobId}-`));
    try {
      const input = join(dir, 'relatorio.docx');
      await writeFile(input, docx);
      await runWithProfile(['--convert-to', 'pdf', '--outdir', dir, input], options.timeoutMs ?? DEFAULT_CONVERT_TIMEOUT_MS);
      try {
        return await readFile(join(dir, 'relatorio.pdf'));
      } catch {
        throw new LibreOfficeFailedError('soffice exited without writing relatorio.pdf');
      }
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
}

/** SIGKILL to the child's process group, or to the child alone when it has no pid. */
function killGroup(child: ChildProcess): void {
  if (child.pid === undefined) {
    child.kill('SIGKILL');
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

/** One headless soffice run with the given profile directory; `args` follow the fixed profile flags. */
function runSoffice(profileDirectory: string, args: readonly string[], timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const profile = pathToFileURL(profileDirectory).href;
    // `soffice` is a launcher script around `soffice.bin`: the process is its own group
    // (`detached`), so the timeout kills the whole group, not only the launcher.
    const child = spawn('soffice', ['--headless', '--norestore', '--nologo', `-env:UserInstallation=${profile}`, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.stdout?.resume();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child);
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(new LibreOfficeFailedError(`soffice could not start: ${String(error)}`));
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) reject(new LibreOfficeTimeoutError(`soffice killed after ${timeoutMs} ms`));
      else if (code !== 0) reject(new LibreOfficeFailedError(`soffice exited with ${code ?? signal}: ${stderr.trim()}`));
      else resolve();
    });
  });
}

export interface RasterizeOptions {
  jobId: string;
  /** Per soffice run; default 120 000 ms, the process killed (SIGKILL) past it. */
  timeoutMs?: number;
  /**
   * A-5: the instant (ms since the epoch) the whole rasterization must end by; each run's
   * timeout is the smaller of `timeoutMs` and the time left, and a run that would start past
   * it throws `LibreOfficeTimeoutError`. Absent: no total budget.
   */
  deadline?: number;
  /** Default 150 (Story 7.3: certificates print at 150 dpi). */
  dpi?: number;
}

/**
 * A-5: the time every certificate of one job may spend rasterizing, all together (the
 * caller sets the deadline once per job). With the conversion passes (at most three of
 * `DEFAULT_CONVERT_TIMEOUT_MS`) it stays inside the queue's 900 s expiry of a running job.
 */
export const CERTIFICATE_RASTERIZE_BUDGET_MS = 300_000;

/** The two per-page filters (verified on LibreOffice 26.2.6: `draw_png_Export` alone always renders page 1). */
export function pageRangeFilter(page: number): string {
  return `pdf:draw_pdf_Export:{"PageRange":{"type":"string","value":"${page}"}}`;
}

export function pngSizeFilter(width: number, height: number): string {
  return `png:draw_png_Export:{"PixelWidth":{"type":"long","value":"${width}"},"PixelHeight":{"type":"long","value":"${height}"}}`;
}

/**
 * Story 7.3: every page of a PDF as a PNG at `dpi`, for section 11's certificates. Inside
 * the same `serialize` chain as the conversion (one soffice at a time), with one temporary
 * directory and the process's profile: pdfjs reads the page count and each page's size, then per page
 * soffice cuts a one-page PDF (`PageRange`) and exports it as PNG at the page's size in
 * points x dpi / 72. A throw (unreadable PDF, soffice failure or timeout) leaves nothing
 * behind; the caller prints the placeholder.
 */
/** A certificate longer than this is refused (two soffice runs per page would hold the one queue for minutes). */
export const MAX_CERTIFICATE_PAGES = 20;

export function rasterizePdfPages(pdf: Buffer, options: RasterizeOptions): Promise<Buffer[]> {
  return serialize(async () => {
    const sizes = await readPageSizes(pdf);
    if (sizes.length > MAX_CERTIFICATE_PAGES) throw new LibreOfficeFailedError(`certificate has ${sizes.length} pages, more than ${MAX_CERTIFICATE_PAGES}`);
    const dpi = options.dpi ?? 150;
    const perRun = options.timeoutMs ?? DEFAULT_CONVERT_TIMEOUT_MS;
    const deadline = options.deadline ?? Number.POSITIVE_INFINITY;
    /** This run's timeout: the per-run one, capped by what is left of the budget. */
    const timeoutMs = (): number => {
      const left = deadline - Date.now();
      if (left <= 0) throw new LibreOfficeTimeoutError('certificate rasterization exceeded its budget');
      return Math.min(perRun, left);
    };
    const dir = await mkdtemp(join(tmpdir(), `rasterize-${options.jobId}-`));
    try {
      const input = join(dir, 'certificado.pdf');
      await writeFile(input, pdf);
      const pages: Buffer[] = [];
      for (const [index, size] of sizes.entries()) {
        const page = index + 1;
        const pageDir = join(dir, `page-${page}`);
        const pngDir = join(dir, `png-${page}`);
        await mkdir(pageDir);
        await mkdir(pngDir);
        await runWithProfile(['--infilter=draw_pdf_import', '--convert-to', pageRangeFilter(page), '--outdir', pageDir, input], timeoutMs());
        const onePage = join(pageDir, 'certificado.pdf');
        const width = Math.max(1, Math.round((size.width * dpi) / 72));
        const height = Math.max(1, Math.round((size.height * dpi) / 72));
        await runWithProfile(['--infilter=draw_pdf_import', '--convert-to', pngSizeFilter(width, height), '--outdir', pngDir, onePage], timeoutMs());
        try {
          pages.push(await readFile(join(pngDir, 'certificado.png')));
        } catch {
          throw new LibreOfficeFailedError(`soffice exited without writing page ${page} as PNG`);
        }
      }
      return pages;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
}
