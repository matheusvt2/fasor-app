/*
 * Story 26.6 (AD-9, AD-29): the one-time link an e-mail carries to set a password. The invitation
 * and the reset are the same better-auth verification row (`reset-password:<token>`, value = the
 * user's id); they differ only in how long the row lives. The token travels in the fragment of the
 * app's own page (`{origin}/definir-senha#{token}`), so it never reaches a server log or a
 * `Referer` header.
 */

/** The app's page that sets a password from a link. */
export const SET_PASSWORD_PATH = '/definir-senha';

/** How long an invitation link lives (coordinator's reading of Story 26.6: 72 hours, authored). */
export const INVITATION_LINK_HOURS = 72;

/** How long a password reset link lives (coordinator's reading of Story 26.6: 1 hour, authored). */
export const RESET_LINK_HOURS = 1;

/**
 * The password rule of today's seed: better-auth's default length, 8 to 128 characters (the seed
 * CLI checks nothing more). The api sets both on better-auth explicitly from here.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** The characters a link token is made of (better-auth's ids and base64url both fit). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

/** The link an e-mail carries: the app's origin, the set-password page, the token as the fragment. */
export function setPasswordLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}${SET_PASSWORD_PATH}#${token}`;
}

/** The token of a link's fragment (`location.hash`, with or without its `#`), or null when it holds none. */
export function tokenFromFragment(hash: string): string | null {
  const token = (hash.startsWith('#') ? hash.slice(1) : hash).trim();
  return TOKEN_PATTERN.test(token) ? token : null;
}

/** Whether a password fits the rule (length only). */
export function passwordLengthIssue(password: string): 'too_short' | 'too_long' | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'too_short';
  if (password.length > PASSWORD_MAX_LENGTH) return 'too_long';
  return null;
}
