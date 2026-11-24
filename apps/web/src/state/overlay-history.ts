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
 *   costs no press: a back from it goes one step further, a pop onto it (back or forward from
 *   another screen) skips it, and an overlay opening on it takes it over instead of pushing a
 *   second one.
 *
 * Batch e28r (wave review S1, S2): every entry carries a position of its own (`POSITION_KEY`, one
 * more than the entry it was pushed from, kept by a replace), since an overlay entry copies the
 * router's `idx`. A pop reads its direction from the two positions, and the skip goes on in that
 * direction until it lands on an entry that is not released (after passing the one the person was
 * on, when the press started on a released entry): two released entries in a row cost no press, and
 * a forward across a released entry goes forward. A history step that moves nothing (`back()` on the
 * first entry fires no pop) leaves no skip waiting: the next pop in the other direction, or any push
 * or replace, is the person's own.
 *
 * The push is deferred one task, so StrictMode's mount, unmount and remount push once. React
 * Router's own pushes and replaces are followed (`pushState` and `replaceState` are wrapped once) so
 * "the entry just left" and its position are always known. A replace that keeps the address keeps
 * the entry's marker (the entry is still the overlay's); one that changes the address is a
 * navigation and leaves a plain entry.
 */

export const OVERLAY_KEY = '__overlay';
/** The entry's place in this tab's history, counted by this module (batch e28r). */
export const POSITION_KEY = '__position';

interface OpenOverlay {
  token: string;
  close: () => void;
}

type Direction = 'back' | 'forward';

/** A skip under way: the direction it goes, and how many entries that are not released it still has to land on. */
interface Skip {
  direction: Direction;
  need: number;
}

/** Unique across reloads: an entry marked before a reload is never mistaken for a live overlay. */
const session = Math.random().toString(36).slice(2, 8);
let sequence = 0;
const open: OpenOverlay[] = [];
let current: string | null = null;
let position: number | null = null;
let skip: Skip | null = null;
let started = false;
/** Set by `startOverlayHistory`: takes its wrappers and its listener off again. */
let stop: (() => void) | null = null;

function record(state: unknown): Record<string, unknown> | null {
  return typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : null;
}

function tokenOf(state: unknown): string | null {
  const token = record(state)?.[OVERLAY_KEY];
  return typeof token === 'string' ? token : null;
}

function positionOf(state: unknown): number | null {
  const value = record(state)?.[POSITION_KEY];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isOpen(token: string): boolean {
  return open.some((overlay) => overlay.token === token);
}

/** An overlay entry whose overlay is no longer open. */
function released(token: string | null): token is string {
  return token !== null && !isOpen(token);
}

function stateWith(token: string): Record<string, unknown> {
  return { ...(record(window.history.state) ?? {}), [OVERLAY_KEY]: token };
}

function sameAddress(url: string | URL | null | undefined): boolean {
  if (url === undefined || url === null) return true;
  try {
    return new URL(url, window.location.href).href === window.location.href;
  } catch {
    return false;
  }
}

/**
 * The state a replace writes: the data given, with the replaced entry's position, and its marker
 * when the data has none and the address stays (a router replace of the overlay's own entry).
 */
function replacing(data: unknown, url: string | URL | null | undefined): unknown {
  const given = data === null || data === undefined ? {} : record(data);
  if (given === null) return data;
  const before = window.history.state;
  const next: Record<string, unknown> = { ...given };
  const kept = positionOf(before) ?? position;
  if (kept !== null && positionOf(next) === null) next[POSITION_KEY] = kept;
  const token = tokenOf(before);
  if (tokenOf(next) === null && token !== null && sameAddress(url)) next[OVERLAY_KEY] = token;
  return next;
}

/** The state a push writes: the data given, one place after the entry it is pushed from. */
function pushing(data: unknown): unknown {
  const given = data === null || data === undefined ? {} : record(data);
  if (given === null) return data;
  return { ...given, [POSITION_KEY]: (positionOf(window.history.state) ?? position ?? 0) + 1 };
}

function directionOf(from: number | null, to: number | null): Direction | null {
  if (from === null || to === null || from === to) return null;
  return to < from ? 'back' : 'forward';
}

function onPopState(): void {
  const left = current;
  // Read before the loop below closes the overlays this pop leaves: theirs are not released entries.
  const leftReleased = released(left);
  const leftPosition = position;
  const here = tokenOf(window.history.state);
  current = here;
  position = positionOf(window.history.state);
  for (let index = open.length - 1; index >= 0; index -= 1) {
    const overlay = open[index]!;
    if (overlay.token === here) break;
    open.splice(index, 1);
    overlay.close();
  }
  const direction = directionOf(leftPosition, position);
  // A skip waiting in the other direction (its step moved nothing) is over: this pop is the person's.
  let step = skip !== null && skip.direction === direction ? skip : null;
  skip = null;
  if (direction === null) return;
  // Back from a released entry: the entry under it is the screen the person sees, and is passed too.
  step ??= { direction, need: direction === 'back' && leftReleased ? 2 : 1 };
  const need = released(here) ? step.need : step.need - 1;
  if (need <= 0) return;
  skip = { direction, need };
  if (direction === 'back') window.history.back();
  else window.history.forward();
}

/** Follows every entry change of the page; idempotent. Called once by the app shell. */
export function startOverlayHistory(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const push = window.history.pushState.bind(window.history);
  const replace = window.history.replaceState.bind(window.history);
  // The entry the page opened on gets its position (kept from before a reload, else the first).
  const opened: unknown = window.history.state;
  if (positionOf(opened) === null && (opened === null || opened === undefined || record(opened) !== null)) replace({ ...(record(opened) ?? {}), [POSITION_KEY]: 0 }, '');
  current = tokenOf(window.history.state);
  position = positionOf(window.history.state);
  window.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    const next = pushing(data);
    push(next, unused, url);
    skip = null;
    current = tokenOf(next);
    position = positionOf(next);
  };
  window.history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
    const next = replacing(data, url);
    replace(next, unused, url);
    skip = null;
    current = tokenOf(next);
    position = positionOf(next);
  };
  window.addEventListener('popstate', onPopState);
  stop = () => {
    window.removeEventListener('popstate', onPopState);
    window.history.pushState = push;
    window.history.replaceState = replace;
  };
}

/** Undoes `startOverlayHistory` and forgets every overlay: for the unit tests, which give each case a history of its own. */
export function stopOverlayHistory(): void {
  stop?.();
  stop = null;
  started = false;
  open.length = 0;
  current = null;
  position = null;
  skip = null;
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
