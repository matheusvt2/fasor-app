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
 * exits non-zero when either failed (or when neither found a test).
 *
 * `--workers=N` reaches the parallel group only; the serial group always runs on one.
 * After both, it writes `test-results/e2e-report/summary.json` (per group and in total:
 * tests, passed, failed, skipped, flaky, duration, and every test's title with its
 * outcome) and prints the totals, so runs can be compared title by title.
 */

const root = resolve(import.meta.dirname, '..');
const REPORT_DIR = resolve(root, 'test-results/e2e-report');

type Outcome = 'expected' | 'unexpected' | 'flaky' | 'skipped';

interface JsonTest {
  projectName: string;
  status: Outcome;
}
interface JsonSpec {
  title: string;
  file: string;
  tests: JsonTest[];
}
interface JsonSuite {
  title: string;
  specs?: JsonSpec[];
  suites?: JsonSuite[];
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

function collect(suite: JsonSuite, path: string[], into: Record<string, Outcome>): void {
  const here = suite.title === '' ? path : [...path, suite.title];
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) into[[test.projectName, ...here, spec.title].join(' > ')] = test.status;
  }
  for (const child of suite.suites ?? []) collect(child, here, into);
}

/** Reads one group's JSON report into its summary; a missing report counts as a failure. */
export function summarize(group: E2eGroup, exitCode: number, report: JsonReport | null): GroupSummary {
  const results: Record<string, Outcome> = {};
  for (const suite of report?.suites ?? []) collect(suite, [], results);
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
  };
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
  // A report left by an earlier run must not stand in for this one.
  let report: JsonReport | null = null;
  if (existsSync(reportFile)) {
    const parsed = JSON.parse(readFileSync(reportFile, 'utf8')) as JsonReport;
    const start = parsed.stats?.startTime === undefined ? 0 : Date.parse(parsed.stats.startTime);
    if (start >= started - 1_000) report = parsed;
  }
  return summarize(group, exitCode, report);
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
  const parallel = runGroup('parallel', args);
  const serial = runGroup('serial', args);
  const groups = [parallel, serial];

  const results = { ...parallel.results, ...serial.results };
  const total = {
    tests: parallel.tests + serial.tests,
    passed: parallel.passed + serial.passed,
    failed: parallel.failed + serial.failed,
    skipped: parallel.skipped + serial.skipped,
    flaky: parallel.flaky + serial.flaky,
    durationMs: Date.now() - started,
  };
  const failed = groups.some((group) => group.exitCode !== 0) || total.tests === 0;
  const summary = { args, exitCode: failed ? 1 : 0, total, groups, titles: Object.keys(results).sort() };
  const summaryFile = resolve(REPORT_DIR, 'summary.json');
  mkdirSync(dirname(summaryFile), { recursive: true });
  writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);

  console.log('\n[e2e] summary');
  for (const group of groups) {
    console.log(`[e2e]   ${group.group}: exit ${group.exitCode}, ${line(group)}`);
    for (const error of group.errors) console.log(`[e2e]     error: ${error.split('\n')[0]}`);
  }
  console.log(`[e2e]   total: ${line(total)} (wall time, build included)`);
  if (total.tests === 0) console.log('[e2e]   no group found a test');
  console.log(`[e2e]   report: ${summaryFile}`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
