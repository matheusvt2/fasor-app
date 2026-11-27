import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PRINT_FILES } from '../apps/api/src/test-lanes.ts';

/**
 * Chore T4 (2026-11-26, sprint-change-proposal-2026-11-04.md § 4.5): the one entry of the api
 * suite. `pnpm test:api` runs its three lanes (`apps/api/src/test-lanes.ts`) in one Vitest run:
 * `api` (parallel), then `api-serial`, then `api-print`. That is the wave gate's form (`pnpm
 * verify` calls it) and the default everywhere.
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
 * trigger. Every other argument goes to Vitest unchanged. The `@slow` name filter of the old
 * `test:fast` script stays (R-011: "the api tests except `@slow`"; no test carries the tag).
 */

const root = resolve(import.meta.dirname, '..');
const API_DIR = resolve(root, 'apps/api');

/** The api suite's projects, in run order (their `sequence.groupOrder`). */
export const API_PROJECTS = ['api', 'api-serial', 'api-print'] as const;

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

/** The Vitest arguments of one run: the projects, the `@slow` filter, then the caller's own. */
export function vitestArgs(projects: readonly string[], extra: readonly string[]): string[] {
  return ['exec', 'vitest', 'run', ...projects.flatMap((project) => ['--project', project]), '-t', '^(?!.*@slow)', ...extra];
}

/** The command line split into `--batch` and what goes to Vitest. */
export function parseArgs(argv: readonly string[]): { batch: boolean; extra: string[] } {
  const extra = argv.filter((arg) => arg !== '--batch');
  return { batch: extra.length !== argv.length, extra };
}

/** The projects one command runs. */
export function projectsFor(batch: boolean, decision: PrintLaneDecision): string[] {
  if (!batch || decision.run) return [...API_PROJECTS];
  return API_PROJECTS.filter((project) => project !== 'api-print');
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

function main(argv: readonly string[]): number {
  const { batch, extra } = parseArgs(argv);
  const decision = printLaneDecision(parseChangedFiles(process.env.API_CHANGED_FILES));
  const projects = projectsFor(batch, decision);
  if (batch) console.log(`[test:api] batch gate: the print lane ${decision.run ? 'runs' : 'is left out'} (${decision.reason})`);
  console.log(`[test:api] lanes: ${projects.join(', ')}`);
  const started = Date.now();
  const result = spawnSync('pnpm', vitestArgs(projects, extra), { cwd: API_DIR, stdio: 'inherit' });
  console.log(`[test:api] ${result.status === 0 ? 'passed' : 'FAILED'} in ${((Date.now() - started) / 1000).toFixed(1)} s (lanes: ${projects.join(', ')})`);
  return result.status ?? 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
