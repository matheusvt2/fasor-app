import { describe, expect, it } from 'vitest';
import {
  ADDED_ROWS_BLOCK_ID,
  ADDED_ROWS_BLOCK_TYPE,
  ADDED_ROWS_DEFINITION,
  ADDED_ROWS_TYPE_ID,
  addedRowId,
  addedRowsBlock,
  addedRowsOp,
  addedRowsState,
  addedRowsVersionRow,
  BATTERIES_TEST,
  NO_KEY_TEST,
  POINTS_TEST,
  reading,
} from '../../fixtures/added-rows.ts';
import { layoutLockSnapshot, LAYOUT_LOCK_ISSUED_AT } from '../../fixtures/layout-lock/op-log.ts';
import { auditInput } from '../audit/input.ts';
import { openDecisions } from '../merge/conflicts.ts';
import { applyOp, entityKey, readPath, SeedPathError, type EntityState } from '../ops/apply.ts';
import { materializeEntity } from '../ops/materialize.ts';
import type { Op } from '../ops/op.ts';
import { invertBatch } from '../ops/outbox.ts';
import { formatPath, measurementCellPath, parsePath, sheetTestCellPath, sheetTestRowCellPath, sheetTestRowPath } from '../ops/path.ts';
import { opValueIssue, textCapOf } from '../ops/value-limits.ts';
import { sheetPointFindings } from '../points/derived.ts';
import { blockReadings, readingAddressKey, readingSlotsOf } from '../print/last-results.ts';
import { layoutSpec } from '../print/layout.ts';
import { section9Layout, type PrintSheet, type PrintTable } from '../print/section-9.ts';
import { companyBlockType } from '../schemas/block-config.ts';
import { emptySheet, type BlockRow, type Cell, type EquipmentRow, type Sheet } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getDefinition, SEED_VERSIONS } from '../seed/definitions.ts';
import { ADDED_ROW_NAME_MAX_LENGTH, ADDED_ROWS_DEFAULT_MAX, addedRowsSchema, measurementTestSchema } from '../seed/measurement.ts';
import { countsAsEdit, countsAsFieldContent } from '../status/edited-since.ts';
import { asBlockDefinition } from '../types/block-definition.ts';
import { companyTypeDefinitionSchema, type CompanyTypeDefinition } from '../types/definition.ts';
import {
  addedRowName,
  addedRowNameConflictLabel,
  addedRowNameLabel,
  addedRowNameTaken,
  addedRowRemoveLabel,
  addedRowRemovedText,
  addedRowsAddedText,
  addedRowsAtMaxText,
  addedRowsFromPlateLabel,
  addedRowsPlateReason,
  addedRowUnnamedText,
  nextAddedRowNames,
  plateRowCount,
} from './added-rows.ts';
import { composeConclusion } from './conclusion.ts';
import { evaluateSheetMeasurements, measurementCounts, measurementRunTarget, type MeasurementTestEvaluation } from './measurement-evaluation.ts';
import { sheetProgress } from './sheet-progress.ts';
import { sheetState } from './sheet-state.ts';
import { nameplateCopyFields } from './nameplate-copy.ts';

/*
 * 25.14-UNIT (batch e25s, Story 25.14, contract 54; M23, M30, M19; Matheus's decision 3): a row the technician adds
 * to a measurement test whose definition carries `added_rows`. The fold's paths and refusals, the caps, the order,
 * the evaluation, the progress, the conclusion paragraph, the point's finding, the audit text, the print rows and the
 * merge of two devices. On a seed only v16 carries the key (the Malha's continuity test, Story 25.16, its own tests
 * in `e25s-ground-grid-points.test.ts`; the thermography, Story 25.15), so every case here reads the fixture's
 * company type (`fixtures/added-rows.ts`, invented data) on a v16 block.
 */

const definition = asBlockDefinition(addedRowsVersionRow());
const OP = '019a5c00-2517-7000-8000-000000000001';

/** A cell as the fold stores it. */
const cell = (value: unknown, opId = OP): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: opId });

/** A sheet holding added rows of `testKey`: each `{id, name, cells: {col: value}, removed_at?}`. */
function sheetWith(testKey: string, rows: { id: string; name: string | null; cells?: Record<number, unknown>; removedAt?: string }[], base: Sheet = emptySheet()): Sheet {
  const sheet = structuredClone(base);
  const entry = (sheet.test[testKey] ??= { cells: {} });
  entry.added_rows = Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        name: cell(row.name),
        ...(row.removedAt === undefined ? {} : { removed_at: row.removedAt }),
        cells: Object.fromEntries(Object.entries(row.cells ?? {}).map(([col, value]) => [col, cell(value)])),
      },
    ]),
  );
  return sheet;
}

/** The fold's block after `ops`, folded in order over the fixture's state. */
function fold(ops: readonly Op[], state: EntityState = addedRowsState()): BlockRow {
  let next = state;
  for (const op of ops) next = applyOp(next, op);
  return next.get(entityKey('block', ADDED_ROWS_BLOCK_ID)) as BlockRow;
}

const namePath = (rowId: string, testKey = POINTS_TEST) => sheetTestRowPath(ADDED_ROWS_BLOCK_ID, testKey, rowId, 'name');
const removedPath = (rowId: string, testKey = POINTS_TEST) => sheetTestRowPath(ADDED_ROWS_BLOCK_ID, testKey, rowId, 'removed_at');
const cellPath = (rowId: string, col: number, testKey = POINTS_TEST) => sheetTestRowCellPath(ADDED_ROWS_BLOCK_ID, testKey, rowId, col);

