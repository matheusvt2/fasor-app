import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { groupForPrint } from '../print/group-for-print.ts';
import { applyOp } from '../ops/apply.ts';
import { makeOp } from '../ops/op.ts';
import { derivedPoints } from '../points/derived.ts';
import { section9Layout, type PrintTable } from '../print/section-9.ts';
import { companyBlockType, type EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { selectOptionFor } from '../seed/select-option.ts';
import { TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import { removeDraftEntry } from '../types/draft-edit.ts';
import { duplicateSeededType } from '../types/duplicate.ts';
import { companyTypeDefinitionSchema } from '../types/definition.ts';
import { accuracyClassDeviation, accuracyClassOption, parseAccuracyClass } from './accuracy-class.ts';
import { APPLICABILITY_APPLIED, testApplicability } from './applicability.ts';
import { composeConclusion, conclusionFloor } from './conclusion.ts';
import { choiceValue, evaluateSheetMeasurements, measurementCounts, restrictedMeasurements, type MeasurementTestEvaluation } from './measurement-evaluation.ts';
import { parecerCounts } from './parecer.ts';
import { choiceCellValue, evaluateSheetReadings, evaluateTest, failedRatioRows, firstRunCell, isChoiceCellValue, type TestEvaluation } from './readings.ts';
import { decisionDDefaultKv, mcovDefaultKv } from './row-voltage.ts';
import { sheetProgress } from './sheet-progress.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * Batch e23e (Stories 23.13, 23.18, 23.20 and 23.21, seed v13): the test-voltage defaults of decision
 * D at every band edge, the polarity and the TC's function and classes, the thermography's band
 * tables and its applicability by the test's own value, the Malha de aterramento's maximum from the
 * plate; one test per row of the spec's I/O matrix, and v12 unchanged. Every value is invented.
 */

const id = (n: number) => `019966b0-0239-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(90_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });

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

function cells(block: BlockRow, testKey: string, values: Record<string, unknown>): BlockRow {
  const next = structuredClone(block);
  const test = next.sheet.test[testKey] ?? { cells: {} };
  for (const [address, value] of Object.entries(values)) {
    const [row, col] = address.split('/') as [string, string];
    test.cells[row] = { ...test.cells[row], [col]: cell(value) };
  }
  next.sheet.test[testKey] = test;
  return next;
}

function value(block: BlockRow, testKey: string, key: string, stored: unknown): BlockRow {
  const next = structuredClone(block);
  const test = next.sheet.test[testKey] ?? { cells: {} };
  next.sheet.test[testKey] = { ...test, values: { ...test.values, [key]: cell(stored) } };
  return next;
}

const readings = (block: BlockRow): TestEvaluation[] => evaluateSheetReadings(block, definitionOf(block));
const testOf = (block: BlockRow, key: string): TestEvaluation => readings(block).find((test) => test.testKey === key)!;
const voltages = (block: BlockRow) => testOf(block, 'isolacao').tables.flatMap((table) => table.rows.map((row) => row.voltage?.text ?? null));
const measurement = (block: BlockRow, key: string): MeasurementTestEvaluation => evaluateSheetMeasurements(block, definitionOf(block)).find((test) => test.testKey === key)!;

describe('23.13-UNIT decision D: the default test voltage of an insulation row from the plate', () => {
  it('the bands at their edges: 600 V 1 kV, 601 V and 5000 V 2,5 kV, 5001 V 5 kV; the MCOV under 5 kV 2,5 kV, from it 5 kV', () => {
    expect([600, 601, 5000, 5001].map(decisionDDefaultKv)).toEqual(['1', '2.5', '2.5', '5']);
    expect([null, 0, -1].map(decisionDDefaultKv)).toEqual([null, null, null]);
    expect([4990, 5000, 12_700].map(mcovDefaultKv)).toEqual(['2.5', '5', '5']);
    expect(mcovDefaultKv(null)).toBeNull();
  });

  it('a v13 disjuntor of class 15 kV starts every row of both tables at 5 kV, its source the default; a TC of 13,8 kV, a TP of "13,8/√3" too', () => {
    const disjuntor = plate(sheet('disjuntor_mt'), { tensao_nominal: '15' });
    expect(voltages(disjuntor)).toEqual(['5', '5', '5', '5', '5', '5']);
    expect(testOf(disjuntor, 'isolacao').tables[0]!.rows[0]!.voltage).toMatchObject({ kv: '5', source: 'default', notice: null });
    expect(voltages(plate(sheet('tc'), { tensao_nominal_at: measured('13.8', 'kV') }))).toEqual(['5', '5', '5']);
    expect(voltages(plate(sheet('tp'), { tensao_nominal_at: measured('13.8/√3', 'kV') }))).toEqual(['5', '5', '5']);
  });

  it('each type reads its own rating field at the band edges (600 V, 601 V, 5000 V, 5001 V)', () => {
    const at = (type: EquipmentBlockType, key: string, volts: string) => voltages(plate(sheet(type), { [key]: measured(volts, 'V') }))[0];
    for (const [type, key] of [
      ['tc', 'tensao_nominal_at'],
      ['tp', 'tensao_nominal_at'],
    ] as const) {
      expect(['600', '601', '5000', '5001'].map((volts) => at(type, key, volts)), type).toEqual(['1', '2,5', '2,5', '5']);
    }
    // A voltage class in kV: 0,6 kV, 2,4 kV, 5 kV, 7,2 kV.
    for (const [type, key] of [
      ['disjuntor_mt', 'tensao_nominal'],
      ['chave_seccionadora', 'tensao_de_placa'],
    ] as const) {
      expect(['0,6', '2,4', '5', '7,2'].map((kv) => voltages(plate(sheet(type), { [key]: kv }))[0]), type).toEqual(['1', '2,5', '2,5', '5']);
    }
  });

  it('the para-raio by its MCOV: 4,99 kV 2,5 kV, 5 kV 5 kV, empty the instrument (none here)', () => {
    expect(voltages(plate(sheet('para_raio'), { mcov_kv: measured('4.99', 'kV') }))[0]).toBe('2,5');
    expect(voltages(plate(sheet('para_raio'), { mcov_kv: measured('5', 'kV') }))[0]).toBe('5');
    expect(voltages(sheet('para_raio'))[0]).toBe('-');
  });

  it('a cable by the U of its CLASSE U0/U: "8,7/15 kV" and "3,6/6 kV" both 5 kV', () => {
    for (const type of ['cabos_entrada', 'cabos_saida'] as const) {
      expect(voltages(plate(sheet(type), { classe_cabo: '8,7/15 kV' })), type).toEqual(['5', '5', '5', '5']);
      expect(voltages(plate(sheet(type), { classe_cabo: '3,6/6 kV' }))[0], type).toBe('5');
    }
  });

  it('a typed TENSÃO wins and names no notice (the rows name no winding); a v12 disjuntor keeps the instrument\'s voltage', () => {
    const typed = cells(plate(sheet('disjuntor_mt'), { tensao_nominal: '15' }), 'isolacao', { '0/1': measured('1', 'kV') });
    expect(testOf(typed, 'isolacao').tables[0]!.rows[0]!.voltage).toMatchObject({ kv: '1', source: 'typed', notice: null });
    expect(voltages(typed).slice(1)).toEqual(['5', '5', '5', '5', '5']);
    expect(voltages(plate(sheet('disjuntor_mt', 'v12'), { tensao_nominal: '15' }))).toEqual(['-', '-', '-', '-', '-', '-']);
  });
});

/** The v13 TC's ratio table: rows FASE R/S/T, the inputs at cols 0 and 1, the capture at 3, POLARIDADE at 5. */
const tcRatio = (block: BlockRow, capture: string, polarity?: string) =>
  cells(block, 'relacao_transformacao', { '0/0': measured('200', 'A'), '0/1': measured('5', 'A'), '0/3': measured(capture, null), ...(polarity === undefined ? {} : { '0/5': choiceCellValue(polarity) }) });

describe('23.18-UNIT polarity, function and the S classes (Base rev08 TC-03, TP-03)', () => {
  it('a polarity INVERTIDA puts its row out: CONDIÇÕES INSATISFATÓRIO, a failed ratio row, floor Reprovado, a derived point and the paragraph name it', () => {
    const block = tcRatio(plate(sheet('tc'), { exatidao: '0,3' }), '40', 'INVERTIDA');
    const ratio = testOf(block, 'relacao_transformacao');
    const row = ratio.tables[0]!.rows[0]!;
    expect(row.cells.find((one) => one.role === 'capture')!.verdict).toBe('within');
    expect(row.choice).toEqual({
      col: 5,
      raw: 'INVERTIDA',
      displayText: 'Invertida',
      verdict: 'out',
      missing: false,
      helperText: 'Polaridade invertida: a ficha fica Reprovado e gera um ponto de atenção.',
      outText: 'polaridade invertida',
    });
    expect(row.condicao).toBe('INSATISFATÓRIO');
    expect(ratio.choiceOut).toEqual([{ where: 'Fase R', text: 'polaridade invertida' }]);
    expect(failedRatioRows(readings(block))).toEqual([{ testKey: 'relacao_transformacao', label: 'Fase R', deviationText: '', choiceText: 'polaridade invertida' }]);
    expect(conclusionFloor(block, definitionOf(block))?.pair).toEqual({ result: 'reprovado', restriction: 'com_restricoes' });
    expect(composeConclusion(block, definitionOf(block), 'TC-01').text).toContain('polaridade invertida no ensaio de relação de transformação em Fase R');
    // Progress counts the polarity out and each row's empty polarity missing (Fase S and T, with their captures).
    const snapshot = snapshotOf([block]);
    const progress = sheetProgress(snapshot, blockIdOf(snapshot, 'tc')).steps.ensaios;
    expect(progress.outOfLimit).toBe(1);
    const filled = snapshotOf([cells(block, 'relacao_transformacao', { '1/5': choiceCellValue('OK'), '2/5': choiceCellValue('OK') })]);
    expect(progress.missing - sheetProgress(filled, blockIdOf(filled, 'tc')).steps.ensaios.missing).toBe(2);
  });

  it('OK passes and leaves the ratio verdict to the capture; empty counts one missing per row; a polarity with no VAL CALCULADO still fails', () => {
    const ok = tcRatio(plate(sheet('tc'), { exatidao: '0,3' }), '40', 'OK');
    const row = testOf(ok, 'relacao_transformacao').tables[0]!.rows[0]!;
    expect([row.choice!.verdict, row.condicao]).toEqual(['within', 'SATISFATÓRIO']);
    expect(testOf(ok, 'relacao_transformacao').tables[0]!.rows.map((one) => one.choice!.missing)).toEqual([false, true, true]);
    const empty = testOf(sheet('tc'), 'relacao_transformacao').tables[0]!.rows.map((one) => one.choice!.missing);
    expect(empty).toEqual([true, true, true]);
    const onlyPolarity = cells(sheet('tc'), 'relacao_transformacao', { '1/5': choiceCellValue('INVERTIDA') });
    expect(failedRatioRows(readings(onlyPolarity)).map((one) => one.label)).toEqual(['Fase S']);
  });

  it('the TP carries the same column; a v12 TC and TP have none', () => {
    // The choice column is the table's `choiceColumn`, never one of its `columns` (the run and the cells walk those), and the run starts.
    const tc = testOf(sheet('tc'), 'relacao_transformacao');
    expect(tc.tables[0]!.columns.map((column) => column.label)).not.toContain('POLARIDADE');
    expect(tc.tables[0]!.choiceColumn).toMatchObject({ col: 5, label: 'POLARIDADE', header: 'Polaridade' });
    expect(firstRunCell(readings(sheet('tc')))).not.toBeNull();
    const tp = cells(sheet('tp'), 'relacao_transformacao', { '2/5': choiceCellValue('INVERTIDA') });
    expect(testOf(tp, 'relacao_transformacao').choiceOut).toEqual([{ where: 'Fase T', text: 'polaridade invertida' }]);
    for (const type of ['tc', 'tp'] as const) {
      const v12 = testOf(sheet(type, 'v12'), 'relacao_transformacao');
      expect(v12.tables[0]!.rows.every((one) => one.choice === undefined), type).toBe(true);
      expect([v12.choiceOut, v12.printNote, v12.tables[0]!.choiceColumn], type).toEqual([undefined, undefined, undefined]);
    }
  });

  it('the fold takes a polarity only with one of its options or null, and refuses any other value on the column', () => {
    expect(isChoiceCellValue(choiceCellValue('OK'), ['OK', 'INVERTIDA'])).toBe(true);
    expect(isChoiceCellValue(null, ['OK', 'INVERTIDA'])).toBe(true);
    expect(isChoiceCellValue(choiceCellValue('TALVEZ'), ['OK', 'INVERTIDA'])).toBe(false);
    expect(isChoiceCellValue(measured('1', 'kV'), ['OK', 'INVERTIDA'])).toBe(false);
    expect(isChoiceCellValue(choiceValue('ok'), ['OK', 'INVERTIDA'])).toBe(false);
    const block = sheet('tc');
    const state = new Map<string, unknown>([[`block:${block.id}`, block]]);
    const put = (value: unknown) =>
      makeOp(
        { kind: 'put', scope: 'relatorio', company_id: id(9), project_id: TEST_PROJECT, relatorio_id: TEST_RELATORIO, prev_op_id: null, batch_id: null, meta: null, actor_id: id(10), device_id: id(11), path: `sheet/${block.id}/test/relacao_transformacao/cell/0/5`, value: value as never },
        { newId: () => id(12 + opCounter++), now: new Date('2026-11-09T12:00:00Z') },
      );
    const folded = applyOp(state as never, put(choiceCellValue('INVERTIDA'))).get(`block:${block.id}`) as BlockRow;
    expect(folded.sheet.test.relacao_transformacao!.cells['0']!['5']!.value).toEqual({ raw: 'INVERTIDA', unit: null, state: 'measured' });
    expect(() => applyOp(state as never, put(choiceCellValue('TALVEZ')))).toThrow(/takes one of/);
    expect(() => applyOp(state as never, put(measured('2', null)))).toThrow(/takes one of/);
    expect(applyOp(state as never, put(null)).get(`block:${block.id}`)).toBeDefined();
  });

  it('FUNÇÃO FATURAMENTO shows the notice under the insulation test, which is still filled and judged; MEDIÇÃO, PROTEÇÃO and empty show none', () => {
    const faturamento = cells(plate(sheet('tc'), { funcao_tc: 'FATURAMENTO' }), 'isolacao', { '0/1': measured('30', 'GΩ') });
    const insulation = testOf(faturamento, 'isolacao');
    expect(insulation.notice).toBe('TC de faturamento: o ensaio de isolação depende de autorização da concessionária.');
    expect(insulation.tables[0]!.rows[0]!.cells.find((one) => one.role === 'capture')!.verdict).not.toBeNull();
    for (const funcao of ['MEDIÇÃO', 'PROTEÇÃO', null]) {
      const block = funcao === null ? sheet('tc') : plate(sheet('tc'), { funcao_tc: funcao });
      expect(testOf(block, 'isolacao').notice, String(funcao)).toBeNull();
    }
    expect(testOf(sheet('tc', 'v12'), 'isolacao').notice).toBeUndefined();
  });

  it('EXATIDÃO 0,3S judges the ratio at ± 0,3 %: 0,25 % within, 0,35 % out; 5P20 at ± 1 %, 10P20 at ± 3 %', () => {
    const at = (cls: string, capture: string) => {
      const test = testOf(tcRatio(plate(sheet('tc'), { exatidao: cls }), capture), 'relacao_transformacao');
      return [test.criterionText, test.tables[0]!.rows[0]!.cells.find((one) => one.role === 'capture')!.verdict];
    };
    expect(at('0,3S', '40.1')).toEqual(['±0,3 %', 'within']);
    expect(at('0,3S', '40.14')).toEqual(['±0,3 %', 'out']);
    expect(at('0,6S', '40.2')).toEqual(['±0,6 %', 'within']);
    expect(at('5P20', '40.4')).toEqual(['±1 %', 'within']);
    expect(at('10P20', '41.2')).toEqual(['±3 %', 'within']);
    expect(at('10P20', '41.3')).toEqual(['±3 %', 'out']);
  });

  it('the class parser keeps the S and every e22g notation as it was; a read class lands on the version\'s option', () => {
    expect(['0,3S', '0,6s', '0.3S', '0,3 S'].map(parseAccuracyClass)).toEqual(['0,3S', '0,6S', '0,3S', '0,3S']);
    expect(['0,6C25', '10P20', '1,2P75', '0.3', '5P10', '25VA 5P20', '12,5VA 0,3', '10B100', '6P', 'C25', '', '25VA', '0,3 sobre'].map(parseAccuracyClass)).toEqual([
      '0,6',
      '10P',
      '1,2',
      '0,3',
      '5P',
      '5P',
      '0,3',
      '10P',
      '6P',
      null,
      null,
      null,
      '0,3',
    ]);
    expect(['0,3S', '0,6S', '5P20', '10P20', '5P', '0,3'].map(accuracyClassDeviation)).toEqual([0.3, 0.6, 1, 3, 1, 0.3]);
    const v13 = definitionOf(sheet('tc')).nameplate.find((field) => field.key === 'exatidao')!;
    const v12 = definitionOf(sheet('tc', 'v12')).nameplate.find((field) => field.key === 'exatidao')!;
    expect(['0,3S', '5P20', '5P10', '10P20', '25VA 5P20', '0,6'].map((text) => selectOptionFor(v13, text))).toEqual(['0,3S', '5P20', '5P20', '10P20', '5P20', '0,6']);
    expect(['0,3S', '5P20', '0,6S'].map((text) => selectOptionFor(v12, text))).toEqual(['0,3', '5P', '0,6']);
    expect(accuracyClassOption(['0,3', '0,6'], '0,3S')).toBe('0,3');
    expect(accuracyClassOption(['0,3', '0,6'], '5P')).toBeNull();
  });
});

/** The thermography's table: rows Conexões, Terminações, Contatos, Buchas; ΔT entre similares (col 0), ΔT sobre o ambiente (col 1). */
const inLoad = (block: BlockRow, answer: 'sim' | 'nao' = 'sim') => value(block, 'termografia', 'em_carga', choiceValue(answer));
const celsius = (raw: string) => measured(raw, '°C');

describe('23.20-UNIT thermography by NETA MTS-2023 Table 100.18, applicable while in load (Base rev08 GE-01)', () => {
  it('a para-raio in load with Conexões ΔT similares 20 °C: out, floor Reprovado, the derived point names the test and the point', () => {
    const block = cells(inLoad(sheet('para_raio')), 'termografia', { '0/0': celsius('20') });
    const test = measurement(block, 'termografia');
    expect(test.applicability.state).toBe('met');
    expect(test.rows[0]!.cells[0]).toMatchObject({ verdict: 'out', helperText: 'Discrepância grave (20 °C, acima de 15 °C): reparar imediatamente' });
    expect(conclusionFloor(block, definitionOf(block))?.pair.result).toBe('reprovado');
    const snapshot = snapshotOf([block]);
    const point = derivedPoints(snapshot).find((one) => one.test_key === 'termografia' && one.block_id === blockIdOf(snapshot, 'para_raio'))!;
    expect(point.kind).toBe('reading');
    expect(point.text).toContain('Termografia: 20 °C em Conexões');
  });

  it('the bands of both columns at their edges, a negative ΔT within', () => {
    const verdict = (col: number, raw: string) => measurement(cells(inLoad(sheet('para_raio')), 'termografia', { [`0/${col}`]: celsius(raw) }), 'termografia').rows[0]!.cells[col]!.verdict;
    expect(['3', '3.1', '15', '15.1', '-2'].map((raw) => verdict(0, raw))).toEqual(['within', 'restricted', 'restricted', 'out', 'within']);
    expect(['10', '10.1', '20', '20.1', '40', '40.1'].map((raw) => verdict(1, raw))).toEqual(['within', 'restricted', 'restricted', 'restricted', 'restricted', 'out']);
  });

  it('the lowest class is within with no restriction and no observation; a row takes the worse of its two cells (restricted by the ambient class)', () => {
    const lowest = cells(inLoad(sheet('tc')), 'termografia', { '0/0': celsius('2') });
    const low = measurement(lowest, 'termografia').rows[0]!.cells[0]!;
    expect([low.verdict, low.restriction ?? null, low.helperText]).toEqual(['within', null, null]);
    expect(conclusionFloor(lowest, definitionOf(lowest))?.pair).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    const both = cells(inLoad(sheet('tc')), 'termografia', { '0/0': celsius('2'), '0/1': celsius('25') });
    const test = measurement(both, 'termografia');
    expect(test.rows[0]!.cells.map((one) => one.verdict)).toEqual(['within', 'restricted']);
    expect(test.rows[0]!.cells[1]!.restriction).toEqual({
      reason: 'ΔT sobre o ambiente de 25 °C (deficiência)',
      text: 'ΔT sobre o ambiente de 25 °C: deficiência, monitorar até a correção; a conclusão sobe para Com restrições.',
    });
    expect(restrictedMeasurements([test]).map((one) => one.items)).toEqual([['Conexões, ΔT sobre o ambiente: ΔT sobre o ambiente de 25 °C (deficiência)']]);
    expect(conclusionFloor(both, definitionOf(both))?.pair).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
  });

  it('not in load: NA with its reason, nothing missing, absent from the print; applied by hand it counts again', () => {
    const block = cells(inLoad(sheet('para_raio'), 'nao'), 'termografia', { '0/0': celsius('20') });
    const test = measurement(block, 'termografia');
    expect(test.applicability).toMatchObject({ state: 'na', reason: 'Não se aplica: Equipamento fora de carga.', value: 'em_carga' });
    expect(test.rows[0]!.cells[0]!.verdict).toBeNull();
    expect(measurementCounts([test])).toEqual({ missing: 0, outOfLimit: 0 });
    const applied = structuredClone(block);
    applied.sheet.test.termografia!.applicability = cell(APPLICABILITY_APPLIED);
    const live = measurement(applied, 'termografia');
    expect(live.applicability).toMatchObject({ state: 'applied', appliedText: 'Aplicado mesmo assim: Equipamento fora de carga.' });
    expect(live.rows[0]!.cells[0]!.verdict).toBe('out');
  });

  it('the load unknown: NA asking for it, nothing missing; every row and ΔT optional, so a test in load with nothing typed misses nothing', () => {
    const unknown = measurement(sheet('para_raio'), 'termografia');
    expect(unknown.applicability).toMatchObject({ state: 'na', reason: 'Não se aplica: Informe se o equipamento está em carga.' });
    expect(measurementCounts([unknown]).missing).toBe(0);
    expect(measurementCounts([measurement(inLoad(sheet('para_raio')), 'termografia')]).missing).toBe(0);
    expect(testApplicability(sheet('para_raio'), definitionOf(sheet('para_raio')), 'termografia').state).toBe('na');
  });

  it('each of the eight carries it on v13, switched on in a new block\'s config; a v12 sheet carries none', () => {
    for (const type of ['cabos_entrada', 'para_raio', 'chave_seccionadora', 'disjuntor_mt', 'tp', 'tc', 'cabos_saida', 'transformador_forca'] as const) {
      const block = sheet(type);
      expect(measurement(block, 'termografia').enabled, type).toBe(true);
      expect(evaluateSheetMeasurements(sheet(type, 'v12'), definitionOf(sheet(type, 'v12'))).map((one) => one.testKey), type).not.toContain('termografia');
    }
  });
});

describe('23.21-UNIT the Malha de aterramento (Base rev08 AT-01, AT-02)', () => {
  const grid = (block: BlockRow, ohm: string) => cells(block, 'resistencia_malha', { '0/0': measured(ohm, 'Ω') });

  it('above its design value: out, floor Reprovado; at it within', () => {
    const design = plate(sheet('malha_aterramento'), { valor_projeto_ohm: measured('2', 'Ω') });
    const out = measurement(grid(design, '3'), 'resistencia_malha');
    expect(out.rows[0]!.cells[0]).toMatchObject({ verdict: 'out', helperText: 'Acima do aceitável (≤ 2 Ω, valor de projeto)' });
    expect(out.notes).toBeUndefined();
    expect(measurement(grid(design, '2'), 'resistencia_malha').rows[0]!.cells[0]!.verdict).toBe('within');
    const block = grid(design, '3');
    expect(conclusionFloor(block, definitionOf(block))?.pair.result).toBe('reprovado');
  });

  it('with no design value, judged at most 5 Ω: 4 Ω within, 5,1 Ω out; the helper says the default applies', () => {
    const bare = sheet('malha_aterramento');
    expect(measurement(grid(bare, '4'), 'resistencia_malha').rows[0]!.cells[0]!.verdict).toBe('within');
    const out = measurement(grid(bare, '5.1'), 'resistencia_malha');
    expect(out.rows[0]!.cells[0]).toMatchObject({ verdict: 'out', helperText: 'Acima do aceitável (≤ 5 Ω, padrão sem valor de projeto)' });
    expect(out.notes).toEqual(['Sem VALOR DE PROJETO na placa, vale ≤ 5 Ω.']);
    expect(out.title).toBe('E1 · Resistência de aterramento da malha');
  });

  it('the continuity at most 0,5 Ω (NETA 7.13): 0,6 Ω out, 0,5 Ω within; every point optional', () => {
    const continuity = (raw: string) => measurement(cells(sheet('malha_aterramento'), 'continuidade_malha', { '0/0': measured(raw, 'Ω') }), 'continuidade_malha').rows[0]!.cells[0]!.verdict;
    expect([continuity('0.6'), continuity('0.5')]).toEqual(['out', 'within']);
    expect(measurementCounts([measurement(sheet('malha_aterramento'), 'continuidade_malha')]).missing).toBe(0);
    expect(measurementCounts([measurement(sheet('malha_aterramento'), 'resistencia_malha')]).missing).toBe(1);
  });

  it('prints under "Outros equipamentos" after the run\'s other library types, and the parecer follows the floor', () => {
    const malha = grid(plate(sheet('malha_aterramento'), { valor_projeto_ohm: measured('2', 'Ω') }), '3');
    // The Malha first in the local's tree order, before the CTA, the Quadro elétrico and the Inspeção de QGBT.
    const snapshot = snapshotOf([malha], true, ['malha_aterramento']);
    const outros = groupForPrint(snapshot).subsections.find((one) => one.kind === 'outros')!;
    expect(outros.blockIds.at(-1)).toBe(blockIdOf(snapshot, 'malha_aterramento'));
    expect(outros.blockIds.slice(0, -1).map((one) => snapshot.blocks.find((block) => block.id === one)!.block_type)).toEqual(['chave_transferencia_automatica', 'quadro_eletrico', 'inspecao_qgbt']);
    const tag = snapshot.equipment.find((row) => row.id === snapshot.blocks.find((block) => block.block_type === 'malha_aterramento')!.equipment_id)!.tag;
    expect(parecerCounts(snapshot).reprovado).toContain(tag);
    const printed = section9Layout(snapshot, 9, 'RESULTADOS')!.subsections.find((one) => one.sheets.some((sheetPrint) => sheetPrint.blockId === blockIdOf(snapshot, 'malha_aterramento')))!;
    expect(printed.heading).toContain('Outros equipamentos');
  });

  it('a company copy carries its maximum and the thermography\'s grammar, and removing VALOR DE PROJETO leaves the 5 Ω maximum', () => {
    const copy = duplicateSeededType('v13', 'malha_aterramento').draft;
    expect(companyTypeDefinitionSchema.safeParse(copy).success).toBe(true);
    expect(companyTypeDefinitionSchema.safeParse(duplicateSeededType('v13', 'tc').draft).success).toBe(true);
    const removed = removeDraftEntry(copy, 'nameplate', 0);
    expect((removed.measurement_tests as { criteria: unknown[] }[])[0]!.criteria[0]).toMatchObject({ type: 'absolute', operator: '<=', value: 5, unit: 'Ω', text: '≤ 5 Ω' });
    expect(companyTypeDefinitionSchema.safeParse(removed).success).toBe(true);
    // A copy of the TC that loses FUNÇÃO DO TC loses its notice; one that loses TENSÃO NOMINAL AT its voltage default.
    const tc = duplicateSeededType('v13', 'tc').draft;
    const funcao = tc.nameplate.findIndex((field) => field.key === 'funcao_tc');
    expect(removeDraftEntry(tc, 'nameplate', funcao).tests!.find((test) => test?.key === 'isolacao')!.notice_when).toBeUndefined();
    const at = tc.nameplate.findIndex((field) => field.key === 'tensao_nominal_at');
    const withoutAt = removeDraftEntry(tc, 'nameplate', at);
    expect(withoutAt.tests!.find((test) => test?.key === 'isolacao')!.tables![0]!.voltage_default).toBeUndefined();
    expect(companyTypeDefinitionSchema.safeParse(withoutAt).success).toBe(true);
    expect(companyBlockType(id(300))).toMatch(/^type:/);
  });
});

describe('23.18-UNIT print: POLARIDADE before CONDIÇÕES and the note under the ratio table; v12 as before', () => {
  const partsOf = (block: BlockRow) => {
    const snapshot = snapshotOf([block]);
    const blockId = blockIdOf(snapshot, block.block_type);
    return section9Layout(snapshot, 9, 'EQUIPAMENTOS')!.subsections.flatMap((one) => one.sheets).find((sheetPrint) => sheetPrint.blockId === blockId)!.parts;
  };
  const tablesOf = (block: BlockRow): PrintTable[] => partsOf(block).flatMap((part) => (part.kind === 'table' ? [part.table] : []));
  const paragraphsOf = (block: BlockRow): string[] => partsOf(block).flatMap((part) => (part.kind === 'paragraph' ? [part.text] : []));
  const header = (table: PrintTable) => table.rows.filter((row) => row.header === true).at(-1)?.cells.map((one) => one.text) ?? [];

  it('a v13 TC prints POLARIDADE right before CONDIÇÕES, the answer in caps, and the note under the table', () => {
    const block = tcRatio(plate(sheet('tc'), { exatidao: '0,3' }), '40', 'INVERTIDA');
    const ratio = tablesOf(block).find((table) => header(table).includes('POLARIDADE'))!;
    const heads = header(ratio);
    expect(heads.indexOf('POLARIDADE')).toBe(heads.indexOf('CONDIÇÕES') - 1);
    const data = ratio.rows.filter((row) => row.header !== true && row.band !== true);
    expect(data[0]!.cells[heads.indexOf('POLARIDADE')]!.text).toBe('INVERTIDA');
    expect(data[0]!.cells[heads.indexOf('CONDIÇÕES')]!.text).toBe('INSATISFATÓRIO');
    expect(data[1]!.cells[heads.indexOf('POLARIDADE')]!.text).toBe('-');
    expect(paragraphsOf(block)).toContain('Verificação de relação (não substitui ensaio de exatidão).');
  });

  it('a v12 TC prints no POLARIDADE and no note', () => {
    const block = sheet('tc', 'v12');
    expect(tablesOf(block).some((table) => header(table).includes('POLARIDADE'))).toBe(false);
    expect(paragraphsOf(block)).not.toContain('Verificação de relação (não substitui ensaio de exatidão).');
  });

  it('the thermography prints as the sheet\'s last test table in load, and not at all out of load', () => {
    const titles = (block: BlockRow) => tablesOf(block).map((table) => table.rows[0]!.cells[0]!.text);
    const live = cells(inLoad(sheet('para_raio')), 'termografia', { '0/0': celsius('2') });
    expect(titles(live)).toContain('TERMOGRAFIA');
    expect(titles(inLoad(sheet('para_raio'), 'nao'))).not.toContain('TERMOGRAFIA');
    const tables = titles(live);
    expect(tables.indexOf('TERMOGRAFIA')).toBe(tables.findIndex((title) => title === 'CONCLUSÃO') - 1);
  });
});

describe('the voltage default prints in TENSÃO', () => {
  it('a v13 disjuntor class 15 kV with a reading prints 5 in TENSÃO', () => {
    const block = cells(plate(sheet('disjuntor_mt'), { tensao_nominal: '15' }), 'isolacao', { '0/0': measured('30', 'GΩ') });
    const snapshot = snapshotOf([block]);
    const tables = section9Layout(snapshot, 9, 'EQUIPAMENTOS')!
      .subsections.flatMap((one) => one.sheets)
      .find((sheetPrint) => sheetPrint.blockId === blockIdOf(snapshot, 'disjuntor_mt'))!
      .parts.flatMap((part) => (part.kind === 'table' ? [part.table] : []));
    const insulation = tables.find((table) => table.rows.some((row) => row.header === true && row.cells.some((one) => one.text === 'TENSÃO (kV)')))!;
    const heads = insulation.rows.filter((row) => row.header === true).at(-1)?.cells.map((one) => one.text) ?? [];
    const at = heads.findIndex((text) => text === 'TENSÃO (kV)');
    const first = insulation.rows.find((row) => row.header !== true && row.band !== true)!;
    expect(first.cells[at]!.text, JSON.stringify(insulation.rows.map((row) => row.cells.map((one) => one.text)))).toBe('5');
  });

  it('evaluateTest on a v13 TP reads the "N/√3" by N', () => {
    const block = plate(sheet('tp'), { tensao_nominal_at: measured('13.8/√3', 'kV') });
    const test = evaluateTest(block, definitionOf(block), definitionOf(block).tests.find((one) => one.key === 'isolacao')!);
    expect(test.tables[0]!.rows[0]!.voltage?.kv).toBe('5');
  });
});

/**
 * The layout-lock v13 snapshot (one sheet of every v13 type on one local) with each of `blocks`' sheets
 * written into the sheet of its type; "Agrupar por tipo" on when `grouped`, and `first` types moved to
 * the front of the local's tree order.
 */
function snapshotOf(blocks: readonly BlockRow[], grouped = false, first: readonly string[] = []): RelatorioSnapshot {
  const snapshot = structuredClone(layoutLockSnapshot(blocks[0]?.seed_version ?? 'v13'));
  snapshot.blocks = snapshot.blocks.map((block) => {
    const mine = blocks.find((one) => one.block_type === block.block_type);
    const edited = mine === undefined ? block : { ...block, sheet: structuredClone(mine.sheet) };
    return first.includes(block.block_type) ? { ...edited, order_key: `0${first.indexOf(block.block_type)}` } : edited;
  });
  if (grouped) snapshot.locations = snapshot.locations.map((location) => (location.kind === 'cabine' ? { ...location, agrupar_por_tipo: true } : location));
  return snapshot;
}

const blockIdOf = (snapshot: RelatorioSnapshot, type: string) => snapshot.blocks.find((block) => block.block_type === type)!.id;
