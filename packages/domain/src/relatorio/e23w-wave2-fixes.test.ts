import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { readingSlotsOf } from '../print/reading-slots.ts';
import { section9Layout } from '../print/section-9.ts';
import { hasPointSource, resolvedOriginPoints } from '../points/derived.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell, PointRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition } from '../seed/definitions.ts';
import { restrictionSchema, type BlockDefinition } from '../seed/schema.ts';
import { TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import { composeConclusion, conclusionFloor } from './conclusion.ts';
import { composeParecer } from './parecer.ts';
import { evaluateSheetReadings, evaluateTest, worstReadings, type TestEvaluation } from './readings.ts';
import { failedPrerequisites } from './restriction.ts';
import { newEquipmentBlock } from './tree.ts';
import { NO_VISIT_CONTEXT, visitContextOf, type VisitContext } from './visit-context.ts';

/*
 * Fix batch e23w (the Epic 23 wave 2 fixes, seed v13): the arrester's failed prerequisite read whatever
 * its test's switch or applicability (W2-2), a stored restricao point standing while its rule still
 * flags a reading now out (W2-3), the parecer naming a prerequisite-only Reprovado (W2-K1), the TP
 * judged by Table 100.5 by its medium (Bruno's answer B-4) and a contact pole out by its rise since
 * the previous v13 visit (Bruno's answer B-6). Every value is invented.
 */

const id = (n: number) => `019966b0-0233-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(90_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });
const overRange = (raw: string, unit: string) => ({ raw, unit, state: 'over_range' as const });

function sheet(type: EquipmentBlockType, seedVersion = 'v13'): BlockRow {
  return newEquipmentBlock({
    definitions: EMPTY_DEFINITION_CONTEXT,
    blockId: id(1),
    equipmentId: id(2),
    relatorioId: TEST_RELATORIO,
    projectId: TEST_PROJECT,
    locationId: id(4),
    type,
    tag: 'T1',
    seedVersion,
    orderKey: 'a0',
  }).block;
}

const definitionOf = (block: Pick<BlockRow, 'seed_version' | 'block_type'>): BlockDefinition => getDefinition(block.seed_version, 'cabine_primaria', block.block_type);

function plate(block: BlockRow, values: Record<string, unknown>): BlockRow {
  const next = structuredClone(block);
  for (const [key, value] of Object.entries(values)) next.sheet.nameplate[key] = cell(value);
  return next;
}

function readings(block: BlockRow, testKey: string, cells: Record<string, unknown>): BlockRow {
  const next = structuredClone(block);
  const test = next.sheet.test[testKey] ?? { cells: {} };
  for (const [address, value] of Object.entries(cells)) {
    const [row, col] = address.split('/') as [string, string];
    test.cells[row] = { ...test.cells[row], [col]: cell(value) };
  }
  next.sheet.test[testKey] = test;
  return next;
}

/** The block with one test sub-block switched off: a new row object. */
function switchedOff(block: BlockRow, testKey: string): BlockRow {
  const next = structuredClone(block);
  const config = next.config as { sub_blocks: Record<string, { enabled: boolean }> };
  config.sub_blocks[testKey] = { enabled: false };
  return next;
}

function evaluation(block: BlockRow, testKey: string, visit: VisitContext = NO_VISIT_CONTEXT, definition: BlockDefinition = definitionOf(block)): TestEvaluation {
  return evaluateTest(block, definition, definition.tests.find((test) => test.key === testKey)!, visit);
}

const captures = (test: TestEvaluation) => test.tables.flatMap((table) => table.rows.map((row) => row.cells.find((one) => one.role === 'capture')!));
const verdicts = (test: TestEvaluation) => captures(test).map((one) => one.verdict);

function v13Snapshot(): RelatorioSnapshot {
  return structuredClone(layoutLockSnapshot('v13', { epic24: false }));
}
const blockOf = (snapshot: RelatorioSnapshot, type: string) => snapshot.blocks.find((block) => block.block_type === type && block.removed_at === null)!;
function editBlock(snapshot: RelatorioSnapshot, type: string, edit: (block: BlockRow) => void): BlockRow {
  const next = structuredClone(blockOf(snapshot, type));
  edit(next);
  snapshot.blocks = snapshot.blocks.map((block) => (block.id === next.id ? next : block));
  return next;
}

describe('e23w-UNIT W2-2 the arrester\'s failed disconnector is read whatever its test\'s switch or applicability', () => {
  const failing = plate(sheet('para_raio'), { desligador_integro: 'NÃO' });
  const definition = definitionOf(failing);

  it('the insulation test switched off: the floor is Reprovado by the prerequisite, one reading entry names it, the paragraph says it', () => {
    const off = switchedOff(failing, 'isolacao');
    expect(evaluateSheetReadings(off, definition).some((test) => test.testKey === 'isolacao')).toBe(false);
    expect(failedPrerequisites(off, definition)).toEqual([{ testKey: 'isolacao', title: 'Ensaio de isolação', text: 'pré-requisito não atendido (Desligador íntegro: NÃO)' }]);
    expect(conclusionFloor(off, definition)).toEqual({ pair: { result: 'reprovado', restriction: 'com_restricoes' }, reasons: ['prerequisite'] });
    expect(composeConclusion(off, definition, 'PR-1').text).toContain('pré-requisito não atendido (Desligador íntegro: NÃO) no ensaio de isolação');
  });

  it('the test made NA by the plate (a condition it does not meet): the same failure', () => {
    const conditioned: BlockDefinition = {
      ...definition,
      tests: definition.tests.map((test) => (test.key === 'isolacao' ? { ...test, applies_when: { field: 'involucro', op: 'in' as const, values: ['CERÂMICO'] } } : test)),
    };
    const na = plate(failing, { involucro: 'POLIMÉRICO' });
    expect(evaluateSheetReadings(na, conditioned).some((test) => test.testKey === 'isolacao')).toBe(false);
    expect(conclusionFloor(na, conditioned)!.reasons).toEqual(['prerequisite']);
  });

  it('with the test on, the result is the one it was: the evaluation carries the same failure, one floor reason, one clause', () => {
    const on = readings(failing, 'isolacao', { '0/1': measured('5', 'GΩ') });
    expect(evaluation(on, 'isolacao').prerequisite).toEqual({ failed: true, text: failedPrerequisites(on, definition)[0]!.text });
    expect(conclusionFloor(on, definition)!.reasons).toEqual(['prerequisite']);
    expect(composeConclusion(on, definition, 'PR-1').text.match(/pré-requisito não atendido/g)).toHaveLength(1);
  });

  it('SIM, empty or a v12 arrester: no failure', () => {
    for (const value of ['SIM', null]) {
      const block = switchedOff(plate(sheet('para_raio'), value === null ? {} : { desligador_integro: value }), 'isolacao');
      expect(failedPrerequisites(block, definitionOf(block)), String(value)).toEqual([]);
    }
    const v12 = sheet('para_raio', 'v12');
    expect(failedPrerequisites(v12, definitionOf(v12))).toEqual([]);
  });

  // Fix batch e24h: ~~section 8's reading entry of the switched-off test~~: the finding stands, no automatic point.
  it('on the snapshot: the switched-off test\'s prerequisite is a finding, and the parecer names the sheet by its prerequisite (W2-K1)', () => {
    const snapshot = v13Snapshot();
    const arrester = editBlock(snapshot, 'para_raio', (block) => {
      block.sheet.nameplate.desligador_integro = cell('NÃO');
      (block.config as { sub_blocks: Record<string, { enabled: boolean }> }).sub_blocks.isolacao = { enabled: false };
    });
    // The arrester alone: every other sheet removed, so the parecer's Reprovado sentence names only it.
    snapshot.blocks = snapshot.blocks.map((block) => (block.id !== arrester.id && block.equipment_id !== null ? { ...block, removed_at: '2026-11-09T10:00:00.000Z' } : block));
    expect(hasPointSource(snapshot)).toBe(true);
    const tag = snapshot.equipment.find((row) => row.id === arrester.equipment_id)!.tag;
    expect(composeParecer(snapshot).text).toContain(`1 ficha foi reprovada por pré-requisito do ensaio não atendido (${tag}).`);
  });
});

describe('e23w-UNIT W2-3 a stored restricao point stands while its rule still flags a reading now out', () => {
  it('a restricted cable phase driven out by its criterion: the point is not "Origem resolvida"; with no rule flagging any row it resolves', () => {
    const snapshot = v13Snapshot();
    const cable = editBlock(snapshot, 'cabos_entrada', (block) => {
      for (const [row, raw] of [['0', '5'], ['1', '5'], ['2', '1.5'], ['3', '5']] as const) block.sheet.test.isolacao!.cells[row]!['1'] = cell(measured(raw, 'GΩ'));
    });
    const point: PointRow = {
      id: id(700),
      relatorio_id: snapshot.relatorio.id,
      text: 'Ensaio de isolação: valor dentro do critério, com restrição (Fase C: abaixo de 50 % da maior leitura)',
      equipment_id: cable.equipment_id,
      origin: 'restricao',
      order_key: 'a0',
      removed_at: null,
      action: null,
      priority: null,
      deadline: null,
      owner: null,
      item_key: null,
      test_key: 'isolacao',
    };
    snapshot.points.push(point);
    expect(resolvedOriginPoints(snapshot).has(point.id)).toBe(false);
    // Phase C falls to 300 MΩ: out of > 400 MΩ, and still below 50 % of the largest row.
    const out = editBlock(snapshot, 'cabos_entrada', (block) => {
      block.sheet.test.isolacao!.cells['2']!['1'] = cell(measured('300', 'MΩ'));
    });
    const test = evaluation(out, 'isolacao', visitContextOf(snapshot, out));
    expect(verdicts(test)[2]).toBe('out');
    expect(captures(test)[2]!.restriction).toBeNull();
    expect(test.restrictionStands).toBe(true);
    expect(resolvedOriginPoints(snapshot).has(point.id)).toBe(false);
    // ~~Every phase out and alike: no rule flags any row, the point resolves.~~ Review of fix batch e24x (X3, D5): the test
    // still fails, so its `reading` finding is this point's test (one point per test): the point stands, as the sheet's
    // place names it. With every phase back within, nothing stands and it resolves.
    editBlock(snapshot, 'cabos_entrada', (block) => {
      for (const row of ['0', '1', '2', '3']) block.sheet.test.isolacao!.cells[row]!['1'] = cell(measured('300', 'MΩ'));
    });
    expect(resolvedOriginPoints(snapshot).has(point.id)).toBe(false);
    editBlock(snapshot, 'cabos_entrada', (block) => {
      for (const row of ['0', '1', '2', '3']) block.sheet.test.isolacao!.cells[row]!['1'] = cell(measured('5', 'GΩ'));
    });
    expect(resolvedOriginPoints(snapshot).has(point.id)).toBe(true);
  });

  it('a test with a restricted row and an out row (a reading entry, no restricao entry) keeps its restricao point standing', () => {
    const snapshot = v13Snapshot();
    const cable = editBlock(snapshot, 'cabos_entrada', (block) => {
      for (const [row, raw] of [['0', '5'], ['1', '5'], ['2', '1.5'], ['3', '0.3']] as const) block.sheet.test.isolacao!.cells[row]!['1'] = cell(measured(raw, 'GΩ'));
    });
    snapshot.points.push({ id: id(701), relatorio_id: snapshot.relatorio.id, text: 'x', equipment_id: cable.equipment_id, origin: 'restricao', order_key: 'a0', removed_at: null, action: null, priority: null, deadline: null, owner: null, item_key: null, test_key: 'isolacao' });
    expect(verdicts(evaluation(cable, 'isolacao'))).toContain('restricted');
    expect(resolvedOriginPoints(snapshot).has(id(701))).toBe(false);
  });

  it('v1 to v12 tests never carry the field', () => {
    const v12 = readings(sheet('cabos_entrada', 'v12'), 'isolacao', { '0/1': measured('5', 'GΩ'), '1/1': measured('0.3', 'GΩ') });
    expect('restrictionStands' in evaluation(v12, 'isolacao')).toBe(false);
  });
});

describe('e23w-UNIT B-4 the TP judged by Table 100.5 by its medium (TP-02)', () => {
  const tp = (values: Record<string, unknown>) => readings(plate(sheet('tp'), values), 'isolacao', { '0/1': measured('20', 'GΩ'), '1/1': measured('30', 'GΩ'), '2/1': measured('3', 'GΩ') });

  it('EPÓXI or Á SECO at 13,8 kV: every row ≥ 25.000 MΩ, the helper naming the table; 20 GΩ out', () => {
    for (const medium of ['EPÓXI', 'Á SECO']) {
      const test = evaluation(tp({ tipo_de_isolacao: medium, tensao_nominal_at: measured('13.8', 'kV') }), 'isolacao');
      expect(test.criterionText, medium).toBe('≥ 25.000 MΩ');
      expect(test.sourceName, medium).toBe('ANSI/NETA MTS-2023, Tabela 100.5');
      expect(test.tables[0]!.rows[0]!.criterionHelper, medium).toBe('Tabela 100.5 (ANSI/NETA MTS-2023), seco, 13,8 kV: ≥ 25.000 MΩ');
      expect(verdicts(test), medium).toEqual(['out', 'within', 'out']);
    }
  });

  it('ÓLEO MINERAL: the oil minimum (≥ 5.000 MΩ)', () => {
    const test = evaluation(tp({ tipo_de_isolacao: 'ÓLEO MINERAL', tensao_nominal_at: measured('13.8', 'kV') }), 'isolacao');
    expect(test.criterionText).toBe('≥ 5.000 MΩ');
    expect(verdicts(test)).toEqual(['within', 'within', 'out']);
  });

  it('the medium empty: v12\'s > 400 MΩ with the request for TIPO DE ISOLAÇÃO', () => {
    const test = evaluation(tp({ tensao_nominal_at: measured('13.8', 'kV') }), 'isolacao');
    expect(test.criterionText).toBe('>400 MΩ');
    expect(test.sourceLines).toEqual(['Sem o tipo de isolação na placa, vale >400 MΩ. Informe-o para julgar pela Tabela 100.5.']);
  });

  it('an AT typed "13,8/√3" is judged by its class voltage, 13.800 V; a 3,8 kV AT by the 5 kV row', () => {
    const sqrt3 = evaluation(tp({ tipo_de_isolacao: 'EPÓXI', tensao_nominal_at: measured('13.8/√3', 'kV') }), 'isolacao');
    expect(sqrt3.tables[0]!.rows[0]!.criterionHelper).toBe('Tabela 100.5 (ANSI/NETA MTS-2023), seco, 13,8 kV: ≥ 25.000 MΩ');
    const low = evaluation(tp({ tipo_de_isolacao: 'EPÓXI', tensao_nominal_at: measured('3.8/√3', 'kV') }), 'isolacao');
    expect(low.tables[0]!.rows[0]!.criterionHelper).toBe('Tabela 100.5 (ANSI/NETA MTS-2023), seco, 3,8 kV: ≥ 5.000 MΩ');
  });

  it('a v12 TP keeps > 400 MΩ whatever its plate', () => {
    const v12 = readings(plate(sheet('tp', 'v12'), { tipo_de_isolacao: 'EPÓXI', tensao_nominal_at: measured('13.8', 'kV') }), 'isolacao', { '0/1': measured('20', 'GΩ') });
    expect(evaluation(v12, 'isolacao').criterionText).toBe('>400 MΩ');
  });

  it('section 9 prints the row\'s minimum in the TP\'s ACEITÁVEL', () => {
    const snapshot = v13Snapshot();
    const block = editBlock(snapshot, 'tp', (edited) => {
      edited.sheet.nameplate.tipo_de_isolacao = cell('EPÓXI');
      edited.sheet.nameplate.tensao_nominal_at = cell(measured('13.8', 'kV'));
    });
    const printed = section9Layout(snapshot, 9, 'RESULTADOS')!.subsections.flatMap((subsection) => subsection.sheets).find((one) => one.blockId === block.id)!;
    const texts = printed.parts.flatMap((part) => (part.kind === 'table' ? part.table.rows.flatMap((row) => row.cells.map((one) => one.text)) : []));
    expect(texts).toContain('≥ 25.000 MΩ');
  });
});

describe('e23w-UNIT B-6 a contact pole more than 50 % above the previous v13 visit\'s is out (DJ-03, SC-03)', () => {
  const definition = getDefinition('v13', 'cabine_primaria', 'disjuntor_mt');
  const keys = readingSlotsOf(definition).filter((slot) => slot.testKey === 'resistencia_contato').map((slot) => slot.key);
  const previous = (values: (string | { raw: string; state: 'over_range' } | null)[], seedVersion = 'v13', unit = 'µΩ'): VisitContext => ({
    ambientC: null,
    previous: {
      relatorio_id: id(900),
      revision_number: 1,
      issued_at: '2026-11-05T15:00:00.000Z',
      seed_version: seedVersion,
      block_type: 'disjuntor_mt',
      readings: Object.fromEntries(
        values.flatMap((value, i) => (value === null ? [] : [[keys[i]!, typeof value === 'string' ? { raw: value, unit, state: 'measured' as const } : { raw: value.raw, unit, state: 'over_range' as const }]])),
      ),
    },
  });
  const poles = (values: string[], type: 'disjuntor_mt' | 'chave_seccionadora' = 'disjuntor_mt') =>
    readings(sheet(type), 'resistencia_contato', Object.fromEntries(values.map((value, row) => [`${row}/0`, value.startsWith('>') ? overRange(value.slice(1), 'µΩ') : measured(value, 'µΩ')])));

  it('pole A 40 then 61 µΩ (+52,5 %): out, the floor Reprovado, the reading entry and the paragraph name the pole and the rise', () => {
    const block = poles(['61', '45', '44']);
    const visit = previous(['40', '44', '44']);
    const test = evaluation(block, 'resistencia_contato', visit);
    expect(verdicts(test)).toEqual(['out', 'within', 'within']);
    const rise = 'alta de 52,5 % sobre 40 µΩ da manutenção anterior, rev. 1 de 05/11/2026, acima do limite de 50 %';
    expect(captures(test)[0]).toMatchObject({ rise: { reason: rise }, helperText: `Acima do aceitável: ${rise}`, restriction: null });
    expect(conclusionFloor(block, definition, visit)).toEqual({ pair: { result: 'reprovado', restriction: 'com_restricoes' }, reasons: ['reading'] });
    const worst = worstReadings(evaluateSheetReadings(block, definition, visit)).find((one) => one.testKey === 'resistencia_contato')!;
    expect(worst).toMatchObject({ verdict: 'out', valueText: '61 µΩ', rise });
    expect(composeConclusion(block, definition, 'DJ-1', visit).text).toContain(`resistência de contato máxima de 61 µΩ em T1-T2–Fase A (${rise})`);
    // 24.9-UNIT (F19): "Critérios usados" names the rise with the previous value, not "critério <250 µΩ"; the printed paragraph above is unchanged.
    const items = composeConclusion(block, definition, 'DJ-1', visit).criteriaItems;
    expect(items).toContain(`R_cont T1-T2–Fase A 61 µΩ · ${rise}`);
    expect(items.join(' · ')).not.toContain('critério <250 µΩ');
  });

  it('the bound is exclusive: 60 µΩ (exactly +50 %) and 59 µΩ are not out by this rule', () => {
    expect(verdicts(evaluation(poles(['60', '45', '44']), 'resistencia_contato', previous(['40', '44', '44'])))).toEqual(['within', 'within', 'within']);
    expect(verdicts(evaluation(poles(['59', '45', '44']), 'resistencia_contato', previous(['40', '44', '44'])))).toEqual(['within', 'within', 'within']);
    expect(verdicts(evaluation(poles(['60.01', '45', '44']), 'resistencia_contato', previous(['40', '44', '44'])))[0]).toBe('out');
    // Review fix: a rise just past the limit (+50,04 %) is shown rounded up, never as the limit itself.
    const just = captures(evaluation(poles(['60.016', '45', '44']), 'resistencia_contato', previous(['40', '44', '44'])))[0]!;
    expect(just.verdict).toBe('out');
    expect(just.rise!.reason).toMatch(/^alta de 50,1 % sobre 40 µΩ /);
  });

  it('no judgement: previous pole missing, previous 0, previous or current over range, previous visit on v12, no previous visit', () => {
    const block = poles(['61', '45', '44']);
    for (const [label, visit] of [
      ['missing', previous([null, '44', '44'])],
      ['zero', previous(['0', '44', '44'])],
      ['previous over range', previous([{ raw: '40', state: 'over_range' }, '44', '44'])],
      ['v12', previous(['40', '44', '44'], 'v12')],
      ['none', NO_VISIT_CONTEXT],
    ] as const) {
      expect(verdicts(evaluation(block, 'resistencia_contato', visit))[0], label).toBe('within');
    }
    expect(verdicts(evaluation(poles(['>2000', '45', '44']), 'resistencia_contato', previous(['40', '44', '44'])))[0]).toBe('out');
    expect(captures(evaluation(poles(['>2000', '45', '44']), 'resistencia_contato', previous(['40', '44', '44'])))[0]!.rise).toBeUndefined();
  });

  it('a previous value in mΩ compares in its own unit; the seccionadora too', () => {
    expect(verdicts(evaluation(poles(['61', '45', '44']), 'resistencia_contato', previous(['0.04', '0.044', '0.044'], 'v13', 'mΩ')))[0]).toBe('out');
    expect(verdicts(evaluation(poles(['61', '45', '44'], 'chave_seccionadora'), 'resistencia_contato', { ...previous(['40', '44', '44']), previous: { ...previous(['40', '44', '44']).previous!, block_type: 'chave_seccionadora' } }))[0]).toBe('out');
  });

  it('a pole both risen and deviating (61 over a lowest 40) is out, and the deviation keeps the restriction standing', () => {
    const test = evaluation(poles(['61', '40', '42']), 'resistencia_contato', previous(['40', '40', '42']));
    expect(verdicts(test)).toEqual(['out', 'within', 'within']);
    expect(test.restrictionStands).toBe(true);
  });

  it('a v12 disjuntor never judges by the previous visit', () => {
    const v12 = readings(sheet('disjuntor_mt', 'v12'), 'resistencia_contato', { '0/0': measured('61', 'µΩ') });
    expect(captures(evaluation(v12, 'resistencia_contato', previous(['40', '44', '44'])))[0]!.verdict).toBe('within');
  });

  it('the schema takes the key alone, in (0, 100)', () => {
    expect(restrictionSchema.safeParse({ history_rise_out_pct: 50, status: 'PADRÃO FASOR' }).success).toBe(true);
    expect(restrictionSchema.safeParse({ history_rise_out_pct: 100, status: 'PADRÃO FASOR' }).success).toBe(false);
    expect(restrictionSchema.safeParse({ history_rise_out_pct: 0, status: 'PADRÃO FASOR' }).success).toBe(false);
  });
});
