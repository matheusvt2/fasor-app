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
 * How much of the viewport's bottom the page's Sticky action bars cover, in px: the largest
 * `innerHeight - top` of a bar in view. `pageOnly` counts only a bar of the page itself: its
 * computed position is `sticky` (a static bar flows after the content and covers nothing a
 * scroll lands on) and it is not inside a dialog (the caption composer's own bar).
 */
export function stickyBarCovered(pageOnly = false): number {
  let covered = 0;
  for (const bar of document.querySelectorAll<HTMLElement>('.sticky-action-bar')) {
    if (pageOnly && (getComputedStyle(bar).position !== 'sticky' || bar.closest('[role="dialog"]') !== null)) continue;
    const box = bar.getBoundingClientRect();
    if (box.height === 0 || box.top >= window.innerHeight || box.bottom <= 0) continue;
    covered = Math.max(covered, window.innerHeight - box.top);
  }
  return Math.max(0, Math.round(covered));
}

/** Calls `place` now, on every scroll and resize, and whenever a Sticky action bar changes size; returns the detach. */
function attachBarMeasure(place: () => void): () => void {
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
}

/**
 * F-02 (review 2026-09-30): the toast is fixed to the viewport (`app.css`) and sits above the
 * page's Sticky action bar, whose height varies (one row of buttons, a phone's stacked
 * column, the compact bulk bar). `--toast-bar` carries how much of the viewport's bottom
 * the bar covers, measured now and whenever the page scrolls or resizes; `app.css` keeps the
 * mock's own distance when no bar is in view. Re-attached after every render: the bar may
 * appear after the toast.
 */
function useStickyBarClearance(element: { current: HTMLDivElement | null }): void {
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    return attachBarMeasure(() => {
      element.current?.style.setProperty('--toast-bar', `${stickyBarCovered()}px`);
    });
  });
}

/** The root's custom property `app.css` turns into `scroll-padding-bottom`. */
export const STICKY_BAR_COVERED = '--sticky-bar-covered';

/**
 * Review fixes 2026-10-06 (F-11): a field focused by Tab or by the Enter "next" run scrolls
 * natively into view, and without a padding it can land under the sheet's Sticky action bar
 * (124 px on a tablet, about 200 on a phone, more with the Bulk mirror). The same measure as
 * the toast's, of the page's sticky bars only (not a bar inside a dialog), goes to `--sticky-bar-covered` on the document element
 * (written only when it changes; 0 when the bar is static, under a 480 px viewport height),
 * which `app.css` uses as the page's `scroll-padding-bottom`. Mounted by the bar itself, so
 * the padding exists exactly while a bar does.
 */
export function useStickyBarScrollPadding(): void {
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    let last: string | null = null;
    const detach = attachBarMeasure(() => {
      const value = `${stickyBarCovered(true)}px`;
      if (last === value) return;
      last = value;
      document.documentElement.style.setProperty(STICKY_BAR_COVERED, value);
    });
    return () => {
      detach();
      document.documentElement.style.removeProperty(STICKY_BAR_COVERED);
    };
  }, []);
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
