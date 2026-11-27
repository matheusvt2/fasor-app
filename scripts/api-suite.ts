import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PRINT_FILES, PRINT_PAIR } from '../apps/api/src/test-lanes.ts';

/**
 * Chore T4 (2026-11-26, sprint-change-proposal-2026-11-04.md § 4.5): the one entry of the api
 * suite. `pnpm test:api` runs the four lanes of `apps/api/src/test-lanes.ts` as two phases of
 * Vitest runs (`suitePlan`):
 *
 * 1. three runs at the same time: `parallel` (project `api`, on `PARALLEL_WORKERS` workers, each on
 *    its own test pair), `serial` (project `api-serial`, one file at a time on the fixed pair) and
 *    `print` (project `api-print`, one file at a time on `PRINT_PAIR`); the last two spend most of
 *    their time waiting on the api's one LibreOffice, which orders their conversions (AD-15);
 * 2. `solo` (project `api-solo`), with nothing beside it.
 *
 * Both phases always run, and the command fails when any run failed or no run had a test file.
 * A run of the first phase keeps its output and prints it whole when it ends (never interleaved);
 * the solo run streams. Each run's output also lands in `test-results/api-suite/{run}.log`, and
 * the command ends with one line per run (verdict, test files, wall time) and the total. That is
 * the wave gate's form (`pnpm verify` calls it) and the default everywhere.
 *
 * `pnpm test:api:batch` is the batch gate's form: it leaves the print lane out when the batch
 * changed no path the print can depend on (`PRINT_TRIGGERS`). It reads the batch's changed files
 * from `API_CHANGED_FILES` (paths relative to the repository root, separated by new lines or
 * spaces), which the host fills from git, since a worktree's git directory is not mounted in the
 * tools container:
 *
 *   podman compose --profile tools run --rm --user node \
 *     -e API_CHANGED_FILES="$(git diff --name-only origin/main...HEAD; git diff --name-only HEAD; git ls-files --others --exclude-standard)" \
 *     tools pnpm test:api:batch
 *
 * When in doubt the print lane runs: no `API_CHANGED_FILES`, an empty list, or any path under a
 * trigger. Every other argument goes to each Vitest run unchanged (a file path narrows every run;
 * runs it matches nothing in pass, `--passWithNoTests`). The `@slow` name filter of the old
 * `test:fast` script stays (R-011: "the api tests except `@slow`"; no test carries the tag).
 */

const root = resolve(import.meta.dirname, '..');
const API_DIR = resolve(root, 'apps/api');
const LOG_DIR = resolve(root, 'test-results/api-suite');

/** The api suite's projects (`apps/api/vitest.config.ts`). */
export const API_PROJECTS = ['api', 'api-serial', 'api-print', 'api-solo'] as const;

/**
 * The paths a print can depend on, relative to the repository root: a path ending in `/` covers
 * everything under it. A batch that changed any of them runs the print lane. They are the render
 * code with its goldens, every file the print lane's tests and the render code import
 * (transitively, through `@app/domain` by name: `scripts/api-suite.test.ts` computes that closure
 * and fails when a file of it is not covered here), the files that start the api's generate worker,
 * the api image (LibreOffice and its fonts), the dependency manifests, and the lane machinery.
 * Measured 2026-11-26: the closure holds 264 of the kernel's 290 source files, so the whole
 * `packages/domain` is one trigger.
 */
export const PRINT_TRIGGERS: readonly string[] = [
  // The render code, its test support, its goldens, and the queue and entry that run it in the api.
  'apps/api/src/jobs/generate/',
  'apps/api/src/jobs/queue.ts',
  'apps/api/src/main.ts',
  // The kernel: print, seeds, fixtures and nearly every module the print reaches.
  'packages/domain/',
  // The api modules the render code and the print tests reach (the import closure, by directory).
  'apps/api/src/db/',
  'apps/api/src/sync/',
  'apps/api/src/storage/',
  'apps/api/src/auth/',
  'apps/api/src/email/',
  'apps/api/src/admin/password-links.ts',
  'apps/api/src/clock.ts',
  'apps/api/src/config.ts',
  'apps/api/src/ids.ts',
  'apps/api/src/log.ts',
  // The api image (LibreOffice, fonts), its compose service, and the dependency manifests (docx, pdfjs).
  'apps/api/Dockerfile',
  'docker-compose.yml',
  'apps/api/package.json',
  'pnpm-lock.yaml',
  // The lane machinery: a change here may move a file between lanes.
  'apps/api/vitest.config.ts',
  'apps/api/src/test-lanes.ts',
  'apps/api/src/test-setup/',
  'scripts/api-suite.ts',
  'package.json',
];

