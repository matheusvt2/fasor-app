import { ui } from '../copy/ui';

export interface ToggleProps {
  isSelected: boolean;
  onChange?: (isSelected: boolean) => void;
  /** Accessible name; the visible `.toggle-word` carries the state, not the identity. */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

/**
 * `role="switch"` with `aria-checked`; the word beside it is the visible state
 * (Component Patterns › Toggle). Tapping the whole element toggles.
 *
 * This is the mock's markup verbatim: `<button class="toggle" role="switch"
 * aria-checked>`. The state therefore sits on the element `components.css` styles
 * (`.toggle[aria-checked="true"] .track | .knob | .toggle-word`), so the on fill engages
 * with no change to that stylesheet — the pattern proven on `SegmentedControl`. React
 * Aria's `Switch` kept the state on a visually hidden native input the selector could not
 * reach, and a `<label>` may not carry `aria-checked` (retro F-SPEC-6).
 *
 * Keyboard (APG switch): Tab reaches it; Space and Enter toggle it (a `<button>` raises
 * `click` for both).
 */
export function Toggle({ isSelected, onChange, ...rest }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isSelected}
      className="toggle"
      onClick={() => onChange?.(!isSelected)}
      {...rest}
    >
      <span className="track" aria-hidden="true">
        <span className="knob" />
      </span>
      <span className="toggle-word">{isSelected ? ui.toggle.on : ui.toggle.off}</span>
    </button>
  );
}

export interface LockedToggleProps {
  /** Accessible name for the read-only switch (e.g. "Lista de verificação"). */
  'aria-label'?: string;
}

/**
 * A locked sub-block (checklist, conclusion): always on, shown for information, not a
 * control (Component Patterns › Toggle). Read-only rather than disabled: the state is
 * still meant to be perceived, just never changed here. Plain markup (not React Aria): a
 * static, non-interactive element may legitimately carry `role`/`aria-checked` directly.
 */
export function LockedToggle({ 'aria-label': ariaLabel }: LockedToggleProps) {
  return (
    <span className="toggle" role="switch" aria-checked="true" aria-readonly="true" aria-label={ariaLabel} tabIndex={0}>
      <span className="track" aria-hidden="true">
        <span className="knob" />
      </span>
      <span className="toggle-word">{ui.toggle.locked}</span>
    </span>
  );
}
