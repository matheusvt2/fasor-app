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
  ratioGroupOf,
  readingLabelText,
  readingRowLabel,
  type RatioGroupResolution,
  type CellAddress,
  type EvaluatedCell,
  type EvaluatedRow,
  type EvaluatedTable,
  type ReadingSource,
  type ManufacturerValue,
  type ReadingState,
  type ReadingVerdict,
  type TestEvaluation,
  type TestKey,
  type VisibleColumn,
  type VoltageColumn,
} from './reading-cells.ts';
export { bandCriterion, cellAddressesOf, pickedBand, CRITERION_NOT_EVALUATED, effectiveCriterion, evaluatedCells, evaluateSheetReadings, evaluateTest, failedRatioRows, type FailedRatioRow, unitDefaultFor } from './reading-evaluation.ts';
// Batch e23a (Stories 23.2 to 23.4): the row's criterion, the manufacturer's value, the instrument-limit note.
export {
  CRITERION_PER_ROW_TEXT,
  criterionUnitOf,
  instrumentLimitNoteText,
  MANUFACTURER_PRINT_SUFFIX,
  MANUFACTURER_SOURCE_LINE,
  MANUFACTURER_SOURCE_NAME,
  MANUFACTURER_VALUE_REFUSAL,
  manufacturerApplies,
  MANUFACTURER_NOT_APPLICABLE_REFUSAL,
  manufacturerCriterion,
  manufacturerRefusal,
  manufacturerUnitRefusal,
  manufacturerUnitsOf,
  manufacturerValueOf,
  manufacturerValueText,
  manufacturerValueView,
  parseManufacturerValue,
  polarizationNotApplicable,
  rowCriterion,
  type ManufacturerValueView,
  type ParsedManufacturerValue,
  type RowCriterion,
} from './reading-evaluation.ts';
export { firstRunCell, runEnterKeyHint, runTarget, unitTapNeedsEdit, worstReadings, type WorstReading } from './reading-run.ts';
