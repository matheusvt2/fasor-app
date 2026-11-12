import { describe, expect, it } from 'vitest';
import { entityKey, type EntityState } from '../ops/apply.ts';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import type { InstrumentRow } from '../registry/instrument-row.ts';
import type { BlockRow, EquipmentRow, LocationRow, PointRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { section11Instruments } from '../print/section-11.ts';
import { EMPTY_DEFINITION_CONTEXT } from '../seed/definitions.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from './instantiate.ts';
import { exportPrecheck, preIssue, preIssueRowsFor, type PreIssueRow } from './pre-issue.ts';
import {
  calibrationLack,
  calibrationLackText,
  deadlineOverdue,
  deadlineOverdueText,
  instrumentLacksText,
  namedWarningSection,
  overduePointPositions,
  sheetsUnderRemovedLocals,
  sheetsUnderRemovedLocalsText,
} from './pre-issue-warnings.ts';
import { isEquipmentBlock } from './sheet-state.ts';
import { sumarioRows } from './sumario.ts';
import { progress } from './progress.ts';

/*
 * Story 25.12 (M26, M18, M32): three warnings before generating, every seed, none blocking: an
 * overdue deadline (section 8), an instrument with no calibration date or interval (section 11),
 * a live sheet under a removed local (section 9). The Export dialog names each.
 */

const TEMPLATE_ID = '019966b0-0081-7000-8000-000000000001';
const AT = '2026-09-08T12:00:00.000Z';
/** 2026-09-26 09:00 in America/Sao_Paulo. */
const NOW = new Date('2026-09-26T12:00:00.000Z');

function freshState(): { state: EntityState; relatorioId: string } {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: TEMPLATE_ID }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966b0-0082-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0083-7000-8000-'), now: T0 }), seq: i + 1 }));
  return { state: replay(ops), relatorioId };
}

function fresh(): RelatorioSnapshot {
  const { state, relatorioId } = freshState();
  return buildSnapshot(state, relatorioId);
}

function point(n: number, deadline: string | null, overrides: Partial<PointRow> = {}): PointRow {
  return {
    id: `019966b0-0086-7000-8000-00000000000${n}`,
    relatorio_id: '019966b0-0082-7000-8000-000000000001',
    text: `Ponto ${n}`,
    equipment_id: null,
    origin: 'manual',
    order_key: `a${n}`,
    removed_at: null,
    action: 'Corrigir.',
    priority: null,
    deadline,
    owner: null,
    ...overrides,
  } as PointRow;
}

