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
  useToastClearance(element);
  useFocusedClearOfToast(element, toast.id);
  // Review fixes 2026-10-08: a toast withdrawn, expired or advanced while the keyboard focus is in
  // it hands the focus back as Esc does; its own "Ver", "Fechar" and Esc decide for themselves.
  const ownExit = useRef(false);
  useLayoutEffect(() => {
    ownExit.current = false;
    const host = element.current;
    return () => {
      if (ownExit.current || host === null || !host.contains(document.activeElement)) return;
      restoreFocus(returnTo.current);
    };
  }, [toast.id]);

  function onFocus(event: FocusEvent<HTMLDivElement>) {
    const from = event.relatedTarget;
    if (from instanceof HTMLElement && !event.currentTarget.contains(from)) returnTo.current = from;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    const target = returnTo.current;
    ownExit.current = true;
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
              ownExit.current = true;
              toast.action?.onPress();
              onClose();
            }}
          >
            {toast.action.label}
          </AriaButton>
          <AriaButton
            className="toast-action"
            onPress={() => {
              ownExit.current = true;
              onDismiss();
            }}
          >
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

/** The root's custom property: the toast's own height plus the `--sp-3` gap, while a toast is up (the scroll padding). */
export const TOAST_CLEARANCE = '--toast-clearance';
/** The root's attribute while a toast is up (`app.css` adds the toast's own distance to a page with no Sticky action bar). */
export const TOAST_UP = 'data-toast-up';
/** The root's custom property and attribute for the bottom room after the content, which may outlive the toast a moment. */
export const TOAST_ROOM = '--toast-room';
export const TOAST_ROOM_UP = 'data-toast-room';

/** The furthest the room reaches from the page's end: the toast's height, the gap and its own distance from the bottom. */
const ROOM_SLACK_PX = 12 + 56 + 24;

/** Ends a room left after its toast (a scroll took it out of view, a route change, a new toast). */
let lingering: (() => void) | null = null;

/** Drops the bottom room a toast left behind, now (a route change, a new toast). */
export function dropToastRoom(): void {
  lingering?.();
}

function removeRoom(root: HTMLElement): void {
  root.style.removeProperty(TOAST_ROOM);
  root.removeAttribute(TOAST_ROOM_UP);
}

/**
 * Review fixes 2026-10-08 (H-7, FLD-7's covering part, DE-6): a toast never covers the last rows
 * of a page nor a field Tab lands on. While a toast is up the root carries `--toast-clearance`,
 * the toast's own height plus the `--sp-3` gap, never its position (`--toast-bar` already
 * depends on the sticky bar, and a clearance derived from where the toast sits would move the
 * bar and feed back into itself). `app.css` adds it to the page's `scroll-padding-bottom`, which
 * goes with the toast, and as the room after the content (`--toast-room`), before the page's
 * Sticky action bar. Re-measured when the toast's text wraps to another line count.
 *
 * When the toast leaves with the page scrolled within the room's reach of its end, dropping the
 * room would shrink the page under the reader and move what they look at; the room stays until a
 * scroll takes it out of view (dropping it then moves nothing visible), a route changes or
 * another toast comes. Anywhere else it goes at once. It is never kept beyond those.
 */
function useToastClearance(element: { current: HTMLDivElement | null }): void {
  useLayoutEffect(() => {
    const toast = element.current;
    if (typeof window === 'undefined' || toast === null) return;
    const root = document.documentElement;
    // A room left by the previous toast is this one's now.
    if (lingering !== null) {
      const end = lingering;
      lingering = null;
      end();
    }
    let height = 0;
    const place = () => {
      height = Math.ceil(toast.getBoundingClientRect().height);
      const value = `calc(${height}px + var(--sp-3))`;
      root.style.setProperty(TOAST_CLEARANCE, value);
      root.style.setProperty(TOAST_ROOM, value);
    };
    place();
    root.setAttribute(TOAST_UP, '');
    root.setAttribute(TOAST_ROOM_UP, '');
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(toast);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(TOAST_CLEARANCE);
      root.removeAttribute(TOAST_UP);
      const reach = height + ROOM_SLACK_PX;
      const inView = () => window.scrollY + window.innerHeight > root.scrollHeight - reach;
      if (!inView()) {
        removeRoom(root);
        return;
      }
      const onScroll = () => {
        if (!inView()) end();
      };
      const end = () => {
        window.removeEventListener('scroll', onScroll);
        if (lingering === end) lingering = null;
        removeRoom(root);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      lingering = end;
    };
  }, [element]);
}

/** The `--sp-3` gap in px, read off the root (12 px when the tokens are not loaded). */
function gapPx(): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sp-3'));
  return Number.isFinite(value) ? value : 12;
}

/**
 * Review fixes 2026-10-08 (H-7): the focused element, when the toast's box overlaps it, scrolls
 * until it ends `--sp-3` above the toast's top edge, never past its own top (the page's
 * `scroll-padding-top`): an element taller than the room above the toast keeps its start in view. Elements inside the toast or a dialog
 * (which sits over the toast) are left alone.
 */
export function keepClearOfToast(target: Element | null, toast: HTMLElement): void {
  if (!(target instanceof HTMLElement) || target === document.body || target === document.documentElement) return;
  if (toast.contains(target) || target.closest('[role="dialog"], [role="alertdialog"]') !== null) return;
  const box = target.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return;
  const over = toast.getBoundingClientRect();
  const overlaps = box.bottom > over.top && box.top < over.bottom && box.right > over.left && box.left < over.right;
  if (!overlaps) return;
  // Never past the element's own top (under the App bar): a section host focused by a stepper
  // jump is taller than the room above the toast, and must land at its start, not its end.
  const topInset = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
  const room = box.top - (Number.isFinite(topInset) ? topInset : 0);
  const by = Math.min(Math.ceil(box.bottom - over.top + gapPx()), Math.floor(room));
  if (by <= 0) return;
  window.scrollBy({ top: by, behavior: 'instant' });
}

/** Runs the focused-element rule when a toast is displayed and whenever the focus moves while it is up. */
function useFocusedClearOfToast(element: { current: HTMLDivElement | null }, toastId: number): void {
  useLayoutEffect(() => {
    const toast = element.current;
    if (typeof window === 'undefined' || toast === null) return;
    keepClearOfToast(document.activeElement, toast);
  }, [element, toastId]);
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    let frame: number | null = null;
    // After the browser's own scroll of the focus into view, which runs with the focus itself.
    const onFocusIn = (event: globalThis.FocusEvent) => {
      if (frame !== null) cancelAnimationFrame(frame);
      const target = event.target instanceof Element ? event.target : null;
      frame = requestAnimationFrame(() => {
        frame = null;
        const toast = element.current;
        if (toast !== null && target !== null && document.activeElement === target) keepClearOfToast(target, toast);
      });
    };
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [element]);
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
