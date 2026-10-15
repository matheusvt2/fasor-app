import { afterEach, describe, expect, it, vi } from 'vitest';
import { stageClock, timingReporter, type GenerateTiming } from './job.ts';

/*
 * Story 14.10 part 4: a job's stage times are reported once (one `generate timing` line, one
 * `onTiming` call), and a throwing `onTiming` only logs.
 */

const fields = { company_id: 'c', relatorio_id: 'r', job_id: 'j' };

afterEach(() => {
  vi.restoreAllMocks();
});

function timingLines(spy: { mock: { calls: unknown[][] } }): Record<string, unknown>[] {
  return spy.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>).filter((line) => line.msg === 'generate timing');
}

describe('14.10 timingReporter', () => {
  it('reports once: a "failed" after a "done" (a throw after the commit) logs no second line and calls the hook no second time', async () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const clock = stageClock();
    await clock.time('freeze', () => 1);
    const seen: GenerateTiming[] = [];
    const report = timingReporter({ fields, kind: 'issue', started: 1_000, clock, onTiming: (timing) => seen.push(timing), now: () => 4_000 });
    report('done');
    report('failed');
    report('done');
    expect(seen).toEqual([{ kind: 'issue', outcome: 'done', total_ms: 3_000, stages_ms: { freeze: expect.any(Number) } }]);
    const lines = timingLines(out);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ job_id: 'j', kind: 'issue', outcome: 'done', total_ms: 3_000 });
  });

  it('a throwing hook is logged as an error and never throws out of the report', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const report = timingReporter({
      fields,
      kind: 'preview',
      started: 0,
      clock: stageClock(),
      onTiming: () => {
        throw new Error('hook broke');
      },
      now: () => 0,
    });
    expect(() => report('done')).not.toThrow();
    const errors = err.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);
    expect(errors).toEqual([expect.objectContaining({ msg: 'generate timing hook failed', job_id: 'j', error: 'Error: hook broke' })]);
  });

  it('with no hook it still logs its one line', () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    timingReporter({ fields, kind: 'preview', started: 0, clock: stageClock(), now: () => 0 })('failed');
    expect(timingLines(out)).toEqual([expect.objectContaining({ outcome: 'failed', total_ms: 0, stages_ms: {} })]);
  });
});
