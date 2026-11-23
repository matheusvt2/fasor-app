import {
  ACCOUNT_ROUTES,
  accountResponseSchema,
  USER_INACTIVE_CODE,
  type AccountResponse,
  type ReAuthCause,
  type UserProfile,
} from '@app/domain';
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

/** Story 26.11: the listener hears why (`paused` for the inactive code, `expired` otherwise). */
type ReAuthListener = (cause?: ReAuthCause) => void;
const reAuthListeners = new Set<ReAuthListener>();

/** Subscribes to "the server says this session is gone". Returns the unsubscribe. */
export function onReAuthRequired(listener: ReAuthListener): () => void {
  reAuthListeners.add(listener);
  return () => {
    reAuthListeners.delete(listener);
  };
}

/**
 * Raises the re-auth banner. Called by the sync engine on a 401 mid-use (AD-9); Story 26.11: with
 * the cause the 401's code names (`reAuthCauseOf`), `expired` when none is given.
 */
export function publishReAuth(cause: ReAuthCause = 'expired'): void {
  for (const listener of reAuthListeners) listener(cause);
}

/**
 * A failed sign-in is one of three different things and the form says so differently:
 * `credentials` is the server rejecting the pair, `server` is a device that is online but
 * could not get an answer (no response, or a 5xx such as the database being down), and
 * `offline` is a device with no network at all. Only `credentials` may mark a field
 * invalid, and only `offline` may say "Sem conexão". Story 26.11: `inactive` is a paused or
 * removed account (the `user_inactive` code); its line sits where the wrong-password one does and
 * marks no field.
 */
export type SignInFailure = 'credentials' | 'server' | 'offline' | 'rate-limited' | 'inactive';

export type SignInResult =
  | { ok: true; user: UserProfile; features: AccountResponse['features'] }
  | { ok: false; reason: SignInFailure; message: string };

/**
 * e26s (2026-11-22): the account read's answers. The profile; `null` for a `401` that ends the
 * session (no cookie, an ended or deleted session: `unauthenticated`); `'inactive'` for the `401
 * user_inactive` of a paused or removed account, whose session the server keeps. Unreachable throws.
 */
export type AccountRead = AccountResponse | null | 'inactive';

