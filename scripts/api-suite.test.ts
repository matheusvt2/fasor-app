import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARALLEL_SETUP_FILE, PARALLEL_WORKERS, PRINT_FILES, SERIAL_FILES, SOLO_FILES } from '../apps/api/src/test-lanes.ts';
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
  runPlan,
  suiteExit,
  suitePlan,
  summaryLines,
  testFileCount,
  vitestArgs,
  WHOLE_DOMAIN,
  type SuiteRun,
} from './api-suite.ts';
import { PHASES } from './verify.ts';

/*
 * Chore T4 (2026-11-26, sprint-change-proposal-2026-11-04.md § 4.5): the api suite's lanes, the
 * runner's phases and the batch gate's print-lane rule. Like the T2 and T3 guards of
 * `scripts/e2e.test.ts`, these fail when a new api test file that reaches a shared resource lands in
 * the parallel lane, or when the print comes to depend on a path the batch rule does not watch.
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
const solo = new Set(SOLO_FILES.map((entry) => entry.file));
const listed = (file: string) => serial.has(file) || print.has(file) || solo.has(file);
const source = (file: string) => readFileSync(resolve(apiDir, file), 'utf8');

/** What in a test file needs a one-file-at-a-time lane; empty when it can run beside other files. */
export function sharedResources(text: string): string[] {
  const found: string[] = [];
  if (/\/api\/relatorios\/[^`'"\s]*\/(?:preview|generate)\b/.test(text) || /\/(?:preview|generate)['"`]\s*\)/.test(text)) found.push('calls the preview or generate route');
  if (/route:\s*'preview'\s*\|\s*'generate'/.test(text)) found.push('calls the preview or generate route');
  for (const call of text.matchAll(/seedPortoSeguroSmall\(([^;]*?)\);/gs)) if (!/copy:\s*true/.test(call[1] ?? '')) found.push('seeds the fixed-id small fixture');
  for (const call of text.matchAll(/removePortoSeguroSmall\(([^;]*?)\);/gs)) if (!/copyOf/.test(call[1] ?? '')) found.push('removes the fixed-id small fixture');
  if (/@app\/domain\/fixtures\/layout-lock/.test(text) && /\bapplyOps\(/.test(text)) found.push('applies a layout-lock relatório (fixed op ids)');
  if (/@app\/domain\/fixtures\/porto-seguro/.test(text) && /\.delete\(ops\)[\s\S]{0,80}inArray\(\s*ops\.op_id/.test(text)) found.push("deletes a fixture's fixed op ids in every company");
  if (/portoSeguro(?:Small)?\.log\.map\([\s\S]{0,600}?\.\.\.op,/.test(text)) found.push('applies a Porto Seguro fixture under its fixed relatório and entity ids');
  if (/seed-users\.ts/.test(text) && /['"]--test['"]/.test(text)) found.push('runs the seed CLI on the fixed pair');
  if (/golden/.test(text) && /\/preview/.test(text)) found.push('compares a print with a golden');
  found.push(...soloResources(text));
  return [...new Set(found)];
}

/** What in a test file needs nothing at all beside it (the `api-solo` lane). */
export function soloResources(text: string): string[] {
  const found: string[] = [];
  if (/LEGACY_TEST_COMPANY_IDS/.test(text) && /\.insert\(company\)/.test(text)) found.push('plants a legacy test company');
  if (/\b(?:upgradeRolesAndUsers|upgradeTemplateSeeds)\(/.test(text)) found.push('runs a boot upgrade over every company');
  return found;
}

describe('the api suite lanes (chore T4)', () => {
  const files = apiTestFiles();

  it('lists only test files that exist, each with its reason, none in two lanes', () => {
    for (const entry of [...SERIAL_FILES, ...PRINT_FILES, ...SOLO_FILES]) {
      expect(existsSync(resolve(apiDir, entry.file)), entry.file).toBe(true);
      expect(entry.file.endsWith('.test.ts'), entry.file).toBe(true);
      expect(entry.why.length, entry.file).toBeGreaterThan(20);
    }
    expect(serial.size + print.size + solo.size).toBe(SERIAL_FILES.length + PRINT_FILES.length + SOLO_FILES.length);
    expect(new Set([...serial, ...print, ...solo]).size).toBe(serial.size + print.size + solo.size);
    expect(PARALLEL_WORKERS).toBeGreaterThanOrEqual(2);
  });

  it('keeps every test file that reaches a shared resource out of the parallel lane, and every one that needs nothing beside it in the solo lane', () => {
    const misplaced = files
      .filter((file) => !listed(file))
      .map((file) => ({ file, needs: sharedResources(source(file)) }))
      .filter((one) => one.needs.length > 0);
    expect(misplaced).toEqual([]);
    const notAlone = files
      .filter((file) => !solo.has(file))
      .map((file) => ({ file, needs: soloResources(source(file)) }))
      .filter((one) => one.needs.length > 0);
    expect(notAlone).toEqual([]);
    expect([...solo].filter((file) => /generation-time/.test(file))).toHaveLength(1);
  });

  it('the scan sees each shared resource, and a copy of the fixture is not one', () => {
    expect(sharedResources("await h.authed(a, `/api/relatorios/${id}/generate`, { method: 'POST' });")).toEqual(['calls the preview or generate route']);
    expect(sharedResources('await call(`/api/relatorios/${id}/preview`, {});')).toEqual(['calls the preview or generate route']);
    expect(sharedResources('await seedPortoSeguroSmall(db, companyA.companyId, { parecer });')).toEqual(['seeds the fixed-id small fixture']);
    expect(sharedResources('await seedPortoSeguroSmall(db, b.companyId, { copy: true });')).toEqual([]);
    expect(sharedResources('await removePortoSeguroSmall(db, { copyOf: b });')).toEqual([]);
    expect(sharedResources("import { layoutLockFixture } from '@app/domain/fixtures/layout-lock';\nawait applyOps(db, c, log, o);")).toEqual(['applies a layout-lock relatório (fixed op ids)']);
    expect(sharedResources("import { layoutLockEpic25Snapshot } from '@app/domain/fixtures/layout-lock';")).toEqual([]);
    expect(sharedResources("import { portoSeguro } from '@app/domain/fixtures/porto-seguro';\nawait db.delete(ops).where(\n  inArray(\n    ops.op_id,\n    log.map((op) => op.op_id),")).toEqual(["deletes a fixture's fixed op ids in every company"]);
    expect(sharedResources("import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';\nconst fixed = new Set(portoSeguroSmall.log.map((op) => op.op_id));")).toEqual([]);
    expect(sharedResources('const remapped = portoSeguroSmall.log.map((op) => {\n  return { ...op, op_id: newId(), company_id: company };\n});')).toEqual(['applies a Porto Seguro fixture under its fixed relatório and entity ids']);
    expect(sharedResources("spawnSync('pnpm', ['exec', 'tsx', 'scripts/seed-users.ts', '--test'])")).toEqual(['runs the seed CLI on the fixed pair']);
    expect(sharedResources("spawnSync('pnpm', ['exec', 'tsx', 'scripts/seed-users.ts', '--company-id', id])")).toEqual([]);
    expect(soloResources('const first = await upgradeRolesAndUsers(db, { info });')).toEqual(['runs a boot upgrade over every company']);
    expect(soloResources("await tx.insert(company).values({ id: LEGACY_TEST_COMPANY_IDS[0], name: 'x' });")).toEqual(['plants a legacy test company']);
  });

  it("keeps every integration test of the parallel lane on its worker's pair: none names the fixed companies, users or e-mails", () => {
    const fixed = /0a000000-0000-7000-8000-|0b000000-0000-7000-8000-|['"`][ab]@teste\.local/;
    const offenders = files.filter((file) => file.endsWith('.integration.test.ts') && !listed(file) && fixed.test(source(file)));
    expect(offenders).toEqual([]);
  });

  it('gives the parallel lane its workers and the pair setup file, and the other three lanes one file at a time on the fixed pair, in order', async () => {
    const config = (await import('../apps/api/vitest.config.ts')).default as { test: { projects: { test: Record<string, unknown> }[] } };
    const projects = config.test.projects.map((project) => project.test);
    expect(projects.map((project) => project.name)).toEqual([...API_PROJECTS]);
    const [parallel, serialLane, printLane, soloLane] = projects;
    expect(parallel).toMatchObject({ maxWorkers: PARALLEL_WORKERS, setupFiles: [PARALLEL_SETUP_FILE], sequence: { groupOrder: 0 } });
    expect(parallel?.exclude).toEqual(expect.arrayContaining([...serial, ...print, ...solo]));
    expect(serialLane).toMatchObject({ include: [...serial], fileParallelism: false, sequence: { groupOrder: 1 } });
    expect(printLane).toMatchObject({ include: [...print], fileParallelism: false, sequence: { groupOrder: 2 } });
    expect(soloLane).toMatchObject({ include: [...solo], fileParallelism: false, sequence: { groupOrder: 3 } });
    for (const lane of [serialLane, printLane, soloLane]) expect(lane?.setupFiles).toBeUndefined();
  });

  it('the setup file gives worker slot k pair k + 1 (never the fixed pair), names the variable test-seed.ts reads, and imports nothing', () => {
    const setup = source(PARALLEL_SETUP_FILE);
    expect(setup).toContain(`process.env.${TEST_PAIR_ENV} = String(slot + 1)`);
    // An import would evaluate test-seed.ts, and so fix TEST_SEED, before the variable is set.
    expect(importsOf(setup)).toEqual([]);
  });
});

describe('scripts/api-suite.ts phases (chore T4)', () => {
  it('runs the solo lane alone first, then the parallel lane beside the queue run (serial, then print)', () => {
    const full = suitePlan(false, { run: false, reason: '' });
    expect(full).toEqual([
      [{ name: 'solo', projects: ['api-solo'] }],
      [
        { name: 'parallel', projects: ['api'] },
        { name: 'queue', projects: ['api-serial', 'api-print'] },
      ],
    ]);
    expect(suitePlan(true, { run: true, reason: '' })).toEqual(full);
    expect(suitePlan(true, { run: false, reason: '' })[1]?.[1]).toEqual({ name: 'queue', projects: ['api-serial'] });
    expect(full.flat().flatMap((run) => run.projects).sort()).toEqual([...API_PROJECTS].sort());
  });

  it('starts the runs of a phase together, runs every phase whatever the one before gave, and fails when any run failed', async () => {
    const log: string[] = [];
    let clock = 0;
    const runner = async (run: SuiteRun, alone: boolean) => {
      log.push(`start ${run.name}${alone ? ' alone' : ''}`);
      await new Promise((done) => setTimeout(done, run.name === 'parallel' ? 5 : 1));
      clock += 10;
      log.push(`end ${run.name}`);
      return { exitCode: run.name === 'queue' ? 1 : 0, output: ` Test Files  3 passed (3)\n` };
    };
    const results = await runPlan(suitePlan(false, { run: true, reason: '' }), runner, () => {}, () => clock);
    expect(log).toEqual(['start solo alone', 'end solo', 'start parallel', 'start queue', 'end queue', 'end parallel']);
    expect(results.map((result) => [result.name, result.exitCode, result.files])).toEqual([
      ['solo', 0, 3],
      ['parallel', 0, 3],
      ['queue', 1, 3],
    ]);
    expect(suiteExit(results)).toBe(1);
    expect(suiteExit(results.map((result) => ({ ...result, exitCode: 0 })))).toBe(0);
    expect(suiteExit(results.map((result) => ({ ...result, exitCode: 0, files: 0 })))).toBe(1);
  });

  it('reads the test file count of a run, coloured or not, and 0 for a run with none', () => {
    expect(testFileCount(' Test Files  5 failed | 162 passed | 3 skipped (170)\n')).toBe(170);
    expect(testFileCount('\u001b[2m Test Files \u001b[22m \u001b[1m\u001b[32m4 passed\u001b[39m\u001b[22m\u001b[90m (4)\u001b[39m')).toBe(4);
    expect(testFileCount('No test files found, exiting with code 0')).toBe(0);
  });

  it('passes the projects, the @slow filter and --passWithNoTests, then the caller\'s arguments, and ends with one line per run', () => {
    expect(vitestArgs(['api-serial', 'api-print'], ['src/x.test.ts'])).toEqual(['exec', 'vitest', 'run', '--project', 'api-serial', '--project', 'api-print', '-t', '^(?!.*@slow)', '--passWithNoTests', 'src/x.test.ts']);
    expect(summaryLines([{ name: 'parallel', exitCode: 0, durationMs: 1500, files: 130 }], 2000)).toEqual([
      '[test:api]   parallel  passed            130 files  1.5 s',
      '[test:api]   total     2.0 s',
    ]);
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
    expect(suitePlan(true, printLaneDecision(changed)).flat().flatMap((run) => run.projects)).toEqual(['api-solo', 'api', 'api-serial']);
  });

  it('runs every lane outside the batch form, whatever changed', () => {
    expect(suitePlan(false, { run: false, reason: '' }).flat().flatMap((run) => run.projects)).toEqual(['api-solo', 'api', 'api-serial', 'api-print']);
    expect(parseArgs(['--batch', 'src/x.test.ts'])).toEqual({ batch: true, extra: ['src/x.test.ts'] });
    expect(parseArgs([])).toEqual({ batch: false, extra: [] });
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
