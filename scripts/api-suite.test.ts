import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARALLEL_SETUP_FILE, PARALLEL_WORKERS, PRINT_FILES, SERIAL_FILES } from '../apps/api/src/test-lanes.ts';
import { TEST_PAIR_ENV } from '../apps/api/src/db/test-seed.ts';
import {
  API_PROJECTS,
  importClosure,
  importsOf,
  matchTrigger,
  parseArgs,
  parseChangedFiles,
  printClosureRoots,
  printLaneDecision,
  PRINT_TRIGGERS,
  projectsFor,
  vitestArgs,
  WHOLE_DOMAIN,
} from './api-suite.ts';
import { PHASES } from './verify.ts';

/*
 * Chore T4 (2026-11-26, sprint-change-proposal-2026-11-04.md § 4.5): the api suite's lanes and the
 * batch gate's print-lane rule. Like the T2 and T3 guards of `scripts/e2e.test.ts`, these fail when
 * a new api test file that reaches a shared resource lands in the parallel lane, or when the print
 * comes to depend on a path the batch rule does not watch.
 */

const root = resolve(import.meta.dirname, '..');
const apiDir = resolve(root, 'apps/api');

function apiTestFiles(dir = resolve(apiDir, 'src'), out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) apiTestFiles(path, out);
    else if (entry.name.endsWith('.test.ts')) out.push(relative(apiDir, path));
  }
  return out.sort();
}

const serial = new Set(SERIAL_FILES.map((entry) => entry.file));
const print = new Set(PRINT_FILES.map((entry) => entry.file));
const source = (file: string) => readFileSync(resolve(apiDir, file), 'utf8');

