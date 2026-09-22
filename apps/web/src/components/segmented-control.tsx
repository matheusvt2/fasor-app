import { ToggleButton, ToggleButtonGroup } from 'react-aria-components';

export interface SegmentedOption<Value extends string> {
  value: Value;
  label: string;
}

/** The keys React Aria's group uses to move focus between segments. */
const MOVE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

export interface SegmentedControlProps<Value extends string> {
  value: Value;
  onChange: (value: Value) => void;
  options: ReadonlyArray<SegmentedOption<Value>>;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

/**
 * A `radiogroup`; arrow keys move between segments and the change applies immediately
 * (Component Patterns › Segmented control) — Account › Tema, "Conselho".
 *
 * Built on `ToggleButtonGroup` in single-selection mode, which renders each segment as a
 * real `<button role="radio" aria-checked>` — the mock's own markup, and exactly what
 * `components.css`'s `.segmented .seg[aria-checked="true"]` reads, so the selected fill
 * and its `.check` glyph engage with no change to that stylesheet. Story 1.2 built this
 * on `RadioGroup`/`Radio`, whose real state sits on a hidden native `<input>` the
 * selector cannot reach; the test below asserts the attribute on the visible element so
 * that gap cannot come back unnoticed.
 */
export function SegmentedControl<Value extends string>({
  value,
  onChange,
  options,
  ...rest
}: SegmentedControlProps<Value>) {
  return (
    <ToggleButtonGroup
      className="segmented"
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const next = [...keys][0];
        if (typeof next === 'string' && next !== value) onChange(next as Value);
      }}
      {...rest}
    >
      {options.map((option) => (
        <ToggleButton
          key={option.value}
          id={option.value}
          className="seg"
          // Selection follows the arrow keys, the way a radiogroup behaves: React Aria's
          // ToggleButtonGroup moves focus with them but leaves selection to a press, and
          // "the change applies immediately" is the pattern's whole point. The commit
          // hangs off the keypress, never off focus itself — Tabbing into the group must
          // not rewrite the choice, and a click must not commit twice (once from focus,
          // once from `onSelectionChange`). React Aria moves focus on keydown, so the
          // keyup of a move key lands on the segment that is now focused: this handler
          // fires on the new selection without duplicating any key logic.
          onKeyUp={(event) => {
            if (!MOVE_KEYS.has(event.key)) return;
            if (option.value !== value) onChange(option.value);
          }}
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
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