function instrument(overrides: Partial<InstrumentRow>): InstrumentRow {
  return {
    id: '019966b0-0085-7000-8000-000000000001',
    kind: 'instrument',
    code: '7E',
    name: 'Megôhmetro digital',
    manufacturer: null,
    model: null,
    serial: null,
    cert_number: null,
    laboratory: null,
    calibrated_at: '2026-01-10',
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

const view = (rows: readonly PreIssueRow[]) => rows.map((row) => [row.kind, row.row, row.severity, row.text]);
const ofKind = (rows: readonly PreIssueRow[], kind: PreIssueRow['kind']) => view(rows.filter((row) => row.kind === kind));

describe('25.12-UNIT an overdue deadline (section 8)', () => {
  it('a day before today is overdue, today is not; a month only once it has passed', () => {
    expect(deadlineOverdue('2026-09-25', '2026-09-26')).toBe(true);
    expect(deadlineOverdue('2026-09-26', '2026-09-26')).toBe(false);
    expect(deadlineOverdue('2026-09', '2026-09-26')).toBe(false);
    expect(deadlineOverdue('2026-08', '2026-09-01')).toBe(true);
    expect(deadlineOverdue('2026-10', '2026-09-26')).toBe(false);
    expect(deadlineOverdue('em breve', '2026-09-26')).toBe(false);
  });

  it('one pending row names the overdue points by their place in section 8, singular and plural; never blocking', () => {
    const base = fresh();
    const one = { ...base, points: [point(1, '2026-09-25'), point(2, '2026-09'), point(3, null)] };
    const rows = preIssue(one, undefined, { now: NOW });
    expect(ofKind(rows, 'deadline_overdue')).toEqual([['deadline_overdue', 'section_8', 'pending', 'Prazo já vencido: ponto 1']]);
    expect(rows.find((row) => row.kind === 'deadline_overdue')!.severity).not.toBe('blocking');

    const many = { ...base, points: [point(1, '2026-09-25'), point(2, '2026-09'), point(3, '2026-08'), point(4, '2026-09-24', { removed_at: AT })] };
    expect(overduePointPositions(many.points, '2026-09-26')).toEqual([1, 3]);
    expect(ofKind(preIssue(many, undefined, { now: NOW }), 'deadline_overdue')).toEqual([['deadline_overdue', 'section_8', 'pending', 'Prazo já vencido: pontos 1 e 3']]);
    expect(deadlineOverdueText([1, 3, 5])).toBe('Prazo já vencido: pontos 1, 3 e 5');
  });

  it('the day is America/Sao_Paulo: at 01:00 UTC it is still the day before there', () => {
    const snapshot = { ...fresh(), points: [point(1, '2026-09-25')] };
    expect(ofKind(preIssue(snapshot, undefined, { now: new Date('2026-09-26T01:00:00.000Z') }), 'deadline_overdue')).toEqual([]);
    expect(ofKind(preIssue(snapshot, undefined, { now: new Date('2026-09-26T03:30:00.000Z') }), 'deadline_overdue')).toHaveLength(1);
  });

  it('without the caller\'s clock nothing is judged (the kernel reads no clock); the Sumário row 8 carries the row', () => {
    const snapshot = { ...fresh(), points: [point(1, '2026-09-25')] };
    expect(ofKind(preIssue(snapshot), 'deadline_overdue')).toEqual([]);
    const issues = preIssue(snapshot, undefined, { now: NOW });
    const row8 = sumarioRows(snapshot, issues, progress(snapshot)).find((row) => row.rowKey === 'section_8')!;
    expect(row8.meta).toContain('Prazo já vencido: ponto 1');
    expect(row8.pending).toBe(true);
  });
});

describe('25.12-UNIT an instrument with no calibration data (section 11)', () => {
  const ID_A = '019966b0-0085-7000-8000-000000000001';
  const ID_B = '019966b0-0085-7000-8000-000000000002';

  it('what a calibration lacks: the date first, else the interval', () => {
    expect(calibrationLack({ calibrated_at: null, calibration_interval_months: null })).toBe('date');
    expect(calibrationLack({ calibrated_at: null, calibration_interval_months: 12 })).toBe('date');
    expect(calibrationLack({ calibrated_at: '2026-01-10', calibration_interval_months: null })).toBe('validity');
    expect(calibrationLack({ calibrated_at: '2026-01-10', calibration_interval_months: 12 })).toBeNull();
    expect(calibrationLackText('7E', 'date')).toBe('7E: sem data de calibração');
    expect(calibrationLackText('7E', 'validity')).toBe('7E: sem validade de calibração');
  });

  it('a ticked instrument with no date, one with no interval: one pending row each; the missing certificate pending too; nothing blocks', () => {
    const base = fresh();
    const snapshot = {
      ...base,
      relatorio: { ...base.relatorio, setup: { ...base.relatorio.setup, instrument_ids: [ID_A, ID_B] } },
      instruments: [instrument({ id: ID_A, code: '7E', calibrated_at: null, calibration_interval_months: null, certificate_file_id: null }), instrument({ id: ID_B, code: '3M', calibration_interval_months: null })],
    };
    const rows = preIssue(snapshot, undefined, { now: NOW });
    expect(view(preIssueRowsFor(rows, 'section_11').filter((row) => row.kind !== 'setup_missing'))).toEqual([
      ['calibration_missing', 'section_11', 'pending', '7E: sem data de calibração'],
      ['calibration_missing', 'section_11', 'pending', '3M: sem validade de calibração'],
      ['certificate_missing', 'section_11', 'pending', '7E sem certificado'],
    ]);
    expect(rows.filter((row) => row.severity === 'blocking').map((row) => row.kind)).toEqual(['parecer_missing']);
    // Judged whatever the reference date: with no service end and no clock the rows stay.
    const noEnd = { ...snapshot, relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, service_end: null } } };
    expect(ofKind(preIssue(noEnd), 'calibration_missing')).toHaveLength(2);
  });

  it('an instrument used on a sheet and not ticked is printed by section 11 and judged the same', () => {
    const base = fresh();
    const sheet = base.blocks.find((block) => block.block_type === 'para_raio')!;
    const picked = {
      ...sheet,
      sheet: { ...sheet.sheet, test: { ...sheet.sheet.test, isolacao: { cells: {}, ...sheet.sheet.test.isolacao, instrument: { value: { instrument_id: ID_A, code: '7E' }, source_suggestion_id: null, op_id: '019966b0-0084-7000-8000-000000000001' } } } },
    } as BlockRow;
    const snapshot = {
      ...base,
      blocks: base.blocks.map((block) => (block.id === sheet.id ? picked : block)),
      relatorio: { ...base.relatorio, setup: { ...base.relatorio.setup, instrument_ids: [] } },
      instruments: [instrument({ id: ID_A, code: '7E', calibrated_at: null })],
    };
    expect(section11Instruments(snapshot).map((entry) => entry.code)).toEqual(['7E']);
    expect(ofKind(preIssue(snapshot, undefined, { now: NOW }), 'calibration_missing')).toEqual([['calibration_missing', 'section_11', 'pending', '7E: sem data de calibração']]);
  });

  it('an instrument section 11 does not print raises nothing; the Instrumentos line says what a row lacks with the same words', () => {
    const base = fresh();
    const snapshot = { ...base, relatorio: { ...base.relatorio, setup: { ...base.relatorio.setup, instrument_ids: [] } }, instruments: [instrument({ id: ID_A, calibrated_at: null })] };
    expect(ofKind(preIssue(snapshot, undefined, { now: NOW }), 'calibration_missing')).toEqual([]);
    expect(instrumentLacksText(instrument({ calibrated_at: null, certificate_file_id: null }))).toBe('Sem data de calibração · sem certificado');
    expect(instrumentLacksText(instrument({ calibration_interval_months: null }))).toBe('Sem validade de calibração');
    expect(instrumentLacksText(instrument({ certificate_file_id: null }))).toBe('Sem certificado');
    expect(instrumentLacksText(instrument({}))).toBeNull();
  });
});

