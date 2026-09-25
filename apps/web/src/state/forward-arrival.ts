import { useLayoutEffect, useRef, type RefObject } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router';

/**
 * E12-Q2: every forward navigation lands the new page at its top with the focus on its
 * heading, never at the old page's scroll position with the focus on `<body>`. A push or
 * replace to another pathname scrolls the window to the top and focuses `heading` (the App
 * bar's `<h1>`), without scrolling it.
 *
 * It runs as a layout effect of the shell, so it runs before any surface's own arrival:
 * surfaces that land on a target (setup's Etapa heading, the Sumário's row, a section's
 * heading, Cadastros' new instrument) do it in a passive effect or a later frame, and win.
 * A search-only change (setup's `?etapa=`) and a browser back or forward (POP, which the
 * browser restores) are left alone.
 */
export function useForwardArrival(heading: RefObject<HTMLElement | null>): void {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const previous = useRef(pathname);
  useLayoutEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    if (navigationType === NavigationType.Pop) return;
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [pathname, navigationType, heading]);
}
