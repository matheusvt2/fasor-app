import type { KeyboardEvent, ReactNode } from 'react';

export interface CheckboxProps {
  isSelected: boolean;
  onChange?: (isSelected: boolean) => void;
  /** The row's visible label, which is also its accessible name. */
  children: ReactNode;
  /** A reason beside the row (an expired calibration); the row stays selectable. */
  'aria-describedby'?: string;
}

/**
 * `role="checkbox"` rows; the whole 56px row is the target (Component Patterns › Checkbox).
 * Controlled only, matching how the sheet and Relatório setup drive it from op state.
 *
 * This is the mock's markup verbatim: `<button class="checkbox" role="checkbox"
 * aria-checked>`. The state sits on the element `components.css` styles
 * (`.checkbox[aria-checked="true"] .box`), so the checked fill engages with no change to
 * that stylesheet — the pattern proven on `SegmentedControl` (retro F-SPEC-6). React
 * Aria's `Checkbox` kept it on a hidden native input the selector could not reach.
 *
 * Keyboard (APG checkbox): Space toggles. Enter does not: a checkbox is not submitted or
 * activated by Enter, so the key a `<button>` would otherwise turn into a click is dropped.
 */
export function Checkbox({ isSelected, onChange, children, ...rest }: CheckboxProps) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Enter') event.preventDefault();
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isSelected}
      className="checkbox"
      onClick={() => onChange?.(!isSelected)}
      onKeyDown={onKeyDown}
      {...rest}
    >
      <span className="box" aria-hidden="true">
        <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
          <polyline points="4 12 9 17 20 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {children}
    </button>
  );
}
