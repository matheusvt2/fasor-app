import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../state/toast.tsx';
import { useDateField, useTextField } from './setup-fields.ts';

/*
 * Story 30.1 B (L3626): a setup field commits after 500 ms idle, and the commit's echo comes back
 * through the live query. A key typed before that echo lands must stay in the field and be
 * committed; a real write from elsewhere while the field is idle still resyncs it.
 */

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('30.1-UNIT-B: the setup text field and its echo', () => {
  it('a key typed while the earlier commit echoes back stays in the field and is committed', () => {
    const commit = vi.fn();
    const { result, rerender } = renderHook(({ value }) => useTextField(value, commit), { wrapper, initialProps: { value: '' } });
    act(() => result.current.change('Cabine'));
    act(() => vi.advanceTimersByTime(600));
    expect(commit).toHaveBeenLastCalledWith('Cabine');
    // The next key, typed before the echo of "Cabine" lands.
    act(() => result.current.change('Cabine 1'));
    // The echo, held back until now.
    rerender({ value: 'Cabine' });
    expect(result.current.text).toBe('Cabine 1');
    act(() => vi.advanceTimersByTime(600));
    expect(commit).toHaveBeenLastCalledWith('Cabine 1');
    rerender({ value: 'Cabine 1' });
    expect(result.current.text).toBe('Cabine 1');
  });

  it('an echo that lands after the next commit went out is still the field\'s own: the newer text stays', () => {
    const commit = vi.fn();
    const { result, rerender } = renderHook(({ value }) => useTextField(value, commit), { wrapper, initialProps: { value: '' } });
    act(() => result.current.change('A'));
    act(() => vi.advanceTimersByTime(600));
    act(() => result.current.change('AB'));
    act(() => result.current.blur());
    expect(commit).toHaveBeenLastCalledWith('AB');
    rerender({ value: 'A' });
    expect(result.current.text).toBe('AB');
    rerender({ value: 'AB' });
    expect(result.current.text).toBe('AB');
  });

  it('a write from elsewhere while the field is idle still resyncs it', () => {
    const commit = vi.fn();
    const { result, rerender } = renderHook(({ value }) => useTextField(value, commit), { wrapper, initialProps: { value: 'Antes' } });
    rerender({ value: 'De outro aparelho' });
    expect(result.current.text).toBe('De outro aparelho');
    act(() => result.current.change('Meu'));
    act(() => vi.advanceTimersByTime(600));
    rerender({ value: 'Meu' });
    rerender({ value: 'Desfeito' });
    expect(result.current.text).toBe('Desfeito');
  });
});

describe('30.1-UNIT-B: the setup date field and its echo', () => {
  it('a date typed while the earlier commit echoes back stays in the field and is committed', () => {
    const commit = vi.fn();
    const { result, rerender } = renderHook(({ value }) => useDateField(value, commit), { wrapper, initialProps: { value: null as string | null } });
    act(() => result.current.change('2026-11-01'));
    act(() => vi.advanceTimersByTime(600));
    expect(commit).toHaveBeenLastCalledWith('2026-11-01');
    act(() => result.current.change('2026-11-21'));
    rerender({ value: '2026-11-01' });
    expect(result.current.date).toBe('2026-11-21');
    act(() => vi.advanceTimersByTime(600));
    expect(commit).toHaveBeenLastCalledWith('2026-11-21');
    rerender({ value: '2026-11-03' });
    expect(result.current.date).toBe('2026-11-03');
  });
});
