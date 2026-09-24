import { useCallback, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { touchActionStyle } from '../../input/touch-action.ts';
import { usePressAndHold } from '../../input/use-press-and-hold.ts';

/*
 * EXPERIENCE.md › Interaction Primitives: "Reorder three ways, always" -- plus the Position
 * box of the Block card. One hook gives a reorderable row (a cabine card, a coluna row, a
 * section Block card) every path that moves it among its siblings:
 *
 * - drag from the handle: press and hold 300 ms then drag on touch and pen
 *   (`usePressAndHold`), a plain drag with a mouse; the drop index is where the row's
 *   centre lands among its siblings' centres;
 * - Alt+↑ / Alt+↓ while focus is anywhere in the row;
 * - `moveTo`, which the Overflow's "Subir · Descer" and the Position box call.
 *
 * The move itself is the caller's (`onMove`, one batch of template ops), and so is the
 * announcement. The hook keeps the focus where it was: moving a keyed row can make React
 * move its DOM node, which drops the focus to `<body>`, so once the write lands the element
 * that held the focus (or the one the caller names) takes it back.
 */

export interface ReorderOptions {
  /** The row's stable identity among its siblings. */
  itemKey: string;
  /** 1-based position among its siblings, and how many siblings there are. */
  position: number;
  siblings: number;
  /** Moves the row to a 0-based index among its siblings; resolves once written. */
  onMove: (toIndex: number) => Promise<void>;
  /**
   * How many frames the focus is watched for after a move lands. The composer's list
   * re-renders within the default; a list whose live query rebuilds a whole snapshot (the
   * Sumário) passes `LIST_FOCUS_WATCH_FRAMES`.
   */
  focusFrames?: number;
}

export interface Reorder {
  /** Spread on the row element (`li`). */
  rowProps: {
    ref: (element: HTMLElement | null) => void;
    'data-reorder-key': string;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
    style: CSSProperties | undefined;
  };
  /** True while the row follows the pointer (the row adds `is-dragging`). */
  dragging: boolean;
  /** Spread on the `.drag-handle` button. */
  handleProps: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
    onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => void;
    style: CSSProperties;
  };
  /**
   * Moves to a 0-based index; the focus then goes back to `focus()` (default: whatever held
   * it when the move started).
   */
  moveTo: (toIndex: number, focus?: () => HTMLElement | null) => Promise<void>;
  /** The row element, for a caller that names a focus target inside it. */
  row: () => HTMLElement | null;
}

interface DragState {
  pointerId: number;
  startY: number;
  /** Vertical centres of the siblings, measured when the press started. */
  centres: number[];
  index: number;
  armed: boolean;
}

/** How many frames the focus is watched for after a move lands (the live query re-renders late). */
const FOCUS_WATCH_FRAMES = 30;

/**
 * Gives the focus to `target()` once the element that held it is gone (a re-render moved or
 * removed it), watching a few frames because the live query re-renders after the write.
 * `target()` may return null until the change it waits for has rendered. `frames` is how
 * long to watch; with `once`, the watch ends as soon as the target took the focus, so a
 * later click on the page's background keeps its usual effect.
 */
