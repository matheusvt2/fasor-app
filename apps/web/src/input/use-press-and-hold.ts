import { useCallback, useMemo, useRef, useState } from 'react';

/** Interaction Primitives: "press and hold 300 ms + drag". */
export const PRESS_AND_HOLD_MS = 300;

/** Movement past this many pixels before the hold fires cancels it — the pointer is
 * scrolling or swiping, not holding still. No swipe gesture is ever recognized here:
 * movement never starts a hold, it only ever cancels one that has not fired yet. */
const MOVE_CANCEL_PX = 8;

export interface PressAndHoldOptions {
  /** Called once the hold threshold elapses while the pointer stayed still. */
  onHold: (pointerType: string) => void;
  /** Called when a press ends or moves away before the hold fired. */
  onCancel?: () => void;
  /** @default 300 */
  thresholdMs?: number;
}

export interface PressAndHoldHandlers {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  onPointerCancel: (event: React.PointerEvent) => void;
  onPointerLeave: (event: React.PointerEvent) => void;
  /** Whether the hold has fired and is still in effect (pointer still down). */
  isHolding: boolean;
}

/**
 * Pointer-type-aware press-and-hold: works the same for touch, pen and mouse because it is
 * built on Pointer Events, never on `mouseenter`/`hover` (no hover-only affordance — a
 * press-and-hold action never triggers just because a mouse rests over the element) and
 * never interprets movement as a swipe (AD-23; this story wires no drag behavior, only the
 * primitive later stories build reorder on).
 */
export function usePressAndHold({ onHold, onCancel, thresholdMs = PRESS_AND_HOLD_MS }: PressAndHoldOptions): PressAndHoldHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number; pointerType: string; pointerId: number; target: Element } | null>(
    null,
  );
  const [isHolding, setIsHolding] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseCapture = useCallback(() => {
    const start = startRef.current;
    try {
      start?.target?.releasePointerCapture?.(start.pointerId);
    } catch {
      // The browser may already have released capture (e.g. implicit touch release).
    }
  }, []);

  const reset = useCallback(
    (cancelled: boolean) => {
      const wasPending = timerRef.current !== null;
      const wasHolding = startRef.current !== null && isHolding;
      releaseCapture();
      clearTimer();
      startRef.current = null;
      if (isHolding) setIsHolding(false);
      if (cancelled && (wasPending || wasHolding)) onCancel?.();
    },
    [clearTimer, isHolding, onCancel, releaseCapture],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Only the primary button/contact starts a hold, and only one pointer session at a
      // time: a second pointer going down while one is already pending/active is ignored so
      // it cannot silently steal or overwrite the first session.
      if (event.button !== 0 || startRef.current !== null) return;
      clearTimer();
      startRef.current = {
        x: event.clientX,
        y: event.clientY,
        pointerType: event.pointerType,
        pointerId: event.pointerId,
        target: event.currentTarget,
      };
      try {
        event.currentTarget?.setPointerCapture?.(event.pointerId);
      } catch {
        // Not every pointer type/environment supports capture; movement/up still reach this
        // element in the common case, and this is best-effort hardening for mouse/pen drags.
      }
      const pointerType = event.pointerType;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setIsHolding(true);
        onHold(pointerType);
      }, thresholdMs);
    },
    [clearTimer, onHold, thresholdMs],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const start = startRef.current;
      if (!start || event.pointerId !== start.pointerId) return;
      const dx = Math.abs(event.clientX - start.x);
      const dy = Math.abs(event.clientY - start.y);
      if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
        // Moved before the hold fired: this is a scroll, not a hold. Once holding, movement
        // is the drag itself and is left to the caller.
        if (timerRef.current !== null) reset(true);
      }
    },
    [reset],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const start = startRef.current;
      if (!start || event.pointerId !== start.pointerId) return;
      reset(timerRef.current !== null);
    },
    [reset],
  );

  const onPointerCancel = useCallback(
    (event: React.PointerEvent) => {
      const start = startRef.current;
      if (!start || event.pointerId !== start.pointerId) return;
      reset(true);
    },
    [reset],
  );
  const onPointerLeave = useCallback(
    (event: React.PointerEvent) => {
      // Only cancel a pending (not-yet-fired) hold; once holding, leaving the element's box
      // under a captured pointer is normal during a drag.
      const start = startRef.current;
      if (!start || event.pointerId !== start.pointerId) return;
      if (timerRef.current !== null) reset(true);
    },
    [reset],
  );

  return useMemo(
    () => ({ onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave, isHolding }),
    [onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave, isHolding],
  );
}
