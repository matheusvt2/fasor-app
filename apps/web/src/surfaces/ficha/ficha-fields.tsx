import {
  criarText,
  fieldValueText,
  formatDecimalGroupedPtBr,
  nameplateWordRecents,
  normalizeRegistryName,
  numberEchoText,
  normalizeDateValue,
  numberFieldValue,
  parsePlateDateText,
  parseVoltageClassKv,
  plateDateAccepted,
  screenLabel,
  wordRegistryRowText,
  wordRowByName,
  type BlockRow,
  type FieldDef,
  type WordRow,
} from '@app/domain';
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { DateField, RegistryPickerField } from '../../components/index.ts';
import { useNumberInput } from '../../components/number-input.tsx';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { useDraftSource } from '../../state/drafts.tsx';

/*
 * The sheet's typed fields by kind (Stories 5.2, 5.3; AD-11/AR-10): text, number with its
 * fixed unit in the suffix slot and `inputmode="decimal"`, date, select with the seed's
 * options, and manufacturer / voltage class as the Story 2.5 chip row plus "Outro…". Every
 * typed value is echoed locally and committed through `useFieldCommit` (blur, Enter or
 * 500 ms idle, one op per commit); a discrete pick commits at once. Uncommitted text is a
 * draft source ("Rascunho encontrado — Recuperar", FR-61). The markup is the mock's
 * `.field` / `.measurement-field` / `.field.combobox`.
 */

/** The draft key of a field: `ficha/{entity}/{field}` (the DraftProvider's surface vocabulary). */
export interface DraftKey {
  entityId: string;
  field: string;
}

export const DRAFT_SURFACE = 'ficha';

const FOCUSABLE = 'input, select, textarea, button, [tabindex="0"]';

/**
 * The first control under `root` that can take the focus now: drawn, not in a `hidden`
 * part (a manufacturer field shows its chip row or its Combobox depending on the width).
 */
