import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import type { InstrumentRow } from '../registry/instrument-row.ts';
import type { BlockRow, Cell, RelatorioParecer, SuggestionRow, UserRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from './instantiate.ts';
import { blockingRows, exportPrecheck, parecerMissingReason, preIssue, preIssueRowsFor, type PreIssueRow } from './pre-issue.ts';
import { isEquipmentBlock } from './sheet-state.ts';
import { restorableBlocks, sumarioRows } from './sumario.ts';
import { progress } from './progress.ts';

/*
 * Story 7.5 AC1 (and the carry-over rows): the rows `preIssue` closes the list with, the one
 * blocking row, the Export dialog's view of them (`exportPrecheck`) and the Sumário's row 10.
 */

const TEMPLATE_ID = '019966b0-0081-7000-8000-000000000001';
const AT = '2026-09-08T12:00:00.000Z';
const NOW = new Date('2026-09-26T12:00:00.000Z');

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: TEMPLATE_ID }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId: idSequence('019966b0-0082-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0083-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

const cell = (value: Cell['value']): Cell => ({ value, source_suggestion_id: null, op_id: '019966b0-0084-7000-8000-000000000001' });
const PARECER: RelatorioParecer = { verdict: 'apto', text: null, text_status: null, text_basis: null };

function withSetup(snapshot: RelatorioSnapshot, setup: Partial<RelatorioSnapshot['relatorio']['setup']>): RelatorioSnapshot {
  return { ...snapshot, relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, ...setup } } };
}

function instrument(overrides: Partial<InstrumentRow>): InstrumentRow {
  return {
    id: '019966b0-0085-7000-8000-000000000001',
    kind: 'instrument',
    code: 'MEG-01',
    name: 'Megôhmetro',
    manufacturer: null,
    model: null,
    serial: null,
    cert_number: null,
    laboratory: null,
    calibrated_at: '2025-09-01',
    calibration_interval_months: 12,
    rbc_accredited: null,
    test_isolacao: null,
    test_resistencia_contato: null,
    test_relacao_transformacao: null,
    certificate_file_id: '019966b0-0085-7000-8000-0000000000ff',
    removed_at: null,
    ...overrides,
  } as InstrumentRow;
}

const kinds = (rows: readonly PreIssueRow[]) => rows.map((row) => [row.kind, row.row, row.severity, row.text]);

describe('7.5-UNIT preIssue: the one blocking row', () => {
  it('"Parecer não preenchido" blocks on section 10 until a verdict is set, and is then gone', () => {
    const snapshot = fresh();
    expect(kinds(blockingRows(preIssue(snapshot, undefined, { now: NOW })))).toEqual([['parecer_missing', 'section_10', 'blocking', 'Parecer não preenchido']]);
    const set = withSetup(snapshot, { parecer: PARECER });
    expect(blockingRows(preIssue(set, undefined, { now: NOW }))).toEqual([]);
    // No other rule may block, whatever the state.
    expect(preIssue(snapshot, undefined, { now: NOW, rejected: 3 }).filter((r) => r.severity === 'blocking')).toHaveLength(1);
  });

  it('does not block when section 10 does not print (its block removed)', () => {
    const snapshot = fresh();
    const blocks = snapshot.blocks.map((b) => (b.block_type === 'section_10' ? { ...b, removed_at: AT } : b));
    expect(blockingRows(preIssue({ ...snapshot, blocks }, undefined, { now: NOW }))).toEqual([]);
  });

  it('blocks on a legacy snapshot with no section block at all (the seed\'s eleven print)', () => {
    const snapshot = fresh();
    const blocks = snapshot.blocks.filter((b) => isEquipmentBlock(b) || b.location_id !== null);
    expect(blocks.some((b) => b.block_type.startsWith('section_'))).toBe(false);
    expect(blockingRows(preIssue({ ...snapshot, blocks }, undefined, { now: NOW })).map((r) => r.kind)).toEqual(['parecer_missing']);
  });

  it('the Sumário row 10 names the blocking text, then the verdict word once set', () => {
    const snapshot = fresh();
    const row10 = (s: RelatorioSnapshot) => {
      const computed = progress(s);
      return sumarioRows(s, preIssue(s, computed, { now: NOW }), computed).find((r) => r.rowKey === 'section_10')!;
    };
    expect(row10(snapshot)).toMatchObject({ kind: 'setup', meta: 'Parecer não preenchido', blocking: true });
    expect(row10(withSetup(snapshot, { parecer: { ...PARECER, verdict: 'apto_com_restricoes' } }))).toMatchObject({ meta: 'Apto com restrições', blocking: false });
  });
});

