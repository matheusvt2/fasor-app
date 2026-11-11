import { describe, expect, it } from 'vitest';
import { companyTypes } from '../../fixtures/company-types/op-log.ts';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { replaySmall } from '../../fixtures/replay-small/op-log.ts';
import { effectiveConclusionPair } from '../relatorio/conclusion.ts';
import { visitContextOf } from '../relatorio/visit-context.ts';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { resolveActionPlan, resolveSection8, section8Layout } from '../print/section-8.ts';
import { sheetOrder } from '../relatorio/ficha.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { composeParecer, derivedParecer, effectiveParecer, parecerReasonText } from '../relatorio/parecer.ts';
import { preIssue } from '../relatorio/pre-issue.ts';
import { progress } from '../relatorio/progress.ts';
import { cellAddressesOf } from '../relatorio/readings.ts';
import { sumarioRows } from '../relatorio/sumario.ts';
import type { BlockRow, Cell, PointRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, EMPTY_DEFINITION_CONTEXT, findDefinition, siteItems, snapshotDefinitionContext } from '../seed/definitions.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { newPointRow } from './checks.ts';
import { ncRowPointText, notTestedPointText, resolvedOriginPoints } from './derived.ts';
import { pointsHeadingText, pointsSummary, pointsSummaryText, sectionEightEntries } from './summary.ts';

