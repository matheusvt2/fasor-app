import { act, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESS_AND_HOLD_MS, usePressAndHold } from './use-press-and-hold.ts';

function pointerEvent(overrides: Partial<ReactPointerEvent> = {}): ReactPointerEvent {
  return { button: 0, clientX: 0, clientY: 0, pointerType: 'touch', ...overrides } as ReactPointerEvent;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePressAndHold', () => {
  it('fires onHold after ~300ms of a still press, with the pointer type', () => {
    const onHold = vi.fn();
    const { result } = renderHook(() => usePressAndHold({ onHold }));

    act(() => result.current.onPointerDown(pointerEvent({ pointerType: 'touch' })));
    expect(onHold).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(PRESS_AND_HOLD_MS - 1));
    expect(onHold).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onHold).toHaveBeenCalledWith('touch');
    expect(result.current.isHolding).toBe(true);
  });

  it('never fires from hover alone: without a pointerdown, nothing happens', () => {
    const onHold = vi.fn();
    const { result } = renderHook(() => usePressAndHold({ onHold }));
    act(() => result.current.onPointerMove(pointerEvent({ clientX: 5, clientY: 5 })));
    act(() => vi.advanceTimersByTime(PRESS_AND_HOLD_MS + 50));
    expect(onHold).not.toHaveBeenCalled();
  });

  it('cancels the pending hold when the pointer moves before the threshold (no swipe interpretation)', () => {
    const onHold = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() => usePressAndHold({ onHold, onCancel }));

    act(() => result.current.onPointerDown(pointerEvent({ clientX: 0, clientY: 0 })));
    act(() => result.current.onPointerMove(pointerEvent({ clientX: 40, clientY: 0 })));
    expect(onCancel).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(PRESS_AND_HOLD_MS + 50));
    expect(onHold).not.toHaveBeenCalled();
  });

  it('cancels when the pointer is released before the threshold elapses', () => {
    const onHold = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() => usePressAndHold({ onHold, onCancel }));

    act(() => result.current.onPointerDown(pointerEvent()));
    act(() => vi.advanceTimersByTime(PRESS_AND_HOLD_MS / 2));
    act(() => result.current.onPointerUp(pointerEvent()));

    expect(onCancel).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(PRESS_AND_HOLD_MS));
    expect(onHold).not.toHaveBeenCalled();
  });

  it('small jitter under the movement threshold does not cancel the hold', () => {
    const onHold = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() => usePressAndHold({ onHold, onCancel }));

    act(() => result.current.onPointerDown(pointerEvent({ clientX: 0, clientY: 0 })));
    act(() => result.current.onPointerMove(pointerEvent({ clientX: 2, clientY: -2 })));
    act(() => vi.advanceTimersByTime(PRESS_AND_HOLD_MS));

    expect(onCancel).not.toHaveBeenCalled();
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('ignores a second pointer going down while the first session is pending or active, never overwriting it or calling onCancel', () => {
    const onHold = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() => usePressAndHold({ onHold, onCancel }));

    act(() => result.current.onPointerDown(pointerEvent({ pointerId: 1, pointerType: 'touch' })));
    // A second, unrelated pointer goes down and moves while the first hold is still pending.
    act(() => result.current.onPointerDown(pointerEvent({ pointerId: 2, pointerType: 'mouse', clientX: 5, clientY: 5 })));
    act(() => result.current.onPointerMove(pointerEvent({ pointerId: 2, clientX: 100, clientY: 100 })));
    expect(onCancel).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(PRESS_AND_HOLD_MS));
    expect(onCancel).not.toHaveBeenCalled();
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(onHold).toHaveBeenCalledWith('touch');

    // The second pointer releasing must not end the first pointer's active hold.
    act(() => result.current.onPointerUp(pointerEvent({ pointerId: 2 })));
    expect(result.current.isHolding).toBe(true);
  });

  it('captures the pointer on down and releases it on up, ignoring capture calls/events from other pointers', () => {
    const onHold = vi.fn();
    const target = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    } as unknown as Element;
    const { result } = renderHook(() => usePressAndHold({ onHold }));

    act(() => result.current.onPointerDown(pointerEvent({ pointerId: 7, currentTarget: target })));
    expect(target.setPointerCapture).toHaveBeenCalledWith(7);

    act(() => vi.advanceTimersByTime(PRESS_AND_HOLD_MS));
    expect(result.current.isHolding).toBe(true);

    // An unrelated pointer's up must not release capture or end this session.
    act(() => result.current.onPointerUp(pointerEvent({ pointerId: 99 })));
    expect(result.current.isHolding).toBe(true);
    expect(target.releasePointerCapture).not.toHaveBeenCalled();

    act(() => result.current.onPointerUp(pointerEvent({ pointerId: 7, currentTarget: target })));
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(result.current.isHolding).toBe(false);
  });
});
