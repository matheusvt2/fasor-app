import { describe, expect, it } from 'vitest';
import type { RelatorioStatus } from '../schemas/entities.ts';
import {
  manualMove,
  RELATORIO_STATUSES,
  statusLabel,
  statusPillId,
  statusTable,
  STATUS_EVENTS,
  type StatusEvent,
} from './table.ts';

/*
 * Test 1.6-UNIT-001, first half (P1, risk R-015): the AD-22 table, table-driven over
 * every (state, event) pair, plus the manual backward move.
 */

const ALLOWED: ReadonlyArray<[RelatorioStatus, StatusEvent, RelatorioStatus]> = [
  ['rascunho', 'setup_complete', 'em_campo'],
  ['em_campo', 'generate', 'em_revisao'],
  ['em_revisao', 'issue', 'emitido'],
  ['emitido', 'edit', 'em_revisao'],
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
