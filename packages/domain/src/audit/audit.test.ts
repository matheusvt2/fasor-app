import { describe, expect, it } from 'vitest';
import { sectionPosition } from '../relatorio/section-position.ts';
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
import { auditRunRowSchema, type AuditRunRow, type BlockRow, type EquipmentRow, type FileRow, type LocationRow } from '../schemas/entities.ts';
import { CTA, CTA_BLOCK, ctaRows, ctaState, E1, num, writeSheet, blockOf } from '../relatorio/measurement-test-support.ts';
import { sheetState, isEquipmentBlock } from '../relatorio/sheet-state.ts';
import { newEquipmentBlock } from '../relatorio/tree.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { AUDIT_INPUT_MAX_CHARS, AUDIT_TRUNCATED_MARKER, auditInput, auditRowLabel, type AuditRef } from './input.ts';
import { AUDIT_FINDING_KINDS } from './schema.ts';
import { auditCheckedAtText, auditCoverageText, auditDisplay, auditFindingRows, auditRunActive, auditSummaryText, AUDIT_FINDING_KIND_LABELS, AUDIT_RUN_EXPIRE_S, AUDIT_RUN_QUEUE_RETENTION_S } from './text.ts';
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
    coverage: null,
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
    // F43 (UX pass 2026-10-22): the audit's number is the one every screen speaks for that section.
    expect(sectionPosition(snapshot, 10)).toBe(9);
    expect(sectionPosition(snapshot, 11)).toBe(10);
    expect(sectionPosition(snapshot, 2)).toBeNull();
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

describe('review F-10 a row named by a placeholder first cell', () => {
  it('falls back to "linha N" when the first printed cell is only dashes or blank, and keeps a real first cell', () => {
    for (const dash of ['-', '–', '—', ' - ', '--', '', '   ']) {
      expect(auditRowLabel('Cabos de entrada CE-ENEL', dash, 2)).toBe('Cabos de entrada CE-ENEL · linha 3');
    }
    expect(auditRowLabel('Chave seccionadora SEC-TEST', 'Fase C', 5)).toBe('Chave seccionadora SEC-TEST · Fase C');
    expect(auditRowLabel('Chave seccionadora SEC-TEST', '-10', 0)).toBe('Chave seccionadora SEC-TEST · -10');
  });
});

