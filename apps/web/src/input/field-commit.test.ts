// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFieldCommitter, FIELD_COMMIT_IDLE_MS } from './field-commit.ts';

describe('field commit timing (AD-1)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('commits once after 500 ms idle, with the latest value', () => {
    const commit = vi.fn();
    const field = createFieldCommitter<string>({ commit });
    field.change('W');
    vi.advanceTimersByTime(300);
    field.change('WE');
    vi.advanceTimersByTime(300);
    field.change('WEG');
    expect(commit).not.toHaveBeenCalled();
    expect(field.pending).toBe(true);
    vi.advanceTimersByTime(FIELD_COMMIT_IDLE_MS - 1);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('WEG');
    expect(field.pending).toBe(false);
  });

  it('blur before the idle timer commits at once and the timer does not commit again', () => {
    const commit = vi.fn();
    const field = createFieldCommitter<string>({ commit });
    field.change('abc');
    vi.advanceTimersByTime(100);
    field.blur();
    expect(commit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('Enter before the idle timer commits at once, whichever fires first', () => {
    const commit = vi.fn();
    const field = createFieldCommitter<string>({ commit });
    field.change('12');
    field.enter();
    expect(commit).toHaveBeenCalledWith('12');
    field.blur();
    vi.advanceTimersByTime(1000);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('blur or Enter with nothing pending commits nothing', () => {
    const commit = vi.fn();
    const field = createFieldCommitter<string>({ commit });
    field.blur();
    field.enter();
    field.flush();
    expect(commit).not.toHaveBeenCalled();
  });

  it('immediate commits at once and drops a pending change', () => {
    const commit = vi.fn();
    const field = createFieldCommitter<string>({ commit });
    field.change('typed');
    field.immediate('C');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('C');
    vi.advanceTimersByTime(1000);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('dispose drops the pending change without committing', () => {
    const commit = vi.fn();
    const field = createFieldCommitter<string>({ commit });
    field.change('x');
    field.dispose();
    vi.advanceTimersByTime(1000);
    expect(commit).not.toHaveBeenCalled();
    expect(field.pending).toBe(false);
  });

  it('keeps the value pending when commit throws', () => {
    let fail = true;
    const commit = vi.fn(() => {
      if (fail) throw new Error('store unavailable');
    });
    const field = createFieldCommitter<string>({ commit });
    field.change('kept');
    expect(() => field.blur()).toThrow('store unavailable');
    expect(field.pending).toBe(true);
    fail = false;
    field.blur();
    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenLastCalledWith('kept');
    expect(field.pending).toBe(false);
  });

  it('honours an injected idle time and timers', () => {
    const commit = vi.fn();
    const scheduled: { callback: () => void; ms: number }[] = [];
    const timers = {
      setTimeout: (callback: () => void, ms: number) => {
        scheduled.push({ callback, ms });
        return scheduled.length;
      },
      clearTimeout: vi.fn(),
    };
    const field = createFieldCommitter<string>({ commit, idleMs: 200, timers });
    field.change('a');
    field.change('ab');
    expect(scheduled.map((s) => s.ms)).toEqual([200, 200]);
    expect(timers.clearTimeout).toHaveBeenCalledWith(1);
    scheduled[1]!.callback();
    expect(commit).toHaveBeenCalledWith('ab');
  });
});