const testOf = (block: BlockRow, key: string): MeasurementTestEvaluation => evaluateSheetMeasurements(block, definition).find((test) => test.testKey === key)!;

describe('25.14-UNIT the definition key', () => {
  it('holds the action, an optional stem, an optional plate field and a maximum; a plate field needs a stem', () => {
    expect(addedRowsSchema.safeParse({ label: 'Adicionar ponto' }).success).toBe(true);
    expect(addedRowsSchema.safeParse({ label: 'Adicionar bateria', stem: { singular: 'Bateria', plural: 'baterias', gender: 'f' }, plate_field: 'baterias_quantidade', max: 12 }).success).toBe(true);
    expect(addedRowsSchema.safeParse({ label: 'Adicionar bateria', plate_field: 'baterias_quantidade' }).success).toBe(false);
    expect(addedRowsSchema.safeParse({ label: '' }).success).toBe(false);
    expect(addedRowsSchema.safeParse({ label: 'Adicionar ponto', max: 0 }).success).toBe(false);
    expect(addedRowsSchema.safeParse({ label: 'Adicionar ponto', max: 101 }).success).toBe(false);
    expect(ADDED_ROWS_DEFAULT_MAX).toBe(30);
  });

  it('a definition names a plate field that is one number of its plate, never another kind nor a missing field', () => {
    expect(companyTypeDefinitionSchema.safeParse(ADDED_ROWS_DEFINITION).success).toBe(true);
    const withField = (plateField: string): CompanyTypeDefinition => {
      const out = structuredClone(ADDED_ROWS_DEFINITION);
      out.measurement_tests![1]!.added_rows!.plate_field = plateField;
      return out;
    };
    const refused = companyTypeDefinitionSchema.safeParse(withField('fabricante'));
    expect(refused.success).toBe(false);
    expect(refused.error?.issues.some((issue) => issue.path.join('.') === 'measurement_tests.1.added_rows.plate_field')).toBe(true);
    expect(companyTypeDefinitionSchema.safeParse(withField('nao_existe')).success).toBe(false);
  });

  it('no seeded definition of v1 to v15 carries it, so every relatório of those seeds reads as before; on v16 the Malha\'s continuity test (Story 25.16) and the thermography (Story 25.15) do', () => {
    for (const [version, bundle] of Object.entries(SEED_VERSIONS)) {
      for (const block of Object.values(bundle.report_types.cabine_primaria.blocks)) {
        for (const test of block.measurement_tests ?? []) {
          // Seed v17 (batch e27b) keeps v16's keys.
          const fromV16 = version === 'v16' || version === 'v17';
          const story2516 = fromV16 && block.block_type === 'malha_aterramento' && test.key === 'continuidade_malha';
          if (story2516) expect(test.added_rows).toEqual({ label: 'Adicionar ponto' });
          else if (!fromV16 || test.key !== 'termografia') expect(test.added_rows, `${version} ${block.block_type}/${test.key}`).toBeUndefined();
        }
      }
    }
    // The seed grammar takes the key.
    const malha = getDefinition('v16', 'cabine_primaria', 'malha_aterramento').measurement_tests!.find((test) => test.key === 'continuidade_malha')!;
    expect(measurementTestSchema.safeParse(malha).success).toBe(true);
  });
});

