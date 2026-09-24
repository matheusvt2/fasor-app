import { useId, type ReactNode } from 'react';
import { ui } from '../copy/ui.ts';

export interface SuggestionFieldProps {
  label: string;
  /** The suggested value as the field shows it. */
  children: ReactNode;
  /** "Confirmar": writes the suggestion (the caller's ops); nothing is written before. */
  onConfirm: () => void;
  /** Epic 8's source crop thumbnail slot, left of the value; empty until the reading pipeline fills it. */
  crop?: ReactNode;
}

/**
 * The Suggestion field (UX-DR45, `components.css` Suggestion field; built in Story 5.8 as the
 * shared component): a value the engineer did not enter, drawn in the amber fill with the
 * "Sugerido" pill and a "Confirmar" action. Nothing is written until the tap. Epic 8 reuses
 * it as is and only fills `crop`.
 */
export function SuggestionField({ label, children, onConfirm, crop }: SuggestionFieldProps) {
  const labelId = useId();
  const valueId = useId();
  return (
    <div className="field suggestion-field" data-state="suggested" role="group" aria-labelledby={labelId}>
      <span className="field-label" id={labelId}>
        {label}
      </span>
      <div className="input">
        {crop}
        <span className="sv" id={valueId}>
          {children}
        </span>
        <button type="button" className="confirm-btn" aria-describedby={valueId} onClick={onConfirm}>
          {ui.suggestionField.confirm}
        </button>
      </div>
      <span className="suggested-pill">{ui.suggestionField.suggested}</span>
    </div>
  );
}