describe('14.4 auditInput on a relatório with a site list (v4): the local parts are in the text', () => {
  const SITE_PHOTO_ID = '019966c1-0000-7000-8000-00000000f001';
  const EMERGENCIA = 'iluminacao_de_emergencia_autonomia_minima_de_2_h';
  const cell = (value: string) => ({ value, source_suggestion_id: null, op_id: '019966c1-0001-7000-8000-00000000f002' });

  /** The small fixture moved to v4: its one local answers two site items and holds a photo on one. */
  function v4Snapshot(): RelatorioSnapshot {
    const base = smallSnapshot();
    const [local] = base.locations;
    if (local === undefined || local.kind !== 'cabine') throw new Error('the small fixture holds one cabine');
    return {
      ...base,
      relatorio: { ...base.relatorio, seed_version: 'v4' },
      locations: [
        {
          ...local,
          checklist: {
            tapete_ou_estrado_isolante: { result: cell('C') },
            [EMERGENCIA]: { result: cell('NC'), observation: cell('Duas luminárias de emergência sem carga') },
          },
        },
      ],
      files: [
        {
          id: SITE_PHOTO_ID,
          relatorio_id: base.relatorio.id,
          kind: 'photo',
          sha256: 'ab',
          mime: 'image/jpeg',
          size: 1,
          uploaded_at: null,
          variants: null,
          removed_at: null,
          captured_at: '2026-09-06T10:00:00.000Z',
          tz_offset: -180,
          coords: null,
          local_seq: 1,
          block_id: null,
          location_id: local.id,
          item_key: EMERGENCIA,
          caption: 'Luminária de emergência sem carga',
          reading_kind: null,
          reading_target: null,
          reading_status: 'none',
          people_in_photo: false,
        },
      ],
    };
  }

  const snapshot = v4Snapshot();
  const input = auditInput(draft(snapshot), snapshot);
  const lines = input.text.split('\n');
  const section9 = lines.slice(lines.findIndex((line) => line.startsWith('[section:9] ')));

  it('sends the SE and AMBIENTE rows, the site table rows and the site photo line, under the local heading and before its sheets', () => {
    const at = (text: string) => section9.findIndex((line) => line.includes(text));
    const heading = at('Cabine de Testes');
    const firstSheet = section9.findIndex((line) => line.startsWith('[sheet:'));
    const inLocal = (text: string) => {
      const index = at(text);
      expect(index, text).toBeGreaterThan(heading);
      expect(index, text).toBeLessThan(firstSheet);
    };
    expect(heading).toBeGreaterThanOrEqual(0);
    inLocal('== CARACTERÍSTICAS DA SE ==');
    inLocal('ALVENARIA - CONVENCIONAL | 13,8 kV');
    inLocal('== AMBIENTE DE ENSAIO ==');
    inLocal('20 °C');
    inLocal('== VERIFICAÇÕES DO LOCAL ==');
    inLocal('# ÍTEM | C | NC | NA | OBSERVAÇÕES');
    inLocal('2. TAPETE OU ESTRADO ISOLANTE | X |  |  | ');
    inLocal('11. ILUMINAÇÃO DE EMERGÊNCIA (AUTONOMIA MÍNIMA DE 2 H) |  | X |  | Duas luminárias de emergência sem carga');
    inLocal(`[photo:${SITE_PHOTO_ID}] Imagem 1: Luminária de emergência sem carga.`);
    // An unanswered item holds no value: no line, as a sheet's empty row.
    expect(at('4. DETECTOR DE TENSÃO')).toBe(-1);
  });

  it('offers the site photo by its ref and no row ref for a row of the local, and no sheet repeats the cabine tables', () => {
    expect(input.refs.find((ref) => ref.id === `photo:${SITE_PHOTO_ID}`)).toEqual({ id: `photo:${SITE_PHOTO_ID}`, label: 'Imagem 1', target: { kind: 'photos' } });
    for (const ref of input.refs) expect(lines.some((line) => line.trimStart().startsWith(`[${ref.id}] `))).toBe(true);
    expect(lines.filter((line) => line.includes('CARACTERÍSTICAS DA SE'))).toHaveLength(1);
    expect(lines.filter((line) => line.includes('TAPETE OU ESTRADO ISOLANTE')).every((line) => !line.includes('[row:'))).toBe(true);
  });

  it('leaves the v1 text as it was: the same snapshot on its own seed carries no site table, and its cabine tables stay on a row ref of the first sheet', () => {
    const v1 = smallSnapshot();
    const text = auditInput(draft(v1), v1).text;
    expect(text).not.toContain('VERIFICAÇÕES DO LOCAL');
    expect(text.split('\n').some((line) => line.includes('[row:') && line.includes('ALVENARIA - CONVENCIONAL'))).toBe(true);
  });
});

