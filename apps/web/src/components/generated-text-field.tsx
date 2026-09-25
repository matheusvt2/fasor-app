import { useId, useRef, useState } from 'react';
import { ui } from '../copy/ui.ts';
import { useFieldCommit } from '../input/use-field-commit.ts';
import { useDraftSource } from '../state/drafts.tsx';

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
export function GeneratedTextField({ label, text, criteriaItems, state, onConfirm, onReplace, onEdit, draft, helper, confirmedHelper, readOnly = false }: GeneratedTextFieldProps) {
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
  // The stored text moved while nobody types here: show it.
  const shown = useRef(text);
  if (shown.current !== text) {
    shown.current = text;
    if (!dirty.current) setValue(text);
  }
  useDraftSource({
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
      committer.immediate(next);
    },
  });

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
          onChange={(event) => {
            dirty.current = true;
            setValue(event.target.value);
          }}
          onBlur={() => {
            if (!dirty.current) return;
            dirty.current = false;
            committer.immediate(current.current);
          }}
        />
      ) : (
        <div className="generated-text" role="textbox" aria-multiline="true" aria-readonly="true" aria-labelledby={labelId} aria-describedby={describedBy}>
          {text}
        </div>
      )}
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
