import { useRef, type KeyboardEvent } from 'react';
import { ui } from '../copy/ui.ts';
import { useLatestChoice } from './use-latest-choice.ts';

export type TriStateValue = 'C' | 'NC' | 'NA';

export interface TriStateControlProps {
  value: TriStateValue | null;
  /** A segment chosen (immediately committed by the caller), or null for Delete/Backspace. */
  onChange: (value: TriStateValue | null) => void;
  /** The group's accessible name: item number + text ("1. Limpeza"). */
  'aria-label': string;
  /**
   * False when `value` is shown pre-selected but was never actually committed (a
   * checklist row's `na_defaults` NA with no cell of its own): the re-tap no-op that
   * protects a real choice from a glove double-tap must not also block the first real
   * commit of a row that only ever looked selected. Defaults to true (an ordinary,
   * already-committed selection, where re-tapping the same segment does nothing).
   */
  committed?: boolean;
  /**
   * Story 5.9: a not-tested sheet's checklist is read-only (`aria-readonly="true"` on the
   * radiogroup, UX-DR48/49 and E5-Q10, the value stays announced; no segment selectable). `components.css`
   * already blocks pointer events on `.is-readonly .tri-state`; this also blocks the
   * keyboard (arrows, Delete/Backspace) and a click that reaches the button regardless.
   */
  readOnly?: boolean;
}

const SEGMENTS: readonly { value: TriStateValue; attr: 'c' | 'nc' | 'na' }[] = [
  { value: 'C', attr: 'c' },
  { value: 'NC', attr: 'nc' },
  { value: 'NA', attr: 'na' },
];

/**
 * The Tri-state control of a checklist row (EXPERIENCE.md › Tri-state control, UX-DR37):
 * the mock's markup verbatim, `<div class="tri-state" role="radiogroup">` around three
 * `<button class="seg" role="radio" data-value aria-checked>` with the full words as their
 * names and the plain letters as their text (no check glyph, `60-ficha.html`).
 *
 * The keyboard is `SegmentedControl`'s APG radiogroup contract (roving tab stop, arrows
 * move focus and selection together and wrap, Home/End), plus Delete/Backspace to clear.
 * Re-tapping the selected segment does nothing: a glove double-tap must not un-mark a row.
 * With nothing chosen, the first segment holds the tab stop and focus alone never commits.
 */
export function TriStateControl({ value, onChange, committed = true, readOnly = false, ...rest }: TriStateControlProps) {
  const segments = useRef(new Map<TriStateValue, HTMLButtonElement | null>());
  const selectedIndex = SEGMENTS.findIndex((segment) => segment.value === value);
  const tabbableIndex = selectedIndex === -1 ? 0 : selectedIndex;
  // E5-Q8: the guards read the last emitted value, never the prop one round trip behind.
  const { latest, emit } = useLatestChoice(value, onChange);

  function moveTo(index: number) {
    if (readOnly) return;
    const target = SEGMENTS[(index + SEGMENTS.length) % SEGMENTS.length]!;
    segments.current.get(target.value)?.focus();
    if (target.value !== latest.current) emit(target.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        moveTo(index - 1);
        return;
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        moveTo(index + 1);
        return;
      case 'Home':
        event.preventDefault();
        moveTo(0);
        return;
      case 'End':
        event.preventDefault();
        moveTo(SEGMENTS.length - 1);
        return;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        if (!readOnly && latest.current !== null) emit(null);
        return;
      default:
        return;
    }
  }

  return (
    <div className="tri-state" role="radiogroup" aria-readonly={readOnly || undefined} {...rest}>
      {SEGMENTS.map((segment, index) => (
        <button
          key={segment.value}
          type="button"
          role="radio"
          className="seg"
          data-value={segment.attr}
          aria-checked={segment.value === value}
          aria-label={ui.triState[segment.value]}
          tabIndex={index === tabbableIndex ? 0 : -1}
          ref={(element) => {
            segments.current.set(segment.value, element);
          }}
          onClick={() => {
            if (readOnly) return;
            if (segment.value !== latest.current || !committed) emit(segment.value);
          }}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {segment.value}
        </button>
      ))}
    </div>
  );
}
