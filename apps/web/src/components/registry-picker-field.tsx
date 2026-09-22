import { useId, useState } from 'react';
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
}

/**
 * The shared "chip row + Combobox" field 2.4 (client sites, later surfaces) and 2.5
 * (manufacturer/voltage_class) both need (Code Map). Tablet/phone shows the chip row with
 * a trailing "Outro…" that reveals the Combobox; desktop shows the Combobox directly — a
 * pure CSS breakpoint switch (`registries.css`/`app.css`), never a JS `matchMedia` (Boundaries).
 */
export function RegistryPickerField({ label, options, recentIds, value, onChange, onCreate }: RegistryPickerFieldProps) {
  const [showCombobox, setShowCombobox] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const chipsLabelId = useId();

  const byId = new Map(options.map((option) => [option.id, option] as const));
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
              <Chip key={option.id} isSelected={value === option.id} onSelectedChange={() => onChange(option.id)}>
                {option.label}
              </Chip>
            ))}
            <Chip onPress={() => setShowCombobox(true)}>{ui.registryPicker.other}</Chip>
          </div>
        </div>
      )}
      <div className="rpf-combobox" hidden={!showCombobox}>
        <Combobox
          label={label}
          options={options}
          selectedKey={value}
          onSelectionChange={onChange}
          inputValue={inputValue}
          onInputChange={setInputValue}
          onCreate={(text) => onCreate(text.trim())}
        />
      </div>
    </div>
  );
}
