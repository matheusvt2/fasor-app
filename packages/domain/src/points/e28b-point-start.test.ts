import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { numberPhotos } from '../photos/numbering.ts';
import { layoutSpec } from '../print/layout.ts';
import type { LayoutSectionPoints } from '../print/section-8.ts';
import { overduePointPositions } from '../relatorio/pre-issue-warnings.ts';
import { preIssue } from '../relatorio/pre-issue.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import type { BlockRow, PointRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT } from '../seed/definitions.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { newPointRow } from './checks.ts';
import { isUtilityNotTested, notTestedOffersPoint, POINT_DEFAULT_ACTION } from './derived.ts';
import {
  deadlineBaseDate,
  deadlineCountsFromIssue,
  deadlineShownText,
  deadlineTerm,
  firstIssueOf,
  pointStartLine,
  pointStartPriority,
  pointStartWrites,
  printedDeadline,
  type PointPriority,
} from './priority.ts';

/*
 * 28.5-UNIT (batch e28b, Story 28.5, B-8, Matheus's Q-6): on seed v18 a tapped point starts with its origin's
 * priority and the deadline it suggests; a point from a test with no recommendation starts with Bruno's action (the
 * findings themselves are pinned in `test-point-findings.test.ts`); a sheet not tested for the utility's equipment
 * offers no point; a suggested deadline reads as a term before the issue and prints counted from the issue date, a
 * typed one as typed; the overdue row skips a suggested deadline. v17 starts, judges and prints as before.
 */

