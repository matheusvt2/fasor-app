import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Only proves the binary is installed; document generation arrives in a later epic. */
export async function probeLibreOffice(): Promise<void> {
  await run('soffice', ['--version'], { timeout: 2500 });
}
