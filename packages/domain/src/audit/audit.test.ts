import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { BLOCK_CHAVE_ID, portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { SERVER_DEVICE_ID } from '../ids.ts';
import type { Op } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { entityKey } from '../ops/apply.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { standardTemplate } from '../seed/template.ts';
import { layoutSpec } from '../print/layout.ts';
import { preIssue } from '../relatorio/pre-issue.ts';
import { progress } from '../relatorio/progress.ts';
import { sumarioRows } from '../relatorio/sumario.ts';
import type { AuditRunRow, BlockRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { AUDIT_INPUT_MAX_CHARS, AUDIT_TRUNCATED_MARKER, auditInput, type AuditRef } from './input.ts';
import { AUDIT_FINDING_KINDS } from './schema.ts';
import { auditCheckedAtText, auditDisplay, auditFindingRows, auditRunActive, auditSummaryText, AUDIT_FINDING_KIND_LABELS, AUDIT_RUN_EXPIRE_S, AUDIT_RUN_QUEUE_RETENTION_S } from './text.ts';
import { AUDIT_FINDING_MAX_CHARS, AUDIT_MAX_FINDINGS, validateAuditFindings } from './validate.ts';

/*
 * Story 13.8 (AI-3): the emission audit's kernel. The input is the print layout's text and
 * values with a ref per line the model may cite, capped; the validator keeps only findings
 * citing a ref that was sent; the rows and texts are composed here; and an `audit_run` row in
 * the store changes nothing the relatório derives (snapshot, layout, pre-issue, Sumário).
 */

const ISSUED_AT = '2026-10-07T12:00:00.000Z';
const RUN_ID = '019966c1-0000-7000-8000-00000000a0d1';

function smallSnapshot(): RelatorioSnapshot {
  return buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
}

function fullSnapshot(): RelatorioSnapshot {
  return buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
}

const draft = (snapshot: RelatorioSnapshot) => layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT, draft: true });

function run(over: Partial<AuditRunRow> = {}): AuditRunRow {
  return {
    id: RUN_ID,
    relatorio_id: portoSeguroSmall.relatorioId,
    status: 'done',
    findings: [],
    error: null,
    prompt_version: 'audit-1',
    created_at: '2026-10-07T14:30:00.000Z',
    started_at: '2026-10-07T14:30:01.000Z',
    finished_at: '2026-10-07T17:32:00.000Z',
    ...over,
  };
}

