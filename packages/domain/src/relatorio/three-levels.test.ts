import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { blockReadings, lastResults } from '../print/last-results.ts';
import { readingSlotsOf, type PreviousResults } from '../print/reading-slots.ts';
import { resolveSection8 } from '../print/section-8.ts';
import { readingFitWidthEm, section9Layout, wordsWiderThanColumns, type PrintTable } from '../print/section-9.ts';
import { derivedPoints, resolvedOriginPoints } from '../points/derived.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell, PointRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import { addDraftTest, removeDraftEntry } from '../types/draft-edit.ts';
import { duplicateSeededType } from '../types/duplicate.ts';
import { validateTypeDraft } from '../types/validate.ts';
import { composeConclusion, conclusionFloor, conclusionFloorReasonText, conclusionTextState, effectiveConclusionPair } from './conclusion.ts';
import { composeParecer, derivedParecer, parecerCounts } from './parecer.ts';
import { preIssue } from './pre-issue.ts';
import { evaluateSheetReadings, evaluateTest, worstReadings, type TestEvaluation } from './readings.ts';
import { sheetProgress } from './sheet-progress.ts';
import { insulationFactorTo20, temperatureView, testTemperature, windingResistanceTo75 } from './temperature-correction.ts';
import { newEquipmentBlock } from './tree.ts';
import { NO_VISIT_CONTEXT, visitContextOf, type VisitContext } from './visit-context.ts';

/*
 * Batch e23v (Stories 23.5, 23.6 and 23.14, seed v13): the temperature correction to 20 °C, the third
 * level `restricted` and its rules, the previous visit judging, the contact's pole deviation, one test
 * per row of the spec's I/O matrix; the floor, the points, the parecer and sections 8 and 9 agreeing
 * on one v13 snapshot whose visit context changes the verdict; and v12 and v5 sheets unchanged with
 * any context. Every value is invented.
 */

