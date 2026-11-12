import { describe, expect, it } from 'vitest';
import { layoutLockEpic25Snapshot } from '../../fixtures/layout-lock/op-log.ts';
import { auditInput } from '../audit/input.ts';
import { applyOp, entityKey, type EntityState } from '../ops/apply.ts';
import { makeOp } from '../ops/op.ts';
import { sheetTestCellPath } from '../ops/path.ts';
import { blockReadings } from '../print/last-results.ts';
import { layoutSpec } from '../print/layout.ts';
import { section9Layout, type PrintSheet } from '../print/section-9.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, EMPTY_DEFINITION_CONTEXT, getDefinition, seedRule, snapshotDefinitionContext } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { T0, TEST_COMPANY, TEST_PROJECT, TEST_RELATORIO, TEST_USER } from '../test-support.ts';
import { composeConclusion, noMeasurementRefusesAprovado } from './conclusion.ts';
import { evaluateSheetMeasurements, measurementCounts } from './measurement-evaluation.ts';
import { OVER_RANGE_INSIDE_RANGE_HELPER } from './over-range.ts';
import { notApplicableReadingValue, readingNotApplicableOn, rowNotApplicableOffered, rowNotApplicableTargets } from './reading-not-applicable.ts';
import { evaluatedCells, evaluateSheetReadings, ratioRowCalculatedText, ratioRowCondicaoText, type EvaluatedCell, type TestEvaluation } from './readings.ts';
import { sheetProgress } from './sheet-progress.ts';
import { newEquipmentBlock } from './tree.ts';
import { visitContextOf } from './visit-context.ts';

/*
 * 25.9-UNIT (batch e25c, Story 25.9, seed v15 `reading_not_applicable`; M05, M-5): a reading cell marked "Não se
 * aplica" through the evaluation, the progress, the comparisons between phases and poles, the previous visit, the
 * print cell, the audit text and Story 25.6's rule; the fold and every reader unchanged for a v1 to v14 sheet.
 * The helper of a limit inside a range criterion (e24x X6), on every seed. Every value is invented.
 */