describe('25.14-UNIT the fold: the paths', () => {
  it('formats and parses the two new families', () => {
    const rowId = addedRowId(1);
    expect(namePath(rowId)).toBe(`sheet/${ADDED_ROWS_BLOCK_ID}/test/${POINTS_TEST}/row/${rowId}/name`);
    expect(cellPath(rowId, 0)).toBe(`sheet/${ADDED_ROWS_BLOCK_ID}/test/${POINTS_TEST}/row/${rowId}/cell/0`);
    for (const path of [namePath(rowId), removedPath(rowId), cellPath(rowId, 3)]) expect(formatPath(parsePath(path))).toBe(path);
    expect(parsePath(cellPath(rowId, 3))).toMatchObject({ family: 'sheet/test/row/cell', row_id: rowId, col: 3 });
    // A definition row's cell keeps its family; an added row's goes through its own (`measurementCellPath`).
    expect(measurementCellPath(ADDED_ROWS_BLOCK_ID, { testKey: POINTS_TEST, row: 0, col: 0 })).toBe(sheetTestCellPath(ADDED_ROWS_BLOCK_ID, POINTS_TEST, 0, 0));
    expect(measurementCellPath(ADDED_ROWS_BLOCK_ID, { testKey: POINTS_TEST, row: 2, col: 0, rowId })).toBe(cellPath(rowId, 0));
    expect(() => parsePath(`sheet/${ADDED_ROWS_BLOCK_ID}/test/${POINTS_TEST}/row/not-an-id/name`)).toThrow();
    expect(() => parsePath(`sheet/${ADDED_ROWS_BLOCK_ID}/test/${POINTS_TEST}/row/${rowId}/label`)).toThrow();
  });

  it('a name put adds the row, its cells and its rename are stored under it, a removal tombstones it and a put of null restores it with its readings', () => {
    const rowId = addedRowId(1);
    let block = fold([addedRowsOp('put', namePath(rowId), null)]);
    expect(block.sheet.test[POINTS_TEST]!.added_rows![rowId]).toEqual({ name: expect.objectContaining({ value: null }), cells: {} });
    block = fold([addedRowsOp('put', namePath(rowId), null), addedRowsOp('put', cellPath(rowId, 0), reading('0.31', 'Ω')), addedRowsOp('put', namePath(rowId), 'Quadro geral')]);
    const row = block.sheet.test[POINTS_TEST]!.added_rows![rowId]!;
    expect(row.name?.value).toBe('Quadro geral');
    expect(row.cells['0']?.value).toEqual(reading('0.31', 'Ω'));
    // The key order of the row and of the test entry is the schema's.
    expect(Object.keys(row)).toEqual(['name', 'cells']);
    expect(Object.keys(block.sheet.test[POINTS_TEST]!)).toEqual(['cells', 'added_rows']);

    const remove = addedRowsOp('remove', removedPath(rowId), null, { clientTs: '2026-11-15T12:00:00.000Z' });
    const removed = fold([addedRowsOp('put', namePath(rowId), 'Quadro geral'), addedRowsOp('put', cellPath(rowId, 0), reading('0.31', 'Ω')), remove]);
    expect(removed.sheet.test[POINTS_TEST]!.added_rows![rowId]!.removed_at).toBe('2026-11-15T12:00:00.000Z');
    expect(removed.sheet.test[POINTS_TEST]!.added_rows![rowId]!.cells['0']?.value).toEqual(reading('0.31', 'Ω'));
    expect(testOf(removed, POINTS_TEST).rows.some((evaluated) => evaluated.added !== undefined)).toBe(false);

    const restored = fold([addedRowsOp('put', removedPath(rowId), null)], addedRowsState(removed));
    expect(restored.sheet.test[POINTS_TEST]!.added_rows![rowId]!.removed_at).toBeNull();
    expect(testOf(restored, POINTS_TEST).rows.find((evaluated) => evaluated.added?.id === rowId)?.cells[0]?.raw).toBe('0.31');
  });

  it('every write attributes the block as a sheet edit, and the status counts the readings and the name as field content', () => {
    const rowId = addedRowId(1);
    const block = fold([addedRowsOp('put', namePath(rowId), 'Ponto A')]);
    expect(block.last_modified_by).not.toBeNull();
    expect(block.first_edited_at).not.toBeNull();
    const at = (kind: Op['kind'], path: string, value: unknown) => ({ kind, path, value, actor_id: 'user' });
    expect(countsAsEdit(at('put', namePath(rowId), 'Ponto A'))).toBe(true);
    expect(countsAsFieldContent(at('put', namePath(rowId), 'Ponto A'))).toBe(true);
    expect(countsAsFieldContent(at('put', cellPath(rowId, 0), reading('1', 'Ω')))).toBe(true);
    expect(countsAsEdit(at('remove', removedPath(rowId), null))).toBe(true);
    expect(countsAsFieldContent(at('remove', removedPath(rowId), null))).toBe(false);
    expect(countsAsFieldContent(at('put', removedPath(rowId), null))).toBe(false);
  });

  it('readPath gives the inverse of a removal its value, so "Desfazer" puts null back and the row returns with its readings', () => {
    const rowId = addedRowId(1);
    const state = addedRowsState(fold([addedRowsOp('put', namePath(rowId), 'Ponto A'), addedRowsOp('put', cellPath(rowId, 0), reading('0.2', 'Ω'))]));
    const remove = addedRowsOp('remove', removedPath(rowId), null);
    expect(readPath(state, remove)).toBeNull();
    const after = applyOp(state, remove);
    const [inverse] = invertBatch([remove], new Map([[remove.op_id, readPath(state, remove)]]), { newId: () => addedRowsOp('put', namePath(rowId), null).op_id, now: new Date('2026-11-15T13:00:00.000Z') });
    expect(inverse).toMatchObject({ kind: 'put', path: removedPath(rowId), value: null });
    const back = applyOp(after, inverse!).get(entityKey('block', ADDED_ROWS_BLOCK_ID)) as BlockRow;
    const row = testOf(back, POINTS_TEST).rows.find((evaluated) => evaluated.added?.id === rowId)!;
    expect(row.label).toBe('Ponto A');
    expect(row.cells[0]?.raw).toBe('0.2');
  });
});

