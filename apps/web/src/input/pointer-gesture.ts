import type { PointerEvent as ReactPointerEvent } from 'react';

/*
 * E13-A6: the pointer bookkeeping the photo zoom (`use-pinch-zoom.ts`) and the camera finder
 * (`camera-controls.ts`) share: the pointers down on one element by id, their capture, how far
 * each moved from where it went down, and the two-pointer spread and midpoint a pinch reads.
 * A plain object with no React state; each user keeps its own gesture (pan, double tap, zoom,
 * focus tap) on top, with its own tap slop and coordinate space (stage-local or client).
 */

export interface PointerPoint {
  x: number;
  y: number;
}

/** A pointer down on the element: its last position and where it went down. */
export interface TrackedPointer extends PointerPoint {
  readonly startX: number;
  readonly startY: number;
}

/** The first two pointers: their distance and their midpoint. */
export interface PinchFrame {
  spread: number;
  midX: number;
  midY: number;
}

export type GesturePointerEvent = Pick<ReactPointerEvent<HTMLElement>, 'pointerId' | 'clientX' | 'clientY' | 'currentTarget'>;

export interface PointerGestureOptions {
  /** A pointer that moved further than this from where it went down is no longer a tap. */
  tapSlop: number;
  /** The event's position in the user's coordinate space. */
  coords: (event: { clientX: number; clientY: number }) => PointerPoint;
}

export interface PointerGesture {
  /** How many pointers are down. */
  readonly size: number;
  /**
   * A pointer went down: captured, so a finger lifted outside the element still ends there and
   * leaves no stale pointer, then tracked at its position.
   */
  down: (event: GesturePointerEvent) => TrackedPointer;
  /** A tracked pointer moved: its new position; null for a pointer this element does not track. */
  move: (event: GesturePointerEvent) => TrackedPointer | null;
  /** The pointer moved further than the tap slop from where it went down. */
  beyondSlop: (pointer: TrackedPointer) => boolean;
  /** A pointer lifted or was cancelled: no longer tracked. Returns it, or null when it was not tracked. */
  up: (event: Pick<GesturePointerEvent, 'pointerId'>) => TrackedPointer | null;
  /** The first pointer still down, if any. */
  first: () => TrackedPointer | undefined;
  /** The first two pointers' spread and midpoint; null with fewer than two. */
  pinch: () => PinchFrame | null;
  /** The spread of the first two pointers; 0 with fewer than two. */
  spread: () => number;
  /** Forgets every pointer. */
  clear: () => void;
}

export function pointerGesture({ tapSlop, coords }: PointerGestureOptions): PointerGesture {
  const pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
  const pinch = (): PinchFrame | null => {
    const [a, b] = [...pointers.values()];
    if (a === undefined || b === undefined) return null;
    return { spread: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
  };
  return {
    get size() {
      return pointers.size;
    },
    down: (event) => {
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // A synthetic pointer (tests), one the browser already released, or one that cannot be
        // captured: it still works while it stays on the element.
      }
      const at = coords(event);
      const pointer = { x: at.x, y: at.y, startX: at.x, startY: at.y };
      pointers.set(event.pointerId, pointer);
      return pointer;
    },
    move: (event) => {
      const pointer = pointers.get(event.pointerId);
      if (pointer === undefined) return null;
      const at = coords(event);
      pointer.x = at.x;
      pointer.y = at.y;
      return pointer;
    },
    beyondSlop: (pointer) => Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) > tapSlop,
    up: (event) => {
      const pointer = pointers.get(event.pointerId);
      pointers.delete(event.pointerId);
      return pointer ?? null;
    },
    first: () => pointers.values().next().value,
    pinch,
    spread: () => pinch()?.spread ?? 0,
    clear: () => pointers.clear(),
  };
}
