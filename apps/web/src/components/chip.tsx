import { useRef, type KeyboardEvent } from 'react';
import { Button as AriaButton, ToggleButton } from 'react-aria-components';

export interface ChipProps {
  children: React.ReactNode;
  /** Value chip: pressed/selected look via `aria-pressed`, controlled. */
  isSelected?: boolean;
  onSelectedChange?: (isSelected: boolean) => void;
  /** Text chip: tap inserts text at the caret; no persistent pressed state. */
  onPress?: () => void;
  /**
   * Shown but not in use (the Caption composer's rows while "Editar texto" is on): the chip
   * stays in the tab order with `aria-disabled="true"`, never reads pressed, and a tap
   * does nothing.
   */
  isInactive?: boolean;
}

/** A chip that is on screen but does nothing: `aria-disabled`, focusable, never pressed. */
export function InactiveChip({ children, className = 'chip' }: { children: React.ReactNode; className?: string }) {
  return (
    <button type="button" className={className} aria-disabled="true">
      {children}
    </button>
  );
}

/**
 * `.chip`. Two roles, same look (Component Patterns › Chip): a value chip is a controlled
 * toggle (`aria-pressed`) and a text chip is a plain tap. `chip-row` wraps to a new line at
 * 8px gaps and never scrolls sideways — the layout is the surface's, not this component's.
 */
export function Chip({ children, isSelected, onSelectedChange, onPress, isInactive = false }: ChipProps) {
  if (isInactive) return <InactiveChip>{children}</InactiveChip>;
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
  /** The pressed chip; null while none is (a choice with no default, Story 12.4's Não ensaiado reason). */
  selectedId: string | null;
  onChange: (id: string) => void;
  'aria-label': string;
}

/**
 * Exactly one pressed chip once one is chosen (none before, with `selectedId` null): tapping
 * another moves the selection, tapping the pressed one does nothing — no clearing by re-tap
 * (Component Patterns › Filter chip).
 *
 * A real `radiogroup`/`radio` with the APG radiogroup keyboard contract, the one
 * `SegmentedControl` implements (hand-rolled for the same reason: React Aria's
 * `ToggleButtonGroup` is a toolbar whose arrows move focus but not the selection):
 *
 * - Tab lands on the checked chip, or the first one while none is, and nowhere else.
 * - ArrowLeft/ArrowUp and ArrowRight/ArrowDown move focus and selection together, wrapping.
 * - Home and End move focus and selection to the first and last chip.
 * - Space and Enter select the focused chip (a `<button>` raises `click` for both).
 *
 * On state: `components.css` styles the selected look as `.chip[aria-pressed="true"]`; a
 * grouped filter chip's real, correct state is `role="radio" aria-checked` (verified with
 * axe: `aria-pressed` is not an allowed attribute once the role is `radio`, so stacking it on
 * top — even to match the CSS — is a violation and was rejected). `app.css` therefore
 * mirrors that rule's declarations verbatim for `.chip[role="radio"][aria-checked="true"]`,
 * the on-state alias pattern of AGENTS.md (retro F-SPEC-6). The standalone value `Chip`
 * above keeps `aria-pressed` natively and gets the mock rule directly.
 */
export function FilterChipGroup({ options, selectedId, onChange, ...rest }: FilterChipGroupProps) {
  const chips = useRef(new Map<string, HTMLButtonElement | null>());
  const selectedIndex = options.findIndex((option) => option.id === selectedId);
  const tabbableIndex = selectedIndex === -1 ? 0 : selectedIndex;

  function moveTo(index: number) {
    const target = options[(index + options.length) % options.length];
    if (target === undefined) return;
    chips.current.get(target.id)?.focus();
    if (target.id !== selectedId) onChange(target.id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const to = KEY_STEP.get(event.key)?.(index, options.length);
    if (to === undefined) return;
    event.preventDefault();
    moveTo(to);
  }

  return (
    <div role="radiogroup" className="chip-row" {...rest}>
      {options.map((option, index) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === selectedId}
          tabIndex={index === tabbableIndex ? 0 : -1}
          className="chip"
          ref={(element) => {
            chips.current.set(option.id, element);
          }}
          onClick={() => {
            if (option.id !== selectedId) onChange(option.id);
          }}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The index each radiogroup key moves to from `index` in a group of `count` (wrapping is `moveTo`'s). */
const KEY_STEP = new Map<string, (index: number, count: number) => number>([
  ['ArrowLeft', (index) => index - 1],
  ['ArrowUp', (index) => index - 1],
  ['ArrowRight', (index) => index + 1],
  ['ArrowDown', (index) => index + 1],
  ['Home', () => 0],
  ['End', (_index, count) => count - 1],
]);
