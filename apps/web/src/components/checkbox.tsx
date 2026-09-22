import { Checkbox as AriaCheckbox, type CheckboxProps as AriaCheckboxProps } from 'react-aria-components';

export interface CheckboxProps extends Omit<AriaCheckboxProps, 'className' | 'children' | 'isSelected'> {
  isSelected: boolean;
  children: React.ReactNode;
}

/**
 * `role="checkbox"` rows; the whole 56px row is the target (Component Patterns › Checkbox).
 * Controlled only, matching how the sheet and Relatório setup drive it from op state.
 *
 * Design Notes gap: same as Toggle — `components.css` fills `.box` only via
 * `.checkbox[aria-checked="true"]`, which needs the real ARIA state on the *label*; React
 * Aria's `Checkbox` correctly keeps it on the hidden native input instead (`data-selected`
 * reflects it on the label). Verified with axe: forcing `aria-checked` onto the label anyway
 * is an `aria-allowed-attr` violation (a `<label>` has no role that permits it), so this
 * component stays accessible and un-hacked; the checked fill on `.box` does not visually
 * engage until `components.css` gains a selector this DOM shape can satisfy.
 */
export function Checkbox({ isSelected, children, ...rest }: CheckboxProps) {
  return (
    <AriaCheckbox isSelected={isSelected} className="checkbox" {...rest}>
      <span className="box">
        <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
          <polyline points="4 12 9 17 20 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {children}
    </AriaCheckbox>
  );
}
