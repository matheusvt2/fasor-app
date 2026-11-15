import { describe, expect, it } from 'vitest';
import { layoutLockEpic25Fixture } from '../../fixtures/layout-lock/op-log.ts';
import { applyOp, entityKey, SeedPathError, type EntityState } from '../ops/apply.ts';
import { makeOp, type Op } from '../ops/op.ts';
import { sheetTestRowCellPath, sheetTestRowPath } from '../ops/path.ts';
import { replay } from '../ops/replay.ts';
import { section9Layout, type PrintTable } from '../print/section-9.ts';
import type { BlockRow, EquipmentRow } from '../schemas/entities.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import { getDefinition } from '../seed/definitions.ts';
import { composeConclusion, conclusionFloor } from './conclusion.ts';
import { evaluateSheetMeasurements, type MeasurementTestEvaluation } from './measurement-evaluation.ts';
import { sheetProgress } from './sheet-progress.ts';

/*
 * 25.16-UNIT, the readers (batch e25s, Story 25.16; Bruno's answer 6, M30): on seed v16 the Malha de aterramento's
 * continuity test takes the points the technician adds (Story 25.14's key, "Adicionar ponto", no stem). Over the
 * layout lock's Epic 25 relatório (its Malha with the five continuity rows within), folded through the new paths:
 * an added point shows after the five and is judged by the same criterion; one out of it makes the floor
 * Reprovado, the conclusion paragraph names it and the print lists it after the five; the v15 Malha offers no
 * action and its fold refuses the paths. The seed's own pins are in `seed.test.ts` (25.16-UNIT). Values invented.
 */

const TEST = 'continuidade_malha';
/** This file's row ids and op ids: `019a6100-2516-7000-8000-NNNNNNNNNNNN`, `019a6100-2517-7000-8000-NNNNNNNNNNNN`. */
const rowId = (n: number) => `019a6100-2516-7000-8000-${n.toString(16).padStart(12, '0')}`;

interface Grid {
  state: EntityState;
  relatorioId: string;
  block: BlockRow;
  tag: string;
}

/** The Epic 25 relatório of `version`, replayed, with its Malha. */
function gridOf(version: 'v15' | 'v16'): Grid {
  const fixture = layoutLockEpic25Fixture(version);
  const state = replay(fixture.log);
  const block = [...state.values()].find((row) => (row as BlockRow).block_type === 'malha_aterramento' && (row as BlockRow).relatorio_id === fixture.relatorioId) as BlockRow;
  const equipment = state.get(entityKey('equipment', block.equipment_id!)) as EquipmentRow;
  return { state, relatorioId: fixture.relatorioId, block, tag: equipment.tag };
}

let opCount = 0;
/** A relatório-scope put of the fixture's actor. */
function putOf(grid: Grid, path: string, value: unknown): Op {
  opCount += 1;
  return makeOp(
    {
      kind: 'put',
      scope: 'relatorio',
      // The layout lock's default actor.
      company_id: '019a6100-0000-7000-8000-000000000001',
      project_id: null,
      relatorio_id: grid.relatorioId,
      path,
      value: value as Op['value'],
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: '019a6100-0000-7000-8000-000000000002',
      device_id: 'tablet-e25s-2516',
    },
    { newId: () => `019a6100-2517-7000-8000-${opCount.toString(16).padStart(12, '0')}`, now: new Date(Date.parse('2026-11-15T10:00:00.000Z') + opCount * 1000) },
  );
}

const reading = (raw: string) => ({ raw, unit: 'Ω', state: 'measured' as const });

/** The points added to the grid's continuity test, each `[name, ohms]`, folded in order; the state after them. */
function withPoints(grid: Grid, points: readonly (readonly [string, string])[]): EntityState {
  let state = grid.state;
  points.forEach(([name, raw], n) => {
    const id = rowId(n + 1);
    state = applyOp(state, putOf(grid, sheetTestRowPath(grid.block.id, TEST, id, 'name'), name));
    state = applyOp(state, putOf(grid, sheetTestRowCellPath(grid.block.id, TEST, id, 0), reading(raw)));
  });
  return state;
}

const blockIn = (state: EntityState, grid: Grid) => state.get(entityKey('block', grid.block.id)) as BlockRow;
const continuityOf = (block: BlockRow, version: string): MeasurementTestEvaluation =>
  evaluateSheetMeasurements(block, getDefinition(version, 'cabine_primaria', 'malha_aterramento')).find((test) => test.testKey === TEST)!;
const grid = (table: PrintTable) => table.rows.map((row) => row.cells.map((one) => one.text.replaceAll(' ', ' ')));