describe('14.10-UNIT-001 auditInput sends the filled sheets first and counts the sheets it sent', () => {
  const base = smallSnapshot();
  const RELATORIO = base.relatorio.id;
  const LOCAL = '019966c1-0000-7000-8000-00000000c001';
  const PHOTO = '019966c1-0000-7000-8000-00000000c002';
  const FILLED_SEC = '019966c1-0000-7000-8000-00000000c003';
  const sheetId = (n: number) => `019966c1-0000-7000-8000-${(0xd000 + n).toString(16).padStart(12, '0')}`;
  const equipmentId = (n: number) => `019966c1-0000-7000-8000-${(0xe000 + n).toString(16).padStart(12, '0')}`;
  const TYPES: EquipmentBlockType[] = ['cabos_entrada', 'para_raio', 'chave_seccionadora', 'disjuntor_mt', 'tp', 'tc', 'cabos_saida', 'transformador_forca'];
  const CAPTION = 'Vista geral da chave de transferência automática CTA-APAGAR';

  const local: LocationRow = {
    id: LOCAL,
    relatorio_id: RELATORIO,
    parent_id: null,
    kind: 'cabine',
    name: 'Cabine Geral',
    order_key: 'a0',
    removed_at: null,
    se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
    env: { altitude_m: null, temperature_c: null, humidity_pct: null },
    agrupar_por_tipo: true,
  };

  /** The production case of 2026-10-15: 76 sheets on seed v5, 2 filled, the filled ones last in print order; a CTA tagged CTA-APAGAR with a captioned photo. */
  function productionSnapshot(): RelatorioSnapshot {
    const pairs: { block: BlockRow; equipment: EquipmentRow }[] = [];
    for (let n = 0; n < 74; n += 1) {
      const pair = newEquipmentBlock({ blockId: sheetId(n), equipmentId: equipmentId(n), relatorioId: RELATORIO, projectId: base.relatorio.project_id, locationId: LOCAL, type: TYPES[n % TYPES.length]!, tag: `EQ-${n}`, seedVersion: 'v5', orderKey: `a${n.toString().padStart(3, '0')}` });
      pairs.push(pair);
    }
    // A chave seccionadora with one observation, last of its type.
    const sec = newEquipmentBlock({ blockId: FILLED_SEC, equipmentId: equipmentId(900), relatorioId: RELATORIO, projectId: base.relatorio.project_id, locationId: LOCAL, type: 'chave_seccionadora', tag: 'SEC-ULTIMA', seedVersion: 'v5', orderKey: 'z0' });
    pairs.push({ ...sec, block: { ...sec.block, sheet: { ...sec.block.sheet, observations: { value: 'Contatos com sinais de aquecimento', source_suggestion_id: null, op_id: '019966c1-0001-7000-8000-00000000c010' } } } });
    // The CTA, filled through the fold, printed in the last group ("Outros equipamentos").
    const { state, f } = ctaState();
    const cta = blockOf(writeSheet(state, f, [{ test: E1, row: 'polo_a', col: 'lado_normal', value: num('38', 'µΩ') }]));
    pairs.push({ block: { ...cta, relatorio_id: RELATORIO, location_id: LOCAL, order_key: 'z1' }, equipment: { ...ctaRows({}, { tag: 'CTA-APAGAR' }).equipment, project_id: base.relatorio.project_id } });
    const photo: FileRow = {
      id: PHOTO,
      relatorio_id: RELATORIO,
      kind: 'photo',
      sha256: 'ab',
      mime: 'image/jpeg',
      size: 1,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      captured_at: '2026-10-15T10:00:00.000Z',
      tz_offset: -180,
      coords: null,
      local_seq: 1,
      block_id: CTA_BLOCK,
      location_id: null,
      item_key: null,
      caption: CAPTION,
      reading_kind: null,
      reading_target: null,
      reading_status: 'none',
      people_in_photo: false,
    } as FileRow;
    return {
      ...base,
      relatorio: { ...base.relatorio, seed_version: 'v5', export: { scheme: 'por_local_e_tipo' } },
      locations: [local],
      blocks: [...base.blocks.filter((block) => !isEquipmentBlock(block)), ...pairs.map((pair) => pair.block)],
      equipment: pairs.map((pair) => pair.equipment),
      files: [photo],
      points: [],
      suggestions: [],
    };
  }

  const snapshot = productionSnapshot();
  const layout = draft(snapshot);
  const whole = auditInput(layout, snapshot, Number.MAX_SAFE_INTEGER);
  const sheetLine = (text: string, blockId: string) => text.split('\n').find((line) => line.startsWith(`[sheet:${blockId}] `));
  // A cap that keeps the 20th sheet line out: what the fixed texts and the first sheets leave room for.
  const lines = whole.text.split('\n');
  const twentieth = lines.findIndex((line, index) => line.startsWith('[sheet:') && lines.slice(0, index).filter((l) => l.startsWith('[sheet:')).length === 19);
  const cap = lines.slice(0, twentieth).join('\n').length + AUDIT_TRUNCATED_MARKER.length + 1;
  const cut = auditInput(layout, snapshot, cap);

  it('the fixture is the production case: 76 sheets, 2 filled, the CTA and its photo', () => {
    const sheets = snapshot.blocks.filter(isEquipmentBlock);
    expect(sheets).toHaveLength(76);
    expect(sheets.filter((block) => sheetState(block) !== 'vazia').map((block) => block.id).sort()).toEqual([CTA_BLOCK, FILLED_SEC].sort());
    expect(snapshot.blocks.find((block) => block.id === CTA_BLOCK)?.block_type).toBe(CTA);
    expect(whole.truncated).toBe(false);
    expect(whole.sheetsSent).toBe(76);
    expect(whole.sheetsTotal).toBe(76);
  });

  it('sends both filled sheets and the photo inside the cut, and names the CTA on its sheet line as the caption does', () => {
    expect(cut.truncated).toBe(true);
    const ctaLine = sheetLine(cut.text, CTA_BLOCK);
    expect(ctaLine, 'the CTA sheet line is sent').toBeDefined();
    expect(ctaLine!.toLocaleLowerCase('pt-BR')).toContain('chave de transferência automática cta-apagar');
    expect(sheetLine(cut.text, FILLED_SEC)).toBeDefined();
    expect(cut.text).toContain(`[photo:${PHOTO}] `);
    expect(cut.refs.map((ref) => ref.id)).toEqual(expect.arrayContaining([`sheet:${CTA_BLOCK}`, `sheet:${FILLED_SEC}`, `photo:${PHOTO}`]));
    // The CTA's reading is in the text, on a row of its sheet.
    expect(cut.text.split('\n').some((line) => line.includes(`[row:${CTA_BLOCK}:`) && line.includes('38'))).toBe(true);
  });

  it('puts every empty sheet line after the filled ones, and counts the sent sheet lines of the 76', () => {
    const order = whole.text.split('\n').filter((line) => line.startsWith('[sheet:'));
    const filledAt = [order.findIndex((line) => line.startsWith(`[sheet:${FILLED_SEC}]`)), order.findIndex((line) => line.startsWith(`[sheet:${CTA_BLOCK}]`))];
    expect(Math.max(...filledAt)).toBe(1);
    expect(cut.sheetsTotal).toBe(76);
    expect(cut.sheetsSent).toBe(cut.text.split('\n').filter((line) => line.startsWith('[sheet:')).length);
    expect(cut.sheetsSent).toBe(19);
    expect(cut.text.endsWith(AUDIT_TRUNCATED_MARKER)).toBe(true);
  });

  it('under the cap the 12-sheet fixture is sent whole; a printed title that already reads as the screen label carries no suffix', () => {
    const small = smallSnapshot();
    const input = auditInput(draft(small), small);
    expect(input.truncated).toBe(false);
    expect(input.sheetsTotal).toBe(small.blocks.filter((block) => block.removed_at === null && isEquipmentBlock(block)).length);
    expect(input.sheetsSent).toBe(input.sheetsTotal);
    expect(sheetLine(input.text, BLOCK_CHAVE_ID)).toBe(`[sheet:${BLOCK_CHAVE_ID}] CHAVE SECCIONADORA SEC-TEST`);
  });

  it('a sheet holding only a captioned photo goes with the filled ones, not to the tail', () => {
    const bare = blockOf(ctaState().state);
    const photoOnly: RelatorioSnapshot = {
      ...snapshot,
      blocks: snapshot.blocks.map((block) => (block.id === CTA_BLOCK ? { ...bare, relatorio_id: RELATORIO, location_id: LOCAL, order_key: 'z1' } : block)),
    };
    expect(sheetState(photoOnly.blocks.find((block) => block.id === CTA_BLOCK)!)).toBe('vazia');
    const order = auditInput(draft(photoOnly), photoOnly, Number.MAX_SAFE_INTEGER)
      .text.split('\n')
      .filter((line) => line.startsWith('[sheet:'));
    expect(order.findIndex((line) => line.startsWith(`[sheet:${CTA_BLOCK}]`))).toBeLessThanOrEqual(1);
    const removed: RelatorioSnapshot = { ...photoOnly, files: photoOnly.files.map((file) => ({ ...file, removed_at: '2026-10-15T11:00:00.000Z' })) };
    const tail = auditInput(draft(removed), removed, Number.MAX_SAFE_INTEGER)
      .text.split('\n')
      .filter((line) => line.startsWith('[sheet:'));
    expect(tail.findIndex((line) => line.startsWith(`[sheet:${CTA_BLOCK}]`))).toBeGreaterThan(1);
  });

  it('every sheet line of the full fixture names its sheet as the screen does, beside the printed title when that differs', () => {
    const full = fullSnapshot();
    const input = auditInput(draft(full), full);
    const sheetRefs = input.refs.filter((ref) => ref.id.startsWith('sheet:'));
    expect(sheetRefs.length).toBeGreaterThan(0);
    for (const ref of sheetRefs) {
      const line = input.text.split('\n').find((candidate) => candidate.startsWith(`[${ref.id}] `))!;
      expect(line.toLocaleLowerCase('pt-BR')).toContain(ref.label.toLocaleLowerCase('pt-BR'));
      const title = line.slice(`[${ref.id}] `.length);
      if (title.endsWith(`(${ref.label})`)) expect(title.slice(0, -ref.label.length - 3).toLocaleLowerCase('pt-BR')).not.toBe(ref.label.toLocaleLowerCase('pt-BR'));
    }
  });

  it('a layout printing no sheet counts none', () => {
    const small = smallSnapshot();
    const bare: RelatorioSnapshot = { ...small, blocks: small.blocks.filter((block) => !isEquipmentBlock(block)), equipment: [], files: [], points: [], suggestions: [] };
    const input = auditInput(draft(bare), bare);
    expect(input.sheetsTotal).toBe(0);
    expect(input.sheetsSent).toBe(0);
  });
});

