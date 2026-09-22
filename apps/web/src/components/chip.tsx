import { Button as AriaButton, ToggleButton, ToggleButtonGroup, type Selection } from 'react-aria-components';

export interface ChipProps {
  children: React.ReactNode;
  /** Value chip: pressed/selected look via `aria-pressed`, controlled. */
  isSelected?: boolean;
  onSelectedChange?: (isSelected: boolean) => void;
  /** Text chip: tap inserts text at the caret; no persistent pressed state. */
  onPress?: () => void;
}

/**
 * `.chip`. Two roles, same look (Component Patterns › Chip): a value chip is a controlled
 * toggle (`aria-pressed`) and a text chip is a plain tap. `chip-row` wraps to a new line at
 * 8px gaps and never scrolls sideways — the layout is the surface's, not this component's.
 */
export function Chip({ children, isSelected, onSelectedChange, onPress }: ChipProps) {
  if (onSelectedChange) {
    return (
      <ToggleButton isSelected={isSelected} onChange={onSelectedChange} className="chip">
        {children}
      </ToggleButton>
    );
  }
  return (
    <AriaButton className="chip" onPress={onPress}>
      {children}
    </AriaButton>
  );
}

export interface FilterChipOption {
  id: string;
  label: string;
}

export interface FilterChipGroupProps {
  options: ReadonlyArray<FilterChipOption>;
  selectedId: string;
  onChange: (id: string) => void;
  'aria-label': string;
}

/**
 * Exactly one pressed chip at all times: tapping another moves the selection, tapping the
 * pressed one does nothing — no clearing by re-tap (Component Patterns › Filter chip).
 * `ToggleButtonGroup` in single-selection mode gives the roving-tabindex keyboard behavior
 * (Design Notes) as a real, valid `radiogroup`/`radio` (a button with its role reassigned,
 * fully valid — unlike Switch/Checkbox/Radio, no hidden input is involved here).
 *
 * Design Notes gap: `components.css` styles the selected look as `.chip[aria-pressed="true"]`;
 * a grouped filter chip's real, correct state is `role="radio" aria-checked` (verified with
 * axe: `aria-pressed` is not an allowed attribute once the role is `radio`, so stacking it on
 * top — even to match the CSS — is a violation and was rejected). The standalone value `Chip`
 * above is unaffected: an ungrouped `ToggleButton` keeps `aria-pressed` natively and gets the
 * `.chip[aria-pressed="true"]` look correctly. Only the *grouped* filter case does not
 * visually engage until `components.css` gains a selector this DOM shape can satisfy.
 */
export function FilterChipGroup({ options, selectedId, onChange, ...rest }: FilterChipGroupProps) {
  return (
    <ToggleButtonGroup
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[selectedId]}
      onSelectionChange={(keys: Selection) => {
        if (keys === 'all') return;
        const [first] = Array.from(keys);
        if (first != null) onChange(String(first));
      }}
      className="chip-row"
      {...rest}
    >
      {options.map((option) => (
        <ToggleButton key={option.id} id={option.id} className="chip">
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