describe('25.14-UNIT the fold: the refusals', () => {
  const rowId = addedRowId(1);
  const refused = (op: Op, state: EntityState = addedRowsState()) => expect(() => applyOp(state, op)).toThrow(SeedPathError);

  it('a test whose definition lacks the key, on a company type and on a seeded type (the v16 CTA), refuses an added row', () => {
    refused(addedRowsOp('put', namePath(rowId, NO_KEY_TEST), 'Ponto'));
    // A seeded measurement test of v16 (the CTA's E1) carries no key either.
    const cta = { ...addedRowsBlock(), block_type: 'chave_transferencia_automatica', config: { block_type: 'chave_transferencia_automatica', sub_blocks: {}, na_defaults: [] } } as BlockRow;
    const state: EntityState = new Map([[entityKey('block', cta.id), cta]]);
    refused(addedRowsOp('put', sheetTestRowPath(cta.id, 'cta_resistencia_contato', rowId, 'name'), 'Ponto'), state);
    refused(addedRowsOp('put', sheetTestRowCellPath(cta.id, 'cta_resistencia_contato', rowId, 0), reading('1', 'µΩ')), state);
    // A seeded-grammar test (the v16 TP's isolação) takes none either.
    const tp = { ...addedRowsBlock(), block_type: 'tp', config: { block_type: 'tp', sub_blocks: {}, na_defaults: [] } } as BlockRow;
    refused(addedRowsOp('put', sheetTestRowPath(tp.id, 'isolacao', rowId, 'name'), 'Ponto'), new Map([[entityKey('block', tp.id), tp]]));
    // A test the definition does not have.
    refused(addedRowsOp('put', namePath(rowId, 'nao_existe'), 'Ponto'));
  });

  it('a cell or a removal of a row that does not exist, and a cell outside the columns', () => {
    refused(addedRowsOp('put', cellPath(rowId, 0), reading('1', 'Ω')));
    refused(addedRowsOp('remove', removedPath(rowId), null));
    const state = addedRowsState(fold([addedRowsOp('put', namePath(rowId), 'Ponto A')]));
    refused(addedRowsOp('put', cellPath(rowId, 1), reading('1', 'Ω')), state);
    expect(() => applyOp(state, addedRowsOp('put', cellPath(rowId, 0), reading('1', 'Ω')))).not.toThrow();
  });

  it('the caps: a name is a string or null of at most 80 characters, and a test takes its maximum of live rows', () => {
    refused(addedRowsOp('put', namePath(rowId), 42));
    refused(addedRowsOp('put', namePath(rowId), 'x'.repeat(ADDED_ROW_NAME_MAX_LENGTH + 1)));
    expect(() => applyOp(addedRowsState(), addedRowsOp('put', namePath(rowId), 'x'.repeat(ADDED_ROW_NAME_MAX_LENGTH)))).not.toThrow();
    refused(addedRowsOp('put', removedPath(rowId), 'not an instant'), addedRowsState(fold([addedRowsOp('put', namePath(rowId), 'Ponto A')])));

    // The batteries take 12 (their key's maximum); the thirteenth is refused, and a removal frees a place.
    const twelve = Array.from({ length: 12 }, (_, i) => addedRowsOp('put', namePath(addedRowId(i + 1), BATTERIES_TEST), `Bateria ${i + 1}`));
    const full = addedRowsState(fold(twelve));
    refused(addedRowsOp('put', namePath(addedRowId(13), BATTERIES_TEST), 'Bateria 13'), full);
    // A rename of a row already there is no new row.
    expect(() => applyOp(full, addedRowsOp('put', namePath(addedRowId(3), BATTERIES_TEST), 'Bateria três'))).not.toThrow();
    const freed = applyOp(full, addedRowsOp('remove', removedPath(addedRowId(1), BATTERIES_TEST), null));
    const thirteenth = applyOp(freed, addedRowsOp('put', namePath(addedRowId(13), BATTERIES_TEST), 'Bateria 13'));
    // Restoring the removed one would make 13: refused.
    refused(addedRowsOp('put', removedPath(addedRowId(1), BATTERIES_TEST), null), thirteenth);

    // The points take the default 30.
    const thirty = addedRowsState(fold(Array.from({ length: 30 }, (_, i) => addedRowsOp('put', namePath(addedRowId(i + 1)), `Ponto ${i + 1}`))));
    refused(addedRowsOp('put', namePath(addedRowId(31)), 'Ponto 31'), thirty);
  });

  it('the push rule caps the name as the fold does and takes a reading as a test cell', () => {
    const issue = (path: string, value: unknown) => opValueIssue(addedRowsOp('put', path, value), parsePath(path));
    expect(issue(namePath(rowId), 'Ponto A')).toBeNull();
    expect(issue(namePath(rowId), null)).toBeNull();
    expect(issue(namePath(rowId), 'x'.repeat(ADDED_ROW_NAME_MAX_LENGTH + 1))).not.toBeNull();
    expect(issue(namePath(rowId), { raw: 'x' })).not.toBeNull();
    expect(issue(cellPath(rowId, 0), { raw: '2', unit: 'Ω', state: 'over_range' })).toBeNull();
    expect(textCapOf(namePath(rowId))).toBe(ADDED_ROW_NAME_MAX_LENGTH);
  });
});