describe('14.10-UNIT-002 auditCoverageText', () => {
  it('says how many sheets the run read, agreeing the participle with N and the noun with M', () => {
    expect(auditCoverageText(run({ coverage: { sent: 1, total: 1 } }))).toBe('Conferida 1 de 1 ficha');
    expect(auditCoverageText(run({ coverage: { sent: 2, total: 76 } }))).toBe('Conferidas 2 de 76 fichas');
    expect(auditCoverageText(run({ coverage: { sent: 0, total: 3 } }))).toBe('Conferidas 0 de 3 fichas');
  });

  it('says nothing for a run with no coverage (older than contract 20), none printed, or not done', () => {
    expect(auditCoverageText(run())).toBe('');
    expect(auditCoverageText(run({ coverage: { sent: 0, total: 0 } }))).toBe('');
    expect(auditCoverageText(run({ status: 'running', coverage: { sent: 2, total: 76 } }))).toBe('');
    expect(auditCoverageText(null)).toBe('');
  });

  it('parses a stored run written before contract 20 with coverage null', () => {
    const old: Record<string, unknown> = { ...run() };
    delete old.coverage;
    expect(auditRunRowSchema.parse(old).coverage).toBeNull();
    expect(auditRunRowSchema.parse({ ...old, coverage: { sent: 2, total: 76 } }).coverage).toEqual({ sent: 2, total: 76 });
    expect(auditRunRowSchema.safeParse({ ...old, coverage: { sent: -1, total: 76 } }).success).toBe(false);
  });
});
