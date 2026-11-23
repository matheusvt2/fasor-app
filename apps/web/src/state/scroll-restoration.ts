import { useEffect, useLayoutEffect, useRef } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router';

/*
 * Story 29.2: the device's back (a POP) returns to the screen the user came from at the scroll it
 * had. The browser's own restoration runs at the pop, before a screen that reads the device store
 * (Home, the Sumário) has drawn its rows, so a tall page came back at the top; here the scroll of
 * each history entry is kept by its router key, and a pop to that entry scrolls there again once
 * the page is tall enough, for at most `RESTORE_BUDGET_MS`, and stops at once if the user scrolls
 * or touches first. A forward navigation is left to `useForwardArrival` (the new page's top).
 */

/** How long a pop keeps trying to reach the kept scroll while the screen draws. */
export const RESTORE_BUDGET_MS = 3_000;

const kept = new Map<string, number>();

/**
 * The router key of the history entry the browser is on now. Read from `history.state` (React
 * Router keeps its `key` there), not from the rendered location: a scroll that lands between an
 * address change and the render of the new screen is the new entry's, never the old one's.
 */
function entryKey(): string {
  const state: unknown = window.history.state;
  const key = typeof state === 'object' && state !== null ? (state as { key?: unknown }).key : undefined;
  return typeof key === 'string' ? key : 'default';
}

export function useScrollRestoration(): void {
  const location = useLocation();
  const navigationType = useNavigationType();
  const keyRef = useRef(location.key);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const onScroll = () => kept.set(entryKey(), window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.history.scrollRestoration = previous;
    };
  }, []);

  useLayoutEffect(() => {
    if (keyRef.current === location.key) return;
    keyRef.current = location.key;
    if (navigationType !== NavigationType.Pop) return;
    const target = kept.get(location.key);
    if (target === undefined || target <= 0) return;
    let frame = 0;
    let stopped = false;
    const started = performance.now();
    const stop = () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('keydown', stop);
    };
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('keydown', stop);
    const attempt = () => {
      if (stopped) return;
      window.scrollTo(0, target);
      if (Math.abs(window.scrollY - target) <= 1 || performance.now() - started > RESTORE_BUDGET_MS) {
        stop();
        return;
      }
      frame = window.requestAnimationFrame(attempt);
    };
    attempt();
    return stop;
  }, [location.key, navigationType]);
}
