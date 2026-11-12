import type { BlockRow } from '../schemas/entities.ts';
import { seedRule } from '../seed/definitions.ts';
import type { CellAddress, EvaluatedRow } from './reading-cells.ts';

/*
 * Story 25.9 (M05, seed v15 `reading_not_applicable`): a reading cell the technician marks "Não se
 * aplica", alone from the cell's menu or with every reading of its row from the row's action. The
 * cell is filled, never judged, left out of every comparison between phases or poles and of the
 * previous visit's rules, not a "Não medido" for Story 25.6, and printed "N/A"; a derived cell of a
 * row whose every reading is N/A prints "N/A" too (`EvaluatedRow.notApplicable`).
 *
 * No contract bump: the stored value is the AD-11 number value's `not_applicable` state, which the
 * value schema has carried since contract 26 (Story 16.4) and a test cell has always taken (K-10,
 * `value-limits.ts` `test_cell`). The fold stores it on any seed exactly as before; only the readers
 * (`readStored`) give it its meaning, and only on a sheet whose own seed turns the flag on. A v1 to
 * v14 sheet reads such a value `invalid`, as it always did, and its menu never offers it. Seed v15
 * exists only from contract 50, so every client that can hold a v15 sheet reads the state.
 */

/** Story 25.9: whether the block's own seed turns "Não se aplica" on for its reading cells (v15 and later). */
export function readingNotApplicableOn(block: Pick<BlockRow, 'seed_version'>): boolean {
  return typeof block.seed_version === 'string' && seedRule(block.seed_version, 'reading_not_applicable');
}

/** The value a reading cell's put stores for "Não se aplica": the unit the cell shows kept, as "Não medido" keeps it. */
export function notApplicableReadingValue(unit: string | null): { raw: ''; unit: string | null; state: 'not_applicable' } {
  return { raw: '', unit, state: 'not_applicable' };
}

/** One cell the row's action writes: its address and the unit it shows. */
export interface RowNotApplicableTarget {
  address: CellAddress;
  unit: string | null;
}

/**
 * Story 25.9: the cells "Linha toda: não se aplica" writes on a row: every typed cell (an input, a
 * capture, an index) not already N/A, in column order. A tap row (Story 23.8) takes none: its inputs
 * are the plate's and its readings are cleared by its own action.
 */
export function rowNotApplicableTargets(row: Pick<EvaluatedRow, 'cells' | 'tap'>): RowNotApplicableTarget[] {
  if (row.tap !== null) return [];
  return row.cells.filter((cell) => cell.state !== 'not_applicable').map((cell) => ({ address: cell.address, unit: cell.unit }));
}

/**
 * Story 25.9: whether a row offers "Linha toda: não se aplica": on a sheet whose seed turns the flag on,
 * a row of two typed cells or more (a row of one is its cell's own menu) that still holds one not N/A.
 */
export function rowNotApplicableOffered(block: Pick<BlockRow, 'seed_version'>, row: Pick<EvaluatedRow, 'cells' | 'tap'>): boolean {
  return readingNotApplicableOn(block) && row.tap === null && row.cells.length >= 2 && rowNotApplicableTargets(row).length > 0;
}