describe('25.14-UNIT the order and the evaluation', () => {
  it('the added rows show after the definition rows in the order they were created (by id), whatever order their ops folded in', () => {
    const first = addedRowId(1);
    const second = addedRowId(2);
    const block = fold([addedRowsOp('put', namePath(second), 'Segundo'), addedRowsOp('put', namePath(first), 'Primeiro')]);
    const test = testOf(block, POINTS_TEST);
    expect(test.rows.map((row) => row.label)).toEqual(['Carcaças', 'Portas', 'Primeiro', 'Segundo']);
    expect(test.rows.map((row) => row.row)).toEqual([0, 1, 2, 3]);
    expect(test.rows[2]!.cells[0]!.address).toEqual({ testKey: POINTS_TEST, row: 2, col: 0, rowId: first });
    // A definition row's address carries no row id (every older reader and basis keeps its bytes).
    expect(test.rows[0]!.cells[0]!.address).toEqual({ testKey: POINTS_TEST, row: 0, col: 0 });
  });

  it('its cells are judged by their columns\' criteria, an empty one is missing, and a row with no name counts as missing', () => {
    const block = addedRowsBlock(
      sheetWith(BATTERIES_TEST, [
        { id: addedRowId(1), name: 'Bateria 1', cells: { 0: reading('13.6', 'V'), 1: { raw: 'ok', unit: null, state: 'measured' } } },
        { id: addedRowId(2), name: null, cells: { 0: reading('11.8', 'V'), 1: { raw: 'falhou', unit: null, state: 'measured' } } },
        { id: addedRowId(3), name: 'Bateria 3' },
      ]),
    );
    const test = testOf(block, BATTERIES_TEST);
    const [banco, one, two, three] = test.rows;
    expect(banco!.added).toBeUndefined();
    expect(one!.cells.map((c) => c.verdict)).toEqual(['within', 'within']);
    expect(two!.label).toBe('Bateria sem nome');
    expect(two!.added).toEqual({ id: addedRowId(2), name: null, nameMissing: true });
    expect(two!.cells.map((c) => c.verdict)).toEqual(['out', 'out']);
    expect(two!.cells[0]!.helperText).toBe('Abaixo do aceitável (≥ 12 V)');
    expect(three!.cells.map((c) => c.missing)).toEqual([true, true]);
    // Banco's two cells, Bateria 3's two cells and the unnamed row's name.
    expect(measurementCounts([test])).toEqual({ missing: 5, outOfLimit: 2 });
  });

  it('a row stored under a test whose definition lacks the key is neither shown nor counted', () => {
    const block = addedRowsBlock(sheetWith(NO_KEY_TEST, [{ id: addedRowId(1), name: 'Intruso', cells: { 0: reading('9', 'Ω') } }]));
    expect(testOf(block, NO_KEY_TEST).rows.map((row) => row.label)).toEqual(['Único']);
  });

  it('the Enter run goes down the column into the added rows and the right of a row stays on it', () => {
    const block = addedRowsBlock(sheetWith(POINTS_TEST, [{ id: addedRowId(1), name: 'Ponto A' }, { id: addedRowId(2), name: 'Ponto B' }]));
    const evaluations = evaluateSheetMeasurements(block, definition);
    const portas = { testKey: POINTS_TEST, row: 1, col: 0 };
    expect(measurementRunTarget(evaluations, portas, 'next')).toEqual({ testKey: POINTS_TEST, row: 2, col: 0, rowId: addedRowId(1) });
    expect(measurementRunTarget(evaluations, { testKey: POINTS_TEST, row: 2, col: 0, rowId: addedRowId(1) }, 'next')).toEqual({ testKey: POINTS_TEST, row: 3, col: 0, rowId: addedRowId(2) });
    expect(measurementRunTarget(evaluations, { testKey: POINTS_TEST, row: 3, col: 0, rowId: addedRowId(2) }, 'previous')).toEqual({ testKey: POINTS_TEST, row: 2, col: 0, rowId: addedRowId(1) });
  });

  it('"Igual à" copies the plate only: a sheet holding added rows gives no row to another sheet', () => {
    const source = addedRowsBlock(sheetWith(POINTS_TEST, [{ id: addedRowId(1), name: 'Ponto A', cells: { 0: reading('0.2', 'Ω') } }]));
    source.sheet.nameplate.fabricante = cell('Fabricante X');
    expect(nameplateCopyFields(source, definition).map((field) => field.fieldKey)).toEqual(['fabricante']);
  });

  it('no previous visit is read for an added row: its key never meets a slot of the definition, and the issue keeps none of it', () => {
    const block = addedRowsBlock(sheetWith(POINTS_TEST, [{ id: addedRowId(1), name: 'Ponto A', cells: { 0: reading('0.2', 'Ω') } }]));
    const slots = new Set(readingSlotsOf(definition, block).map(readingAddressKey));
    const added = testOf(block, POINTS_TEST).rows.find((row) => row.added !== undefined)!.cells[0]!;
    expect(readingAddressKey(added.address)).toBe(`${POINTS_TEST}/+${addedRowId(1)}/0`);
    expect(slots.has(readingAddressKey(added.address))).toBe(false);
    expect(blockReadings(block, definition)).toEqual({});
  });
});

