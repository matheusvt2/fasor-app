import { useEffect, useState, type RefObject } from 'react';

/**
 * How far past the viewport an element must go before it counts as gone. The Sticky action
 * bar grows by its Bulk action mirror (about 80 px) once the checklist is on screen, and
 * that growth can move the checklist by up to its own height. With one boundary the two
 * fed each other: shown, the page shifted, hidden, it shifted back, every frame, a render
 * loop that flickered the bar and kept the sheet busy (E5-A1). The mirror now appears as
 * soon as the element touches the viewport and goes only once it is this far out of it,
 * wider than any shift the mirror itself causes.
 */
export const ON_SCREEN_LEAVE_MARGIN_PX = 200;

/**
 * True while the element is on screen, with hysteresis: it turns true when the element
 * intersects the viewport and false only when it no longer intersects the viewport grown
 * by `ON_SCREEN_LEAVE_MARGIN_PX` on every side. `key` re-attaches the observers when the
 * element changes (another sheet).
 */
export function useOnScreen(ref: RefObject<HTMLElement | null>, key: unknown): boolean {
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof IntersectionObserver === 'undefined') return;
    const enter = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setOnScreen(true);
    });
    const leave = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) setOnScreen(false);
      },
      { rootMargin: `${ON_SCREEN_LEAVE_MARGIN_PX}px` },
    );
    enter.observe(element);
    leave.observe(element);
    return () => {
      enter.disconnect();
      leave.disconnect();
    };
  }, [ref, key]);
  return onScreen;
}

/** How much of an element's box is inside the viewport, in px of height (0 when none). */
function visibleHeight(element: Element): number {
  const rect = element.getBoundingClientRect();
  const viewport = typeof window === 'undefined' ? 0 : window.innerHeight;
  return Math.max(0, Math.min(rect.bottom, viewport) - Math.max(rect.top, 0));
}

/**
 * Story 6.1: the sheet step the engineer is looking at when the camera opens: the
 * `[data-step]` section with the most of itself in the viewport, or null when none is (a
 * test DOM with no layout). The caption's activity comes from it (`contextCaption`).
 */
export function stepOnScreen(root: ParentNode = document): string | null {
  let best: { step: string; height: number } | null = null;
  for (const element of root.querySelectorAll<HTMLElement>('[data-step]')) {
    const height = visibleHeight(element);
    const step = element.dataset.step;
    if (step === undefined || height <= 0) continue;
    if (best === null || height > best.height) best = { step, height };
  }
  return best?.step ?? null;
}

/**
 * Story 6.1: the test table nearest the viewport top among those on screen
 * (`[data-test-key]` in the Ensaios step), or null when none is visible.
 */
export function testKeyOnScreen(root: ParentNode = document): string | null {
  let best: { key: string; top: number } | null = null;
  for (const element of root.querySelectorAll<HTMLElement>('#ficha-step-ensaios [data-test-key]')) {
    const key = element.dataset.testKey;
    if (key === undefined || visibleHeight(element) <= 0) continue;
    const top = Math.abs(element.getBoundingClientRect().top);
    if (best === null || top < best.top) best = { key, top };
  }
  return best?.key ?? null;
}
