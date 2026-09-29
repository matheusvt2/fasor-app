/*
 * Stories 5.5-5.6 (FR-27, FR-28, UX-DR39/40): THE evaluation of a sheet's readings, as a
 * barrel (E9-A7). The code lives in three concern modules:
 *   - `reading-cells.ts`: the types, label and unit helpers, stored cells, ratio inputs;
 *   - `reading-evaluation.ts`: the evaluation and its lookups;
 *   - `reading-run.ts`: the continuous Enter run and the worst readings.
 * Only the public names are re-exported; the helpers the modules share stay internal.
 */

export {
  headerText,
  nextUnit,
  readingLabelText,
  type CellAddress,
  type EvaluatedCell,
  type EvaluatedRow,
  type EvaluatedTable,
  type ReadingSource,
  type ReadingState,
  type ReadingVerdict,
  type TestEvaluation,
  type TestKey,
  type VisibleColumn,
} from './reading-cells.ts';
export { cellAddressesOf, cellAt, effectiveCriterion, evaluatedCells, evaluateSheetReadings, evaluateTest, unitDefaultFor } from './reading-evaluation.ts';
export { firstRunCell, runTarget, worstReadings, type WorstReading } from './reading-run.ts';
