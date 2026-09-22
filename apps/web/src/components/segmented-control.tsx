import { useRef, type KeyboardEvent } from 'react';

export interface SegmentedOption<Value extends string> {
  value: Value;
  label: string;
}

export interface SegmentedControlProps<Value extends string> {
  value: Value;
  onChange: (value: Value) => void;
  options: ReadonlyArray<SegmentedOption<Value>>;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

/**
 * A `radiogroup` whose change applies immediately (Component Patterns › Segmented
 * control) — Account › Tema, "Conselho".
 *
 * This is the mock's markup verbatim: `<div class="segmented" role="radiogroup">` around
 * `<button class="seg" role="radio" aria-checked>`. The state therefore sits on the
 * element `components.css` styles (`.segmented .seg[aria-checked="true"]`), so the
 * selected fill and its `.check` glyph engage with no change to that stylesheet — the
 * Story 1.2 gap, where React Aria's `RadioGroup` put the state on a hidden native input
 * the selector could not reach.
 *
 * It is hand-rolled rather than built on `ToggleButtonGroup` because that component is a
 * toolbar, not a radiogroup: it gives every segment `tabindex="0"` instead of a roving
 * tab stop, and it moves focus only on ArrowLeft/ArrowRight. Committing from a keyup
 * therefore fired on whatever segment happened to be focused, so Home, End, ArrowUp or
 * ArrowDown silently changed the choice without focus having moved at all. The keyboard
 * contract below is the APG radiogroup one, which is what the pattern actually needs:
 *
 * - Tab lands on the checked segment and nowhere else in the group (roving tabindex).
 * - ArrowLeft/ArrowUp and ArrowRight/ArrowDown move focus and selection together, wrapping.
 * - Home and End move focus and selection to the first and last segment.
 * - Space and Enter select the focused segment (a `<button>` raises `click` for both).
 * - No other key changes anything, and focus alone never commits.
 */
export function SegmentedControl<Value extends string>({
  value,
  onChange,
  options,
  ...rest
}: SegmentedControlProps<Value>) {
  const segments = useRef(new Map<Value, HTMLButtonElement | null>());

  // With a value outside the options nothing would be tabbable, which would trap Tab
  // before the group; the first segment takes the tab stop until a real choice exists.
  const selectedIndex = options.findIndex((option) => option.value === value);
  const tabbableIndex = selectedIndex === -1 ? 0 : selectedIndex;

  function moveTo(index: number) {
    const target = options[(index + options.length) % options.length];
    if (target === undefined) return;
    segments.current.get(target.value)?.focus();
    if (target.value !== value) onChange(target.value);
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
        moveTo(options.length - 1);
        return;
      default:
        return;
    }
  }

  return (
    <div className="segmented" role="radiogroup" {...rest}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={index === tabbableIndex ? 0 : -1}
          className="seg"
          data-value={option.value}
          ref={(element) => {
            segments.current.set(option.value, element);
          }}
          onClick={() => {
            if (option.value !== value) onChange(option.value);
          }}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          <svg className="ico check" viewBox="0 0 24 24" aria-hidden="true">
            <polyline
              points="4 12 9 17 20 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {option.label}
        </button>
      ))}
    </div>
  );
}
