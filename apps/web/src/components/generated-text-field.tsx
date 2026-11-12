import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ui } from '../copy/ui.ts';
import { useFieldCommit } from '../input/use-field-commit.ts';
import { useDraftSource, type PersistOptions } from '../state/drafts.tsx';
import { CharCount } from './char-count.tsx';

export type GeneratedTextState = 'unconfirmed' | 'confirmed' | 'edited' | 'stale';

export interface GeneratedTextFieldProps {
  label: string;
  /** The text shown: the composed one while unconfirmed, the stored one after. */
  text: string;
  /** The Criteria line's items, in the order the text uses them. */
  criteriaItems: readonly string[];
  state: GeneratedTextState;
  /** "Confirmar" of an unconfirmed text. */
  onConfirm: () => void;
  /** "Substituir" under a stale text: the recomposed text replaces the stored one. */
  onReplace: () => void;
  /** "Editar" (the current text, at once) and a text typed after it (on blur): stored as edited. */
  onEdit: (text: string) => void | Promise<void>;
  draft: { surface: string; entityId: string; field: string };
  /** The line under a suggested text, and under a confirmed one. */
  helper?: string;
  confirmedHelper?: string;
  /** Read-only (a sheet marked not tested, Story 5.9): the text only, no Confirmar, Editar or Substituir. */
  readOnly?: boolean;
  /**
   * Story 20.9: the kernel's cap of the stored text (`textCapOf`): the typed text stops there,
   * and the shared counter shows under it from 90 % of the cap.
   */
  maxLength?: number;
  /**
   * Story 25.2 (`60-ficha.html`, Story 25.1 Part A): `text` draws the text before "Editar" as the frame does, a plain
   * element with no field look and no `textbox` role ("Editar" is the only way to type); `field` (the default) keeps
   * the bordered `textbox` the Etapa 6 parecer summary still uses.
   */
  presentation?: 'field' | 'text';
  /**
   * Story 25.2 (M02): the typed text is committed after a 500 ms pause while the cursor is still in the field, on
   * blur, and when the field leaves the screen; a text equal to the last one committed or stored is never committed.
   * Without it a typed text is committed on blur only (the Etapa 6 parecer summary).
   */
  commitWhileTyping?: boolean;
}

/**
 * The Generated text field (UX-DR46/47, `components.css` Generated text field; built in
 * Story 5.8 as the shared component): a paragraph composed on the device, in the Suggestion
 * field's amber state with its "Sugerido" pill until "Confirmar", with the Criteria line as
 * its description. "Editar" stores the current text as edited at once, which stops the
 * recomposition, then opens it for typing; a confirmed text whose values changed since
 * shows "Sugerido: texto atualizado — Substituir" beneath and is never overwritten on its
 * own; there the Criteria line moves beneath that row as the evidence of the replacement
 * and stops describing the stored text (E5-Q5). The texts are the caller's (the kernel's). Read-only, it shows the text alone and
 * offers no action.
 */