describe('25.14-UNIT the view, the plate count and the words', () => {
  const batteries = ADDED_ROWS_DEFINITION.measurement_tests![1]!.added_rows!;
  const points = ADDED_ROWS_DEFINITION.measurement_tests![0]!.added_rows!;

  it('a plate that reads 10 with three rows already added asks for seven more, "Bateria 4" to "Bateria 10"', () => {
    const sheet = sheetWith(BATTERIES_TEST, [1, 2, 3].map((n) => ({ id: addedRowId(n), name: `Bateria ${n}` })));
    sheet.nameplate.baterias_quantidade = cell(reading('10', ''));
    const view = testOf(addedRowsBlock(sheet), BATTERIES_TEST).addedRows!;
    expect(view).toMatchObject({ label: 'Adicionar bateria', count: 3, max: 12, canAdd: true, nextName: 'Bateria 4' });
    expect(view.fromPlate).toEqual({ count: 10, names: ['Bateria 4', 'Bateria 5', 'Bateria 6', 'Bateria 7', 'Bateria 8', 'Bateria 9', 'Bateria 10'] });
    expect(addedRowsFromPlateLabel(batteries, 7)).toBe('Adicionar as 7 baterias que faltam');
    expect(addedRowsPlateReason(batteries, 10)).toBe('A placa diz 10 baterias.');
  });

  it('nothing is added by itself: the view only offers; past the maximum the plate asks for what fits, and a name already taken is skipped', () => {
    const sheet = sheetWith(BATTERIES_TEST, [{ id: addedRowId(1), name: 'Bateria 2' }]);
    sheet.nameplate.baterias_quantidade = cell(reading('40', ''));
    const block = addedRowsBlock(sheet);
    const test = testOf(block, BATTERIES_TEST);
    expect(test.rows.filter((row) => row.added !== undefined)).toHaveLength(1);
    expect(test.addedRows!.fromPlate!.names).toHaveLength(11);
    expect(test.addedRows!.fromPlate!.names.slice(0, 2)).toEqual(['Bateria 3', 'Bateria 4']);
    expect(nextAddedRowNames(batteries, test.rows, 1)).toEqual(['Bateria 3']);
  });

  it('the plate count is a whole number of at least 1; empty, N/A or 2,5 asks for nothing', () => {
    const at = (value: unknown) => {
      const sheet = emptySheet();
      if (value !== undefined) sheet.nameplate.baterias_quantidade = cell(value);
      return plateRowCount(addedRowsBlock(sheet), definition.nameplate, batteries);
    };
    expect(at(reading('4', ''))).toBe(4);
    expect(at(undefined)).toBeNull();
    expect(at({ raw: '', unit: null, state: 'not_applicable' })).toBeNull();
    expect(at(reading('2.5', ''))).toBeNull();
    expect(at(reading('0', ''))).toBeNull();
    expect(plateRowCount(addedRowsBlock(), definition.nameplate, points)).toBeNull();
  });

  it('a test at its maximum is off, and says so', () => {
    const sheet = sheetWith(BATTERIES_TEST, Array.from({ length: 12 }, (_, i) => ({ id: addedRowId(i + 1), name: `Bateria ${i + 1}` })));
    const view = testOf(addedRowsBlock(sheet), BATTERIES_TEST).addedRows!;
    expect(view.canAdd).toBe(false);
    expect(addedRowsAtMaxText(batteries)).toBe('Máximo de 12 baterias nesta tabela.');
    expect(addedRowsAtMaxText(points)).toBe('Máximo de 30 pontos nesta tabela.');
  });

  it('two rows of one test may not share a name on one device: another added row\'s or a definition row\'s, ignoring case and spaces', () => {
    const block = addedRowsBlock(sheetWith(POINTS_TEST, [{ id: addedRowId(1), name: 'Quadro geral' }, { id: addedRowId(2), name: null }]));
    const rows = testOf(block, POINTS_TEST).rows;
    expect(addedRowNameTaken(rows, addedRowId(2), '  quadro   GERAL ')).toBe(true);
    expect(addedRowNameTaken(rows, addedRowId(2), 'carcaças')).toBe(true);
    expect(addedRowNameTaken(rows, addedRowId(1), 'Quadro geral')).toBe(false);
    expect(addedRowNameTaken(rows, addedRowId(2), '   ')).toBe(false);
    expect(addedRowName('  Quadro  ')).toBe('Quadro');
    expect(addedRowName('   ')).toBeNull();
  });

  it('the words, after the frames: the name field, the remove action, the toasts', () => {
    expect(addedRowNameLabel(points)).toBe('Nome do ponto');
    expect(addedRowNameLabel(batteries)).toBe('Nome da bateria');
    expect(addedRowRemoveLabel(points, 'Quadro geral de baixa tensão')).toBe('Remover ponto Quadro geral de baixa tensão');
    expect(addedRowRemoveLabel(batteries, 'Bateria 1')).toBe('Remover bateria Bateria 1');
    expect(addedRowRemovedText(points, 'Quadro geral de baixa tensão')).toBe('Ponto removido: Quadro geral de baixa tensão');
    expect(addedRowRemovedText(batteries, 'Bateria 1')).toBe('Bateria removida: Bateria 1');
    expect(addedRowsAddedText(points, [null])).toBe('Ponto acrescentado: dê um nome a ele');
    expect(addedRowsAddedText(batteries, ['Bateria 3'])).toBe('Bateria acrescentada: Bateria 3');
    expect(addedRowsAddedText(batteries, ['Bateria 3', 'Bateria 4'])).toBe('2 baterias acrescentadas: Bateria 3 e Bateria 4');
    expect(addedRowsAddedText(batteries, ['Bateria 3', 'Bateria 4', 'Bateria 5'])).toBe('3 baterias acrescentadas: Bateria 3, Bateria 4 e Bateria 5');
    expect(addedRowsFromPlateLabel(batteries, 1)).toBe('Adicionar a bateria que falta');
    expect(addedRowsPlateReason(batteries, 1)).toBe('A placa diz 1 bateria.');
    expect(addedRowUnnamedText(points)).toBe('Ponto sem nome');
  });
});

// --- the readers over a snapshot -----------------------------------------------------------------------

const EQUIPMENT_ID = '019a5c00-2514-7000-8000-0000000000e1';

/** The layout lock's v16 relatório with the fixture's sheet beside its own, on its cabine. */
function snapshotWith(sheet: Sheet): RelatorioSnapshot {
  const snapshot = structuredClone(layoutLockSnapshot('v16'));
  const cabine = snapshot.locations.find((location) => location.kind === 'cabine')!;
  const equipment: EquipmentRow = { ...structuredClone(snapshot.equipment[0]!), id: EQUIPMENT_ID, tag: 'BT-01', type: ADDED_ROWS_BLOCK_TYPE, last_nameplate: null, last_results: null };
  snapshot.equipment.push(equipment);
  snapshot.blocks.push({ ...addedRowsBlock(sheet), relatorio_id: snapshot.relatorio.id, location_id: cabine.id, equipment_id: EQUIPMENT_ID, order_key: 'zz' });
  (snapshot as { equipment_types?: unknown[] }).equipment_types = [...(snapshot.equipment_types ?? []), addedRowsVersionRow()];
  return snapshot;
}

