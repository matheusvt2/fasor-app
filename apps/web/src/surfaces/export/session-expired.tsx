import { useNavigate } from 'react-router';
import { TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { SyncRequestError } from '../../sync/client.ts';

/*
 * F-12 / W-23 (review 2026-09-30; State Patterns › Session expired): a preview, an issue or a
 * revision file refused because the session is gone says so, and offers the one thing that
 * fixes it ("Entrar de novo"), never the generic "Não foi possível". The request's 401 also
 * raises the app's re-auth banner (`publishReAuth`, by the caller).
 */

/** A request of the Export dialog that failed because the session is gone. */
export class SessionExpiredError extends Error {
  constructor() {
    super('session expired');
    this.name = 'SessionExpiredError';
  }
}

/** True for a 401 answer of the server, or a request stopped because the session is known to be gone. */
export function isSessionExpired(error: unknown): boolean {
  if (error instanceof SessionExpiredError) return true;
  return error instanceof SyncRequestError && error.failure.kind === 'http' && error.failure.status === 401;
}

/** True only for the server's own 401 (the re-auth banner is raised once, for it). */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof SyncRequestError && error.failure.kind === 'http' && error.failure.status === 401;
}

/** The dialog's line for a session that expired: the sentence and "Entrar de novo". */
export function SessionExpiredNote() {
  const navigate = useNavigate();
  return (
    <div className="gen-error" role="alert">
      <span>{copy.sync.sessionExpired}</span>
      <TextButton onPress={() => void navigate('/login')}>{copy.banner.reAuthAction}</TextButton>
    </div>
  );
}
