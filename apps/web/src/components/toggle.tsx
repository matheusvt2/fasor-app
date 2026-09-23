import { ui } from '../copy/ui';

export interface ToggleProps {
  /** For a row's `<label htmlFor>`: tapping the row label toggles too (EXPERIENCE.md › Toggle). */
  id?: string;
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
  /** For a row's `<label htmlFor>` (a press on it does nothing, as on the switch). */
  id?: string;
  /** The sub-block's name (e.g. "Lista de verificação"); the accessible name adds ", sempre ativado". */
  'aria-label': string;
}

/**
 * A locked sub-block (checklist, conclusion): always on, shown for information, not a
 * control (Component Patterns › Toggle). The mock's markup verbatim
 * (`42-template-composer.html`, the "Observações e conclusão" row): a `.toggle` switch that
 * is `aria-checked="true" aria-disabled="true"`, named "⟨sub-block⟩, sempre ativado", with
 * "Sempre" as its word. `aria-disabled` rather than `disabled`, so it stays perceivable and
 * reachable by keyboard; a press does nothing.
 */
export function LockedToggle({ id, 'aria-label': ariaLabel }: LockedToggleProps) {
  return (
    <button id={id} type="button" className="toggle" role="switch" aria-checked="true" aria-disabled="true" aria-label={ui.toggle.lockedLabel(ariaLabel)}>
      <span className="track" aria-hidden="true">
        <span className="knob" />
      </span>
      <span className="toggle-word">{ui.toggle.locked}</span>
    </button>
  );
}
