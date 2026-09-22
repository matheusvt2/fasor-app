import { spawnSync } from 'node:child_process';
import { cpSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrationsFolder } from './migrate.ts';

/**
 * A schema edit without `pnpm db:generate` would pass every other gate and only fail at
 * runtime in a later story, because the migrator applies the committed SQL and never
 * looks at `schema.ts`. So: copy the committed migrations somewhere else, ask drizzle-kit
 * to generate against that copy, and assert it had nothing new to write.
 *
 * Two drizzle-kit 0.31 behaviours shape this test: `--out` is resolved relative to the
 * cwd (so the scratch folder has to live inside the package and be passed as a relative
 * path), and the CLI exits 0 even when it fails outright — so the assertions are on the
 * generated file list and on stderr, never on the exit status alone.
 */

const apiRoot = resolve(import.meta.dirname, '../..');
const relativeOut = '.drizzle-check';
const workdir = resolve(apiRoot, relativeOut);

beforeAll(() => {
  rmSync(workdir, { recursive: true, force: true });
  cpSync(migrationsFolder, workdir, { recursive: true });
});

afterAll(() => {
  rmSync(workdir, { recursive: true, force: true });
});

function sqlFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

describe('committed migrations', () => {
  it('are up to date with schema.ts', () => {
    const before = sqlFiles(workdir);
    expect(before.length).toBeGreaterThan(0);

    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'drizzle-kit',
        'generate',
        '--dialect',
        'postgresql',
        '--schema',
        './src/db/schema.ts',
        '--out',
        relativeOut,
      ],
      { cwd: apiRoot, encoding: 'utf8' },
    );
    const output = `${result.stdout}\n${result.stderr}`;
    // drizzle-kit exits 0 on a crash, so a broken invocation must not read as "no drift".
    expect(output, output).not.toMatch(/^Error:/m);

    expect(
      sqlFiles(workdir),
      `drizzle-kit wrote a new migration: schema.ts changed without "pnpm db:generate".\n${output}`,
    ).toEqual(before);
  }, 120_000);
});
