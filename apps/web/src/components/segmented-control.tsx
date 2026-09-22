import { Radio, RadioGroup } from 'react-aria-components';

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
 * A `radiogroup`; arrow keys move between segments and the change applies immediately
 * (Component Patterns › Segmented control) — e.g. Account › Tema, "Conselho".
 *
 * Design Notes gap: same family as Toggle/Checkbox — `components.css` fills a selected
 * `.seg` only via `.seg[aria-checked="true"]`, which needs the real ARIA state on the
 * *label* React Aria's `Radio` renders; the actual `role="radio"`/`aria-checked` correctly
 * stays on its hidden native input (verified with axe: mirroring it onto the label is an
 * `aria-allowed-attr` violation). The radiogroup is fully keyboard-operable (arrow keys,
 * native radio semantics) and `data-selected` reflects the choice on the label; the selected
 * segment's highlight does not visually engage until `components.css` gains a selector this
 * DOM shape can satisfy.
 */
export function SegmentedControl<Value extends string>({ value, onChange, options, ...rest }: SegmentedControlProps<Value>) {
  return (
    <RadioGroup value={value} onChange={(next) => onChange(next as Value)} orientation="horizontal" className="segmented" {...rest}>
      {options.map((option) => (
        <Radio key={option.value} value={option.value} className="seg">
          <svg className="ico check" viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="4 12 9 17 20 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {option.label}
        </Radio>
      ))}
    </RadioGroup>
  );
}
