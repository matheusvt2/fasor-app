import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { E2eGroup } from '../e2e/support/groups.ts';

/**
 * E6-Q7: the one entry of every e2e command (`test:e2e`, `test:e2e:full`,
 * `test:e2e:matrix`). It builds the web bundle once, then runs the parallel group and,
 * after it has ended, the serial group (`e2e/support/groups.ts`), each as its own
 * Playwright run with the same arguments, so a serial spec never runs beside a parallel
 * worker. Both groups always run: a failure in one never skips the other, and the command
 * exits non-zero when either failed (or when neither ran a test).
 *
 * `--workers=N` reaches the parallel group only; the serial group always runs on one.
 * After both, it writes `test-results/e2e-report/summary.json` (per group and in total:
 * tests, passed, failed, skipped, flaky, duration, and every test's title with its
 * outcome) and prints the totals, so runs can be compared title by title.
 *
 * TST-V1 (review 2026-10-08): each group runs with `--pass-with-no-tests`, because a spec
 * path of the serial group matches nothing in the parallel group and the other way round.
 * So the command checks the spec paths itself: a spec path (an argument Playwright reads as
 * a file filter, `specFilters`) on which no test ran in either group fails the run, so a
 * typo, a spec whose every test skipped or a `:line` no test starts on can no longer turn
 * a story gate green on the other paths alone.
 */

const root = resolve(import.meta.dirname, '..');
const REPORT_DIR = resolve(root, 'test-results/e2e-report');
/** Playwright's `testDir`: the JSON report names each spec file relative to it. */
const E2E_DIR = resolve(root, 'e2e');

type Outcome = 'expected' | 'unexpected' | 'flaky' | 'skipped';

interface JsonTest {
  projectName: string;
  status: Outcome;
}
interface JsonSpec {
  title: string;
  file: string;
  line?: number;
  column?: number;
  tests: JsonTest[];
}
interface JsonSuite {
  title: string;
  file?: string;
  line?: number;
  column?: number;
  specs?: JsonSpec[];
  suites?: JsonSuite[];
}

/** Where a test or a describe sits: its spec file, relative to `e2e/`, and its call's line and column. */
export interface SpecLocation {
  file: string;
  line: number;
  column: number;
}
interface JsonReport {
  suites?: JsonSuite[];
  errors?: { message?: string }[];
  stats?: { startTime: string; duration: number };
}

export interface GroupSummary {
  group: E2eGroup;
  exitCode: number;
  startTime: string | null;
  durationMs: number;
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  /** `project > file > describe... > title` -> outcome, one entry per test. */
  results: Record<string, Outcome>;
  /** Errors outside any test (global setup or teardown, a file that failed to load). */
  errors: string[];
  /** Every spec file at least one test of this group ran (a skipped test does not count), relative to `e2e/`. */
  files: string[];
  /** Each test this group ran and every describe around it, for the `:line` spec paths. */
  locations: SpecLocation[];
}

/** How an option reads its value: none, the next argument, the next unless it is an option, or as many as are not options. */
export type OptionArity = 'flag' | 'required' | 'optional' | 'variadic';

/**
 * Every option of `playwright test` (Playwright 1.63, `testOptions` in
 * `playwright/lib/program.js`) with the way its parser, Commander, reads its value, so a
 * value (`--project x`, `--update-snapshots all`, `--only-changed main`) is never taken for
 * a spec path. A `scripts/e2e.test.ts` test compares this table with the installed
 * Playwright's own option list, so an upgrade that adds or changes one fails `test:unit`.
 */