/** The fixture's sheet: two added continuity points, one out of its criterion, and one battery. */
function readerSheet(name = 'Quadro geral de baixa tensão'): Sheet {
  const points = sheetWith(POINTS_TEST, [
    { id: addedRowId(1), name, cells: { 0: reading('0.92', 'Ω') } },
    { id: addedRowId(2), name: 'Portão', cells: { 0: reading('0.19', 'Ω') } },
  ]);
  points.test[POINTS_TEST]!.cells = { '0': { '0': cell(reading('0.12', 'Ω')) }, '1': { '0': cell(reading('0.31', 'Ω')) } };
  return sheetWith(BATTERIES_TEST, [{ id: addedRowId(3), name: 'Bateria 1', cells: { 0: reading('13.6', 'V'), 1: { raw: 'ok', unit: null, state: 'measured' } } }], points);
}

const tablesOf = (sheet: PrintSheet): PrintTable[] => sheet.parts.flatMap((part) => (part.kind === 'table' ? [part.table] : []));
const grid = (table: PrintTable) => table.rows.map((row) => row.cells.map((one) => one.text.replaceAll(' ', ' ')));

describe('25.14-UNIT the readers', () => {
  it('the sheet\'s state: a sheet holding only an added row is being filled (so removing it asks first); a removed row is no data', () => {
    expect(sheetState(addedRowsBlock())).toBe('vazia');
    expect(sheetState(addedRowsBlock(sheetWith(POINTS_TEST, [{ id: addedRowId(1), name: 'Ponto A' }])))).toBe('em_preenchimento');
    expect(sheetState(addedRowsBlock(sheetWith(POINTS_TEST, [{ id: addedRowId(1), name: null, cells: { 0: reading('0.2', 'Ω') } }])))).toBe('em_preenchimento');
    expect(sheetState(addedRowsBlock(sheetWith(POINTS_TEST, [{ id: addedRowId(1), name: 'Ponto A', removedAt: '2026-11-15T12:00:00.000Z' }])))).toBe('vazia');
  });

  it('the progress: the Ensaios step counts an added row\'s empty cell and a missing name', () => {
    const complete = snapshotWith(readerSheet());
    const base = sheetProgress(complete, ADDED_ROWS_BLOCK_ID).steps.ensaios.missing;
    const unnamed = snapshotWith(sheetWith(POINTS_TEST, [{ id: addedRowId(9), name: null, cells: {} }], readerSheet()));
    // The unnamed row's name and its one empty cell.
    expect(sheetProgress(unnamed, ADDED_ROWS_BLOCK_ID).steps.ensaios.missing).toBe(base + 2);
  });

  it('the conclusion paragraph names the added row out of its criterion by its name, and a rename moves its basis', () => {
    const block = { ...addedRowsBlock(readerSheet()) };
    const composed = composeConclusion(block, definition, 'BT-01');
    expect(composed.text).toContain('Quadro geral de baixa tensão');
    const renamed = composeConclusion(addedRowsBlock(readerSheet('QGBT')), definition, 'BT-01');
    expect(renamed.text).toContain('QGBT');
    expect(renamed.basis).not.toBe(composed.basis);
  });

  it('the point\'s finding names the added row out of its criterion', () => {
    const findings = sheetPointFindings(snapshotWith(readerSheet()), ADDED_ROWS_BLOCK_ID);
    const reading = findings.find((finding) => finding.testKey === POINTS_TEST);
    expect(reading?.text).toContain('Quadro geral de baixa tensão');
  });

  it('the print: the added rows after the definition rows, with their names in the first column, judged by the column', () => {
    const snapshot = snapshotWith(readerSheet());
    const sheet = section9Layout(snapshot, 9, 'RESULTADOS')!.subsections.flatMap((sub) => sub.sheets).find((one) => one.blockId === ADDED_ROWS_BLOCK_ID)!;
    const points = tablesOf(sheet).find((table) => table.rows[0]!.cells[0]!.text.includes('CONTINUIDADE'))!;
    const firsts = grid(points).map((row) => row[0]);
    expect(firsts.slice(-4)).toEqual(['CARCAÇAS', 'PORTAS', 'QUADRO GERAL DE BAIXA TENSÃO', 'PORTÃO']);
    // seed v16 (v15's `criterion_result_per_row`): the added row prints its criterion and its result.
    expect(grid(points).find((row) => row[0] === 'QUADRO GERAL DE BAIXA TENSÃO')!.slice(-2)).toEqual(['≤ 0,5 Ω entre pontos', 'INSATISFATÓRIO']);
    const batteries = tablesOf(sheet).find((table) => table.rows[0]!.cells[0]!.text.includes('FLUTUAÇÃO'))!;
    expect(grid(batteries).map((row) => row[0]).slice(-2)).toEqual(['BANCO', 'BATERIA 1']);
  });

  it('the audit text reads the added rows as the print does', () => {
    const snapshot = snapshotWith(readerSheet());
    const input = auditInput(layoutSpec(snapshot, { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT }), snapshot);
    expect(input.text).toContain('QUADRO GERAL DE BAIXA TENSÃO');
    expect(input.text).toContain('BATERIA 1');
  });
});