describe('13.8-UNIT-001 auditInput over the small fixture', () => {
  const snapshot = smallSnapshot();
  const input = auditInput(draft(snapshot), snapshot);
  const byId = new Map(input.refs.map((ref) => [ref.id, ref]));

  it('offers one section ref per printed section, named by its Sumário row and pointing at it', () => {
    const sections = input.refs.filter((ref) => ref.id.startsWith('section:'));
    expect(sections.map((ref) => ref.id).sort()).toEqual(Array.from({ length: 11 }, (_, i) => `section:${i + 1}`).sort());
    expect(byId.get('section:10')).toEqual({ id: 'section:10', label: 'Seção 10 · Conclusão e parecer', target: { kind: 'section', rowKey: 'section_10' } });
    expect(byId.get('section:9')?.target).toEqual({ kind: 'section', rowKey: 'section_9' });
  });

  it('offers each sheet by its type and TAG, opening the sheet', () => {
    expect(byId.get(`sheet:${BLOCK_CHAVE_ID}`)).toEqual({
      id: `sheet:${BLOCK_CHAVE_ID}`,
      label: 'Chave seccionadora SEC-TEST',
      target: { kind: 'sheet', blockId: BLOCK_CHAVE_ID },
    });
  });

  it('offers the rows of a sheet that hold a value, each named by the sheet and its first cell, opening the sheet', () => {
    const rows = input.refs.filter((ref) => ref.id.startsWith(`row:${BLOCK_CHAVE_ID}:`));
    expect(rows.length).toBeGreaterThan(3);
    for (const ref of rows) {
      expect(ref.id).toMatch(new RegExp(`^row:${BLOCK_CHAVE_ID}:\\d+:\\d+$`));
      expect(ref.label.startsWith('Chave seccionadora SEC-TEST · ')).toBe(true);
      expect(ref.target).toEqual({ kind: 'sheet', blockId: BLOCK_CHAVE_ID });
    }
    // The contact resistance readings of the fixture are in the text, on a row the model can cite.
    const reading = input.text.split('\n').find((line) => line.includes(`[row:${BLOCK_CHAVE_ID}:`) && line.includes('150'));
    expect(reading).toBeDefined();
  });

  it('writes every ref it offers at the head of a line of the text, in brackets', () => {
    const lines = input.text.split('\n');
    for (const ref of input.refs) expect(lines.some((line) => line.trimStart().startsWith(`[${ref.id}] `))).toBe(true);
  });

  it('sends the parecer, photos and points first, then the sheets, then the fixed texts, so a cut text keeps the parecer', () => {
    const at = (id: string) => input.text.indexOf(`[${id}] `);
    const order = ['section:10', 'section:8', 'section:7', 'section:11', 'section:9', 'section:1', 'section:2', 'section:3', 'section:4', 'section:5', 'section:6'];
    for (const id of order) expect(at(id)).toBeGreaterThanOrEqual(0);
    expect([...order].sort((a, b) => at(a) - at(b))).toEqual(order);
    expect(input.text).toContain('PARECER: ');
  });

  it('is deterministic and not truncated under the cap', () => {
    expect(auditInput(draft(snapshot), snapshot)).toEqual(input);
    expect(input.truncated).toBe(false);
    expect(input.text.length).toBeLessThanOrEqual(AUDIT_INPUT_MAX_CHARS);
  });
});

describe('13.8-UNIT-006 section refs when the printed numbering differs from FO.SERV-03', () => {
  it('names a printed section by its own Sumário row: with section 2 removed, the printed section 9 is the parecer', () => {
    const state = new Map(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }));
    let n = 0;
    const { drafts } = instantiateTemplate(
      standardTemplate({ id: '019966c1-000d-7000-8000-000000000001' }),
      { id: portoSeguroSmall.projectId },
      { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null },
      { newId: () => `019966c1-000c-7000-8000-${(++n).toString(16).padStart(12, '0')}`, actorId: portoSeguroSmall.userId, companyId: portoSeguroSmall.companyId },
    );
    const sections = drafts
      .filter((draft) => draft.path.startsWith('block/'))
      .map((draft) => draft.value as unknown as BlockRow)
      .filter((block) => block.location_id === null && block.block_type !== 'section_2')
      .map((block) => ({ ...block, relatorio_id: portoSeguroSmall.relatorioId }));
    expect(sections).toHaveLength(10);
    for (const block of sections) state.set(entityKey('block', block.id), block);
    const snapshot = buildSnapshot(state, portoSeguroSmall.relatorioId);
    const input = auditInput(draft(snapshot), snapshot);
    const byId = new Map(input.refs.map((ref) => [ref.id, ref]));
    expect(byId.get('section:9')).toEqual({ id: 'section:9', label: 'Seção 9 · Conclusão e parecer', target: { kind: 'section', rowKey: 'section_10' } });
    expect(byId.get('section:8')?.target).toEqual({ kind: 'section', rowKey: 'section_9' });
    expect(byId.has('section:11')).toBe(false);
    // The parecer is sent first, under its printed number.
    expect(input.text.startsWith('[section:9] 9 ')).toBe(true);
    expect(input.text.split('\n')[1]).toMatch(/^PARECER: /);
  });
});

