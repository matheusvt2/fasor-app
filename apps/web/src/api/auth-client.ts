import { ACCOUNT_ROUTES, accountResponseSchema, type AccountResponse, type UserProfile } from '@app/domain';
import { createAuthClient } from 'better-auth/client';
import { copy } from '../copy/pt-br.ts';

/**
 * The only module that talks to the network for identity (AR-1, AD-9): sign-in,
 * sign-out and the account read at boot and after sign-in. Every other `fetch` in
 * `apps/web` is forbidden by lint outside `src/{sync,files,api}`. The professional
 * registration is not saved here: it is committed as `user/{id}/{field}` ops and travels
 * with the sync push (AD-1).
 *
 * The session read at boot and the one right after sign-in never raise the re-auth
 * banner: there a 401 means "no session yet", which is Login's job, not a banner's. The
 * sync engine publishes it on a 401 mid-use (`publishReAuth`). Nothing here touches the
 * local database.
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

/** Raises the re-auth banner. Called by the sync engine on a 401 mid-use (AD-9). */
export function publishReAuth(): void {
  for (const listener of reAuthListeners) listener();
}

/**
 * A failed sign-in is one of three different things and the form says so differently:
 * `credentials` is the server rejecting the pair, `server` is a device that is online but
 * could not get an answer (no response, or a 5xx such as the database being down), and
 * `offline` is a device with no network at all. Only `credentials` may mark a field
 * invalid, and only `offline` may say "Sem conexão".
 */
export type SignInFailure = 'credentials' | 'server' | 'offline' | 'rate-limited';

export type SignInResult =
  | { ok: true; user: UserProfile; features: AccountResponse['features'] }
  | { ok: false; reason: SignInFailure; message: string };

async function readAccount(): Promise<AccountResponse | null> {
  const route = ACCOUNT_ROUTES.read;
  const response = await fetch(route.path, {
    method: route.method,
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`${route.method} ${route.path} failed with ${response.status}`);
  return accountResponseSchema.parse(await response.json());
}

/**
 * Boot read. A 401 here only means "no session yet", so it raises no banner: the router
 * sends the visitor to Login instead. A thrown error means the server was unreachable,
 * which the caller tells apart from a 401. Story 11.8 follow-up: the server's feature flags
 * travel beside the profile.
 */
export function readSession(): Promise<AccountResponse | null> {
  return readAccount();
}

const credentialsRejected = {
  ok: false as const,
  reason: 'credentials' as const,
  message: copy.login.wrongPassword,
};

/** L10 (review 2026-09-30): 429, too many attempts; never the wrong-password text, and no field is marked. */
const rateLimited = {
  ok: false as const,
  reason: 'rate-limited' as const,
  message: copy.login.rateLimited,
};

const serverUnavailable = {
  ok: false as const,
  reason: 'server' as const,
  message: copy.login.serverUnavailable,
};

const deviceOffline = {
  ok: false as const,
  reason: 'offline' as const,
  message: copy.login.offline,
};

function isDeviceOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/** A request that never completed: the device's own network, or the server's. */
function unreachable(): SignInResult {
  return isDeviceOnline() ? serverUnavailable : deviceOffline;
}

/** True for a 4xx: the server answered and refused the request itself. */
export function isClientRejection(status: unknown): boolean {
  return typeof status === 'number' && status >= 400 && status < 500;
}

/**
 * Signs in. A credential rejection maps to the one message the mock shows, so the form
 * never leaks which of the two fields was wrong; a failure to reach the server says so
 * instead of blaming the password, and only a device with no network says "Sem conexão".
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  let result: Awaited<ReturnType<typeof client.signIn.email>>;
  try {
    result = await client.signIn.email({ email, password });
  } catch {
    // The request never completed: no HTTP status, so nothing was rejected.
    return unreachable();
  }
  const error = result.error;
  if (error !== null && error !== undefined) {
    // Only a 4xx is the server rejecting what was typed (401 for the pair, 400 for a
    // malformed e-mail). A 5xx (database down) or no status at all (transport failure)
    // is the server not answering, and must never read as a wrong password.
    if (error.status === 429) return rateLimited;
    return isClientRejection(error.status) ? credentialsRejected : unreachable();
  }
  try {
    const account = await readAccount();
    if (account === null) return credentialsRejected;
    return { ok: true, user: account.user, features: account.features };
  } catch {
    return unreachable();
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