describe('25.14-UNIT two devices', () => {
  const opsOf = (deviceId: string, rowId: string, name: string, raw: string) => [addedRowsOp('put', namePath(rowId), name, { deviceId }), addedRowsOp('put', cellPath(rowId, 0), reading(raw, 'Ω'), { deviceId })];

  it('rows added on two devices offline are both kept, each with its reading, whatever the server\'s order; nothing merges two rows of one name', () => {
    const a = opsOf('tablet-a', addedRowId(1), 'Ponto novo', '0.2');
    const b = opsOf('tablet-b', addedRowId(2), 'Ponto novo', '0.3');
    for (const order of [[...a, ...b], [...b, ...a]]) {
      const block = fold(order);
      const added = testOf(block, POINTS_TEST).rows.filter((row) => row.added !== undefined);
      expect(added.map((row) => [row.label, row.cells[0]!.raw])).toEqual([
        ['Ponto novo', '0.2'],
        ['Ponto novo', '0.3'],
      ]);
    }
  });

  it('a row added on one device and removed on another while a third fills its cells: the removal stands, the readings stay under it, and no fold throws', () => {
    const rowId = addedRowId(1);
    const create = addedRowsOp('put', namePath(rowId), 'Ponto novo', { deviceId: 'tablet-a' });
    const remove = addedRowsOp('remove', removedPath(rowId), null, { deviceId: 'tablet-b' });
    const fill = addedRowsOp('put', cellPath(rowId, 0), reading('0.4', 'Ω'), { deviceId: 'tablet-c' });
    const context: EntityState = new Map([[entityKey('equipment_type_version', addedRowsVersionRow().id), addedRowsVersionRow()]]);
    const base = addedRowsBlock();
    const blockCreate = addedRowsOp('create', `block/${base.id}`, base);
    for (const after of [[remove, fill], [fill, remove]]) {
      const remote = [blockCreate, create, ...after].map((op, i) => ({ ...op, seq: i + 1 }));
      // The device folds the server's log (`materializeEntity`), the server folds the same ops in `seq` order.
      const row = materializeEntity({ entity: 'block', id: base.id }, remote, [], context) as BlockRow;
      const stored = row.sheet.test[POINTS_TEST]!.added_rows![rowId]!;
      expect(stored.removed_at).not.toBeNull();
      expect(stored.cells['0']?.value).toEqual(reading('0.4', 'Ω'));
      expect(testOf(row, POINTS_TEST).rows.some((evaluated) => evaluated.added !== undefined)).toBe(false);
    }
  });

  it('two devices naming one row differently is a contradiction the conflict view names by the row, and a contradicting reading by the row and the column', () => {
    const rowId = addedRowId(1);
    const create = addedRowsOp('put', namePath(rowId), 'Ponto', { deviceId: 'tablet-a' });
    const a = addedRowsOp('put', namePath(rowId), 'Portão norte', { deviceId: 'tablet-a', prevOpId: create.op_id });
    const b = addedRowsOp('put', namePath(rowId), 'Portão sul', { deviceId: 'tablet-b', prevOpId: create.op_id });
    const fillA = addedRowsOp('put', cellPath(rowId, 0), reading('0.2', 'Ω'), { deviceId: 'tablet-a' });
    const fillB = addedRowsOp('put', cellPath(rowId, 0), reading('0.3', 'Ω'), { deviceId: 'tablet-b' });
    // Review of PR #334: a second row whose name is contested too; its label must not read as the first one's.
    const otherId = addedRowId(2);
    const createOther = addedRowsOp('put', namePath(otherId), 'Cerca', { deviceId: 'tablet-a' });
    const otherA = addedRowsOp('put', namePath(otherId), 'Cerca leste', { deviceId: 'tablet-a', prevOpId: createOther.op_id });
    const otherB = addedRowsOp('put', namePath(otherId), 'Cerca oeste', { deviceId: 'tablet-b', prevOpId: createOther.op_id });
    const block = fold([create, a, b, fillA, fillB, createOther, otherA, otherB]);
    const stored = block.sheet.test[POINTS_TEST]!.added_rows![rowId]!;
    expect(stored.name?.value).toBe('Portão sul');
    expect(stored.name?.conflict?.value).toBe('Portão norte');
    expect(stored.cells['0']?.conflict).toBeDefined();
    const decisions = openDecisions({
      relatorioId: block.relatorio_id,
      blocks: [block],
      locations: [],
      equipment: [],
      opOf: () => undefined,
      createOpOf: () => undefined,
      definitions: { versions: new Map([[`${ADDED_ROWS_TYPE_ID}@1`, addedRowsVersionRow()]]), byId: new Map([[addedRowsVersionRow().id, addedRowsVersionRow()]]), types: new Map() },
    });
    const cells = decisions.flatMap((decision) => (decision.kind === 'cell' ? decision.cells : []));
    const otherName = block.sheet.test[POINTS_TEST]!.added_rows![otherId]!.name!;
    expect(otherName.conflict).toBeDefined();
    expect(cells.map((one) => [one.section, one.label])).toEqual([
      ['E1 · Continuidade', 'Nome do ponto · Portão sul'],
      ['E1 · Continuidade', 'Portão sul · Resistência'],
      ['E1 · Continuidade', `Nome do ponto · ${otherName.value as string}`],
    ]);
    expect(cells[0]!.path).toBe(namePath(rowId));
    expect(cells[2]!.path).toBe(namePath(otherId));
    // A row with no name is labelled by its place in the table, after the definition's rows.
    const [pointsKey, batteriesKey] = [ADDED_ROWS_DEFINITION.measurement_tests![0]!.added_rows!, ADDED_ROWS_DEFINITION.measurement_tests![1]!.added_rows!];
    expect(addedRowNameConflictLabel(pointsKey, null, 6)).toBe('Nome do ponto · Linha 7');
    expect(addedRowNameConflictLabel(batteriesKey, 'Bateria 2', 0)).toBe('Nome da bateria · Bateria 2');
  });

  it('the block type of the fixture is a company type of the fixture\'s id', () => {
    expect(ADDED_ROWS_BLOCK_TYPE).toBe(companyBlockType(ADDED_ROWS_TYPE_ID));
  });
});