export function restoreFocus(
  target: () => HTMLElement | null,
  { frames = FOCUS_WATCH_FRAMES, once = false }: { frames?: number; once?: boolean } = {},
): void {
  let watched = 0;
  const tick = () => {
    const element = target();
    const active = document.activeElement;
    const lost = active === null || active === document.body || !active.isConnected;
    if (element !== null && element.isConnected) {
      if (lost) element.focus();
      // With `once`, the watch ends as soon as the target is there: it took the focus now,
      // or it already held it (a Position box committed with Enter), or something else holds
      // it on purpose. A watch that outlived its move once stole the focus from the next
      // removal's own target (batch A real-browser pass, 2026-09-24).
      if (once) return;
    }
    if (++watched < frames) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * How many frames a focus target is watched for after a write that re-renders a list: a
 * removal or an undo lands only after the Confirm dialog or the toast has closed and the
 * live query has re-read the rows, which on a loaded device takes more than half a second.
 */
export const LIST_FOCUS_WATCH_FRAMES = 180;

function siblingRows(row: HTMLElement): HTMLElement[] {
  const parent = row.parentElement;
  if (parent === null) return [row];
  return [...parent.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.reorderKey !== undefined);
}

export function useReorder({ itemKey, position, siblings, onMove, focusFrames = FOCUS_WATCH_FRAMES }: ReorderOptions): Reorder {
  const rowRef = useRef<HTMLElement | null>(null);
  const drag = useRef<DragState | null>(null);
  const [offset, setOffset] = useState<number | null>(null);

  const moveTo = useCallback(
    async (toIndex: number, focus?: () => HTMLElement | null) => {
      const index = Math.min(siblings - 1, Math.max(0, toIndex));
      if (index === position - 1) return;
      const held = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      await onMove(index);
      const row = rowRef.current;
      restoreFocus(
        () => {
          // Only once the row sits at its new place, and once only: a watch left over from
          // an earlier move must never pull the focus back after a later one.
          if (row !== null && row.isConnected && siblingRows(row).indexOf(row) !== index) return null;
          return (focus ?? (() => held))();
        },
        { frames: focusFrames, once: true },
      );
    },
    [onMove, position, siblings, focusFrames],
  );

  const arm = useCallback(() => {
    if (drag.current === null) return;
    drag.current.armed = true;
    setOffset(0);
  }, []);

  const hold = usePressAndHold({ onHold: arm });

  const reset = () => {
    drag.current = null;
    setOffset(null);
  };

  const handleProps: Reorder['handleProps'] = {
    style: touchActionStyle('hold'),
    onPointerDown: (event) => {
      const row = rowRef.current;
      if (event.button !== 0 || row === null || drag.current !== null) return;
      const rows = siblingRows(row);
      drag.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        centres: rows.map((el) => {
          const box = el.getBoundingClientRect();
          return (box.top + box.bottom) / 2;
        }),
        index: rows.indexOf(row),
        armed: false,
      };
      if (event.pointerType === 'mouse') {
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
          // Capture is best effort; a mouse drag still reaches the handle in the common case.
        }
        arm();
      } else {
        hold.onPointerDown(event);
      }
    },
    onPointerMove: (event) => {
      const state = drag.current;
      if (state === null || event.pointerId !== state.pointerId) return;
      if (!state.armed) {
        // Still timing the hold: movement here is a scroll, which cancels it.
        hold.onPointerMove(event);
        if (!hold.isHolding && event.pointerType !== 'mouse' && Math.abs(event.clientY - state.startY) > 8) reset();
        return;
      }
      event.preventDefault();
      setOffset(event.clientY - state.startY);
    },
    onPointerUp: (event) => {
      const state = drag.current;
      if (state === null || event.pointerId !== state.pointerId) return;
      hold.onPointerUp(event);
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {
        // Already released.
      }
      reset();
      if (!state.armed || state.index < 0) return;
      const centre = state.centres[state.index]! + (event.clientY - state.startY);
      let to = 0;
      state.centres.forEach((c, j) => {
        if (j !== state.index && c < centre) to += 1;
      });
      const handle = event.currentTarget;
      if (to !== state.index) void moveTo(to, () => handle);
    },
    onPointerCancel: (event) => {
      hold.onPointerCancel(event);
      reset();
    },
    onPointerLeave: (event) => {
      hold.onPointerLeave(event);
    },
    // The browser took the pointer away mid-drag (a system gesture, the handle unmounting):
    // the drag ends where it started, with no move.
    onLostPointerCapture: (event) => {
      const state = drag.current;
      if (state === null || event.pointerId !== state.pointerId) return;
      hold.onPointerCancel(event);
      reset();
    },
  };

  const rowProps: Reorder['rowProps'] = {
    ref: (element) => {
      rowRef.current = element;
    },
    'data-reorder-key': itemKey,
    style: offset === null ? undefined : { transform: `translateY(${offset}px)` },
    onKeyDown: (event) => {
      if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
      // A menu or dialog portaled out of the row bubbles through React, not through the DOM.
      if (!(event.currentTarget as HTMLElement).contains(event.target as Node)) return;
      event.preventDefault();
      // The innermost row moves; a coluna row inside a cabine card never moves the cabine.
      event.stopPropagation();
      const to = position - 1 + (event.key === 'ArrowUp' ? -1 : 1);
      if (to < 0 || to >= siblings) return;
      void moveTo(to);
    },
  };

  return { rowProps, dragging: offset !== null, handleProps, moveTo, row: () => rowRef.current };
}
