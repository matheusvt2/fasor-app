import { describe, expect, it } from 'vitest';
import type { RelatorioStatus } from '../schemas/entities.ts';
import {
  manualMove,
  RELATORIO_STATUSES,
  relatorioRemovalVerdict,
  statusCreateVerdict,
  statusLabel,
  statusMoveFacts,
  statusMoveVerdict,
  statusPillId,
  statusSeen,
  statusTable,
  STATUS_EVENTS,
  type StatusEvent,
  type StatusMoveInput,
} from './table.ts';

/*
 * Test 1.6-UNIT-001, first half (P1, risk R-015): the AD-22 table, table-driven over
 * every (state, event) pair, plus the manual backward move.
 */

const ALLOWED: ReadonlyArray<[RelatorioStatus, StatusEvent, RelatorioStatus]> = [
  ['rascunho', 'setup_complete', 'em_campo'],
  // 2026-10-10: field work and a generate also leave Rascunho.
  ['rascunho', 'edit', 'em_campo'],
  ['rascunho', 'generate', 'em_revisao'],
  ['em_campo', 'generate', 'em_revisao'],
  ['em_revisao', 'issue', 'emitido'],
  ['emitido', 'edit', 'em_revisao'],
  // 2026-10-13: a generate that builds a new revision of an Emitido relatório reopens it.
  ['emitido', 'generate', 'em_revisao'],
];

describe('statusTable', () => {
  it('board order is Rascunho, Em campo, Em revisão, Emitido', () => {
    expect(RELATORIO_STATUSES).toEqual(['rascunho', 'em_campo', 'em_revisao', 'emitido']);
  });

  for (const [state, event, next] of ALLOWED) {
    it(`${state} --${event}--> ${next}`, () => {
      expect(statusTable(state, event)).toBe(next);
    });
  }

  it('every other (state, event) pair has no transition', () => {
    const allowed = new Set(ALLOWED.map(([s, e]) => `${s}|${e}`));
    for (const state of RELATORIO_STATUSES) {
      for (const event of STATUS_EVENTS) {
        if (allowed.has(`${state}|${event}`)) continue;
        expect(statusTable(state, event), `${state} + ${event}`).toBeNull();
      }
    }
  });

  it('an edit after Emitido gives Em revisão, and an issue from Em campo does not skip', () => {
    expect(statusTable('emitido', 'edit')).toBe('em_revisao');
    expect(statusTable('em_campo', 'issue')).toBeNull();
  });

  it('2026-10-10: only Em revisão issues; an edit in Em campo or Em revisão moves nothing', () => {
    expect(statusTable('rascunho', 'issue')).toBeNull();
    expect(statusTable('em_campo', 'edit')).toBeNull();
    expect(statusTable('em_revisao', 'edit')).toBeNull();
    expect(statusTable('em_revisao', 'generate')).toBeNull();
  });

  it('2026-10-13: the sixteen cells, written out: seven transitions and nine nulls', () => {
    const cells = RELATORIO_STATUSES.map((state) => STATUS_EVENTS.map((event) => statusTable(state, event)));
    expect(cells).toEqual([
      // setup_complete, generate, issue, edit
      ['em_campo', 'em_revisao', null, 'em_campo'],
      [null, 'em_revisao', null, null],
      [null, null, 'emitido', null],
      [null, 'em_revisao', null, 'em_revisao'],
    ]);
  });

  it('a state or event outside the table returns null and never throws', () => {
    expect(statusTable('arquivado' as RelatorioStatus, 'edit')).toBeNull();
    expect(statusTable('em_campo', 'publish' as StatusEvent)).toBeNull();
  });
});

describe('manualMove', () => {
  it('allows a backward move from any state', () => {
    expect(manualMove('emitido', 'em_campo')).toBe('em_campo');
    expect(manualMove('emitido', 'rascunho')).toBe('rascunho');
    expect(manualMove('em_revisao', 'em_campo')).toBe('em_campo');
  });

  it('refuses a forward move and a move to the same state', () => {
    expect(manualMove('rascunho', 'emitido')).toBeNull();
    expect(manualMove('em_campo', 'em_revisao')).toBeNull();
    expect(manualMove('em_campo', 'em_campo')).toBeNull();
  });
});

