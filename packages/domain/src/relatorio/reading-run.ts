import { canonicalDecimal, formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import { scaleToUnit } from '../seed/criteria.ts';
import type { CellAddress, EvaluatedCell, EvaluatedRow, EvaluatedTable, ReadingVerdict, TestEvaluation, TestKey } from './reading-cells.ts';
import { deviationPct, sameAddress } from './reading-evaluation.ts';

/*
 * E9-A7: what walks an evaluation -- the continuous Enter run (Story 5.6) and the worst
 * reading of each test the conclusion reads. `readings.ts` re-exports it.
 */

// --- the continuous run (Story 5.6) -------------------------------------------------------

/** One column of one table: the run's unit of "down". */
function runBlocks(evaluations: readonly TestEvaluation[]): EvaluatedCell[][] {
  const blocks: EvaluatedCell[][] = [];
  for (const test of evaluations) {
    for (const table of test.tables) {
      for (const column of table.columns) {
        if (column.role === 'derived') continue;
        blocks.push(table.rows.map((row) => row.cells.find((cell) => cell.address.col === column.col)!));
      }
    }
  }
  return blocks;
}

/** A cell the run stops at: nothing typed and nothing from the nameplate. */
function runEmpty(cell: EvaluatedCell): boolean {
  return cell.state === 'empty' && cell.source === null;
}

/**
 * The sheet's one continuous Enter run (EXPERIENCE.md › Measurement table, Keyboard):
 * `next` moves down the column and, after its last row, to the first empty cell of what
 * follows (the table's next column, then the next tables of the sheet), `'end'` when
 * nothing empty follows (the primary action takes the focus); `previous` goes back one
 * cell (column by column, table by table); `right` is the next typed cell of the same row.
 * Null where there is nowhere to go.
 */
export function runTarget(evaluations: readonly TestEvaluation[], from: CellAddress, direction: 'next' | 'previous' | 'right'): CellAddress | 'end' | null {
  const blocks = runBlocks(evaluations);
  const b = blocks.findIndex((block) => block.some((cell) => sameAddress(cell.address, from)));
  if (b === -1) return null;
  const block = blocks[b]!;
  const at = block.findIndex((cell) => sameAddress(cell.address, from));
  if (direction === 'right') {
    const row = evaluations.flatMap((t) => t.tables.flatMap((table) => table.rows)).find((r) => r.cells.some((cell) => sameAddress(cell.address, from)));
    const next = row?.cells.find((cell) => cell.address.testKey === from.testKey && cell.address.col > from.col);
    return next?.address ?? null;
  }
  if (direction === 'previous') {
    if (at > 0) return block[at - 1]!.address;
    const before = blocks[b - 1];
    return before === undefined ? null : before[before.length - 1]!.address;
  }
  if (at < block.length - 1) return block[at + 1]!.address;
  for (const later of blocks.slice(b + 1)) {
    const empty = later.find(runEmpty);
    if (empty !== undefined) return empty.address;
  }
  return 'end';
}

/**
 * Story 13.4 (INP-2): the mobile keyboard's Enter key label of a run cell: `next` while Enter
 * moves to another cell, `done` on the cell whose Enter hands the focus to the primary action
 * (or goes nowhere).
 */
export function runEnterKeyHint(evaluations: readonly TestEvaluation[], address: CellAddress): 'next' | 'done' {
  const target = runTarget(evaluations, address, 'next');
  return target === null || target === 'end' ? 'done' : 'next';
}

/** The first cell the run would stop at (the first empty one), or null when every cell holds a value. */
export function firstRunCell(evaluations: readonly TestEvaluation[]): CellAddress | null {
  for (const block of runBlocks(evaluations)) {
    const empty = block.find(runEmpty);
    if (empty !== undefined) return empty.address;
  }
  return null;
}

// --- what the conclusion reads -----------------------------------------------------------

/** One test's worst measured reading: the lowest insulation, the highest contact resistance, the largest ratio deviation. */
export interface WorstReading {
  testKey: TestKey;
  criterionText: string;
  sourceName: string;
  /** "330 MΩ", "0,8 %". */
  valueText: string;
  /** Where: the row's connection ("T1–T2") or, on a table with several captures, the column. */
  where: string;
  verdict: ReadingVerdict | null;
}

function whereOf(table: EvaluatedTable, row: EvaluatedRow, cell: EvaluatedCell): string {
  const captures = table.columns.filter((c) => c.role === 'capture').length;
  if (captures > 1) return cell.column;
  if (table.ratio) return row.label;
  return row.connection.filter((text) => text !== '').slice(0, 2).join('–');
}

function formatDeviation(value: number): string {
  return formatDecimalGroupedPtBr(canonicalDecimal(value.toFixed(2)));
}

/** The worst reading of every enabled test that holds at least one measured capture. */
export function worstReadings(evaluations: readonly TestEvaluation[]): WorstReading[] {
  const out: WorstReading[] = [];
  for (const test of evaluations) {
    let worst: { out: boolean; score: number; reading: WorstReading } | null = null;
    for (const table of test.tables) {
      for (const row of table.rows) {
        for (const cell of row.cells) {
          if (cell.role !== 'capture' || cell.state !== 'measured') continue;
          const value = Number(cell.raw);
          let score: number;
          let valueText: string;
          if (test.testKey === 'relacao_transformacao') {
            if (row.calculated === null) continue;
            score = deviationPct(value, Number(row.calculated.raw));
            valueText = `${formatDeviation(score)} %`;
          } else {
            const scaled = scaleToUnit(value, cell.unit, test.criterion.unit);
            if (scaled === null) continue;
            // Insulation: the lowest is the worst; contact resistance: the highest.
            score = test.criterion.operator.startsWith('>') ? -scaled : scaled;
            valueText = cell.unit === null ? cell.displayText : `${cell.displayText} ${cell.unit}`;
          }
          // An out-of-criterion reading always outranks a within one.
          const out = cell.verdict === 'out';
          if (worst === null || (out && !worst.out) || (out === worst.out && score > worst.score)) {
            worst = {
              out,
              score,
              reading: { testKey: test.testKey, criterionText: test.criterionText, sourceName: test.sourceName, valueText, where: whereOf(table, row, cell), verdict: cell.verdict },
            };
          }
        }
      }
    }
    if (worst !== null) out.push(worst.reading);
  }
  return out;
}