const id = (n: number) => `019966b0-0230-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(80_000 + ++opCounter) });
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

/** The block with plate values written: a new row object, as every fold gives (the evaluation memos key on the row). */
function plate(block: BlockRow, values: Record<string, unknown>): BlockRow {
  const next = structuredClone(block);
  for (const [key, value] of Object.entries(values)) next.sheet.nameplate[key] = cell(value);
  return next;
}

/** The block with readings by `row/col` written: a new row object. */
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

function evaluation(block: BlockRow, testKey: string, visit: VisitContext = NO_VISIT_CONTEXT): TestEvaluation {
  const definition = definitionOf(block);
  return evaluateTest(block, definition, definition.tests.find((test) => test.key === testKey)!, visit);
}

const captures = (test: TestEvaluation) => test.tables.flatMap((table) => table.rows.map((row) => row.cells.find((one) => one.role === 'capture')!));
const verdicts = (test: TestEvaluation) => captures(test).map((one) => one.verdict);
const ambient = (celsius: number): VisitContext => ({ ambientC: celsius, previous: null });

/** A v13 oil transformer (ÓLEO MINERAL, 13,8 kV / 380 V: rows ≥ 5.000, ≥ 5.000 and ≥ 100 MΩ) with its oil temperature. */
const oilTransformer = (oilC: string | null, extra: Record<string, unknown> = {}) =>
  plate(sheet('transformador_forca'), {
    tipo_de_isolacao: 'ÓLEO MINERAL',
    tensao_nominal_at: measured('13.8', 'kV'),
    tensao_nominal_bt: measured('380', 'V'),
    ...(oilC === null ? {} : { temperatura_oleo_c: measured(oilC, '°C') }),
    ...extra,
  });

describe('23.5-UNIT the factors (Base rev08 table CORRECAO_TEMPERATURA, NETA 100.14 span)', () => {
  it('2^((t - 20)/h), h 10 for oil and 15 for solid: 1 at 20 °C, fractional temperatures, both ends of -10 °C to 110 °C corrected, none outside', () => {
    expect(insulationFactorTo20(20, 'oil')).toBe(1);
    expect(insulationFactorTo20(20, 'solid')).toBe(1);
    expect(insulationFactorTo20(40, 'oil')).toBe(4);
    expect(insulationFactorTo20(35, 'solid')).toBe(2);
    expect(insulationFactorTo20(27.5, 'oil')).toBeCloseTo(2 ** 0.75, 12);
    expect(insulationFactorTo20(-10, 'oil')).toBe(0.125);
    expect(insulationFactorTo20(110, 'solid')).toBe(64);
    for (const outside of [-10.5, 110.5, 111, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(insulationFactorTo20(outside, 'oil'), String(outside)).toBeNull();
      expect(insulationFactorTo20(outside, 'solid'), String(outside)).toBeNull();
    }
  });

  it('a winding resistance to 75 °C: r x (K + 75) / (K + t), K 235 for copper and 225 for aluminium (built for Story 23.15, not wired)', () => {
    expect(windingResistanceTo75(1, 20, 'Cu')).toBeCloseTo(310 / 255, 12);
    expect(windingResistanceTo75(1, 20, 'Al')).toBeCloseTo(300 / 245, 12);
    expect(windingResistanceTo75(2.5, 75, 'Cu')).toBeCloseTo(2.5, 12);
    expect(windingResistanceTo75(0.8, 35.5, 'Al')).toBeCloseTo((0.8 * 300) / 260.5, 12);
    expect(windingResistanceTo75(1, -235, 'Cu')).toBeNull();
    expect(windingResistanceTo75(Number.NaN, 20, 'Cu')).toBeNull();
  });
});

describe('23.5-UNIT a v13 insulation judged at 20 °C', () => {
  it('an oil unit at 40 °C on the plate: the AT row\'s 2 GΩ is 8 GΩ at 20 °C, judged within ≥ 5.000 MΩ; the line, the card and the print name the oil', () => {
    const test = evaluation(readings(oilTransformer('40'), 'isolacao', { '0/1': measured('2', 'GΩ') }), 'isolacao');
    const [at] = captures(test);
    expect(at!.corrected).toEqual({ raw: '8', unit: 'GΩ', text: '8 GΩ' });
    expect(at!.verdict).toBe('within');
    expect(at!.helperText).toBeNull();
    expect(test.temperature).toEqual({
      state: 'corrected',
      line: { label: 'Temperatura', value: '40 °C', note: 'do óleo, na placa · as leituras são julgadas corrigidas a 20 °C' },
      print: '40 °C (ÓLEO)',
      header: 'Corrigido a 20 °C',
      printHeader: '20 °C',
      cellLead: 'A 20 °C:',
    });
    // The rows not measured carry no corrected value; the raw reading would have been out.
    expect(captures(test).slice(1).map((one) => one.corrected)).toEqual([null, null]);
    expect(verdicts(evaluation(readings(oilTransformer(null), 'isolacao', { '0/1': measured('2', 'GΩ') }), 'isolacao'))).toEqual(['out', null, null]);
  });

  it('a dry unit (EPÓXI) reads its winding temperature with the solid factor; the oil field, excused on it, is never read', () => {
    const dry = plate(sheet('transformador_forca'), {
      tipo_de_isolacao: 'EPÓXI',
      tensao_nominal_at: measured('13.8', 'kV'),
      tensao_nominal_bt: measured('380', 'V'),
      temperatura_oleo_c: measured('80', '°C'),
      temperatura_enrolamento_c: measured('32', '°C'),
    });
    const test = evaluation(readings(dry, 'isolacao', { '0/1': measured('30', 'GΩ') }), 'isolacao');
    const factor = 2 ** (12 / 15);
    expect(Number(captures(test)[0]!.corrected!.raw)).toBeCloseTo(Number((30 * factor).toPrecision(3)), 9);
    expect(captures(test)[0]!.corrected!.text).toBe('52,2 GΩ');
    expect(test.temperature!.print).toBe('32 °C (ENROLAMENTO)');
    expect(test.temperature!.line.note).toBe('do enrolamento, na placa · as leituras são julgadas corrigidas a 20 °C');
  });

  it('the plate field empty, the cabine\'s ambient stands in (AMBIENTE); the disjuntor and the seccionadora read the ambient alone, with the solid factor', () => {
    const test = evaluation(readings(oilTransformer(null), 'isolacao', { '0/1': measured('2', 'GΩ') }), 'isolacao', ambient(25));
    expect(test.temperature).toMatchObject({ state: 'corrected', print: '25 °C (AMBIENTE)', line: { value: '25 °C', note: 'do ambiente de ensaio, no local · as leituras são julgadas corrigidas a 20 °C' } });
    expect(Number(captures(test)[0]!.corrected!.raw)).toBe(Number((2 * 2 ** 0.5).toPrecision(3)));
    for (const type of ['disjuntor_mt', 'chave_seccionadora'] as const) {
      const solid = evaluation(readings(sheet(type), 'isolacao', { '0/0': measured('3', 'GΩ'), '3/0': measured('400', 'MΩ') }), 'isolacao', ambient(35));
      expect(solid.temperature, type).toMatchObject({ state: 'corrected', print: '35 °C (AMBIENTE)' });
      expect(captures(solid).map((one) => one.corrected?.text ?? null), type).toEqual(['6 GΩ', null, null, '800 MΩ', null, null]);
    }
  });

  it('no temperature anywhere: the raw value is judged, the line asks for it, the print reads "-" and no cell is corrected', () => {
    const test = evaluation(readings(oilTransformer(null), 'isolacao', { '0/1': measured('2', 'GΩ') }), 'isolacao');
    expect(test.temperature).toMatchObject({
      state: 'missing_temperature',
      line: { value: '—', note: 'Informe a temperatura do óleo na placa ou a do ambiente de ensaio no local: sem ela, as leituras são julgadas sem correção a 20 °C.' },
      print: '-',
    });
    expect(captures(test)[0]!.corrected).toBeNull();
    expect(captures(test)[0]!.helperText).toBe('Abaixo do aceitável (≥ 5.000 MΩ)');
    expect(evaluation(sheet('disjuntor_mt'), 'isolacao').temperature!.line.note).toBe('Informe a temperatura do ambiente de ensaio no local: sem ela, as leituras são julgadas sem correção a 20 °C.');
  });

  it('the bounds: 20 °C corrects by 1, 27,5 °C and both ends correct, -10,5 °C and 111 °C are out of the table (raw judged, the line says so)', () => {
    const at = (celsius: string) => evaluation(readings(oilTransformer(celsius), 'isolacao', { '0/1': measured('2', 'GΩ') }), 'isolacao');
    expect(captures(at('20'))[0]!.corrected!.raw).toBe('2');
    expect(captures(at('27.5'))[0]!.corrected!.raw).toBe('3.36');
    expect(at('27.5').temperature!.line.value).toBe('27,5 °C');
    expect(captures(at('-10'))[0]!.corrected!.raw).toBe('0.25');
    expect(captures(at('110'))[0]!.corrected!.raw).toBe('1020');
    for (const outside of ['-10.5', '111']) {
      const test = at(outside);
      expect(test.temperature!.state, outside).toBe('out_of_range');
      expect(test.temperature!.line.note, outside).toBe('do óleo, na placa · fora da tabela de correção (-10 °C a 110 °C): as leituras são julgadas sem correção');
      expect(captures(test)[0]!.corrected, outside).toBeNull();
      expect(captures(test)[0]!.verdict, outside).toBe('out');
    }
  });

  it('the medium unknown (TIPO DE ISOLAÇÃO empty): no correction, the line asks for it, whatever temperature there is', () => {
    const unknown = plate(sheet('transformador_forca'), { temperatura_oleo_c: measured('40', '°C') });
    const test = evaluation(readings(unknown, 'isolacao', { '0/1': measured('2', 'GΩ') }), 'isolacao', ambient(30));
    expect(test.temperature).toMatchObject({ state: 'missing_medium', print: '-', line: { value: '—', note: 'Informe o tipo de isolação na placa: sem ele, as leituras são julgadas sem correção a 20 °C.' } });
    expect(captures(test)[0]!.corrected).toBeNull();
  });

  it('a reading above the instrument\'s limit is never corrected (Story 23.4 rules it); its corrected cell is null', () => {
    const test = evaluation(readings(oilTransformer('40'), 'isolacao', { '0/1': overRange('2', 'TΩ') }), 'isolacao');
    expect(captures(test)[0]).toMatchObject({ state: 'over_range', verdict: 'within', corrected: null });
  });

  it('a corrected reading still out names its value at 20 °C', () => {
    const test = evaluation(readings(oilTransformer('10'), 'isolacao', { '0/1': measured('8', 'GΩ') }), 'isolacao');
    expect(captures(test)[0]).toMatchObject({ verdict: 'out', corrected: { raw: '4', text: '4 GΩ' }, helperText: 'Abaixo do aceitável a 20 °C: 4 GΩ (≥ 5.000 MΩ)' });
  });

  it('a v13 cable, TC, TP and arrester carry no correction: no line, no corrected cell, raw judged as before', () => {
    for (const type of ['cabos_entrada', 'tc', 'tp', 'para_raio'] as const) {
      const test = evaluation(readings(sheet(type), 'isolacao', { '0/1': measured('500', 'MΩ') }), 'isolacao', ambient(40));
      expect(test.temperature, type).toBeUndefined();
      expect('corrected' in captures(test)[0]!, type).toBe(false);
      expect(captures(test)[0]!.verdict, type).toBe('within');
    }
    expect(testTemperature(sheet('tc'), definitionOf(sheet('tc')), definitionOf(sheet('tc')).tests[0]!, ambient(40))).toBeNull();
    expect(temperatureView(definitionOf(sheet('tc')).tests[0]!, null)).toBeNull();
  });
});

describe('23.6-UNIT the comparison between phases and units (CB-02, PR-02)', () => {
  it('a cable at 5, 5 and 1,5 GΩ (all above 400 MΩ): phase C is restricted, below 50 % of the largest other row', () => {
    const cable = readings(sheet('cabos_entrada'), 'isolacao', { '0/1': measured('5', 'GΩ'), '1/1': measured('5', 'GΩ'), '2/1': measured('1.5', 'GΩ') });
    const test = evaluation(cable, 'isolacao');
    expect(verdicts(test)).toEqual(['within', 'within', 'restricted', null]);
    expect(captures(test)[2]!.restriction).toEqual({
      reason: 'abaixo de 50 % da maior leitura',
      text: 'abaixo de 50 % da maior leitura (Fase A: 5 GΩ). Dentro do aceitável; a conclusão sobe para Com restrições.',
    });
    expect(captures(test).map((one) => one.restriction ?? null)).toEqual([null, null, captures(test)[2]!.restriction, null]);
    expect(captures(test)[2]!.helperText).toBeNull();
    const definition = definitionOf(cable);
    expect(conclusionFloor(cable, definition)).toEqual({ pair: { result: 'aprovado', restriction: 'com_restricoes' }, reasons: ['restriction'] });
    expect(conclusionFloorReasonText(cable, definition)).toBe('A ficha exige no mínimo Aprovado · Com restrições: leitura com restrição.');
  });

  it('the bound is exclusive: exactly 50 % of the largest is within, one step below is restricted; FASE RESERVA counts as a row', () => {
    const at = (c: string, reserva?: string) =>
      verdicts(evaluation(readings(sheet('cabos_saida'), 'isolacao', { '0/1': measured('5', 'GΩ'), '1/1': measured('4', 'GΩ'), '2/1': measured(c, 'GΩ'), ...(reserva === undefined ? {} : { '3/1': measured(reserva, 'GΩ') }) }), 'isolacao'))[2];
    expect(at('2.5')).toBe('within');
    expect(at('2.49')).toBe('restricted');
    expect(at('3', '8')).toBe('restricted');
    expect(at('2.51')).toBe('within');
  });

  it('the arrester at 10, 10 and 4 GΩ: the 4 GΩ unit is restricted (below 50 % of the largest unit)', () => {
    const arrester = readings(sheet('para_raio'), 'isolacao', { '0/1': measured('10', 'GΩ'), '1/1': measured('10', 'GΩ'), '2/1': measured('4', 'GΩ') });
    expect(verdicts(evaluation(arrester, 'isolacao'))).toEqual(['within', 'within', 'restricted', null]);
  });

  it('a reading above the limit enters at its limit, a lower bound: it can make another row restricted, is never restricted itself, and an uncertain case restricts nothing', () => {
    // "> 2 TΩ" is at least 2 TΩ: 0,5 TΩ is certainly below 50 % of it.
    const certain = evaluation(readings(sheet('cabos_entrada'), 'isolacao', { '0/1': overRange('2', 'TΩ'), '1/1': measured('500', 'GΩ'), '2/1': measured('1.2', 'TΩ') }), 'isolacao');
    expect(verdicts(certain)).toEqual(['within', 'restricted', 'within', null]);
    expect(captures(certain)[1]!.restriction!.text).toBe('abaixo de 50 % da maior leitura (Fase A: > 2 TΩ). Dentro do aceitável; a conclusão sobe para Com restrições.');
    // A limit far below the others is never restricted, whatever its value may be.
    const low = evaluation(readings(sheet('cabos_entrada'), 'isolacao', { '0/1': overRange('500', 'MΩ'), '1/1': measured('5', 'GΩ'), '2/1': measured('5', 'GΩ') }), 'isolacao');
    expect(verdicts(low)).toEqual(['within', 'within', 'within', null]);
  });
});

describe('23.6-UNIT the previous visit judges (TR-OL-02 history), only when both visits are corrected', () => {
  const definition = getDefinition('v13', 'cabine_primaria', 'transformador_forca');
  const atKey = readingSlotsOf(definition).find((slot) => slot.testKey === 'isolacao' && slot.row === 0)!.key;
  const previous = (reading: PreviousResults['readings'][string]): VisitContext => ({
    ambientC: null,
    previous: { relatorio_id: id(900), revision_number: 1, issued_at: '2026-11-05T15:00:00.000Z', seed_version: 'v13', block_type: 'transformador_forca', readings: { [atKey]: reading } },
  });
  const corrected = (raw: string) => ({ raw: '2.5', unit: 'GΩ', state: 'measured' as const, corrected: { raw, unit: 'GΩ' } });
  /**
   * An oil transformer at 20 °C with no plate voltage: every row takes the seeded > 400 MΩ, so the readings below stay within;
   * its vector group named, so its empty TTR waits for nothing.
   */
  const atTwenty = (celsius: string | null = '20') =>
    plate(sheet('transformador_forca'), { tipo_de_isolacao: 'ÓLEO MINERAL', ligacao_secundaria: 'Dyn1', ...(celsius === null ? {} : { temperatura_oleo_c: measured(celsius, '°C') }) });

  it('the AT row at 4 GΩ at 20 °C after 10 GΩ at 20 °C (a 60 % drop): restricted, the helper naming the previous revision and value', () => {
    const tf = readings(atTwenty(), 'isolacao', { '0/1': measured('4', 'GΩ') });
    const test = evaluation(tf, 'isolacao', previous(corrected('10')));
    expect(captures(test)[0]).toMatchObject({
      verdict: 'restricted',
      corrected: { raw: '4' },
      restriction: {
        reason: 'queda de mais de 50 % desde a manutenção anterior',
        text: 'caiu mais de 50 % desde a manutenção anterior (10 GΩ a 20 °C, rev. 1, 05/11/2026). Dentro do aceitável; a conclusão sobe para Com restrições.',
      },
    });
    expect(conclusionFloor(tf, definition, previous(corrected('10')))!.pair).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
    // Without the context the same sheet is within: the previous visit is the context's.
    expect(conclusionFloor(tf, definition)!.pair).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
  });

  it('the bound is exclusive: a drop of exactly 50 % is within, a step past it restricted; a previous value in MΩ compares scaled', () => {
    const at = (now: string, before: { raw: string; unit: string }) =>
      captures(evaluation(readings(atTwenty(), 'isolacao', { '0/1': measured(now, 'GΩ') }), 'isolacao', previous({ raw: '1', unit: 'GΩ', state: 'measured', corrected: before })))[0]!.verdict;
    expect(at('5', { raw: '10', unit: 'GΩ' })).toBe('within');
    expect(at('4.99', { raw: '10', unit: 'GΩ' })).toBe('restricted');
    expect(at('5', { raw: '10000', unit: 'MΩ' })).toBe('within');
    expect(at('4.99', { raw: '10000', unit: 'MΩ' })).toBe('restricted');
  });

  it('not judged when the previous visit carries no corrected value (v12), when the reading is not corrected, or with no previous visit', () => {
    const v12Previous = previous({ raw: '10', unit: 'GΩ', state: 'measured' });
    expect(captures(evaluation(readings(atTwenty(), 'isolacao', { '0/1': measured('4', 'GΩ') }), 'isolacao', v12Previous))[0]!.verdict).toBe('within');
    // No temperature: the reading is not corrected, so nothing compares.
    expect(captures(evaluation(readings(atTwenty(null), 'isolacao', { '0/1': measured('4', 'GΩ') }), 'isolacao', previous(corrected('20'))))[0]!.verdict).toBe('within');
    expect(captures(evaluation(readings(atTwenty(), 'isolacao', { '0/1': measured('4', 'GΩ') }), 'isolacao'))[0]!.verdict).toBe('within');
  });

  it('a reading out of its criterion stays out: a rule runs only on a reading within', () => {
    // ≥ 5.000 MΩ at 13,8 kV: 3 GΩ is out, whatever it fell from.
    const test = evaluation(readings(oilTransformer('20'), 'isolacao', { '0/1': measured('3', 'GΩ') }), 'isolacao', previous(corrected('10')));
    expect(captures(test)[0]).toMatchObject({ verdict: 'out', restriction: null });
  });
});

describe('23.6-UNIT the arrester\'s disconnector prerequisite (PR-02)', () => {
  it('DESLIGADOR ÍNTEGRO NÃO fails the test: the floor is Reprovado, readings within or none; SIM or empty has no effect', () => {
    const failing = plate(sheet('para_raio'), { desligador_integro: 'NÃO' });
    const definition = definitionOf(failing);
    expect(evaluation(failing, 'isolacao').prerequisite).toEqual({ failed: true, text: 'pré-requisito não atendido (Desligador íntegro: NÃO)' });
    expect(conclusionFloor(failing, definition)).toEqual({ pair: { result: 'reprovado', restriction: 'com_restricoes' }, reasons: ['prerequisite'] });
    const measuredFailing = readings(failing, 'isolacao', { '0/1': measured('5', 'GΩ') });
    expect(conclusionFloor(measuredFailing, definition)).toEqual({ pair: { result: 'reprovado', restriction: 'com_restricoes' }, reasons: ['prerequisite'] });
    expect(conclusionFloorReasonText(measuredFailing, definition)).toBe('A ficha exige no mínimo Reprovado · Com restrições: pré-requisito do ensaio não atendido.');
    expect(composeConclusion(measuredFailing, definition, 'PR-1').text).toContain('apresentou pré-requisito não atendido (Desligador íntegro: NÃO) no ensaio de isolação');
    for (const value of ['SIM', null]) {
      const block = readings(plate(sheet('para_raio'), value === null ? {} : { desligador_integro: value }), 'isolacao', { '0/1': measured('5', 'GΩ') });
      expect(evaluation(block, 'isolacao').prerequisite, String(value)).toBeNull();
      expect(conclusionFloor(block, definition)!.pair.result, String(value)).toBe('aprovado');
    }
  });
});

describe('23.14-UNIT contact resistance: the pole deviation over the lowest pole (DJ-03, SC-03)', () => {
  const poles = (type: 'disjuntor_mt' | 'chave_seccionadora', values: string[]) =>
    readings(sheet(type), 'resistencia_contato', Object.fromEntries(values.map((value, row) => [`${row}/0`, value.startsWith('>') ? overRange(value.slice(1), 'µΩ') : measured(value, 'µΩ')])));

  it('40, 42 and 70 µΩ with no manufacturer\'s value: all within 250 µΩ, the 70 µΩ pole restricted (75 % over 40), the floor Com restrições', () => {
    for (const type of ['disjuntor_mt', 'chave_seccionadora'] as const) {
      const block = poles(type, ['40', '42', '70']);
      const test = evaluation(block, 'resistencia_contato');
      expect(verdicts(test), type).toEqual(['within', 'within', 'restricted']);
      expect(captures(test)[2]!.restriction, type).toEqual({
        reason: 'mais de 50 % acima do menor polo',
        text: 'mais de 50 % acima do menor polo (T1-T2: 40 µΩ). Dentro do aceitável; a conclusão sobe para Com restrições.',
      });
      expect(conclusionFloor(block, definitionOf(block))!.pair, type).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
    }
  });

  it('the bound is exclusive: 60 µΩ (exactly 50 % over 40) is within, 60,01 µΩ restricted', () => {
    expect(verdicts(evaluation(poles('disjuntor_mt', ['40', '60', '45']), 'resistencia_contato'))).toEqual(['within', 'within', 'within']);
    expect(verdicts(evaluation(poles('disjuntor_mt', ['40', '60.01', '45']), 'resistencia_contato'))).toEqual(['within', 'restricted', 'within']);
  });

  it('a pole at 0 µΩ is no reference (review fix): over 0, 40 and 70 µΩ the 70 µΩ pole is restricted against 40', () => {
    const test = evaluation(poles('disjuntor_mt', ['0', '40', '70']), 'resistencia_contato');
    expect(verdicts(test)).toEqual(['within', 'within', 'restricted']);
    expect(captures(test)[2]!.restriction!.text).toMatch(/^mais de 50 % acima do menor polo \([^:]+: 40 µΩ\)\. /);
  });

  it('with the manufacturer\'s 60 µΩ the 70 µΩ pole is out and the floor Reprovado (Story 23.3 prevails; out outranks restricted)', () => {
    const block = poles('disjuntor_mt', ['40', '42', '70']);
    block.sheet.test.resistencia_contato = { ...block.sheet.test.resistencia_contato!, criterion_override: cell(measured('60', 'µΩ')) };
    expect(verdicts(evaluation(block, 'resistencia_contato'))).toEqual(['within', 'within', 'out']);
    expect(conclusionFloor(block, definitionOf(block))).toEqual({ pair: { result: 'reprovado', restriction: 'com_restricoes' }, reasons: ['reading'] });
  });

  it('a pole above the instrument\'s limit is out by its criterion, never the lowest: the other poles compare among themselves', () => {
    expect(verdicts(evaluation(poles('disjuntor_mt', ['>2000', '40', '70']), 'resistencia_contato'))).toEqual(['out', 'within', 'restricted']);
  });
});

describe('23.6-UNIT the conclusion, the points and the worst reading read the levels', () => {
  it('the composed paragraph names a restricted reading and a value judged at 20 °C; its basis adds keys only where present', () => {
    const cable = readings(sheet('cabos_entrada'), 'isolacao', { '0/1': measured('5', 'GΩ'), '1/1': measured('5', 'GΩ'), '2/1': measured('1.5', 'GΩ') });
    const composed = composeConclusion(cable, definitionOf(cable), 'CB-1');
    expect(composed.text).toBe(
      'Os cabos de entrada CB-1 apresentaram valores medidos dentro dos critérios de aceitação, com restrição no ensaio de isolação (Fase C: abaixo de 50 % da maior leitura), sem itens verificados registrados. Recomenda-se a correção dos pontos indicados antes da próxima manutenção.',
    );
    const tf = readings(oilTransformer('10'), 'isolacao', { '0/1': measured('8', 'GΩ') });
    const worst = worstReadings(evaluateSheetReadings(tf, definitionOf(tf)));
    expect(worst[0]).toMatchObject({ testKey: 'isolacao', valueText: '4 GΩ a 20 °C', verdict: 'out' });
    expect(composeConclusion(tf, definitionOf(tf), 'TR-1').text).toContain('resistência de isolação mínima de 4 GΩ a 20 °C em Primário–Massa');
  });

  it('the worst reading ranks out over restricted over within', () => {
    const cable = readings(sheet('cabos_entrada'), 'isolacao', { '0/1': measured('5', 'GΩ'), '1/1': measured('1', 'GΩ'), '2/1': measured('2.4', 'GΩ'), '3/1': measured('900', 'MΩ') });
    // 900 MΩ is lower, but 1 GΩ and 2,4 GΩ are restricted (below 2,5 GΩ) and 900 MΩ too: the lowest restricted wins.
    expect(worstReadings(evaluateSheetReadings(cable, definitionOf(cable)))[0]).toMatchObject({ valueText: '900 MΩ', verdict: 'restricted' });
    const one = readings(sheet('cabos_entrada'), 'isolacao', { '0/1': measured('5', 'GΩ'), '1/1': measured('5', 'GΩ'), '2/1': measured('2.4', 'GΩ'), '3/1': measured('4', 'GΩ') });
    expect(worstReadings(evaluateSheetReadings(one, definitionOf(one)))[0]).toMatchObject({ valueText: '2,4 GΩ', verdict: 'restricted' });
  });
});

// --- one v13 snapshot: every reader agrees under the visit context -------------------------------

/** The synthetic v13 relatório of the layout-lock fixture, cloned so a test edits its rows freely. */
function v13Snapshot(): RelatorioSnapshot {
  return structuredClone(layoutLockSnapshot('v13'));
}

const blockOf = (snapshot: RelatorioSnapshot, type: string) => snapshot.blocks.find((block) => block.block_type === type && block.removed_at === null)!;

/** Replaces a block of the snapshot by an edited clone (rows are immutable: the memos key on the row object) and returns it. */
function editBlock(snapshot: RelatorioSnapshot, type: string, edit: (block: BlockRow) => void): BlockRow {
  const next = structuredClone(blockOf(snapshot, type));
  edit(next);
  snapshot.blocks = snapshot.blocks.map((block) => (block.id === next.id ? next : block));
  return next;
}
const cabineOfSnapshot = (snapshot: RelatorioSnapshot) => snapshot.locations.find((location): location is Extract<RelatorioSnapshot['locations'][number], { kind: 'cabine' }> => location.kind === 'cabine')!;

describe('23.5/23.6-UNIT one v13 snapshot whose visit context changes the verdict: floor, points, parecer, progress and sections 8 and 9 agree', () => {
  it('the transformer\'s 2,5 GΩ AT row, out raw, is within at the cabine\'s 40 °C: no reprovado anywhere, the print names the ambient and the corrected value', () => {
    const snapshot = v13Snapshot();
    // The plate's oil temperature cleared, so the ambient stands in; the AT row at 2 GΩ (out of ≥ 5.000 MΩ raw); the
    // conclusion stored as the engineer's; the TTR (its rule-made readings fail it) left empty, so the insulation decides.
    const tf = editBlock(snapshot, 'transformador_forca', (block) => {
      delete block.sheet.nameplate.temperatura_oleo_c;
      delete block.sheet.test.relacao_transformacao;
      block.sheet.test.isolacao!.cells['0']!['1'] = cell(measured('2', 'GΩ'));
      block.sheet.conclusion.result = cell('aprovado');
      block.sheet.conclusion.restriction = cell('com_restricoes');
    });
    cabineOfSnapshot(snapshot).env.temperature_c = measured('40', '°C');
    const definition = definitionOf(tf);
    const visit = visitContextOf(snapshot, tf);
    expect(visit.ambientC).toBe(40);
    // The raw judgement (no context) would fail the sheet; under its context it does not.
    expect(conclusionFloor(tf, definition)!.pair.result).toBe('reprovado');
    expect(conclusionFloor(tf, definition, visit)!.pair).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
    expect(effectiveConclusionPair(tf, definition, visit).result).toBe('aprovado');
    // Points: no out entry for the transformer's insulation.
    const entries = derivedPoints(snapshot);
    expect(entries.some((entry) => entry.key === `reading:${tf.id}:isolacao`)).toBe(false);
    // The parecer names the transformer with a restriction (its NC row), never reprovada.
    const tag = snapshot.equipment.find((row) => row.id === tf.equipment_id)!.tag;
    expect(parecerCounts(snapshot).reprovado).not.toContain(tag);
    expect(parecerCounts(snapshot).withRestriction).toContain(tag);
    // The progress counts no reading out of its limit on the sheet.
    expect(sheetProgress(snapshot, tf.id).steps.ensaios.outOfLimit).toBe(0);
    // Section 8: no out bullet for it.
    expect(resolveSection8(snapshot, new Map()).some((bullet) => bullet.text.startsWith('Ensaio fora do critério') && bullet.text.includes(tag))).toBe(false);
    // Section 9: TEMPERATURA from the ambient, the corrected column, the X on APROVADO.
    const layout = section9Layout(snapshot, 9, 'RESULTADOS');
    const printed = layout!.subsections.flatMap((subsection) => subsection.sheets).find((one) => one.blockId === tf.id)!;
    const tables = printed.parts.flatMap((part) => (part.kind === 'table' ? [part.table] : []));
    const header = tables.find((table) => table.rows.some((row) => row.cells.some((one) => one.text === 'TEMPERATURA')))!;
    expect(header.rows[1]!.cells.map((one) => one.text)).toEqual(['INSTRUM./FABRIC.', 'TIPO', 'Nº SÉRIE', 'RBC', 'TENSÃO ENSAIO', 'TEMPERATURA', 'ACEITÁVEL']);
    expect(header.rows[2]!.cells[5]!.text).toBe('40 °C (AMBIENTE)');
    const insulationTable = tables.find((table) => table.rows.some((row) => row.cells.some((one) => one.text === '20 °C')))!;
    const bottom = insulationTable.rows.find((row) => row.header === true && row.cells.some((one) => one.text === '20 °C'))!;
    const col = bottom.cells.findIndex((one) => one.text === '20 °C');
    expect(bottom.cells[col - 1]!.text).toBe('1 MINUTO');
    const data = insulationTable.rows.filter((row) => row.header !== true && row.band !== true);
    expect(data.map((row) => row.cells[col]!.text)).toEqual(['8', '10.400', '10.800']);
    const conclusion = tables.find((table) => table.rows[0]!.cells[0]!.text === 'CONCLUSÃO')!;
    expect(conclusion.rows[1]!.cells.map((one) => one.text)).toEqual(['APROVADO', 'X', 'REPROVADO', '', 'SEM RESTRIÇÕES', '', 'COM RESTRIÇÕES (VER OBSERVAÇÕES)', 'X']);
  });

  it('a restricted cable derives one restricao entry naming the test and the phase; a stored restricao point suppresses it, and resolves once the reading is corrected', () => {
    const snapshot = v13Snapshot();
    const cable = editBlock(snapshot, 'cabos_entrada', (block) => {
      for (const [row, raw] of [['0', '5'], ['1', '5'], ['2', '1.5'], ['3', '5']] as const) block.sheet.test.isolacao!.cells[row]!['1'] = cell(measured(raw, 'GΩ'));
    });
    const key = `restricao:${cable.id}:isolacao`;
    const entry = derivedPoints(snapshot).find((one) => one.key === key)!;
    expect(entry).toMatchObject({ kind: 'restricao', test_key: 'isolacao', equipment_id: cable.equipment_id, text: 'Ensaio de isolação: valor dentro do critério, com restrição (Fase C: abaixo de 50 % da maior leitura)' });
    const section8 = resolveSection8(snapshot, new Map()).find((bullet) => bullet.kind === 'derived' && bullet.keys.includes(key))!;
    expect(section8.text).toBe(`Ensaio com restrição: ${entry.title}. Ensaio de isolação: valor dentro do critério, com restrição (Fase C: abaixo de 50 % da maior leitura).`);
    const point: PointRow = {
      id: id(700),
      relatorio_id: snapshot.relatorio.id,
      text: entry.text,
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
    expect(derivedPoints(snapshot).some((one) => one.key === key)).toBe(false);
    expect(resolvedOriginPoints(snapshot).has(point.id)).toBe(false);
    editBlock(snapshot, 'cabos_entrada', (block) => {
      block.sheet.test.isolacao!.cells['2']!['1'] = cell(measured('4', 'GΩ'));
    });
    expect(resolvedOriginPoints(snapshot).has(point.id)).toBe(true);
  });

  it('a cable alone, restricted and otherwise clean: the parecer is Apto com restrições', () => {
    const snapshot = v13Snapshot();
    const cable = editBlock(snapshot, 'cabos_entrada', (block) => {
      for (const entry of Object.values(block.sheet.checklist)) {
        entry.result = cell('C');
        delete entry.observation;
      }
      block.sheet.observations = null;
      for (const [row, raw] of [['0', '5'], ['1', '5'], ['2', '1.5'], ['3', '5']] as const) block.sheet.test.isolacao!.cells[row]!['1'] = cell(measured(raw, 'GΩ'));
    });
    snapshot.blocks = snapshot.blocks.map((block) => (block.id !== cable.id && block.equipment_id !== null ? { ...block, removed_at: '2026-11-08T10:00:00.000Z' } : block));
    expect(derivedParecer(snapshot)).toBe('apto_com_restricoes');
    const tag = snapshot.equipment.find((row) => row.id === cable.equipment_id)!.tag;
    expect(parecerCounts(snapshot).withRestriction).toEqual([tag]);
  });

  it('the arrester whose disconnector is not intact (the fixture\'s NÃO): Reprovado, its reading entry naming the disconnector', () => {
    const snapshot = v13Snapshot();
    const arrester = blockOf(snapshot, 'para_raio');
    expect(effectiveConclusionPair(arrester, definitionOf(arrester), visitContextOf(snapshot, arrester)).result).toBe('reprovado');
    const entry = derivedPoints(snapshot).find((one) => one.key === `reading:${arrester.id}:isolacao`)!;
    // Its rule-made 2.500 MΩ is out of ≥ 5.000 MΩ too: one entry for the test, the prerequisite first.
    expect(entry.text).toBe('Ensaio de isolação: pré-requisito não atendido (Desligador íntegro: NÃO); 2.500 MΩ em Fase A–Massa (critério: ≥ 5.000 MΩ)');
    expect(derivedPoints(snapshot).some((one) => one.key === `restricao:${arrester.id}:isolacao`)).toBe(false);
  });

  it('last_results keeps the corrected value of a corrected reading (under the visit context) and none of an uncorrected one', () => {
    const snapshot = v13Snapshot();
    const tf = editBlock(snapshot, 'transformador_forca', (block) => {
      delete block.sheet.nameplate.temperatura_oleo_c;
    });
    cabineOfSnapshot(snapshot).env.temperature_c = measured('40', '°C');
    const entries = lastResults(snapshot, { revisionNumber: 1, issuedAt: '2026-11-09T12:00:00.000Z' });
    const tfEntry = entries.find((entry) => entry.equipmentId === tf.equipment_id)!;
    const insulation = Object.entries(tfEntry.value.readings).filter(([key]) => key.startsWith('isolacao|'));
    expect(insulation.map(([, reading]) => reading)).toEqual([
      { raw: '2500', unit: 'GΩ', state: 'measured', corrected: { raw: '10000', unit: 'GΩ' } },
      { raw: '2600', unit: 'GΩ', state: 'measured', corrected: { raw: '10400', unit: 'GΩ' } },
      { raw: '2700', unit: 'GΩ', state: 'measured', corrected: { raw: '10800', unit: 'GΩ' } },
    ]);
    // The TTR and every other type's readings carry none.
    for (const entry of entries) {
      for (const [key, reading] of Object.entries(entry.value.readings)) {
        if (entry.equipmentId === tf.equipment_id && key.startsWith('isolacao|')) continue;
        if (snapshot.blocks.find((block) => block.equipment_id === entry.equipmentId)!.block_type === 'disjuntor_mt' && key.startsWith('isolacao|')) continue;
        if (snapshot.blocks.find((block) => block.equipment_id === entry.equipmentId)!.block_type === 'chave_seccionadora' && key.startsWith('isolacao|')) continue;
        expect('corrected' in reading, key).toBe(false);
      }
    }
    // With no temperature anywhere, nothing is corrected.
    const bare = v13Snapshot();
    const cold = editBlock(bare, 'transformador_forca', (block) => {
      delete block.sheet.nameplate.temperatura_oleo_c;
    });
    expect(Object.values(blockReadings(cold, definitionOf(tf), visitContextOf(bare, cold))).some((reading) => 'corrected' in reading)).toBe(false);
  });

  it('pre-issue (review fix): a concluded sheet whose confirmed text was composed under its visit context reads neither stale nor unconfirmed', () => {
    const snapshot = v13Snapshot();
    cabineOfSnapshot(snapshot).env.temperature_c = measured('40', '°C');
    // The plate's oil temperature cleared (the cabine's 40 °C stands in), the AT row at 2 GΩ (out raw), the TTR left empty.
    const judged = editBlock(snapshot, 'transformador_forca', (block) => {
      delete block.sheet.nameplate.temperatura_oleo_c;
      delete block.sheet.test.relacao_transformacao;
      block.sheet.test.isolacao!.cells['0']!['1'] = cell(measured('2', 'GΩ'));
      block.sheet.conclusion.result = cell('aprovado');
      block.sheet.conclusion.restriction = cell('com_restricoes');
    });
    const definition = definitionOf(judged);
    const tag = snapshot.equipment.find((row) => row.id === judged.equipment_id)!.tag;
    const composed = composeConclusion(judged, definition, tag, visitContextOf(snapshot, judged));
    // Concluded with that text confirmed, as the conclude writes it.
    const tf = editBlock(snapshot, 'transformador_forca', (block) => {
      block.sheet.conclusion.text = cell(composed.text);
      block.sheet.conclusion.text_status = cell('confirmed');
      block.sheet.conclusion.text_basis = cell(composed.basis);
      block.concluded_by = { actor_id: id(90), at: '2026-11-09T12:00:00.000Z' };
    });
    // Judged raw, the same text would read stale (the raw floor is Reprovado).
    expect(conclusionTextState(tf, composeConclusion(tf, definition, tag))).toBe('stale');
    expect(conclusionTextState(tf, composeConclusion(tf, definition, tag, visitContextOf(snapshot, tf)))).toBe('confirmed');
    expect(preIssue(snapshot).filter((row) => row.kind === 'conclusion_stale' || row.kind === 'conclusion_unconfirmed')).toEqual([]);
  });
});

describe('23.5-UNIT section 9 at the fit (the 60 em rule)', () => {
  const tableWith = (snapshot: RelatorioSnapshot, blockId: string, text: string): PrintTable => {
    const printed = section9Layout(snapshot, 9, 'RESULTADOS')!.subsections.flatMap((subsection) => subsection.sheets).find((one) => one.blockId === blockId)!;
    return printed.parts.flatMap((part) => (part.kind === 'table' ? [part.table] : [])).find((table) => table.rows.some((row) => row.cells.some((one) => one.text === text)))!;
  };

  // ~~Reported to the coordinator (e23v): the spec states 8 pt (16 half points) for this table; the 60 em rule's own
  // measure (`fittedColumns`) needs 61,6 em at 8 pt (v12's table measures 58,9 em there, and the column adds at least
  // 2,2 em with its margins), so it steps on to 7,5 pt (15). Pinned as the rule gives it, every word whole.~~
  // Fix batch e23w (W2-K2): the approved 8 pt. The corrected column is measured outside the 60 em budget: without it the
  // table's longest words take 58,9 em at 8 pt (61,6 em with it), and 62,6 em at 8,5 pt, so 8 pt is the first step that fits.
  it('the transformer\'s table judged by one criterion prints with the 20 °C column inside VALORES, every word whole, at the approved 8 pt', () => {
    const snapshot = v13Snapshot();
    // No plate voltages: every row takes the seeded criterion, so the table is the plain one (no ACEITÁVEL column);
    // readings of a field visit (2,0, 2,6 and 1,9 GΩ, as Story 23.1's frame) at 40 °C of oil.
    const tf = editBlock(snapshot, 'transformador_forca', (block) => {
      delete block.sheet.nameplate.tensao_nominal_at;
      delete block.sheet.nameplate.tensao_nominal_bt;
      block.sheet.nameplate.temperatura_oleo_c = cell(measured('40', '°C'));
      for (const [row, raw] of [['0', '2.0'], ['1', '2.6'], ['2', '1.9']] as const) block.sheet.test.isolacao!.cells[row]!['1'] = cell(measured(raw, 'GΩ'));
    });
    const table = tableWith(snapshot, tf.id, '20 °C');
    expect(table.textHalfPoints).toBe(16);
    expect(wordsWiderThanColumns(table, readingFitWidthEm(table))).toEqual([]);
    const top = table.rows.find((row) => row.header === true)!;
    expect(top.cells.map((one) => [one.text, one.span ?? 1])).toEqual([
      ['PONTO DE ENSAIO/CONEXÃO', 3],
      ['', 1],
      ['VALORES (GΩ)', 4],
      ['QUALIDADE ISOLAÇÃO', 2],
    ]);
    const bottom = table.rows.filter((row) => row.header === true)[1]!;
    expect(bottom.cells.map((one) => one.text)).toEqual(['LINHA', 'TERRA', 'GUARD', 'TENSÃO (kV)', '30 SEGUNDOS', '1 MINUTO', '20 °C', 'ESTAB./10MIN', 'ABSORÇÃO', 'POLARIZAÇÃO']);
    const data = table.rows.filter((row) => row.header !== true && row.band !== true);
    expect(data.map((row) => [row.cells[5]!.text, row.cells[6]!.text])).toEqual([
      ['2,0', '8'],
      ['2,6', '10,4'],
      ['1,9', '7,6'],
    ]);
  });

  it('the transformer judged row by row keeps every word whole too, and with no temperature its column prints "-"', () => {
    const snapshot = v13Snapshot();
    const tf = editBlock(snapshot, 'transformador_forca', (block) => {
      delete block.sheet.nameplate.temperatura_oleo_c;
    });
    const table = tableWith(snapshot, tf.id, '20 °C');
    expect(wordsWiderThanColumns(table, readingFitWidthEm(table))).toEqual([]);
    const bottom = table.rows.filter((row) => row.header === true).at(-1)!;
    const col = bottom.cells.findIndex((one) => one.text === '20 °C');
    expect(table.rows.filter((row) => row.header !== true && row.band !== true).map((row) => row.cells[col]!.text)).toEqual(['-', '-', '-']);
    const header = tableWith(snapshot, tf.id, 'TEMPERATURA');
    expect(header.rows[2]!.cells[header.rows[1]!.cells.findIndex((one) => one.text === 'TEMPERATURA')]!.text).toBe('-');
  });

  it('the disjuntor\'s and the seccionadora\'s open and closed tables print the 20 °C column beside VALORES, side by side as one table, every word whole', () => {
    const snapshot = v13Snapshot();
    cabineOfSnapshot(snapshot).env.temperature_c = measured('35', '°C');
    for (const type of ['disjuntor_mt', 'chave_seccionadora']) {
      const block = blockOf(snapshot, type);
      const table = tableWith(snapshot, block.id, '20 °C');
      expect(wordsWiderThanColumns(table, readingFitWidthEm(table)), type).toEqual([]);
      // Fix batch e23w (W2-K2, review fix): side by side, both 20 °C columns stay outside the 60 em budget.
      expect(table.textHalfPoints, type).toBeUndefined();
      const bottom = table.rows.find((row) => row.header === true)!;
      expect(bottom.cells.map((one) => one.text), type).toEqual(['LINHA', 'TERRA', 'GUARD', 'TENSÃO (kV)', 'VALORES (GΩ)', '20 °C', 'LINHA', 'TERRA', 'GUARD', 'TENSÃO (kV)', 'VALORES (GΩ)', '20 °C']);
      // The solid factor at 35 °C is 2: 2.500 GΩ reads 5.000 at 20 °C (the disjuntor's first row is the fixture's 150).
      const first = table.rows.find((row) => row.header !== true && row.band !== true)!;
      expect(first.cells[5]!.text, type).toBe(type === 'disjuntor_mt' ? '300' : '5.000');
      expect(tableWith(snapshot, block.id, 'TEMPERATURA').rows[2]!.cells.at(-2)!.text, type).toBe('35 °C (AMBIENTE)');
    }
  });
});

describe('23.5/23.6-UNIT v12 and v5 sheets judge, compose and print the same with any visit context (AD-21)', () => {
  const busy: VisitContext = {
    ambientC: 40,
    previous: { relatorio_id: id(901), revision_number: 2, issued_at: '2026-11-01T12:00:00.000Z', seed_version: 'v12', block_type: 'transformador_forca', readings: {} },
  };

  it.each(['v12', 'v5'] as const)('%s: every sheet\'s evaluation, floor, conclusion basis and the parecer basis are those of no context', (version) => {
    const snapshot = layoutLockSnapshot(version);
    for (const block of snapshot.blocks.filter((one) => one.equipment_id !== null && one.removed_at === null)) {
      const definition = definitionOf(block);
      const context: VisitContext = { ...busy, previous: { ...busy.previous!, block_type: block.block_type, readings: Object.fromEntries(readingSlotsOf(definition).map((slot) => [slot.key, { raw: '99999', unit: 'MΩ', state: 'measured' as const, corrected: { raw: '99999', unit: 'MΩ' } }])) } };
      expect(evaluateSheetReadings(block, definition, context), block.block_type).toEqual(evaluateSheetReadings(block, definition));
      expect(conclusionFloor(block, definition, context), block.block_type).toEqual(conclusionFloor(block, definition));
      expect(composeConclusion(block, definition, 'TAG-1', context), block.block_type).toEqual(composeConclusion(block, definition, 'TAG-1'));
    }
    const warm = structuredClone(snapshot);
    cabineOfSnapshot(warm).env.temperature_c = measured('40', '°C');
    expect(composeParecer(warm).basis).toBe(composeParecer(snapshot).basis);
    expect(derivedPoints(warm)).toEqual(derivedPoints(snapshot));
    const sheets = (one: RelatorioSnapshot) => section9Layout(one, 9, 'RESULTADOS')!.subsections.flatMap((subsection) => subsection.sheets);
    expect(sheets(warm)).toEqual(sheets(snapshot));
  });
});

describe('23.5/23.6-UNIT a company copy carries the e23v keys; removing what they read prunes them; a bad reference reads in pt-BR', () => {
  type DraftTest = { key: string; temperature_correction?: Record<string, unknown>; restriction?: Record<string, unknown>; criterion_status?: string };
  const testsOf = (draft: unknown) => (draft as { tests: DraftTest[] }).tests;

  it('"Duplicar" on the v13 transformer, arrester and disjuntor keeps the correction, the restriction rules and the criterion status, and publishes clean', () => {
    const tf = duplicateSeededType('v13', 'transformador_forca').draft;
    expect(testsOf(tf).find((one) => one.key === 'isolacao')).toMatchObject({
      temperature_correction: { to_c: 20, medium: 'oil_rule', oil_field: 'temperatura_oleo_c', dry_field: 'temperatura_enrolamento_c' },
      restriction: { history_drop_pct: 50, status: 'PADRÃO FASOR' },
    });
    const dj = duplicateSeededType('v13', 'disjuntor_mt').draft;
    expect(testsOf(dj).find((one) => one.key === 'resistencia_contato')).toMatchObject({ restriction: { pole_deviation_pct: 50, status: 'CONFIRMADO' }, criterion_status: 'PADRÃO FASOR' });
    for (const draft of [tf, dj, duplicateSeededType('v13', 'para_raio').draft]) expect(validateTypeDraft(draft)).toEqual([]);
  });

  it('removing a temperature field drops it from the correction (the ambient stands in); removing the oil rule\'s field drops a correction read by it and the history rule with it', () => {
    const tf = duplicateSeededType('v13', 'transformador_forca').draft;
    const oil = removeDraftEntry(tf, 'nameplate', tf.nameplate.findIndex((field) => field.key === 'temperatura_oleo_c'));
    expect(testsOf(oil).find((one) => one.key === 'isolacao')!.temperature_correction).toEqual({ to_c: 20, medium: 'oil_rule', dry_field: 'temperatura_enrolamento_c' });
    expect(validateTypeDraft(oil)).toEqual([]);
    const medium = removeDraftEntry(tf, 'nameplate', tf.nameplate.findIndex((field) => field.key === 'tipo_de_isolacao'));
    const isolacao = testsOf(medium).find((one) => one.key === 'isolacao')!;
    expect([isolacao.temperature_correction, isolacao.restriction]).toEqual([undefined, undefined]);
  });

  it('removing the arrester\'s DESLIGADOR ÍNTEGRO drops the prerequisite and keeps the comparison; a draft whose prerequisite names no select says so', () => {
    const pr = duplicateSeededType('v13', 'para_raio').draft;
    const removed = removeDraftEntry(pr, 'nameplate', pr.nameplate.findIndex((field) => field.key === 'desligador_integro'));
    expect(testsOf(removed).find((one) => one.key === 'isolacao')!.restriction).toEqual({ below_largest_pct: 50, status: 'PADRÃO FASOR' });
    const bad = duplicateSeededType('v13', 'para_raio').draft;
    const iso = bad.tests.find((one) => one.key === 'isolacao')!;
    iso.restriction = { ...iso.restriction!, prerequisite: { field: 'mcov_kv', fails_on: ['NÃO'] } };
    expect(validateTypeDraft(bad).map((issue) => issue.message)).toContain('ENSAIO DE ISOLAÇÃO: o pré-requisito lê uma lista da placa; mantenha esse campo e as suas opções como a regra pede.');
    const noCorrection = duplicateSeededType('v13', 'cabos_entrada').draft;
    noCorrection.tests.find((one) => one.key === 'isolacao')!.restriction = { history_drop_pct: 50, status: 'PADRÃO FASOR' };
    expect(validateTypeDraft(noCorrection).map((issue) => issue.message)).toContain('ENSAIO DE ISOLAÇÃO: a comparação com a visita anterior compara leituras corrigidas; mantenha a correção de temperatura do ensaio.');
  });

  it('"Adicionar ensaio" copies a seeded grammar without its source type\'s correction, rules or status', () => {
    const added = addDraftTest({ label: 'Religador' }, 'resistencia_contato', 'v13')!;
    expect(testsOf(added.draft)[0]).not.toHaveProperty('restriction');
    expect(testsOf(added.draft)[0]).not.toHaveProperty('criterion_status');
    const insulation = addDraftTest({ label: 'Religador' }, 'isolacao', 'v13')!;
    expect(testsOf(insulation.draft)[0]).not.toHaveProperty('restriction');
    expect(testsOf(insulation.draft)[0]).not.toHaveProperty('temperature_correction');
  });
});
