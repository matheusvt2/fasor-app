import { firstMeasurementRunCell, measurementRunStart, measurementRunTarget, type MeasurementAddress, type MeasurementTestEvaluation } from './measurement-evaluation.ts';
import type { CellAddress, TestEvaluation } from './reading-cells.ts';
import { lastRunCell, runTarget } from './reading-run.ts';

/*
 * Batch e23t gate fix (seed v13, Stories 23.15 and 23.19): the sheet's ONE continuous Enter run
 * (EXPERIENCE.md › Measurement table, Keyboard: "after the last row of a table, to the first
 * empty cell of the next table on the same sheet") over both kinds of test a sheet draws, the
 * seeded tables first, then the measurement tests (Story 14.5). Until seed v13 a sheet had one
 * kind or the other; a v13 seccionadora draws its HH fuses (and a v13 transformer its winding
 * resistance) after the seeded tables, so the seeded run's end hands Enter to the first empty
 * measurement cell instead of the primary, and Shift+Enter on the first measurement stop goes
 * back to the seeded run's last cell. The two namespaces never share a test key (the seed checks
 * it), so an address belongs to exactly one run.
 */

export type SheetRunAddress = CellAddress | MeasurementAddress;

export interface SheetRun {
  readings: readonly TestEvaluation[];
  measurements: readonly MeasurementTestEvaluation[];
}

function sameRunAddress(a: SheetRunAddress, b: SheetRunAddress): boolean {
  return a.testKey === b.testKey && a.row === b.row && a.col === b.col;
}

/**
 * Where Enter (`next`), Shift+Enter (`previous`) or Tab (`right`) moves from `from`: `runTarget`
 * over the seeded tables and `measurementRunTarget` over the measurement tests, joined. `'end'`
 * when nothing empty follows in either (the primary takes the focus); null where there is
 * nowhere to go or `from` is no stop.
 */
export function sheetRunTarget(run: SheetRun, from: SheetRunAddress, direction: 'next' | 'previous' | 'right'): SheetRunAddress | 'end' | null {
  const seeded = runTarget(run.readings, from as CellAddress, direction);
  if (seeded === 'end') return firstMeasurementRunCell(run.measurements) ?? 'end';
  if (seeded !== null) return seeded;
  const measured = measurementRunTarget(run.measurements, from as MeasurementAddress, direction);
  if (measured === null && direction === 'previous') {
    const start = measurementRunStart(run.measurements);
    if (start !== null && sameRunAddress(start, from)) return lastRunCell(run.readings);
  }
  return measured;
}

/** Story 13.4 (INP-2) over the joined run: `next` while Enter moves to another cell, `done` where it hands the focus to the primary (or goes nowhere). */
export function sheetRunEnterKeyHint(run: SheetRun, address: SheetRunAddress): 'next' | 'done' {
  const target = sheetRunTarget(run, address, 'next');
  return target === null || target === 'end' ? 'done' : 'next';
}
