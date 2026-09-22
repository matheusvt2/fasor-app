import { PRODUTO } from '@app/domain';
import { useId, useState, type FormEvent } from 'react';
import { copy } from '../../copy/pt-br.ts';
import { useSession } from '../../state/session.tsx';
import './login.css';

/**
 * Login (UX-DR61), built from `mockups/key-login.html` with the mock's own class names:
 * wordmark, two 56 px inputs, "Mostrar", one primary block button, the footer, plus the
 * error and offline frames.
 *
 * Offline with no session the button is `aria-disabled` with the reason beside it and
 * submitting does nothing — no spinner, no request (AD-23: never `disabled`).
 */
export function LoginSurface() {
  const session = useSession();
  const titleId = useId();
  const emailLabelId = useId();
  const passwordLabelId = useId();
  const errorId = useId();
  const reasonId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  /**
   * `credentials` is the server rejecting the pair, and only then is the password field
   * marked invalid; `network` is not reaching the server at all, which is no fault of
   * what was typed.
   */
  const [error, setError] = useState<{ reason: 'credentials' | 'network'; message: string } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  const offline = !session.online;
  const invalid = error?.reason === 'credentials';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (offline || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await session.signIn(email, password);
      if (!result.ok) setError({ reason: result.reason, message: result.message });
    } catch {
      setError({ reason: 'network', message: copy.login.offline });
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
            <div className="input">
              <input
                className="grow"
                type="email"
                name="email"
                autoComplete="username"
                inputMode="email"
                aria-labelledby={emailLabelId}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <span className="field-label" id={passwordLabelId}>
              {copy.login.passwordLabel}
            </span>
            <div className={invalid ? 'input is-invalid' : 'input'}>
              <input
                className="grow"
                type={revealed ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                aria-labelledby={passwordLabelId}
                aria-invalid={invalid ? true : undefined}
                aria-describedby={invalid ? errorId : undefined}
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
            {error === null ? null : (
              <span className="login-error" id={errorId} role="alert">
                {error.message}
              </span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            aria-disabled={offline ? true : undefined}
            aria-describedby={offline ? reasonId : undefined}
          >
            {submitting ? copy.login.signingIn : copy.login.submit}
          </button>
          {offline ? (
            <span className="btn-reason" id={reasonId}>
              {copy.login.offlineReason}
            </span>
          ) : null}

          <p className="login-foot">{copy.login.foot}</p>
        </form>
      </div>
    </main>
  );
}
