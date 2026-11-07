import type { BlockRow } from '../schemas/entities.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { evaluateSheetMeasurements, type MeasurementTestEvaluation } from './measurement-evaluation.ts';
import type { TestEvaluation } from './reading-cells.ts';
import { evaluateSheetReadings } from './reading-evaluation.ts';

/*
 * e22f S7 (integrated review of Epic 22 wave A): the reading evaluation of one sheet, memoized
 * per block row and definition. The conclusion floor, the derived points, the parecer's verdict,
 * reason line, counts and summary all read the same evaluation; on the 94-sheet Porto Seguro
 * snapshot Etapa 6 recomputed it several times per sheet per render. A block row is immutable
 * (every op folds into a new row object, `ops/apply.ts`), so the row object is the key, and a
 * changed sheet is evaluated again on its next read while the other sheets keep theirs. The
 * WeakMaps hold nothing alive: a row no snapshot references is dropped with its entry. Callers
 * must not mutate what these return (none does: every reader filters, maps or reads).
 */

const READINGS = new WeakMap<object, WeakMap<object, TestEvaluation[]>>();
const MEASUREMENTS = new WeakMap<object, WeakMap<object, readonly MeasurementTestEvaluation[]>>();

function memo<T>(cache: WeakMap<object, WeakMap<object, T>>, block: object, definition: object, compute: () => T): T {
  let byDefinition = cache.get(block);
  if (byDefinition === undefined) {
    byDefinition = new WeakMap();
    cache.set(block, byDefinition);
  }
  const hit = byDefinition.get(definition);
  if (hit !== undefined) return hit;
  const value = compute();
  byDefinition.set(definition, value);
  return value;
}

/** `evaluateSheetReadings`, once per block row and definition. */
export function sheetReadings(block: BlockRow, definition: BlockDefinition): TestEvaluation[] {
  return memo(READINGS, block, definition, () => evaluateSheetReadings(block, definition));
}

/** `evaluateSheetMeasurements`, once per block row and definition. */
export function sheetMeasurements(block: BlockRow, definition: BlockDefinition): readonly MeasurementTestEvaluation[] {
  return memo(MEASUREMENTS, block, definition, () => evaluateSheetMeasurements(block, definition));
}
