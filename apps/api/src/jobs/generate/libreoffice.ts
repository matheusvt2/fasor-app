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

/**
 * Converts a DOCX to PDF with LibreOffice headless: its own temporary directory, a per-job
 * `-env:UserInstallation` profile, the process killed on timeout, the directory removed in
 * every case. The input is always the job's own DOCX (AD-15).
 */
export function convertToPdf(docx: Buffer, options: ConvertOptions): Promise<Buffer> {
  return serialize(async () => {
    if (options.fault === 'libreoffice_timeout') throw new LibreOfficeTimeoutError('fault injected: libreoffice_timeout');
    const dir = await mkdtemp(join(tmpdir(), `generate-${options.jobId}-`));
    try {
      const input = join(dir, 'relatorio.docx');
      await writeFile(input, docx);
      await runSoffice(dir, ['--convert-to', 'pdf', '--outdir', dir, input], options.timeoutMs ?? DEFAULT_CONVERT_TIMEOUT_MS);
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

/** One headless soffice run with the directory's own profile; `args` follow the fixed profile flags. */
function runSoffice(dir: string, args: readonly string[], timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const profile = pathToFileURL(join(dir, 'profile')).href;
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
  /** Default 150 (Story 7.3: certificates print at 150 dpi). */
  dpi?: number;
}

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
 * directory and one profile: pdfjs reads the page count and each page's size, then per page
 * soffice cuts a one-page PDF (`PageRange`) and exports it as PNG at the page's size in
 * points x dpi / 72. A throw (unreadable PDF, soffice failure or timeout) leaves nothing
 * behind; the caller prints the placeholder.
 */
export function rasterizePdfPages(pdf: Buffer, options: RasterizeOptions): Promise<Buffer[]> {
  return serialize(async () => {
    const sizes = await readPageSizes(pdf);
    const dpi = options.dpi ?? 150;
    const timeoutMs = options.timeoutMs ?? DEFAULT_CONVERT_TIMEOUT_MS;
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
        await runSoffice(dir, ['--infilter=draw_pdf_import', '--convert-to', pageRangeFilter(page), '--outdir', pageDir, input], timeoutMs);
        const onePage = join(pageDir, 'certificado.pdf');
        const width = Math.max(1, Math.round((size.width * dpi) / 72));
        const height = Math.max(1, Math.round((size.height * dpi) / 72));
        await runSoffice(dir, ['--infilter=draw_pdf_import', '--convert-to', pngSizeFilter(width, height), '--outdir', pngDir, onePage], timeoutMs);
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
