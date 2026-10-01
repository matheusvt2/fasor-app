import { useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { ui } from '../copy/ui';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastMessage {
  id: number;
  text: string;
  action?: ToastAction;
  /**
   * Called when the user dismisses the toast (its close control or Esc), never when it
   * expires, is replaced or closes through its action.
   */
  onDismiss?: () => void;
}

/**
 * `.toast` from `key-home.html` frame 3: one line, `role="status"`, and an optional
 * `.toast-action` whose 48px hit area comes from `components.css`. Never used for an
 * error that needs a decision — those are a Banner or a Confirm dialog.
 *
 * A toast with an action does not expire by itself, so it also carries a dismiss control
 * with the same `.toast-action` look, and Esc on either control dismisses it (retro U7).
 */
export function Toast({
  toast,
  onClose,
  onDismiss,
}: {
  toast: ToastMessage;
  /** The toast is done (its action ran): close it quietly. */
  onClose: () => void;
  /** The user dismissed it. */
  onDismiss: () => void;
}) {
  // The element that held focus before focus entered the toast: Esc hands focus back to it,
  // so a keyboard user is not left on `body` once the toast is gone.
  const returnTo = useRef<HTMLElement | null>(null);
  const element = useRef<HTMLDivElement>(null);
  useStickyBarClearance(element);

  function onFocus(event: FocusEvent<HTMLDivElement>) {
    const from = event.relatedTarget;
    if (from instanceof HTMLElement && !event.currentTarget.contains(from)) returnTo.current = from;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    const target = returnTo.current;
    onDismiss();
    restoreFocus(target);
  }

  return (
    <div ref={element} className="toast" role="status" data-testid="toast" onKeyDown={onKeyDown} onFocus={onFocus}>
      <span>{toast.text}</span>
      {toast.action === undefined ? null : (
        <>
          <AriaButton
            className="toast-action"
            onPress={() => {
              toast.action?.onPress();
              onClose();
            }}
          >
            {toast.action.label}
          </AriaButton>
          <AriaButton className="toast-action" onPress={onDismiss}>
            {ui.toast.dismiss}
          </AriaButton>
        </>
      )}
    </div>
  );
}

/**
 * F-02 (review 2026-09-30): the toast is fixed to the viewport (`app.css`) and sits above the
 * page's Sticky action bar, whose height varies (one row of buttons, a phone's stacked
 * column, the compact bulk bar). `--toast-bar` carries how much of the viewport's bottom
 * the bar covers, measured now and whenever the page scrolls or resizes; `app.css` keeps the
 * mock's own distance when no bar is in view.
 */
function useStickyBarClearance(element: { current: HTMLDivElement | null }): void {
  useLayoutEffect(() => {
    const toast = element.current;
    if (toast === null || typeof window === 'undefined') return;
    const place = () => {
      let covered = 0;
      for (const bar of document.querySelectorAll<HTMLElement>('.sticky-action-bar')) {
        const box = bar.getBoundingClientRect();
        if (box.height === 0 || box.top >= window.innerHeight || box.bottom <= 0) continue;
        covered = Math.max(covered, window.innerHeight - box.top);
      }
      toast.style.setProperty('--toast-bar', `${Math.max(0, Math.round(covered))}px`);
    };
    place();
    window.addEventListener('scroll', place, { passive: true, capture: true });
    window.addEventListener('resize', place);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    for (const bar of document.querySelectorAll<HTMLElement>('.sticky-action-bar')) observer?.observe(bar);
    return () => {
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', place);
      observer?.disconnect();
    };
  });
}

/**
 * Focus back on `target` when it is still on the page and takes focus, else on the screen's
 * `main` (made programmatically focusable, never a tab stop), else nowhere.
 */
function restoreFocus(target: HTMLElement | null) {
  if (target !== null && target.isConnected) {
    target.focus();
    if (document.activeElement === target) return;
  }
  const main = document.querySelector('main');
  if (!(main instanceof HTMLElement)) return;
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  main.focus();
}