describe('25.12-UNIT a sheet under a removed local (section 9)', () => {
  function removedAncestorState() {
    const { state, relatorioId } = freshState();
    const locations = [...state.values()].filter((row): row is LocationRow => (row as LocationRow).kind !== undefined && 'parent_id' in row && (row as LocationRow).relatorio_id === relatorioId);
    const blocks = [...state.values()].filter((row): row is BlockRow => 'sheet' in row && (row as BlockRow).relatorio_id === relatorioId);
    // A location holding a sheet whose parent is a local: removing the parent hides the sheet's own location.
    const child = locations.find((location) => location.parent_id !== null && blocks.some((block) => block.location_id === location.id && isEquipmentBlock(block)))!;
    const parent = locations.find((location) => location.id === child.parent_id)!;
    return { state, relatorioId, child, parent, blocks };
  }

  it('none with every local live', () => {
    const { state, relatorioId } = freshState();
    expect(sheetsUnderRemovedLocals(state, relatorioId)).toEqual([]);
    expect(ofKind(preIssue(buildSnapshot(state, relatorioId), undefined, { now: NOW }), 'sheets_removed_local')).toEqual([]);
  });

  it('a local removed above the sheet\'s own: its live sheets are named by TAG in order, in one pending row; the snapshot keeps them out', () => {
    const { state, relatorioId, child, parent, blocks } = removedAncestorState();
    const next = new Map(state);
    next.set(entityKey('location', parent.id), { ...parent, removed_at: AT });
    const orphans = blocks.filter((block) => block.location_id === child.id && isEquipmentBlock(block));
    const tags = [...orphans]
      .sort((a, b) => (a.order_key < b.order_key ? -1 : a.order_key > b.order_key ? 1 : a.id < b.id ? -1 : 1))
      .map((block) => (state.get(entityKey('equipment', block.equipment_id!)) as EquipmentRow).tag);
    const names = sheetsUnderRemovedLocals(next, relatorioId);
    expect(names.length).toBeGreaterThan(0);
    // Every sheet under the removed local (the child and any other location under it) is named; the child's are among them, in order.
    expect(names.filter((name) => tags.includes(name))).toEqual(tags);
    const snapshot = buildSnapshot(next, relatorioId);
    expect(snapshot.blocks.some((block) => orphans.some((orphan) => orphan.id === block.id))).toBe(false);
    const rows = preIssue(snapshot, undefined, { now: NOW, removedLocalSheets: names });
    expect(ofKind(rows, 'sheets_removed_local')).toEqual([['sheets_removed_local', 'section_9', 'pending', sheetsUnderRemovedLocalsText(names)]]);
  });

  it('a removed sheet, or one whose local is live, is not named; the text names one or many', () => {
    const { state, relatorioId, child } = removedAncestorState();
    const next = new Map(state);
    next.set(entityKey('location', child.id), { ...child, removed_at: AT });
    const names = sheetsUnderRemovedLocals(next, relatorioId);
    const firstKey = [...next.entries()].find(([, row]) => 'sheet' in row && (row as BlockRow).location_id === child.id && isEquipmentBlock(row as BlockRow))![0];
    next.set(firstKey, { ...(next.get(firstKey) as BlockRow), removed_at: AT });
    expect(sheetsUnderRemovedLocals(next, relatorioId)).toHaveLength(names.length - 1);
    expect(sheetsUnderRemovedLocalsText(['TP-C21'])).toBe('Fichas em local removido, fora do relatório: TP-C21');
    expect(sheetsUnderRemovedLocalsText(['TP-C21', 'TC-01'])).toBe('Fichas em local removido, fora do relatório: TP-C21 e TC-01');
  });
});

