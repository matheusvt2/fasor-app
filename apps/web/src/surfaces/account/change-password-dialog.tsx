import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordLengthIssue } from '@app/domain';
import { useId, useRef, useState, type FormEvent } from 'react';
import { changePassword } from '../../api/auth-client.ts';
import { Button, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';

export interface ChangePasswordDialogProps {
  /** False while the device has no connection: "Salvar senha" is disabled with its reason. */
  online: boolean;
  onCancel: () => void;
  /** The password changed on the server; this device holds the new session cookie. */
  onChanged: () => void;
  /** The server no longer holds this session (its banner is already raised). */
  onSignedOut: () => void;
}

type NewPasswordError = 'too-short' | 'too-long' | null;

/**
 * Story 29.1: "Alterar senha", the Form dialog of the Conta screen (frame `90-account.html`
 * `#acc-dlg-senha`). Three fields: "Senha atual", "Nova senha", "Repita a senha". The new password
 * follows the rule and the messages of "Criar senha" (Story 26.6, `set-password-surface.tsx`): the
 * kernel's length rule under the field, checked before anything is sent, and the two fields equal.
 * A wrong current password is said under its field. On success the server ends every other session
 * of the user and gives this device a new cookie; the surface closes the dialog and says so in a
 * Toast. Nothing goes to the outbox: the change needs the connection.
 *
 * The surface mounts this component only while the dialog is open, so the passwords live no longer
 * than the dialog.
 */
export function ChangePasswordDialog({ online, onCancel, onChanged, onSignedOut }: ChangePasswordDialogProps) {
  const currentLabelId = useId();
  const currentErrorId = useId();
  const newLabelId = useId();
  const ruleId = useId();
  const repeatLabelId = useId();
  const repeatErrorId = useId();
  const currentRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const repeatRef = useRef<HTMLInputElement>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [currentRevealed, setCurrentRevealed] = useState(false);
  const [nextRevealed, setNextRevealed] = useState(false);
  const [repeatRevealed, setRepeatRevealed] = useState(false);
  const [wrongCurrent, setWrongCurrent] = useState(false);
  const [newError, setNewError] = useState<NewPasswordError>(null);
  const [mismatch, setMismatch] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online || saving) return;
    setFailure(null);
    setWrongCurrent(false);
    const issue = passwordLengthIssue(next);
    const error: NewPasswordError = issue === 'too_short' ? 'too-short' : issue === 'too_long' ? 'too-long' : null;
    setNewError(error);
    const differs = error === null && next !== repeat;
    setMismatch(differs);
    if (error !== null) {
      newRef.current?.focus();
      return;
    }
    if (differs) {
      repeatRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const result = await changePassword(current, next);
      if (result.ok) {
        onChanged();
        return;
      }
      switch (result.reason) {
        case 'wrong-current':
          setWrongCurrent(true);
          currentRef.current?.focus();
          break;
        case 'too-short':
          setNewError('too-short');
          newRef.current?.focus();
          break;
        case 'too-long':
          setNewError('too-long');
          newRef.current?.focus();
          break;
        case 'signed-out':
          onSignedOut();
          break;
        case 'rate-limited':
          setFailure(copy.setPassword.rateLimited);
          break;
        case 'offline':
          setFailure(copy.account.changePasswordOfflineReason);
          break;
        default:
          setFailure(copy.login.serverUnavailable);
      }
    } finally {
      setSaving(false);
    }
  }

  const ruleText = newError === 'too-long' ? copy.setPassword.tooLong(PASSWORD_MAX_LENGTH) : copy.setPassword.rule(PASSWORD_MIN_LENGTH);

  return (
    <FormDialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
      title={copy.account.changePassword}
    >
      <form className="change-password-form" onSubmit={(event) => void onSubmit(event)} noValidate>
        <div className="field">
          <span className="field-label" id={currentLabelId}>
            {copy.account.currentPasswordLabel}
          </span>
          <div className={wrongCurrent ? 'input is-invalid' : 'input'}>
            <input
              ref={currentRef}
              className="grow"
              type={currentRevealed ? 'text' : 'password'}
              name="current-password"
              autoComplete="current-password"
              aria-labelledby={currentLabelId}
              aria-invalid={wrongCurrent ? true : undefined}
              aria-describedby={wrongCurrent ? currentErrorId : undefined}
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
            <button type="button" className="input-suffix-btn" aria-pressed={currentRevealed} onClick={() => setCurrentRevealed((value) => !value)}>
              {copy.setPassword.showPassword}
            </button>
          </div>
          {wrongCurrent ? (
            <span className="login-error" id={currentErrorId} role="alert">
              {copy.account.wrongCurrentPassword}
            </span>
          ) : null}
        </div>

        <div className="field">
          <span className="field-label" id={newLabelId}>
            {copy.account.newPasswordLabel}
          </span>
          <div className={newError === null ? 'input' : 'input is-invalid'}>
            <input
              ref={newRef}
              className="grow"
              type={nextRevealed ? 'text' : 'password'}
              name="new-password"
              autoComplete="new-password"
              aria-labelledby={newLabelId}
              aria-describedby={ruleId}
              aria-invalid={newError === null ? undefined : true}
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
            <button type="button" className="input-suffix-btn" aria-pressed={nextRevealed} onClick={() => setNextRevealed((value) => !value)}>
              {copy.setPassword.showPassword}
            </button>
          </div>
          <span className="helper" id={ruleId} data-tone={newError === null ? undefined : 'red'} role={newError === null ? undefined : 'alert'}>
            {ruleText}
          </span>
        </div>

        <div className="field">
          <span className="field-label" id={repeatLabelId}>
            {copy.setPassword.repeatLabel}
          </span>
          <div className={mismatch ? 'input is-invalid' : 'input'}>
            <input
              ref={repeatRef}
              className="grow"
              type={repeatRevealed ? 'text' : 'password'}
              name="repeat-password"
              autoComplete="new-password"
              aria-labelledby={repeatLabelId}
              aria-invalid={mismatch ? true : undefined}
              aria-describedby={mismatch ? repeatErrorId : undefined}
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
            />
            <button type="button" className="input-suffix-btn" aria-pressed={repeatRevealed} onClick={() => setRepeatRevealed((value) => !value)}>
              {copy.setPassword.showPassword}
            </button>
          </div>
          {mismatch ? (
            <span className="login-error" id={repeatErrorId} role="alert">
              {copy.setPassword.mismatch}
            </span>
          ) : null}
        </div>

        {failure === null ? null : (
          <p className="login-error" role="alert">
            {failure}
          </p>
        )}

        <div className="dialog-actions">
          <Button variant="secondary" onPress={onCancel}>
            {copy.account.cancel}
          </Button>
          <Button type="submit" variant="primary" isDisabled={!online} disabledReason={copy.account.changePasswordOfflineReason}>
            {saving ? copy.setPassword.saving : copy.setPassword.submit}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
