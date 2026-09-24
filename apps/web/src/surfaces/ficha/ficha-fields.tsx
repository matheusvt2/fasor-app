import {
  fieldValueText,
  nameplateWordRecents,
  numberEchoText,
  numberFieldValue,
  parseVoltageClassKv,
  wordRowByName,
  type BlockRow,
  type FieldDef,
  type WordRow,
} from '@app/domain';
import { useId, useRef, useState } from 'react';
import { DateField, RegistryPickerField } from '../../components/index.ts';
import { useNumberInput } from '../../components/number-input.tsx';
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
export function useTypedText(value: string, commit: (text: string) => void | Promise<void>, draft: DraftKey) {
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
  /** The words a field shows when a typed number is not one ("Número não reconhecido"). */
  invalidText: string;
  /** The select's empty option. */
  selectEmpty: string;
  registries?: { manufacturer: readonly WordRow[]; voltage_class: readonly WordRow[] };
  /** The relatório's blocks, for the registry chips' recents. */
  blocks?: readonly BlockRow[];
  /** "Criar “…”" of a registry field: the new row's name, committed with the field. */
  onCreateWord?: (kind: 'manufacturer' | 'voltage_class', name: string) => void;
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

function TextField({ field, value, commit, draft, missing, label }: FieldProps) {
  const id = useId();
  const typed = useTypedText(typeof value === 'string' ? value : '', (text) => commit(text.trim() === '' ? null : text), draft);
  return (
    <div className="field" data-field-key={field.key}>
      <label className="field-label" htmlFor={id}>
        {label ?? field.label}
      </label>
      <input
        id={id}
        className="input"
        value={typed.text}
        data-missing-field={missing ? '' : undefined}
        onChange={(event) => typed.change(event.target.value)}
        onBlur={typed.blur}
        onKeyDown={(event) => {
          if (event.key === 'Enter') typed.enter();
        }}
      />
    </div>
  );
}

/**
 * A nameplate or cabine number (Story 5.3; the carry-over of PR #30): the shared
 * `useNumberInput`, so the text is parsed and committed on blur or Enter only and never
 * rewritten while the engineer types ("3.3", a pause, "00" commits 3300).
 */
function NumberField({ field, value, commit, draft, missing, label, invalidText }: FieldProps) {
  const id = useId();
  const helperId = useId();
  const unit = field.unit ?? null;
  const storedRaw = typeof value === 'object' && value !== null && 'raw' in value && (value as { state?: string }).state === 'measured' ? (value as { raw: string }).raw : null;
  const number = useNumberInput({
    storedText: fieldValueText(field, value),
    storedRaw,
    parse: (text) => numberFieldValue(text, unit),
    commit: (parsed) => commit(parsed === null ? null : { raw: parsed.raw, unit, state: 'measured' }),
    echo: (parsed) => numberEchoText(parsed.raw, unit),
    draft: { surface: DRAFT_SURFACE, entityId: draft.entityId, field: draft.field },
  });
  const describedBy = [number.invalid ? helperId : null, number.echo === null ? null : `${helperId}-echo`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field" data-field-key={field.key}>
      <label className="field-label" htmlFor={id}>
        {label ?? field.label}
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
    </div>
  );
}

function DateValueField({ field, value, commit, missing, label }: FieldProps) {
  const stored = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const [date, setDate] = useState(stored);
  const committed = useRef(stored);
  const committer = useFieldCommit<string | null>({ commit: (next) => commit(next) });
  if (stored !== committed.current) {
    committed.current = stored;
    if (stored !== date) setDate(stored);
  }
  return (
    <div data-field-key={field.key} data-missing-field={missing ? '' : undefined}>
      <DateField
        label={label ?? field.label}
        value={date}
        onChange={(next) => {
          setDate(next);
          committer.change(next);
        }}
        onBlur={() => committer.blur()}
      />
    </div>
  );
}

function SelectField({ field, value, commit, missing, label, selectEmpty }: FieldProps) {
  const id = useId();
  const current = typeof value === 'string' ? value : '';
  const options = field.options ?? [];
  return (
    <div className="field combobox" data-field-key={field.key}>
      <label className="field-label" htmlFor={id}>
        {label ?? field.label}
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
    </div>
  );
}

function WordField({ field, value, commit, missing, label, registries, blocks, onCreateWord }: FieldProps) {
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
  return (
    <div className="field" data-field-key={field.key} data-missing-field={missing ? '' : undefined}>
      <RegistryPickerField
        label={label ?? field.label}
        options={rows.filter((row) => row.removed_at === null).map((row) => ({ id: row.id, label: row.name }))}
        recentIds={recents}
        value={selected}
        initialText={current ?? ''}
        onChange={(id) => {
          const chosen = rows.find((row) => row.id === id);
          if (chosen === undefined && (created.current !== null || (current !== null && selected === null))) return;
          void commit(chosen === undefined ? null : chosen.name);
        }}
        onCreate={(text) => {
          const name = kind === 'voltage_class' ? parseVoltageClassKv(text) : text.trim();
          if (name === null || name === '') return;
          created.current = name;
          onCreateWord?.(kind, name);
        }}
      />
    </div>
  );
}

/** A read-only field (UX-DR49): the same label, the value as text, `aria-readonly`. */
export function ReadOnlyField({ field, value, label, helper }: { field: Pick<FieldDef, 'kind' | 'label' | 'unit'>; value: unknown; label?: string; helper?: string }) {
  const labelId = useId();
  const text = fieldValueText(field, value);
  const isNumber = field.kind === 'number';
  return (
    <div className="field">
      <span className="field-label" id={labelId}>
        {label ?? field.label}
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
