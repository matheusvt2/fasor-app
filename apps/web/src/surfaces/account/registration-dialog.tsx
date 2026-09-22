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
import { Button, FormDialog, SegmentedControl } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';

const COUNCIL_OPTIONS = councilSchema.options.map((council) => ({ value: council, label: councilLabel(council) }));

export interface RegistrationDialogProps {
  initial: Registration;
  onCancel: () => void;
  onSave: (registration: Registration) => Promise<void>;
}

/**
 * The "Registro profissional" Form dialog (UX-DR22, UX-DR65). EXPERIENCE.md's Settings
 * row pattern wins over `90-account.html`, which still renders these fields inline: the
 * row shows the value and "Editar" opens this dialog, with the mock's `.segmented`,
 * `.field`, `.input` and `.helper` markup inside it.
 *
 * The Conselho is the shared `SegmentedControl` (one Tab stop, arrows move the choice).
 * Changing it swaps the number label and the printed title, and never clears a number
 * the user already typed.
 *
 * "Salvar" commits `user/{id}/{field}` ops on this device (AD-1), so it works offline
 * exactly as online; the sync engine sends them when there is a connection.
 *
 * The surface mounts this component for as long as the dialog is open, so every opening
 * starts from `initial`.
 */
export function RegistrationDialog(props: RegistrationDialogProps) {
  const councilLabelId = useId();
  const numberLabelId = useId();
  const printedTitleLabelId = useId();
  const helperId = useId();
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
    if (saving) return;
    setError(null);
    // A user with no registration yet starts with two empty fields. Say so here instead
    // of committing a registration with nothing in it.
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
    } catch {
      // Only a device write can fail here (a full or blocked store); the values stay in
      // the dialog for another try.
      setError(copy.account.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) props.onCancel();
      }}
      title={copy.account.registrationHeading}
    >
      <div className="reg-grid">
        <div className="field">
          <span className="field-label" id={councilLabelId}>
            {copy.account.councilLabel}
          </span>
          <SegmentedControl
            value={council}
            onChange={chooseCouncil}
            options={COUNCIL_OPTIONS}
            aria-labelledby={councilLabelId}
          />
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
        <Button variant="secondary" onPress={props.onCancel}>
          {copy.account.cancel}
        </Button>
        <Button variant="primary" onPress={() => void save()}>
          {copy.account.save}
        </Button>
      </div>
    </FormDialog>
  );
}
