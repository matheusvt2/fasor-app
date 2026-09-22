import { PRODUTO } from '@app/domain';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import type { SignInFailure } from '../../api/auth-client.ts';
import { useSession } from '../../state/session.tsx';
import './login.css';

/** Something shaped like an address: text, one "@", a dot in the domain part. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  email: string | null;
  password: string | null;
}

const NO_FIELD_ERRORS: FieldErrors = { email: null, password: null };

/** The device's own check, before anything is sent: nothing empty, an e-mail with a shape. */
export function validateLogin(email: string, password: string): FieldErrors {
  const trimmed = email.trim();
  return {
    email: trimmed === '' ? copy.login.emailRequired : EMAIL_SHAPE.test(trimmed) ? null : copy.login.emailInvalid,
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
 * pair is "Senha incorreta" under the password; a server that does not answer is its own
 * sentence and marks no field, because nothing typed was wrong.
 */
export function LoginSurface() {
  const session = useSession();
  const titleId = useId();
  const emailLabelId = useId();
  const passwordLabelId = useId();
  const emailErrorId = useId();
  const passwordErrorId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(NO_FIELD_ERRORS);
  const [failure, setFailure] = useState<{ reason: SignInFailure; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = PRODUTO;
  }, []);

  const offline = !session.online;
  const wrongPair = failure?.reason === 'credentials';
  const passwordMessage = fieldErrors.password ?? (wrongPair ? failure.message : null);
  const formMessage = failure !== null && !wrongPair ? failure.message : null;

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
      if (!result.ok) setFailure({ reason: result.reason, message: result.message });
    } catch {
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
            <div className={passwordMessage === null ? 'input' : 'input is-invalid'}>
              <input
                ref={passwordRef}
                className="grow"
                type={revealed ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                aria-labelledby={passwordLabelId}
                aria-invalid={passwordMessage === null ? undefined : true}
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

          <p className="login-foot">{copy.login.foot}</p>
        </form>
      </div>
    </main>
  );
}
