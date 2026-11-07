import { describe, expect, it } from 'vitest';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import { isDefectReason } from '../seed/defect-reason.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition } from '../seed/definitions.ts';
import { TEST_PROJECT } from '../test-support.ts';
import { ACCURACY_CLASS_HELPER, accuracyClassDeviation, parseAccuracyClass } from './accuracy-class.ts';
import { conclusionFloor } from './conclusion.ts';
import { isOilFieldExcused, isOilUnit, oilDerivedNaKeys } from './oil-rule.ts';
import { effectiveCriterion, evaluateSheetReadings, failedRatioRows } from './readings.ts';
import { rowTestVoltage, rowVoltageCell, rowVoltageNotice, TEST_VOLTAGE_OPTIONS_KV } from './row-voltage.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * Stories 22.7 to 22.9 (seed v12): the kernel over v12 sheets built by hand, one test per row of
 * the spec's I/O matrix the kernel answers (oil, the defect reason, the per-row voltage and its
 * notice, the accuracy class), and the same readers on v11 and v5 sheets, which answer as before.
 */

const id = (n: number) => `019966b0-0222-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(50_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });

function sheet(type: EquipmentBlockType, seedVersion = 'v12'): BlockRow {
  return newEquipmentBlock({ definitions: EMPTY_DEFINITION_CONTEXT,
    blockId: id(1),
    equipmentId: id(2),
    relatorioId: id(3),
    projectId: TEST_PROJECT,
    locationId: id(4),
    type,
    tag: 'T1',
    seedVersion,
    orderKey: 'a0',
  }).block;
}

function withNameplate(block: BlockRow, values: Record<string, unknown>): BlockRow {
  for (const [key, value] of Object.entries(values)) block.sheet.nameplate[key] = cell(value);
  return block;
}

function withTest(block: BlockRow, testKey: string, cells: Record<string, unknown>, instrument: unknown = null): BlockRow {
  const test = block.sheet.test[testKey] ?? { cells: {} };
  for (const [address, value] of Object.entries(cells)) {
    const [row, col] = address.split('/') as [string, string];
    test.cells[row] = { ...test.cells[row], [col]: cell(value) };
  }
  if (instrument !== null) test.instrument = cell(instrument);
  block.sheet.test[testKey] = test;
  return block;
}

const megger = (testParameter: string | null) => ({
  instrument_id: id(800),
  code: '2E',
  manufacturer: 'Instrument',
  model: 'DMG10Ki',
  serial: 'IN919021',
  cert_number: '37428/26',
  calibrated_at: null,
  valid_until: null,
  test_parameter: testParameter,
});

const testOf = (block: BlockRow, key: string) => getDefinition(block.seed_version, 'cabine_primaria', block.block_type).tests.find((one) => one.key === key)!;
const ratioOf = (block: BlockRow) => evaluateSheetReadings(block, getDefinition(block.seed_version, 'cabine_primaria', block.block_type)).find((one) => one.testKey === 'relacao_transformacao')!;

describe('22.7-UNIT the oil rule with ÓLEO MINERAL (seed v12)', () => {
  it('an oil unit answers its oil items and TIPO DO ÓLEO; a dry one shows them NA and TIPO DO ÓLEO excused', () => {
    const oil = withNameplate(sheet('transformador_forca'), { tipo_de_isolacao: 'ÓLEO MINERAL' });
    expect(isOilUnit(oil, EMPTY_DEFINITION_CONTEXT)).toBe(true);
    expect(oilDerivedNaKeys(oil, EMPTY_DEFINITION_CONTEXT).size).toBe(0);
    expect(isOilFieldExcused(oil, 'tipo_do_oleo', EMPTY_DEFINITION_CONTEXT)).toBe(false);
    const dry = withNameplate(sheet('transformador_forca'), { tipo_de_isolacao: 'EPÓXI' });
    expect(isOilUnit(dry, EMPTY_DEFINITION_CONTEXT)).toBe(false);
    expect([...oilDerivedNaKeys(dry, EMPTY_DEFINITION_CONTEXT)]).toEqual(getDefinition('v12', 'cabine_primaria', 'transformador_forca').oil_rule!.items);
    expect(isOilFieldExcused(dry, 'tipo_do_oleo', EMPTY_DEFINITION_CONTEXT)).toBe(true);
    expect(isOilFieldExcused(dry, 'vol_oleo', EMPTY_DEFINITION_CONTEXT)).toBe(true);
  });

  it('the TP and the TC: ÓLEO MINERAL is oil, VASAMENTO the one item a dry unit shows NA; v11 keeps ÓLEO', () => {
    for (const type of ['tp', 'tc'] as const) {
      expect(isOilUnit(withNameplate(sheet(type), { tipo_de_isolacao: 'ÓLEO MINERAL' }), EMPTY_DEFINITION_CONTEXT), type).toBe(true);
      expect([...oilDerivedNaKeys(withNameplate(sheet(type), { tipo_de_isolacao: 'Á SECO' }), EMPTY_DEFINITION_CONTEXT)], type).toEqual(['vasamento']);
    }
    expect(isOilUnit(withNameplate(sheet('transformador_forca', 'v11'), { tipo_de_isolacao: 'ÓLEO' }), EMPTY_DEFINITION_CONTEXT)).toBe(true);
    expect(isOilUnit(withNameplate(sheet('transformador_forca', 'v11'), { tipo_de_isolacao: 'ÓLEO MINERAL' }), EMPTY_DEFINITION_CONTEXT)).toBe(false);
  });
});

describe('22.7-UNIT the defect reason (seed v12)', () => {
  it('"Defeito no equipamento" is a defect reason on v12 and floors the sheet at Reprovado; v11 has no such reason', () => {
    expect(isDefectReason('v12', 'defeito_no_equipamento')).toBe(true);
    expect(isDefectReason('v12', 'solicitacao_cliente')).toBe(false);
    expect(isDefectReason('v11', 'defeito_no_equipamento')).toBe(false);
    const block = sheet('chave_seccionadora');
    block.not_tested = { reason: 'defeito_no_equipamento', text: null, at: '2026-11-06T12:00:00.000Z', by: id(9) };
    expect(conclusionFloor(block)).toEqual({ pair: { result: 'reprovado', restriction: 'com_restricoes' }, reasons: ['defect'] });
  });
});

describe('22.8-UNIT the test voltage per row (seed v12)', () => {
  const tf = (instrument: string | null, bt: unknown = measured('220', 'V')) => {
    const block = withNameplate(sheet('transformador_forca'), { tensao_nominal_at: measured('13.8', 'kV'), tensao_nominal_bt: bt });
    return instrument === null ? block : withTest(block, 'isolacao', {}, megger(instrument));
  };
  const at = (block: BlockRow, row: number) => rowTestVoltage(block, testOf(block, 'isolacao'), row)!;
  /** e22g: a transformer with no TENSÃO NOMINAL AT, so its high-voltage rows take the instrument, as before. */
  const noAt = (instrument: string | null) => {
    const block = withNameplate(sheet('transformador_forca'), { tensao_nominal_bt: measured('220', 'V') });
    return instrument === null ? block : withTest(block, 'isolacao', {}, megger(instrument));
  };

  it('a 10 kV megger and no AT rating: PRIMÁRIO/MASSA and PRIMÁRIO/SECUNDÁRIO at 10, SECUNDÁRIO/MASSA at 1, the column appended after the five value columns', () => {
    const block = noAt('10 kV');
    expect([0, 1, 2].map((row) => at(block, row))).toEqual([
      { col: 5, kv: '10', text: '10', source: 'default', notice: null },
      { col: 5, kv: '10', text: '10', source: 'default', notice: null },
      { col: 5, kv: '1', text: '1', source: 'default', notice: null },
    ]);
    // e22g (Bruno's test base rev03, 2026-11-07): a 13,8 kV AT rating starts them at 5 kV whatever the megger.
    expect([0, 1, 2].map((row) => at(tf('10 kV'), row).kv)).toEqual(['5', '5', '1']);
    expect([...TEST_VOLTAGE_OPTIONS_KV]).toEqual(['0,5', '1', '2,5', '5', '10']);
  });

  it('each row changes to any option through its cell; the typed value wins', () => {
    for (const option of TEST_VOLTAGE_OPTIONS_KV) {
      const value = rowVoltageCell(option)!;
      const block = withTest(tf('10 kV'), 'isolacao', { '2/5': value });
      expect(at(block, 2)).toMatchObject({ kv: value.raw, text: option, source: 'typed' });
    }
    expect(rowVoltageCell('0,5')).toEqual({ raw: '0.5', unit: 'kV', state: 'measured' });
    expect(rowVoltageCell('3')).toBeNull();
  });

  it('with no AT rating, an instrument value that is not an option, or none, leaves the high-voltage rows empty, never missing; "5.000 V" reads 5', () => {
    expect(at(noAt('3 kV'), 0)).toMatchObject({ kv: null, text: '-', source: null });
    expect(at(noAt(null), 0)).toMatchObject({ kv: null, text: '-', source: null });
    expect(at(noAt(null), 2)).toMatchObject({ kv: '1', source: 'default' });
    expect(at(noAt('5.000 V'), 0)).toMatchObject({ kv: '5', text: '5' });
    const evaluation = evaluateSheetReadings(noAt(null), getDefinition('v12', 'cabine_primaria', 'transformador_forca')).find((one) => one.testKey === 'isolacao')!;
    const table = evaluation.tables[0]!;
    expect(table.columns.some((column) => column.col === 5)).toBe(false);
    expect(table.rows.every((row) => row.cells.every((one) => one.address.col !== 5))).toBe(true);
    expect(table.voltageColumn).toEqual({ col: 5, header: 'Tensão (kV)', options: ['0,5', '1', '2,5', '5', '10'], unit: 'kV' });
    expect(table.rows.map((row) => row.voltage?.text)).toEqual(['-', '-', '1']);
  });

  it('the notice: SECUNDÁRIO/MASSA at 10 kV and at 2,5 kV on a 220 V secondary names the winding and 0,5 ou 1 kV; at 1 and 0,5 kV, none', () => {
    const notice = 'Tensão de ensaio acima do suportado pelo enrolamento Secundário (220 V): use 0,5 ou 1 kV.';
    expect(at(withTest(tf('10 kV'), 'isolacao', { '2/5': rowVoltageCell('10') }), 2).notice).toBe(notice);
    expect(at(withTest(tf('10 kV'), 'isolacao', { '2/5': rowVoltageCell('2,5') }), 2).notice).toBe(notice);
    expect(at(withTest(tf('10 kV'), 'isolacao', { '2/5': rowVoltageCell('1') }), 2).notice).toBeNull();
    expect(at(withTest(tf('10 kV'), 'isolacao', { '2/5': rowVoltageCell('0,5') }), 2).notice).toBeNull();
    // A 13,8 kV primary at 10 kV warns of nothing.
    expect(at(tf('10 kV'), 0).notice).toBeNull();
  });

  it('no notice with an empty or unparsable BT; a 380/220 secondary reads its higher side', () => {
    const typed = { '2/5': rowVoltageCell('10') };
    expect(at(withTest(tf('10 kV', null), 'isolacao', typed), 2).notice).toBeNull();
    expect(at(withTest(tf('10 kV', 'abc'), 'isolacao', typed), 2).notice).toBeNull();
    expect(at(withTest(tf('10 kV', measured('380/220', 'V')), 'isolacao', typed), 2).notice).toBe('Tensão de ensaio acima do suportado pelo enrolamento Secundário (380/220 V): use 0,5 ou 1 kV.');
    expect(rowVoltageNotice(tf('10 kV'), null, '10', 'SECUNDÁRIO')).toBeNull();
  });

  it('the voltage never changes a verdict, a count or the criterion; a v11 table has no voltage at all', () => {
    const definition = getDefinition('v12', 'cabine_primaria', 'transformador_forca');
    const plain = evaluateSheetReadings(tf('10 kV'), definition);
    const typed = evaluateSheetReadings(withTest(tf('10 kV'), 'isolacao', { '2/5': rowVoltageCell('10') }), definition);
    const cellsOf = (evaluation: typeof plain) => evaluation.flatMap((test) => test.tables.flatMap((table) => table.rows.flatMap((row) => row.cells.map((one) => ({ missing: one.missing, verdict: one.verdict })))));
    expect(cellsOf(typed)).toEqual(cellsOf(plain));
    expect(typed[0]!.criterionText).toBe('>400 MΩ');
    const old = sheet('transformador_forca', 'v11');
    expect(rowTestVoltage(old, testOf(old, 'isolacao'), 2)).toBeNull();
    const v11 = evaluateSheetReadings(old, getDefinition('v11', 'cabine_primaria', 'transformador_forca'))[0]!.tables[0]!;
    expect(v11.voltageColumn).toBeNull();
    expect(v11.rows.every((row) => row.voltage === null)).toBe(true);
  });

  it('every other v12 insulation table takes the instrument for every row and names no winding', () => {
    const block = withTest(sheet('chave_seccionadora'), 'isolacao', {}, megger('5 kV'));
    const test = testOf(block, 'isolacao');
    for (let row = 0; row < 6; row++) expect(rowTestVoltage(block, test, row), String(row)).toMatchObject({ col: 1, kv: '5', notice: null });
  });
});

describe('22.9-UNIT the accuracy class (seed v12)', () => {
  it('the parser reads the class, the burden ignored, and never throws', () => {
    const table: [unknown, string | null][] = [
      ['0,6C25', '0,6'],
      ['10P20', '10P'],
      ['1,2P75', '1,2'],
      ['0.3', '0,3'],
      ['5P10', '5P'],
      ['C25', null],
      ['', null],
      ['3', '3'],
      ['  classe 0,6 ', '0,6'],
      [null, null],
      [12, null],
    ];
    for (const [text, cls] of table) expect(parseAccuracyClass(text), String(text)).toBe(cls);
    expect(accuracyClassDeviation('1,2')).toBe(1.2);
    // e22g (Bruno's test base rev03, 2026-11-07): 5P at ± 1 % (IEC 61869-2), 10P at ± 3 %.
    expect(accuracyClassDeviation('5P')).toBe(1);
    expect(accuracyClassDeviation('10P')).toBe(3);
    expect(accuracyClassDeviation(null)).toBeNull();
  });

  /** A v12 TC whose ratio row 0 reads `deviationPct` % off its 100/5 nameplate. */
  const tc = (cls: string | null, capture: string) => {
    const block = sheet('tc');
    if (cls !== null) withNameplate(block, { exatidao: cls });
    return withTest(block, 'relacao_transformacao', { '0/0': measured('100', 'A'), '0/1': measured('5', 'A'), '0/3': measured(capture, null) });
  };

  it('EXATIDÃO 1,2: 0,84 % is SATISFATÓRIO and the criterion reads ±1,2 %; exactly 1,2 % is within; the floor is not raised', () => {
    const at084 = ratioOf(tc('1,2', '20.168'));
    expect(at084.criterionText).toBe('±1,2 %');
    expect(at084.tables[0]!.rows[0]!.condicao).toBe('SATISFATÓRIO');
    expect(failedRatioRows([at084])).toEqual([]);
    expect(at084.classHelper).toBeNull();
    expect(ratioOf(tc('1,2', '20.24')).tables[0]!.rows[0]!.condicao).toBe('SATISFATÓRIO');
    expect(ratioOf(tc('1,2', '20.26')).tables[0]!.rows[0]!.condicao).toBe('INSATISFATÓRIO');
    expect(conclusionFloor(tc('1,2', '20.168'))).toEqual({ pair: { result: 'aprovado', restriction: 'sem_restricoes' }, reasons: [] });
    expect(conclusionFloor(tc(null, '20.168'))?.pair.result).toBe('reprovado');
  });

  it('5P is judged at ±1 % and 10P at ±3 % (e22g, Bruno\'s test base rev03); no class at ±0,5 % with the helper asking for EXATIDÃO', () => {
    expect(ratioOf(tc('5P', '20.5')).criterionText).toBe('±1 %');
    expect(ratioOf(tc('10P', '20.5')).criterionText).toBe('±3 %');
    // 2,5 % off: out at 5P, within at 10P.
    expect(ratioOf(tc('5P', '20.5')).tables[0]!.rows[0]!.condicao).toBe('INSATISFATÓRIO');
    expect(ratioOf(tc('10P', '20.5')).tables[0]!.rows[0]!.condicao).toBe('SATISFATÓRIO');
    const none = ratioOf(tc(null, '20.168'));
    expect(none.criterionText).toBe('±0,5 %');
    expect(none.tables[0]!.rows[0]!.condicao).toBe('INSATISFATÓRIO');
    expect(none.classHelper).toBe(ACCURACY_CLASS_HELPER);
  });

  it('a well-formed override still wins over the class; a malformed one leaves the class standing', () => {
    const over = (value: unknown) => {
      const block = tc('1,2', '20.168');
      block.sheet.test.relacao_transformacao!.criterion_override = cell(value);
      return effectiveCriterion(block, testOf(block, 'relacao_transformacao'))!.value;
    };
    expect(over({ raw: '0.3', unit: '%' })).toBe(0.3);
    expect(over({ raw: '-1', unit: '%' })).toBe(1.2);
    expect(over('x')).toBe(1.2);
  });

  it('the TP reads its class too; the transformer and a v11 TC keep ±0,5 % with no helper', () => {
    const tp = withTest(withNameplate(sheet('tp'), { exatidao: '0,6' }), 'relacao_transformacao', { '0/0': measured('13800', 'V'), '0/1': measured('115', 'V'), '0/3': measured('120.6', null) });
    expect(ratioOf(tp).criterionText).toBe('±0,6 %');
    const tf = ratioOf(sheet('transformador_forca'));
    expect(tf.criterionText).toBe('±0,5 %');
    expect(tf.classHelper).toBeNull();
    const old = withNameplate(sheet('tc', 'v11'), { exatidao: '1,2' });
    expect(ratioOf(old).criterionText).toBe('±0,5 %');
    expect(ratioOf(old).classHelper).toBeNull();
  });
});
