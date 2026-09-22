import { Switch } from 'react-aria-components';
import { ui } from '../copy/ui';

export interface ToggleProps {
  isSelected: boolean;
  onChange?: (isSelected: boolean) => void;
  /** Accessible name; the visible `.toggle-word` carries the state, not the identity. */
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

/**
 * `role="switch"` with `aria-checked`; the word beside it is the accessible state
 * (Component Patterns › Toggle). Tapping the whole element toggles.
 *
 * Design Notes gap: `components.css` styles the "on" fill with `.toggle[aria-checked="true"]
 * .track`, which assumes the mockups' hand-rolled `<button role="switch" aria-checked>`.
 * React Aria's `Switch` puts the real, valid `role="switch"`/`aria-checked` on a visually
 * hidden native `<input>` inside this label (a correct, standard accessible pattern) and its
 * `filterDOMProps` refuses to also place `aria-checked` on the styled label — verified: doing
 * it anyway (even via an imperative `setAttribute`, bypassing React) makes axe fail
 * `aria-allowed-attr`, because a `<label>` has no role that permits `aria-checked`. There is
 * no `.is-*`/`[data-state]` alternative for this row in `components.css` either. So this
 * control is fully functional and keyboard/screen-reader correct (the real state is on the
 * input, `isSelected` is reflected as `data-selected` on the label), but the `.track`/`.knob`
 * "on" fill does not visually engage until `components.css` grows a selector this DOM shape
 * can satisfy (e.g. a `:has()` rule, or a `data-selected` alias) — the closest existing
 * selector is used (`.toggle`), the gap is this note, not an invented rule.
 */
export function Toggle({ isSelected, onChange, ...rest }: ToggleProps) {
  return (
    <Switch isSelected={isSelected} onChange={onChange} className="toggle" {...rest}>
      <span className="track" aria-hidden="true">
        <span className="knob" />
      </span>
      <span className="toggle-word">{isSelected ? ui.toggle.on : ui.toggle.off}</span>
    </Switch>
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