/** Whether `path` (repository-relative) falls under one of `triggers`. */
export function matchTrigger(path: string, triggers: readonly string[] = PRINT_TRIGGERS): string | null {
  const clean = path.trim().replace(/^\.\//, '');
  for (const trigger of triggers) {
    if (trigger.endsWith('/') ? clean.startsWith(trigger) : clean === trigger) return trigger;
  }
  return null;
}

/** `API_CHANGED_FILES` as a list; `undefined` when the variable is unset. */
export function parseChangedFiles(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  return raw
    .split(/\s+/)
    .map((path) => path.trim())
    .filter((path) => path !== '');
}

export interface PrintLaneDecision {
  run: boolean;
  reason: string;
}

/** Whether the batch gate runs the print lane: yes unless a non-empty change list touches no trigger. */
export function printLaneDecision(changed: readonly string[] | undefined, triggers: readonly string[] = PRINT_TRIGGERS): PrintLaneDecision {
  if (changed === undefined) return { run: true, reason: 'API_CHANGED_FILES is unset, so the batch cannot tell what it changed' };
  if (changed.length === 0) return { run: true, reason: 'API_CHANGED_FILES is empty, so the batch cannot tell what it changed' };
  for (const path of changed) {
    const trigger = matchTrigger(path, triggers);
    if (trigger !== null) return { run: true, reason: `${path} is under ${trigger}` };
  }
  return { run: false, reason: `none of the ${changed.length} changed paths is under a print trigger` };
}

/** The command line split into `--batch` and what goes to Vitest. */
export function parseArgs(argv: readonly string[]): { batch: boolean; extra: string[] } {
  const extra = argv.filter((arg) => arg !== '--batch');
  return { batch: extra.length !== argv.length, extra };
}

/** One Vitest run of the suite: its name (for the log and the summary), its projects and the variables it adds. */
export interface SuiteRun {
  name: string;
  projects: string[];
  env?: Record<string, string>;
}

/**
 * The runs of one command, as phases: the runs of a phase start together, and a phase starts when
 * the one before has ended, whatever its result (every lane always runs). Phase 1 is the parallel
 * lane beside the `serial` run and the `print` run (unless the batch form leaves it out), the print
 * run on `PRINT_PAIR`; phase 2 is the `api-solo` files with nothing beside them.
 */
export function suitePlan(batch: boolean, decision: PrintLaneDecision): SuiteRun[][] {
  const first: SuiteRun[] = [
    { name: 'parallel', projects: ['api'] },
    { name: 'serial', projects: ['api-serial'] },
  ];
  if (!batch || decision.run) first.push({ name: 'print', projects: ['api-print'], env: { API_TEST_PAIR: String(PRINT_PAIR) } });
  return [first, [{ name: 'solo', projects: ['api-solo'] }]];
}

/** The Vitest arguments of one run: the projects, the `@slow` filter, no failure on an empty run, then the caller's own. */
export function vitestArgs(projects: readonly string[], extra: readonly string[]): string[] {
  return ['exec', 'vitest', 'run', ...projects.flatMap((project) => ['--project', project]), '-t', '^(?!.*@slow)', '--passWithNoTests', ...extra];
}

/** How many test files a Vitest run reports on its `Test Files` line; 0 when it ran none. */
export function testFileCount(output: string): number {
  // eslint-disable-next-line no-control-regex -- the colour codes Vitest writes around its counts
  const match = /Test Files\s+[^\n]*\((\d+)\)/.exec(output.replace(/\u001b\[[0-9;]*m/g, ''));
  return match === null ? 0 : Number(match[1]);
}

export interface RunResult {
  name: string;
  exitCode: number;
  durationMs: number;
  files: number;
}

/** The command's exit: 1 when any run failed or no run had a test file, else 0. */
export function suiteExit(results: readonly RunResult[]): number {
  if (results.some((result) => result.exitCode !== 0)) return 1;
  return results.reduce((sum, result) => sum + result.files, 0) > 0 ? 0 : 1;
}

/** Runs one Vitest run; `alone` says it has its phase to itself (so it may stream its output). */
export type RunVitest = (run: SuiteRun, alone: boolean) => Promise<{ exitCode: number; output: string }>;

/** Runs the plan's phases in order, every run of a phase at once, every phase whatever the one before gave; `report` gets each run as it ends. */
export async function runPlan(
  plan: readonly (readonly SuiteRun[])[],
  runVitest: RunVitest,
  report: (result: RunResult, output: string) => void = () => {},
  now: () => number = Date.now,
): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (const phase of plan) {
    const ended = await Promise.all(
      phase.map(async (run) => {
        const started = now();
        const { exitCode, output } = await runVitest(run, phase.length === 1);
        const result: RunResult = { name: run.name, exitCode, durationMs: now() - started, files: testFileCount(output) };
        report(result, output);
        return result;
      }),
    );
    results.push(...ended);
  }
  return results;
}

/** One line per run and the total, for the end of the log. */
export function summaryLines(results: readonly RunResult[], totalMs: number): string[] {
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  return [
    ...results.map((result) => `[test:api]   ${result.name.padEnd(9)} ${(result.exitCode === 0 ? 'passed' : `failed (exit ${result.exitCode})`).padEnd(16)} ${String(result.files).padStart(4)} files  ${seconds(result.durationMs)}`),
    `[test:api]   total     ${seconds(totalMs)}`,
  ];
}

/* ------------------------------------------------------------------------------------------ */
/* The import closure of the print (for scripts/api-suite.test.ts).                            */
/* ------------------------------------------------------------------------------------------ */

const DOMAIN_DIR = 'packages/domain';
const DOMAIN_SRC = `${DOMAIN_DIR}/src`;
/** A whole-domain marker: a named import the scan could not place makes the closure take every domain file. */
export const WHOLE_DOMAIN = `${DOMAIN_SRC}/`;

/** An import or re-export clause holds no quote, semicolon or parenthesis, so the match never runs past its own statement. */
const STATIC_IMPORT = /(?:^|[\s;])(?:import|export)\s+(type\s+)?([^;'"()]*?)\s*from\s*['"]([^'"]+)['"]/g;
const BARE_IMPORT = /(?:^|[\s;])import\s*['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

interface ImportRef {
  specifier: string;
  /** The names a `{ … }` clause imports; null for a namespace, default or bare import. */
  names: string[] | null;
}

/** The imports and re-exports of one source file, read with regular expressions. */
export function importsOf(source: string): ImportRef[] {
  const refs: ImportRef[] = [];
  for (const match of source.matchAll(STATIC_IMPORT)) {
    const clause = match[2] ?? '';
    const braces = /\{([\s\S]*)\}/.exec(clause);
    const names =
      braces === null || /\*|^\s*[A-Za-z_$][\w$]*\s*,/.test(clause.replace(/\{[\s\S]*\}/, ''))
        ? null
        : (braces[1] ?? '')
            .split(',')
            .map((part) => part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim() ?? '')
            .filter((name) => name !== '');
    refs.push({ specifier: match[3] ?? '', names });
  }
  for (const match of source.matchAll(BARE_IMPORT)) refs.push({ specifier: match[1] ?? '', names: null });
  for (const match of source.matchAll(DYNAMIC_IMPORT)) refs.push({ specifier: match[1] ?? '', names: null });
  return refs;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name.endsWith('.ts')) out.push(path);
  }
  return out;
}

const DECLARATION = /export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
const LOCAL_EXPORT = /export\s+(?:type\s+)?\{([^}]*)\}(?!\s*from)/g;

