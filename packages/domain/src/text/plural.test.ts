import { describe, expect, it } from 'vitest';
import { isAutoPulled, statusLabel, statusTileLabel } from '../status/table.ts';
import { storageLine } from '../device/storage.ts';
import { pendingNotSentText, rejectedText, serverHoldsText, supersededText } from '../sync/counts.ts';
import { peopleCount, plural, relatoriosCount } from './plural.ts';

/*
 * Retro A7: the status words, count phrases and the auto-pull rule have one home, the
 * kernel. apps/web renders these results and writes no singular-or-plural choice itself.
 */

describe('plural and the count phrases', () => {
  it('picks the singular only for exactly one', () => {
    expect(plural(0, 'ficha', 'fichas')).toBe('0 fichas');
    expect(plural(1, 'ficha', 'fichas')).toBe('1 ficha');
    expect(plural(2, 'ficha', 'fichas')).toBe('2 fichas');
  });

  it('counts relatórios and people', () => {
    expect(relatoriosCount(1)).toBe('1 relatório');
    expect(relatoriosCount(3)).toBe('3 relatórios');
    expect(peopleCount(1)).toBe('1 pessoa da equipe');
    expect(peopleCount(0)).toBe('0 pessoas da equipe');
  });

  it('names a status tile with the live count', () => {
    expect(statusTileLabel('rascunho', 1)).toBe('Rascunho, 1 relatório');
    expect(statusTileLabel('em_revisao', 0)).toBe('Em revisão, 0 relatórios');
    expect(statusTileLabel('em_campo', 3)).toBe(`${statusLabel('em_campo')}, 3 relatórios`);
  });

  it('writes the Sync status rows and the recovery sentence', () => {
    expect(rejectedText(1)).toBe('1 alteração rejeitada');
    expect(rejectedText(4)).toBe('4 alterações rejeitadas');
    expect(supersededText(1)).toBe('1 alteração mesclada pelo servidor');
    expect(supersededText(2)).toBe('2 alterações mescladas pelo servidor');
    expect(serverHoldsText(3, 2)).toBe('O servidor tem 3 relatórios e 2 pessoas da equipe.');
    expect(serverHoldsText(1, 1)).toBe('O servidor tem 1 relatório e 1 pessoa da equipe.');
  });

  it('agrees the sign-out sentence with its count', () => {
    expect(pendingNotSentText('1 ficha', 1)).toBe(
      '1 ficha ainda não foi enviada. Ela continua neste aparelho e sobe quando você entrar de novo com conexão.',
    );
    expect(pendingNotSentText('3 fichas', 3)).toBe(
      '3 fichas ainda não foram enviadas. Elas continuam neste aparelho e sobem quando você entrar de novo com conexão.',
    );
  });

  it('keeps the storage line on the shared helper', () => {
    expect(storageLine({ usage_bytes: 1024, relatorios: 1, photos: 1 }).detail).toBe('· 1 relatório · 1 foto');
  });
});

describe('isAutoPulled (AD-8)', () => {
  it('pulls Rascunho and Em campo automatically, the rest only on open', () => {
    expect(isAutoPulled('rascunho')).toBe(true);
    expect(isAutoPulled('em_campo')).toBe(true);
    expect(isAutoPulled('em_revisao')).toBe(false);
    expect(isAutoPulled('emitido')).toBe(false);
  });
});