const id = (n: number) => `019966b0-0e25-7009-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(90_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });
const notMeasured = (unit: string | null) => ({ raw: '', unit, state: 'not_measured' as const });
const NA = notApplicableReadingValue;

function sheet(type: EquipmentBlockType, seedVersion: string): BlockRow {
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

function put(block: BlockRow, testKey: string, row: number, col: number, value: unknown): BlockRow {
  const next = structuredClone(block);
  const test = next.sheet.test[testKey] ?? { cells: {} };
  test.cells[String(row)] = { ...test.cells[String(row)], [String(col)]: cell(value) };
  next.sheet.test[testKey] = test;
  return next;
}

function drop(block: BlockRow, testKey: string, row: number, col: number): BlockRow {
  const next = structuredClone(block);
  delete next.sheet.test[testKey]?.cells[String(row)]?.[String(col)];
  return next;
}

const cellAt = (evaluations: readonly TestEvaluation[], testKey: string, row: number, col: number): EvaluatedCell =>
  evaluatedCells(evaluations).find((one) => one.address.testKey === testKey && one.address.row === row && one.address.col === col)!;

/** What the screen and the readers take of a cell beyond its own state. */
const judgement = (one: EvaluatedCell) => ({ verdict: one.verdict, helperText: one.helperText, restriction: one.restriction ?? null, outlier: one.outlier });

/** A v15 (or v14) TP: the insulation's three phases measured, the ratio's three rows typed, each polarity OK. */
function tp(version: string): BlockRow {
  let block = sheet('tp', version);
  for (const [row, raw] of [[0, '98'], [1, '102'], [2, '100']] as const) block = put(block, 'isolacao', row, 1, measured(raw, 'GΩ'));
  for (const row of [0, 1, 2]) {
    block = put(block, 'relacao_transformacao', row, 0, measured('13800', 'V'));
    block = put(block, 'relacao_transformacao', row, 1, measured('115', 'V'));
    block = put(block, 'relacao_transformacao', row, 3, measured(row === 1 ? '119.94' : '120.1', null));
    block = put(block, 'relacao_transformacao', row, 5, { raw: 'OK', unit: null, state: 'measured' });
  }
  return block;
}

// ===================================================================================================

describe('25.9-UNIT the seed flag', () => {
  it('v15 turns `reading_not_applicable` on; v14 and older read it off; the kernel offers it by the block\'s own seed', () => {
    expect(seedRule('v15', 'reading_not_applicable')).toBe(true);
    for (const version of ['v14', 'v13', 'v5', 'v1']) {
      expect(seedRule(version, 'reading_not_applicable'), version).toBe(false);
      expect(readingNotApplicableOn({ seed_version: version }), version).toBe(false);
    }
    expect(readingNotApplicableOn({ seed_version: 'v15' })).toBe(true);
    expect(NA('GΩ')).toEqual({ raw: '', unit: 'GΩ', state: 'not_applicable' });
  });
});

describe('25.9-UNIT a reading cell on v15', () => {
  it('AC 1: phase T of a TP\'s insulation N/A shows N/A, is filled and not missing, has no verdict; R and S are judged as with T left empty', () => {
    const base = tp('v15');
    const marked = put(base, 'isolacao', 2, 1, NA('GΩ'));
    const t = cellAt(evaluateSheetReadings(marked, definitionOf(marked)), 'isolacao', 2, 1);
    expect(t).toMatchObject({ state: 'not_applicable', displayText: 'N/A', missing: false, verdict: null, helperText: null, outlier: null, source: 'typed' });
    const empty = drop(base, 'isolacao', 2, 1);
    for (const row of [0, 1]) {
      expect(judgement(cellAt(evaluateSheetReadings(marked, definitionOf(marked)), 'isolacao', row, 1)), `row ${row}`).toEqual(judgement(cellAt(evaluateSheetReadings(empty, definitionOf(empty)), 'isolacao', row, 1)));
      expect(cellAt(evaluateSheetReadings(marked, definitionOf(marked)), 'isolacao', row, 1).verdict).toBe('within');
    }
    // The sheet's count: nothing missing with T N/A, one missing with T empty.
    expect(sheetProgress({ blocks: [marked] }, marked.id).steps.ensaios.missing).toBe(0);
    expect(sheetProgress({ blocks: [empty] }, empty.id).steps.ensaios.missing).toBe(1);
  });

  it('a ratio input or capture alone N/A: the input reads no plate value and no VAL CALCULADO; the capture leaves the row unjudged; neither is missing', () => {
    const input = put(tp('v15'), 'relacao_transformacao', 2, 0, NA('V'));
    const evaluated = evaluateSheetReadings(input, definitionOf(input));
    const row = evaluated.find((test) => test.testKey === 'relacao_transformacao')!.tables[0]!.rows[2]!;
    expect(row.cells.find((one) => one.address.col === 0)).toMatchObject({ state: 'not_applicable', displayText: 'N/A', fallback: null, missing: false });
    expect(row.calculated).toBeNull();
    expect(row.notApplicable).toBeUndefined();
    const capture = put(tp('v15'), 'relacao_transformacao', 2, 3, NA(null));
    const captured = evaluateSheetReadings(capture, definitionOf(capture)).find((test) => test.testKey === 'relacao_transformacao')!.tables[0]!.rows[2]!;
    expect(captured.calculated).not.toBeNull();
    expect(captured.condicao).toBeNull();
    expect(sheetProgress({ blocks: [capture] }, capture.id).steps.ensaios.missing).toBe(0);
  });

  it('AC 2: a whole ratio row N/A (the row action\'s targets): every typed cell N/A, VAL CALCULADO and CONDIÇÕES read N/A, its polarity is not asked', () => {
    const base = drop(tp('v15'), 'relacao_transformacao', 2, 5);
    const before = evaluateSheetReadings(base, definitionOf(base)).find((test) => test.testKey === 'relacao_transformacao')!.tables[0]!.rows[2]!;
    expect(rowNotApplicableOffered(base, before)).toBe(true);
    const targets = rowNotApplicableTargets(before);
    expect(targets.map((target) => target.address.col)).toEqual([0, 1, 3]);
    const marked = targets.reduce((block, target) => put(block, 'relacao_transformacao', target.address.row, target.address.col, NA(target.unit)), base);
    const row = evaluateSheetReadings(marked, definitionOf(marked)).find((test) => test.testKey === 'relacao_transformacao')!.tables[0]!.rows[2]!;
    expect(row.cells.map((one) => one.state)).toEqual(['not_applicable', 'not_applicable', 'not_applicable']);
    expect(row.cells.map((one) => one.displayText)).toEqual(['N/A', 'N/A', 'N/A']);
    expect(row).toMatchObject({ notApplicable: true, calculated: null, condicao: null });
    expect(ratioRowCalculatedText(row)).toBe('N/A');
    expect(ratioRowCondicaoText(row)).toBe('N/A');
    expect(row.choice).toMatchObject({ missing: false, verdict: null });
    // The other rows unchanged; nothing missing; the row offers its action no more.
    expect(sheetProgress({ blocks: [marked] }, marked.id).steps.ensaios.missing).toBe(0);
    expect(rowNotApplicableOffered(marked, row)).toBe(false);
    // The polarity still asked on the row left typed (the base dropped only row 2's).
    expect(sheetProgress({ blocks: [base] }, base.id).steps.ensaios.missing).toBe(1);
  });

  it('the row action is offered only on a row of two typed cells or more, never on a tap row nor on v14', () => {
    const block = tp('v15');
    const evaluated = evaluateSheetReadings(block, definitionOf(block));
    const insulation = evaluated.find((test) => test.testKey === 'isolacao')!.tables[0]!.rows[0]!;
    expect(rowNotApplicableOffered(block, insulation)).toBe(false);
    const ratio = evaluated.find((test) => test.testKey === 'relacao_transformacao')!.tables[0]!.rows[0]!;
    expect(rowNotApplicableOffered(block, ratio)).toBe(true);
    expect(rowNotApplicableOffered(tp('v14'), ratio)).toBe(false);
    expect(rowNotApplicableTargets({ ...ratio, tap: { position: 1 } as never })).toEqual([]);
  });

  it('a pole N/A is left out of the deviation between poles: the others are compared among themselves', () => {
    let breaker = sheet('disjuntor_mt', 'v15');
    for (const [row, raw] of [[0, '20'], [1, '40'], [2, '41']] as const) breaker = put(breaker, 'resistencia_contato', row, 0, measured(raw, 'µΩ'));
    // With pole A at 20 µΩ the other two are 100 % above it (restricted); with A N/A they are compared with each other.
    expect(cellAt(evaluateSheetReadings(breaker, definitionOf(breaker)), 'resistencia_contato', 1, 0).verdict).toBe('restricted');
    const marked = put(breaker, 'resistencia_contato', 0, 0, NA('µΩ'));
    const empty = drop(breaker, 'resistencia_contato', 0, 0);
    for (const row of [1, 2]) {
      expect(judgement(cellAt(evaluateSheetReadings(marked, definitionOf(marked)), 'resistencia_contato', row, 0)), `row ${row}`).toEqual(judgement(cellAt(evaluateSheetReadings(empty, definitionOf(empty)), 'resistencia_contato', row, 0)));
      expect(cellAt(evaluateSheetReadings(marked, definitionOf(marked)), 'resistencia_contato', row, 0).verdict).toBe('within');
    }
  });
});

describe('25.9-UNIT a number cell of a measurement test on v15 (the deviation between phases)', () => {
  /** An oil transformer whose winding resistance holds three phases on its first row. */
  function winding(version: string, c: unknown): BlockRow {
    let block = sheet('transformador_forca', version);
    block = { ...block, sheet: { ...block.sheet, nameplate: { ...block.sheet.nameplate, tipo_de_isolacao: cell('ÓLEO ISOLANTE') } } };
    block = put(block, 'resistencia_enrolamento', 0, 0, measured('1.2', 'Ω'));
    block = put(block, 'resistencia_enrolamento', 0, 1, measured('1.21', 'Ω'));
    return c === undefined ? block : put(block, 'resistencia_enrolamento', 0, 2, c);
  }
  const cellOf = (block: BlockRow, col: number) => evaluateSheetMeasurements(block, definitionOf(block)).find((test) => test.testKey === 'resistencia_enrolamento')!.rows[0]!.cells[col]!;

  it('AC 3: phase C N/A: A and B are compared with each other, nothing is unjudged and no paragraph reads "a conferir" for it', () => {
    const marked = winding('v15', NA('Ω'));
    expect(cellOf(marked, 2)).toMatchObject({ state: 'not_applicable', displayText: 'N/A', missing: false, verdict: null, helperText: null });
    const empty = winding('v15', undefined);
    for (const col of [0, 1]) {
      expect(cellOf(marked, col).verdict, `col ${col}`).toBe('within');
      expect({ verdict: cellOf(marked, col).verdict, helper: cellOf(marked, col).helperText }).toEqual({ verdict: cellOf(empty, col).verdict, helper: cellOf(empty, col).helperText });
    }
    const evaluation = evaluateSheetMeasurements(marked, definitionOf(marked)).find((test) => test.testKey === 'resistencia_enrolamento')!;
    expect(evaluation.unjudged).toBeUndefined();
    expect(measurementCounts(evaluateSheetMeasurements(marked, definitionOf(marked))).missing).toBeLessThan(measurementCounts(evaluateSheetMeasurements(empty, definitionOf(empty))).missing);
    expect(composeConclusion(marked, definitionOf(marked), 'TR1').text).not.toContain('a conferir');
  });

  it('on v14 the same stored value reads as it always did (invalid, shown as stored), never N/A', () => {
    const v14 = winding('v14', NA('Ω'));
    expect(cellOf(v14, 2).state).toBe('invalid');
    expect(cellOf(v14, 2).displayText).not.toBe('N/A');
  });
});

describe('25.9-UNIT Story 25.6\'s rule and the previous visit', () => {
  it('AC 5: part N/A and part "Não medido", none measured: the N/A cells are not measurements, so the sheet has no measurement', () => {
    let block = sheet('tp', 'v15');
    for (const row of [0, 1]) block = put(block, 'isolacao', row, 1, notMeasured('GΩ'));
    block = put(block, 'isolacao', 2, 1, NA('GΩ'));
    for (const row of [0, 1, 2]) for (const col of [0, 1, 3]) block = put(block, 'relacao_transformacao', row, col, row === 2 ? NA(null) : notMeasured(null));
    expect(noMeasurementRefusesAprovado(block, definitionOf(block))).toBe(true);
    // Every reading N/A, none "Não medido": nothing refused for it.
    let all = sheet('tp', 'v15');
    for (const row of [0, 1, 2]) all = put(all, 'isolacao', row, 1, NA('GΩ'));
    expect(noMeasurementRefusesAprovado(all, definitionOf(all))).toBe(false);
  });

  it('an N/A cell is no reading of the visit: the readings carried to the next visit leave it out', () => {
    const marked = put(tp('v15'), 'isolacao', 2, 1, NA('GΩ'));
    const keys = Object.keys(blockReadings(marked, definitionOf(marked)));
    expect(keys.some((key) => key.startsWith('isolacao|') && key.includes('|2|'))).toBe(false);
    expect(keys.filter((key) => key.startsWith('isolacao|'))).toHaveLength(2);
  });

  it('a pole N/A now is not judged against the previous visit (the rise rule reads measured poles only)', () => {
    const snapshot = layoutLockEpic25Snapshot('v15');
    const ctx = snapshotDefinitionContext(snapshot);
    const breaker = snapshot.blocks.find((block) => block.block_type === 'disjuntor_mt' && block.removed_at === null)!;
    const definition = blockDefinitionIn(ctx, breaker)!;
    const visit = visitContextOf(snapshot, breaker);
    const before = cellAt(evaluateSheetReadings(breaker, definition, visit), 'resistencia_contato', 1, 0);
    expect(before.rise ?? before.restriction).toBeTruthy();
    const marked = put(breaker, 'resistencia_contato', 0, 0, NA('µΩ'));
    const pole = cellAt(evaluateSheetReadings(marked, definition, visit), 'resistencia_contato', 0, 0);
    expect(pole).toMatchObject({ state: 'not_applicable', verdict: null });
    expect(pole.rise).toBeUndefined();
    expect(pole.restriction ?? null).toBeNull();
    expect(judgement(cellAt(evaluateSheetReadings(marked, definition, visit), 'resistencia_contato', 1, 0)).verdict).toBe(before.verdict);
  });
});

// --- the print and the audit (the Epic 25 fixture's TP, whose third phase is "Não medido") ------------------------

/** The Epic 25 v15 relatório with the TP's third phase (insulation and ratio row) and the oil transformer's phase C of its first winding row written `value`. */
function fixtureWith(value: (unit: string | null) => unknown): { snapshot: RelatorioSnapshot; tpId: string; oilId: string } {
  const snapshot = structuredClone(layoutLockEpic25Snapshot('v15'));
  const tpBlock = snapshot.blocks.find((block) => block.block_type === 'tp' && block.removed_at === null)!;
  const oil = snapshot.blocks.find((block) => block.block_type === 'transformador_forca' && block.removed_at === null && block.sheet.test.resistencia_enrolamento !== undefined)!;
  const write = (block: BlockRow, testKey: string, row: number, col: number, unit: string | null) => {
    const test = block.sheet.test[testKey]!;
    test.cells[String(row)] = { ...test.cells[String(row)], [String(col)]: cell(value(unit)) };
  };
  write(tpBlock, 'isolacao', 2, 1, 'GΩ');
  for (const [col, unit] of [[0, 'V'], [1, 'V'], [3, null]] as const) write(tpBlock, 'relacao_transformacao', 2, col, unit);
  write(oil, 'resistencia_enrolamento', 0, 2, 'Ω');
  return { snapshot, tpId: tpBlock.id, oilId: oil.id };
}

const printedSheets = (snapshot: RelatorioSnapshot): PrintSheet[] => section9Layout(snapshot, 9, 'RELATÓRIOS DOS ENSAIOS')!.subsections.flatMap((s) => s.sheets);
/** Every printed table cell of section 9, by sheet, part, row and cell. */
function printedCells(snapshot: RelatorioSnapshot): Map<string, string> {
  const out = new Map<string, string>();
  for (const printed of printedSheets(snapshot)) {
    printed.parts.forEach((part, p) => {
      if (part.kind !== 'table') return;
      part.table.rows.forEach((row, r) => row.cells.forEach((one, c) => out.set(`${printed.blockId}/${p}/${r}/${c}`, one.text)));
    });
  }
  return out;
}

describe('25.9-UNIT the print and the audit text', () => {
  it('AC 4: each N/A cell prints "N/A", the ratio row\'s VAL CALCULADO and CONDIÇÕES and the winding\'s corrected value too; no other printed cell differs from the same sheet "Não medido"', () => {
    const na = fixtureWith(NA);
    const nm = fixtureWith(notMeasured);
    const a = printedCells(na.snapshot);
    const b = printedCells(nm.snapshot);
    expect([...a.keys()]).toEqual([...b.keys()]);
    const differing = [...a.keys()].filter((key) => a.get(key) !== b.get(key));
    // Every difference is a "-" of the unmeasured sheet now N/A, on the TP or the oil transformer.
    for (const key of differing) {
      expect(a.get(key), key).toBe('N/A');
      expect(b.get(key), key).toBe('-');
      expect([na.tpId, na.oilId].some((blockId) => key.startsWith(`${blockId}/`)), key).toBe(true);
    }
    // The TP: the insulation cell, then the ratio row's two inputs, the VAL CALCULADO, the capture and the CONDIÇÕES.
    expect(differing.filter((key) => key.startsWith(`${na.tpId}/`))).toHaveLength(6);
    // The oil transformer: phase C of its first winding row and its value at 75 °C.
    expect(differing.filter((key) => key.startsWith(`${na.oilId}/`))).toHaveLength(2);
  });

  it('the Conferência por IA reads the cells as not applicable: its text carries "N/A" on the TP\'s third phase, never "-"', () => {
    const { snapshot, tpId } = fixtureWith(NA);
    const text = auditInput(layoutSpec(snapshot, { revisionNumber: 1, issuedAt: '2026-11-12T12:00:00.000Z' }), snapshot).text;
    const rows = text.split('\n').filter((line) => line.includes(`[row:${tpId}:`) && line.includes('FASE T'));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const line of rows) expect(line, line).toContain('N/A');
  });
});

describe('25.9-UNIT the fold is unchanged on every seed', () => {
  it('a put of "Não se aplica" on a test cell is stored as it was before, on a v14 sheet and on a v15 one', () => {
    for (const version of ['v14', 'v15']) {
      const block = sheet('tp', version);
      const state: EntityState = new Map([[entityKey('block', block.id), block as never]]);
      const op = makeOp(
        { kind: 'put', scope: 'relatorio', company_id: TEST_COMPANY, project_id: null, relatorio_id: TEST_RELATORIO, path: sheetTestCellPath(block.id, 'isolacao', 2, 1), value: NA('GΩ'), prev_op_id: null, batch_id: null, meta: null, actor_id: TEST_USER, device_id: 'tablet-test' },
        { newId: () => id(500), now: T0 },
      );
      const next = applyOp(state, op);
      const row = next.get(entityKey('block', block.id)) as unknown as BlockRow;
      expect(row.sheet.test.isolacao?.cells['2']?.['1']?.value, version).toEqual(NA('GΩ'));
    }
  });
});

describe('25.9-UNIT the helper of a limit inside a range criterion (every seed, screen only)', () => {
  it('the Epic 25 fixture\'s company row (125 Vcc ± 5 %): "> 125 Vcc" has no verdict and the helper; "> 131,25 Vcc" is out with its own; on v14 and v15 alike', () => {
    for (const version of ['v14', 'v15']) {
      const snapshot = structuredClone(layoutLockEpic25Snapshot(version));
      const company = snapshot.blocks.find((block) => block.block_type.startsWith('type:') && block.removed_at === null)!;
      const definition = blockDefinitionIn(snapshotDefinitionContext(snapshot), company)!;
      const at = (raw: string) => {
        company.sheet.test.tensoes_medidas!.cells['0'] = { '0': cell({ raw, unit: 'Vcc', state: 'over_range' }) };
        return evaluateSheetMeasurements(company, definition).find((test) => test.testKey === 'tensoes_medidas')!.rows[0]!.cells[0]!;
      };
      expect(at('125'), version).toMatchObject({ verdict: null, helperText: OVER_RANGE_INSIDE_RANGE_HELPER });
      const out = at('131.25');
      expect(out.verdict, version).toBe('out');
      expect(out.helperText).not.toBe(OVER_RANGE_INSIDE_RANGE_HELPER);
    }
  });

  it('the sentence is the one proposed for Bruno (B-6), verbatim', () => {
    expect(OVER_RANGE_INSIDE_RANGE_HELPER).toBe('Conferir: o limite do instrumento está dentro da faixa do critério; meça com outra escala.');
  });
});
