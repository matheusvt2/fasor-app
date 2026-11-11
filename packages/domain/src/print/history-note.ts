import { measurementWhere, type MeasurementTestEvaluation } from '../relatorio/measurement-evaluation.ts';
import { whereOf } from '../relatorio/reading-run.ts';
import { readingRowLabel, type TestEvaluation } from '../relatorio/readings.ts';
import { seedRule } from '../seed/definitions.ts';

/*
 * Batch e24p (Story 24.16, Matheus's decision 7 of 2026-11-10): the drops and rises against the
 * previous visit, as one note line under the printed table. "Relevant" is what the three v13
 * previous-visit rules already flag, no new threshold: the transformer's insulation drop (a cell
 * restricted with `restriction.history`), the breaker's and the switch's contact rise (a cell out
 * with `rise`) and the winding-resistance variation (a measurement cell restricted with
 * `restriction.history`). The line names each flagged cell where the conclusion names it (a risen
 * pole as its worst reading, `whereOf`; a restricted cell as its restricted items, `readingRowLabel`;
 * a measurement cell by `measurementWhere`), with the
 * kernel's reason as it stands (Design Notes D2: the drop and the variation with both corrected
 * values, the rise with its share and the previous value), in table, row and column order. The table
 * itself does not change. Printed only on a seed that turns `history_note` on (v14).
 */

/** One flagged cell of a table: where it is, and why the rule flagged it. */
export interface HistoryNoteItem {
  where: string;
  reason: string;
}

// authored (e24p, listed for Bruno): the note line's opening, Story 24.16's form.
const HISTORY_NOTE_OPENING = 'Em relação à manutenção anterior';

/**
 * The note line: "Em relação à manutenção anterior: ⟨onde⟩, ⟨motivo⟩; ⟨onde⟩, ⟨motivo⟩."; null with
 * no item.
 */
export function historyNoteText(items: readonly HistoryNoteItem[]): string | null {
  if (items.length === 0) return null;
  // authored (e24p, listed for Bruno): each flagged cell as "⟨onde⟩, ⟨motivo⟩", joined by "; ".
  return `${HISTORY_NOTE_OPENING}: ${items.map((item) => `${item.where}, ${item.reason}`).join('; ')}.`;
}

/** The cells of a seeded test a previous-visit rule flagged, in table, row and column order. */
export function testHistoryItems(evaluation: Pick<TestEvaluation, 'tables'>): HistoryNoteItem[] {
  const out: HistoryNoteItem[] = [];
  for (const table of evaluation.tables) {
    for (const row of table.rows) {
      for (const cell of row.cells) {
        // A risen pole is out, named as the conclusion names its worst reading; a dropped cell is restricted, named as its restricted items.
        if (cell.rise !== undefined) out.push({ where: whereOf(table, row, cell), reason: cell.rise.reason });
        else if (cell.restriction?.history !== undefined) out.push({ where: readingRowLabel(table.rows, row), reason: cell.restriction.history });
        // Review fix: a cell out by its criterion that the drop rule also flags, named as a restricted one is.
        else if (cell.historyOut !== undefined) out.push({ where: readingRowLabel(table.rows, row), reason: cell.historyOut });
      }
    }
  }
  return out;
}

/** The cells of a measurement test the history rule flagged, in row and column order. */
export function measurementHistoryItems(test: Pick<MeasurementTestEvaluation, 'columns' | 'rows'>): HistoryNoteItem[] {
  const out: HistoryNoteItem[] = [];
  for (const row of test.rows) {
    for (const cell of row.cells) {
      // Review fix: a cell out by its criterion that the variation rule also flags (`historyOut`) counts too.
      const reason = cell.fixed === null ? (cell.restriction?.history ?? cell.historyOut ?? null) : null;
      if (reason !== null) out.push({ where: measurementWhere(test, row, cell), reason });
    }
  }
  return out;
}

/** The note line of a seeded test on a sheet of seed `seedVersion`: null on v1 to v13 or with nothing flagged. */
export function testHistoryNote(seedVersion: string, evaluation: Pick<TestEvaluation, 'tables'>): string | null {
  return seedRule(seedVersion, 'history_note') ? historyNoteText(testHistoryItems(evaluation)) : null;
}

/** The note line of a measurement test on a sheet of seed `seedVersion`: null on v1 to v13 or with nothing flagged. */
export function measurementHistoryNote(seedVersion: string, test: Pick<MeasurementTestEvaluation, 'columns' | 'rows'>): string | null {
  return seedRule(seedVersion, 'history_note') ? historyNoteText(measurementHistoryItems(test)) : null;
}
