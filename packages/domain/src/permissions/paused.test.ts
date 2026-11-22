import { describe, expect, it } from 'vitest';
import { pausedSignOutNoteText, pausedSignOutText, reAuthCauseOf, USER_INACTIVE_CODE } from './paused.ts';

/*
 * Story 26.11: the cause of a 401 and the two count sentences of a paused account (frame
 * 94-conta-pausada.html), plural and the authored singular.
 */

describe('26.11-UNIT-001 reAuthCauseOf', () => {
  it('reads the inactive code as a paused account and anything else as an ended session', () => {
    expect(USER_INACTIVE_CODE).toBe('user_inactive');
    expect(reAuthCauseOf('user_inactive')).toBe('paused');
    expect(reAuthCauseOf('unauthenticated')).toBe('expired');
    expect(reAuthCauseOf(undefined)).toBe('expired');
    expect(reAuthCauseOf(null)).toBe('expired');
    expect(reAuthCauseOf('')).toBe('expired');
  });
});

describe('26.11-UNIT-002 the paused sentences', () => {
  it('the Sessão note is the frame sentence for five and its singular for one', () => {
    expect(pausedSignOutNoteText(5)).toBe('5 alterações aguardando envio. Com a conta pausada, elas só podem ser enviadas depois da reativação.');
    expect(pausedSignOutNoteText(1)).toBe('1 alteração aguardando envio. Com a conta pausada, ela só pode ser enviada depois da reativação.');
  });

  it('the Sair dialog body is the frame sentence for five and its singular for one', () => {
    expect(pausedSignOutText(5)).toBe(
      '5 alterações ainda não foram enviadas e não podem ser enviadas agora, porque a sua conta está pausada. Se você sair, elas são apagadas deste aparelho. Se ficar, elas são enviadas quando a conta for reativada.',
    );
    expect(pausedSignOutText(1)).toBe(
      '1 alteração ainda não foi enviada e não pode ser enviada agora, porque a sua conta está pausada. Se você sair, ela é apagada deste aparelho. Se ficar, ela é enviada quando a conta for reativada.',
    );
    expect(pausedSignOutText(12)).toMatch(/^12 alterações ainda não foram enviadas/);
  });
});
