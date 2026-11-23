import { useContext, useEffect, useRef } from 'react';
import { OverlayTriggerStateContext } from 'react-aria-components';

/*
 * Story 29.2 (EXPERIENCE.md › Accessibility › Dialogs and overlays: "Esc and the system back close
 * them"): an open overlay owns one history entry of the same address, so the device's back (or the
 * browser's) closes the overlay and nothing else, and the screen under it stays as it was.
 *
 * - Opening pushes an entry with the same address and the router's own state, plus a marker
 *   (`OVERLAY_KEY`). React Router never sees the push; going back from it is a pop to the same
 *   address, which renders the same screen.
 * - A pop that leaves an open overlay's entry closes that overlay (and any opened above it).
 * - Closing by any other means (Escape, a tap outside, a button) takes the entry back off, unless
 *   the overlay's own action already moved the app (a navigation pushed or replaced the entry) or
 *   another overlay opens in the same moment (a menu item that opens a dialog), which then takes
 *   the entry over instead of pushing a second one.
 * - Landing by a pop on an entry whose overlay is no longer open (left under a navigation, or kept
 *   by a reload) skips it, so one back never "does nothing".
 *
 * The push and the take-back are deferred one task: StrictMode's mount, unmount and remount push
 * once, and a router navigation started by the overlay's action (which completes in microtasks)
 * has already changed the entry when the take-back looks at it.
 */

export const OVERLAY_KEY = '__overlay';

interface OpenOverlay {
  token: number;
  close: () => void;
}

let sequence = 0;
const open: OpenOverlay[] = [];
const closedByPop = new Set<number>();
let pendingOpens = 0;
let listening = false;

function entryToken(): number | null {
  const state: unknown = window.history.state;
  if (typeof state !== 'object' || state === null) return null;
  const token = (state as Record<string, unknown>)[OVERLAY_KEY];
  return typeof token === 'number' ? token : null;
}

function isOpen(token: number): boolean {
  return open.some((overlay) => overlay.token === token);
}

function stateWith(token: number): Record<string, unknown> {
  const state: unknown = window.history.state;
  return { ...(typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {}), [OVERLAY_KEY]: token };
}

function onPopState(): void {
  const here = entryToken();
  for (let index = open.length - 1; index >= 0; index -= 1) {
    const overlay = open[index]!;
    if (overlay.token === here) break;
    open.splice(index, 1);
    closedByPop.add(overlay.token);
    overlay.close();
  }
  if (here !== null && !isOpen(here) && pendingOpens === 0) window.history.back();
}

function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('popstate', onPopState);
}

/**
 * Gives the overlay that calls it (mounted exactly while the overlay is open) its history entry;
 * `close` is how a back press closes it.
 */
export function useOverlayHistory(close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    listen();
    const overlay: OpenOverlay = { token: (sequence += 1), close: () => closeRef.current() };
    let pushed = false;
    pendingOpens += 1;
    const timer = window.setTimeout(() => {
      pendingOpens -= 1;
      const here = entryToken();
      // An entry whose overlay just closed (a menu item that opened this dialog) is taken over.
      if (here !== null && !isOpen(here)) window.history.replaceState(stateWith(overlay.token), '');
      else window.history.pushState(stateWith(overlay.token), '');
      open.push(overlay);
      pushed = true;
    }, 0);
    return () => {
      if (!pushed) {
        window.clearTimeout(timer);
        pendingOpens -= 1;
        return;
      }
      const index = open.findIndex((entry) => entry.token === overlay.token);
      if (index >= 0) open.splice(index, 1);
      if (closedByPop.delete(overlay.token)) return;
      window.setTimeout(() => {
        // Another overlay opening now takes the entry over; a navigation already replaced it.
        if (pendingOpens > 0 || isOpen(overlay.token)) return;
        if (entryToken() === overlay.token) window.history.back();
      }, 0);
    };
  }, []);
}

/**
 * Rendered inside a React Aria overlay (a `ModalOverlay`, a `MenuTrigger`'s `Popover`): its state
 * context says how to close it, and the overlay mounts this exactly while it is open.
 */
export function OverlayHistory(): null {
  const state = useContext(OverlayTriggerStateContext);
  const stateRef = useRef(state);
  stateRef.current = state;
  useOverlayHistory(() => stateRef.current?.close());
  return null;
}