describe('13.8-UNIT-002 auditInput over the full fixture: photos, no file key, the cap', () => {
  const snapshot = fullSnapshot();
  const layout = draft(snapshot);
  const input = auditInput(layout, snapshot);

  it('offers each photo once as "Imagem N", opening the gallery', () => {
    const photos = input.refs.filter((ref) => ref.id.startsWith('photo:'));
    expect(photos.length).toBeGreaterThan(0);
    expect(new Set(photos.map((ref) => ref.id)).size).toBe(photos.length);
    for (const ref of photos) {
      expect(ref.label).toMatch(/^Imagem \d+$/);
      expect(ref.target).toEqual({ kind: 'photos' });
    }
  });

  it('carries no image, file key or URL: a file id appears only inside its photo ref', () => {
    expect(input.text).not.toMatch(/https?:|data:image|\.jpe?g|\.png|\.pdf|s3:/i);
    // An object key or a URL would carry the file id; outside its own ref no file id is written.
    for (const file of snapshot.files) {
      const outside = input.text.split(`[photo:${file.id}]`).join('');
      expect(outside).not.toContain(file.id);
    }
    const logo = snapshot.empresa?.logo_file_id ?? null;
    if (logo !== null) expect(input.text).not.toContain(logo);
  });

  it('caps the text with the marker and offers only the refs whose line was sent', () => {
    const cut = auditInput(layout, snapshot, 4000);
    expect(cut.truncated).toBe(true);
    expect(cut.text.length).toBeLessThanOrEqual(4000);
    expect(cut.text.endsWith(AUDIT_TRUNCATED_MARKER)).toBe(true);
    for (const ref of cut.refs) expect(cut.text).toContain(`[${ref.id}]`);
    expect(cut.refs.length).toBeLessThan(input.refs.length);
    // The parecer section is never the part cut first.
    expect(cut.text).toContain('[section:10]');
    // At the default cap the full fixture stays inside it.
    expect(input.text.length).toBeLessThanOrEqual(AUDIT_INPUT_MAX_CHARS);
  });
});

describe('13.8-UNIT-003 validateAuditFindings', () => {
  const refs: AuditRef[] = [
    { id: 'section:10', label: 'Seção 10 · Conclusão e parecer', target: { kind: 'section', rowKey: 'section_10' } },
    { id: `sheet:${BLOCK_CHAVE_ID}`, label: 'Chave seccionadora SEC-TEST', target: { kind: 'sheet', blockId: BLOCK_CHAVE_ID } },
  ];

  it('keeps a finding citing a ref it was sent, with the kernel label and target, its text trimmed to one line', () => {
    const { kept, dropped } = validateAuditFindings([{ kind: 'parecer_vs_restricoes', ref: ' section:10 ', text: '  O parecer\nnão cita a restrição.  ' }], refs);
    expect(dropped).toEqual([]);
    expect(kept).toEqual([
      { kind: 'parecer_vs_restricoes', ref: 'section:10', text: 'O parecer não cita a restrição.', label: 'Seção 10 · Conclusão e parecer', target: { kind: 'section', rowKey: 'section_10' } },
    ]);
  });

  it('drops a ref not sent, an unknown kind, an empty or over-long text and a non-object, and counts each', () => {
    const { kept, dropped } = validateAuditFindings(
      [
        { kind: 'conclusion_vs_nc', ref: 'sheet:019966c1-0000-7000-8000-000000009999', text: 'Inventado.' },
        { kind: 'rewrite', ref: 'section:10', text: 'Reescreva.' },
        { kind: 'conclusion_vs_nc', ref: `sheet:${BLOCK_CHAVE_ID}`, text: '   ' },
        { kind: 'conclusion_vs_nc', ref: `sheet:${BLOCK_CHAVE_ID}`, text: 'x'.repeat(AUDIT_FINDING_MAX_CHARS + 1) },
        'not an object',
        { kind: 'conclusion_vs_nc', ref: `sheet:${BLOCK_CHAVE_ID}`, text: 'A conclusão aprova com um item NC.' },
      ],
      refs,
    );
    expect(kept.map((finding) => finding.ref)).toEqual([`sheet:${BLOCK_CHAVE_ID}`]);
    expect(dropped).toEqual([
      { index: 0, reason: 'unknown_ref' },
      { index: 1, reason: 'unknown_kind' },
      { index: 2, reason: 'empty_text' },
      { index: 3, reason: 'text_too_long' },
      { index: 4, reason: 'not_an_object' },
    ]);
  });

  it('keeps at most AUDIT_MAX_FINDINGS and refuses an answer that is not a list', () => {
    const many = Array.from({ length: AUDIT_MAX_FINDINGS + 2 }, () => ({ kind: 'parecer_vs_restricoes', ref: 'section:10', text: 'Ponto.' }));
    const { kept, dropped } = validateAuditFindings(many, refs);
    expect(kept).toHaveLength(AUDIT_MAX_FINDINGS);
    expect(dropped.map((entry) => entry.reason)).toEqual(['over_limit', 'over_limit']);
    expect(validateAuditFindings({ findings: [] }, refs)).toEqual({ kept: [], dropped: [{ index: -1, reason: 'not_a_list' }] });
  });

  it('names the four kinds and a label for each', () => {
    expect([...AUDIT_FINDING_KINDS]).toEqual(['conclusion_vs_nc', 'reading_out_of_family', 'parecer_vs_restricoes', 'caption_equipment']);
    for (const kind of AUDIT_FINDING_KINDS) expect(AUDIT_FINDING_KIND_LABELS[kind]).toMatch(/\S/);
  });
});

