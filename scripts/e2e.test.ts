import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import type { E2eLeak } from '../apps/api/src/db/e2e-leak-check.ts';
import { assertNoLeaks } from '../e2e/support/global-teardown.ts';
import { assertWorkersAllowed, NON_SERIAL_SPEC_PATTERN, SERIAL_SPEC_PATTERN, SERIAL_SPECS, type E2eGroup } from '../e2e/support/groups.ts';
import playwrightConfig from '../playwright.config.ts';
import {
  combine,
  groupArgs,
  PLAYWRIGHT_TEST_OPTIONS,
  readReport,
  runBothGroups,
  specFilters,
  summarize,
  unmatchedFilters,
  withoutWorkers,
  type GroupSummary,
  type OptionArity,
} from './e2e.ts';

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

/** The part of Commander's API this file reads from Playwright's own `test` command. */
interface CommanderOption {
  short?: string;
  long?: string;
  required: boolean;
  optional: boolean;
  variadic: boolean;
}
interface CommanderCommand {
  name(): string;
  options: CommanderOption[];
  commands: CommanderCommand[];
  exitOverride(): CommanderCommand;
  parseOptions(argv: string[]): { operands: string[]; unknown: string[] };
}

/** The installed Playwright's `playwright test` command, as its CLI defines it. */
function playwrightTestCommand(): CommanderCommand {
  const fromPlaywrightTest = createRequire(createRequire(import.meta.url).resolve('@playwright/test'));
  const { program } = fromPlaywrightTest('playwright/lib/program') as { program: CommanderCommand };
  const command = program.commands.find((candidate) => candidate.name() === 'test');
  if (command === undefined) throw new Error('playwright has no test command');
  return command.exitOverride();
}