describe('25.16-UNIT the v16 Malha de aterramento takes continuity points beyond the five', () => {
  it('offers "Adicionar ponto" under the five rows; "Cerca metálica" at 0,3 Ω shows after them, within "≤ 0,5 Ω entre pontos"', () => {
    const malha = gridOf('v16');
    const before = continuityOf(malha.block, 'v16');
    expect(before.addedRows?.label).toBe('Adicionar ponto');
    expect(before.addedRows?.canAdd).toBe(true);
    expect(before.rows.map((row) => row.label)).toEqual(['Carcaças', 'Portas', 'Neutro do transformador', 'Para-raios', 'Blindagens']);

    const block = blockIn(withPoints(malha, [['Cerca metálica', '0.3']]), malha);
    const after = continuityOf(block, 'v16');
    expect(after.rows.map((row) => row.label)).toEqual(['Carcaças', 'Portas', 'Neutro do transformador', 'Para-raios', 'Blindagens', 'Cerca metálica']);
    const added = after.rows.at(-1)!;
    expect(added.added?.id).toBe(rowId(1));
    expect(added.cells[0]!.verdict).toBe('within');
    expect(conclusionFloor(block, getDefinition('v16', 'cabine_primaria', 'malha_aterramento'))?.pair.result).not.toBe('reprovado');
  });

  it('an added point is not optional: with no reading it counts as missing on the Ensaios step, the five rows still do not', () => {
    const malha = gridOf('v16');
    const snapshotOf = (state: EntityState) => buildSnapshot(state, malha.relatorioId);
    const base = sheetProgress(snapshotOf(malha.state), malha.block.id).steps.ensaios.missing;
    const named = applyOp(malha.state, putOf(malha, sheetTestRowPath(malha.block.id, TEST, rowId(1), 'name'), 'Cerca metálica'));
    expect(sheetProgress(snapshotOf(named), malha.block.id).steps.ensaios.missing).toBe(base + 1);
  });

  it('a point at 0,8 Ω: the floor is Reprovado, the paragraph names the point and the print lists it after the five', () => {
    const malha = gridOf('v16');
    const definition = getDefinition('v16', 'cabine_primaria', 'malha_aterramento');
    const state = withPoints(malha, [
      ['Cerca metálica', '0.3'],
      ['Estrutura do portão', '0.8'],
    ]);
    const block = blockIn(state, malha);
    expect(continuityOf(block, 'v16').rows.at(-1)!.cells[0]!.verdict).toBe('out');
    expect(conclusionFloor(block, definition)?.pair.result).toBe('reprovado');
    const paragraph = composeConclusion(block, definition, malha.tag).text;
    expect(paragraph).toContain('Estrutura do portão');
    expect(paragraph).not.toContain('Cerca metálica');

    const sheet = section9Layout(buildSnapshot(state, malha.relatorioId), 9, 'RESULTADOS')!
      .subsections.flatMap((sub) => sub.sheets)
      .find((one) => one.blockId === malha.block.id)!;
    const table = sheet.parts.flatMap((part) => (part.kind === 'table' ? [part.table] : [])).find((one) => one.rows[0]!.cells[0]!.text.includes('CONTINUIDADE'))!;
    const rows = grid(table);
    expect(rows.map((row) => row[0]).slice(-7)).toEqual(['CARCAÇAS', 'PORTAS', 'NEUTRO DO TRANSFORMADOR', 'PARA-RAIOS', 'BLINDAGENS', 'CERCA METÁLICA', 'ESTRUTURA DO PORTÃO']);
    // Seed v16 keeps v15's `criterion_result_per_row`: the added points print the five's criterion and their result.
    expect(rows.find((row) => row[0] === 'CERCA METÁLICA')!.slice(-2)).toEqual(['≤ 0,5 Ω entre pontos', 'SATISFATÓRIO']);
    expect(rows.find((row) => row[0] === 'ESTRUTURA DO PORTÃO')!.slice(-2)).toEqual(['≤ 0,5 Ω entre pontos', 'INSATISFATÓRIO']);
  });

  it('the v15 Malha offers no action, and its fold refuses an added point', () => {
    const malha = gridOf('v15');
    const test = continuityOf(malha.block, 'v15');
    expect(test.addedRows).toBeUndefined();
    expect(test.rows).toHaveLength(5);
    expect(() => applyOp(malha.state, putOf(malha, sheetTestRowPath(malha.block.id, TEST, rowId(1), 'name'), 'Cerca metálica'))).toThrow(SeedPathError);
  });
});