describe('status vocabulary', () => {
  it('labels are the pt-BR words of the status pills', () => {
    expect(RELATORIO_STATUSES.map(statusLabel)).toEqual(['Rascunho', 'Em campo', 'Em revisão', 'Emitido']);
  });

  it('pill ids hyphenate the two-word states', () => {
    expect(RELATORIO_STATUSES.map(statusPillId)).toEqual(['rascunho', 'em-campo', 'em-revisao', 'emitido']);
  });
});

/*
 * Story 20.7 (contract 29, security pass S1): the server's check of a client status op. The
 * oracle below restates the Design Notes of `spec-e20s-server-rules.md` with AD-22's forward rows
 * written out by hand, and every (seen, server, to) triple is checked against it, with the job and
 * revision facts both absent and present.
 */
describe('statusMoveVerdict (Story 20.7)', () => {
  const FORWARD_ROWS: Readonly<Record<RelatorioStatus, readonly RelatorioStatus[]>> = {
    rascunho: ['em_campo', 'em_revisao'],
    em_campo: ['em_revisao'],
    em_revisao: ['emitido'],
    emitido: ['em_revisao'],
  };
  const index = (status: RelatorioStatus) => RELATORIO_STATUSES.indexOf(status);

  function oracle(input: StatusMoveInput): 'allowed' | 'refused' {
    const { seen, server, to } = input;
    if (index(to) < index(seen) && index(to) < index(server)) return 'allowed';
    if (to === server) return 'allowed';
    if (!FORWARD_ROWS[server].includes(to)) return 'refused';
    if (to === 'em_revisao' && (server === 'rascunho' || server === 'em_campo')) return input.issueJobSinceLastStatus === true || input.unchangedRevision === true ? 'allowed' : 'refused';
    if (to === 'emitido') return input.hasRevision === true ? 'allowed' : 'refused';
    return 'allowed';
  }

  const FACT_SETS = [
    {},
    { issueJobSinceLastStatus: true },
    { unchangedRevision: true },
    { hasRevision: true },
    { issueJobSinceLastStatus: false, unchangedRevision: false, hasRevision: false },
    { issueJobSinceLastStatus: true, unchangedRevision: true, hasRevision: true },
  ] as const;

  it('matches the rules over every (seen, server, to) triple and every fact set: 64 triples x 6', () => {
    let checked = 0;
    for (const seen of RELATORIO_STATUSES) {
      for (const server of RELATORIO_STATUSES) {
        for (const to of RELATORIO_STATUSES) {
          for (const facts of FACT_SETS) {
            const input = { seen, server, to, ...facts };
            expect(statusMoveVerdict(input), JSON.stringify(input)).toBe(oracle(input));
            checked++;
          }
        }
      }
    }
    expect(checked).toBe(64 * 6);
  });

  it('S1: a forged Emitido from Rascunho is refused with no fact, and with every fact', () => {
    expect(statusMoveVerdict({ seen: 'rascunho', server: 'rascunho', to: 'emitido' })).toBe('refused');
    expect(statusMoveVerdict({ seen: 'rascunho', server: 'rascunho', to: 'emitido', issueJobSinceLastStatus: true, unchangedRevision: true, hasRevision: true })).toBe('refused');
    expect(statusMoveVerdict({ seen: 'em_campo', server: 'em_campo', to: 'emitido', hasRevision: true })).toBe('refused');
  });

  it('S1: Em revisão from Rascunho or Em campo needs a generate queued since the last status op, or an unchanged revision', () => {
    for (const server of ['rascunho', 'em_campo'] as const) {
      expect(statusMoveVerdict({ seen: server, server, to: 'em_revisao' })).toBe('refused');
      expect(statusMoveVerdict({ seen: server, server, to: 'em_revisao', hasRevision: true })).toBe('refused');
      expect(statusMoveVerdict({ seen: server, server, to: 'em_revisao', issueJobSinceLastStatus: true })).toBe('allowed');
      expect(statusMoveVerdict({ seen: server, server, to: 'em_revisao', unchangedRevision: true })).toBe('allowed');
    }
  });

  it('Emitido needs the server at Em revisão and a revision ("Marcar como enviado ao cliente")', () => {
    expect(statusMoveVerdict({ seen: 'em_revisao', server: 'em_revisao', to: 'emitido', hasRevision: true })).toBe('allowed');
    expect(statusMoveVerdict({ seen: 'em_revisao', server: 'em_revisao', to: 'emitido', hasRevision: false })).toBe('refused');
    expect(statusMoveVerdict({ seen: 'em_revisao', server: 'em_campo', to: 'emitido', hasRevision: true })).toBe('refused');
  });

  it('the UI paths: setup complete, a first field value, an edit after Emitido and every backward move apply', () => {
    // "Concluir dados do relatório" and the edit emitter: Rascunho to Em campo needs nothing.
    expect(statusMoveVerdict({ seen: 'rascunho', server: 'rascunho', to: 'em_campo' })).toBe('allowed');
    // An edit after Emitido, and the Overflow's backward moves: back from what the device saw.
    expect(statusMoveVerdict({ seen: 'emitido', server: 'emitido', to: 'em_revisao' })).toBe('allowed');
    expect(statusMoveVerdict({ seen: 'em_revisao', server: 'em_revisao', to: 'em_campo' })).toBe('allowed');
    expect(statusMoveVerdict({ seen: 'em_campo', server: 'em_campo', to: 'rascunho' })).toBe('allowed');
    expect(statusMoveVerdict({ seen: 'emitido', server: 'emitido', to: 'rascunho' })).toBe('allowed');
    // The "Desfazer" of "Marcar como enviado ao cliente" steps back; the "Desfazer" of the reopening edit steps forward with a revision.
    expect(statusMoveVerdict({ seen: 'emitido', server: 'emitido', to: 'em_revisao' })).toBe('allowed');
    expect(statusMoveVerdict({ seen: 'em_revisao', server: 'em_revisao', to: 'emitido', hasRevision: true })).toBe('allowed');
  });

  it('an idempotent duplicate (two devices completing setup) is allowed', () => {
    expect(statusMoveVerdict({ seen: 'rascunho', server: 'em_campo', to: 'em_campo' })).toBe('allowed');
    expect(statusMoveVerdict({ seen: 'rascunho', server: 'emitido', to: 'emitido' })).toBe('allowed');
  });

  it('two devices with a stale status: the first-field edit of the device that still sees Rascunho is refused in either order', () => {
    // A marks the revision as sent first: the server holds Emitido when B's Em campo arrives.
    expect(statusMoveVerdict({ seen: 'em_revisao', server: 'em_revisao', to: 'emitido', hasRevision: true })).toBe('allowed');
    expect(statusMoveVerdict({ seen: 'rascunho', server: 'emitido', to: 'em_campo' })).toBe('refused');
    // B arrives first: the server holds Em revisão; B is refused, then A applies.
    expect(statusMoveVerdict({ seen: 'rascunho', server: 'em_revisao', to: 'em_campo' })).toBe('refused');
    expect(statusMoveVerdict({ seen: 'em_revisao', server: 'em_revisao', to: 'emitido', hasRevision: true })).toBe('allowed');
  });
});

