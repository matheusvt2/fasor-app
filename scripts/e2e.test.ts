import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NON_SERIAL_SPEC_PATTERN, SERIAL_SPEC_PATTERN, SERIAL_SPECS } from '../e2e/support/groups.ts';
import { groupArgs, summarize, withoutWorkers } from './e2e.ts';

/*
 * E6-Q7: the e2e grouping and its runner. The Playwright run itself is `test:e2e`; these
 * pin what can be checked without a browser: the argument handling, the report counting,
 * which specs the serial group holds, and that no spec names a fixed company, user or
 * e-mail (each takes its worker's pair from the `seed` fixture).
 */

const root = resolve(import.meta.dirname, '..');
const e2eDir = join(root, 'e2e');

function e2eFiles(dir = e2eDir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return e2eFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('scripts/e2e.ts arguments', () => {
  it('passes every argument to the parallel group, --workers included', () => {
    expect(groupArgs('parallel', ['--grep', '@p0', '--workers=1'])).toEqual(['playwright', 'test', '--pass-with-no-tests', '--grep', '@p0', '--workers=1']);
  });

  it('runs the serial group on one worker whatever --workers says', () => {
    expect(withoutWorkers(['--workers=3', '--grep', '@p0', '--workers', '2', '-j', '4', '-j5', '--project', 'x'])).toEqual(['--grep', '@p0', '--project', 'x']);
    expect(groupArgs('serial', ['--project', 'desktop-chrome', '--workers=3'])).toEqual([
      'playwright',
      'test',
      '--pass-with-no-tests',
      '--project',
      'desktop-chrome',
      '--workers=1',
    ]);
  });
});

describe('scripts/e2e.ts summary', () => {
  const report = {
    stats: { startTime: '2026-09-25T10:00:00.000Z', duration: 1234 },
    errors: [],
    suites: [
      {
        title: 'a.spec.ts',
        specs: [{ title: 'one', file: 'a.spec.ts', tests: [{ projectName: 'desktop-chrome', status: 'expected' as const }] }],
        suites: [
          {
            title: 'group',
            specs: [
              {
                title: 'two',
                file: 'a.spec.ts',
                tests: [
                  { projectName: 'desktop-chrome', status: 'unexpected' as const },
                  { projectName: 'durability-desktop-chrome', status: 'flaky' as const },
                ],
              },
              { title: 'three', file: 'a.spec.ts', tests: [{ projectName: 'desktop-chrome', status: 'skipped' as const }] },
            ],
          },
        ],
      },
    ],
  };

  it('counts each test once per project, by outcome, under its full title', () => {
    const summary = summarize('parallel', 1, report);
    expect(summary).toMatchObject({ tests: 4, passed: 1, failed: 1, skipped: 1, flaky: 1, durationMs: 1234, exitCode: 1 });
    expect(Object.keys(summary.results).sort()).toEqual([
      'desktop-chrome > a.spec.ts > group > three',
      'desktop-chrome > a.spec.ts > group > two',
      'desktop-chrome > a.spec.ts > one',
      'durability-desktop-chrome > a.spec.ts > group > two',
    ]);
  });

  it('treats a missing report as a failed group, even when Playwright exited 0', () => {
    expect(summarize('serial', 0, null)).toMatchObject({ exitCode: 1, tests: 0 });
  });
});

describe('the e2e groups', () => {
  const specs = e2eFiles().filter((path) => path.endsWith('.spec.ts'));

  it('lists only specs that exist, each with its reason', () => {
    const names = specs.map((path) => path.slice(e2eDir.length + 1));
    for (const spec of SERIAL_SPECS) {
      expect(names).toContain(spec.file);
      expect(spec.why.length).toBeGreaterThan(20);
    }
  });

  it('puts every spec in exactly one group', () => {
    for (const path of specs) expect(SERIAL_SPEC_PATTERN.test(path)).not.toBe(NON_SERIAL_SPEC_PATTERN.test(path));
  });

  it('keeps every spec that generates a document or loads the fixed-id fixture in the serial group', () => {
    const shared = /export-fixture|test-fixtures|seedPortoSeguroSmall|SMALL_FIXTURE_RELATORIO_ID|\/generate\b|generate-row/;
    for (const path of specs) {
      if (shared.test(readFileSync(path, 'utf8'))) expect(SERIAL_SPEC_PATTERN.test(path), path).toBe(true);
    }
  });

  it('never names a fixed test company, user or e-mail: every spec takes its pair from `seed`', () => {
    const fixed = /TEST_SEED|test-seed\.ts|@teste\.local|0a000000-|0b000000-|e2e00000-/;
    const offenders = e2eFiles().filter((path) => fixed.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