/** The file filters Playwright itself takes from `argv`: Commander's operands, less what follows `--`. */
function playwrightFilters(command: CommanderCommand, argv: string[]): string[] {
  const { operands } = command.parseOptions(argv);
  const dash = argv.indexOf('--');
  return dash < 0 ? operands : operands.slice(0, operands.length - (argv.length - 1 - dash));
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
    locations: tests === 0 ? [] : [{ file: `${name}.spec.ts`, line: 3, column: 1 }],
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
    // A run whose every test was skipped ran nothing either (review 2026-10-08, PR #116).
    const skippedOnly = { ...group('parallel', 0, 2), passed: 0, skipped: 2, files: [], locations: [] };
    expect(combine([skippedOnly, group('serial', 0, 0)], 5).exitCode).toBe(1);
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

  // Review 2026-10-08 (PR #116): the value of an option the runner did not list was read as
  // a spec path, so a green run of `e2e/x.spec.ts --update-snapshots all` exited 1 on "all".
  it('never reads the value of any value-taking Playwright option as a spec path', () => {
    const options: [string, string][] = [
      ['--update-snapshots', 'all'],
      ['-u', 'missing'],
      ['--only-changed', 'main'],
      ['--test-list', 'tests.txt'],
      ['--test-list-invert', 'skip.txt'],
      ['--ui-port', '0'],
      ['--ui-host', '0.0.0.0'],
      ['--update-source-method', 'patch'],
      ['--browser', 'chromium'],
      ['-G', '@p2'],
      ['--add-reporter', 'dot'],
      ['--last-failed-file', 'last.json'],
      ['--run-agents', 'none'],
      ['--debug', 'cli'],
    ];
    for (const [option, value] of options) {
      expect(specFilters(['e2e/x.spec.ts', option, value]), option).toEqual(['e2e/x.spec.ts']);
      expect(specFilters([option, value, 'e2e/x.spec.ts']), option).toEqual(['e2e/x.spec.ts']);
    }
  });

  it('reads the option forms as Commander does: optional, variadic, grouped, inline, after `--`, unknown', () => {
    // An optional value is taken only when the next argument is not an option.
    expect(specFilters(['--only-changed', '--headed', 'e2e/a.spec.ts'])).toEqual(['e2e/a.spec.ts']);
    expect(specFilters(['e2e/a.spec.ts', '-u'])).toEqual(['e2e/a.spec.ts']);
    // `--project` takes every argument up to the next option, a path after it included.
    expect(specFilters(['--project', 'desktop-chrome', 'durability-desktop-chrome', '--headed', 'e2e/c.spec.ts'])).toEqual(['e2e/c.spec.ts']);
    expect(specFilters(['e2e/a.spec.ts', '--project', 'x', 'e2e/b.spec.ts'])).toEqual(['e2e/a.spec.ts']);
    expect(specFilters(['--project=x', 'e2e/b.spec.ts'])).toEqual(['e2e/b.spec.ts']);
    // A required value is taken even when it starts with a dash.
    expect(specFilters(['--grep', '-x', 'e2e/a.spec.ts'])).toEqual(['e2e/a.spec.ts']);
    // Grouped short flags and an inline value.
    expect(specFilters(['-xj4', 'e2e/a.spec.ts', '-xj', '2', 'e2e/b.spec.ts', '-uall'])).toEqual(['e2e/a.spec.ts', 'e2e/b.spec.ts']);
    expect(specFilters(['--update-snapshots=all', 'e2e/a.spec.ts'])).toEqual(['e2e/a.spec.ts']);
    // Playwright drops what follows `--`; after an unknown option nothing is a filter.
    expect(specFilters(['e2e/a.spec.ts', '--', 'e2e/b.spec.ts'])).toEqual(['e2e/a.spec.ts']);
    expect(specFilters(['e2e/a.spec.ts', '--no-such-option', 'e2e/b.spec.ts'])).toEqual(['e2e/a.spec.ts']);
    // A lone dash and a negative number are operands, as in Commander.
    expect(specFilters(['-', '-1', '--retries', '-1', 'e2e/a.spec.ts'])).toEqual(['-', '-1', 'e2e/a.spec.ts']);
  });

  it("knows every option of the installed Playwright's test command, with how it reads its value", () => {
    const fromPlaywright = new Map<string, OptionArity>();
    for (const option of playwrightTestCommand().options) {
      const arity: OptionArity = option.variadic ? 'variadic' : option.required ? 'required' : option.optional ? 'optional' : 'flag';
      for (const flag of [option.short, option.long]) if (flag !== undefined) fromPlaywright.set(flag, arity);
    }
    expect(Object.fromEntries([...PLAYWRIGHT_TEST_OPTIONS].sort())).toEqual(Object.fromEntries([...fromPlaywright].sort()));
  });

  it("takes from each command line the very filters Playwright's own parser takes", () => {
    const command = playwrightTestCommand();
    for (const argv of [
      ['e2e/a.spec.ts', '--project', 'desktop-chrome', '--project', 'durability-desktop-chrome'],
      ['e2e/a.spec.ts', '--update-snapshots', 'all', 'e2e/b.spec.ts:12'],
      ['--only-changed', 'main', 'e2e/a.spec.ts'],
      ['--only-changed', '--headed', 'e2e/a.spec.ts'],
      ['--test-list', 'tests.txt', '--ui-port', '0', '--ui-host', 'localhost', 'e2e/a.spec.ts'],
      ['e2e/a.spec.ts', '--project', 'x', 'e2e/b.spec.ts', '--headed', 'e2e/c.spec.ts'],
      ['--project=x', 'e2e/b.spec.ts'],
      ['--grep', '-x', 'e2e/a.spec.ts'],
      ['-xj4', 'e2e/a.spec.ts', '-xj', '2', 'e2e/b.spec.ts', '-uall'],
      ['-G', '@p2', '--update-snapshots=missing', 'e2e/a.spec.ts', '--debug', 'cli'],
      ['e2e/a.spec.ts', '--', 'e2e/b.spec.ts'],
      ['e2e/a.spec.ts', '--no-such-option', 'e2e/b.spec.ts'],
      ['-', '-1', '--retries', '-1', 'e2e/a.spec.ts'],
      ['--browser', 'chromium', '--repeat-each=5', '--workers', '2', '--trace', 'on', 'e2e/a.spec.ts'],
    ]) {
      expect(specFilters(argv), argv.join(' ')).toEqual(playwrightFilters(command, argv));
    }
  });

  it("matches a path as Playwright does: a case-insensitive pattern on the absolute path, a :line[:column] on a test or describe, /re/ literal", () => {
    const ran = [
      { file: 'journey-taps.spec.ts', line: 155, column: 1 },
      { file: 'lost-taps.durability.spec.ts', line: 285, column: 3 },
      { file: 'lost-taps.durability.spec.ts', line: 40, column: 1 },
    ];
    expect(
      unmatchedFilters(
        ['e2e/journey-taps.spec.ts', 'journey-taps', 'e2e/Journey-Taps.spec.ts:155', 'e2e/lost-taps.durability.spec.ts:285:3', 'e2e/lost-taps.durability.spec.ts:40', '/lost-taps\\.durability/'],
        ran,
        '/w/e2e',
      ),
    ).toEqual([]);
    expect(unmatchedFilters(['e2e/journey-tap.spec.ts', 'e2e/journey-forward.spec.ts', '/^journey/'], ran, '/w/e2e')).toEqual([
      'e2e/journey-tap.spec.ts',
      'e2e/journey-forward.spec.ts',
      '/^journey/',
    ]);
  });

  // Review 2026-10-08 (PR #116): a `:line` was dropped, so a mistyped line passed whenever
  // another path ran a test of the same file.
  it('fails a :line no test of that file starts on, even when another test of the file ran', () => {
    const ran = [{ file: 'a.spec.ts', line: 12, column: 1 }];
    expect(unmatchedFilters(['e2e/a.spec.ts:12', 'e2e/a.spec.ts:999', 'e2e/a.spec.ts:12:7'], ran, '/w/e2e')).toEqual(['e2e/a.spec.ts:999', 'e2e/a.spec.ts:12:7']);
  });

  it('collects the spec file and the location of every test a group ran, with the describes around it, and no skipped test', () => {
    const report = {
      stats: { startTime: '2026-10-08T10:00:00.000Z', duration: 1 },
      suites: [
        {
          title: 'a.spec.ts',
          file: 'a.spec.ts',
          line: 0,
          column: 0,
          specs: [{ title: 'one', file: 'a.spec.ts', line: 5, column: 1, tests: [{ projectName: 'p', status: 'expected' as const }] }],
          suites: [
            {
              title: 'group',
              file: 'a.spec.ts',
              line: 9,
              column: 1,
              specs: [{ title: 'two', file: 'a.spec.ts', line: 10, column: 3, tests: [{ projectName: 'p', status: 'unexpected' as const }] }],
            },
          ],
        },
        { title: 'b.spec.ts', specs: [{ title: 'two', file: 'b.spec.ts', tests: [] }] },
        // Review 2026-10-08 (PR #116): a spec whose every test was skipped ran nothing.
        { title: 'c.spec.ts', specs: [{ title: 'capture', file: 'c.spec.ts', line: 30, column: 1, tests: [{ projectName: 'p', status: 'skipped' as const }] }] },
      ],
    };
    const summary = summarize('parallel', 0, report);
    expect(summary.files).toEqual(['a.spec.ts']);
    expect(summary.locations).toEqual([
      { file: 'a.spec.ts', line: 5, column: 1 },
      { file: 'a.spec.ts', line: 10, column: 3 },
      { file: 'a.spec.ts', line: 9, column: 1 },
    ]);
    expect(combine([summary], 1, ['e2e/c.spec.ts', 'e2e/a.spec.ts:9'], '/w/e2e')).toMatchObject({ exitCode: 1, unmatched: ['e2e/c.spec.ts'] });
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

describe('the e2e lint rules (TST-V1)', () => {
  // Review 2026-10-08 (PR #116): the review asked for `no-wait-for-timeout` as a warning
  // with an allow-list beside the two gate rules; it had been left out.
  it('refuses a focused test and an unawaited action, and warns on a fixed wait outside the allow-list', async () => {
    const eslint = new ESLint({ cwd: root });
    const severity = async (file: string, rule: string) => ((await eslint.calculateConfigForFile(join(root, file))) as { rules?: Record<string, unknown[]> }).rules?.[rule]?.[0];
    for (const file of ['e2e/ficha.spec.ts', 'e2e/support/sync.ts']) {
      expect(await severity(file, 'playwright/no-focused-test'), file).toBe(2);
      expect(await severity(file, 'playwright/missing-playwright-await'), file).toBe(2);
      expect(await severity(file, 'playwright/no-wait-for-timeout'), file).toBe(1);
    }
    for (const file of ['e2e/support/taps.ts', 'e2e/lost-taps.durability.spec.ts']) {
      expect(await severity(file, 'playwright/no-wait-for-timeout'), file).toBe(0);
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