export const PLAYWRIGHT_TEST_OPTIONS: ReadonlyMap<string, OptionArity> = new Map<string, OptionArity>([
  ['--add-reporter', 'required'],
  ['--browser', 'required'],
  ['-c', 'required'],
  ['--config', 'required'],
  ['--debug', 'optional'],
  ['--fail-on-flaky-tests', 'flag'],
  ['--forbid-only', 'flag'],
  ['--fully-parallel', 'flag'],
  ['-g', 'required'],
  ['--grep', 'required'],
  ['-G', 'required'],
  ['--grep-invert', 'required'],
  ['--global-timeout', 'required'],
  ['--headed', 'flag'],
  ['--ignore-snapshots', 'flag'],
  ['-j', 'required'],
  ['--workers', 'required'],
  ['--last-failed', 'flag'],
  ['--last-failed-file', 'required'],
  ['--list', 'flag'],
  ['--max-failures', 'required'],
  ['--no-deps', 'flag'],
  ['--only-changed', 'optional'],
  ['--output', 'required'],
  ['--pass-with-no-tests', 'flag'],
  ['--project', 'variadic'],
  ['--quiet', 'flag'],
  ['--repeat-each', 'required'],
  ['--reporter', 'required'],
  ['--retries', 'required'],
  ['--run-agents', 'required'],
  ['--shard', 'required'],
  ['--test-list', 'required'],
  ['--test-list-invert', 'required'],
  ['--timeout', 'required'],
  ['--trace', 'required'],
  ['--tsconfig', 'required'],
  ['-u', 'optional'],
  ['--update-snapshots', 'optional'],
  ['--ui', 'flag'],
  ['--ui-host', 'required'],
  ['--ui-port', 'required'],
  ['--update-source-method', 'required'],
  ['-x', 'flag'],
]);

/** Commander's test for an option word: a dash and more, unless it is a negative number. */
function isOptionWord(arg: string): boolean {
  return arg.length > 1 && arg.startsWith('-') && !/^-(\d+|\d*\.\d+)(e[+-]?\d+)?$/.test(arg);
}

/**
 * The spec paths of an e2e command: the arguments Playwright reads as its file filters.
 * Walks the arguments as Commander does for `playwright test`: an option that requires a
 * value takes the next argument whatever it is; an optional value (`-u`, `--only-changed`,
 * `--debug`) is the next argument unless that is an option; `--project` takes the next
 * argument and every later one up to an option; `--name=value` and `-j4` carry their own
 * value, and grouped short flags (`-xj4`) are read one by one. Playwright drops what
 * follows `--` from its filters, and an unknown option makes Commander classify every later
 * argument as unknown (Playwright then refuses the run), so neither yields a spec path.
 */
export function specFilters(args: readonly string[]): string[] {
  const filters: string[] = [];
  const rest = [...args];
  let variadic = false;
  while (rest.length > 0) {
    const arg = rest.shift()!;
    if (arg === '--') break;
    if (variadic && !isOptionWord(arg)) continue;
    variadic = false;
    if (!isOptionWord(arg)) {
      filters.push(arg);
      continue;
    }
    const arity = PLAYWRIGHT_TEST_OPTIONS.get(arg);
    if (arity !== undefined) {
      if (arity === 'required' || arity === 'variadic') rest.shift();
      if (arity === 'optional' && rest.length > 0 && !isOptionWord(rest[0]!)) rest.shift();
      variadic = arity === 'variadic';
      continue;
    }
    if (arg.length > 2 && arg[1] !== '-') {
      const short = PLAYWRIGHT_TEST_OPTIONS.get(arg.slice(0, 2));
      if (short === 'flag') rest.unshift(`-${arg.slice(2)}`);
      if (short !== undefined) continue;
    }
    const equals = /^(--[^=]+)=/.exec(arg);
    const long = equals === null ? undefined : PLAYWRIGHT_TEST_OPTIONS.get(equals[1]!);
    if (long !== undefined && long !== 'flag') continue;
    break;
  }
  return filters;
}

/**
 * The spec paths that matched no test the run ran. Mirrors Playwright's own reading of a
 * file filter (`createFiltersFromArguments`): `/re/flags` is a regular expression, anything
 * else a case-insensitive regular expression tested against the absolute path of each spec
 * file, and an optional `:line[:column]` suffix selects the test, or the describe, whose
 * call starts there. A path counts as matched only through a test that ran (not skipped):
 * a spec whose every test was skipped, or a `:line` on which no test ran, ran nothing.
 */