describe('25.12-UNIT the Export dialog names the three rows', () => {
  it('each is an explicit row with its section; a relatório with none of the three keeps today\'s rows', () => {
    const base = fresh();
    const plain = preIssue(base, undefined, { now: NOW });
    const snapshot = {
      ...base,
      points: [point(1, '2026-09-25')],
      relatorio: { ...base.relatorio, setup: { ...base.relatorio.setup, instrument_ids: ['019966b0-0085-7000-8000-000000000001'] } },
      instruments: [instrument({ calibrated_at: null })],
    };
    const rows = preIssue(snapshot, undefined, { now: NOW, removedLocalSheets: ['TP-C21'] });
    const precheck = exportPrecheck(rows);
    expect(precheck.explicit.filter((row) => row.kind !== 'sheets_empty').map((row) => [row.kind, namedWarningSection(row)])).toEqual([
      ['deadline_overdue', 8],
      ['sheets_removed_local', 9],
      ['calibration_missing', 11],
    ]);
    expect(precheck.blocking.filter((row) => namedWarningSection(row) !== null)).toEqual([]);
    expect(exportPrecheck(plain).explicit.filter((row) => namedWarningSection(row) !== null)).toEqual([]);
    // The other rows stay today's (the parecer row follows the points, which this relatório adds).
    const others = (list: readonly PreIssueRow[]) => list.filter((row) => !['deadline_overdue', 'sheets_removed_local', 'calibration_missing', 'setup_missing', 'parecer_missing'].includes(row.kind)).map((row) => row.id);
    expect(others(rows)).toEqual(others(plain));
  });
});
