import { clampQuantity, MAX_QUANTITY, parseQuantityInput } from '@app/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ui } from '../copy/ui';
import { usePressAndHold } from '../input/use-press-and-hold.ts';
import { touchActionStyle } from '../input/touch-action.ts';

/** How often a held "−" or "+" steps once the hold threshold has passed. */
export const STEP_REPEAT_MS = 100;

export interface QuantityStepperProps {
  /** The committed quantity. */
  value: number;
  /** The group's accessible name for a count: the kernel's `quantityLabel` ("Seccionadoras, 25"). */
  label: (n: number) => string;
  /**
   * Writes a new quantity. A rejection (a refused device write) puts the count back on
   * `value`; the caller says why.
   */
  onCommit: (n: number) => void | Promise<void>;
  /** A disabled stepper keeps its place and its count, and points at the sentence saying why. */
  isDisabled?: boolean;
  disabledReasonId?: string;
}

type Delta = -1 | 1;

/**
 * UX-DR30 Quantity stepper (`42-template-composer.html` `.quantity-stepper[role=group]`,
 * DESIGN.md › Quantity stepper): "−" and "+" `.step` buttons of 48 px around a typeable
 * count that reads "—" at zero.
 *
 * - A press steps once; holding past the 300 ms threshold (`usePressAndHold`) repeats a
 *   step every 100 ms. The count moves locally while held and one commit happens on
 *   release, so a long hold is one op, not forty.
 * - Enter or Space on a focused button steps once and commits (the keyboard path).
 * - The count is an input: a typed number commits on blur or Enter, clamped to 0..99;
 *   anything else ("abc", "-3") puts the previous value back and writes nothing. Arrow
 *   up/down in it step too.
 * - After each commit the new label is announced politely ("Seccionadoras, 25").
 */
export function QuantityStepper({ value, label, onCommit, isDisabled = false, disabledReasonId }: QuantityStepperProps) {
  const [local, setLocal] = useState(value);
  const localRef = useRef(value);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [text, setText] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const holding = useRef<Delta | null>(null);
  /** The last quantity sent to `onCommit`, and how many of those writes are still in flight. */
  const target = useRef<number | null>(null);
  const inFlight = useRef(0);

  const show = useCallback((n: number) => {
    localRef.current = n;
    setLocal(n);
  }, []);

  // A committed value that reaches the row (this device's write, or a pulled one) is the
  // count to show -- unless a hold is still moving it, or a quicker press already sent a
  // newer quantity whose write has not come back yet (the older one must not flash back).
  useEffect(() => {
    if (holding.current !== null) return;
    if (inFlight.current > 0 && target.current !== null && value !== target.current) return;
    target.current = null;
    show(value);
  }, [value, show]);

  useEffect(
    () => () => {
      if (repeat.current !== null) clearInterval(repeat.current);
    },
    [],
  );

  const commit = useCallback(
    (n: number) => {
      if (n === (target.current ?? valueRef.current)) return;
      target.current = n;
      inFlight.current += 1;
      void Promise.resolve()
        .then(() => onCommit(n))
        .then(
          () => {
            inFlight.current -= 1;
            setAnnouncement(label(n));
          },
          () => {
            inFlight.current -= 1;
            target.current = null;
            show(valueRef.current);
          },
        );
    },
    [label, onCommit, show],
  );

  const step = useCallback((delta: Delta) => show(clampQuantity(localRef.current + delta)), [show]);

  const stopRepeat = () => {
    if (repeat.current !== null) clearInterval(repeat.current);
    repeat.current = null;
  };

  const release = () => {
    if (holding.current === null) return;
    holding.current = null;
    stopRepeat();
    commit(localRef.current);
  };

  const minusHold = usePressAndHold({
    onHold: () => {
      stopRepeat();
      repeat.current = setInterval(() => step(-1), STEP_REPEAT_MS);
    },
  });
  const plusHold = usePressAndHold({
    onHold: () => {
      stopRepeat();
      repeat.current = setInterval(() => step(1), STEP_REPEAT_MS);
    },
  });

  function stepButton(delta: Delta) {
    const hold = delta === -1 ? minusHold : plusHold;
    return (
      <button
        type="button"
        className="step"
        aria-label={delta === -1 ? ui.quantityStepper.decrement : ui.quantityStepper.increment}
        aria-disabled={isDisabled || undefined}
        aria-describedby={isDisabled ? disabledReasonId : undefined}
        style={touchActionStyle('hold')}
        onPointerDown={(event) => {
          if (isDisabled || event.button !== 0) return;
          holding.current = delta;
          step(delta);
          hold.onPointerDown(event);
        }}
        onPointerMove={hold.onPointerMove}
        onPointerUp={(event) => {
          hold.onPointerUp(event);
          release();
        }}
        onPointerCancel={(event) => {
          hold.onPointerCancel(event);
          release();
        }}
        onPointerLeave={hold.onPointerLeave}
        onClick={(event) => {
          // A pointer press was handled on pointerdown/up; a click with no pointer detail
          // is the keyboard's Enter or Space.
          if (isDisabled || event.detail !== 0) return;
          step(delta);
          commit(localRef.current);
        }}
      >
        {delta === -1 ? '−' : '+'}
      </button>
    );
  }

  function finishTyping() {
    if (text === null) return;
    const typed = parseQuantityInput(text);
    setText(null);
    if (typed === null) return;
    show(typed);
    commit(typed);
  }

  const zero = local === 0 && text === null;

  return (
    <div className="quantity-stepper" role="group" aria-label={label(local)}>
      {stepButton(-1)}
      <input
        className={zero ? 'count is-zero' : 'count'}
        inputMode="numeric"
        maxLength={String(MAX_QUANTITY).length + 1}
        aria-label={ui.quantityStepper.count}
        aria-disabled={isDisabled || undefined}
        aria-describedby={isDisabled ? disabledReasonId : undefined}
        readOnly={isDisabled}
        value={text ?? (local === 0 ? ui.quantityStepper.zero : String(local))}
        onFocus={(event) => {
          if (isDisabled) return;
          setText(local === 0 ? '' : String(local));
          const input = event.currentTarget;
          requestAnimationFrame(() => input.select());
        }}
        onChange={(event) => {
          if (!isDisabled) setText(event.target.value);
        }}
        onBlur={finishTyping}
        onKeyDown={(event) => {
          if (isDisabled) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            finishTyping();
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const typed = text === null ? localRef.current : (parseQuantityInput(text) ?? localRef.current);
            const next = clampQuantity(typed + (event.key === 'ArrowUp' ? 1 : -1));
            setText(next === 0 ? '' : String(next));
            show(next);
            commit(next);
          }
        }}
      />
      {stepButton(1)}
      <span className="visually-hidden" role="status">
        {announcement}
      </span>
    </div>
  );
}
