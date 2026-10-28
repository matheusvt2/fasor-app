/*
 * Stories 5.5-5.6 (FR-27, FR-28, UX-DR39/40): THE evaluation of a sheet's readings, as a
 * barrel (E9-A7). The code lives in three concern modules:
 *   - `reading-cells.ts`: the types, label and unit helpers, stored cells, ratio inputs;
 *   - `reading-evaluation.ts`: the evaluation and its lookups;
 *   - `reading-run.ts`: the continuous Enter run and the worst readings.
 * Only the public names are re-exported; the helpers the modules share stay internal.
 */

export {
  condicaoScreenText,
  headerText,
  measurementCellName,
  nextUnit,
  ratioFormulaHelperText,
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
export { bandCriterion, cellAddressesOf, pickedBand, CRITERION_NOT_EVALUATED, effectiveCriterion, evaluatedCells, evaluateSheetReadings, evaluateTest, failedRatioRows, type FailedRatioRow, unitDefaultFor } from './reading-evaluation.ts';
export { firstRunCell, runEnterKeyHint, runTarget, unitTapNeedsEdit, worstReadings, type WorstReading } from './reading-run.ts';