describe('7.5-UNIT preIssue: the rows the story adds', () => {
  it('setup gaps from setupGaps: the registration and the council\'s ART/TRT on the cover, the instruments on section 11', () => {
    const responsible: UserRow = { id: TEST_USER, name: 'Ana', email: 'a@x', council: 'crea', registration_number: null, title: null, photo_location_enabled: false };
    const snapshot = { ...withSetup(fresh(), { responsible_user_id: TEST_USER, art_trt_number: null }), responsible };
    const rows = preIssue(snapshot, undefined, { now: NOW });
    expect(preIssueRowsFor(rows, 'capa').filter((r) => r.kind === 'setup_missing').map((r) => r.text)).toEqual([
      'Cliente em branco',
      'Registro profissional do responsável em branco',
      'Número da ART em branco',
    ]);
    expect(preIssueRowsFor(rows, 'section_11').map((r) => r.text)).toEqual(['Nenhum instrumento em Dados do relatório']);
    const crt = preIssue({ ...snapshot, responsible: { ...responsible, council: 'crt' } }, undefined, { now: NOW });
    expect(crt.some((r) => r.text === 'Número da TRT em branco')).toBe(true);
  });

  it('a concluded sheet with no printable conclusion text is pending on section 9', () => {
    const snapshot = fresh();
    let n = 0;
    const blocks = snapshot.blocks.map((b): BlockRow => {
      if (!isEquipmentBlock(b) || n++ >= 2) return b;
      return { ...b, concluded_by: { actor_id: TEST_USER, at: AT }, sheet: { ...b.sheet, conclusion: { result: cell('aprovado'), restriction: cell('sem_restricoes') } } };
    });
    const rows = preIssue({ ...snapshot, blocks }, undefined, { now: NOW });
    expect(rows.find((r) => r.kind === 'conclusion_unconfirmed')).toMatchObject({ row: 'section_9', severity: 'pending', text: '2 fichas concluídas sem texto de conclusão confirmado' });
    const confirmed = blocks.map((b, i): BlockRow =>
      b.concluded_by === null ? b : { ...b, sheet: { ...b.sheet, conclusion: { ...b.sheet.conclusion, text: cell(`Texto ${i}`), text_status: cell('confirmed') } } },
    );
    expect(preIssue({ ...snapshot, blocks: confirmed }, undefined, { now: NOW }).some((r) => r.kind === 'conclusion_unconfirmed')).toBe(false);
  });

  it('Story 8.6: sheets holding pending suggestions are one warning on section 9 that never blocks; removed blocks and confirmed rows do not count', () => {
    const snapshot = fresh();
    const equipment = snapshot.blocks.filter(isEquipmentBlock);
    const suggestion = (id: string, blockId: string, status: 'pending' | 'confirmed' = 'pending'): SuggestionRow => ({
      id,
      relatorio_id: snapshot.relatorio.id,
      target_path: `sheet/${blockId}/nameplate/fabricacao`,
      value: 'Celtta',
      trust: 'suggested',
      mode: 'fill',
      source: { photo_id: 'p', bbox: [0.1, 0.1, 0.2, 0.2], ocr_token_ids: ['t0'], reading_run_id: 'r' },
      status,
      prompt_version: 'test',
      hint: null,
    });
    const removed = equipment[3]!;
    const blocks = snapshot.blocks.map((b): BlockRow => (b.id === removed.id ? { ...b, removed_at: AT } : b));
    const pending = [
      suggestion('s1', equipment[0]!.id),
      suggestion('s2', equipment[0]!.id),
      suggestion('s3', equipment[1]!.id),
      suggestion('s4', equipment[2]!.id),
      suggestion('s5', equipment[2]!.id, 'confirmed'),
      suggestion('s6', removed.id),
    ];
    const rows = preIssue({ ...snapshot, blocks }, undefined, { now: NOW, pendingSuggestions: pending });
    expect(rows.find((r) => r.kind === 'suggestions_pending')).toMatchObject({ row: 'section_9', severity: 'pending', text: '3 fichas com sugestões por confirmar' });
    expect(exportPrecheck(rows).blocking.some((r) => r.kind === 'suggestions_pending')).toBe(false);
    expect(blockingRows(rows).some((r) => r.kind === 'suggestions_pending')).toBe(false);
    expect(preIssue({ ...snapshot, blocks }, undefined, { now: NOW }).some((r) => r.kind === 'suggestions_pending')).toBe(false);
  });

  it('calibration per instrument on section 11: expired pending, about to expire a warning; a missing certificate a warning', () => {
    const base = fresh();
    const snapshot = {
      ...base,
      // Checked at setup, so section 11 prints them (Story 7.3's `missingCertificates` reads only those).
      relatorio: { ...base.relatorio, setup: { ...base.relatorio.setup, instrument_ids: ['019966b0-0085-7000-8000-000000000001', '019966b0-0085-7000-8000-000000000002', '019966b0-0085-7000-8000-000000000003'] } },
      instruments: [
        instrument({ id: '019966b0-0085-7000-8000-000000000001', code: 'MEG-01', calibrated_at: '2025-08-01' }),
        instrument({ id: '019966b0-0085-7000-8000-000000000002', code: 'MIC-01', calibrated_at: '2025-09-20', certificate_file_id: null }),
        instrument({ id: '019966b0-0085-7000-8000-000000000003', code: 'TTR-01', calibrated_at: '2026-06-01' }),
      ],
    };
    const rows = preIssueRowsFor(preIssue(snapshot, undefined, { now: NOW }), 'section_11').filter((r) => r.kind !== 'setup_missing');
    expect(kinds(rows)).toEqual([
      ['calibration', 'section_11', 'pending', 'MEG-01 — calibração vencida em 01/08/2026'],
      ['calibration', 'section_11', 'info', 'MIC-01 — calibração vence em 20/09/2026'],
      ['certificate_missing', 'section_11', 'info', 'MIC-01 sem certificado'],
    ]);
    // With no service end the caller's now is the reference; with neither, nothing is judged (the kernel reads no clock).
    const noEnd = withSetup(snapshot, { service_end: null });
    expect(preIssue(noEnd, undefined, { now: NOW }).some((r) => r.id === 'calibration:019966b0-0085-7000-8000-000000000003')).toBe(false);
    expect(preIssue(noEnd).some((r) => r.kind === 'calibration')).toBe(false);
  });

  it('a TAG two live sheets carry is pending on section 9', () => {
    const snapshot = fresh();
    const [a, b] = snapshot.equipment;
    const equipment = snapshot.equipment.map((row) => (row.id === b!.id ? { ...row, tag: ` ${a!.tag.toLowerCase()} ` } : row));
    const row = preIssue({ ...snapshot, equipment }, undefined, { now: NOW }).find((r) => r.kind === 'duplicate_tag');
    expect(row).toMatchObject({ row: 'section_9', severity: 'pending', text: `TAG ${a!.tag.toUpperCase()} duplicada` });
  });

  it('a section text variable with no value is pending on its own row, naming the labels', () => {
    const snapshot = fresh();
    const section1 = snapshot.blocks.find((b) => b.block_type === 'section_1')!;
    const own = { ...snapshot, blocks: snapshot.blocks.map((b) => (b.id === section1.id ? { ...b, config: { ...(b.config as object), section_text: 'Para {cliente}, por {responsavel}.' } } : b)) };
    const row = preIssue(own, undefined, { now: NOW }).find((r) => r.kind === 'section_variables');
    expect(row).toMatchObject({ row: 'section_1', severity: 'pending', text: 'Dados do relatório em branco: Cliente e Responsável' });
  });

  it('photos with an upload error are a warning on section 7; the sync lines are the Export dialog\'s', () => {
    const snapshot = fresh();
    const rows = preIssue(snapshot, undefined, { now: NOW, rejected: 2, lastPushes: [{ name: 'Eduardo', at: '2026-09-06T21:10:00.000Z' }] });
    expect(kinds(preIssueRowsFor(rows, 'sync'))).toEqual([
      ['rejected', 'sync', 'pending', '2 alterações rejeitadas'],
      ['last_send', 'sync', 'info', 'Último envio de Eduardo: 06/09 18:10'],
    ]);
  });
});