describe('13.8-UNIT-004 the rows and texts of a run', () => {
  const finding = { kind: 'reading_out_of_family' as const, text: 'A fase C está muito acima das outras.', ref: `row:${BLOCK_CHAVE_ID}:5:3`, label: 'Chave seccionadora SEC-TEST · Fase C', target: { kind: 'sheet' as const, blockId: BLOCK_CHAVE_ID } };

  it('lists a done run as rows: kind label, target label, the sentence and where "Ver" goes', () => {
    expect(auditFindingRows(run({ findings: [finding] }))).toEqual([
      { key: `${RUN_ID}:0`, kindLabel: 'Leitura fora do padrão', targetLabel: 'Chave seccionadora SEC-TEST · Fase C', text: finding.text, target: finding.target },
    ]);
    expect(auditFindingRows(run({ status: 'running', findings: [finding] }))).toEqual([]);
    expect(auditFindingRows(null)).toEqual([]);
  });

  it('counts the findings, says when there is none, and says when it was checked (São Paulo time)', () => {
    expect(auditSummaryText(run())).toBe('Nenhum ponto encontrado');
    expect(auditSummaryText(run({ findings: [finding] }))).toBe('1 ponto para conferir');
    expect(auditSummaryText(run({ findings: [finding, finding, finding] }))).toBe('3 pontos para conferir');
    expect(auditSummaryText(run({ status: 'failed' }))).toBe('');
    expect(auditCheckedAtText(run())).toBe('Conferido às 14:32');
    expect(auditCheckedAtText(run({ finished_at: null }))).toBe('');
    expect(auditCheckedAtText(run({ status: 'queued' }))).toBe('');
  });

  it('reads a queued or running run as active only within the audit queue ages, then as failed', () => {
    const queued = run({ status: 'queued', created_at: '2026-10-07T12:00:00.000Z', started_at: null, finished_at: null });
    expect(auditRunActive(queued, '2026-10-07T12:00:10.000Z')).toBe(true);
    expect(auditRunActive(queued, new Date(Date.parse(queued.created_at) + AUDIT_RUN_QUEUE_RETENTION_S * 1000 + 1).toISOString())).toBe(false);
    const running = run({ status: 'running', started_at: '2026-10-07T12:00:00.000Z', finished_at: null });
    expect(auditRunActive(running, '2026-10-07T12:01:00.000Z')).toBe(true);
    expect(auditRunActive(running, new Date(Date.parse('2026-10-07T12:00:00.000Z') + AUDIT_RUN_EXPIRE_S * 1000 + 1).toISOString())).toBe(false);

    const older = run({ id: '019966c1-0000-7000-8000-00000000a0d0', created_at: '2026-10-07T11:00:00.000Z', findings: [finding] });
    const stale = { ...running, created_at: '2026-10-07T12:00:00.000Z' };
    expect(auditDisplay([older, stale], '2026-10-07T12:01:00.000Z')).toEqual({ active: stale, failed: false, done: older });
    expect(auditDisplay([older, stale], '2026-10-07T13:00:00.000Z')).toEqual({ active: null, failed: true, done: older });
    expect(auditDisplay([older], '2026-10-07T13:00:00.000Z')).toEqual({ active: null, failed: false, done: older });
    expect(auditDisplay([], '2026-10-07T13:00:00.000Z')).toEqual({ active: null, failed: false, done: null });
  });
});

