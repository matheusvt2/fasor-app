import { WAKE_LOCK_IDLE_MS } from '@app/domain';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdScreenWakeLock, resetScreenWakeLockForTests, setKeepScreenOn, useScreenWakeLock } from './use-screen-wake-lock.ts';

/*
 * R8CAP-UNIT (review 2026-10-08, FLD-1): one screen wake lock for the whole page, held while a
 * surface wants it, the "Manter a tela ligada" switch is on, the page is visible and a touch or
 * key came in the last ten minutes; given back otherwise, and asked for again on the next touch
 * or key, or when the page is visible again. A missing or refusing API shows nothing.
 */

interface FakeSentinel {
  released: boolean;
  release: ReturnType<typeof vi.fn>;
  addEventListener: (type: 'release', listener: () => void) => void;
  fireRelease: () => void;
}

function fakeWakeLock(mode: 'grant' | 'reject' | 'throw' = 'grant') {
  const sentinels: FakeSentinel[] = [];
  const request = vi.fn((type: 'screen') => {
    expect(type).toBe('screen');
    if (mode === 'throw') throw new DOMException('policy', 'NotAllowedError');
    if (mode === 'reject') return Promise.reject(new DOMException('battery saver', 'NotAllowedError'));
    const listeners: (() => void)[] = [];
    const sentinel: FakeSentinel = {
      released: false,
      release: vi.fn(async () => sentinel.fireRelease()),
      addEventListener: (_type, listener) => listeners.push(listener),
      fireRelease: () => {
        sentinel.released = true;
        listeners.forEach((listener) => listener());
      },
    };
    sentinels.push(sentinel);
    return Promise.resolve(sentinel);
  });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  return { request, sentinels, held: () => sentinels.filter((sentinel) => !sentinel.released) };
}

let visibility: DocumentVisibilityState = 'visible';

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  resetScreenWakeLockForTests();
});

afterEach(() => {
  resetScreenWakeLockForTests();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'wakeLock');
});

const settle = () => vi.advanceTimersByTimeAsync(0);

describe('R8CAP-UNIT the screen wake lock', () => {
  it('holds one screen sentinel while a surface wants it and the switch is on; gives it back when the last one leaves', async () => {
    const lock = fakeWakeLock();
    setKeepScreenOn(true);
    const first = holdScreenWakeLock();
    const second = holdScreenWakeLock();
    await settle();
    expect(lock.request).toHaveBeenCalledTimes(1);
    expect(lock.held()).toHaveLength(1);
    first();
    await settle();
    expect(lock.held()).toHaveLength(1);
    second();
    await settle();
    expect(lock.held()).toHaveLength(0);
    // A give-back called twice counts once.
    second();
    expect(lock.request).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing until the switch is known, nor with it off; on again, it asks', async () => {
    const lock = fakeWakeLock();
    const release = holdScreenWakeLock();
    await settle();
    expect(lock.request).not.toHaveBeenCalled();
    setKeepScreenOn(false);
    await settle();
    expect(lock.request).not.toHaveBeenCalled();
    setKeepScreenOn(true);
    await settle();
    expect(lock.held()).toHaveLength(1);
    setKeepScreenOn(false);
    await settle();
    expect(lock.held()).toHaveLength(0);
    release();
  });

  it('ten minutes without a touch or a key give it back; the next touch takes it again, and a key keeps it', async () => {
    const lock = fakeWakeLock();
    setKeepScreenOn(true);
    const release = holdScreenWakeLock();
    await settle();
    expect(lock.held()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(WAKE_LOCK_IDLE_MS - 1_000);
    expect(lock.held()).toHaveLength(1);
    // A key at 9:59 starts the ten minutes again.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    await vi.advanceTimersByTimeAsync(WAKE_LOCK_IDLE_MS - 1_000);
    expect(lock.held()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(lock.held()).toHaveLength(0);
    window.dispatchEvent(new Event('pointerdown'));
    await settle();
    expect(lock.request).toHaveBeenCalledTimes(2);
    expect(lock.held()).toHaveLength(1);
    release();
  });

  it('a hidden page gives it back (the browser drops it too); visible again, it is taken again', async () => {
    const lock = fakeWakeLock();
    setKeepScreenOn(true);
    const release = holdScreenWakeLock();
    await settle();
    // The browser releases the sentinel on hide; the manager hears it.
    visibility = 'hidden';
    lock.sentinels[0]!.fireRelease();
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(lock.request).toHaveBeenCalledTimes(1);
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(lock.request).toHaveBeenCalledTimes(2);
    expect(lock.held()).toHaveLength(1);
    // Visible after a long time away counts as a touch: held, not idle.
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(WAKE_LOCK_IDLE_MS * 2);
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(lock.request).toHaveBeenCalledTimes(3);
    expect(lock.held()).toHaveLength(1);
    release();
  });

  it('a request that rejects or throws shows nothing and is asked again only on the next touch or visibility change', async () => {
    for (const mode of ['reject', 'throw'] as const) {
      resetScreenWakeLockForTests();
      const lock = fakeWakeLock(mode);
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      setKeepScreenOn(true);
      const release = holdScreenWakeLock();
      await settle();
      expect(lock.request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(lock.request).toHaveBeenCalledTimes(1);
      window.dispatchEvent(new Event('pointerdown'));
      await settle();
      expect(lock.request).toHaveBeenCalledTimes(2);
      document.dispatchEvent(new Event('visibilitychange'));
      await settle();
      expect(lock.request).toHaveBeenCalledTimes(3);
      expect(errors).not.toHaveBeenCalled();
      release();
      errors.mockRestore();
    }
  });

  it('without the API nothing happens and nothing throws', async () => {
    Reflect.deleteProperty(navigator, 'wakeLock');
    setKeepScreenOn(true);
    const release = holdScreenWakeLock();
    window.dispatchEvent(new Event('pointerdown'));
    await settle();
    release();
  });

  it('the hook: a surface without a session reads the switch on by default and holds the lock while active', async () => {
    const lock = fakeWakeLock();
    function Surface({ active }: { active: boolean }) {
      useScreenWakeLock(active);
      return null;
    }
    const { rerender, unmount } = render(<Surface active />);
    await vi.waitFor(() => expect(lock.held()).toHaveLength(1));
    rerender(<Surface active={false} />);
    await settle();
    expect(lock.held()).toHaveLength(0);
    rerender(<Surface active />);
    await vi.waitFor(() => expect(lock.held()).toHaveLength(1));
    unmount();
    await settle();
    expect(lock.held()).toHaveLength(0);
  });
});