describe('7.5-UNIT exportPrecheck and the blocked reason', () => {
  it('splits the rows: the blocking one, the explicit ones (photos not held, sync lines) and a count of the rest', () => {
    const snapshot = fresh();
    const rows = preIssue(snapshot, undefined, { now: NOW, rejected: 1 });
    const precheck = exportPrecheck(rows);
    expect(precheck.blocking.map((r) => r.kind)).toEqual(['parecer_missing']);
    expect(precheck.explicit.map((r) => r.kind)).toEqual(['rejected']);
    expect(precheck.summarizedCount).toBe(rows.length - 2);
    expect(precheck.countText).toBe(`${rows.length - 2} avisos`);
    expect(exportPrecheck([rows.find((r) => r.kind === 'sheets')!]).countText).toBe('1 aviso');
    expect(exportPrecheck([]).countText).toBe('');
  });

  it('says which Sumário line to fill and which revision it issues (mock verbatim)', () => {
    expect(parecerMissingReason(3, 10)).toBe('Preencha o parecer (linha 10 do sumário) para emitir a revisão 3. O rascunho pode ser visto antes.');
    expect(parecerMissingReason(1, null)).toBe('Preencha o parecer para emitir a revisão 1. O rascunho pode ser visto antes.');
  });
});

describe('Epic 4 retro item 29: Restaurar lists only the blocks removed after the last revision', () => {
  it('cuts the list at `since`', () => {
    const snapshot = fresh();
    const [s2, s4] = ['section_2', 'section_4'].map((type) => snapshot.blocks.find((b) => b.block_type === type)!);
    const blocks = snapshot.blocks.map((b) =>
      b.id === s2!.id ? { ...b, removed_at: '2026-09-09T10:00:00.000Z' } : b.id === s4!.id ? { ...b, removed_at: '2026-09-11T10:00:00.000Z' } : b,
    );
    expect(restorableBlocks(blocks, [], [], null).map((r) => r.name)).toEqual(['4 Requisitos básicos', '2 Definições']);
    expect(restorableBlocks(blocks, [], [], '2026-09-10T08:47:00.000Z').map((r) => r.name)).toEqual(['4 Requisitos básicos']);
  });
});
