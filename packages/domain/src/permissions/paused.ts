/*
 * Story 26.11 (AD-9, AD-29): a paused account keeps the work it did not send. The server answers
 * every request of a user who is not active (paused, removed, still invited) with `401` and the
 * code `user_inactive` (`contract/errors.ts`); any other `401` is a session that ended. The device
 * names the two apart (the paused banner, the warning "Sair"), and the sentences that carry a count
 * of unsent changes are written here (`MOCK-GUIDE.md` § 2026-11-21, frame 94-conta-pausada.html).
 */

/** The error code of a `401` for a user who is not active (paused or removed). */
export const USER_INACTIVE_CODE = 'user_inactive';

/** Why the server stopped taking this device's session: the account is paused, or the session ended. */
export type ReAuthCause = 'paused' | 'expired';

/** The cause a `401` names: `paused` for the `user_inactive` code, `expired` for any other (or none). */
export function reAuthCauseOf(code: string | null | undefined): ReAuthCause {
  return code === USER_INACTIVE_CODE ? 'paused' : 'expired';
}

/**
 * The Sessão note of Conta while the account is paused and work waits (frame 94, `#cp-sair-note`):
 * "5 alterações aguardando envio. Com a conta pausada, elas só podem ser enviadas depois da reativação."
 */
export function pausedSignOutNoteText(count: number): string {
  return count === 1
    ? // authored (Story 26.11): the singular of the frame's sentence.
      '1 alteração aguardando envio. Com a conta pausada, ela só pode ser enviada depois da reativação.'
    : `${count} alterações aguardando envio. Com a conta pausada, elas só podem ser enviadas depois da reativação.`;
}

/**
 * The body of "Sair e apagar o que não foi enviado?" (frame 94, `#cp-sair-desc`), over the count of
 * what is still unsent on the device (outbox ops not acknowledged plus photo originals not uploaded).
 */
export function pausedSignOutText(count: number): string {
  return count === 1
    ? // authored (Story 26.11): the singular of the frame's sentence.
      '1 alteração ainda não foi enviada e não pode ser enviada agora, porque a sua conta está pausada. Se você sair, ela é apagada deste aparelho. Se ficar, ela é enviada quando a conta for reativada.'
    : `${count} alterações ainda não foram enviadas e não podem ser enviadas agora, porque a sua conta está pausada. Se você sair, elas são apagadas deste aparelho. Se ficar, elas são enviadas quando a conta for reativada.`;
}