describe('statusMoveVerdict, the seen status only narrows (e20f)', () => {
  it('a forged seen status gains nothing: once Emitido, now Rascunho, a put of Em revisão naming the old Emitido op is refused', () => {
    expect(statusMoveVerdict({ seen: 'emitido', server: 'rascunho', to: 'em_revisao' })).toBe('refused');
    expect(statusMoveVerdict({ seen: 'emitido', server: 'em_campo', to: 'em_revisao' })).toBe('refused');
    expect(statusMoveFacts({ seen: 'emitido', server: 'rascunho', to: 'em_revisao' })).toEqual(['issueJobSinceLastStatus', 'unchangedRevision']);
    // With a generate queued since the last status op it is the generate's own forward row.
    expect(statusMoveVerdict({ seen: 'emitido', server: 'rascunho', to: 'em_revisao', issueJobSinceLastStatus: true })).toBe('allowed');
  });

  it('a move backward from both the server and the device stays allowed (manual Voltar, the undo of a first edit)', () => {
    expect(statusMoveVerdict({ seen: 'em_campo', server: 'em_campo', to: 'rascunho' })).toBe('allowed');
    expect(statusMoveVerdict({ seen: 'em_revisao', server: 'emitido', to: 'em_campo' })).toBe('allowed');
    expect(statusMoveVerdict({ seen: 'emitido', server: 'em_revisao', to: 'rascunho' })).toBe('allowed');
  });
});

