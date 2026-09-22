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
  } catch {
    // Nothing to do: the pointer is a convenience, never a source of truth.
  }
}
