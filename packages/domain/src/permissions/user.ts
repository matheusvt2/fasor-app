import { z } from 'zod';

/*
 * AD-29 (Story 26.2): a user's status, written by the server-only `user/{id}/status` put. A user
 * whose row carries no status (born before contract 55, until the migration gives it one) counts
 * as active. Only an active user acts: an invited user has not set a password yet, a paused or
 * removed user keeps the row and every name in history but signs in to nothing.
 */

export const USER_STATUSES = ['active', 'invited', 'paused', 'removed'] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

/** The user's status, absent read as `active`. */
export function userStatusOf(user: { status?: UserStatus | null | undefined }): UserStatus {
  return user.status ?? 'active';
}

/** Whether the user may act at all (sign in, push, read). */
export function activeUser(user: { status?: UserStatus | null | undefined }): boolean {
  return userStatusOf(user) === 'active';
}

/**
 * Story 26.6: whether a password link (an invitation or a reset) may be sent to the user. A paused
 * or removed user receives none, whoever asks (the Login's "Esqueci minha senha" or the Admin);
 * an invited or active one may (absent status counts as active).
 */
export function passwordLinkAllowed(user: { status?: UserStatus | null | undefined }): boolean {
  const status = userStatusOf(user);
  return status !== 'paused' && status !== 'removed';
}

const STATUS_WORDS: Readonly<Record<UserStatus, string>> = {
  // authored (Story 26.2)
  active: 'Ativo',
  // authored (Story 26.2)
  invited: 'Convidado',
  // authored (Story 26.2)
  paused: 'Pausado',
  // authored (Story 26.2)
  removed: 'Removido',
};

/** The pt-BR word of a user's status. */
export function userStatusLabel(status: UserStatus): string {
  return STATUS_WORDS[status];
}