export function GeneratedTextField({
  label,
  text,
  criteriaItems,
  state,
  onConfirm,
  onReplace,
  onEdit,
  draft,
  helper,
  confirmedHelper,
  readOnly = false,
  maxLength,
  presentation = 'field',
  commitWhileTyping = false,
}: GeneratedTextFieldProps) {
  const t = ui.generatedText;
  const labelId = useId();
  const criteriaId = useId();
  const [editing, setEditing] = useState(false);
  const typing = !readOnly && (editing || state === 'edited');
  const [value, setValue] = useState(text);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const dirty = useRef(false);
  const current = useRef(value);
  current.current = value;
  const committer = useFieldCommit<string>({ commit: (next) => onEdit(next) });
  /** Story 25.2: the last text committed from typing, or stored: a typed text equal to it is never committed again. */
  const lastCommitted = useRef(text);
  /** Fix batch e25x (A4): this field's draft writer, set below from `useDraftSource` (a test double may supply none). */
  const persistDraft = useRef<((options?: PersistOptions) => Promise<void>) | null>(null);
  // Story 25.2: the typed text's own committer, with the 500 ms idle commit; Editar and a recovered draft use `committer`.
  const typed = useFieldCommit<string>({
    commit: (next) => {
      if (next === lastCommitted.current) {
        if (current.current === next) dirty.current = false;
        return;
      }
      const previous = lastCommitted.current;
      lastCommitted.current = next;
      // Nothing typed since this value: the field is clean again, so the stored echo may show.
      if (current.current === next) dirty.current = false;
      // A refused write leaves the text unstored: the next blur or flush commits it again, and it is a draft meanwhile.
      const refused = () => {
        if (lastCommitted.current === next) lastCommitted.current = previous;
        dirty.current = true;
      };
      // Fix batch e25x (A4): the write succeeded, so an older draft row of this field (a tab-hide while typing) would
      // only put older text back over it: dropped, unless the field is dirty again. A row on offer stays (Design Notes D2).
      const succeeded = () => {
        const persist = persistDraft.current;
        if (persist === null) return;
        try {
          void persist({ committed: true })?.catch(() => undefined);
        } catch {
          // A test double with no draft store.
        }
      };
      let result: void | Promise<void>;
      try {
        result = onEdit(next);
      } catch (error) {
        refused();
        throw error;
      }
      if (result instanceof Promise) {
        return result.then(succeeded, (error: unknown) => {
          refused();
          throw error;
        });
      }
      succeeded();
      return result;
    },
  });
  // The stored text moved while nobody types here: show it.
  const shown = useRef(text);
  if (shown.current !== text) {
    shown.current = text;
    lastCommitted.current = text;
    if (!dirty.current) setValue(text);
  }
  // Story 25.2 (M02): leaving the screen mid-typing (the tree, "Voltar", the stepper) commits the typed text. A layout
  // cleanup, so it runs before `useFieldCommit`'s passive dispose and before a blur fired by the removal (which then
  // finds nothing pending).
  const typedRef = useRef(typed);
  typedRef.current = typed;
  const flushOnLeave = useRef(commitWhileTyping);
  flushOnLeave.current = commitWhileTyping;
  useLayoutEffect(
    () => () => {
      if (flushOnLeave.current && typedRef.current.pending) typedRef.current.flush();
    },
    [],
  );
  const persist = useDraftSource({
    surface: draft.surface,
    entityId: draft.entityId,
    field: draft.field,
    read: () => (dirty.current ? current.current : null),
    apply: (recovered) => {
      if (readOnly) return;
      const next = typeof recovered === 'string' ? recovered : String(recovered);
      setEditing(true);
      setValue(next);
      dirty.current = false;
      lastCommitted.current = next;
      committer.immediate(next);
    },
  });
  persistDraft.current = typeof persist === 'function' ? persist : null;

  const suggested = state === 'unconfirmed';
  // E5-Q5: a stale text's criteria line is the recomposed text's, the evidence of the
  // "Substituir" suggestion, never the description of the stored text it contradicts.
  const stale = state === 'stale';
  // E5-R3: no reading and no NC item -- no "Critérios usados" heading over an empty list.
  const hasCriteria = criteriaItems.length > 0;
  const describedBy = stale || !hasCriteria ? undefined : criteriaId;
  const criteriaLine = hasCriteria ? (
    <p className="criteria-line" id={criteriaId}>
      <span className="cl-label">{t.criteria}</span>
      {criteriaItems.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </p>
  ) : null;
  return (
    <div className="field suggestion-field is-generated" data-state={suggested && !typing ? 'suggested' : 'confirmed'}>
      <span className="field-label" id={labelId}>
        {label}
      </span>
      {typing ? (
        <textarea
          ref={area}
          className="observation-field"
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          value={value}
          maxLength={maxLength}
          onChange={(event) => {
            dirty.current = true;
            setValue(event.target.value);
            current.current = event.target.value;
            if (commitWhileTyping) typed.change(event.target.value);
          }}
          onBlur={() => {
            if (commitWhileTyping) {
              typed.blur();
              return;
            }
            if (!dirty.current) return;
            dirty.current = false;
            committer.immediate(current.current);
          }}
        />
      ) : presentation === 'text' ? (
        // Story 25.2: the text as the frame draws it, no field look and no textbox role; "Editar" opens the field.
        <div className="generated-text" aria-labelledby={labelId} aria-describedby={describedBy}>
          {text}
        </div>
      ) : (
        <div className="generated-text" role="textbox" aria-multiline="true" aria-readonly="true" aria-labelledby={labelId} aria-describedby={describedBy}>
          {text}
        </div>
      )}
      {typing ? <CharCount length={value.length} cap={maxLength ?? null} /> : null}
      {suggested && !typing ? <span className="suggested-pill">{ui.suggestionField.suggested}</span> : null}
      {stale ? null : criteriaLine}
      {stale && !readOnly ? (
        <p className="suggestion-alt">
          {`${t.stale} — `}
          <button
            type="button"
            className="btn btn-text"
            aria-describedby={hasCriteria ? criteriaId : undefined}
            onClick={() => {
              setEditing(false);
              dirty.current = false;
              typed.dispose();
              onReplace();
            }}
          >
            {t.replace}
          </button>
        </p>
      ) : null}
      {/* Stale and read-only: no Substituir row, so no criteria line that would describe nothing. */}
      {stale && !readOnly ? criteriaLine : null}
      {readOnly ? null : (
        <div className="generated-actions">
          {suggested && !typing ? (
            <button type="button" className="btn btn-secondary confirm-action" onClick={onConfirm}>
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-check" />
              </svg>
              {t.confirm}
            </button>
          ) : null}
          {typing ? null : (
            <button
              type="button"
              className="btn btn-text"
              onClick={() => {
                setValue(text);
                dirty.current = false;
                lastCommitted.current = text;
                committer.immediate(text);
                setEditing(true);
                requestAnimationFrame(() => area.current?.focus());
              }}
            >
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-pencil" />
              </svg>
              {t.edit}
            </button>
          )}
        </div>
      )}
      {suggested && !typing && !readOnly && helper !== undefined ? <span className="helper">{helper}</span> : null}
      {(state === 'confirmed' || state === 'edited') && confirmedHelper !== undefined ? <span className="helper">{confirmedHelper}</span> : null}
    </div>
  );
}
