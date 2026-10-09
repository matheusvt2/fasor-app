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
  /** F-09: the line under the field while `options` is empty ("Nenhuma classe … — digite … para criar"). */
  emptyHint?: string;
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
  emptyHint,
}: RegistryPickerFieldProps) {
  const showEmptyHint = emptyHint !== undefined && options.length === 0;
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
  const textOf = (): string => initialText ?? (value === null ? '' : (byId.get(value)?.label ?? ''));
  const [inputValue, setInputValue] = useState(textOf);
  // F-07: a value that changes from outside while the engineer is not typing here ("Igual à
  // ⟨TAG⟩?", an undo, a pull) shows at once; the text being typed is never replaced.
  const shown = useRef({ value, initialText });
  if (shown.current.value !== value || shown.current.initialText !== initialText) {
    shown.current = { value, initialText };
    const typing = comboboxHost.current !== null && typeof document !== 'undefined' && comboboxHost.current.contains(document.activeElement);
    const next = textOf();
    if (!typing && next !== inputValue) setInputValue(next);
  }
  const chipsLabelId = useId();
  // "Criar" only for a name the registry does not hold yet, by the same normalized
  // comparison the server merges on (case and accents folded, trimmed; AR-18).
  const typed = matchKey(inputValue);
  const exists = inputValue.trim() === '' || options.some((option) => matchKey(option.label) === typed);

  /** True from the capture of a real leave until its bubble (`commitLeft`) has decided. */
  const leaving = useRef(false);
  /** The null selection React Aria reported while leaving (its custom-value commit), held for `commitLeft`. */
  const heldNull = useRef(false);
  const choose = (id: string | null) => {
    // r8lay-interaction-2: a leave with typed text that it will select or create writes one batch,
    // never a clear first.
    if (id === null && leaving.current) {
      heldNull.current = true;
      return;
    }
    if (id !== null) setInputValue(byId.get(id)?.label ?? '');
    onChange(id);
  };
  // DH-1 (review 2026-10-08): typed text the engineer leaves is never lost. When the focus leaves the
  // field (not into its own list or chevron), text naming an entry selects it, and text naming none
  // is created through `onCreate`, exactly as "Criar" would, once per text: a text "Criar" already
  // created (or a leave already did) is not created again while its entry has not landed.
  const latestText = useRef(inputValue);
  latestText.current = inputValue;
  const createdKeys = useRef(new Set<string>());
  // A created key whose entry has landed (or that left the list again) is free: the same text left
  // later is matched or created again.
  for (const key of [...createdKeys.current]) if (options.some((option) => matchKey(option.label) === key)) createdKeys.current.delete(key);
  /** Creates the text's entry; false when the caller created nothing (`onCreate` returned null). */
  const create = (text: string): boolean => {
    const createdLabel = onCreate(text);
    if (createdLabel === null) return false;
    createdKeys.current.add(matchKey(text));
    setInputValue(typeof createdLabel === 'string' ? createdLabel : text);
    return true;
  };
  // Only text the engineer changed while the field held the focus is committed on leave: a stored
  // by-value name shown as it is (an unregistered "Hi-Tech", a copied manufacturer) focused and left
  // untouched writes nothing; its own "Criar ⟨nome⟩?" line registers it.
  const textOnFocus = useRef<string | null>(null);
  const commitLeft = () => {
    const before = textOnFocus.current;
    textOnFocus.current = null;
    const held = heldNull.current;
    heldNull.current = false;
    // The clear React Aria asked for goes out when the leave itself decides nothing.
    const release = () => {
      if (held) onChange(null);
    };
    if (before !== null && latestText.current === before) return release();
    const text = latestText.current.trim();
    if (text === '') return release();
    const key = matchKey(text);
    const match = options.find((option) => matchKey(option.label) === key);
    if (match !== undefined) {
      if (match.id !== value) choose(match.id);
      else if (match.label !== latestText.current) setInputValue(match.label);
      return;
    }
    if (createdKeys.current.has(key)) return;
    if (!create(text)) release();
  };
  /** A focusout that is not a leave: into the field's own list or chevron, or the window losing the focus (lock, app switch) while the input keeps it. */
  const staysIn = (host: HTMLElement, next: EventTarget | null): boolean =>
    (next instanceof Element && (host.contains(next) || next.closest('.combobox-list') !== null)) ||
    (next === null && (host.contains(document.activeElement) || !document.hasFocus()));
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
      <div
        className="rpf-combobox"
        hidden={!showCombobox}
        ref={comboboxHost}
        onFocus={() => {
          // r8lay-interaction-1: the baseline is set when the focus arrives after a real leave (or
          // the first time), so a window refocus keeps the text the field had when it took the focus.
          if (textOnFocus.current === null) textOnFocus.current = latestText.current;
        }}
        onBlurCapture={(event) => {
          leaving.current = !staysIn(event.currentTarget, event.relatedTarget);
        }}
        onBlur={() => {
          const left = leaving.current;
          leaving.current = false;
          if (!left) {
            heldNull.current = false;
            return;
          }
          commitLeft();
        }}
      >
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
                  create(text.trim());
                },
              })}
        />
      </div>
      {showEmptyHint ? (
        <span className="helper">{emptyHint}</span>
      ) : null}
    </div>
  );
}