export function firstFocusable(root: HTMLElement): HTMLElement | null {
  const candidates = root.matches(FOCUSABLE) ? [root] : [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
  return candidates.find((element) => element.getClientRects().length > 0 && !(element as HTMLButtonElement).disabled) ?? null;
}

/**
 * A locally-echoed text value committed through `useFieldCommit` and offered back as a
 * draft while it differs from the committed value. `setup-surface.tsx`'s `useTextField`
 * idiom plus the draft registration of `field-fixture-surface.tsx`.
 */
export function useTypedText(value: string, commit: (text: string) => void | Promise<void>, draft: DraftKey, options: { flushOnUnmount?: boolean } = {}) {
  const [text, setText] = useState(value);
  const committed = useRef(value);
  const current = useRef(text);
  current.current = text;
  /** The texts this field committed and the store has not echoed yet: an own echo never rewrites newer typing. */
  const sent = useRef<string[]>([]);
  const committer = useFieldCommit<string>({
    commit: (next) => {
      sent.current.push(next.trim() === '' ? '' : next);
      return commit(next);
    },
  });
  if (value !== committed.current) {
    committed.current = value;
    const at = sent.current.indexOf(value);
    if (at !== -1) sent.current = sent.current.slice(at + 1);
    else {
      sent.current = [];
      if (value !== text) setText(value);
    }
  }
  useFlushOnUnmount(committer, options.flushOnUnmount === true);
  useDraftSource({
    surface: DRAFT_SURFACE,
    entityId: draft.entityId,
    field: draft.field,
    read: () => (current.current === committed.current ? null : current.current),
    apply: (recovered) => {
      const next = typeof recovered === 'string' ? recovered : String(recovered);
      setText(next);
      committer.immediate(next);
    },
  });
  return {
    text,
    change: (next: string) => {
      setText(next);
      committer.change(next);
    },
    /** A chip or an insert: shown and committed at once. */
    set: (next: string) => {
      setText(next);
      committer.immediate(next);
    },
    blur: () => committer.blur(),
    enter: () => committer.enter(),
  };
}

/**
 * F-01: a field that leaves the page with typed text still waiting for its idle commit
 * commits it then (a plate suggestion landing on the empty field swaps it out), never drops
 * it. A layout cleanup, so it runs before `useFieldCommit`'s passive dispose.
 */
function useFlushOnUnmount(committer: { flush: () => void; pending: boolean }, on: boolean): void {
  const latest = useRef({ committer, on });
  latest.current = { committer, on };
  useLayoutEffect(
    () => () => {
      const { committer: current, on: enabled } = latest.current;
      if (enabled && current.pending) current.flush();
    },
    [],
  );
}

export interface FieldProps {
  field: FieldDef;
  /** The stored value (a cell's `value`, a cabine column), or null. */
  value: unknown;
  /** Commits a value (null clears the field). */
  commit: (value: unknown) => void | Promise<void>;
  draft: DraftKey;
  /** Marked for "Concluir ficha"'s jump to the first missing field. */
  missing?: boolean;
  /** The visible label; the seed's own when omitted. */
  label?: string;
  /** A text field's helper line under the input (the prefilled TAG's "Do bloco · editável"). */
  helper?: string;
  /** The words a field shows when a typed number is not one ("Número não reconhecido"). */
  invalidText: string;
  /** The select's empty option. */
  selectEmpty: string;
  registries?: { manufacturer: readonly WordRow[]; voltage_class: readonly WordRow[] };
  /** The relatório's blocks, for the registry chips' recents. */
  blocks?: readonly BlockRow[];
  /** "Criar “…”" of a registry field: the new row's name, committed with the field. */
  onCreateWord?: (kind: 'manufacturer' | 'voltage_class', name: string) => void;
  /**
   * E78-Q4: "Criar ⟨nome⟩?" of a stored manufacturer the registry does not hold (a copied
   * one): writes the registry row alone; the field already holds the name.
   */
  onRegisterWord?: (kind: 'manufacturer' | 'voltage_class', name: string) => void;
  /** Story 8.1: a line at the end of the field (the replace line of a differing suggestion). */
  after?: ReactNode;
  /** F-01: typed text still waiting for its commit is committed when the field leaves the page. */
  flushOnUnmount?: boolean;
}

/** One sheet field, editable, rendered by its kind. */
export function SheetField(props: FieldProps) {
  switch (props.field.kind) {
    case 'number':
      return <NumberField {...props} />;
    case 'date':
      return <DateValueField {...props} />;
    case 'select':
      return <SelectField {...props} />;
    case 'manufacturer':
    case 'voltage_class':
      return <WordField {...props} />;
    default:
      return <TextField {...props} />;
  }
}

/**
 * Story 13.4 (INP-1): serials, TAGs and types are codes, not prose: the mobile keyboard must
 * not capitalize, correct or underline them (the TAG dialogs' own attributes).
 */
const PLAIN_TEXT = { autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false } as const;

function TextField({ field, value, commit, draft, missing, label, helper, after, flushOnUnmount }: FieldProps) {
  const id = useId();
  const helperId = useId();
  const typed = useTypedText(typeof value === 'string' ? value : '', (text) => commit(text.trim() === '' ? null : text), draft, { flushOnUnmount: flushOnUnmount === true });
  return (
    <div className="field" data-field-key={field.key}>
      <label className="field-label" htmlFor={id}>
        {screenLabel(label ?? field.label)}
      </label>
      <input
        id={id}
        className="input"
        value={typed.text}
        {...PLAIN_TEXT}
        data-missing-field={missing ? '' : undefined}
        aria-describedby={helper === undefined ? undefined : helperId}
        onChange={(event) => typed.change(event.target.value)}
        onBlur={typed.blur}
        onKeyDown={(event) => {
          if (event.key === 'Enter') typed.enter();
        }}
      />
      {helper === undefined ? null : (
        <span className="helper" id={helperId}>
          {helper}
        </span>
      )}
      {after}
    </div>
  );
}

/**
 * A nameplate or cabine number (Story 5.3; the carry-over of PR #30): the shared
 * `useNumberInput`, so the text is parsed and committed on blur or Enter only and never
 * rewritten while the engineer types ("3.3", a pause, "00" commits 3300).
 */
function NumberField({ field, value, commit, draft, missing, label, invalidText, after, flushOnUnmount }: FieldProps) {
  const id = useId();
  const helperId = useId();
  const unit = field.unit ?? null;
  const storedRaw = typeof value === 'object' && value !== null && 'raw' in value && (value as { state?: string }).state === 'measured' ? (value as { raw: string }).raw : null;
  const number = useNumberInput({
    // At rest a stored number reads grouped ("3.300"), the same after a blur and a reload.
    storedText: storedRaw === null ? fieldValueText(field, value) : formatDecimalGroupedPtBr(storedRaw),
    storedRaw,
    parse: (text) => numberFieldValue(text, unit),
    commit: (parsed) => commit(parsed === null ? null : { raw: parsed.raw, unit, state: 'measured' }),
    echo: (parsed) => numberEchoText(parsed.raw, unit),
    format: (parsed) => formatDecimalGroupedPtBr(parsed.raw),
    draft: { surface: DRAFT_SURFACE, entityId: draft.entityId, field: draft.field },
    flushOnUnmount: flushOnUnmount === true,
  });
  const describedBy = [number.invalid ? helperId : null, number.echo === null ? null : `${helperId}-echo`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field" data-field-key={field.key}>
      <label className="field-label" htmlFor={id}>
        {screenLabel(label ?? field.label)}
      </label>
      <div className="measurement-field" aria-invalid={number.invalid || undefined}>
        <input
          id={id}
          className="mf-value"
          {...number.inputProps}
          aria-invalid={number.invalid || undefined}
          aria-describedby={describedBy}
          data-missing-field={missing ? '' : undefined}
        />
        {unit === null ? null : <span className="mf-unit">{unit}</span>}
      </div>
      {number.echo === null ? null : (
        <span className="mf-echo" id={`${helperId}-echo`}>
          {number.echo}
        </span>
      )}
      {number.invalid ? (
        <span className="helper" data-tone="red" id={helperId}>
          {invalidText}
        </span>
      ) : null}
      {after}
    </div>
  );
}

const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A date field by what it holds. Story 13.4 (INP-3): an empty date is the mock's text
 * `.input` ("Ex: 03/2012", `60-ficha.html`), since plates say "08/2024" or "2012" and React
 * Aria's `DateField` has no month or year granularity; a stored full date (a `dd/mm/aaaa`
 * one read in the canonical shape) is the date picker; anything else (E78-Q3: a month-only
 * date, a year, text the kernel cannot read) is the same text input showing the stored
 * value, so a value that prints is never blank here. The text input stays mounted while it
 * holds the focus, so the date its Enter commits never swaps the focused input away; the
 * picker takes over once the focus leaves.
 */
