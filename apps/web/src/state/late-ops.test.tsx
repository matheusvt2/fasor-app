import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanSendSince, useLateOpCount } from './late-ops.ts';

/*
 * Story 25.3 (M03), "25.3-WEB" the alert's clock: the count of waiting ops older than one minute flips at 60 001 ms
 * on its own timer (no other render needed) and clears once the op is acked.
 *
 * Fix batch e25x, "e25x A7": the wait is counted on a duration clock. A row stamped far ahead arms one timer of at
 * most 60 001 ms (never an overflowing delay that fires at once, in a loop), and a jump of the corrected clock after a
 * row was seen does not move when it turns late. `vi.setSystemTime` moves the corrected clock (`now`) and not the
 * monotonic one, as a learned offset or a set clock does.
 */

const T0 = Date.parse('2026-11-11T12:00:00.000Z');
const OP = '019966b0-0e25-7000-8000-000000000001';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('25.3-WEB the late clock', () => {
  it('0 at 60 000 ms, 1 at 60 001 ms with no new rows, 0 once the op is acked', () => {
    const pending = [{ op_id: OP, status: 'pending', client_ts: new Date(T0).toISOString() }];
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
    rerender({ rows: [{ op_id: OP, status: 'acked', client_ts: pending[0]!.client_ts }] });
    expect(result.current).toBe(0);
  });

  it('a sent row counts as waiting; a dead one never does', () => {
    const at = new Date(T0 - 120_000).toISOString();
    const { result } = renderHook(() =>
      useLateOpCount([
        { op_id: `${OP.slice(0, -1)}1`, status: 'sent', client_ts: at },
        { op_id: `${OP.slice(0, -1)}2`, status: 'dead', client_ts: at },
        { op_id: `${OP.slice(0, -1)}3`, status: 'acked', client_ts: at },
      ]),
    );
    expect(result.current).toBe(1);
  });
});

describe('e25x A7 the late clock is a duration clock', () => {
  it('a waiting row stamped 30 days ahead arms one timer of at most 60 001 ms, turns late 60 001 ms after it was seen, and arms no more', () => {
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const ahead = [{ op_id: OP, status: 'pending', client_ts: new Date(T0 + 30 * 24 * 60 * 60_000).toISOString() }];
    const { result } = renderHook(() => useLateOpCount(ahead));
    expect(result.current).toBe(0);
    const delays = timers.mock.calls.map((call) => Number(call[1] ?? 0));
    expect(delays.length).toBeGreaterThan(0);
    expect(Math.max(...delays)).toBeLessThanOrEqual(60_001);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(1);
    // Late now: nothing more to wait for, so no timer is armed again (no render loop).
    const armed = timers.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(timers.mock.calls.length).toBe(armed);
    expect(result.current).toBe(1);
  });

  it('a jump of the corrected clock after a row was seen does not change when it turns late', () => {
    const row = { op_id: OP, status: 'pending', client_ts: new Date(T0).toISOString() };
    const { result, rerender } = renderHook(({ rows }) => useLateOpCount(rows), { initialProps: { rows: [row] } });
    expect(result.current).toBe(0);
    // The device learns that its clock was 10 minutes slow: `now` jumps, the row was already being counted.
    vi.setSystemTime(T0 + 10 * 60_000);
    rerender({ rows: [{ ...row }] });
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(1);
  });

  it('a row seen for the first time is read against the corrected clock once: 2 minutes old is late at once', () => {
    const { result } = renderHook(() => useLateOpCount([{ op_id: OP, status: 'pending', client_ts: new Date(T0 - 120_000).toISOString() }]));
    expect(result.current).toBe(1);
  });

  it('useCanSendSince: the first render and each false-to-true change take the clock; true-to-false and repeats keep it', () => {
    const { result, rerender } = renderHook(({ canSend }) => useCanSendSince(canSend), { initialProps: { canSend: false } });
    const first = result.current;
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    rerender({ canSend: false });
    expect(result.current).toBe(first);
    rerender({ canSend: true });
    expect(result.current).toBe(first + 5_000);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    rerender({ canSend: true });
    rerender({ canSend: false });
    expect(result.current).toBe(first + 5_000);
    // A set clock moves nothing: the instant is on the duration clock.
    vi.setSystemTime(T0 + 60 * 60_000);
    rerender({ canSend: true });
    expect(result.current).toBe(first + 10_000);
  });
});
