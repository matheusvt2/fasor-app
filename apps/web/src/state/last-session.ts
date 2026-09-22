import { userProfileSchema, type UserProfile } from '@app/domain';

/**
 * Who was signed in on this origin last time, cached so a cold open with no signal
 * reaches Home from the cookie and the local database without waiting for a network
 * call (AD-9). The session cookie is httpOnly, so JavaScript cannot read it; this
 * pointer is what tells the app which `releng-{user_id}` database to open before the
 * server can be reached.
 *
 * It lives outside the per-user database on purpose: the per-user database cannot be
 * opened before the user is known. It carries no secret — the cookie still authorizes
 * every call, and a server 401 raises the re-auth banner.
 */
const KEY = 'releng.last-session';
const RE_AUTH_KEY = 'releng.re-auth-required';

export function readLastSession(): UserProfile | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed = userProfileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeLastSession(user: UserProfile): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    // Private mode or blocked storage: the app still works, it just cannot boot
    // offline until the next successful session read.
  }
}

export function clearLastSession(): void {
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(RE_AUTH_KEY);
  } catch {
    // Nothing to do: the pointer is a convenience, never a source of truth.
  }
}

/**
 * "The server said this session is gone", remembered beside the pointer (`RE_AUTH_KEY`).
 * A cold open with no network cannot ask the server, so without it the second offline
 * open after a 401 would show local data with no re-auth banner, as if the session were
 * fine. Cleared only by a confirmed session (a sign-in or a boot read that answers the
 * profile) or a sign-out; dismissing the banner hides it for the open tab only.
 */
export function readReAuthRequired(): boolean {
  try {
    return window.localStorage.getItem(RE_AUTH_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeReAuthRequired(required: boolean): void {
  try {
    if (required) window.localStorage.setItem(RE_AUTH_KEY, '1');
    else window.localStorage.removeItem(RE_AUTH_KEY);
  } catch {
    // Blocked storage: the banner still shows for this session, only not across a reopen.
  }
}
