import {
  councilLabel,
  councilSchema,
  defaultTitleForCouncil,
  registrationNumberLabel,
  registrationSchema,
  type Council,
  type Registration,
} from '@app/domain';
import { useId, useState } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { ApiError } from '../../api/auth-client.ts';
import { copy } from '../../copy/pt-br.ts';
import { useAriaModal } from '../use-aria-modal.ts';

const COUNCILS: readonly Council[] = councilSchema.options;

export interface RegistrationDialogProps {
  initial: Registration;
  online: boolean;
  onCancel: () => void;
  onSave: (registration: Registration) => Promise<void>;
}

/**
 * The "Registro profissional" Form dialog (UX-DR22, UX-DR65). EXPERIENCE.md's Settings
 * row pattern wins over `90-account.html`, which still renders these fields inline: the
 * row shows the value and "Editar" opens this dialog, with the mock's `.segmented`,
 * `.field`, `.input` and `.helper` markup inside it.
 *
 * Changing the Conselho swaps the number label and the printed title, and never clears
 * a number the user already typed.
 */
export function RegistrationDialog(props: RegistrationDialogProps) {
  const dialogRef = useAriaModal<HTMLElement>();
  const titleId = useId();
  const councilLabelId = useId();
  const numberLabelId = useId();
  const printedTitleLabelId = useId();
  const helperId = useId();
  const reasonId = useId();
  const errorId = useId();

  const [council, setCouncil] = useState<Council>(props.initial.council);
  const [registrationNumber, setRegistrationNumber] = useState(props.initial.registrationNumber);
  const [title, setTitle] = useState(props.initial.title);
  /** Once the user types a title of their own, the council stops overwriting it. */
  const [titleEdited, setTitleEdited] = useState(
    props.initial.title !== '' && props.initial.title !== defaultTitleForCouncil(props.initial.council),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseCouncil(next: Council) {
    setCouncil(next);
    // The typed number is kept; only the title follows the council, and only while the
    // user has not written one.
    if (!titleEdited) setTitle(defaultTitleForCouncil(next));
  }

  async function save() {
    if (!props.online || saving) return;
    setError(null);
    // A user with no registration yet starts with two empty fields. Say so here instead
    // of sending a body the server can only refuse.
    const parsed = registrationSchema.safeParse({
      council,
      registrationNumber,
      title,
    });
    if (!parsed.success) {
      setError(copy.account.registrationIncomplete);
      return;
    }
    setSaving(true);
    try {
      await props.onSave(parsed.data);
    } catch (cause) {
      // A 400 means the same thing the local check means; anything else is worth a retry.
      setError(
        cause instanceof ApiError && cause.status === 400
          ? copy.account.registrationIncomplete
          : copy.account.saveFailed,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalOverlay className="dialog-scrim" isOpen isDismissable onOpenChange={props.onCancel}>
      <Modal className="dialog-modal">
        <Dialog className="form-dialog" aria-labelledby={titleId} ref={dialogRef}>
          <h2 className="dialog-title" id={titleId}>
            {copy.account.registrationHeading}
          </h2>

          <div className="reg-grid">
            <div className="field">
              <span className="field-label" id={councilLabelId}>
                {copy.account.councilLabel}
              </span>
              <div className="segmented" role="radiogroup" aria-labelledby={councilLabelId}>
                {COUNCILS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="seg"
                    role="radio"
                    aria-checked={council === option}
                    onClick={() => chooseCouncil(option)}
                  >
                    <svg className="ico check" aria-hidden="true">
                      <use href="#i-check" />
                    </svg>
                    {councilLabel(option)}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field-label" id={numberLabelId}>
                {registrationNumberLabel(council)}
              </span>
              <div className="input tabular">
                <input
                  className="grow"
                  name="registrationNumber"
                  aria-labelledby={numberLabelId}
                  value={registrationNumber}
                  onChange={(event) => setRegistrationNumber(event.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <span className="field-label" id={printedTitleLabelId}>
                {copy.account.printedTitleLabel}
              </span>
              <div className="input">
                <input
                  className="grow"
                  name="title"
                  aria-labelledby={printedTitleLabelId}
                  aria-describedby={helperId}
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setTitleEdited(true);
                  }}
                />
              </div>
              <span className="helper" id={helperId}>
                {copy.account.printedTitleHelper}
              </span>
            </div>
          </div>

          {error === null ? null : (
            <span className="login-error" id={errorId} role="alert">
              {error}
            </span>
          )}

          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={props.onCancel}>
              {copy.account.cancel}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              aria-disabled={props.online ? undefined : true}
              aria-describedby={props.online ? undefined : reasonId}
              onClick={save}
            >
              {copy.account.save}
            </button>
            {props.online ? null : (
              <span className="btn-reason" id={reasonId}>
                {copy.account.saveOfflineReason}
              </span>
            )}
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
