import { useContext, useEffect, useRef } from 'react';
import { OverlayTriggerStateContext } from 'react-aria-components';

/*
 * Story 29.2 (EXPERIENCE.md › Accessibility › Dialogs and overlays: "Esc and the system back close
 * them"): an open overlay owns one history entry of the same address, so the device's back (or the
 * browser's) closes the overlay and nothing else, and the screen under it stays as it was.
 *
 * - Opening pushes an entry with the same address and the router's own state, plus a marker
 *   (`OVERLAY_KEY`, a token). React Router never sees the push; a pop from it lands on the same
 *   address, which renders the same screen.
 * - A pop that leaves an open overlay's entry closes that overlay (and any opened above it).
 * - Closing by any other means (Escape, a tap outside, a button) leaves the entry where it is,
 *   released: the overlay's own action may still be navigating (a sheet opens after a write to the
 *   device store), so taking the entry back off then would undo that navigation. A released entry
 *   costs no press: a back from it goes one step further, a pop onto it (back from a later screen)
 *   skips it, and an overlay opening on it takes it over instead of pushing a second one.
 *
 * The push is deferred one task, so StrictMode's mount, unmount and remount push once. React
 * Router's own pushes and replaces are followed (`pushState` and `replaceState` are wrapped once) so
 * "the entry just left" is always known.
 */

export const OVERLAY_KEY = '__overlay';

interface OpenOverlay {
  token: string;
  close: () => void;
}

/** Unique across reloads: an entry marked before a reload is never mistaken for a live overlay. */
const session = Math.random().toString(36).slice(2, 8);
let sequence = 0;
const open: OpenOverlay[] = [];
let current: string | null = null;
let skipping = false;
let started = false;

function tokenOf(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null;
  const token = (state as Record<string, unknown>)[OVERLAY_KEY];
  return typeof token === 'string' ? token : null;
}

function isOpen(token: string): boolean {
  return open.some((overlay) => overlay.token === token);
}

/** An overlay entry whose overlay is no longer open. */
function released(token: string | null): token is string {
  return token !== null && !isOpen(token);
}

function stateWith(token: string): Record<string, unknown> {
  const state: unknown = window.history.state;
  return { ...(typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {}), [OVERLAY_KEY]: token };
}

function onPopState(): void {
  const left = current;
  // Read before the loop below closes the overlays this pop leaves: theirs are not released entries.
  const leftReleased = released(left);
  const here = tokenOf(window.history.state);
  current = here;
  for (let index = open.length - 1; index >= 0; index -= 1) {
    const overlay = open[index]!;
    if (overlay.token === here) break;
    open.splice(index, 1);
    overlay.close();
  }
  if (skipping) {
    skipping = false;
    return;
  }
  // Back from a released entry only took the dead entry off: go the step the person asked for.
  // A pop onto a released entry (back from a later screen) skips it the same way.
  if ((leftReleased && left !== here) || released(here)) {
    skipping = true;
    window.history.back();
  }
}

/** Follows every entry change of the page; idempotent. Called once by the app shell. */
export function startOverlayHistory(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  current = tokenOf(window.history.state);
  const push = window.history.pushState.bind(window.history);
  const replace = window.history.replaceState.bind(window.history);
  window.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    push(data, unused, url);
    current = tokenOf(data);
  };
  window.history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
    replace(data, unused, url);
    current = tokenOf(data);
  };
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
    startOverlayHistory();
    sequence += 1;
    const overlay: OpenOverlay = { token: `${session}-${sequence}`, close: () => closeRef.current() };
    let pushed = false;
    const timer = window.setTimeout(() => {
      pushed = true;
      // A released entry (a menu item that opened this dialog, an overlay closed by Escape) is taken over.
      if (released(tokenOf(window.history.state))) window.history.replaceState(stateWith(overlay.token), '');
      else window.history.pushState(stateWith(overlay.token), '');
      open.push(overlay);
    }, 0);
    return () => {
      if (!pushed) {
        window.clearTimeout(timer);
        return;
      }
      const index = open.findIndex((entry) => entry.token === overlay.token);
      if (index >= 0) open.splice(index, 1);
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
