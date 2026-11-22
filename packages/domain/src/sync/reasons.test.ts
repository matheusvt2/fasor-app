import { describe, expect, it } from 'vitest';
import { OP_REJECT_CODES } from '../contract/errors.ts';
import { CHAR_COUNT_FROM, charCountText, OP_FORBIDDEN_BY_ROLE, opRejectReasonText, rejectedText, rejectionCause } from './counts.ts';
import { systemRoleRow } from '../permissions/roles.ts';

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

describe('26.4-UNIT-001 rejectionCause: an op_forbidden the role explains', () => {
  const ID = '019966b0-0000-7000-8000-0000000000aa';
  const campo = systemRoleRow('engenheiro_de_campo');
  const forbidden = (path: string, value: unknown = null) => ({ error_code: 'op_forbidden', path, kind: 'put' as const, value });

  it('names the role when the viewer\'s role lacks the op\'s key, with its own sentence', () => {
    expect(rejectionCause(forbidden(`registry/client/${ID}/name`, 'X'), campo)).toBe(OP_FORBIDDEN_BY_ROLE);
    expect(rejectionCause(forbidden(`template/${ID}/name`, 'X'), campo)).toBe(OP_FORBIDDEN_BY_ROLE);
    expect(rejectionCause(forbidden('relatorio/status', 'emitido'), campo)).toBe(OP_FORBIDDEN_BY_ROLE);
    // No role on this device yet: no key, so the role is the cause.
    expect(rejectionCause(forbidden(`template/${ID}/name`, 'X'), null)).toBe(OP_FORBIDDEN_BY_ROLE);
    expect(opRejectReasonText(OP_FORBIDDEN_BY_ROLE)).toBe('Alteração recusada: o seu papel não permite esta alteração. Fale com o administrador da empresa.');
    expect(opRejectReasonText(OP_FORBIDDEN_BY_ROLE)).not.toBe(opRejectReasonText('op_forbidden'));
  });

  it('keeps op_forbidden when the role holds the key (the Emitido removal, another user\'s row) and every other code as it came', () => {
    expect(rejectionCause(forbidden('relatorio/removed_at', null), systemRoleRow('admin'))).toBe('op_forbidden');
    expect(rejectionCause(forbidden(`user/${ID}/title`, 'X'), campo)).toBe('op_forbidden');
    expect(rejectionCause({ error_code: 'op_status_transition', path: 'relatorio/status', value: 'emitido' }, campo)).toBe('op_status_transition');
    expect(rejectionCause({ error_code: null, path: 'relatorio/status' }, campo)).toBeNull();
    expect(rejectionCause(forbidden('not/a/path'), campo)).toBe('op_forbidden');
  });

  it('e26r: an op that would reopen an issued relatório, refused for a role that does not issue, is the role\'s; a role that issues keeps op_forbidden', () => {
    expect(rejectionCause(forbidden(`sheet/${ID}/observations`, 'x'), campo)).toBe(OP_FORBIDDEN_BY_ROLE);
    expect(rejectionCause(forbidden('relatorio/status', 'em_revisao'), campo)).toBe(OP_FORBIDDEN_BY_ROLE);
    expect(rejectionCause(forbidden(`sheet/${ID}/observations`, 'x'), systemRoleRow('responsavel_tecnico'))).toBe('op_forbidden');
  });
});
