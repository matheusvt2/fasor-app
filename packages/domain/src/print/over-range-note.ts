import { OVER_RANGE_TEXT_PREFIX, overRangeText } from '../relatorio/over-range.ts';
import type { TestEvaluation } from '../relatorio/reading-cells.ts';
import { seedRule } from '../seed/definitions.ts';

/*
 * Story 28.7 (seed v18 `over_range_note`, B-6): a reading above the instrument's limit prints with its note. Under a seeded
 * insulation test (`isolacao`) that holds one or more readings above the limit (`over_range`, whatever their verdict), one
 * line per limit in Bruno's words, the limits in the order they first appear (coordinator's reading, open to Matheus):
 * "Valores de resistência de isolação superiores a 2 TΩ, limite de leitura do instrumento na tensão de ensaio aplicada."
 * The limit is written as the cell prints it, its number and unit joined by a no-break space, so the line never parts
 * them. On v18 the line takes the place of Story 23.4's note on the same test (`limitNote`, the v13 sentence naming the
 * first limit judged within): the frame `key-print-section-9-v18.html` draws Bruno's line alone. The contact resistance
 * and every other test keep "> valor" with no note. v1 to v17 print as before.
 */

/** Bruno's sentence (B-6), verbatim, around the limit. */
const OVER_RANGE_NOTE_BEFORE = 'Valores de resistência de isolação superiores a ';
const OVER_RANGE_NOTE_AFTER = ', limite de leitura do instrumento na tensão de ensaio aplicada.';

/** The test whose readings above the limit take the note: the seeded insulation test only (Bruno named the insulation). */
const NOTED_TEST = 'isolacao';

/** The limit of an over-range reading as the cell prints it, its number and unit kept together: "2 TΩ". */
function limitText(raw: string, unit: string | null): string {
  return overRangeText(raw, unit).slice(OVER_RANGE_TEXT_PREFIX.length).replace(/ /gu, ' ');
}

/** Bruno's line for one limit. */
export function overRangeNoteText(raw: string, unit: string | null): string {
  return `${OVER_RANGE_NOTE_BEFORE}${limitText(raw, unit)}${OVER_RANGE_NOTE_AFTER}`;
}

/** Whether section 9 prints Bruno's line under the insulation test of a sheet of `seedVersion` (`over_range_note`, v18). */
export function overRangeNoteOn(seedVersion: string): boolean {
  return seedRule(seedVersion, 'over_range_note');
}

/**
 * The lines under a seeded test of a sheet of `seedVersion`: one per distinct limit of its captures above the limit, in the
 * order they first appear (table, row, column); none on another test, with no such reading, or on a seed without the flag.
 */
export function overRangeNoteLines(seedVersion: string, evaluation: Pick<TestEvaluation, 'testKey' | 'tables'>): string[] {
  if (!overRangeNoteOn(seedVersion) || evaluation.testKey !== NOTED_TEST) return [];
  const lines: string[] = [];
  for (const table of evaluation.tables) {
    for (const row of table.rows) {
      for (const cell of row.cells) {
        if (cell.role !== 'capture' || cell.state !== 'over_range') continue;
        const line = overRangeNoteText(cell.raw, cell.unit);
        if (!lines.includes(line)) lines.push(line);
      }
    }
  }
  return lines;
}