/** What in a test file needs the one-at-a-time lanes; empty when it can run beside other files. */
export function sharedResources(text: string): string[] {
  const found: string[] = [];
  if (/\/api\/relatorios\/[^`'"\s]*\/(?:preview|generate)\b/.test(text) || /\/(?:preview|generate)['"`]\s*\)/.test(text)) found.push('calls the preview or generate route');
  if (/route:\s*'preview'\s*\|\s*'generate'/.test(text)) found.push('calls the preview or generate route');
  for (const call of text.matchAll(/seedPortoSeguroSmall\(([^;]*?)\);/gs)) if (!/copy:\s*true/.test(call[1] ?? '')) found.push('seeds the fixed-id small fixture');
  for (const call of text.matchAll(/removePortoSeguroSmall\(([^;]*?)\);/gs)) if (!/copyOf/.test(call[1] ?? '')) found.push('removes the fixed-id small fixture');
  if (/@app\/domain\/fixtures\/layout-lock/.test(text) && /\bapplyOps\(/.test(text)) found.push('applies a layout-lock relatório (fixed op ids)');
  if (/seed-users\.ts/.test(text) && /['"]--test['"]/.test(text)) found.push('runs the seed CLI on the test pair');
  if (/LEGACY_TEST_COMPANY_IDS/.test(text) && /\.insert\(company\)/.test(text)) found.push('plants a legacy test company');
  if (/golden/.test(text) && /\/preview/.test(text)) found.push('compares a print with a golden');
  if (/\b(?:upgradeRolesAndUsers|upgradeTemplateSeeds)\(/.test(text)) found.push('runs a boot upgrade over every company');
  return [...new Set(found)];
}

describe('the api suite lanes (chore T4)', () => {
  const files = apiTestFiles();

  it('lists only test files that exist, each with its reason, none in two lanes', () => {
    for (const entry of [...SERIAL_FILES, ...PRINT_FILES]) {
      expect(existsSync(resolve(apiDir, entry.file)), entry.file).toBe(true);
      expect(entry.file.endsWith('.test.ts'), entry.file).toBe(true);
      expect(entry.why.length, entry.file).toBeGreaterThan(20);
    }
    expect(serial.size).toBe(SERIAL_FILES.length);
    expect(print.size).toBe(PRINT_FILES.length);
    expect([...serial].filter((file) => print.has(file))).toEqual([]);
    expect(PARALLEL_WORKERS).toBeGreaterThanOrEqual(2);
  });

  it('keeps every test file that reaches a shared resource out of the parallel lane', () => {
    const misplaced = files
      .filter((file) => !serial.has(file) && !print.has(file))
      .map((file) => ({ file, needs: sharedResources(source(file)) }))
      .filter((one) => one.needs.length > 0);
    expect(misplaced).toEqual([]);
  });

  it('the scan sees each shared resource, and a copy of the fixture is not one', () => {
    expect(sharedResources("await h.authed(a, `/api/relatorios/${id}/generate`, { method: 'POST' });")).toEqual(['calls the preview or generate route']);
    expect(sharedResources('await call(`/api/relatorios/${id}/preview`, {});')).toEqual(['calls the preview or generate route']);
    expect(sharedResources('await seedPortoSeguroSmall(db, companyA.companyId, { parecer });')).toEqual(['seeds the fixed-id small fixture']);
    expect(sharedResources('await seedPortoSeguroSmall(db, b.companyId, { copy: true });')).toEqual([]);
    expect(sharedResources('await removePortoSeguroSmall(db, { copyOf: b });')).toEqual([]);
    expect(sharedResources("import { layoutLockFixture } from '@app/domain/fixtures/layout-lock';\nawait applyOps(db, c, log, o);")).toEqual(['applies a layout-lock relatório (fixed op ids)']);
    expect(sharedResources("import { layoutLockEpic25Snapshot } from '@app/domain/fixtures/layout-lock';")).toEqual([]);
    expect(sharedResources("spawnSync('pnpm', ['exec', 'tsx', 'scripts/seed-users.ts', '--test'])")).toEqual(['runs the seed CLI on the test pair']);
    expect(sharedResources("spawnSync('pnpm', ['exec', 'tsx', 'scripts/seed-users.ts', '--company-id', id])")).toEqual([]);
    expect(sharedResources('const first = await upgradeRolesAndUsers(db, { info });')).toEqual(['runs a boot upgrade over every company']);
  });

  it('keeps every integration test of the parallel lane on its worker\'s pair: none names the fixed companies, users or e-mails', () => {
    const fixed = /0a000000-0000-7000-8000-|0b000000-0000-7000-8000-|['"`][ab]@teste\.local/;
    const offenders = files.filter((file) => file.endsWith('.integration.test.ts') && !serial.has(file) && !print.has(file) && fixed.test(source(file)));
    expect(offenders).toEqual([]);
  });

  it('runs the parallel lane on its workers with the pair setup file, then the serial and print lanes one file at a time, in that order', async () => {
    const config = (await import('../apps/api/vitest.config.ts')).default as { test: { projects: { test: Record<string, unknown> }[] } };
    const projects = config.test.projects.map((project) => project.test);
    expect(projects.map((project) => project.name)).toEqual([...API_PROJECTS]);
    const [parallel, serialLane, printLane] = projects;
    expect(parallel).toMatchObject({ maxWorkers: PARALLEL_WORKERS, setupFiles: [PARALLEL_SETUP_FILE], sequence: { groupOrder: 0 } });
    expect(parallel?.exclude).toEqual(expect.arrayContaining([...serial, ...print]));
    expect(serialLane).toMatchObject({ include: [...serial], fileParallelism: false, sequence: { groupOrder: 1 } });
    expect(printLane).toMatchObject({ include: [...print], fileParallelism: false, sequence: { groupOrder: 2 } });
  });

  it('the setup file names the pair variable test-seed.ts reads, and imports nothing (an import would fix TEST_SEED before it runs)', () => {
    const setup = source(PARALLEL_SETUP_FILE);
    expect(setup).toContain(`process.env.${TEST_PAIR_ENV} = slot`);
    expect(importsOf(setup)).toEqual([]);
  });
});

describe('the batch gate\'s print lane (chore T4)', () => {
  it('runs the print lane when it cannot tell what the batch changed', () => {
    expect(parseChangedFiles(undefined)).toBeUndefined();
    expect(printLaneDecision(undefined).run).toBe(true);
    expect(printLaneDecision(parseChangedFiles('')).run).toBe(true);
    expect(printLaneDecision(parseChangedFiles(' \n ')).run).toBe(true);
  });

  it('runs it for a change to the render code, a golden, the kernel, the data path, the image or the lane machinery', () => {
    for (const path of [
      'apps/api/src/jobs/generate/docx.ts',
      'apps/api/src/jobs/generate/golden/layout-lock-v18/pdf-text.json',
      'packages/domain/src/print/section-7.ts',
      'packages/domain/src/seed/v19.ts',
      'packages/domain/src/relatorio/conclusion.ts',
      'packages/domain/fixtures/layout-lock/op-log.ts',
      'apps/api/src/sync/apply.ts',
      'apps/api/src/db/schema.ts',
      'apps/api/Dockerfile',
      'pnpm-lock.yaml',
      'apps/api/vitest.config.ts',
      'apps/api/src/test-lanes.ts',
      'scripts/api-suite.ts',
    ]) {
      expect(printLaneDecision(parseChangedFiles(`apps/web/src/app.tsx\n${path}`)), path).toMatchObject({ run: true });
    }
  });

  it('leaves it out when every changed path is elsewhere (screens, e2e specs, docs, other api routes and jobs)', () => {
    const changed = parseChangedFiles(
      'apps/web/src/screens/home.tsx e2e/home.spec.ts docs/kbs/log.md _bmad-output/planning-artifacts/epics.md apps/api/src/http/audios.ts apps/api/src/jobs/transcription/worker.ts AGENTS.md',
    );
    expect(printLaneDecision(changed)).toMatchObject({ run: false });
    expect(projectsFor(true, printLaneDecision(changed))).toEqual(['api', 'api-serial']);
  });

  it('runs every lane outside the batch form, whatever changed', () => {
    expect(projectsFor(false, { run: false, reason: '' })).toEqual([...API_PROJECTS]);
    expect(parseArgs(['--batch', 'src/x.test.ts'])).toEqual({ batch: true, extra: ['src/x.test.ts'] });
    expect(parseArgs([])).toEqual({ batch: false, extra: [] });
    expect(vitestArgs(['api'], ['--reporter=dot'])).toEqual(['exec', 'vitest', 'run', '--project', 'api', '-t', '^(?!.*@slow)', '--reporter=dot']);
  });

  it('matches a trigger directory by prefix and a trigger file exactly', () => {
    expect(matchTrigger('./apps/api/src/jobs/generate/x.ts')).toBe('apps/api/src/jobs/generate/');
    expect(matchTrigger('apps/api/package.json')).toBe('apps/api/package.json');
    expect(matchTrigger('apps/api/package.json.bak')).toBeNull();
    expect(matchTrigger('apps/web/package.json')).toBeNull();
  });

  it('watches every file the print can depend on: the import closure of the render code and the print lane\'s tests lies under the triggers', () => {
    const closure = importClosure(printClosureRoots());
    expect(closure.has(WHOLE_DOMAIN) ? matchTrigger(WHOLE_DOMAIN) : 'placed', 'a named import from @app/domain the scan could not place').not.toBeNull();
    expect(closure.size).toBeGreaterThan(100);
    expect([...closure].filter((file) => matchTrigger(file) === null)).toEqual([]);
  });

  it('reads imports by name, a re-export, a type import, a bare and a dynamic import', () => {
    expect(importsOf("import { a, type B, c as d } from '@app/domain';\nexport * from './x.ts';\nimport './side.ts';\nawait import('./lazy.ts');")).toEqual([
      { specifier: '@app/domain', names: ['a', 'B', 'c'] },
      { specifier: './x.ts', names: null },
      { specifier: './side.ts', names: null },
      { specifier: './lazy.ts', names: null },
    ]);
  });
});

describe('the gates call the api suite through scripts/api-suite.ts (chore T4)', () => {
  it('pnpm test:api runs every lane, pnpm test:api:batch the batch form, and verify keeps test:api', () => {
    const scripts = (JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['test:api']).toBe('tsx scripts/preflight.ts && tsx scripts/api-suite.ts');
    expect(scripts['test:api:batch']).toBe('tsx scripts/preflight.ts && tsx scripts/api-suite.ts --batch');
    expect(PHASES.flat()).toContain('test:api');
    expect(PRINT_TRIGGERS.length).toBeGreaterThan(5);
  });
});
