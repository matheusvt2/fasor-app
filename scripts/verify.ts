import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The merge gate (`pnpm verify`, test-speed batch 2026-09-27). It runs the same five
 * stages the old `lint && static && test:unit && test:api && test:e2e` chain ran, in
 * phases: the stages of one phase run at the same time, and a phase starts only when the
 * one before it passed. Only stages that leave most of the CPU idle share a phase: lint
 * and the type checks (one core each) beside the api suite (one file at a time, mostly
 * waiting on Postgres and LibreOffice). The unit suite fills every core and the e2e suite
 * is sensitive to CPU contention, so each runs alone (measured 2026-09-27: the unit suite
 * beside the others ran its jsdom files three times slower and timed some out).
 *
 * Fail-fast: when a stage of a phase fails, the other stages of that phase are stopped
 * and no later phase runs. A stage alone in its phase streams its output as it runs; the
 * stages of a shared phase keep theirs whole and print it as one block when each ends
 * (never interleaved). Every stage's output is also written to
 * `test-results/verify/{stage}.log`, and the run ends with one line per stage (verdict and
 * wall time) and the total.
 */

export interface StageResult {
  stage: string;
  exitCode: number;
  durationMs: number;
  /** Stopped by the runner because another stage of its phase failed. */
  stopped: boolean;
}

/** The gate's phases, in order; each inner list runs at the same time. */
export const PHASES: readonly (readonly string[])[] = [['lint', 'static', 'test:api'], ['test:unit'], ['test:e2e']];

/** Every stage `verify` runs, in phase order: the same five the old chain ran. */
export function stagesOf(phases: readonly (readonly string[])[]): string[] {
  return phases.flat();
}

/** Runs one stage; `alone` says it has its phase to itself (so it may stream its output). */
export type StageRunner = (stage: string, signal: AbortSignal, alone: boolean) => Promise<{ exitCode: number; output: string }>;

/**
 * Runs the phases in order through `runStage`. Within a phase every stage starts at once;
 * the first failure aborts the others of its phase (their result says `stopped`) and ends
 * the run after that phase. `report` gets each stage's output when it ends.
 */
export async function runPhases(
  phases: readonly (readonly string[])[],
  runStage: StageRunner,
  report: (result: StageResult, output: string) => void = () => {},
  now: () => number = Date.now,
): Promise<{ exitCode: number; results: StageResult[] }> {
  const results: StageResult[] = [];
  for (const phase of phases) {
    const controller = new AbortController();
    const phaseResults = await Promise.all(
      phase.map(async (stage) => {
        const started = now();
        const { exitCode, output } = await runStage(stage, controller.signal, phase.length === 1);
        const stopped = exitCode !== 0 && controller.signal.aborted;
        const result: StageResult = { stage, exitCode, durationMs: now() - started, stopped };
        if (exitCode !== 0 && !controller.signal.aborted) controller.abort();
        report(result, output);
        return result;
      }),
    );
    results.push(...phaseResults);
    if (phaseResults.some((result) => result.exitCode !== 0)) return { exitCode: 1, results };
  }
  return { exitCode: 0, results };
}

/** One line per stage and the total, for the end of the log. */
export function summaryLines(results: readonly StageResult[], totalMs: number): string[] {
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const lines = results.map((result) => {
    const verdict = result.exitCode === 0 ? 'passed' : result.stopped ? 'stopped' : `failed (exit ${result.exitCode})`;
    return `[verify]   ${result.stage.padEnd(10)} ${verdict.padEnd(16)} ${seconds(result.durationMs)}`;
  });
  return [...lines, `[verify]   total      ${seconds(totalMs)}`];
}

const root = resolve(import.meta.dirname, '..');
const LOG_DIR = resolve(root, 'test-results/verify');

function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  try {
    // The stage runs in its own process group, so pnpm and everything it started stop.
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

const runPnpm: StageRunner = (stage, signal, alone) =>
  new Promise((resolveStage) => {
    const child = spawn('pnpm', ['run', stage], { cwd: root, env: { ...process.env, FORCE_COLOR: '0' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    const take = (chunk: Buffer) => {
      chunks.push(chunk);
      if (alone) process.stdout.write(chunk);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    if (alone) console.log(`\n[verify] ===== ${stage} =====`);
    const onAbort = () => killTree(child);
    signal.addEventListener('abort', onAbort, { once: true });
    child.on('close', (code) => {
      signal.removeEventListener('abort', onAbort);
      resolveStage({ exitCode: code ?? 1, output: Buffer.concat(chunks).toString('utf8') });
    });
  });

async function main(): Promise<void> {
  const started = Date.now();
  mkdirSync(LOG_DIR, { recursive: true });
  for (const phase of PHASES) console.log(`[verify] phase: ${phase.join(' + ')}`);
  const streamed = new Set(PHASES.filter((phase) => phase.length === 1).flat());
  const { exitCode, results } = await runPhases(PHASES, runPnpm, (result, output) => {
    writeFileSync(resolve(LOG_DIR, `${result.stage.replace(/[^a-z0-9]+/gi, '-')}.log`), output);
    const verdict = result.exitCode === 0 ? 'passed' : result.stopped ? 'stopped' : 'FAILED';
    const head = `[verify] ===== ${result.stage}: ${verdict} in ${(result.durationMs / 1000).toFixed(1)} s =====`;
    if (streamed.has(result.stage)) {
      console.log(head);
      return;
    }
    console.log(`\n${head}`);
    process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
  });
  const ran = new Set(results.map((result) => result.stage));
  const skipped = stagesOf(PHASES).filter((stage) => !ran.has(stage));
  console.log('\n[verify] summary');
  for (const line of summaryLines(results, Date.now() - started)) console.log(line);
  if (skipped.length > 0) console.log(`[verify]   not run (an earlier phase failed): ${skipped.join(', ')}`);
  console.log(`[verify] ${exitCode === 0 ? 'PASSED' : 'FAILED'}`);
  process.exit(exitCode);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
