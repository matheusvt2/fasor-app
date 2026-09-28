import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHASES, runPhases, stagesOf, summaryLines, type StageRunner } from './verify.ts';

/*
 * Test-speed batch (2026-09-27): `pnpm verify` runs its stages in phases. These pin that it
 * still runs every stage of the old chain, that a failure stops its phase and every later
 * one, and that the e2e suite never shares a phase with another stage.
 */

const root = resolve(import.meta.dirname, '..');

/** A runner whose stages end after `ms[stage]` (fake time) with `codes[stage]`, honouring aborts. */
function fakeRunner(codes: Record<string, number>, ms: Record<string, number>, log: string[]): StageRunner {
  return (stage, signal) =>
    new Promise((done) => {
      log.push(`start ${stage}`);
      const timer = setTimeout(() => {
        log.push(`end ${stage}`);
        done({ exitCode: codes[stage] ?? 0, output: `${stage} output` });
      }, ms[stage] ?? 1);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        log.push(`stopped ${stage}`);
        done({ exitCode: 143, output: '' });
      });
    });
}

describe('scripts/verify.ts', () => {
  it('runs the five stages of the old chain, and the e2e suite alone in the last phase', () => {
    expect(stagesOf(PHASES).sort()).toEqual(['lint', 'static', 'test:api', 'test:e2e', 'test:unit']);
    const e2ePhase = PHASES.find((phase) => phase.includes('test:e2e'))!;
    expect(e2ePhase).toEqual(['test:e2e']);
    expect(PHASES.at(-1)).toBe(e2ePhase);
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts.verify).toBe('tsx scripts/verify.ts');
    for (const stage of stagesOf(PHASES)) expect(pkg.scripts[stage], stage).toBeDefined();
  });

  it('starts every stage of a phase at once and the next phase only after all passed', async () => {
    const log: string[] = [];
    const { exitCode, results } = await runPhases([['a', 'b'], ['c']], fakeRunner({}, { a: 20, b: 5, c: 1 }, log));
    expect(exitCode).toBe(0);
    expect(log).toEqual(['start a', 'start b', 'end b', 'end a', 'start c', 'end c']);
    expect(results.map((r) => [r.stage, r.exitCode, r.stopped])).toEqual([
      ['a', 0, false],
      ['b', 0, false],
      ['c', 0, false],
    ]);
  });

  it('stops the rest of a phase at the first failure and runs no later phase', async () => {
    const log: string[] = [];
    const reported: string[] = [];
    const { exitCode, results } = await runPhases(
      [['slow', 'bad'], ['never']],
      fakeRunner({ bad: 1 }, { slow: 10_000, bad: 5 }, log),
      (result, output) => reported.push(`${result.stage}:${output}`),
    );
    expect(exitCode).toBe(1);
    expect(log).toEqual(['start slow', 'start bad', 'end bad', 'stopped slow']);
    expect(results.map((r) => [r.stage, r.exitCode, r.stopped])).toEqual([
      ['slow', 143, true],
      ['bad', 1, false],
    ]);
    expect(reported).toEqual(['bad:bad output', 'slow:']);
  });

  it('prints one line per stage and the total', () => {
    const lines = summaryLines(
      [
        { stage: 'lint', exitCode: 0, durationMs: 1500, stopped: false },
        { stage: 'test:api', exitCode: 1, durationMs: 2000, stopped: false },
        { stage: 'test:unit', exitCode: 143, durationMs: 2100, stopped: true },
      ],
      3000,
    );
    expect(lines).toEqual([
      '[verify]   lint       passed           1.5 s',
      '[verify]   test:api   failed (exit 1)  2.0 s',
      '[verify]   test:unit  stopped          2.1 s',
      '[verify]   total      3.0 s',
    ]);
  });
});