function DateValueField(props: FieldProps) {
  const [typing, setTyping] = useState(false);
  const canonical = normalizeDateValue(props.value);
  if (typeof canonical === 'string' && FULL_DATE.test(canonical) && !typing) return <DatePickerField {...props} value={canonical} />;
  return <DateTextField {...props} onFocusChange={setTyping} />;
}

/**
 * The text form of a sheet date: typing commits on blur or Enter what `parsePlateDateText`
 * reads (`dd/mm/aaaa`, `mm/aaaa`, `aaaa`, or their digits alone: `01012020`, `082024`,
 * `2024`); a text it cannot read, or a year outside 1900 .. next year (F-22), keeps the
 * stored value and shows the invalid helper. Empty text clears the field.
 */
function DateTextField({ field, value, commit, missing, label, after, flushOnUnmount, onFocusChange }: FieldProps & { onFocusChange: (focused: boolean) => void }) {
  const id = useId();
  const helperId = useId();
  const storedText = fieldValueText(field, value);
  const [text, setText] = useState(storedText);
  const [invalid, setInvalid] = useState(false);
  const shown = useRef(storedText);
  /** Typed text not yet handed to `commit` (F-01: flushed if the field leaves the page). */
  const pending = useRef(false);
  if (storedText !== shown.current) {
    shown.current = storedText;
    setText(storedText);
    setInvalid(false);
    pending.current = false;
  }
  /** The value `typed` writes, `undefined` when nothing is to be written, `false` when it is refused. */
  const reading = (typed: string): unknown => {
    if (typed === shown.current) return undefined;
    if (typed.trim() === '') return null;
    const parsed = parsePlateDateText(typed);
    return parsed === null || !plateDateAccepted(parsed, now()) ? false : parsed;
  };
  const submit = () => {
    const next = reading(text);
    pending.current = false;
    if (next === undefined) return;
    if (next === false) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    void commit(next);
  };
  const latest = useRef({ text, on: flushOnUnmount === true, commit, reading });
  latest.current = { text, on: flushOnUnmount === true, commit, reading };
  useLayoutEffect(
    () => () => {
      const { text: typed, on, commit: write, reading: read } = latest.current;
      if (!on || !pending.current) return;
      const next = read(typed);
      if (next !== undefined && next !== false) void write(next);
    },
    [],
  );
  return (
    <div className="field" data-field-key={field.key}>
      <label className="field-label" htmlFor={id}>
        {screenLabel(label ?? field.label)}
      </label>
      <input
        id={id}
        className="input"
        value={text}
        placeholder={copy.ficha.nameplate.datePlaceholder}
        inputMode="numeric"
        autoComplete="off"
        {...PLAIN_TEXT}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? helperId : undefined}
        data-missing-field={missing ? '' : undefined}
        onChange={(event) => {
          setText(event.target.value);
          setInvalid(false);
          pending.current = true;
        }}
        onFocus={() => onFocusChange(true)}
        onBlur={() => {
          submit();
          onFocusChange(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
        }}
      />
      {invalid ? (
        <span className="helper" data-tone="red" id={helperId}>
          {copy.ficha.nameplate.invalidDate}
        </span>
      ) : null}
      {after}
    </div>
  );
}

