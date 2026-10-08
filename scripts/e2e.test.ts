import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { E2eLeak } from '../apps/api/src/db/e2e-leak-check.ts';
import { assertNoLeaks } from '../e2e/support/global-teardown.ts';
import { assertWorkersAllowed, NON_SERIAL_SPEC_PATTERN, SERIAL_SPEC_PATTERN, SERIAL_SPECS, type E2eGroup } from '../e2e/support/groups.ts';
import playwrightConfig from '../playwright.config.ts';
import { combine, groupArgs, readReport, runBothGroups, specFilters, summarize, unmatchedFilters, withoutWorkers, type GroupSummary } from './e2e.ts';

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

/** Unit and e2e test files under `dir`, skipping dependencies and build output. */
function testFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return /\.(test|spec)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** A focused test or suite: `test.only(`, `it.only(`, `describe.only(`, `test.describe.only(`... */
const FOCUSED = /^(?!\s*\/\/).*\b(?:test|it|describe|suite|bench)(?:\.\w+)*\.only\s*\(/;

/** The id of each test call in a spec: `12.1-E2E-007`, `E5-A2-E2E-003`; a template id keeps its `${...}`. */
function testIds(source: string): string[] {
  const ids: string[] = [];
  for (const call of source.matchAll(/\btest(?:\.(?:skip|fixme|fail|slow|only))?\(\s*(['"`])([\s\S]*?)\1/g)) {
    const id = /[A-Za-z0-9][A-Za-z0-9.-]*-E2E-\d+(?:[a-z]\b)?(?:\$\{[^}]*\})?/.exec(call[2]!);
    if (id !== null) ids.push(id[0]);
  }
  return ids;
}

/** Every id that more than one test call carries, with the files that carry it. */
function duplicateTestIds(files: readonly string[]): string[] {
  const seen = new Map<string, string[]>();
  for (const file of files) {
    for (const id of testIds(readFileSync(file, 'utf8'))) seen.set(id, [...(seen.get(id) ?? []), file.slice(root.length + 1)]);
  }
  return [...seen].filter(([, where]) => where.length > 1).map(([id, where]) => `${id}: ${where.join(', ')}`);
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
    files: tests === 0 ? [] : [`${name}.spec.ts`],
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

  // TST-V1: each group runs with --pass-with-no-tests (a serial spec path matches nothing in
  // the parallel group), so a mistyped path used to leave a green run of the other paths.
  it('exits 1 when a spec path of the command matched no test in either group', () => {
    const groups = [group('parallel', 0, 2), group('serial', 0, 1)];
    expect(combine(groups, 5, ['e2e/parallel.spec.ts', 'e2e/serial.spec.ts'], '/w/e2e')).toMatchObject({ exitCode: 0, unmatched: [] });
    expect(combine(groups, 5, ['e2e/parallel.spec.ts', 'e2e/serail.spec.ts'], '/w/e2e')).toMatchObject({ exitCode: 1, unmatched: ['e2e/serail.spec.ts'] });
    // A path whose every test the grep left out is a path that matched no test too.
    expect(combine([group('parallel', 0, 1), group('serial', 0, 0)], 5, ['e2e/serial.spec.ts'], '/w/e2e')).toMatchObject({ exitCode: 1 });
  });
});

describe('scripts/e2e.ts spec paths (TST-V1)', () => {
  it('reads the positional arguments as spec paths, never an option or its value', () => {
    expect(
      specFilters(['e2e/a.spec.ts', '--project', 'desktop-chrome', '--grep', '@p0', '-g', 'x', '--workers=2', '--repeat-each', '5', 'e2e/b.spec.ts:12', '--headed', '-j', '3']),
    ).toEqual(['e2e/a.spec.ts', 'e2e/b.spec.ts:12']);
    expect(specFilters(['--grep', '@p0', '--project', 'desktop-chrome'])).toEqual([]);
  });

  it("matches a path as Playwright does: a case-insensitive pattern on the absolute path, a :line suffix dropped, /re/ literal", () => {
    const files = ['journey-taps.spec.ts', 'lost-taps.durability.spec.ts'];
    expect(unmatchedFilters(['e2e/journey-taps.spec.ts', 'journey-taps', 'e2e/Journey-Taps.spec.ts:155', 'e2e/lost-taps.durability.spec.ts:285:3', '/lost-taps\\.durability/'], files, '/w/e2e')).toEqual([]);
    expect(unmatchedFilters(['e2e/journey-tap.spec.ts', 'e2e/journey-forward.spec.ts', '/^journey/'], files, '/w/e2e')).toEqual([
      'e2e/journey-tap.spec.ts',
      'e2e/journey-forward.spec.ts',
      '/^journey/',
    ]);
  });

  it('collects the spec file of every test a group ran', () => {
    const report = {
      stats: { startTime: '2026-10-08T10:00:00.000Z', duration: 1 },
      suites: [
        { title: 'a.spec.ts', specs: [{ title: 'one', file: 'a.spec.ts', tests: [{ projectName: 'p', status: 'expected' as const }] }] },
        { title: 'b.spec.ts', specs: [{ title: 'two', file: 'b.spec.ts', tests: [] }] },
      ],
    };
    expect(summarize('parallel', 0, report).files).toEqual(['a.spec.ts']);
  });
});

describe('focused tests are refused (TST-V1)', () => {
  it('Playwright forbids a focused test (forbidOnly) in every run', () => {
    expect(playwrightConfig.forbidOnly).toBe(true);
  });

  it('no e2e or unit test file carries a focused test or suite', () => {
    const roots = ['e2e', 'apps', 'packages', 'scripts'].map((dir) => join(root, dir));
    const focused = roots
      .flatMap((dir) => testFiles(dir))
      // This file spells the focused forms out to test the scan itself.
      .filter((file) => file !== import.meta.filename)
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((text, index) => (FOCUSED.test(text) ? [`${file.slice(root.length + 1)}:${index + 1}`] : [])),
      );
    expect(focused).toEqual([]);
  });

  it('the scan sees each focused form', () => {
    for (const text of ["test.only('x', async () => {})", "  it.only('x', () => {})", 'describe.only(`x`, () => {})', "test.describe.only('x', () => {})", "it.concurrent.only('x', () => {})"]) {
      expect(FOCUSED.test(text), text).toBe(true);
    }
    for (const text of ["test.skip('x')", "// only('x')", "const only = 1", "await page.getByRole('button', { name: 'only' })"]) {
      expect(FOCUSED.test(text), text).toBe(false);
    }
  });
});

describe('e2e test ids (TST-V2)', () => {
  it('reads the id of each test call, a template id with its expression', () => {
    expect(testIds("test('@p0 12.1-E2E-007 lost tap', async () => {});\n  test(\n    `@p1 10.3-E2E-00${choice === 'Manter' ? 7 : 8} x`, async () => {});\ntest.skip('E5-A2-E2E-003 y', () => {});")).toEqual([
      '12.1-E2E-007',
      "10.3-E2E-00${choice === 'Manter' ? 7 : 8}",
      'E5-A2-E2E-003',
    ]);
  });

  it('gives every e2e test call its own id', () => {
    expect(duplicateTestIds(e2eFiles().filter((file) => file.endsWith('.spec.ts')))).toEqual([]);
  });
});

describe('tap-timing specs arrange their sync through the helper (TST-2)', () => {
  // `syncNow` waits until the tapped cycle is over; an inline "Sincronizar agora" click
  // that returns on `data-pending="0"` can return before the cycle ran, and the arrange
  // then races the taps the spec times.
  it('no spec that times a tap against a render clicks "Sincronizar agora" itself', () => {
    const tapSpecs = SERIAL_SPECS.filter((spec) => /^times (a|every) tap/.test(spec.why)).map((spec) => spec.file);
    expect(tapSpecs.length).toBeGreaterThan(0);
    const inline = tapSpecs.filter((file) => readFileSync(join(e2eDir, file), 'utf8').includes("name: 'Sincronizar agora'"));
    expect(inline).toEqual([]);
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

  it('keeps every spec that times a tap against a render in the serial group (test-speed batch)', () => {
    const timed = /humanTap|touchPressAcross|tapCounter/;
    for (const path of specs) {
      if (timed.test(readFileSync(path, 'utf8'))) expect(SERIAL_SPEC_PATTERN.test(path), path).toBe(true);
    }
  });

  it('never names a fixed test company, user or e-mail: every spec takes its pair from `seed`', () => {
    const fixed = /TEST_SEED|test-seed\.ts|@teste\.local|0a000000-|0b000000-|e2e00000-/;
    const offenders = e2eFiles().filter((path) => fixed.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
