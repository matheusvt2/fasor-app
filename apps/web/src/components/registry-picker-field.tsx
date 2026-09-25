import { normalizeRegistryName } from '@app/domain';
import { useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ui } from '../copy/ui.ts';
import { Chip } from './chip.tsx';
import { Combobox, type ComboboxOption } from './combobox.tsx';

export interface RegistryPickerFieldProps {
  label: string;
  /** The full registry (manufacturer or voltage_class), for the Combobox's own list. */
  options: ReadonlyArray<ComboboxOption>;
  /** Up to 5 most-recent ids, rendered as tap chips ahead of "Outro…" (UX & Interaction Patterns). */
  recentIds: readonly string[];
  value: string | null;
  onChange: (id: string | null) => void;
  /**
   * Fires with the trimmed typed text when "Criar '…'" is chosen (Story 2.4 AC2, 2.5 AC3).
   * Returns the label the created entry will carry in `options` ("15 kV" for a typed
   * "15 kV" or "15"), which the input then shows, so a later blur finds the entry and does
   * not let go of it (E12-Q1); nothing, or null when nothing was created, keeps the typed text.
   */
  onCreate: (text: string) => string | null | void;
  /**
   * The key two texts are compared by to tell whether the typed text names an entry already
   * there (no "Criar" then). Defaults to the registry's own normalized name (AR-18).
   */
  matchKey?: (text: string) => string;
  /**
   * The text the Combobox shows on the first render: the chosen option's label, or the
   * stored by-value text when it matches no registry entry (a free-text manufacturer
   * typed before the picker existed). Defaults to the selected option's label.
   */
  initialText?: string;
}

/**
 * The shared "chip row + Combobox" field 2.4 (client sites, later surfaces) and 2.5
 * (manufacturer/voltage_class) both need (Code Map). Tablet/phone shows the chip row with
 * a trailing "Outro…" that reveals the Combobox; desktop shows the Combobox directly — a
 * pure CSS breakpoint switch (`registries.css`/`app.css`), never a JS `matchMedia` (Boundaries).
 */
export function RegistryPickerField({
  label,
  options,
  recentIds,
  value,
  onChange,
  onCreate,
  initialText,
  matchKey = normalizeRegistryName,
}: RegistryPickerFieldProps) {
  const byId = new Map(options.map((option) => [option.id, option] as const));
  const [showCombobox, setShowCombobox] = useState(false);
  // Story 12.4 (J-09), E12-Q7: "Outro…" lands the focus inside the Combobox it reveals, in
  // the press handler itself, so a tablet browser opens its soft keyboard for it (a focus
  // outside the user gesture shows none) and typing starts at once.
  const comboboxHost = useRef<HTMLDivElement>(null);
  const revealCombobox = () => {
    // The host is always mounted (`hidden`), so the reveal commits synchronously here.
    flushSync(() => setShowCombobox(true));
    const input = comboboxHost.current?.querySelector<HTMLInputElement>('input');
    if (input === null || input === undefined) return;
    input.focus({ preventScroll: true });
    // Centred after the focus, so the list the typing opens below it is on screen; the
    // scroll's event fires within the frame, before any typed key opens the list, which a
    // scroll landing after it would close (`combobox.tsx`).
    input.scrollIntoView?.({ block: 'center' });
  };
  const [inputValue, setInputValue] = useState(
    () => initialText ?? (value === null ? '' : (byId.get(value)?.label ?? '')),
  );
  const chipsLabelId = useId();
  // "Criar" only for a name the registry does not hold yet, by the same normalized
  // comparison the server merges on (case and accents folded, trimmed; AR-18).
  const typed = matchKey(inputValue);
  const exists = inputValue.trim() === '' || options.some((option) => matchKey(option.label) === typed);

  const choose = (id: string | null) => {
    if (id !== null) setInputValue(byId.get(id)?.label ?? '');
    onChange(id);
  };
  const recentOptions = recentIds
    .map((id) => byId.get(id))
    .filter((option): option is ComboboxOption => option !== undefined)
    .slice(0, 5);

  return (
    <div className="rpf">
      {!showCombobox && (
        <div className="rpf-chip-row">
          <span className="field-label" id={chipsLabelId}>
            {label}
          </span>
          <div className="chip-row chips-recent" role="group" aria-labelledby={chipsLabelId}>
            {recentOptions.map((option) => (
              <Chip key={option.id} isSelected={value === option.id} onSelectedChange={() => choose(option.id)}>
                {option.label}
              </Chip>
            ))}
            <Chip onPress={revealCombobox}>
              {ui.registryPicker.other}
            </Chip>
          </div>
        </div>
      )}
      <div className="rpf-combobox" hidden={!showCombobox} ref={comboboxHost}>
        <Combobox
          label={label}
          options={options}
          selectedKey={value}
          onSelectionChange={choose}
          inputValue={inputValue}
          onInputChange={setInputValue}
          {...(exists
            ? {}
            : {
                onCreate: (text: string) => {
                  const createdLabel = onCreate(text.trim());
                  setInputValue(typeof createdLabel === 'string' ? createdLabel : text.trim());
                },
              })}
        />
      </div>
    </div>
  );
}