/** A UUIDv7 minted at `iso` (its first 48 bits are the Unix milliseconds). */
function v7At(iso: string, tail = '000000000001'): string {
  const hex = Date.parse(iso).toString(16).padStart(12, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7000-8000-${tail}`;
}

/** Created on 2026-12-01 in America/Sao_Paulo. */
const DEC_01 = v7At('2026-12-01T15:00:00Z');
/** Issued on 2026-12-10 in America/Sao_Paulo. */
const ISSUED_AT = '2026-12-10T15:00:00.000Z';
const NEXT = '2027-12';

const ORIGINS: readonly PointRow['origin'][] = ['reading', 'restricao', 'nc', 'not_tested', 'reprovado', 'manual'];

function point(fields: Partial<PointRow> = {}): PointRow {
  return { id: DEC_01, relatorio_id: v7At('2026-11-01T00:00:00Z'), text: 'Texto', equipment_id: null, origin: 'manual', order_key: 'a0', removed_at: null, action: null, priority: null, deadline: null, owner: null, ...fields };
}

/** A point at `priority` with the deadline its pick suggested on its creation day. */
function picked(priority: PointPriority, fields: Partial<PointRow> = {}): PointRow {
  const start = pointStartWrites('v18', 'reading', fields.id ?? DEC_01, NEXT);
  const writes = start.priority === priority ? start : { priority, deadline: { P0: '2026-12-01', P1: '2026-12-31', P2: '2027-03-01', P3: '2027-05-30', P4: NEXT }[priority] };
  return point({ ...writes, ...fields });
}

describe('28.5-UNIT-001 the priority a tapped point starts with, by origin', () => {
  it('on v18: a failed reading P1, a restricted reading P4, an NC item P2, a sheet not tested P4, a ficha reproved by hand P1, a manual point none', () => {
    expect(ORIGINS.map((origin) => pointStartPriority('v18', origin))).toEqual(['P1', 'P4', 'P2', 'P4', 'P1', null]);
  });

  it('on v17 and older every point starts unset, as today', () => {
    for (const version of ['v17', 'v16', 'v14', 'v1']) expect(ORIGINS.map((origin) => pointStartPriority(version, origin)), version).toEqual(ORIGINS.map(() => null));
    expect(pointStartWrites('v17', 'reading', DEC_01, NEXT)).toEqual({});
  });

  it('starts with the deadline a pick of that priority suggests, counted from the creation day as stored today', () => {
    expect(pointStartWrites('v18', 'reading', DEC_01, NEXT)).toEqual({ priority: 'P1', deadline: '2026-12-31' });
    expect(pointStartWrites('v18', 'nc', DEC_01, NEXT)).toEqual({ priority: 'P2', deadline: '2027-03-01' });
    expect(pointStartWrites('v18', 'restricao', DEC_01, NEXT)).toEqual({ priority: 'P4', deadline: NEXT });
    expect(pointStartWrites('v18', 'not_tested', DEC_01, null)).toEqual({ priority: 'P4' });
    expect(pointStartWrites('v18', 'manual', DEC_01, NEXT)).toEqual({});
  });

  it('names why under the picker, the frame\'s line for a reading and the batch\'s for the others', () => {
    expect(pointStartLine('v18', 'reading')).toBe('Começa em P1: leitura fora do critério. Troque se precisar.');
    expect(pointStartLine('v18', 'restricao')).toBe('Começa em P4: leitura com restrição. Troque se precisar.');
    expect(pointStartLine('v18', 'nc')).toBe('Começa em P2: item não conforme. Troque se precisar.');
    expect(pointStartLine('v18', 'not_tested')).toBe('Começa em P4: equipamento não ensaiado. Troque se precisar.');
    expect(pointStartLine('v18', 'reprovado')).toBe('Começa em P1: ficha reprovada. Troque se precisar.');
    expect(pointStartLine('v18', 'manual')).toBeNull();
    expect(pointStartLine('v17', 'reading')).toBeNull();
  });

  it('Bruno\'s default action, verbatim', () => {
    expect(POINT_DEFAULT_ACTION).toBe('Inspecionar o equipamento, corrigir a causa e repetir o ensaio.');
  });
});

describe('28.5-UNIT-002 the deadline counted from the issue date', () => {
  it('turns on with v18 only', () => {
    expect(deadlineCountsFromIssue('v18')).toBe(true);
    expect(deadlineCountsFromIssue('v17')).toBe(false);
  });

  it('a P1 point saved with its suggestion on 2026-12-01 prints 2027-01-09 when issued on 2026-12-10, and reads its term before', () => {
    const p1 = picked('P1');
    expect(p1.deadline).toBe('2026-12-31');
    expect(printedDeadline(p1, 'v18', NEXT, '2026-12-10')).toBe('2027-01-09');
    expect(deadlineTerm(p1, 'v18', NEXT)).toBe('30 dias após a emissão');
  });

  it('P0 to P4: the issue date, its 30, 90 and 180 days after, and the next intervention', () => {
    const rows = (['P0', 'P1', 'P2', 'P3', 'P4'] as const).map((priority) => picked(priority));
    expect(rows.map((row) => printedDeadline(row, 'v18', NEXT, '2026-12-10'))).toEqual(['2026-12-10', '2027-01-09', '2027-03-10', '2027-06-08', NEXT]);
    expect(rows.map((row) => deadlineTerm(row, 'v18', NEXT))).toEqual(['Na data da emissão', '30 dias após a emissão', '90 dias após a emissão', '180 dias após a emissão', 'Na próxima manutenção']);
  });

  it('a typed date prints as typed and reads no term', () => {
    const typed = picked('P1', { deadline: '2027-02-15' });
    expect(printedDeadline(typed, 'v18', NEXT, '2026-12-10')).toBe('2027-02-15');
    expect(deadlineTerm(typed, 'v18', NEXT)).toBeNull();
  });

  it('a point with no priority or no deadline reads no term and prints what it stores', () => {
    expect(deadlineTerm(point(), 'v18', NEXT)).toBeNull();
    expect(printedDeadline(point({ deadline: '2027-02-15' }), 'v18', NEXT, '2026-12-10')).toBe('2027-02-15');
  });

  it('on v17 the stored suggestion prints as stored, with no term', () => {
    const p1 = picked('P1');
    expect(printedDeadline(p1, 'v17', NEXT, '2026-12-10')).toBe('2026-12-31');
    expect(deadlineTerm(p1, 'v17', NEXT)).toBeNull();
  });
});

describe('28.5-UNIT-003 the overdue row skips a suggested deadline on v18 and still raises a typed one', () => {
  const suggested = picked('P1', { id: DEC_01, order_key: 'a0' });
  const typed = picked('P1', { id: v7At('2026-12-01T15:00:00Z', '000000000002'), order_key: 'a1', deadline: '2026-12-05' });
  const points = [suggested, typed];
  it('on v18 only the typed one is past on 2027-01-05', () => {
    expect(overduePointPositions(points, '2027-01-05', { seedVersion: 'v18', nextIntervention: NEXT })).toEqual([2]);
  });
  it('on v17, and without the relatório, both are judged as before', () => {
    expect(overduePointPositions(points, '2027-01-05', { seedVersion: 'v17', nextIntervention: NEXT })).toEqual([1, 2]);
    expect(overduePointPositions(points, '2027-01-05')).toEqual([1, 2]);
  });
  // Batch e28r (wave review S4): a P4 suggestion is the next intervention verbatim, not a term counted from the issue,
  // so a past one is overdue on v18 as on v17; only P0 to P3 are skipped.
  it('on v18 a P4 point whose suggested next intervention is already past raises the row, as on v17', () => {
    const past = '2026-11';
    const p4 = picked('P4', { id: DEC_01, order_key: 'a0', deadline: past });
    const p2 = picked('P2', { id: v7At('2026-12-01T15:00:00Z', '000000000003'), order_key: 'a1' });
    expect(deadlineTerm(p4, 'v18', past)).toBe('Na próxima manutenção');
    expect(printedDeadline(p4, 'v18', past, '2027-01-05')).toBe(past);
    expect(overduePointPositions([p4, p2], '2027-04-05', { seedVersion: 'v18', nextIntervention: past })).toEqual([1]);
    expect(overduePointPositions([p4, p2], '2027-04-05', { seedVersion: 'v17', nextIntervention: past })).toEqual([1, 2]);
  });
});

function fresh(seedVersion: 'v18' | 'v17'): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-2805-7000-8000-000000000001', seedVersion }),
    { id: TEST_PROJECT },
    { service_start: '2026-12-01', service_end: '2026-12-03', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966b0-2805-7100-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-2805-7200-8000-'), now: T0 }), seq: i + 1 }));
  const snapshot = buildSnapshot(replay(ops), relatorioId);
  return { ...snapshot, relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, next_intervention_date: NEXT } } };
}

function withPoints(snapshot: RelatorioSnapshot, rows: readonly Partial<PointRow>[]): RelatorioSnapshot {
  let points: PointRow[] = [];
  rows.forEach((fields, i) => {
    const row = newPointRow({ id: v7At('2026-12-01T15:00:00Z', String(i + 1).padStart(12, '0')), relatorioId: snapshot.relatorio.id, text: `Ponto ${i + 1}`, equipmentId: null, origin: 'manual', action: 'Ação' }, points);
    points = [...points, { ...row, ...fields, id: row.id }];
  });
  return { ...snapshot, points };
}

function section8Of(snapshot: RelatorioSnapshot): LayoutSectionPoints {
  const section = layoutSpec(snapshot, { revisionNumber: 0, issuedAt: ISSUED_AT }).sections.find((one) => one.kind === 'points');
  expect(section).toBeDefined();
  return section as LayoutSectionPoints;
}

describe('28.5-UNIT-004 section 8 prints the deadline from the issue date on v18 and as stored on v17', () => {
  const rows = [
    { priority: 'P1' as const, deadline: '2026-12-31' },
    { priority: 'P1' as const, deadline: '2027-02-15' },
    { priority: 'P0' as const, deadline: '2026-12-01' },
    { priority: 'P4' as const, deadline: NEXT },
  ];
  it('v18: the P1 suggestion 09/01/2027, the typed date as typed, P0 the issue date, P4 the next intervention', () => {
    expect(section8Of(withPoints(fresh('v18'), rows)).table.map((row) => row.deadline)).toEqual(['09/01/2027', '15/02/2027', '10/12/2026', '12/2027']);
  });
  it('v17: every deadline as stored', () => {
    expect(section8Of(withPoints(fresh('v17'), rows)).table.map((row) => row.deadline)).toEqual(['31/12/2026', '15/02/2027', '01/12/2026', '12/2027']);
  });
  it('the photo numbering is untouched', () => {
    expect(numberPhotos(fresh('v18')).size).toBe(0);
  });
});

describe('28.5-UNIT-005 the utility\'s equipment offers no point, and the pre-issue row reads the relatório\'s seed', () => {
  const mark = (reason: string): BlockRow['not_tested'] => ({ reason, text: null, at: T0.toISOString(), by: TEST_USER, utility_name: 'Concessionária Exemplo' });
  it('a v18 sheet not tested for "Equipamento da concessionária" offers none; any other reason offers one; a tested sheet none', () => {
    expect(notTestedOffersPoint({ not_tested: mark('equipamento_concessionaria'), seed_version: 'v18' })).toBe(false);
    expect(isUtilityNotTested({ not_tested: mark('equipamento_concessionaria'), seed_version: 'v18' })).toBe(true);
    expect(notTestedOffersPoint({ not_tested: mark('solicitacao_cliente'), seed_version: 'v18' })).toBe(true);
    expect(notTestedOffersPoint({ not_tested: mark('outro'), seed_version: 'v17' })).toBe(true);
    expect(notTestedOffersPoint({ not_tested: null, seed_version: 'v18' })).toBe(false);
  });

  it('the "Prazo já vencido" row: a v18 suggested deadline past is not named, a typed one is; v17 names both', () => {
    const rows = [
      { priority: 'P1' as const, deadline: '2026-12-31' },
      { priority: 'P1' as const, deadline: '2026-12-05' },
    ];
    const at = new Date('2027-01-05T15:00:00Z');
    const overdue = (snapshot: RelatorioSnapshot) => preIssue(snapshot, undefined, { now: at }).find((row) => row.kind === 'deadline_overdue')?.text ?? null;
    expect(overdue(withPoints(fresh('v18'), rows))).toBe('Prazo já vencido: ponto 2');
    expect(overdue(withPoints(fresh('v17'), rows))).toBe('Prazo já vencido: pontos 1 e 2');
  });
});

// Batch e28r (Matheus 2026-11-23, "Opção A, e mostre a data real"): the base is the relatório's first issue.
describe('28.5-UNIT-006 a suggested deadline counts from the first issue in every revision, and reads its date after it', () => {
  const REV_1 = '2026-12-10T15:00:00.000Z';
  const REV_2 = '2027-02-10T15:00:00.000Z';
  const rows = [
    { priority: 'P1' as const, deadline: '2026-12-31' },
    { priority: 'P1' as const, deadline: '2027-02-15' },
    { priority: 'P4' as const, deadline: NEXT },
  ];
  const printed = (snapshot: RelatorioSnapshot, issuedAt: string, firstIssuedAt?: string | null, draft = false) =>
    (layoutSpec(snapshot, { revisionNumber: draft ? 0 : 1, issuedAt, draft, ...(firstIssuedAt === undefined ? {} : { firstIssuedAt }) }).sections.find((one) => one.kind === 'points') as LayoutSectionPoints).table.map(
      (row) => row.deadline,
    );

  it('the first issue is the earliest revision; none before any', () => {
    expect(firstIssueOf([])).toBeNull();
    expect(firstIssueOf([{ created_at: REV_2 }, { created_at: REV_1 }])).toBe(REV_1);
    expect(deadlineBaseDate(REV_2, REV_1)).toBe('2026-12-10');
    expect(deadlineBaseDate(REV_2, null)).toBe('2027-02-10');
  });

  it('P1: revision 1 issued 2026-12-10 prints 09/01/2027, revision 2 issued 2027-02-10 prints 09/01/2027 too; typed and P4 as before', () => {
    const snapshot = withPoints(fresh('v18'), rows);
    expect(printed(snapshot, REV_1, null)).toEqual(['09/01/2027', '15/02/2027', '12/2027']);
    expect(printed(snapshot, REV_2, REV_1)).toEqual(['09/01/2027', '15/02/2027', '12/2027']);
  });

  it('a preview before any issue counts from its own instant; one after the first issue prints what the issue prints', () => {
    const snapshot = withPoints(fresh('v18'), rows);
    expect(printed(snapshot, REV_2, null, true)[0]).toBe('12/03/2027');
    expect(printed(snapshot, REV_2, REV_1, true)[0]).toBe('09/01/2027');
  });

  it('v17 prints every deadline as stored, first issue or not', () => {
    expect(printed(withPoints(fresh('v17'), rows), REV_2, REV_1)).toEqual(['31/12/2026', '15/02/2027', '12/2027']);
  });

  it('Pontos reads the term before the first issue and the printed date after it; a typed date and v17 read nothing new', () => {
    const p1 = picked('P1');
    expect(deadlineShownText(p1, 'v18', NEXT, null)).toBe('30 dias após a emissão');
    expect(deadlineShownText(p1, 'v18', NEXT, REV_1)).toBe('09/01/2027');
    expect(deadlineShownText(picked('P4'), 'v18', NEXT, REV_1)).toBe('12/2027');
    expect(deadlineShownText(picked('P1', { deadline: '2027-02-15' }), 'v18', NEXT, REV_1)).toBeNull();
    expect(deadlineShownText(p1, 'v17', NEXT, REV_1)).toBeNull();
  });

  // Coordinator's reading (2026-11-23): after the first issue the suggestion is a real date, judged as a typed one is.
  it('the overdue row: before the first issue a v18 suggestion is skipped; after it, its real date past is named', () => {
    const snapshot = withPoints(fresh('v18'), rows.slice(0, 1));
    const overdue = (now: string, firstIssuedAt?: string | null) =>
      preIssue(snapshot, undefined, { now: new Date(now), ...(firstIssuedAt === undefined ? {} : { firstIssuedAt }) }).find((row) => row.kind === 'deadline_overdue')?.text ?? null;
    expect(overdue('2027-02-10T15:00:00Z')).toBeNull();
    expect(overdue('2027-02-10T15:00:00Z', REV_1)).toBe('Prazo já vencido: ponto 1');
    expect(overdue('2027-01-05T15:00:00Z', REV_1)).toBeNull();
    expect(overduePointPositions(snapshot.points, '2027-02-10', { seedVersion: 'v18', nextIntervention: NEXT, firstIssuedAt: REV_1 })).toEqual([1]);
  });
});
