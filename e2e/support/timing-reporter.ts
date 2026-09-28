import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter';

/**
 * Where each e2e test spends its time (test-speed batch, 2026-09-27): per test, the whole
 * duration, the "Before Hooks" (fixtures, `beforeEach`, sign-in and seeding done there) and
 * "After Hooks" steps, and the body's slowest top-level steps. Written next to the group's
 * JSON report as `timings-{group}.json`, sorted slowest first, so a run can be profiled
 * without a trace. It reads only what Playwright reports; it never changes a test.
 */

interface StepTime {
  title: string;
  ms: number;
}

interface TestTime {
  test: string;
  outcome: string;
  retry: number;
  workerIndex: number;
  totalMs: number;
  beforeHooksMs: number;
  afterHooksMs: number;
  bodyMs: number;
  /** Time in `setup: …` steps (`timed` in `merged-fixtures.ts`), outermost only. */
  setupMs: number;
  slowSteps: StepTime[];
}

const SLOW_STEP_MS = 1_000;

function stepTitle(step: TestStep): string {
  return `${step.category}: ${step.title}`.slice(0, 160);
}

export default class TimingReporter implements Reporter {
  private readonly rows: TestTime[] = [];
  /** Every `setup: …` step of the run by title (op counts dropped): how many and how long. */
  private readonly setup = new Map<string, { count: number; ms: number }>();

  constructor(private readonly options: { outputFile: string }) {}

  onTestEnd(test: TestCase, result: TestResult): void {
    const top = result.steps;
    const hook = (title: string) => top.filter((step) => step.category === 'hook' && step.title === title).reduce((sum, step) => sum + step.duration, 0);
    const beforeHooksMs = hook('Before Hooks');
    const afterHooksMs = hook('After Hooks');
    const slowSteps: StepTime[] = [];
    const walk = (steps: readonly TestStep[], depth: number) => {
      for (const step of steps) {
        if (step.duration >= SLOW_STEP_MS && step.category !== 'hook') slowSteps.push({ title: `${'  '.repeat(depth)}${stepTitle(step)}`, ms: step.duration });
        if (step.category === 'hook' || step.category === 'test.step' || step.category === 'fixture') walk(step.steps, depth + 1);
      }
    };
    walk(top, 0);
    let setupMs = 0;
    const setupWalk = (steps: readonly TestStep[]) => {
      for (const step of steps) {
        if (step.title.startsWith('setup: ')) {
          setupMs += step.duration;
          const key = step.title.replace(/ \(.*\)$/, '');
          const entry = this.setup.get(key) ?? { count: 0, ms: 0 };
          entry.count += 1;
          entry.ms += step.duration;
          this.setup.set(key, entry);
        } else setupWalk(step.steps);
      }
    };
    setupWalk(top);
    this.rows.push({
      test: [test.parent.project()?.name ?? '', ...test.titlePath().slice(2)].join(' > '),
      outcome: result.status,
      retry: result.retry,
      workerIndex: result.workerIndex,
      totalMs: result.duration,
      beforeHooksMs,
      afterHooksMs,
      bodyMs: Math.max(0, result.duration - beforeHooksMs - afterHooksMs),
      setupMs,
      slowSteps: slowSteps.sort((a, b) => b.ms - a.ms).slice(0, 12),
    });
  }

  onEnd(result: FullResult): void {
    const rows = [...this.rows].sort((a, b) => b.totalMs - a.totalMs);
    const sum = (key: 'totalMs' | 'beforeHooksMs' | 'afterHooksMs' | 'bodyMs' | 'setupMs') => rows.reduce((total, row) => total + row[key], 0);
    const summary = {
      status: result.status,
      wallMs: result.duration,
      tests: rows.length,
      totalMs: sum('totalMs'),
      beforeHooksMs: sum('beforeHooksMs'),
      afterHooksMs: sum('afterHooksMs'),
      bodyMs: sum('bodyMs'),
      setupMs: sum('setupMs'),
      setup: Object.fromEntries([...this.setup].sort((a, b) => b[1].ms - a[1].ms)),
      rows,
    };
    mkdirSync(dirname(this.options.outputFile), { recursive: true });
    writeFileSync(this.options.outputFile, `${JSON.stringify(summary, null, 2)}\n`);
  }

  printsToStdio(): boolean {
    return false;
  }
}
