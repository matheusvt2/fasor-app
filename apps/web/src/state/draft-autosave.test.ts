import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_AUTOSAVE_IDLE_MS, useDraftAutosave } from './draft-autosave.ts';

/* E6-R1: the draft is written after 300 ms of quiet typing, once per pause, and on leaving. */

describe('E6-R1 useDraftAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes once after 300 ms of quiet, however many keystrokes came before', () => {
    const save = vi.fn(async () => {});
    const { result } = renderHook(() => useDraftAutosave(save));
    expect(DRAFT_AUTOSAVE_IDLE_MS).toBe(300);
    act(() => {
      result.current.changed();
      vi.advanceTimersByTime(200);
      result.current.changed();
      vi.advanceTimersByTime(200);
      result.current.changed();
    });
    expect(save).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(save).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(save).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('calls the latest save, flushes a waiting change at once, and writes it on unmount', () => {
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    const { result, rerender, unmount } = renderHook(({ save }) => useDraftAutosave(save), { initialProps: { save: first } });
    rerender({ save: second });
    act(() => {
      result.current.changed();
      result.current.flush();
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.flush();
    });
    expect(second).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.changed();
    });
    unmount();
    expect(second).toHaveBeenCalledTimes(2);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(second).toHaveBeenCalledTimes(2);
  });
});
