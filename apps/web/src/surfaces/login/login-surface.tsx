import { PRODUTO } from '@app/domain';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Button } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import type { SignInFailure } from '../../api/auth-client.ts';
import { readLastSession } from '../../state/last-session.ts';
import { useSession } from '../../state/session.tsx';
import { emailIssue } from './email-check.ts';
import './login.css';

interface FieldErrors {
  email: string | null;
  password: string | null;
}

const NO_FIELD_ERRORS: FieldErrors = { email: null, password: null };

/** The device's own check, before anything is sent: nothing empty, an e-mail with a shape. */
export function validateLogin(email: string, password: string): FieldErrors {
  return {
    email: emailIssue(email),
    password: password === '' ? copy.login.passwordRequired : null,
  };
}

/**
 * Login (UX-DR61), built from `mockups/key-login.html` with the mock's own class names:
 * wordmark, two 56 px inputs, "Mostrar", one primary block button, the footer, plus the
 * error and offline frames.
 *
 * Offline with no session the button is `aria-disabled` with the reason beside it and
 * submitting does nothing — no spinner, no request (AD-23: never `disabled`).
 *
 * A failed attempt says what actually failed (retro U4): an empty or malformed field is
 * caught here and named under that field, with no request sent; the server rejecting the
 * pair is "E-mail ou senha incorretos." under the password; a server that does not answer is its own
 * sentence and marks no field, because nothing typed was wrong.
 *
 * Story 26.6 (`10-login.html`): "Esqueci minha senha" under "Entrar" opens the request page with
 * the typed e-mail (`onForgot`, the route owns the navigation); `notice` is the line a set-password
 * page carries here ("Senha criada…"). Story 26.11 (`12-login-pausada.html`): a paused or removed
 * account reads "Conta pausada. Fale com o administrador." in the wrong-password line's place,
 * marking no field; the fields keep their values and nothing on the device is touched.
 */
export function LoginSurface({ notice = null, onForgot }: { notice?: string | null; onForgot?: (email: string) => void } = {}) {
  const session = useSession();
  const titleId = useId();
  const emailLabelId = useId();
  const passwordLabelId = useId();
  const emailErrorId = useId();
  const passwordErrorId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // F-23: after "Entrar de novo" the app knows the account: the e-mail of the expired
  // session (or of the last one on this device) is already typed.
  const [email, setEmail] = useState(() => session.user?.email ?? readLastSession()?.email ?? '');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(NO_FIELD_ERRORS);
  const [failure, setFailure] = useState<{ reason: SignInFailure; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // e26s (2026-11-22): the set-password page's line ("Senha criada. …") stands until a sign-in fails.
  const [noticeShown, setNoticeShown] = useState(true);

  useEffect(() => {
    document.title = PRODUTO;
  }, []);

  const offline = !session.online;
  // Offline, the offline sentence is the whole story: an earlier server answer ("Senha
  // incorreta", the server being down) is not shown beside it.
  const shownFailure = offline ? null : failure;
  const wrongPair = shownFailure?.reason === 'credentials';
  // Story 26.11: the paused line sits under the password, where the wrong-password one does, but marks no field.
  const inactive = shownFailure?.reason === 'inactive';
  const passwordInvalid = fieldErrors.password ?? (wrongPair ? shownFailure.message : null);
  const passwordMessage = passwordInvalid ?? (inactive ? shownFailure.message : null);
  const formMessage = shownFailure !== null && !wrongPair && !inactive ? shownFailure.message : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (offline || submitting) return;
    setFailure(null);
    const errors = validateLogin(email, password);
    setFieldErrors(errors);
    if (errors.email !== null || errors.password !== null) {
      (errors.email !== null ? emailRef : passwordRef).current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const result = await session.signIn(email.trim(), password);
      if (!result.ok) {
        setNoticeShown(false);
        setFailure({ reason: result.reason, message: result.message });
      }
    } catch {
      setNoticeShown(false);
      setFailure({ reason: 'server', message: copy.login.serverUnavailable });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="screen">
      <div className="login-screen">
        <form className="login-form" aria-labelledby={titleId} onSubmit={onSubmit} noValidate>
          <h1 className="login-wordmark" id={titleId}>
            {PRODUTO}
          </h1>

          {notice === null || !noticeShown ? null : (
            <p className="login-notice" role="status">
              {notice}
            </p>
          )}

          {offline ? (
            <p className="login-offline" role="status">
              {copy.login.offline}
            </p>
          ) : null}

          <div className="field">
            <span className="field-label" id={emailLabelId}>
              {copy.login.emailLabel}
            </span>
            <div className={fieldErrors.email === null ? 'input' : 'input is-invalid'}>
              <input
                ref={emailRef}
                className="grow"
                type="email"
                name="email"
                autoComplete="username"
                inputMode="email"
                aria-labelledby={emailLabelId}
                aria-invalid={fieldErrors.email === null ? undefined : true}
                aria-describedby={fieldErrors.email === null ? undefined : emailErrorId}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {fieldErrors.email === null ? null : (
              <span className="login-error" id={emailErrorId} role="alert">
                {fieldErrors.email}
              </span>
            )}
          </div>

          <div className="field">
            <span className="field-label" id={passwordLabelId}>
              {copy.login.passwordLabel}
            </span>
            <div className={passwordInvalid === null ? 'input' : 'input is-invalid'}>
              <input
                ref={passwordRef}
                className="grow"
                type={revealed ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                aria-labelledby={passwordLabelId}
                aria-invalid={passwordInvalid === null ? undefined : true}
                aria-describedby={passwordMessage === null ? undefined : passwordErrorId}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="input-suffix-btn"
                aria-pressed={revealed}
                onClick={() => setRevealed((value) => !value)}
              >
                {copy.login.showPassword}
              </button>
            </div>
            {passwordMessage === null ? null : (
              <span className="login-error" id={passwordErrorId} role="alert">
                {passwordMessage}
              </span>
            )}
          </div>

          {formMessage === null ? null : (
            <p className="login-error" role="alert">
              {formMessage}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            block
            isDisabled={offline}
            disabledReason={copy.login.offlineReason}
          >
            {submitting ? copy.login.signingIn : copy.login.submit}
          </Button>
          {onForgot === undefined ? null : (
            <AriaButton type="button" className="btn btn-text login-forgot" onPress={() => onForgot(email.trim())}>
              {copy.login.forgot}
            </AriaButton>
          )}

          <p className="login-foot">{copy.login.foot}</p>
        </form>
      </div>
    </main>
  );
}
