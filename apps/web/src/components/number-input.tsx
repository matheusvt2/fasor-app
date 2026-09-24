import { useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type Ref } from 'react';
import { useFieldCommit } from '../input/use-field-commit.ts';
import { useDraftSource } from '../state/drafts.tsx';

/*
 * The one pt-BR number input of the sheet (Stories 5.3 carry-over, 5.5): the nameplate's
 * number fields and every Measurement field type into it. What it guarantees:
 *
 * - the text the engineer types is theirs while the input has the focus: it is parsed and
 *   committed on blur or Enter only, never on an idle pause ("3.3", a pause, "00" stays
 *   "3.300" and commits 3300, PR #30's carry-over);
 * - a stored value that changes (a remote edit, an undo, "Não medido") replaces the text
 *   only while the input is not focused and the stored raw differs from the parse of the
 *   text;
 * - while focused and parseable, `echo` is the line under the field ("= 3.300 MΩ");
 * - text that is no number stays typed, is flagged invalid and commits nothing;
 * - uncommitted text is a draft source ("Rascunho encontrado — Recuperar", FR-61).
 *
 * The parse, the echo and the formatting are the kernel's; this hook only holds the text.
 */

export interface ParsedNumber {
  raw: string;
  unit: string | null;
}

export interface NumberInputOptions {
  /** The stored value as the input shows it when not typing ('' when empty). */
  storedText: string;
  /** The stored raw when a number is stored, else null. */
  storedRaw: string | null;
  /** The kernel's parse of the typed text. */
  parse: (text: string) => ParsedNumber | null | 'invalid';
  /** Commits a parsed value (null: the field was emptied). */
  commit: (value: ParsedNumber | null) => void | Promise<void>;
  /** The echo line of a parseable text while focused. */
  echo?: (value: ParsedNumber) => string;
  /** The text a committed value is shown as afterwards ("147G" -> "147"); the typed text stays when omitted. */
  format?: (value: ParsedNumber) => string;
  /** The draft registration of the field. */
  draft: { surface: string; entityId: string; field: string };
  /** Enter, after the commit (the continuous run moves the focus). */
  onEnter?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Any other key, before the default handling (Shift+Enter, Tab). Return true when handled. */
  onKey?: (event: KeyboardEvent<HTMLInputElement>) => boolean;
  onFocusChange?: (focused: boolean) => void;
}

export interface NumberInputState {
  text: string;
  focused: boolean;
  invalid: boolean;
  /** The echo line to show now, or null. */
  echo: string | null;
  /** The current parse of the text (for a unit slot that follows a typed suffix). */
  parsed: ParsedNumber | null | 'invalid';
  /** Props for the `<input>`. */
  inputProps: InputHTMLAttributes<HTMLInputElement> & { ref: Ref<HTMLInputElement> };
  /** Commits the text now if it changed (a unit chip or the tap-cycle, before it acts). */
  commitNow: () => void;
}

const rawOf = (parsed: ParsedNumber | null | 'invalid'): string | null => (parsed === null || parsed === 'invalid' ? null : parsed.raw);

export function useNumberInput(options: NumberInputOptions): NumberInputState {
  const { storedText, storedRaw, parse, draft } = options;
  const [text, setText] = useState(storedText);
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const element = useRef<HTMLInputElement | null>(null);
  const focusedRef = useRef(false);
  const dirty = useRef(false);
  const current = useRef(text);
  current.current = text;
  const latest = useRef(options);
  latest.current = options;
  const committer = useFieldCommit<ParsedNumber | null>({ commit: (value) => latest.current.commit(value) });

  // The stored value moved: take it only when the engineer is not typing here.
  const seen = useRef(`${storedRaw ?? ''}\u0000${storedText}`);
  /** The stored value moved while this input had the focus, untouched: taken on blur. */
  const movedWhileFocused = useRef(false);
  const key = `${storedRaw ?? ''}\u0000${storedText}`;
  const differs = (value: string, raw: string | null, shown: string) => rawOf(parse(value)) !== raw || (raw === null && value !== shown);
  if (key !== seen.current) {
    seen.current = key;
    if (focusedRef.current) movedWhileFocused.current = true;
    else if (!dirty.current && differs(text, storedRaw, storedText)) setText(storedText);
  }

  const settle = (): void => {
    if (!dirty.current) {
      const { storedRaw: raw, storedText: shown } = latest.current;
      if (movedWhileFocused.current && differs(current.current, raw, shown)) setText(shown);
      movedWhileFocused.current = false;
      return;
    }
    movedWhileFocused.current = false;
    const value = parse(current.current);
    if (value === 'invalid') {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    dirty.current = false;
    committer.immediate(value);
    const format = latest.current.format;
    if (value !== null && format !== undefined) setText(format(value));
  };

  useDraftSource({
    surface: draft.surface,
    entityId: draft.entityId,
    field: draft.field,
    read: () => (dirty.current ? current.current : null),
    apply: (recovered) => {
      const next = typeof recovered === 'string' ? recovered : String(recovered);
      setText(next);
      current.current = next;
      dirty.current = true;
      settle();
    },
  });

  const parsed = parse(text);
  const echoFn = options.echo;
  const echo = focused && echoFn !== undefined && parsed !== null && parsed !== 'invalid' && dirty.current ? echoFn(parsed) : null;

  return {
    text,
    focused,
    invalid,
    echo,
    parsed,
    commitNow: settle,
    inputProps: {
      ref: element,
      value: text,
      inputMode: 'decimal',
      autoComplete: 'off',
      onChange: (event) => {
        dirty.current = true;
        setInvalid(false);
        setText(event.target.value);
      },
      onFocus: () => {
        focusedRef.current = true;
        setFocused(true);
        latest.current.onFocusChange?.(true);
      },
      onBlur: () => {
        focusedRef.current = false;
        setFocused(false);
        settle();
        latest.current.onFocusChange?.(false);
      },
      onKeyDown: (event) => {
        if (latest.current.onKey?.(event)) return;
        if (event.key === 'Enter' && !event.shiftKey) {
          settle();
          latest.current.onEnter?.(event);
        }
      },
    },
  };
}