/** Every domain source file (tests aside) that declares or locally exports each name. */
function domainNameIndex(): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const add = (name: string, file: string) => index.set(name, [...(index.get(name) ?? []), file]);
  for (const file of walk(resolve(root, DOMAIN_SRC))) {
    if (file.endsWith('.test.ts')) continue;
    const source = readFileSync(file, 'utf8');
    const rel = relative(root, file);
    for (const match of source.matchAll(DECLARATION)) add(match[1] ?? '', rel);
    for (const match of source.matchAll(LOCAL_EXPORT)) {
      for (const part of (match[1] ?? '').split(',')) {
        const exported = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).at(-1)?.trim();
        if (exported !== undefined && exported !== '') add(exported, rel);
      }
    }
  }
  return index;
}

/** The domain package's `exports` map, as repository-relative files. */
function domainExports(): Map<string, string> {
  const manifest = JSON.parse(readFileSync(resolve(root, DOMAIN_DIR, 'package.json'), 'utf8')) as { exports: Record<string, string> };
  return new Map(Object.entries(manifest.exports).map(([key, target]) => [key === '.' ? '@app/domain' : `@app/domain/${key.slice(2)}`, join(DOMAIN_DIR, target)]));
}

/**
 * Every repository file the `roots` reach through static, bare and dynamic imports, transitively.
 * A relative import is followed as is; `@app/domain` is followed by name to the files that declare
 * each imported name (a name the scan cannot place, or a namespace import, adds `WHOLE_DOMAIN`);
 * another `@app/domain/…` subpath through the package's `exports`. Packages are not followed.
 */
