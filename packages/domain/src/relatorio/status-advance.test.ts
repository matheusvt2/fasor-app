import { describe, expect, it } from 'vitest';
import { latestRevision } from '../print/revisions.ts';
import type { EditCandidate } from '../status/edited-since.ts';
import { advanceOnEdit, backwardMoveConsequenceText, backwardMoveLabel, issuedBannerText } from './status-advance.ts';

const BLOCK_ID = '019966b0-0080-7000-8000-000000000001';
const USER = '019966b0-0080-7000-8000-000000000002';

function editDraft(overrides: Partial<EditCandidate> = {}): EditCandidate {
  return { path: `block/${BLOCK_ID}/order_key`, actor_id: USER, kind: 'put', value: 'a1', ...overrides };
}

describe('4.6-UNIT advanceOnEdit', () => {
  it('appends the Em revisão transition once, for an edit on an Emitido relatório', () => {
    expect(advanceOnEdit('emitido', [editDraft()])).toBe('em_revisao');
  });

  it('does nothing for a non-Emitido status', () => {
    for (const status of ['rascunho', 'em_campo', 'em_revisao'] as const) {
      expect(advanceOnEdit(status, [editDraft()])).toBeNull();
    }
  });

  it('does nothing for a non-edit op', () => {
    expect(advanceOnEdit('emitido', [{ path: 'suggestion/019966b0-0080-7000-8000-000000000003/status', actor_id: USER, kind: 'put' }])).toBeNull();
    expect(advanceOnEdit('emitido', [{ path: 'relatorio/export/scheme', actor_id: USER, kind: 'put' }])).toBeNull();
  });

  it('does nothing when the batch already sets relatorio/status itself', () => {
    expect(advanceOnEdit('emitido', [editDraft(), { path: 'relatorio/status', actor_id: USER, kind: 'put' }])).toBeNull();
  });
});

describe('4.6-UNIT issuedBannerText / latestRevision', () => {
  it('names the issue date (dd/mm, no year, UX-DR11) and the next revision number', () => {
    expect(issuedBannerText('emitido', { number: 2, created_at: '2026-09-10T12:00:00Z' })).toBe(
      'Relatório emitido em 10/09 (revisão 2). Alterações geram a revisão 3.',
    );
    expect(issuedBannerText('em_revisao', { number: 2, created_at: '2026-09-10T12:00:00Z' })).toBe(
      'Relatório emitido em 10/09 (revisão 2). Alterações geram a revisão 3.',
    );
  });

  it('is null with no revision (an ordinary first Em campo → Em revisão pass)', () => {
    expect(issuedBannerText('em_revisao', null)).toBeNull();
  });

  it('is null once backed all the way to Em campo or Rascunho, even with a revision on record', () => {
    const revision = { number: 2, created_at: '2026-09-10T12:00:00Z' };
    expect(issuedBannerText('em_campo', revision)).toBeNull();
    expect(issuedBannerText('rascunho', revision)).toBeNull();
  });

  it('latestRevision picks the highest number', () => {
    const rows = [
      { id: 'r1', relatorio_id: 'x', number: 1, snapshot_seq: 1, created_by: USER, docx_file_id: 'd1', pdf_file_id: 'p1', created_at: '2026-09-01T00:00:00Z' },
      { id: 'r2', relatorio_id: 'x', number: 2, snapshot_seq: 2, created_by: USER, docx_file_id: 'd2', pdf_file_id: 'p2', created_at: '2026-09-10T00:00:00Z' },
    ];
    expect(latestRevision(rows)?.number).toBe(2);
    expect(latestRevision([])).toBeNull();
  });
});

describe('4.6-UNIT backwardMoveLabel / backwardMoveConsequenceText', () => {
  it('names the immediate previous status', () => {
    expect(backwardMoveLabel('em_revisao')).toEqual({ to: 'em_campo', label: 'Voltar para Em campo' });
    expect(backwardMoveLabel('em_campo')).toEqual({ to: 'rascunho', label: 'Voltar para Rascunho' });
    expect(backwardMoveLabel('emitido')).toEqual({ to: 'em_revisao', label: 'Voltar para Em revisão' });
  });

  it('carries no backward-move item at Rascunho', () => {
    expect(backwardMoveLabel('rascunho')).toBeNull();
  });

  it('states both statuses in the consequence sentence', () => {
    expect(backwardMoveConsequenceText('em_revisao', 'em_campo')).toBe(
      'O relatório volta de Em revisão para Em campo. Nada preenchido em campo é apagado.',
    );
  });
});