export function unmatchedFilters(filters: readonly string[], ran: readonly SpecLocation[], testDir: string): string[] {
  const located = ran.map((location) => ({ ...location, path: resolve(testDir, location.file) }));
  return filters.filter((filter) => {
    const parsed = /^(.*?):(\d+):?(\d+)?$/.exec(filter);
    const pattern = parsed ? parsed[1]! : filter;
    const line = parsed ? Number(parsed[2]) : null;
    const column = parsed?.[3] !== undefined ? Number(parsed[3]) : null;
    const literal = /^\/(.*)\/([gi]*)$/.exec(pattern);
    let matches: (path: string) => boolean;
    try {
      const re = literal ? new RegExp(literal[1]!, literal[2]!.replace('g', '')) : new RegExp(pattern, 'i');
      matches = (path) => re.test(path);
    } catch {
      // Not a valid pattern (Playwright refuses it as well): matched as plain text.
      matches = (path) => path.toLowerCase().includes(pattern.toLowerCase());
    }
    return !located.some((at) => matches(at.path) && (line === null || at.line === line) && (column === null || at.column === column));
  });
}

/** Drops every `--workers`/`-j` argument (with its value), for the serial group. */
export function withoutWorkers(args: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === '--workers' || arg === '-j') {
      i += 1;
      continue;
    }
    if (arg.startsWith('--workers=') || arg.startsWith('-j')) continue;
    out.push(arg);
  }
  return out;
}

/** The arguments each group's Playwright run gets. */
export function groupArgs(group: E2eGroup, args: readonly string[]): string[] {
  const base = ['playwright', 'test', '--pass-with-no-tests'];
  return group === 'parallel' ? [...base, ...args] : [...base, ...withoutWorkers(args), '--workers=1'];
}

/** A describe's location; a file's own suite (line 0) is not a describe a `:line` can name. */
function describeAt(suite: JsonSuite): SpecLocation[] {
  return suite.file !== undefined && suite.line !== undefined && suite.line > 0 ? [{ file: suite.file, line: suite.line, column: suite.column ?? 0 }] : [];
}

interface Collected {
  results: Record<string, Outcome>;
  files: Set<string>;
  locations: Map<string, SpecLocation>;
}

function collect(suite: JsonSuite, path: string[], around: readonly SpecLocation[], into: Collected): void {
  const here = suite.title === '' ? path : [...path, suite.title];
  const describes = [...around, ...describeAt(suite)];
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      into.results[[test.projectName, ...here, spec.title].join(' > ')] = test.status;
      // A skipped test ran nothing: it matches no spec path (review 2026-10-08, PR #116).
      if (test.status === 'skipped') continue;
      into.files.add(spec.file);
      for (const at of [{ file: spec.file, line: spec.line ?? 0, column: spec.column ?? 0 }, ...describes]) {
        into.locations.set(`${at.file}:${at.line}:${at.column}`, at);
      }
    }
  }
  for (const child of suite.suites ?? []) collect(child, here, describes, into);
}

/** Reads one group's JSON report into its summary; a missing report counts as a failure. */
export function summarize(group: E2eGroup, exitCode: number, report: JsonReport | null): GroupSummary {
  const collected: Collected = { results: {}, files: new Set(), locations: new Map() };
  for (const suite of report?.suites ?? []) collect(suite, [], [], collected);
  const { results, files, locations } = collected;
  const outcomes = Object.values(results);
  const count = (outcome: Outcome) => outcomes.filter((value) => value === outcome).length;
  return {
    group,
    exitCode: report === null && exitCode === 0 ? 1 : exitCode,
    startTime: report?.stats?.startTime ?? null,
    durationMs: report?.stats?.duration ?? 0,
    tests: outcomes.length,
    passed: count('expected'),
    failed: count('unexpected'),
    skipped: count('skipped'),
    flaky: count('flaky'),
    results,
    errors: (report?.errors ?? []).map((error) => error.message ?? String(error)),
    files: [...files].sort(),
    locations: [...locations.values()],
  };
}

/**
 * The report a group's run left, or null when there is none this run can trust: no file,
 * text that does not parse (a run killed mid-write), or a report that started before this
 * run did (left by an earlier run). `summarize` counts null as a failed group.
 */
