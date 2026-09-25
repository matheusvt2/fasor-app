import { normalizeRegistryName } from '@app/domain';
import { useEffect, useId, useRef, useState } from 'react';
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
  /** Fires with the trimmed typed text when "Criar '…'" is chosen (Story 2.4 AC2, 2.5 AC3). */
  onCreate: (text: string) => void;
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
}: RegistryPickerFieldProps) {
  const byId = new Map(options.map((option) => [option.id, option] as const));
  const [showCombobox, setShowCombobox] = useState(false);
  // Story 12.4 (J-09): "Outro…" lands the focus inside the Combobox it reveals, so typing
  // starts at once (one tap, not two).
  const comboboxHost = useRef<HTMLDivElement>(null);
  const focusInput = useRef(false);
  useEffect(() => {
    if (!showCombobox || !focusInput.current) return;
    focusInput.current = false;
    const input = comboboxHost.current?.querySelector<HTMLInputElement>('input');
    if (input === null || input === undefined) return;
    // Centred first, so the list the typing opens below it is on screen; the focus comes two
    // frames later, once that scroll's event has fired: a scroll landing after the list opened
    // would close it (`combobox.tsx`).
    input.scrollIntoView?.({ block: 'center' });
    let frames = 2;
    const land = () => {
      if (--frames > 0) requestAnimationFrame(land);
      else input.focus({ preventScroll: true });
    };
    requestAnimationFrame(land);
  }, [showCombobox]);
  const [inputValue, setInputValue] = useState(
    () => initialText ?? (value === null ? '' : (byId.get(value)?.label ?? '')),
  );
  const chipsLabelId = useId();
  // "Criar" only for a name the registry does not hold yet, by the same normalized
  // comparison the server merges on (case and accents folded, trimmed; AR-18).
  const typed = normalizeRegistryName(inputValue);
  const exists = typed === '' || options.some((option) => normalizeRegistryName(option.label) === typed);

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
            <Chip
              onPress={() => {
                focusInput.current = true;
                setShowCombobox(true);
              }}
            >
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
                  setInputValue(text.trim());
                  onCreate(text.trim());
                },
              })}
        />
      </div>
    </div>
  );
}
