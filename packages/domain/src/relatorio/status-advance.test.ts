import { describe, expect, it } from 'vitest';
import { latestRevision } from '../print/revisions.ts';
import type { EditCandidate } from '../status/edited-since.ts';
import { advanceOnEdit, backwardMoveConsequenceText, backwardMoveLabel, fichaIssuedBannerText, issuedBannerText, statusChangeToastText } from './status-advance.ts';

const BLOCK_ID = '019966b0-0080-7000-8000-000000000001';
const USER = '019966b0-0080-7000-8000-000000000002';

function editDraft(overrides: Partial<EditCandidate> = {}): EditCandidate {
  return { path: `block/${BLOCK_ID}/order_key`, actor_id: USER, kind: 'put', value: 'a1', ...overrides };
}

describe('4.6-UNIT advanceOnEdit', () => {
  it('appends the Em revisão transition once, for an edit on an Emitido relatório', () => {
    expect(advanceOnEdit('emitido', [editDraft()])).toBe('em_revisao');
  });

  it('does nothing in Em campo or Em revisão', () => {
    for (const status of ['em_campo', 'em_revisao'] as const) {
      expect(advanceOnEdit(status, [editDraft()])).toBeNull();
    }
  });

  const ID = '019966b0-0080-7000-8000-000000000009';

  it('2026-10-10 decision 3: field content moves Rascunho to Em campo', () => {
    const content: EditCandidate[] = [
      editDraft({ path: `sheet/${BLOCK_ID}/observations` }),
      editDraft({ path: `sheet/${BLOCK_ID}/nameplate/n_serie` }),
      editDraft({ path: `location/${ID}/se/primary_kv` }),
      editDraft({ path: `location/${ID}/env/temperature_c` }),
      editDraft({ path: `point/${ID}/text` }),
      editDraft({ path: `block/${BLOCK_ID}/not_tested` }),
      { path: `file/${ID}`, actor_id: USER, kind: 'create', value: { kind: 'photo' } },
      { path: `point/${ID}`, actor_id: USER, kind: 'create', value: {} },
    ];
    for (const draft of content) expect(advanceOnEdit('rascunho', [draft]), draft.path).toBe('em_campo');
  });

  it('2026-10-10 decision 3: structure keeps Rascunho, and still reopens an Emitido relatório', () => {
    const structure: EditCandidate[] = [
      editDraft({ path: `block/${BLOCK_ID}/order_key` }),
      editDraft({ path: `block/${BLOCK_ID}/removed_at` }),
      editDraft({ path: `block/${BLOCK_ID}/location_id` }),
      editDraft({ path: `block/${BLOCK_ID}/config` }),
      editDraft({ path: `location/${ID}/name` }),
      editDraft({ path: `location/${ID}/order_key` }),
      editDraft({ path: `location/${ID}/agrupar_por_tipo` }),
      editDraft({ path: `equipment/${ID}/tag` }),
      { path: `block/${ID}`, actor_id: USER, kind: 'create', value: {} },
      { path: `location/${ID}`, actor_id: USER, kind: 'create', value: {} },
      { path: `equipment/${ID}`, actor_id: USER, kind: 'create', value: {} },
    ];
    for (const draft of structure) {
      expect(advanceOnEdit('rascunho', [draft]), draft.path).toBeNull();
      expect(advanceOnEdit('emitido', [draft]), draft.path).toBe('em_revisao');
    }
    // A sheet created with a value in the same batch is content.
    expect(advanceOnEdit('rascunho', [structure[8]!, editDraft({ path: `sheet/${BLOCK_ID}/observations` })])).toBe('em_campo');
  });

  it('2026-10-10 decision 1: a relatorio/setup edit keeps Rascunho, and still reopens an Emitido relatório', () => {
    const setup = editDraft({ path: 'relatorio/setup/local' });
    expect(advanceOnEdit('rascunho', [setup])).toBeNull();
    expect(advanceOnEdit('rascunho', [setup, editDraft({ path: `sheet/${BLOCK_ID}/observations` })])).toBe('em_campo');
    expect(advanceOnEdit('emitido', [setup])).toBe('em_revisao');
  });

  it('a non-photo file and a system op are not field work', () => {
    expect(advanceOnEdit('rascunho', [{ path: `file/${ID}`, actor_id: USER, kind: 'create', value: { kind: 'certificate' } }])).toBeNull();
    expect(advanceOnEdit('rascunho', [editDraft({ path: `sheet/${BLOCK_ID}/observations`, actor_id: 'system:files' })])).toBeNull();
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
  });

  it('2026-10-10: Em revisão says the revision was generated and not yet sent, never "emitido"', () => {
    const revision = { number: 2, created_at: '2026-09-10T12:00:00Z' };
    expect(issuedBannerText('em_revisao', revision)).toBe('Revisão 2 gerada em 10/09, ainda não enviada ao cliente.');
    expect(issuedBannerText('em_revisao', revision, true)).toBe('Há alterações desde a revisão 2 (10/09). Elas entram na revisão 3.');
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

describe('2026-10-10 fichaIssuedBannerText', () => {
  it('says that editing reopens an Emitido relatório as Em revisão and generates the next revision', () => {
    expect(fichaIssuedBannerText('emitido', { number: 1 })).toBe(
      'Relatório emitido (revisão 1). Editar esta ficha reabre o relatório como Em revisão e gera a revisão 2.',
    );
  });

  it('is null in every other status and with no revision', () => {
    for (const status of ['rascunho', 'em_campo', 'em_revisao'] as const) expect(fichaIssuedBannerText(status, { number: 1 })).toBeNull();
    expect(fichaIssuedBannerText('emitido', null)).toBeNull();
  });
});

describe('2026-10-10 statusChangeToastText', () => {
  type Change = Parameters<typeof statusChangeToastText>[0];
  const change = (from: Change['from'], to: Change['to'], cause: Change['cause'] = 'action', latestNumber: number | null = null) =>
    statusChangeToastText({ from, to, cause, latestNumber });

  it('says every forward move', () => {
    expect(change('rascunho', 'em_campo', 'edit')).toBe('Relatório em campo');
    expect(change('rascunho', 'em_campo')).toBe('Relatório em campo');
    expect(change('rascunho', 'em_revisao')).toBe('Relatório em revisão');
    expect(change('em_campo', 'em_revisao')).toBe('Relatório em revisão');
    expect(change('em_revisao', 'emitido', 'action', 2)).toBe('Revisão 2 marcada como enviada ao cliente. Relatório emitido.');
    expect(change('em_revisao', 'emitido')).toBe('Relatório emitido');
  });

  it('an edit after Emitido says it reopened and names the next revision', () => {
    expect(change('emitido', 'em_revisao', 'edit', 1)).toBe('Relatório reaberto em revisão. A próxima emissão gera a revisão 2.');
    expect(change('emitido', 'em_revisao', 'edit')).toBe('Relatório reaberto em revisão');
  });

  it('a manual backward move names the status it went back to', () => {
    expect(change('emitido', 'em_revisao', 'action', 1)).toBe('Relatório voltou para Em revisão');
    expect(change('em_revisao', 'em_campo')).toBe('Relatório voltou para Em campo');
    expect(change('em_campo', 'rascunho')).toBe('Relatório voltou para Rascunho');
  });

  it('an undo names the status it put back, never a mark-as-sent', () => {
    expect(change('em_revisao', 'emitido', 'undo', 1)).toBe('Relatório voltou para Emitido');
    expect(change('em_campo', 'rascunho', 'undo')).toBe('Relatório voltou para Rascunho');
  });

  it('says nothing when the status did not change, nor for a status it has no sentence for', () => {
    expect(change('em_campo', 'em_campo')).toBeNull();
    expect(change('em_campo', 'arquivado' as Change['to'])).toBeNull();
    expect(change('rascunho', 'arquivado' as Change['to'], 'edit')).toBeNull();
  });
});
