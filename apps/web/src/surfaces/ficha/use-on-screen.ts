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
