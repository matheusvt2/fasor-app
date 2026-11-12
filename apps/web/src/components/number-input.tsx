import { useLayoutEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type Ref } from 'react';
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
 * - uncommitted text is a draft source ("Rascunho encontrado — Recuperar", FR-61);
 * - Story 16.4: a nameplate or cabine field's parse may answer "N/A" (`state:
 *   'not_applicable'`); a Measurement field's parse never does.
 *
 * The parse, the echo and the formatting are the kernel's; this hook only holds the text.
 */

export interface ParsedNumber {
  raw: string;
  unit: string | null;
  /**
   * Story 16.4: an "N/A" typed in a nameplate or cabine number field; Story 22.10: a reading
   * above the instrument's limit typed in a Measurement field ("OL", "> 2 TΩ"); absent for a number.
   */
  state?: 'not_applicable' | 'over_range';
}

/**
 * Story 22.10: the `storedRaw` of a stored reading above the limit (`> ` and its raw). `rawOf`
 * answers the same for a typed one, so "> 2" stored and shown keeps the text while a stored
 * number "2" differs from it. Never a decimal string.
 */
export function overRangeStoredRaw(raw: string): string {
  return `>${raw}`;
}

/**
 * Story 16.4: the `storedRaw` of a stored "N/A". `rawOf` answers it for a typed "N/A" too, so a
 * re-render with "N/A" stored and shown keeps the text, while a stored number or a blank (an
 * undo, a remote put) differs from it and replaces the text at rest. Never a decimal string.
 */
export const NOT_APPLICABLE_STORED_RAW = '\u0000not_applicable';

export interface NumberInputOptions {
  /** The stored value as the input shows it when not typing ('' when empty). */
  storedText: string;
  /** The stored raw when a number is stored, `NOT_APPLICABLE_STORED_RAW` for a stored "N/A", else null. */
  storedRaw: string | null;
  /** The kernel's parse of the typed text. */
  parse: (text: string) => ParsedNumber | null | 'invalid';
  /** Commits a parsed value (null: the field was emptied). */
  commit: (value: ParsedNumber | null) => void | Promise<void>;
  /** The echo line of a parseable text while focused; null shows none (an "N/A"). */
  echo?: (value: ParsedNumber) => string | null;
  /** The text a committed value is shown as afterwards ("147G" -> "147"); the typed text stays when omitted. */
  format?: (value: ParsedNumber) => string;
  /** The draft registration of the field. */
  draft: { surface: string; entityId: string; field: string };
  /** Enter, after the commit (the continuous run moves the focus). */
  onEnter?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Any other key, before the default handling (Shift+Enter, Tab). Return true when handled. */
  onKey?: (event: KeyboardEvent<HTMLInputElement>) => boolean;
  onFocusChange?: (focused: boolean) => void;
  /**
   * F-01: typed text not committed yet is committed when the input leaves the page (a plate
   * suggestion landing on this empty field swaps it out), never silently dropped. Story 25.2:
   * text that does not parse is written to the draft store at that moment instead, so the
   * sheet offers it on return ("Rascunho encontrado — Recuperar").
   */
  flushOnUnmount?: boolean;
  /**
   * Story 25.2: typed text the unmount drops with no draft (the lone ">" a "> limite" with no
   * limit put in a Measurement field). Read at unmount only.
   */
  discardOnUnmount?: (text: string) => boolean;
  /**
   * Fix batch fxpw G4: the keyboard the input asks for; `decimal` by default. A field that
   * accepts a two-level voltage ("380/220") asks for `text`: the decimal keypad has no "/".
   */
  inputMode?: 'decimal' | 'text';
  /**
   * Story 18.4: the typed text was refused on a blur or an Enter (never on a keystroke, an idle
   * pause or a `commitNow`); the caller names why (the kernel's reason) in an `input_refused`.
   * The text is handed over for that mapping only and never belongs in an event.
   */
  onRefuse?: (text: string) => void;
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
  /**
   * Commits a given value now and marks the text clean (a unit chip or the tap-cycle that
   * rewrites the typed value in its unit): Enter or blur afterwards has nothing left to
   * commit, and typing again dirties the text as usual (E10-Q1).
   */
  commitValue: (value: ParsedNumber) => void;
  /**
   * F-02: marks the typed text as written without committing it (the caller writes it in a
   * batch of its own, the setup altitude's "Confirmar"): blur, Enter and leaving the page
   * then have nothing left to commit.
   */
  markClean: () => void;
  /**
   * Story 22.10: puts `next` in the input as if typed (dirty, committed on blur or Enter as
   * usual): the "> limite" action with no instrument limit starts the text with "> ".
   */
  typeText: (next: string) => void;
  /**
   * Story 22.10 (review fix): drops the typed text and shows the stored value again, clean and
   * valid, so the blur that follows commits nothing and reports no refusal (a "> " left by
   * "> limite" with no limit typed after it).
   */
  discard: () => void;
}

const rawOf = (parsed: ParsedNumber | null | 'invalid'): string | null =>
  parsed === null || parsed === 'invalid'
    ? null
    : parsed.state === 'not_applicable'
      ? NOT_APPLICABLE_STORED_RAW
      : parsed.state === 'over_range'
        ? overRangeStoredRaw(parsed.raw)
        : parsed.raw;

export function useNumberInput(options: NumberInputOptions): NumberInputState {
  const { storedText, storedRaw, parse, draft } = options;
  const [text, setText] = useState(storedText);
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const element = useRef<HTMLInputElement | null>(null);
  const focusedRef = useRef(false);
  const dirty = useRef(false);
  /** A value `commitValue` wrote while focused: its echo stays until the focus leaves. */
  const echoKept = useRef(false);
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

  /** Story 18.4: the text an Enter reported as refused; the blur that follows (the focus moved on) reports it no second time. */
  const reportedOnEnter = useRef<string | null>(null);
  const settle = (report: 'blur' | 'enter' | false = false): void => {
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
      const repeat = report === 'blur' && reportedOnEnter.current === current.current;
      reportedOnEnter.current = report === 'enter' ? current.current : null;
      if (report !== false && !repeat) latest.current.onRefuse?.(current.current);
      return;
    }
    setInvalid(false);
    dirty.current = false;
    committer.immediate(value);
    const format = latest.current.format;
    if (value !== null && format !== undefined) setText(format(value));
  };

  const settleLatest = useRef(settle);
  settleLatest.current = settle;
  /** Story 25.2: set by the unmount below, so a blur fired by the removal reports and commits nothing more. */
  const unmounted = useRef(false);
  // Layout cleanup: it runs before `useFieldCommit`'s own (passive) dispose drops the value.
  useLayoutEffect(() => {
    // A StrictMode remount runs the cleanup once at mount: the input is live again here.
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      if (latest.current.flushOnUnmount !== true || !dirty.current) return;
      // Story 25.2 (M02): text that parses is committed as a blur commits it; text that does not is a draft now.
      if (latest.current.parse(current.current) === 'invalid') {
        if (latest.current.discardOnUnmount?.(current.current) === true) return;
        void persistDraft.current?.();
        return;
      }
      settleLatest.current();
    };
  }, []);

  const commitValue = (value: ParsedNumber): void => {
    movedWhileFocused.current = false;
    setInvalid(false);
    dirty.current = false;
    echoKept.current = focusedRef.current;
    committer.immediate(value);
    const format = latest.current.format;
    if (format !== undefined) setText(format(value));
  };

  const persist = useDraftSource({
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

  /** Story 25.2: writes this input's draft now and offers it when the sheet is opened again (a test double may supply none). */
  const persistDraft = useRef<(() => Promise<void>) | null>(null);
  persistDraft.current = typeof persist === 'function' ? () => persist({ offerOnReturn: true }) : null;

  const parsed = parse(text);
  const echoFn = options.echo;
  const echo = focused && echoFn !== undefined && parsed !== null && parsed !== 'invalid' && (dirty.current || echoKept.current) ? echoFn(parsed) : null;

  return {
    text,
    focused,
    invalid,
    echo,
    parsed,
    commitNow: () => settle(),
    commitValue,
    markClean: () => {
      movedWhileFocused.current = false;
      setInvalid(false);
      dirty.current = false;
    },
    typeText: (next: string) => {
      dirty.current = true;
      echoKept.current = false;
      reportedOnEnter.current = null;
      current.current = next;
      setInvalid(false);
      setText(next);
    },
    discard: () => {
      const shown = latest.current.storedText;
      dirty.current = false;
      echoKept.current = false;
      reportedOnEnter.current = null;
      movedWhileFocused.current = false;
      current.current = shown;
      setInvalid(false);
      setText(shown);
    },
    inputProps: {
      ref: element,
      value: text,
      inputMode: options.inputMode ?? 'decimal',
      autoComplete: 'off',
      onChange: (event) => {
        dirty.current = true;
        echoKept.current = false;
        reportedOnEnter.current = null;
        setInvalid(false);
        setText(event.target.value);
      },
      onFocus: () => {
        focusedRef.current = true;
        setFocused(true);
        latest.current.onFocusChange?.(true);
      },
      onBlur: () => {
        if (unmounted.current) return;
        focusedRef.current = false;
        echoKept.current = false;
        setFocused(false);
        settle('blur');
        latest.current.onFocusChange?.(false);
      },
      onKeyDown: (event) => {
        if (latest.current.onKey?.(event)) return;
        if (event.key === 'Enter' && !event.shiftKey) {
          settle('enter');
          latest.current.onEnter?.(event);
        }
      },
    },
  };
}
