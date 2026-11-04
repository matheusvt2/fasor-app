import { describe, expect, it } from 'vitest';
import { OP_REJECT_CODES } from '../contract/errors.ts';
import { CHAR_COUNT_FROM, charCountText, opRejectReasonText, rejectedText } from './counts.ts';

/*
 * Stories 20.7 to 20.10 (contract 29): the sentence of each refusal a business rule gives, and
 * the counter under a capped text field (Story 20.9). Written red-first.
 */

describe('opRejectReasonText', () => {
  it('says why for each of the four new codes and op_forbidden, and nothing for a malformed op', () => {
    expect(opRejectReasonText('op_status_transition')).toBe('Mudança de status recusada: no servidor, o relatório já está em outro status.');
    expect(opRejectReasonText('op_attribution')).toBe('Alteração recusada: o autor ou a data não conferem com o servidor. Confira a data e a hora deste aparelho.');
    expect(opRejectReasonText('op_value_invalid')).toBe('Alteração recusada: um valor passa do tamanho ou do tipo que o campo aceita.');
    expect(opRejectReasonText('op_target_missing')).toBe('Alteração recusada: o item alterado não existe neste relatório no servidor.');
    // Review: `op_forbidden` also refuses a write to another user's own row, so its sentence names both.
    expect(opRejectReasonText('op_forbidden')).toBe('Alteração recusada: o servidor não permite esta alteração, como remover um relatório emitido ou mudar o cadastro de outra pessoa.');
    for (const code of ['op_invalid', 'op_path_unknown', 'op_server_only', 'op_tenant_mismatch', null, undefined, 'internal_error']) {
      expect(opRejectReasonText(code), String(code)).toBeNull();
    }
  });

  it('covers every contract-29 code of the reject enum', () => {
    const added = OP_REJECT_CODES.slice(OP_REJECT_CODES.indexOf('op_status_transition'));
    expect(added).toEqual(['op_status_transition', 'op_attribution', 'op_value_invalid', 'op_target_missing']);
    for (const code of added) expect(opRejectReasonText(code), code).not.toBeNull();
  });

  it('sits under the existing count: "1 alteração rejeitada"', () => {
    expect(rejectedText(1)).toBe('1 alteração rejeitada');
  });
});

describe('charCountText', () => {
  it('shows from 90 % of the cap, with the count and the cap grouped as pt-BR writes them', () => {
    expect(CHAR_COUNT_FROM).toBe(0.9);
    expect(charCountText(179, 200)).toBeNull();
    expect(charCountText(180, 200)).toBe('180 de 200 caracteres');
    expect(charCountText(200, 200)).toBe('200 de 200 caracteres');
    expect(charCountText(899, 1000)).toBeNull();
    expect(charCountText(900, 1000)).toBe('900 de 1.000 caracteres');
    expect(charCountText(20_000, 20_000)).toBe('20.000 de 20.000 caracteres');
    expect(charCountText(0, 0)).toBeNull();
  });
});
