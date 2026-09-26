import { useEffect, useReducer, useRef } from 'react';

/*
 * Story 12.1 (J-01): the lost tap, fixed once for every press control.
 *
 * The mechanism that swallowed the tap: React Aria's `usePress` (and a native `<button>`'s
 * click alike) fires only when the pointer that went down on a control comes up over that
 * same control; its pointer-up listener calls `cancelEvent` when the up event's target is
 * outside the pressed element. Any render between pointer down and pointer up that moves or
 * remounts the pressed control leaves the finger over something else, and the press ends
 * with no action and no feedback. On the equipment sheet two things rendered in that window:
 * the blur (or Enter) commit of the field the engineer had just typed in, whose write lands
 * mid-press and rebuilds the snapshot from the new rows, and the section above collapsing
 * because the pointer's focus moved into the next one (the D-2 half is in `use-ficha-steps.ts`).
 *
 * This module is the guard for the first half: one module-level store of "a primary pointer
 * is down", fed by document capture listeners, and `useHeldWhilePressed(value)`, which keeps
 * returning the value seen at pointer down until the pointer is released, then renders the
 * newest one. Press handlers never read the held value to decide anything: they write
 * through the edit queue, which reads fresh rows, so correctness never depends on it.
 *
 * Release comes one task after the click that follows the pointer up (a touch tap's click
 * is a separate task after its pointerup, and `usePress` fires `onPress` from that click),
 * after `RELEASE_AFTER_UP_MS` when no click follows (a long press on touch gets none), at
 * once on `pointercancel` (a touch scroll), and after `HOLD_CAP_MS` at the latest, so a
 * pointer left down never freezes the screen.
 */

/** The longest a render is held for one pointer down. */
export const HOLD_CAP_MS = 800;
/**
 * How long after pointer up the release waits for the click that ends a tap: Chrome's touch
 * tap gesture dispatches that click 100 to 160 ms after `pointerup` (measured on the Android
 * emulation, Story 12.1 diagnosis), and a render in that gap still moves the target.
 */
export const RELEASE_AFTER_UP_MS = 300;

type Listener = () => void;

let down = false;
let installed = false;
let capTimer: ReturnType<typeof setTimeout> | null = null;
let upTimer: ReturnType<typeof setTimeout> | null = null;
let clickTimer: ReturnType<typeof setTimeout> | null = null;
/** The last kind of user input: a pointer going down or a key. */
let modality: 'pointer' | 'keyboard' | null = null;
const listeners = new Set<Listener>();

function clearTimers(): void {
  if (capTimer !== null) clearTimeout(capTimer);
  if (upTimer !== null) clearTimeout(upTimer);
  if (clickTimer !== null) clearTimeout(clickTimer);
  capTimer = null;
  upTimer = null;
  clickTimer = null;
}

function release(): void {
  clearTimers();
  if (!down) return;
  down = false;
  for (const listener of [...listeners]) listener();
}

function onPointerDown(event: PointerEvent): void {
  modality = 'pointer';
  if (!event.isPrimary || event.button !== 0) return;
  clearTimers();
  down = true;
  capTimer = setTimeout(release, HOLD_CAP_MS);
}

function onPointerUp(event: PointerEvent): void {
  if (!event.isPrimary || !down) return;
  // From here the up timer bounds the hold: a cap left running could fire between a slow
  // pointerup and its touch click and release before the click.
  if (capTimer !== null) clearTimeout(capTimer);
  capTimer = null;
  if (upTimer !== null) clearTimeout(upTimer);
  upTimer = setTimeout(release, RELEASE_AFTER_UP_MS);
}

function onClick(): void {
  // One task after the click, so the click's own handlers still run on the held render.
  // Tracked, so a newer pointer down cancels it instead of being released by it.
  if (down && clickTimer === null) clickTimer = setTimeout(release, 0);
}

function onKeyDown(): void {
  modality = 'keyboard';
}

/** Installs the document listeners once (idempotent; a no-op without a document). */
export function installPressHold(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', release, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
}

/** Whether a primary pointer is down now (or its tap has not ended yet). */
export function isPointerHeld(): boolean {
  return down;
}

/**
 * Whether the latest user input was a pointer going down rather than a key: a focus that
 * arrives now came from a tap or a click (D-2 tells it apart from Tab and the Enter run).
 */
export function isPointerModality(): boolean {
  return modality === 'pointer';
}

/** Runs `listener` once the pointer is released (at once when none is held); returns the unsubscribe. */
function onRelease(listener: Listener): () => void {
  if (!down) {
    listener();
    return () => undefined;
  }
  const once = () => {
    listeners.delete(once);
    listener();
  };
  listeners.add(once);
  return () => listeners.delete(once);
}

/**
 * `value` as it was when the primary pointer went down, for as long as it stays down (see
 * the header); the live `value` otherwise. A value that changed meanwhile is rendered on
 * release.
 */
export function useHeldWhilePressed<T>(value: T): T {
  installPressHold();
  const held = useRef(value);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  if (!down) held.current = value;
  const stale = held.current !== value;
  useEffect(() => (stale ? onRelease(rerender) : undefined), [stale, value]);
  return held.current;
}

/** Test seam: forgets the pointer and the modality, and removes the listeners. */
export function resetPressHoldForTests(): void {
  clearTimers();
  down = false;
  modality = null;
  listeners.clear();
  if (installed && typeof document !== 'undefined') {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('pointercancel', release, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }
  installed = false;
}