function DatePickerField({ field, value, commit, missing, label, after, flushOnUnmount }: FieldProps) {
  const stored = typeof value === 'string' && FULL_DATE.test(value) ? value : null;
  const [date, setDate] = useState(stored);
  const committed = useRef(stored);
  const committer = useFieldCommit<string | null>({ commit: (next) => commit(next) });
  useFlushOnUnmount(committer, flushOnUnmount === true);
  // F-22: a date outside 1900 .. next year ("20/02/0001") writes nothing and, once the focus
  // leaves (a year typed digit by digit passes through 0002 and 0202), shows the invalid helper.
  const [outOfRange, setOutOfRange] = useState(false);
  const refused = useRef(false);
  const helperId = useId();
  if (stored !== committed.current) {
    committed.current = stored;
    if (stored !== date) setDate(stored);
    refused.current = false;
    setOutOfRange(false);
  }
  return (
    <div data-field-key={field.key} data-missing-field={missing ? '' : undefined}>
      <DateField
        label={screenLabel(label ?? field.label)}
        value={date}
        isInvalid={outOfRange}
        {...(outOfRange ? { describedBy: helperId } : {})}
        onChange={(next) => {
          setDate(next);
          refused.current = next !== null && !plateDateAccepted(next, now());
          if (refused.current) {
            committer.dispose();
            return;
          }
          setOutOfRange(false);
          committer.change(next);
        }}
        onBlur={() => {
          if (refused.current) setOutOfRange(true);
          committer.blur();
        }}
        after={
          outOfRange ? (
            <span className="helper" data-tone="red" id={helperId}>
              {copy.ficha.nameplate.invalidDate}
            </span>
          ) : undefined
        }
      />
      {after}
    </div>
  );
}