describe('13.8-UNIT-005 an audit_run in the store changes nothing the relatório derives', () => {
  it('leaves the snapshot, the layout, the pre-issue rows and the Sumário rows equal', () => {
    const withoutState = replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds });
    const auditOps: Op[] = [
      {
        op_id: '019966c1-0001-7000-8000-00000000a0d1',
        kind: 'create',
        scope: 'relatorio',
        company_id: portoSeguroSmall.companyId,
        project_id: null,
        relatorio_id: portoSeguroSmall.relatorioId,
        path: `audit_run/${RUN_ID}`,
        value: { id: RUN_ID, relatorio_id: portoSeguroSmall.relatorioId, status: 'queued', findings: [], error: null, prompt_version: null, created_at: ISSUED_AT, started_at: null, finished_at: null },
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: 'system:audit',
        device_id: SERVER_DEVICE_ID,
        client_ts: ISSUED_AT,
      },
      {
        op_id: '019966c1-0001-7000-8000-00000000a0d2',
        kind: 'put',
        scope: 'relatorio',
        company_id: portoSeguroSmall.companyId,
        project_id: null,
        relatorio_id: portoSeguroSmall.relatorioId,
        path: `audit_run/${RUN_ID}/findings`,
        value: [{ kind: 'conclusion_vs_nc', text: 'A conclusão aprova com um item NC.', ref: `sheet:${BLOCK_CHAVE_ID}`, label: 'Chave seccionadora SEC-TEST', target: { kind: 'sheet', blockId: BLOCK_CHAVE_ID } }],
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: 'system:audit',
        device_id: SERVER_DEVICE_ID,
        client_ts: ISSUED_AT,
      },
    ];
    const withState = replay([...portoSeguroSmall.log, ...auditOps], { deadOpIds: portoSeguroSmall.deadOpIds });
    expect([...withState.keys()].some((key) => key.startsWith('audit_run:'))).toBe(true);

    const without = buildSnapshot(withoutState, portoSeguroSmall.relatorioId);
    const withRun = buildSnapshot(withState, portoSeguroSmall.relatorioId);
    expect(withRun).toEqual(without);
    expect(draft(withRun)).toEqual(draft(without));
    expect(layoutSpec(withRun, { revisionNumber: 2, issuedAt: ISSUED_AT })).toEqual(layoutSpec(without, { revisionNumber: 2, issuedAt: ISSUED_AT }));
    const now = new Date(ISSUED_AT);
    const issuesWith = preIssue(withRun, progress(withRun), { now });
    const issuesWithout = preIssue(without, progress(without), { now });
    expect(issuesWith).toEqual(issuesWithout);
    expect(sumarioRows(withRun, issuesWith, progress(withRun))).toEqual(sumarioRows(without, issuesWithout, progress(without)));
  });
});
