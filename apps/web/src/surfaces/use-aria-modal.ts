import { useEffect, useRef } from 'react';

/**
 * React Aria deliberately leaves `aria-modal` off its dialogs and hides the rest of the
 * page with `aria-hidden` instead. EXPERIENCE.md's dialog semantics ask for
 * `role="dialog" aria-modal`, so the attribute is set on the same element React Aria put
 * the role on. Everything else — focus containment, Esc, focus return — stays theirs.
 */
export function useAriaModal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.setAttribute('aria-modal', 'true');
  }, []);
  return ref;
}

/**
 * Puts the initial focus on one element of a dialog — "Cancelar" in a Confirm dialog
 * (DESIGN.md: destructive actions never take the focus). React Aria focuses the dialog
 * container when nothing else claims it, so this runs after paint to have the last word.
 */
export function useInitialFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  return ref;
}