async function readAccount(): Promise<AccountRead> {
  const route = ACCOUNT_ROUTES.read;
  const response = await fetch(route.path, {
    method: route.method,
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (response.status === 401) return (await bodyCode(response)) === USER_INACTIVE_CODE ? 'inactive' : null;
  if (!response.ok) throw new Error(`${route.method} ${route.path} failed with ${response.status}`);
  return accountResponseSchema.parse(await response.json());
}

/**
 * Boot read. A 401 here only means "no session yet", so it raises no banner: the router
 * sends the visitor to Login instead. A thrown error means the server was unreachable,
 * which the caller tells apart from a 401. Story 11.8 follow-up: the server's feature flags
 * travel beside the profile. e26s: `'inactive'` is a paused or removed account, whose session the
 * server keeps: the boot shows the paused state, and a paused device asks it again to learn when the
 * Admin reactivated it (the answer turns to `null`) or removed and ended it.
 */
export function readSession(): Promise<AccountRead> {
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

/** Story 26.11 (frame 12-login-pausada.html): a paused or removed account; a removed one reads the same line. */
const accountInactive = {
  ok: false as const,
  reason: 'inactive' as const,
  message: copy.login.inactive,
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
    if (error.code === USER_INACTIVE_CODE) return accountInactive;
    if (error.status === 429) return rateLimited;
    return isClientRejection(error.status) ? credentialsRejected : unreachable();
  }
  try {
    const account = await readAccount();
    if (account === null) return credentialsRejected;
    if (account === 'inactive') return accountInactive;
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
 *
 * Story 26.11: a server that holds no session for this device (~~a pause deleted it~~ a
 * reactivation deleted it, 2026-11-22 e26r: a pause keeps it; or it ended)
 * answers the sign-out `401`, or `400` when the cookie itself is gone (better-auth's "failed to get
 * session"). There is then nothing left to end on the server, so the device signs out: a paused
 * user who confirmed "Sair e apagar" is never kept in.
 */
export async function signOut(): Promise<void> {
  const result = await client.signOut();
  const error = result.error;
  if (error !== null && error !== undefined) {
    if (isNoServerSession(error.status)) return;
    throw new ApiError(error.message ?? 'sign-out failed', error.status ?? 0);
  }
}

/** Story 26.11: the sign-out answers that mean the server holds no session for this device. */
export function isNoServerSession(status: unknown): boolean {
  return status === 400 || status === 401;
}

/**
 * Story 26.6: "Esqueci minha senha". The server answers the same for any address (a known, an
 * unknown, a paused one); only a `429` and a request that never completed read differently.
 */
export type PasswordResetRequestResult = { ok: true } | { ok: false; reason: 'rate-limited' | 'offline' | 'server' };

/**
 * Story 26.6: the set-password page of a link. `invalid-link` is a used, expired or unknown link
 * (better-auth's `INVALID_TOKEN`, one answer for all three); the two length codes keep the link usable.
 */
export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-link' | 'too-short' | 'too-long' | 'rate-limited' | 'offline' | 'server' };

/**
 * Story 29.1: "Alterar senha" on the Conta screen. `wrong-current` is the current password refused
 * (better-auth's `INVALID_PASSWORD`); `signed-out` is a session the server no longer holds or a
 * paused account (a `401`), whose banner the call raises.
 */
export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: 'wrong-current' | 'too-short' | 'too-long' | 'rate-limited' | 'signed-out' | 'offline' | 'server' };

/** The password routes (`AUTH_ROUTES` of the api, Story 26.6; Story 29.1 adds `change`). */
export const PASSWORD_ROUTES = {
  requestReset: { method: 'POST', path: '/api/auth/request-password-reset' },
  reset: { method: 'POST', path: '/api/auth/reset-password' },
  change: { method: 'POST', path: '/api/auth/change-password' },
} as const;

/** A request that never completed: no network on the device, or a server that did not answer. */
function unreachableReason(): 'offline' | 'server' {
  return isDeviceOnline() ? 'server' : 'offline';
}

/** The `code` of an error body, when the body is JSON and names one. */
async function bodyCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && typeof (body as { code?: unknown }).code === 'string') return (body as { code: string }).code;
  } catch {
    // Not JSON: no code.
  }
  return null;
}

async function postJson(route: { method: string; path: string }, body: unknown): Promise<Response> {
  return fetch(route.path, {
    method: route.method,
    credentials: 'same-origin',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Story 26.6: asks for a link that sets a new password. Never says whether the address exists. */
export async function requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  let response: Response;
  try {
    response = await postJson(PASSWORD_ROUTES.requestReset, { email });
  } catch {
    return { ok: false, reason: unreachableReason() };
  }
  if (response.ok) return { ok: true };
  if (response.status === 429) return { ok: false, reason: 'rate-limited' };
  // A 4xx other than the limit is a body the server refused (a malformed address): the page still
  // says the one sentence, as for any address, so nothing is learnt about the address. A 5xx is the
  // server not answering.
  return response.status >= 500 ? { ok: false, reason: 'server' } : { ok: true };
}

/** Story 26.6: sets the password of the link's user. */
export async function resetPassword(token: string, newPassword: string): Promise<ResetPasswordResult> {
  let response: Response;
  try {
    response = await postJson(PASSWORD_ROUTES.reset, { token, newPassword });
  } catch {
    return { ok: false, reason: unreachableReason() };
  }
  if (response.ok) return { ok: true };
  if (response.status === 429) return { ok: false, reason: 'rate-limited' };
  if (response.status >= 500) return { ok: false, reason: 'server' };
  const code = await bodyCode(response);
  if (code === 'PASSWORD_TOO_SHORT') return { ok: false, reason: 'too-short' };
  if (code === 'PASSWORD_TOO_LONG') return { ok: false, reason: 'too-long' };
  // INVALID_TOKEN, and any other refusal of the link itself: the page of a link that no longer works.
  return { ok: false, reason: 'invalid-link' };
}

/**
 * Story 29.1: changes the signed-in user's password. The server ends every other session of the
 * user and answers this device a new session cookie, so it stays signed in.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
  let response: Response;
  try {
    response = await postJson(PASSWORD_ROUTES.change, { currentPassword, newPassword });
  } catch {
    return { ok: false, reason: unreachableReason() };
  }
  if (response.ok) return { ok: true };
  if (response.status === 429) return { ok: false, reason: 'rate-limited' };
  if (response.status >= 500) return { ok: false, reason: 'server' };
  const code = await bodyCode(response);
  if (response.status === 401) {
    publishReAuth(code === USER_INACTIVE_CODE ? 'paused' : 'expired');
    return { ok: false, reason: 'signed-out' };
  }
  if (code === 'INVALID_PASSWORD') return { ok: false, reason: 'wrong-current' };
  if (code === 'PASSWORD_TOO_SHORT') return { ok: false, reason: 'too-short' };
  if (code === 'PASSWORD_TOO_LONG') return { ok: false, reason: 'too-long' };
  return { ok: false, reason: 'server' };
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
