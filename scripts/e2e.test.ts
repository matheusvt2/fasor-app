import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { E2eLeak } from '../apps/api/src/db/e2e-leak-check.ts';
import { assertNoLeaks } from '../e2e/support/global-teardown.ts';
import { assertWorkersAllowed, NON_SERIAL_SPEC_PATTERN, SERIAL_SPEC_PATTERN, SERIAL_SPECS, type E2eGroup } from '../e2e/support/groups.ts';
import playwrightConfig from '../playwright.config.ts';
import { combine, groupArgs, readReport, runBothGroups, summarize, withoutWorkers, type GroupSummary } from './e2e.ts';

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

  it('reads only a whole report of this run: a missing, corrupt or older one is null', () => {
    const runStarted = Date.parse('2026-09-25T10:00:00.000Z');
    const text = JSON.stringify(report);
    expect(readReport(text, runStarted)).toEqual(report);
    expect(readReport(null, runStarted)).toBeNull();
    expect(readReport(text.slice(0, text.length / 2), runStarted)).toBeNull();
    expect(readReport('null', runStarted)).toBeNull();
    expect(readReport(JSON.stringify({ ...report, stats: undefined }), runStarted)).toBeNull();
    expect(readReport(text, runStarted + 60_000)).toBeNull();
    // An unreadable report is a failed group, as a missing one is.
    expect(summarize('parallel', 0, readReport('{"suites": [', runStarted))).toMatchObject({ exitCode: 1 });
  });
});

describe('scripts/e2e.ts combining the groups', () => {
  const group = (name: E2eGroup, exitCode: number, tests: number): GroupSummary => ({
    group: name,
    exitCode,
    startTime: null,
    durationMs: 0,
    tests,
    passed: exitCode === 0 ? tests : tests - 1,
    failed: exitCode === 0 ? 0 : 1,
    skipped: 0,
    flaky: 0,
    results: Object.fromEntries(Array.from({ length: tests }, (_, i) => [`${name} > t${i}`, 'expected' as const])),
    errors: [],
  });

  it('runs the serial group after a failed parallel group, in that order', () => {
    const ran: E2eGroup[] = [];
    const groups = runBothGroups((name) => {
      ran.push(name);
      return group(name, name === 'parallel' ? 1 : 0, 2);
    });
    expect(ran).toEqual(['parallel', 'serial']);
    expect(combine(groups, 5).exitCode).toBe(1);
  });

  it('exits 1 when either group failed or no test ran, 0 only when both passed with tests', () => {
    expect(combine([group('parallel', 0, 2), group('serial', 0, 1)], 5)).toMatchObject({
      exitCode: 0,
      total: { tests: 3, passed: 3, failed: 0, durationMs: 5 },
      titles: ['parallel > t0', 'parallel > t1', 'serial > t0'],
    });
    expect(combine([group('parallel', 0, 2), group('serial', 1, 1)], 5).exitCode).toBe(1);
    expect(combine([group('parallel', 1, 2), group('serial', 0, 1)], 5).exitCode).toBe(1);
    expect(combine([group('parallel', 0, 0), group('serial', 0, 0)], 5).exitCode).toBe(1);
  });
});

describe('the e2e run guards', () => {
  it('refuses more than one worker outside the parallel group', () => {
    expect(() => assertWorkersAllowed('parallel', 3)).not.toThrow();
    expect(() => assertWorkersAllowed('serial', 1)).not.toThrow();
    expect(() => assertWorkersAllowed(undefined, 1)).not.toThrow();
    expect(() => assertWorkersAllowed('serial', 2)).toThrow(/pnpm test:e2e/);
    expect(() => assertWorkersAllowed(undefined, 3)).toThrow(/without E2E_GROUP.*one worker/);
  });

  it('keeps the leak check registered as the global teardown, and it fails on a leak', async () => {
    expect(playwrightConfig.globalTeardown).toBe('./e2e/support/global-teardown.ts');
    expect(existsSync(resolve(root, 'e2e/support/global-teardown.ts'))).toBe(true);
    const leak: E2eLeak = { table: 'ops', companyId: 'c', userId: 'u', what: 'probe/x' };
    await expect(assertNoLeaks(async () => [])).resolves.toBeUndefined();
    await expect(assertNoLeaks(async () => [leak])).rejects.toThrow(/user u wrote probe\/x into company c/);
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
