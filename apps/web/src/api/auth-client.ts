import { accountResponseSchema, type Registration, type UserProfile } from '@app/domain';
import { createAuthClient } from 'better-auth/client';
import { copy } from '../copy/pt-br.ts';

/**
 * The only module that talks to the network for identity (AR-1, AD-9): sign-in,
 * sign-out, the session read at boot and the professional-registration save. Every
 * other `fetch` in `apps/web` is forbidden by lint outside `src/{sync,files,api}`.
 *
 * Only `saveRegistration` publishes a re-auth event on a 401, which the banner slot
 * turns into "Entrar de novo". The session read at boot and the one right after sign-in
 * never do: there a 401 means "no session yet", which is Login's job, not a banner's.
 * Nothing here touches the local database.
 */

const client = createAuthClient({ basePath: '/api/auth' });

type ReAuthListener = () => void;
const reAuthListeners = new Set<ReAuthListener>();

/** Subscribes to "the server says this session is gone". Returns the unsubscribe. */
export function onReAuthRequired(listener: ReAuthListener): () => void {
  reAuthListeners.add(listener);
  return () => {
    reAuthListeners.delete(listener);
  };
}

function publishReAuth(): void {
  for (const listener of reAuthListeners) listener();
}

/**
 * A failed sign-in is one of two different things and the form says so differently:
 * `credentials` is the server rejecting the pair, `network` is not reaching the server
 * at all. Only `credentials` may mark a field invalid.
 */
export type SignInResult =
  | { ok: true; user: UserProfile }
  | { ok: false; reason: 'credentials' | 'network'; message: string };

async function readAccount(): Promise<UserProfile | null> {
  const response = await fetch('/api/account', {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`GET /api/account failed with ${response.status}`);
  return accountResponseSchema.parse(await response.json()).user;
}

/**
 * Boot read. A 401 here only means "no session yet", so it raises no banner: the router
 * sends the visitor to Login instead. A thrown error means the server was unreachable,
 * which the caller tells apart from a 401.
 */
export function readSession(): Promise<UserProfile | null> {
  return readAccount();
}

const credentialsRejected = {
  ok: false as const,
  reason: 'credentials' as const,
  message: copy.login.wrongPassword,
};

const serverUnreachable = {
  ok: false as const,
  reason: 'network' as const,
  message: copy.login.offline,
};

/**
 * Signs in. A credential rejection maps to the one message the mock shows, so the form
 * never leaks which of the two fields was wrong; a transport failure says so instead of
 * blaming the password.
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  let result: Awaited<ReturnType<typeof client.signIn.email>>;
  try {
    result = await client.signIn.email({ email, password });
  } catch {
    // The request never completed: no HTTP status, so nothing was rejected.
    return serverUnreachable;
  }
  const error = result.error;
  if (error !== null && error !== undefined) {
    // better-auth reports a transport failure as an error with no HTTP status.
    return typeof error.status === 'number' ? credentialsRejected : serverUnreachable;
  }
  try {
    const user = await readAccount();
    if (user === null) return credentialsRejected;
    return { ok: true, user };
  } catch {
    return serverUnreachable;
  }
}

/**
 * Clears the session cookie on the server. The device database is left alone. Throws
 * when the server did not confirm, so the caller can keep the session instead of
 * pretending the user is out: the better-auth client reports failures as a returned
 * error rather than a rejection, so both shapes are turned into one.
 */
export async function signOut(): Promise<void> {
  const result = await client.signOut();
  const error = result.error;
  if (error !== null && error !== undefined) {
    throw new ApiError(error.message ?? 'sign-out failed', error.status ?? 0);
  }
}

/**
 * Carries the HTTP status of a failed call so the caller can tell a body the server
 * refused (400) from a failure worth retrying.
 */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Named server action for the professional registration (AD-9). Converting it to a
 * `user/{id}/{field}` op is deferred to Story 1.4.
 */
export async function saveRegistration(registration: Registration): Promise<UserProfile> {
  const response = await fetch('/api/account/registration', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(registration),
  });
  if (response.status === 401) {
    publishReAuth();
    throw new ApiError('unauthenticated', 401);
  }
  if (!response.ok) {
    throw new ApiError(
      `PUT /api/account/registration failed with ${response.status}`,
      response.status,
    );
  }
  return accountResponseSchema.parse(await response.json()).user;
}