describe('statusMoveFacts (Story 20.7)', () => {
  it('names only the facts the verdict reads, so the server loads nothing else', () => {
    expect(statusMoveFacts({ seen: 'rascunho', server: 'rascunho', to: 'em_revisao' })).toEqual(['issueJobSinceLastStatus', 'unchangedRevision']);
    expect(statusMoveFacts({ seen: 'em_campo', server: 'em_campo', to: 'em_revisao' })).toEqual(['issueJobSinceLastStatus', 'unchangedRevision']);
    expect(statusMoveFacts({ seen: 'em_revisao', server: 'em_revisao', to: 'emitido' })).toEqual(['hasRevision']);
    expect(statusMoveFacts({ seen: 'rascunho', server: 'rascunho', to: 'em_campo' })).toEqual([]);
    expect(statusMoveFacts({ seen: 'emitido', server: 'emitido', to: 'em_revisao' })).toEqual([]);
    expect(statusMoveFacts({ seen: 'rascunho', server: 'rascunho', to: 'emitido' })).toEqual([]);
  });

  it('over every triple: with no fact named the verdict ignores the facts; with facts named, none true refuses and each one true allows', () => {
    for (const seen of RELATORIO_STATUSES) {
      for (const server of RELATORIO_STATUSES) {
        for (const to of RELATORIO_STATUSES) {
          const base = { seen, server, to };
          const facts = statusMoveFacts(base);
          const label = JSON.stringify(base);
          if (facts.length === 0) {
            expect(statusMoveVerdict({ ...base, issueJobSinceLastStatus: true, unchangedRevision: true, hasRevision: true }), label).toBe(statusMoveVerdict(base));
            continue;
          }
          expect(statusMoveVerdict(base), label).toBe('refused');
          for (const fact of facts) expect(statusMoveVerdict({ ...base, [fact]: true }), `${label} ${fact}`).toBe('allowed');
        }
      }
    }
  });
});

describe('statusSeen (Story 20.7)', () => {
  it('reads the value of the op prev_op_id names, and Rascunho with no prev_op_id', () => {
    expect(statusSeen({ prevOpId: null, logged: undefined })).toBe('rascunho');
    expect(statusSeen({ prevOpId: '019966c1-0000-7000-8000-000000000001', logged: 'emitido' })).toBe('emitido');
  });

  it('review: a prev_op_id the log does not hold (a refused status op) gives no basis, so the move is refused', () => {
    expect(statusSeen({ prevOpId: '019966c1-0000-7000-8000-000000000001', logged: undefined })).toBeNull();
    expect(statusSeen({ prevOpId: '019966c1-0000-7000-8000-000000000001', logged: 'arquivado' })).toBeNull();
    // The case: the server holds Emitido, refused a stale Em campo, and gets that op's "Desfazer" back to Rascunho.
    // With the server's status as the basis it would read as a backward move from Emitido and apply.
    expect(statusMoveVerdict({ seen: 'emitido', server: 'emitido', to: 'rascunho' })).toBe('allowed');
  });
});

describe('statusCreateVerdict (Story 20.7)', () => {
  it('S1: a relatório is born Rascunho; a create born in any other status is refused', () => {
    expect(statusCreateVerdict('rascunho')).toBe('allowed');
    for (const status of ['em_campo', 'em_revisao', 'emitido', 'arquivado', null]) expect(statusCreateVerdict(status), String(status)).toBe('refused');
  });
});

describe('relatorioRemovalVerdict (Story 20.10)', () => {
  it('refuses the removal of an Emitido relatório, allows it from any other status, and always allows the restore', () => {
    expect(relatorioRemovalVerdict('emitido', { kind: 'remove', value: null })).toBe('refused');
    expect(relatorioRemovalVerdict('emitido', { kind: 'put', value: '2026-11-03T12:00:00.000Z' })).toBe('refused');
    expect(relatorioRemovalVerdict('emitido', { kind: 'put', value: null })).toBe('allowed');
    for (const status of ['rascunho', 'em_campo', 'em_revisao'] as const) {
      expect(relatorioRemovalVerdict(status, { kind: 'remove', value: null }), status).toBe('allowed');
      expect(relatorioRemovalVerdict(status, { kind: 'put', value: '2026-11-03T12:00:00.000Z' }), status).toBe('allowed');
    }
  });
});
