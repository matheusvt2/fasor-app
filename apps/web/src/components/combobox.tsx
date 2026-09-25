import { useEffect, useId, useRef, type Ref } from 'react';
import { Button, ComboBox, Input, Label, ListBox, ListBoxItem, Popover } from 'react-aria-components';
import { ui } from '../copy/ui';

/**
 * React Aria's `usePopover` closes a non-modal popover (ours: `isNonModal` is implicit for
 * `ComboBox`) on *any* scroll of an ancestor that contains the trigger — including the page
 * itself — because it has no cheaper way to keep an absolutely positioned popover from
 * drifting out of place. It arms this the instant the popover opens (`useCloseOnScroll`,
 * `@react-aria/overlays`), with no prop to scope it to "later" scrolls only.
 *
 * That collides with the ordinary act of *reaching* a field that needs scrolling into view:
 * opening the list is the same gesture as the scroll that revealed its own chevron button, and
 * the trailing scroll event — Playwright's own scroll-into-view settling a beat after the
 * click, or, for a real user, momentum still bleeding off a touch scroll on the tablet this
 * app targets — can land a few dozen milliseconds *after* the popover has already opened.
 * React Aria cannot tell that apart from a deliberate "scroll the page away" dismissal, so it
 * closes the list before anything can be selected from it.
 *
 * A short grace window after opening, during which a scroll event on the page is intercepted
 * before React Aria's own window-capture listener ever sees it, keeps the guard for a real,
 * later scroll-away while not punishing the popover for the scroll that brought its trigger
 * into view. Registered once per mount (well before any open), so it always runs first on the
 * same node and phase as React Aria's own listener (attached only once open, and later).
 */
const SCROLL_GRACE_MS = 400;

function useIgnoreScrollRightAfterOpen(): (open: boolean) => void {
  const openedAtRef = useRef(0);
  useEffect(() => {
    const onScroll = (event: Event) => {
      if (Date.now() - openedAtRef.current < SCROLL_GRACE_MS) event.stopImmediatePropagation();
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, []);
  return (open) => {
    if (open) openedAtRef.current = Date.now();
  };
}

export interface ComboboxOption {
  id: string;
  label: string;
  /** The mock's `.option-meta` at the right of the option ("94 blocos"). */
  meta?: string;
}

const CREATE_KEY = '__create__';

export interface ComboboxProps {
  label: string;
  options: ReadonlyArray<ComboboxOption>;
  selectedKey?: string | null;
  onSelectionChange?: (key: string | null) => void;
  inputValue?: string;
  onInputChange?: (value: string) => void;
  /**
   * Trailing "Criar '<texto digitado>'" option, last, that creates a registry entry inline
   * (Component Patterns › Combobox). Shell only: this component neither writes the
   * registry nor filters — the caller supplies `options` already filtered.
   */
  onCreate?: (query: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  disabledReason?: string;
  /** The text input, for a caller that moves the focus into it (E12-Q11). */
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * `.field.combobox` shell: type to filter, arrows + Enter to choose, "Criar…" last.
 * Works from whatever `options` the caller passes, so it functions offline against a
 * cached registry without this component knowing anything about it.
 */
export function Combobox({
  label,
  options,
  selectedKey,
  onSelectionChange,
  inputValue,
  onInputChange,
  onCreate,
  placeholder,
  isDisabled,
  disabledReason,
  inputRef,
}: ComboboxProps) {
  if (isDisabled && !disabledReason) {
    throw new Error('Combobox: isDisabled requires a disabledReason shown beside the control.');
  }
  const reasonId = useId();
  const trimmed = inputValue?.trim() ?? '';
  const showCreate = Boolean(onCreate) && trimmed.length > 0;
  const noteOpenChange = useIgnoreScrollRightAfterOpen();

  return (
    <>
      <ComboBox
        className="field combobox"
        selectedKey={selectedKey}
        onOpenChange={noteOpenChange}
        onSelectionChange={(key) => {
          if (isDisabled) return;
          if (key === CREATE_KEY) {
            onCreate?.(trimmed);
            return;
          }
          onSelectionChange?.(key == null ? null : String(key));
        }}
        inputValue={inputValue}
        onInputChange={(value) => {
          if (isDisabled) return;
          onInputChange?.(value);
        }}
        allowsCustomValue={Boolean(onCreate)}
        // Typing a name no option matches must still open the list: React Aria decides
        // whether to open before the "Criar" option for the new text exists, and would
        // otherwise keep it closed until the chevron is pressed (Epic 2 retro D-2).
        allowsEmptyCollection={Boolean(onCreate)}
        // The typed text is matched trimmed, as "Criar" names it: a trailing space must not
        // hide the "Criar" option or an entry that matches.
        defaultFilter={(textValue, typed) => textValue.toLocaleLowerCase('pt-BR').includes(typed.trim().toLocaleLowerCase('pt-BR'))}
      >
        <Label className="field-label">{label}</Label>
        <Input
          ref={inputRef}
          className="input"
          placeholder={placeholder}
          aria-disabled={isDisabled || undefined}
          aria-describedby={isDisabled && disabledReason ? reasonId : undefined}
        />
        <Button className="combobox-chevron" aria-label={ui.combobox.openList}>
          <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Button>
        <Popover className="combobox-list">
          <ListBox>
            {options.map((option) => (
              <ListBoxItem key={option.id} id={option.id} className="combobox-option" textValue={option.label}>
                {option.label}
                {option.meta === undefined ? null : <span className="option-meta">{option.meta}</span>}
              </ListBoxItem>
            ))}
            {showCreate ? (
              <ListBoxItem id={CREATE_KEY} className="combobox-option is-create" textValue={ui.combobox.create(trimmed)}>
                {ui.combobox.create(trimmed)}
              </ListBoxItem>
            ) : null}
          </ListBox>
        </Popover>
      </ComboBox>
      {isDisabled && disabledReason ? (
        <span className="btn-reason" id={reasonId}>
          {disabledReason}
        </span>
      ) : null}
    </>
  );
}