function SelectField({ field, value, commit, missing, label, selectEmpty, after }: FieldProps) {
  const id = useId();
  const current = typeof value === 'string' ? value : '';
  const options = field.options ?? [];
  return (
    <div className="field combobox" data-field-key={field.key}>
      <label className="field-label" htmlFor={id}>
        {screenLabel(label ?? field.label)}
      </label>
      <select
        id={id}
        className="input"
        value={current}
        data-missing-field={missing ? '' : undefined}
        onChange={(event) => void commit(event.target.value === '' ? null : event.target.value)}
      >
        <option value="">{selectEmpty}</option>
        {/* A stored value the seed no longer offers stays readable. */}
        {current !== '' && !options.includes(current) ? <option value={current}>{current}</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span className="combobox-chevron" aria-hidden="true">
        <svg className="ico" aria-hidden="true">
          <use href="/sprite.svg#i-chev-down" />
        </svg>
      </span>
      {after}
    </div>
  );
}

function WordField({ field, value, commit, missing, label, registries, blocks, onCreateWord, onRegisterWord, after }: FieldProps) {
  const kind = field.kind as 'manufacturer' | 'voltage_class';
  const rows = registries?.[kind] ?? [];
  const current = typeof value === 'string' ? value : null;
  const recents = nameplateWordRecents(current, blocks ?? [], kind, rows);
  const selected = wordRowByName(current, rows)?.id ?? null;
  // A name just created lands in the registry and on the sheet through two live reads; until
  // both are here the Combobox sees no selected row and lets go of it (a null selection),
  // which must not clear the value the "Criar" just wrote.
  const created = useRef<string | null>(null);
  if (created.current !== null && selected !== null && current === created.current) created.current = null;
  // E78-Q4: a stored manufacturer the registry does not hold shows its name and "Criar ⟨nome⟩?",
  // until the tap's registry row lands (one tap, one create).
  const [registering, setRegistering] = useState<string | null>(null);
  if (registering !== null && (selected !== null || current !== registering)) setRegistering(null);
  const unregistered =
    kind === 'manufacturer' && onRegisterWord !== undefined && current !== null && current.trim() !== '' && selected === null && created.current === null && registering === null
      ? current
      : null;
  return (
    <div className="field" data-field-key={field.key} data-missing-field={missing ? '' : undefined}>
      <RegistryPickerField
        label={screenLabel(label ?? field.label)}
        options={rows.filter((row) => row.removed_at === null).map((row) => ({ id: row.id, label: wordRegistryRowText(row).primary }))}
        recentIds={recents}
        value={selected}
        initialText={current === null ? '' : wordLabel(kind, current)}
        emptyHint={copy.ficha.wordEmpty[kind]}
        {...(kind === 'voltage_class' ? { matchKey: voltageMatchKey } : {})}
        onChange={(id) => {
          const chosen = rows.find((row) => row.id === id);
          if (chosen === undefined && (created.current !== null || (current !== null && selected === null))) return;
          void commit(chosen === undefined ? null : chosen.name);
        }}
        onCreate={(text) => {
          const name = kind === 'voltage_class' ? parseVoltageClassKv(text) : text.trim();
          if (name === null || name === '') return null;
          created.current = name;
          onCreateWord?.(kind, name);
          // E12-Q1: the input shows the created row's label ("15 kV"), the text the Combobox
          // matches it by once it arrives, so the next blur keeps it instead of writing null.
          return wordLabel(kind, name);
        }}
      />
      {unregistered === null ? null : (
        <span className="helper word-unregistered">
          <span className="word-unregistered-name">{unregistered}</span>
          <button
            type="button"
            className="btn btn-text"
            onClick={() => {
              setRegistering(unregistered);
              onRegisterWord?.(kind, unregistered);
            }}
          >
            {criarText(unregistered)}
          </button>
        </span>
      )}
      {after}
    </div>
  );
}

/** A word field's stored name as its registry row reads it: a voltage class with its unit ("15 kV"). */
function wordLabel(kind: 'manufacturer' | 'voltage_class', name: string): string {
  return kind === 'voltage_class' ? wordRegistryRowText({ kind, name } as WordRow).primary : name;
}

/** A voltage class typed with or without its unit names the same row ("15" and "15 kV"). */
function voltageMatchKey(text: string): string {
  return parseVoltageClassKv(text) ?? normalizeRegistryName(text);
}

/** A read-only field (UX-DR49): the same label, the value as text, `aria-readonly`. */
export function ReadOnlyField({ field, value, label, helper }: { field: Pick<FieldDef, 'kind' | 'label' | 'unit'>; value: unknown; label?: string; helper?: string }) {
  const labelId = useId();
  const text = fieldValueText(field, value);
  const isNumber = field.kind === 'number';
  return (
    <div className="field">
      <span className="field-label" id={labelId}>
        {screenLabel(label ?? field.label)}
      </span>
      {isNumber ? (
        <div className="measurement-field" role="textbox" aria-readonly="true" aria-labelledby={labelId}>
          <span className={text === '' ? 'mf-value is-empty' : 'mf-value'}>{text === '' ? '—' : text}</span>
          {field.unit === undefined ? null : <span className="mf-unit">{field.unit}</span>}
        </div>
      ) : (
        <div className="input" role="textbox" aria-readonly="true" aria-labelledby={labelId}>
          {text === '' ? '—' : text}
        </div>
      )}
      {helper === undefined ? null : <span className="helper">{helper}</span>}
    </div>
  );
}
