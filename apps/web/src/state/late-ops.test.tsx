import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLateOpCount } from './late-ops.ts';

/*
 * Story 25.3 (M03), "25.3-WEB" the alert's clock: the count of waiting ops older than one minute flips at 60 001 ms
 * on its own timer (no other render needed) and clears once the op is acked.
 */

const T0 = Date.parse('2026-11-11T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('25.3-WEB the late clock', () => {
  it('0 at 60 000 ms, 1 at 60 001 ms with no new rows, 0 once the op is acked', () => {
    const pending = [{ status: 'pending', client_ts: new Date(T0).toISOString() }];
    const { result, rerender } = renderHook(({ rows }) => useLateOpCount(rows), { initialProps: { rows: pending } });
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(1);
    rerender({ rows: [{ status: 'acked', client_ts: pending[0]!.client_ts }] });
    expect(result.current).toBe(0);
  });

  it('a sent row counts as waiting; a dead one never does', () => {
    const at = new Date(T0 - 120_000).toISOString();
    const { result } = renderHook(() =>
      useLateOpCount([
        { status: 'sent', client_ts: at },
        { status: 'dead', client_ts: at },
        { status: 'acked', client_ts: at },
      ]),
    );
    expect(result.current).toBe(1);
  });
});
