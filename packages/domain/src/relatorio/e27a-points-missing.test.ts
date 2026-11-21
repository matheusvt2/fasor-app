import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import {
  newPointRow,
  pointMissingFields,
  pointMissingText,
  pointsSemPrioridade,
  pointsSemPrioridadeText,
  pointsSemResponsavel,
  pointsSemResponsavelText,
  type PointMissingField,
} from '../points/checks.ts';
import type { PointRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT } from '../seed/definitions.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from './instantiate.ts';
import { exportPrecheck, lastSendAnyText, lastSendText, precheckCountMetaText, precheckCountText, preIssue, type PreIssueRow } from './pre-issue.ts';

/*
 * 27.4-UNIT (batch e27a, Story 27.4, F8 and F12 of the 2026-11-21 pass): the points missing an action, a
 * deadline, a priority or an owner are named rows of the Gerar dialog, never blocking; the count names the
 * rows the dialog does not list as "e mais N avisos nas linhas do sumário"; the point says "Falta: …"; the
 * other users' "Último envio" line says it is their last send of any relatório. Every value is invented.
 */

const NOW = new Date('2026-11-21T12:00:00.000Z');

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0e27-7104-8000-000000000001' }),
    { id: TEST_PROJECT },
    { service_start: '2026-11-20', service_end: '2026-11-21', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966b0-0e27-7105-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0e27-7106-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

let n = 0;
function point(snapshot: RelatorioSnapshot, fields: Partial<Pick<PointRow, 'action' | 'deadline' | 'priority' | 'owner' | 'origin'>> = {}): PointRow {
  const row = newPointRow(
    { id: `019966b0-0e27-7107-8000-${(++n).toString(16).padStart(12, '0')}`, relatorioId: snapshot.relatorio.id, text: 'Ferrugem no painel', equipmentId: null, origin: fields.origin ?? 'manual', action: fields.action ?? null },
    snapshot.points,
  );
  return { ...row, deadline: fields.deadline ?? null, priority: fields.priority ?? null, owner: fields.owner ?? null };
}

const withPoints = (snapshot: RelatorioSnapshot, build: (s: RelatorioSnapshot) => PointRow[]): RelatorioSnapshot => ({ ...snapshot, points: build(snapshot) });
const kinds = (rows: readonly PreIssueRow[]) => rows.map((row) => row.kind);
const pointRows = (rows: readonly PreIssueRow[]) => rows.filter((row) => row.kind.startsWith('points_sem_'));

describe('27.4-UNIT the points missing an action, a deadline, a priority or an owner', () => {
  it('a bare point: four info or pending rows on section 8, each named by the dialog, none blocking', () => {
    const snapshot = withPoints(fresh(), (s) => [point(s)]);
    const rows = preIssue(snapshot, undefined, { now: NOW });
    expect(pointRows(rows).map((row) => [row.kind, row.row, row.severity, row.text])).toEqual([
      ['points_sem_acao', 'section_8', 'pending', '1 ponto sem ação'],
      ['points_sem_prazo', 'section_8', 'info', '1 ponto sem prazo'],
      ['points_sem_prioridade', 'section_8', 'info', '1 ponto sem prioridade'],
      ['points_sem_responsavel', 'section_8', 'info', '1 ponto sem responsável'],
    ]);
    const precheck = exportPrecheck(rows);
    expect(kinds(precheck.explicit)).toEqual(expect.arrayContaining(['points_sem_acao', 'points_sem_prazo', 'points_sem_prioridade', 'points_sem_responsavel']));
    expect(kinds(precheck.blocking)).not.toContain('points_sem_acao');
    expect(precheck.blocking.every((row) => !row.kind.startsWith('points_'))).toBe(true);
  });

  it('plural rows and a filled point: only what is missing is counted; a blank owner is missing', () => {
    const snapshot = withPoints(fresh(), (s) => [point(s), point(s, { owner: '  ' }), point(s, { action: 'Limpar', deadline: '2026-12-01', priority: 'P2', owner: 'Ana' })]);
    expect(pointsSemPrioridade(snapshot.points)).toHaveLength(2);
    expect(pointsSemResponsavel(snapshot.points)).toHaveLength(2);
    const texts = pointRows(preIssue(snapshot, undefined, { now: NOW })).map((row) => row.text);
    expect(texts).toEqual(['2 pontos sem ação', '2 pontos sem prazo', '2 pontos sem prioridade', '2 pontos sem responsável']);
    expect(pointsSemPrioridadeText(1)).toBe('1 ponto sem prioridade');
    expect(pointsSemResponsavelText(3)).toBe('3 pontos sem responsável');
  });

  it('a removed point is not counted', () => {
    const snapshot = withPoints(fresh(), (s) => [{ ...point(s), removed_at: '2026-11-21T11:00:00.000Z' }]);
    expect(pointRows(preIssue(snapshot, undefined, { now: NOW }))).toEqual([]);
  });

  it('"Falta:" names the missing fields only, in the action plan\'s order; null with none', () => {
    const all: PointMissingField[] = ['acao', 'prazo', 'prioridade', 'responsavel'];
    expect(pointMissingText(all)).toBe('Falta: ação, prazo, prioridade, responsável');
    expect(pointMissingText(['prazo', 'responsavel'])).toBe('Falta: prazo, responsável');
    expect(pointMissingText(['prioridade'])).toBe('Falta: prioridade');
    expect(pointMissingText([])).toBeNull();
    const base = { action: null, deadline: null, priority: null, owner: null, origin: 'manual' } as const;
    expect(pointMissingFields(base)).toEqual(all);
    expect(pointMissingFields({ ...base, action: 'Limpar' })).toEqual(['prazo', 'prioridade', 'responsavel']);
    expect(pointMissingFields({ ...base, action: 'Limpar', deadline: '2026-12-01' })).toEqual(['prioridade', 'responsavel']);
    expect(pointMissingFields({ ...base, action: 'Limpar', deadline: '2026-12-01', priority: 'P1' })).toEqual(['responsavel']);
    expect(pointMissingFields({ action: 'Limpar', deadline: '2026-12', priority: 'P4', owner: 'Ana', origin: 'manual' })).toEqual([]);
    expect(pointMissingFields({ ...base, action: '   ', owner: '' })).toEqual(all);
  });

  it('a point written from an untested sheet is never asked for an action', () => {
    const fields = pointMissingFields({ action: null, deadline: null, priority: null, owner: null, origin: 'not_tested' });
    expect(fields).toEqual(['prazo', 'prioridade', 'responsavel']);
    expect(pointMissingText(fields)).toBe('Falta: prazo, prioridade, responsável');
    const snapshot = withPoints(fresh(), (s) => [point(s, { origin: 'not_tested' })]);
    expect(kinds(pointRows(preIssue(snapshot, undefined, { now: NOW })))).toEqual(['points_sem_prazo', 'points_sem_prioridade', 'points_sem_responsavel']);
  });
});

describe('27.4-UNIT the count of the rows the dialog does not list', () => {
  const info = (id: string, kind: PreIssueRow['kind'] = 'photos_uncaptioned'): PreIssueRow => ({ id, row: 'section_7', severity: 'info', text: id, kind });
  const listed = (id: string): PreIssueRow => ({ id, row: 'section_8', severity: 'info', text: id, kind: 'points_sem_prazo' });

  it('six listed and seven others: "e mais 7 avisos nas linhas do sumário; nenhum impede gerar."', () => {
    const rows = [...Array.from({ length: 6 }, (_, i) => listed(`l${i}`)), ...Array.from({ length: 7 }, (_, i) => info(`o${i}`))];
    const precheck = exportPrecheck(rows);
    expect(precheck.explicit).toHaveLength(6);
    expect(precheck.summarizedCount).toBe(7);
    expect(`${precheck.countText}${precheck.countMetaText}`).toBe('e mais 7 avisos nas linhas do sumário; nenhum impede gerar.');
  });

  it('one other under a listed row: "e mais 1 aviso na linha do sumário; não impede gerar."', () => {
    const precheck = exportPrecheck([listed('l'), info('o')]);
    expect(`${precheck.countText}${precheck.countMetaText}`).toBe('e mais 1 aviso na linha do sumário; não impede gerar.');
  });

  it('a blocking row above counts as listed', () => {
    const blocking: PreIssueRow = { id: 'b', row: 'section_10', severity: 'blocking', text: 'Parecer não preenchido', kind: 'parecer_missing' };
    expect(exportPrecheck([blocking, info('o')]).countText).toBe('e mais 1 aviso');
  });

  it('nothing listed above: no "e mais" lead; no others: no line', () => {
    expect(`${exportPrecheck([info('a'), info('b')]).countText}${exportPrecheck([info('a'), info('b')]).countMetaText}`).toBe('2 avisos nas linhas do sumário; nenhum impede gerar.');
    expect(exportPrecheck([listed('l')]).countText).toBe('');
    expect(exportPrecheck([listed('l')]).countMetaText).toBe('');
    expect(precheckCountText(0, true)).toBe('');
    expect(precheckCountMetaText(0)).toBe('');
    expect(precheckCountText(3, false)).toBe('3 avisos');
  });
});

describe('27.4-UNIT the other users\' "Último envio" line', () => {
  it('names the date as the last send of any relatório; the Sync status words stay', () => {
    expect(lastSendAnyText('Eduardo', '2026-09-06T21:10:00.000Z')).toBe('Último envio de Eduardo (qualquer relatório): 06/09 18:10');
    expect(lastSendText('Eduardo', '2026-09-06T21:10:00.000Z')).toBe('Último envio de Eduardo: 06/09 18:10');
    const rows = preIssue(fresh(), undefined, { now: NOW, lastPushes: [{ name: 'Eduardo', at: '2026-09-06T21:10:00.000Z' }] });
    expect(rows.filter((row) => row.kind === 'last_send').map((row) => [row.severity, row.text])).toEqual([['info', 'Último envio de Eduardo (qualquer relatório): 06/09 18:10']]);
    expect(kinds(exportPrecheck(rows).explicit)).toContain('last_send');
  });
});
