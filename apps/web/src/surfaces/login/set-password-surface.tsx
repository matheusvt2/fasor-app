import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordLengthIssue, PRODUTO, tokenFromFragment } from '@app/domain';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { useLocation, useNavigate } from 'react-router';
import { resetPassword } from '../../api/auth-client.ts';
import { Button } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { useSession } from '../../state/session.tsx';
import './login.css';

/** What Login reads from `location.state` after a password was set (`LoginRoute`). */
export const PASSWORD_SAVED_NOTICE = 'password-saved';

type PasswordError = { kind: 'too-short' } | { kind: 'too-long' } | null;

/**
 * Story 26.6, the page a password link opens (`13-definir-senha.html`, the Login form's shell and
 * classes), for the invitation's link and the reset's alike. The token is read once from the
 * fragment (`tokenFromFragment`) and taken off the address at once, so it stays out of the
 * history and of a screenshot. "Salvar senha" sets the password and lands on Login with the
 * frame's "Senha criada…" line.
 *
 * A link with no token, or one the server refuses (`400 INVALID_TOKEN`: used, expired or unknown,
 * one answer for all three), shows the expired page (`14-definir-senha-expirado.html`), which also
 * serves an expired invitation. A password the server finds too short or too long keeps the link
 * usable and says so under the field.
 *
 * Narrowed: the frame's "Olá, Fernanda", the read-only e-mail and the "vale até" line need data the
 * link does not carry and no route gives (there is no lookup by token), so the page omits them; a
 * used link is known as such only when "Salvar senha" is pressed.
 */
export function SetPasswordSurface() {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const titleId = useId();
  const expiredTitleId = useId();
  const passwordLabelId = useId();
  const repeatLabelId = useId();
  const ruleId = useId();
  const repeatErrorId = useId();
  const passwordRef = useRef<HTMLInputElement>(null);
  const repeatRef = useRef<HTMLInputElement>(null);

  // Read once: the address loses the fragment right after (the effect below).
  const [token] = useState<string | null>(() => tokenFromFragment(location.hash));
  const [expired, setExpired] = useState(token === null);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [repeatRevealed, setRepeatRevealed] = useState(false);
  const [passwordError, setPasswordError] = useState<PasswordError>(null);
  const [mismatch, setMismatch] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = `${copy.setPassword.pageTitle} · ${PRODUTO}`;
  }, []);

  useEffect(() => {
    if (window.location.hash === '') return;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  }, []);

  const offline = !session.online;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (offline || saving || token === null) return;
    setFailure(null);
    const issue = passwordLengthIssue(password);
    const error: PasswordError = issue === 'too_short' ? { kind: 'too-short' } : issue === 'too_long' ? { kind: 'too-long' } : null;
    setPasswordError(error);
    const differs = error === null && password !== repeat;
    setMismatch(differs);
    if (error !== null) {
      passwordRef.current?.focus();
      return;
    }
    if (differs) {
      repeatRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const result = await resetPassword(token, password);
      if (result.ok) {
        void navigate('/login', { replace: true, state: { notice: PASSWORD_SAVED_NOTICE } });
        return;
      }
      switch (result.reason) {
        case 'invalid-link':
          setExpired(true);
          break;
        case 'too-short':
          setPasswordError({ kind: 'too-short' });
          passwordRef.current?.focus();
          break;
        case 'too-long':
          setPasswordError({ kind: 'too-long' });
          passwordRef.current?.focus();
          break;
        case 'rate-limited':
          setFailure(copy.setPassword.rateLimited);
          break;
        case 'offline':
          setFailure(copy.setPassword.offlineReason);
          break;
        default:
          setFailure(copy.login.serverUnavailable);
      }
    } finally {
      setSaving(false);
    }
  }

  if (expired) {
    return (
      <main className="screen">
        <div className="login-screen">
          <div className="login-form" role="form" aria-labelledby={expiredTitleId}>
            <h1 className="login-wordmark">{PRODUTO}</h1>
            <h2 id={expiredTitleId}>{copy.setPassword.expiredTitle}</h2>
            <p className="t-body" role="alert">
              {copy.setPassword.expiredBody}
            </p>
            <Button variant="primary" block onPress={() => void navigate('/login/esqueci')}>
              {copy.setPassword.askNew}
            </Button>
            <AriaButton type="button" className="btn btn-text" onPress={() => void navigate('/login')}>
              {copy.setPassword.back}
            </AriaButton>
          </div>
        </div>
      </main>
    );
  }

  const ruleText = passwordError?.kind === 'too-long' ? copy.setPassword.tooLong(PASSWORD_MAX_LENGTH) : copy.setPassword.rule(PASSWORD_MIN_LENGTH);

  return (
    <main className="screen">
      <div className="login-screen">
        <form className="login-form" aria-labelledby={titleId} onSubmit={onSubmit} noValidate>
          <h1 className="login-wordmark">{PRODUTO}</h1>
          <h2 id={titleId}>{copy.setPassword.title}</h2>
          <p className="t-body">{copy.setPassword.intro}</p>

          <div className="field">
            <span className="field-label" id={passwordLabelId}>
              {copy.setPassword.passwordLabel}
            </span>
            <div className={passwordError === null ? 'input' : 'input is-invalid'}>
              <input
                ref={passwordRef}
                className="grow"
                type={revealed ? 'text' : 'password'}
                name="new-password"
                autoComplete="new-password"
                aria-labelledby={passwordLabelId}
                aria-describedby={ruleId}
                aria-invalid={passwordError === null ? undefined : true}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button type="button" className="input-suffix-btn" aria-pressed={revealed} onClick={() => setRevealed((value) => !value)}>
                {copy.setPassword.showPassword}
              </button>
            </div>
            <span className="helper" id={ruleId} data-tone={passwordError === null ? undefined : 'red'} role={passwordError === null ? undefined : 'alert'}>
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

          <Button type="submit" variant="primary" block isDisabled={offline} disabledReason={copy.setPassword.offlineReason}>
            {saving ? copy.setPassword.saving : copy.setPassword.submit}
          </Button>
        </form>
      </div>
    </main>
  );
}