/*
 * Fix batch e24h (Matheus, 2026-11-10): a point of attention exists only when the technician
 * creates it. An NC row (of a sheet or a local), a reading out of its criterion, a restricted
 * reading, a ficha concluded Reprovado by hand and a sheet marked Não ensaiado list, count and
 * print nothing; the parecer's verdict does not move.
 */

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-2405-7000-8000-000000000001' }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT, tagRule: 'legacy' },
    { newId: idSequence('019966b0-2406-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-2407-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: '019966b0-2408-7000-8000-000000000001' });

function edit(snapshot: RelatorioSnapshot, blockId: string, fn: (block: BlockRow) => BlockRow): RelatorioSnapshot {
  return { ...snapshot, blocks: snapshot.blocks.map((block) => (block.id === blockId ? fn(block) : block)) };
}

function blockOf(snapshot: RelatorioSnapshot, type: string): BlockRow {
  const node = sheetOrder(snapshot).find((one) => snapshot.blocks.find((block) => block.id === one.blockId)?.block_type === type)!;
  return snapshot.blocks.find((block) => block.id === node.blockId)!;
}

function ncRow(block: BlockRow, index: number, observation: string | null = null): BlockRow {
  const item = findDefinition(block.seed_version, block.block_type)!.checklist![index]!;
  return {
    ...block,
    sheet: { ...block.sheet, checklist: { ...block.sheet.checklist, [item.key]: { result: cell('NC'), ...(observation === null ? {} : { observation: cell(observation) }) } } },
  };
}

function insulationOut(block: BlockRow): BlockRow {
  const definition = findDefinition(block.seed_version, block.block_type)!;
  const [first] = cellAddressesOf(definition, 'isolacao');
  return {
    ...block,
    sheet: { ...block.sheet, test: { ...block.sheet.test, isolacao: { cells: { [String(first!.row)]: { [String(first!.col)]: cell({ raw: '300', unit: 'MΩ', state: 'measured' }) } } } } },
  };
}

const reprovadoByHand = (block: BlockRow): BlockRow => ({
  ...block,
  sheet: { ...block.sheet, observations: cell('Carcaça com corrosão avançada.'), conclusion: { ...block.sheet.conclusion, result: cell('reprovado'), restriction: cell('com_restricoes') } },
});

const notTested = (block: BlockRow): BlockRow => ({ ...block, not_tested: { reason: 'impossibilidade_desligamento', text: null, at: T0.toISOString(), by: TEST_USER } });

function siteNc(snapshot: RelatorioSnapshot): RelatorioSnapshot {
  const local = snapshot.locations.find((row) => row.kind === 'cabine' && row.parent_id === null)!;
  const key = siteItems(snapshot.relatorio.seed_version)[2]!.key;
  return {
    ...snapshot,
    locations: snapshot.locations.map((row) => (row.id === local.id && row.kind === 'cabine' ? { ...row, checklist: { ...row.checklist, [key]: { result: cell('NC') } } } : row)),
  };
}

/** A v13 cable whose insulation is restricted (one phase below 50 % of the largest), alone in its relatório and otherwise clean. */
function restrictedCableAlone(): RelatorioSnapshot {
  const snapshot = structuredClone(layoutLockSnapshot('v13'));
  const cable = structuredClone(snapshot.blocks.find((block) => block.block_type === 'cabos_entrada' && block.removed_at === null)!);
  for (const entry of Object.values(cable.sheet.checklist)) {
    entry.result = cell('C');
    delete entry.observation;
  }
  cable.sheet.observations = null;
  for (const [row, raw] of [['0', '5'], ['1', '5'], ['2', '1.5'], ['3', '5']] as const) cable.sheet.test.isolacao!.cells[row]!['1'] = cell({ raw, unit: 'GΩ', state: 'measured' });
  snapshot.blocks = snapshot.blocks.map((block) => (block.id === cable.id ? cable : block.equipment_id !== null ? { ...block, removed_at: '2026-11-08T10:00:00.000Z' } : block));
  snapshot.locations = snapshot.locations.map((row) => (row.kind === 'cabine' ? { ...row, checklist: Object.fromEntries(Object.keys(row.checklist ?? {}).map((key) => [key, { result: cell('C') }])) } : row));
  snapshot.points = [];
  return snapshot;
}

let seq = 0;
function point(snapshot: RelatorioSnapshot, fields: Partial<PointRow>): PointRow {
  seq += 1;
  const row = newPointRow({ id: `019966b0-2409-7000-8000-${String(seq).padStart(12, '0')}`, relatorioId: snapshot.relatorio.id, text: `Ponto ${seq}`, equipmentId: null, origin: 'manual', action: 'Agir' }, snapshot.points);
  return { ...row, ...fields };
}
const withPoints = (snapshot: RelatorioSnapshot, ...points: PointRow[]): RelatorioSnapshot => ({ ...snapshot, points: [...snapshot.points, ...points] });

/** Every reader of section 8 sees nothing: the Points list and heading, Sumário row 8, the pre-issue rows, the bullets, the action plan and the parecer's points. */
function expectNoPoints(snapshot: RelatorioSnapshot): void {
  expect(sectionEightEntries(snapshot)).toEqual([]);
  expect(pointsSummary(snapshot)).toEqual({ total: 0, semAcao: 0, naoEnsaiadas: 0 });
  expect(pointsHeadingText(pointsSummary(snapshot).total)).toBe('Pontos de atenção');
  expect(pointsSummaryText(pointsSummary(snapshot))).toBe('Nenhum ponto de atenção');
  const computed = progress(snapshot);
  expect(sumarioRows(snapshot, preIssue(snapshot, computed), computed).find((row) => row.rowKey === 'section_8')?.meta).toBe('Nenhum ponto de atenção');
  expect(preIssue(snapshot).filter((row) => row.row === 'section_8')).toEqual([]);
  expect(resolveSection8(snapshot, new Map())).toEqual([]);
  expect(resolveActionPlan(snapshot, new Map())).toEqual([]);
  expect(section8Layout(snapshot, { number: 8, title: 'PONTOS DE ATENÇÃO' })).toBeNull();
  const composed = composeParecer(snapshot);
  expect(composed.text).not.toContain('ponto de atenção');
  expect(composed.text).not.toContain('pontos de atenção');
  expect(composed.criteriaItems.some((item) => item.includes('ponto'))).toBe(false);
  const reason = parecerReasonText(snapshot);
  if (reason !== null) {
    expect(reason).not.toContain('ponto');
    // Well formed: a part is named after the colon.
    expect(reason).toMatch(/: \S.*\.$/);
  }
}

describe('e24h-UNIT H1 a finding with no stored point is no point of attention', () => {
  it('an NC row of a ficha', () => {
    const base = fresh();
    expectNoPoints(edit(base, blockOf(base, 'transformador_forca').id, (block) => ncRow(block, 0, 'oxidação nos terminais')));
  });

  it("an NC item of a local's Verificações do local", () => {
    expectNoPoints(siteNc(fresh()));
  });

  it('a reading out of its criterion', () => {
    const base = fresh();
    expectNoPoints(edit(base, blockOf(base, 'disjuntor_mt').id, insulationOut));
  });

  it('a restricted reading (seed v13)', () => {
    expectNoPoints(restrictedCableAlone());
  });

  it('a ficha concluded Reprovado by hand', () => {
    const base = fresh();
    expectNoPoints(edit(base, blockOf(base, 'transformador_forca').id, reprovadoByHand));
  });

  it('a sheet marked Não ensaiado', () => {
    const base = fresh();
    expectNoPoints(edit(base, blockOf(base, 'transformador_forca').id, notTested));
  });

  it('two stored points beside the four findings: two entries, "(2)", "2 pontos", two bullets and two action-plan rows', () => {
    const base = fresh();
    let snapshot = edit(base, blockOf(base, 'transformador_forca').id, (block) => ncRow(block, 0));
    snapshot = edit(snapshot, blockOf(base, 'disjuntor_mt').id, insulationOut);
    snapshot = edit(snapshot, blockOf(base, 'chave_seccionadora').id, reprovadoByHand);
    snapshot = edit(snapshot, blockOf(base, 'para_raio').id, notTested);
    snapshot = siteNc(snapshot);
    const first = point(snapshot, { text: 'Primeiro' });
    snapshot = withPoints(snapshot, first, point(withPoints(snapshot, first), { text: 'Segundo', action: null }));
    expect(sectionEightEntries(snapshot).map((entry) => entry.kind)).toEqual(['point', 'point']);
    const summary = pointsSummary(snapshot);
    expect(summary).toEqual({ total: 2, semAcao: 1, naoEnsaiadas: 0 });
    expect(pointsHeadingText(summary.total)).toBe('Pontos de atenção (2)');
    expect(pointsSummaryText(summary)).toBe('2 pontos · 1 sem ação');
    expect(resolveSection8(snapshot, new Map()).map((bullet) => bullet.text)).toEqual(['Primeiro. Agir', 'Segundo']);
    expect(resolveActionPlan(snapshot, new Map()).map((row) => row.number)).toEqual(['1', '2']);
    expect(composeParecer(snapshot).text).toContain('Foram registrados 2 pontos de atenção na seção');
    expect(composeParecer(snapshot).criteriaItems).toContain('2 pontos de atenção');
  });

  it('a stored point written from an untested sheet counts as "não ensaiada" while the sheet stays untested', () => {
    const base = fresh();
    const trafo = blockOf(base, 'transformador_forca');
    let snapshot = edit(base, trafo.id, notTested);
    snapshot = withPoints(snapshot, point(snapshot, { origin: 'not_tested', equipment_id: trafo.equipment_id, text: notTestedPointText(notTested(trafo)), action: null }));
    expect(pointsSummary(snapshot)).toEqual({ total: 1, semAcao: 0, naoEnsaiadas: 1 });
    expect(pointsSummaryText(pointsSummary(snapshot))).toBe('1 ponto · 1 não ensaiada');
    expect(pointsSummary({ ...snapshot, blocks: snapshot.blocks.map((block) => (block.id === trafo.id ? { ...block, not_tested: null } : block)) }).naoEnsaiadas).toBe(0);
  });

  it('a manual point written before contract 31 on an equipment with an NC row: no "possible duplicate" pre-issue row', () => {
    const base = fresh();
    const trafo = blockOf(base, 'transformador_forca');
    const snapshot = edit(base, trafo.id, (block) => ncRow(block, 0));
    const old = point(snapshot, { equipment_id: trafo.equipment_id, text: 'Terminais oxidados' });
    delete (old as Partial<PointRow>).item_key;
    const both = withPoints(snapshot, old);
    expect(preIssue(both).some((row) => (row.kind as string) === 'points_possible_duplicate')).toBe(false);
    expect(pointsSummary(both).total).toBe(1);
  });
});

describe('e24h-UNIT H2 and H4 the points a person creates', () => {
  it('"Criar ponto de atenção" on an NC row still starts with the row\'s text', () => {
    const base = fresh();
    const trafo = blockOf(base, 'transformador_forca');
    const snapshot = edit(base, trafo.id, (block) => ncRow(block, 0, 'oxidação nos terminais'));
    const label = findDefinition(trafo.seed_version, trafo.block_type)!.checklist![0]!;
    expect(ncRowPointText(snapshot, { block: snapshot.blocks.find((block) => block.id === trafo.id)! }, label.key)).toBe(`Item 1 (${label.label.toLocaleLowerCase('pt-BR')}): oxidação nos terminais`);
  });

  it('a point written from an NC row stays, prints and reads "Origem resolvida" once the row is back to C', () => {
    const base = fresh();
    const trafo = blockOf(base, 'transformador_forca');
    const key = findDefinition(trafo.seed_version, trafo.block_type)!.checklist![0]!.key;
    let snapshot = edit(base, trafo.id, (block) => ncRow(block, 0));
    const own = point(snapshot, { origin: 'nc', equipment_id: trafo.equipment_id, item_key: key, text: 'Item 1 não conforme' });
    snapshot = withPoints(snapshot, own);
    expect(sectionEightEntries(snapshot)).toEqual([{ kind: 'point', point: own }]);
    expect(resolvedOriginPoints(snapshot).size).toBe(0);
    const back = edit(snapshot, trafo.id, (block) => ({ ...block, sheet: { ...block.sheet, checklist: { ...block.sheet.checklist, [key]: { result: cell('C') } } } }));
    expect([...resolvedOriginPoints(back)]).toEqual([own.id]);
    expect(resolveSection8(back, new Map())).toHaveLength(1);
  });
});

describe('e24h-UNIT H3 no verdict moves', () => {
  // The verdicts of 72ed1f51 for each finding alone; the reason lines drop only the automatic point.
  const cases: [string, () => RelatorioSnapshot, string, string][] = [
    ['an NC row', () => { const base = fresh(); return edit(base, blockOf(base, 'transformador_forca').id, (block) => ncRow(block, 0)); }, 'apto_com_restricoes', 'O relatório exige no mínimo Apto com restrições: 1 com restrições.'],
    ['a site NC', () => siteNc(fresh()), 'apto_com_restricoes', 'O relatório exige no mínimo Apto com restrições: 1 NC nas verificações do local.'],
    ['a reading out', () => { const base = fresh(); return edit(base, blockOf(base, 'disjuntor_mt').id, insulationOut); }, 'nao_apto', 'O relatório exige no mínimo Não apto: 1 ficha reprovada (DJ-ENEL).'],
    ['a restricted reading', restrictedCableAlone, 'apto_com_restricoes', 'O relatório exige no mínimo Apto com restrições: 1 com restrições.'],
    ['a Reprovado by hand', () => { const base = fresh(); return edit(base, blockOf(base, 'transformador_forca').id, reprovadoByHand); }, 'nao_apto', 'O relatório exige no mínimo Não apto: 1 ficha reprovada (TR-1).'],
    ['a Não ensaiado sheet', () => { const base = fresh(); return edit(base, blockOf(base, 'transformador_forca').id, notTested); }, 'apto_com_restricoes', 'O relatório exige no mínimo Apto com restrições: 1 não ensaiada.'],
  ];
  for (const [name, build, verdict, reason] of cases) {
    it(`${name} alone: ${verdict}, its reason line naming a part`, () => {
      const snapshot = build();
      expect(derivedParecer(snapshot)).toBe(verdict);
      expect(effectiveParecer(snapshot)).toBe(verdict);
      expect(parecerReasonText(snapshot)).toBe(reason);
    });
  }
});

describe('e24h-UNIT H3 the fixtures keep every verdict of 72ed1f51', () => {
  // Measured on 72ed1f51: the parecer verdict, derived and effective, and the count of every live block's
  // effective conclusion pair (the section blocks read null/null).
  const fixtures: [string, () => RelatorioSnapshot, string, Record<string, number>][] = [
    ['Porto Seguro', () => buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId), 'nao_apto', { 'null/null': 3, 'aprovado/sem_restricoes': 73, 'reprovado/com_restricoes': 18 }],
    ['Porto Seguro small', () => buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId), 'apto_com_restricoes', { 'null/null': 1, 'aprovado/sem_restricoes': 2 }],
    // H9 (an observation never forces a restriction): its one tested ficha, Com restrições by its observation alone on
    // 72ed1f51, reads Aprovado · Sem restrições; the verdict holds (its untested sheet and its stored point).
    ['replay small', () => buildSnapshot(replay(replaySmall.log, { deadOpIds: replaySmall.deadOpIds }), replaySmall.relatorioId), 'apto_com_restricoes', { 'null/null': 2, 'aprovado/sem_restricoes': 1 }],
    ['company types', () => buildSnapshot(replay(companyTypes.log), companyTypes.relatorioId), 'nao_apto', { 'aprovado/sem_restricoes': 2, 'reprovado/com_restricoes': 1 }],
    ['layout lock v5', () => layoutLockSnapshot('v5'), 'nao_apto', { 'null/null': 11, 'aprovado/com_restricoes': 6, 'reprovado/com_restricoes': 3 }],
    ['layout lock v11', () => layoutLockSnapshot('v11'), 'nao_apto', { 'null/null': 11, 'aprovado/com_restricoes': 7, 'reprovado/com_restricoes': 3 }],
    ['layout lock v12', () => layoutLockSnapshot('v12'), 'nao_apto', { 'null/null': 11, 'aprovado/com_restricoes': 10, 'reprovado/com_restricoes': 1 }],
  ];
  for (const [name, build, verdict, pairs] of fixtures) {
    it(`${name}: ${verdict}, its pairs unchanged`, () => {
      const snapshot = build();
      expect(derivedParecer(snapshot)).toBe(verdict);
      expect(effectiveParecer(snapshot)).toBe(verdict);
      const ctx = snapshotDefinitionContext(snapshot);
      const counted: Record<string, number> = {};
      for (const block of snapshot.blocks.filter((one) => one.removed_at === null)) {
        const pair = effectiveConclusionPair(block, blockDefinitionIn(ctx, block), visitContextOf(snapshot, block));
        const key = `${pair.result}/${pair.restriction}`;
        counted[key] = (counted[key] ?? 0) + 1;
      }
      expect(counted).toEqual(pairs);
    });
  }
});
