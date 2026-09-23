import { useId } from 'react';
import { Button, ComboBox, Input, Label, ListBox, ListBoxItem, Popover } from 'react-aria-components';
import { ui } from '../copy/ui';

export interface ComboboxOption {
  id: string;
  label: string;
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
}: ComboboxProps) {
  if (isDisabled && !disabledReason) {
    throw new Error('Combobox: isDisabled requires a disabledReason shown beside the control.');
  }
  const reasonId = useId();
  const trimmed = inputValue?.trim() ?? '';
  const showCreate = Boolean(onCreate) && trimmed.length > 0;

  return (
    <>
      <ComboBox
        className="field combobox"
        selectedKey={selectedKey}
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
