import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { convertToPdf, LibreOfficeFailedError, LibreOfficeTimeoutError } from './libreoffice.ts';

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