export function readReport(text: string | null, runStartedMs: number): JsonReport | null {
  if (text === null) return null;
  let parsed: JsonReport;
  try {
    parsed = JSON.parse(text) as JsonReport;
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const start = parsed.stats?.startTime === undefined ? Number.NaN : Date.parse(parsed.stats.startTime);
  return Number.isFinite(start) && start >= runStartedMs - 1_000 ? parsed : null;
}

/** Runs the parallel group, then the serial group, always both, whatever the first one did. */
export function runBothGroups(runGroup: (group: E2eGroup) => GroupSummary): [GroupSummary, GroupSummary] {
  const parallel = runGroup('parallel');
  const serial = runGroup('serial');
  return [parallel, serial];
}

/**
 * The combined result: exit 1 when either group failed, neither ran a test (a skipped test
 * ran nothing), or a spec path of the command (`filters`) matched no test either group ran
 * (TST-V1).
 */
export function combine(groups: readonly GroupSummary[], durationMs: number, filters: readonly string[] = [], testDir = E2E_DIR) {
  const sum = (key: 'tests' | 'passed' | 'failed' | 'skipped' | 'flaky') => groups.reduce((total, group) => total + group[key], 0);
  const total = { tests: sum('tests'), passed: sum('passed'), failed: sum('failed'), skipped: sum('skipped'), flaky: sum('flaky'), durationMs };
  const results = Object.assign({}, ...groups.map((group) => group.results)) as Record<string, Outcome>;
  const unmatched = unmatchedFilters(filters, groups.flatMap((group) => group.locations), testDir);
  const failed = groups.some((group) => group.exitCode !== 0) || total.tests === total.skipped || unmatched.length > 0;
  return { exitCode: failed ? 1 : 0, total, titles: Object.keys(results).sort(), unmatched };
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): number {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  return result.status ?? 1;
}

function runGroup(group: E2eGroup, args: readonly string[]): GroupSummary {
  const reportFile = resolve(REPORT_DIR, `${group}.json`);
  const started = Date.now();
  console.log(`\n[e2e] ${group} group: playwright ${groupArgs(group, args).slice(1).join(' ')}`);
  const exitCode = run('pnpm', ['exec', ...groupArgs(group, args)], { ...process.env, E2E_GROUP: group, E2E_PREBUILT: '1' });
  let text: string | null;
  try {
    text = existsSync(reportFile) ? readFileSync(reportFile, 'utf8') : null;
  } catch {
    text = null;
  }
  return summarize(group, exitCode, readReport(text, started));
}

function line(summary: Pick<GroupSummary, 'tests' | 'passed' | 'failed' | 'skipped' | 'flaky' | 'durationMs'>): string {
  return `${summary.tests} tests: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped, ${summary.flaky} flaky, ${(summary.durationMs / 1000).toFixed(1)} s`;
}

function main(): void {
  const args = process.argv.slice(2);
  const started = Date.now();
  mkdirSync(REPORT_DIR, { recursive: true });

  console.log('[e2e] building the web bundle once for both groups (build:e2e)');
  if (run('pnpm', ['--filter', '@app/web', 'run', 'build:e2e'], process.env) !== 0) {
    console.error('[e2e] build:e2e failed; no group ran');
    process.exit(1);
  }

  // Sequential on purpose: the serial group starts only once the parallel run has exited.
  const groups = runBothGroups((group) => runGroup(group, args));
  const { exitCode, total, titles, unmatched } = combine(groups, Date.now() - started, specFilters(args));
  const failed = exitCode !== 0;
  const summary = { args, exitCode, total, groups, titles, unmatched };
  const summaryFile = resolve(REPORT_DIR, 'summary.json');
  mkdirSync(dirname(summaryFile), { recursive: true });
  writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);

  console.log('\n[e2e] summary');
  for (const group of groups) {
    console.log(`[e2e]   ${group.group}: exit ${group.exitCode}, ${line(group)}`);
    for (const error of group.errors) console.log(`[e2e]     error: ${error.split('\n')[0]}`);
  }
  console.log(`[e2e]   total: ${line(total)} (wall time, build included)`);
  if (total.tests === total.skipped) console.log('[e2e]   no group ran a test');
  for (const filter of unmatched) console.log(`[e2e]   spec path ran no test: ${filter}`);
  console.log(`[e2e]   report: ${summaryFile}`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
