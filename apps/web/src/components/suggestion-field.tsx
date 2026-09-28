import { useId, type ReactNode } from 'react';
import { ui } from '../copy/ui.ts';

export type SuggestionFieldState = 'suggested' | 'verify' | 'confirmed';

export interface SuggestionFieldProps {
  label: string;
  /**
   * The suggested value as the field shows it. Wrapped in the mock's `.sv` span unless
   * `bare`, when the caller renders its own value slot (an editable `<input class="sv">`,
   * or a Measurement field's `.mf-value` and `.mf-unit`).
   */
  children: ReactNode;
  /** "Confirmar": writes the suggestion (the caller's ops); nothing is written before. */
  onConfirm: () => void;
  /** The source crop thumbnail, left of the value (Story 8.1's `CropThumb`). */
  crop?: ReactNode;
  /** Story 8.1: `suggested` (amber, "Sugerido"), `verify` (dashed, "Verificar"), `confirmed` (neutral). Default `suggested`. */
  state?: SuggestionFieldState;
  /** Story 8.1: the Confirmar button's accessible name ("Sugerido, 15 kV, confirmar"); the value describes it otherwise. */
  announcement?: string;
  /** Story 8.1: the `.combobox` variant of a select, manufacturer or voltage class field (its chevron hidden until confirmed). */
  combobox?: boolean;
  /** Story 8.1: the value container's class: `input` (default) or `measurement-field` for a number. */
  valueClassName?: string;
  /** Story 8.1: the caller renders the value slot itself (see `children`). */
  bare?: boolean;
  /** Story 8.1: the label's id, so a caller's own input can name itself by it. */
  labelId?: string;
  /** Story 8.1: lines under the value (an invalid helper). */
  after?: ReactNode;
  /**
   * Story 8.6: the Confirmar button's visible word ("Criar Celtta?" for a suggestion that
   * creates its manufacturer); its accessible name stays `announcement`. Default "Confirmar".
   */
  confirmLabel?: string;
}

/**
 * The Suggestion field (UX-DR45, `components.css` Suggestion field; built in Story 5.8 as the
 * shared component): a value the engineer did not enter, drawn in the amber fill with the
 * "Sugerido" pill and a "Confirmar" action. Nothing is written until the tap. Story 8.1 adds
 * the `verify` and `confirmed` states, the source crop, the Measurement-field layout and
 * an editable value slot; the Story 5.8 call sites keep the defaults.
 */
export function SuggestionField({
  label,
  children,
  onConfirm,
  crop,
  state = 'suggested',
  announcement,
  combobox = false,
  valueClassName = 'input',
  bare = false,
  labelId: givenLabelId,
  after,
  confirmLabel,
}: SuggestionFieldProps) {
  const ownLabelId = useId();
  const labelId = givenLabelId ?? ownLabelId;
  const valueId = useId();
  return (
    <div className={combobox ? 'field suggestion-field combobox' : 'field suggestion-field'} data-state={state} role="group" aria-labelledby={labelId}>
      <span className="field-label" id={labelId}>
        {label}
      </span>
      <div className={valueClassName}>
        {crop}
        {bare ? (
          children
        ) : (
          <span className="sv" id={valueId}>
            {children}
          </span>
        )}
        {state === 'confirmed' ? null : (
          <button
            type="button"
            className="confirm-btn"
            aria-label={announcement}
            aria-describedby={announcement === undefined && !bare ? valueId : undefined}
            onClick={onConfirm}
          >
            {confirmLabel ?? ui.suggestionField.confirm}
          </button>
        )}
      </div>
      {state === 'confirmed' ? null : <span className={state === 'verify' ? 'verify-pill' : 'suggested-pill'}>{state === 'verify' ? ui.suggestionField.verify : ui.suggestionField.suggested}</span>}
      {combobox ? (
        <span className="combobox-chevron" aria-hidden="true">
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-chev-down" />
          </svg>
        </span>
      ) : null}
      {after}
    </div>
  );
}
