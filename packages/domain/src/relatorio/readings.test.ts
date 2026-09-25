import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { replay } from '../ops/replay.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import { emptySheet, type BlockRow, type Cell, type Sheet } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import {
  cellAddressesOf,
  cellAt,
  effectiveCriterion,
  evaluatedCells,
  evaluateSheetReadings,
  firstRunCell,
  nextUnit,
  readingLabelText,
  runTarget,
  unitDefaultFor,
  worstReadings,
  type CellAddress,
} from './readings.ts';
import { sheetProgress } from './sheet-progress.ts';

const ID = '019966b0-0051-7000-8000-000000000001';
const OP = '019966b0-0051-7000-8000-000000000002';

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });
const measured = (raw: string, unit: string | null) => cell({ raw, unit, state: 'measured' });

function block(type: EquipmentBlockType, sheet: Partial<Sheet> = {}, config?: unknown): BlockRow {
  return {
    id: ID,
    relatorio_id: ID,
    location_id: null,
    equipment_id: ID,
    block_type: type,
    config: (config ?? defaultBlockConfig('v1', type)) as BlockRow['config'],
    seed_version: 'v1',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: { ...emptySheet(), ...sheet },
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

/** A sheet whose `test` holds the given cells of one test. */
function test(testKey: string, cells: [number, number, Cell][]): Pick<Sheet, 'test'> {
  const out: Record<string, Record<string, Cell>> = {};
  for (const [row, col, c] of cells) out[String(row)] = { ...out[String(row)], [String(col)]: c };
  return { test: { [testKey]: { cells: out } } };
}

const SEC = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');
const TP = getDefinition('v1', 'cabine_primaria', 'tp');
const TC = getDefinition('v1', 'cabine_primaria', 'tc');
const PARA_RAIO = getDefinition('v1', 'cabine_primaria', 'para_raio');
const at = (testKey: CellAddress['testKey'], row: number, col: number): CellAddress => ({ testKey, row, col });

describe('5.5-UNIT the addressing is the fixture\'s', () => {
  it('rows run across the test\'s tables, cols index the row\'s table value_columns (print and derived excluded)', () => {
    expect(cellAddressesOf(SEC, 'isolacao')).toEqual([0, 1, 2, 3, 4, 5].map((row) => at('isolacao', row, 0)));
    expect(cellAddressesOf(PARA_RAIO, 'isolacao')).toEqual([0, 1, 2, 3].map((row) => at('isolacao', row, 1)));
    expect(cellAddressesOf(TP, 'relacao_transformacao').slice(0, 3)).toEqual([at('relacao_transformacao', 0, 0), at('relacao_transformacao', 0, 1), at('relacao_transformacao', 0, 3)]);
  });

  it('every tested block of the Porto Seguro fixture evaluates with nothing missing at its own addresses', () => {
    const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    const tested = snapshot.blocks.filter((b) => b.equipment_id !== null && b.not_tested === null);
    expect(tested.length).toBeGreaterThan(80);
    for (const b of tested) {
      const definition = getDefinition(b.seed_version, 'cabine_primaria', b.block_type);
      const cells = evaluatedCells(evaluateSheetReadings(b, definition));
      expect(cells.filter((c) => c.missing), `${b.block_type} ${b.id}`).toEqual([]);
      expect(sheetProgress(snapshot, b.id).steps.ensaios.missing).toBe(0);
    }
  });

  it('open question 2: the fixture\'s transformer ratio (V SECUNDÁRIO "380/220") computes nothing and judges nothing', () => {
    const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    const b = snapshot.blocks.find((row) => row.block_type === 'transformador_forca' && row.not_tested === null)!;
    const definition = getDefinition(b.seed_version, 'cabine_primaria', b.block_type);
    const row = evaluateSheetReadings(b, definition).find((t) => t.testKey === 'relacao_transformacao')!.tables[0]!.rows[0]!;
    expect(row.calculated).toBeNull();
    expect(row.condicao).toBeNull();
    expect(row.cells.filter((c) => c.role === 'capture').map((c) => c.verdict)).toEqual([null, null, null]);
  });

  it('the fixture\'s TP-C2 ratio (data.ts: 13800 V / 115 V, measured 120,135) computes 120,00 and SATISFATÓRIO', () => {
    const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    const equipment = snapshot.equipment.find((e) => e.tag === 'TP-C2')!;
    const b = snapshot.blocks.find((row) => row.equipment_id === equipment.id)!;
    const ratio = evaluateSheetReadings(b, TP).find((t) => t.testKey === 'relacao_transformacao')!;
    const row = ratio.tables[0]!.rows[0]!;
    expect(row.calculated?.text).toBe('120,00');
    expect(row.condicao).toBe('SATISFATÓRIO');
    expect(row.cells.find((c) => c.role === 'capture')?.displayText).toBe('120,135');
  });
});

describe('5.5-UNIT evaluateSheetReadings', () => {
  it('shows a seccionadora: two isolação tables and the contact resistance, criteria, headers, calc columns', () => {
    const [iso, rc] = evaluateSheetReadings(block('chave_seccionadora'), SEC);
    expect(iso!.title).toBe('Ensaio de isolação');
    expect(iso!.criterionText).toBe('>400 MΩ');
    expect(iso!.sourceName).toBe('aceitável na ficha');
    expect(iso!.tables.map((t) => t.title)).toEqual(['Seccionadora contato aberto', 'Seccionadora contato fechado']);
    expect(iso!.tables[0]!.connectionHeaders).toEqual(['Linha', 'Terra', 'Guard']);
    expect(iso!.tables[0]!.columns.map((c) => c.header)).toEqual(['Valor']);
    expect(iso!.tables[1]!.rows.map((r) => r.label)).toEqual(['Fase A', 'Fase B', 'Fase C']);
    expect(rc!.criterionText).toBe('<250 µΩ');
    const para = evaluateSheetReadings(block('para_raio'), PARA_RAIO)[0]!;
    expect(para.tables[0]!.columns.map((c) => c.header)).toEqual(['1 minuto']);
    const tp = evaluateSheetReadings(block('tp'), TP)[1]!;
    expect(tp.tables[0]!.columns.map((c) => [c.header, c.role, c.derivedKind])).toEqual([
      ['V primário', 'input', null],
      ['V secundário', 'input', null],
      ['Calculado', 'derived', 'calculated'],
      ['H1-H2 / X1-X2', 'capture', null],
      ['Condição', 'derived', 'condicao'],
    ]);
    expect(tp.tables[0]!.ratio).toBe(true);
  });

  it('judges against the criterion, with GΩ and TΩ scaled; helper words by operator', () => {
    const b = block(
      'chave_seccionadora',
      test('isolacao', [
        [0, 0, measured('330', 'MΩ')],
        [1, 0, measured('147', 'GΩ')],
        [2, 0, measured('3.7', 'TΩ')],
      ]),
    );
    const iso = evaluateSheetReadings(b, SEC)[0]!;
    const cells = iso.tables[0]!.rows.map((r) => r.cells[0]!);
    expect(cells.map((c) => c.verdict)).toEqual(['out', 'within', 'within']);
    expect(cells[0]!.helperText).toBe('Abaixo do aceitável (>400 MΩ)');
    expect(cells[1]!.helperText).toBeNull();
    expect(cells.map((c) => c.displayText)).toEqual(['330', '147', '3,7']);
    const rc = evaluateSheetReadings(block('chave_seccionadora', test('resistencia_contato', [[0, 0, measured('300', 'µΩ')]])), SEC)[1]!;
    expect(rc.tables[0]!.rows[0]!.cells[0]!.helperText).toBe('Acima do aceitável (<250 µΩ)');
  });

  it('an empty cell\'s unit defaults from the previous row of the same table, the first row from the column', () => {
    const b = block('chave_seccionadora', test('isolacao', [[0, 0, measured('147', 'TΩ')]]));
    const iso = evaluateSheetReadings(b, SEC)[0]!;
    expect(iso.tables[0]!.rows.map((r) => r.cells[0]!.unit)).toEqual(['TΩ', 'TΩ', 'TΩ']);
    expect(iso.tables[1]!.rows[0]!.cells[0]!.unit).toBe('GΩ');
    expect(unitDefaultFor(iso, at('isolacao', 1, 0))).toBe('TΩ');
    expect(unitDefaultFor(iso, at('isolacao', 3, 0))).toBe('GΩ');
    expect(iso.tables[0]!.rows[0]!.cells[0]!.units).toEqual(['MΩ', 'GΩ', 'TΩ']);
    const rc = evaluateSheetReadings(b, SEC)[1]!;
    expect(rc.tables[0]!.rows[0]!.cells[0]!.units).toEqual(['µΩ']);
    expect(nextUnit('MΩ')).toBe('GΩ');
    expect(nextUnit('TΩ')).toBe('MΩ');
    expect(nextUnit('µΩ')).toBe('µΩ');
  });

  it('flags an outlier 100x apart from at least two others of the same table and column', () => {
    const b = block(
      'chave_seccionadora',
      test('isolacao', [
        [3, 0, measured('330', 'MΩ')],
        [4, 0, measured('350', 'MΩ')],
        [5, 0, measured('0.33', 'MΩ')],
      ]),
    );
    const rows = evaluateSheetReadings(b, SEC)[0]!.tables[1]!.rows;
    expect(rows[2]!.cells[0]!.outlier).toEqual({ text: 'Fase C 1000× abaixo de A e B. Conferir?' });
    expect(rows[0]!.cells[0]!.outlier).toBeNull();
    // Mixed units compare in one scale; above works too; fewer than two others is no outlier.
    const above = block('chave_seccionadora', test('isolacao', [[0, 0, measured('200', 'GΩ')], [1, 0, measured('1', 'GΩ')], [2, 0, measured('1500', 'MΩ')]]));
    expect(evaluateSheetReadings(above, SEC)[0]!.tables[0]!.rows[0]!.cells[0]!.outlier?.text).toBe('T1 100× acima de T3 e T5. Conferir?');
    // E5-Q15: the nearest power of ten on a log scale: 3,3 against 3.300 and 3.200 (about 970x) reads 1000x.
    const near = block('chave_seccionadora', test('isolacao', [[3, 0, measured('3300', 'MΩ')], [4, 0, measured('3200', 'MΩ')], [5, 0, measured('3.3', 'MΩ')]]));
    expect(evaluateSheetReadings(near, SEC)[0]!.tables[1]!.rows[2]!.cells[0]!.outlier?.text).toBe('Fase C 1000× abaixo de A e B. Conferir?');
    const two = block('chave_seccionadora', test('isolacao', [[3, 0, measured('330', 'MΩ')], [5, 0, measured('0.33', 'MΩ')]]));
    expect(evaluateSheetReadings(two, SEC)[0]!.tables[1]!.rows[2]!.cells[0]!.outlier).toBeNull();
  });

  it('"Não medido" prints "-", empty prints "—", an unreadable stored value is invalid', () => {
    const b = block(
      'chave_seccionadora',
      test('isolacao', [
        [0, 0, cell({ raw: '', unit: 'GΩ', state: 'not_measured' })],
        [1, 0, cell({ raw: 'abc', unit: 'GΩ', state: 'measured' })],
      ]),
    );
    const cells = evaluateSheetReadings(b, SEC)[0]!.tables[0]!.rows.map((r) => r.cells[0]!);
    expect(cells.map((c) => [c.state, c.displayText, c.missing])).toEqual([
      ['not_measured', '-', false],
      ['invalid', 'abc', false],
      ['empty', '—', true],
    ]);
  });

  it('a TP ratio row: typed inputs, the calc, SATISFATÓRIO within ±0,5 %, "Fora do aceitável" out', () => {
    const b = block(
      'tp',
      test('relacao_transformacao', [
        [0, 0, measured('13800', 'V')],
        [0, 1, measured('115', 'V')],
        [0, 3, measured('120.135', null)],
        [1, 0, measured('13800', 'V')],
        [1, 1, measured('115', 'V')],
        [1, 3, measured('121', null)],
      ]),
    );
    const rows = evaluateSheetReadings(b, TP)[1]!.tables[0]!.rows;
    expect(rows[0]!.calculated).toEqual({ raw: '120', text: '120,00' });
    expect(rows[0]!.condicao).toBe('SATISFATÓRIO');
    expect(rows[1]!.condicao).toBeNull();
    expect(rows[1]!.cells[2]!.helperText).toBe('Fora do aceitável (±0,5 %)');
    // Row 3: inputs missing (no nameplate either) -> no calc, no verdict, both inputs missing.
    expect(rows[2]!.calculated).toBeNull();
    expect(rows[2]!.cells.map((c) => c.missing)).toEqual([true, true, true]);
  });

  it('untyped ratio inputs read the nameplate (TP: AT kV -> V, BT V; TC: RELAÇÃO "200/5"); an unparseable one computes nothing', () => {
    const tp = block('tp', {
      nameplate: { tensao_nominal_at: measured('13.8', 'kV'), tensao_nominal_bt: measured('115', 'V') },
      ...test('relacao_transformacao', [[0, 3, measured('120.1', null)]]),
    });
    const row = evaluateSheetReadings(tp, TP)[1]!.tables[0]!.rows[0]!;
    expect(row.cells[0]!.fallback).toEqual({ raw: '13800', text: '13.800' });
    expect(row.cells[0]!.source).toBe('nameplate');
    expect(row.cells[0]!.missing).toBe(false);
    expect(row.calculated?.text).toBe('120,00');
    expect(row.condicao).toBe('SATISFATÓRIO');
    const tc = block('tc', { nameplate: { relacao: cell('200/5') } });
    expect(evaluateSheetReadings(tc, TC)[1]!.tables[0]!.rows[0]!.calculated?.text).toBe('40,00');
    const bad = block('tc', { nameplate: { relacao: cell('380/220/1') } });
    expect(evaluateSheetReadings(bad, TC)[1]!.tables[0]!.rows[0]!.calculated).toBeNull();
  });

  it('a zero or negative primário or secundário computes no VAL CALCULADO, no verdict and no worst deviation', () => {
    for (const [primary, secondary] of [
      ['0', '115'],
      ['-13800', '115'],
      ['13800', '0'],
      ['13800', '-115'],
    ] as const) {
      const b = block(
        'tp',
        test('relacao_transformacao', [
          [0, 0, measured(primary, 'V')],
          [0, 1, measured(secondary, 'V')],
          [0, 3, measured('120', null)],
        ]),
      );
      const evaluations = evaluateSheetReadings(b, TP);
      const row = evaluations[1]!.tables[0]!.rows[0]!;
      expect(row.calculated).toBeNull();
      expect(row.cells[2]!.verdict).toBeNull();
      expect(row.condicao).toBeNull();
      expect(worstReadings(evaluations).some((w) => w.testKey === 'relacao_transformacao' || w.valueText.includes('Infinity'))).toBe(false);
    }
  });

  it('a disabled test is not evaluated', () => {
    const config = defaultBlockConfig('v1', 'chave_seccionadora', { subtype: 'manual' });
    const off = block('chave_seccionadora', {}, { ...config, sub_blocks: { ...config.sub_blocks, isolacao: { enabled: false } } });
    expect(evaluateSheetReadings(off, SEC).map((t) => t.testKey)).toEqual(['resistencia_contato']);
  });

  it('label text', () => {
    expect(readingLabelText('FASE A')).toBe('Fase A');
    expect(readingLabelText('MASSA/BLIND.')).toBe('Massa/blind.');
    expect(readingLabelText('H1-H2 / X1-X2')).toBe('H1-H2 / X1-X2');
    expect(readingLabelText("TP's")).toBe("TP's");
  });
});

describe('5.6-UNIT the continuous run', () => {
  const empty = evaluateSheetReadings(block('chave_seccionadora'), SEC);

  it('Enter goes down the column, then to the first empty cell of the next table, then ends', () => {
    expect(firstRunCell(empty)).toEqual(at('isolacao', 0, 0));
    expect(runTarget(empty, at('isolacao', 0, 0), 'next')).toEqual(at('isolacao', 1, 0));
    expect(runTarget(empty, at('isolacao', 2, 0), 'next')).toEqual(at('isolacao', 3, 0));
    expect(runTarget(empty, at('isolacao', 5, 0), 'next')).toEqual(at('resistencia_contato', 0, 0));
    expect(runTarget(empty, at('resistencia_contato', 2, 0), 'next')).toBe('end');
    // A filled first cell of the next table is skipped for its first empty one.
    const filled = evaluateSheetReadings(block('chave_seccionadora', test('isolacao', [[3, 0, measured('1', 'GΩ')]])), SEC);
    expect(runTarget(filled, at('isolacao', 2, 0), 'next')).toEqual(at('isolacao', 4, 0));
  });

  it('Shift+Enter goes back, across tables; Tab goes right within the row', () => {
    expect(runTarget(empty, at('isolacao', 3, 0), 'previous')).toEqual(at('isolacao', 2, 0));
    expect(runTarget(empty, at('resistencia_contato', 0, 0), 'previous')).toEqual(at('isolacao', 5, 0));
    expect(runTarget(empty, at('isolacao', 0, 0), 'previous')).toBeNull();
    const tp = evaluateSheetReadings(block('tp'), TP);
    expect(runTarget(tp, at('relacao_transformacao', 0, 0), 'right')).toEqual(at('relacao_transformacao', 0, 1));
    expect(runTarget(tp, at('relacao_transformacao', 0, 1), 'right')).toEqual(at('relacao_transformacao', 0, 3));
    expect(runTarget(tp, at('relacao_transformacao', 0, 3), 'right')).toBeNull();
  });

  it('the run skips ratio inputs that read the nameplate', () => {
    const tp = evaluateSheetReadings(block('tp', { nameplate: { tensao_nominal_at: measured('13.8', 'kV'), tensao_nominal_bt: measured('115', 'V') } }), TP);
    expect(runTarget(tp, at('isolacao', 2, 1), 'next')).toEqual(at('relacao_transformacao', 0, 3));
    expect(cellAt(tp, at('relacao_transformacao', 0, 0))?.source).toBe('nameplate');
  });
});

describe('5.8-UNIT worstReadings', () => {
  it('the lowest insulation, the highest contact resistance, an out reading outranking the rest', () => {
    const b = block('chave_seccionadora', {
      ...test('isolacao', [
        [0, 0, measured('500', 'MΩ')],
        [1, 0, measured('1', 'GΩ')],
      ]),
    });
    b.sheet.test.resistencia_contato = { cells: { '0': { '0': measured('100', 'µΩ') }, '1': { '0': measured('300', 'µΩ') } } };
    const worst = worstReadings(evaluateSheetReadings(b, SEC));
    expect(worst.map((w) => [w.testKey, w.valueText, w.where, w.verdict])).toEqual([
      ['isolacao', '500 MΩ', 'T1–T2', 'within'],
      ['resistencia_contato', '300 µΩ', 'T3-T4–Fase B', 'out'],
    ]);
  });
});

describe('E5-A4 criterion_override', () => {
  const ISO = SEC.tests.find((t) => t.key === 'isolacao')!;
  const override = (value: unknown) => ({ cells: {}, criterion_override: cell(value) });
  const readings = (): Sheet['test'][string]['cells'] => ({ '0': { '0': measured('500', 'MΩ') }, '1': { '0': measured('2', 'GΩ') } });

  it('a well-formed override replaces the value and unit; operator, type and source stay the seed\'s', () => {
    const b = block('chave_seccionadora', { test: { isolacao: { ...override({ raw: '1000', unit: 'MΩ' }), cells: readings() } } });
    const criterion = effectiveCriterion(b, ISO);
    expect(criterion).toMatchObject({ key: 'isolacao', operator: '>', value: 1000, unit: 'MΩ', type: 'absolute_min', source: { name: 'aceitável na ficha' } });
    const iso = evaluateSheetReadings(b, SEC)[0]!;
    expect(iso.criterionText).toBe('>1000 MΩ');
    expect(iso.sourceName).toBe('aceitável na ficha');
    const cells = iso.tables[0]!.rows.map((r) => r.cells[0]!);
    // 500 MΩ is within the seed's >400 MΩ but out of the override's >1000 MΩ; 2 GΩ stays within.
    expect(cells.slice(0, 2).map((c) => c.verdict)).toEqual(['out', 'within']);
    expect(cells[0]!.helperText).toBe('Abaixo do aceitável (>1000 MΩ)');
    // The conclusion's criteria items read the same effective criterion.
    expect(worstReadings(evaluateSheetReadings(b, SEC)).find((r) => r.testKey === 'isolacao')!.criterionText).toBe('>1000 MΩ');
  });

  it('an override in another convertible unit is judged through the Ω scale', () => {
    const b = block('chave_seccionadora', { test: { isolacao: { ...override({ raw: '1.5', unit: 'GΩ' }), cells: readings() } } });
    const iso = evaluateSheetReadings(b, SEC)[0]!;
    expect(iso.criterionText).toBe('>1,5 GΩ');
    expect(iso.tables[0]!.rows.slice(0, 2).map((r) => r.cells[0]!.verdict)).toEqual(['out', 'within']);
  });

  it.each([
    ['a bare number', 1000],
    ['a string', '1000 MΩ'],
    ['no raw', { unit: 'MΩ' }],
    ['a non-decimal raw', { raw: '1.000,5', unit: 'MΩ' }],
    ['an unconvertible unit', { raw: '1000', unit: 'µΩ-x' }],
    ['a unit of another scale', { raw: '1', unit: '%' }],
    ['no unit field', { raw: '1000' }],
    ['a null value', null],
  ])('a malformed override (%s) leaves the seed criterion, without throwing', (_name, value) => {
    const b = block('chave_seccionadora', { test: { isolacao: { ...override(value), cells: readings() } } });
    expect(effectiveCriterion(b, ISO)).toMatchObject({ value: 400, unit: 'MΩ' });
    const iso = evaluateSheetReadings(b, SEC)[0]!;
    expect(iso.criterionText).toBe('>400 MΩ');
    expect(iso.tables[0]!.rows[0]!.cells[0]!.verdict).toBe('within');
  });
});
