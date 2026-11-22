import { PRODUTO } from '@app/domain';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { useLocation, useNavigate } from 'react-router';
import { requestPasswordReset } from '../../api/auth-client.ts';
import { Button } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { useSession } from '../../state/session.tsx';
import { emailIssue } from './email-check.ts';
import './login.css';

/** The e-mail Login carried here (`location.state.email`), or none. */
function carriedEmail(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('email' in state)) return '';
  const email = (state as { email: unknown }).email;
  return typeof email === 'string' ? email : '';
}

/**
 * Story 26.6, "Esqueci minha senha" (`11-login-esqueci.html`, the Login form's shell and classes).
 * Two states on one route: the request, then one answer whatever the address ("Confira o seu
 * e-mail"): the page never says whether the e-mail is known, and a paused or removed account gets
 * the same sentence (the server sends it nothing). A `429` has its own sentence and marks no field;
 * offline, "Enviar link" is `aria-disabled` with its reason and nothing is sent. The e-mail typed on
 * Login arrives already typed.
 */
export function ForgotPasswordSurface() {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const titleId = useId();
  const sentTitleId = useId();
  const emailLabelId = useId();
  const emailErrorId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const sentRef = useRef<HTMLHeadingElement>(null);

  const [email, setEmail] = useState(() => carriedEmail(location.state));
  const [emailError, setEmailError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    document.title = `${copy.login.forgot} · ${PRODUTO}`;
  }, []);

  useEffect(() => {
    if (sent) sentRef.current?.focus();
  }, [sent]);

  const offline = !session.online;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (offline || sending) return;
    setFailure(null);
    const issue = emailIssue(email);
    setEmailError(issue);
    if (issue !== null) {
      emailRef.current?.focus();
      return;
    }
    setSending(true);
    try {
      const result = await requestPasswordReset(email.trim());
      if (result.ok) setSent(true);
      else setFailure(result.reason === 'rate-limited' ? copy.forgot.rateLimited : result.reason === 'offline' ? copy.forgot.offlineReason : copy.login.serverUnavailable);
    } finally {
      setSending(false);
    }
  }

  function askAgain() {
    setSent(false);
    setFailure(null);
    // The field takes the focus once it is drawn again.
    setTimeout(() => emailRef.current?.focus(), 0);
  }

  const toLogin = () => void navigate('/login');

  return (
    <main className="screen">
      <div className="login-screen">
        <form className="login-form" aria-labelledby={sent ? sentTitleId : titleId} onSubmit={onSubmit} noValidate>
          <h1 className="login-wordmark">{PRODUTO}</h1>

          {sent ? (
            <div className="fg-sent" role="status">
              <h2 id={sentTitleId} ref={sentRef} tabIndex={-1}>
                {copy.forgot.sentTitle}
              </h2>
              <p className="t-body">{copy.forgot.sentBody}</p>
              <Button variant="secondary" block onPress={toLogin}>
                {copy.forgot.back}
              </Button>
              <AriaButton type="button" className="btn btn-text" onPress={askAgain}>
                {copy.forgot.useOther}
              </AriaButton>
            </div>
          ) : (
            <div className="fg-ask">
              <h2 id={titleId}>{copy.forgot.title}</h2>
              <p className="t-body">{copy.forgot.intro}</p>
              <div className="field">
                <span className="field-label" id={emailLabelId}>
                  {copy.forgot.emailLabel}
                </span>
                <div className={emailError === null ? 'input' : 'input is-invalid'}>
                  <input
                    ref={emailRef}
                    className="grow"
                    type="email"
                    name="email"
                    autoComplete="username"
                    inputMode="email"
                    aria-labelledby={emailLabelId}
                    aria-invalid={emailError === null ? undefined : true}
                    aria-describedby={emailError === null ? undefined : emailErrorId}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                {emailError === null ? null : (
                  <span className="login-error" id={emailErrorId} role="alert">
                    {emailError}
                  </span>
                )}
              </div>
              {failure === null ? null : (
                <p className="login-error" role="alert">
                  {failure}
                </p>
              )}
              <Button type="submit" variant="primary" block isDisabled={offline} disabledReason={copy.forgot.offlineReason}>
                {sending ? copy.forgot.sending : copy.forgot.submit}
              </Button>
              <AriaButton type="button" className="btn btn-text" onPress={toLogin}>
                {copy.forgot.back}
              </AriaButton>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