export function importClosure(roots: readonly string[]): Set<string> {
  const names = domainNameIndex();
  const subpaths = domainExports();
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    const absolute = resolve(root, file);
    if (!existsSync(absolute) || !file.endsWith('.ts')) continue;
    for (const ref of importsOf(readFileSync(absolute, 'utf8'))) {
      if (ref.specifier.startsWith('.')) {
        queue.push(relative(root, resolve(dirname(absolute), ref.specifier)));
      } else if (ref.specifier === '@app/domain') {
        if (ref.names === null) {
          seen.add(WHOLE_DOMAIN);
          continue;
        }
        for (const name of ref.names) {
          const files = names.get(name);
          if (files === undefined) seen.add(WHOLE_DOMAIN);
          else queue.push(...files);
        }
      } else if (ref.specifier.startsWith('@app/domain/')) {
        const target = subpaths.get(ref.specifier);
        if (target === undefined) seen.add(WHOLE_DOMAIN);
        else queue.push(target);
      }
    }
  }
  return seen;
}

/** The closure's roots: every print lane test file and every render source file the api runs. */
export function printClosureRoots(): string[] {
  const generate = walk(resolve(API_DIR, 'src/jobs/generate'))
    .filter((file) => !file.endsWith('.test.ts'))
    .map((file) => relative(root, file));
  return [...PRINT_FILES.map((entry) => `apps/api/${entry.file}`), ...generate];
}

/* ------------------------------------------------------------------------------------------ */

function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

function vitestRunner(extra: readonly string[]): RunVitest {
  return (run, alone) =>
    new Promise((done) => {
      const child = spawn('pnpm', vitestArgs(run.projects, extra), { cwd: API_DIR, env: { ...process.env, ...run.env, FORCE_COLOR: '0' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks: Buffer[] = [];
      const take = (chunk: Buffer) => {
        chunks.push(chunk);
        if (alone) process.stdout.write(chunk);
      };
      child.stdout.on('data', take);
      child.stderr.on('data', take);
      const stop = () => killTree(child);
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
      if (alone) console.log(`\n[test:api] ===== ${run.name}: ${run.projects.join(', ')} =====`);
      child.on('close', (code) => {
        process.off('SIGINT', stop);
        process.off('SIGTERM', stop);
        done({ exitCode: code ?? 1, output: Buffer.concat(chunks).toString('utf8') });
      });
    });
}

async function main(argv: readonly string[]): Promise<number> {
  const started = Date.now();
  const { batch, extra } = parseArgs(argv);
  const decision = printLaneDecision(parseChangedFiles(process.env.API_CHANGED_FILES));
  const plan = suitePlan(batch, decision);
  if (batch) console.log(`[test:api] batch gate: the print lane ${decision.run ? 'runs' : 'is left out'} (${decision.reason})`);
  plan.forEach((phase, n) => console.log(`[test:api] phase ${n + 1}: ${phase.map((run) => `${run.name} (${run.projects.join(', ')})`).join(' + ')}`));
  mkdirSync(LOG_DIR, { recursive: true });
  const streamed = new Set(plan.filter((phase) => phase.length === 1).flatMap((phase) => phase.map((run) => run.name)));
  const results = await runPlan(plan, vitestRunner(extra), (result, output) => {
    writeFileSync(resolve(LOG_DIR, `${result.name}.log`), output);
    const head = `[test:api] ===== ${result.name}: ${result.exitCode === 0 ? 'passed' : 'FAILED'} in ${(result.durationMs / 1000).toFixed(1)} s =====`;
    if (streamed.has(result.name)) {
      console.log(head);
      return;
    }
    console.log(`\n${head}`);
    process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
  });
  const code = suiteExit(results);
  console.log('\n[test:api] summary');
  for (const line of summaryLines(results, Date.now() - started)) console.log(line);
  console.log(`[test:api] ${code === 0 ? 'PASSED' : 'FAILED'}`);
  return code;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
