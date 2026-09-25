import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_CAP_MS, installPressHold, isPointerHeld, isPointerModality, RELEASE_AFTER_UP_MS, resetPressHoldForTests, useHeldWhilePressed } from './press-hold.ts';

function pointer(type: 'pointerdown' | 'pointerup' | 'pointercancel', init: { isPrimary?: boolean; button?: number } = {}): void {
  // jsdom has no PointerEvent constructor everywhere; a MouseEvent carrying the fields is enough here.
  const event = new MouseEvent(type, { bubbles: true, button: init.button ?? 0 });
  Object.defineProperty(event, 'isPrimary', { value: init.isPrimary ?? true });
  document.body.dispatchEvent(event);
}

beforeEach(() => {
  vi.useFakeTimers();
  resetPressHoldForTests();
  installPressHold();
});

afterEach(() => {
  resetPressHoldForTests();
  vi.useRealTimers();
});

describe('press-hold store', () => {
  it('holds from a primary pointer down until one task after the click that follows the pointer up', () => {
    pointer('pointerdown');
    expect(isPointerHeld()).toBe(true);
    pointer('pointerup');
    expect(isPointerHeld()).toBe(true);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(isPointerHeld()).toBe(true);
    vi.advanceTimersByTime(0);
    expect(isPointerHeld()).toBe(false);
  });

  it('releases a pointer up with no click after RELEASE_AFTER_UP_MS (a long press on touch)', () => {
    pointer('pointerdown');
    pointer('pointerup');
    vi.advanceTimersByTime(RELEASE_AFTER_UP_MS - 1);
    expect(isPointerHeld()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isPointerHeld()).toBe(false);
  });

  it('releases at once on pointercancel (a touch scroll)', () => {
    pointer('pointerdown');
    pointer('pointercancel');
    expect(isPointerHeld()).toBe(false);
  });

  it('never holds longer than HOLD_CAP_MS with the pointer still down', () => {
    pointer('pointerdown');
    vi.advanceTimersByTime(HOLD_CAP_MS - 1);
    expect(isPointerHeld()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isPointerHeld()).toBe(false);
  });

  it('ignores a secondary button and a non-primary pointer', () => {
    pointer('pointerdown', { button: 2 });
    expect(isPointerHeld()).toBe(false);
    pointer('pointerdown', { isPrimary: false });
    expect(isPointerHeld()).toBe(false);
  });

  it('tells a pointer from a key by the latest input', () => {
    expect(isPointerModality()).toBe(false);
    pointer('pointerdown');
    expect(isPointerModality()).toBe(true);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(isPointerModality()).toBe(false);
  });
});

describe('useHeldWhilePressed', () => {
  it('returns the live value while no pointer is down', () => {
    const { result, rerender } = renderHook(({ value }) => useHeldWhilePressed(value), { initialProps: { value: 1 } });
    expect(result.current).toBe(1);
    rerender({ value: 2 });
    expect(result.current).toBe(2);
  });

  it('keeps the value seen at pointer down while held, then renders the newest one on release', () => {
    const { result, rerender } = renderHook(({ value }) => useHeldWhilePressed(value), { initialProps: { value: 'before' } });
    act(() => pointer('pointerdown'));
    // A write lands mid-press and the surface re-renders with the new rows.
    rerender({ value: 'after' });
    expect(result.current).toBe('before');
    act(() => {
      pointer('pointerup');
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe('after');
  });

  it('releases a held value when the cap passes with the pointer still down', () => {
    const { result, rerender } = renderHook(({ value }) => useHeldWhilePressed(value), { initialProps: { value: 1 } });
    act(() => pointer('pointerdown'));
    rerender({ value: 2 });
    expect(result.current).toBe(1);
    act(() => vi.advanceTimersByTime(HOLD_CAP_MS));
    expect(result.current).toBe(2);
  });
});
