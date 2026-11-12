import { nominalBounds, scaleToUnit, type CriterionSeed } from '../seed/criteria.ts';
import type { BlockRow } from '../schemas/entities.ts';
import type { CellAddress, EvaluatedCell, EvaluatedRow, EvaluatedTable, ReadingVerdict, TestEvaluation, TestKey } from './reading-cells.ts';
import { deviationPct, formatDeviation, sameAddress } from './reading-evaluation.ts';
import { isReadingValue } from './over-range.ts';
import { sheetState } from './sheet-state.ts';
import { tapCellTyped, tapRowRequired } from './tap-rows.ts';

/*
 * E9-A7: what walks an evaluation -- the continuous Enter run (Story 5.6) and the worst
 * reading of each test the conclusion reads. `readings.ts` re-exports it.
 */

// --- the continuous run (Story 5.6) -------------------------------------------------------

/** A cell of the run, with whether a jump may stop at it while empty (Story 23.8: an unmarked tap row's is optional). */
interface RunCell {
  cell: EvaluatedCell;
  required: boolean;
}

/**
 * One column of one table: the run's unit of "down". Story 23.8 (seed v13): only the cells the
 * sheet types (`tapCellTyped`: a tap row's captures; its V PRIMÁRIO and V SECUNDÁRIO come from the
 * plate and a row off the plate is never written), every row of a v12 table as before.
 */
function runBlocks(evaluations: readonly TestEvaluation[]): RunCell[][] {
  const blocks: RunCell[][] = [];
  for (const test of evaluations) {
    for (const table of test.tables) {
      for (const column of table.columns) {
        if (column.role === 'derived') continue;
        const cells = table.rows.flatMap((row) => {
          const cell = row.cells.find((candidate) => candidate.address.col === column.col)!;
          // Seed v13, batch e23t (Story 23.16): an N/A IP is no stop; an index cell is a required stop only where it is missing when empty.
          if (cell.index?.notApplicable === true) return [];
          return tapCellTyped(row, cell) ? [{ cell, required: tapRowRequired(row) && (cell.role !== 'index' || cell.index?.required === true) }] : [];
        });
        if (cells.length > 0) blocks.push(cells);
      }
    }
  }
  return blocks;
}

/**
 * A cell the run stops at: nothing typed and nothing from the nameplate. Story 23.8: a jump
 * never stops at an unmarked tap row, which requires nothing; Enter down a column still walks
 * every row, marked or not (EXPERIENCE.md › Tap rows).
 */
function runEmpty(entry: RunCell): boolean {
  return entry.required && entry.cell.state === 'empty' && entry.cell.source === null;
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
  const b = blocks.findIndex((block) => block.some((entry) => sameAddress(entry.cell.address, from)));
  if (b === -1) return null;
  const block = blocks[b]!;
  const at = block.findIndex((entry) => sameAddress(entry.cell.address, from));
  if (direction === 'right') {
    const row = evaluations.flatMap((t) => t.tables.flatMap((table) => table.rows)).find((r) => r.cells.some((cell) => sameAddress(cell.address, from)));
    const next = row?.cells.find((cell) => cell.address.testKey === from.testKey && cell.address.col > from.col && tapCellTyped(row, cell));
    return next?.address ?? null;
  }
  if (direction === 'previous') {
    if (at > 0) return block[at - 1]!.cell.address;
    const before = blocks[b - 1];
    return before === undefined ? null : before[before.length - 1]!.cell.address;
  }
  if (at < block.length - 1) return block[at + 1]!.cell.address;
  for (const later of blocks.slice(b + 1)) {
    const empty = later.find(runEmpty);
    if (empty !== undefined) return empty.cell.address;
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

/**
 * Review fixes 2026-10-08 (DB-2): whether a pointer tap on a cell's unit control must first put
 * the cell into editing instead of rewriting its value in the next unit. True on a concluded
 * sheet (`sheetState === 'concluida'`) for a cell holding a measured value: there a stray tap
 * beside the input would flip a stored 1,45 GΩ to 1,45 TΩ and the verdict with it. The sheet
 * stays editable until emission, so the tap only focuses the input; a second tap, made while
 * the input holds the focus, cycles as on an open sheet.
 */
export function unitTapNeedsEdit(block: BlockRow, cell: Pick<EvaluatedCell, 'state'>): boolean {
  return isReadingValue(cell.state) && sheetState(block) === 'concluida';
}

/** The first cell the run would stop at (the first empty one), or null when every cell holds a value. */
export function firstRunCell(evaluations: readonly TestEvaluation[]): CellAddress | null {
  for (const block of runBlocks(evaluations)) {
    const empty = block.find(runEmpty);
    if (empty !== undefined) return empty.cell.address;
  }
  return null;
}

/** The run's last stop, empty or not (Shift+Enter from the measurement tests that follow lands here), or null when the run has none. */
export function lastRunCell(evaluations: readonly TestEvaluation[]): CellAddress | null {
  const last = runBlocks(evaluations).at(-1);
  return last === undefined ? null : last[last.length - 1]!.cell.address;
}

// --- what the conclusion reads -----------------------------------------------------------

/** Batch e23v (Story 23.6): the levels' order, out > restricted > within (an unjudged reading ranks as within). */
const VERDICT_RANK: Readonly<Record<ReadingVerdict, number>> = { within: 0, restricted: 1, out: 2 };

// authored (Story 23.5, listed for Bruno): a value judged at 20 °C, as the conclusion and the points name it ("8 GΩ a 20 °C").
const CORRECTED_SUFFIX = ' a 20 °C';

/**
 * One test's worst measured reading: the lowest insulation, the highest contact resistance, the largest ratio deviation.
 * Batch e23v (Stories 23.5 and 23.6, seed v13): a corrected reading ranks and reads by its value at 20 °C ("8 GΩ a 20 °C"),
 * and a restricted one outranks a within one (out > restricted > within).
 */
export interface WorstReading {
  testKey: TestKey;
  criterionText: string;
  sourceName: string;
  /** "330 MΩ", "0,8 %". */
  valueText: string;
  /** Where: the row's connection ("T1–T2") or, on a table with several captures, the column. */
  where: string;
  verdict: ReadingVerdict | null;
  /** e22g (review N2): set when the worst reading is a limit the instrument passed ("> 2 TΩ"). */
  overRange?: true;
  /**
   * Fix batch e23w (B-6): set when the worst reading is out by its rise since the previous visit
   * (`EvaluatedCell.rise`): its reason, which the conclusion and the points name instead of the
   * criterion it meets.
   */
  rise?: string;
}

/** Where a reading is, as the conclusion names its worst one (batch e24p, Story 24.16: and the history note a risen pole). */
export function whereOf(table: EvaluatedTable, row: EvaluatedRow, cell: EvaluatedCell): string {
  const captures = table.columns.filter((c) => c.role === 'capture').length;
  if (captures > 1) return cell.column;
  if (table.ratio) return row.label;
  return row.connection.filter((text) => text !== '').slice(0, 2).join('–');
}

/** Fix batch e24x (C2): the two ends of a range criterion (a company `between`, a "nominal ± %" row); null for any other. */
function rangeOf(criterion: Pick<CriterionSeed, 'operator' | 'value' | 'value_max'> & { tolerance_pct?: number | undefined }): { min: number; max: number } | null {
  if (criterion.operator === 'between') return criterion.value_max === undefined ? null : { min: criterion.value, max: criterion.value_max };
  if (criterion.operator === 'nominal_pct') return criterion.tolerance_pct === undefined ? null : nominalBounds(criterion.value, criterion.tolerance_pct);
  return null;
}

/**
 * Fix batch e24x (C2): how bad a reading is against a range: outside, its distance from the nearer
 * end, relative to that end (20 against 80 to 120 is 0,75; 125 is about 0,04), above zero; inside,
 * at most zero, the nearer an end the higher, so any reading outside ranks above any inside.
 */
function rangeScore(scaled: number, range: { min: number; max: number }): number {
  const relative = (distance: number, end: number) => (end === 0 ? distance : distance / Math.abs(end));
  if (scaled < range.min) return relative(range.min - scaled, range.min);
  if (scaled > range.max) return relative(scaled - range.max, range.max);
  return -Math.min(relative(scaled - range.min, range.min), relative(range.max - scaled, range.max));
}

/**
 * One measured capture of a test as the conclusion and the points name it, with how bad it is: its verdict's
 * rank and its score within that rank (the worse, the higher); null for a capture no reading of the test names
 * (empty or not a reading, a ratio row with no VAL CALCULADO, a row its own criterion leaves unjudged). Story
 * 25.10 drew it out of `worstReadings`, which ranks with it as before, so `outReadings` names each reading the
 * same way.
 */
function rankedReading(test: TestEvaluation, table: EvaluatedTable, row: EvaluatedRow, cell: EvaluatedCell): { rank: number; score: number; reading: WorstReading } | null {
  const criterion = test.criterion;
  if (cell.role !== 'capture' || !isReadingValue(cell.state)) return null;
  // Batch e23v (Story 23.5): a corrected reading is judged, so ranked and named, at 20 °C.
  const corrected = cell.corrected ?? null;
  const value = corrected === null ? Number(cell.raw) : Number(corrected.raw);
  const shown = corrected === null ? (cell.unit === null ? cell.displayText : `${cell.displayText} ${cell.unit}`) : `${corrected.text}${CORRECTED_SUFFIX}`;
  let score: number;
  let valueText: string;
  if (test.testKey === 'relacao_transformacao') {
    if (row.calculated === null) return null;
    score = deviationPct(value, Number(row.calculated.raw));
    valueText = `${formatDeviation(score)} %`;
  } else if (row.criterion !== undefined) {
    // Batch e23a (Stories 23.2, 23.3): a row judged by its own criterion ranks by its reading over
    // that criterion, so the worst is the one furthest below its minimum (or above its maximum).
    const own = row.criterion;
    if (own === null) return null;
    const range = rangeOf(own);
    if (range === null && !(own.value > 0)) return null;
    const scaled = scaleToUnit(value, cell.unit, own.unit);
    if (scaled === null) return null;
    score = range !== null ? rangeScore(scaled, range) : own.operator.startsWith('>') ? -(scaled / own.value) : scaled / own.value;
    valueText = shown;
  } else {
    const scaled = scaleToUnit(value, cell.unit, criterion!.unit);
    if (scaled === null) return null;
    const range = rangeOf(criterion!);
    // Insulation: the lowest is the worst; contact resistance: the highest; fix batch e24x (C2): a range, the furthest outside.
    score = range !== null ? rangeScore(scaled, range) : criterion!.operator.startsWith('>') ? -scaled : scaled;
    valueText = shown;
  }
  // An out-of-criterion reading always outranks a within one; batch e23v: a restricted one sits between them.
  const rank = VERDICT_RANK[cell.verdict ?? 'within'];
  return {
    rank,
    score,
    reading: {
      testKey: test.testKey,
      // Batch e23a: named by the row's own criterion where the row carries one.
      criterionText: row.criterionText ?? test.criterionText,
      sourceName: row.criterion?.source.name ?? test.sourceName,
      valueText,
      where: whereOf(table, row, cell),
      verdict: cell.verdict,
      ...(cell.state === 'over_range' ? { overRange: true as const } : {}),
      ...(cell.rise === undefined ? {} : { rise: cell.rise.reason }),
    },
  };
}

/** Story 14.9: a test no criterion judges (a band test with no band for the plate) names no reading. */
function namesReadings(test: TestEvaluation): boolean {
  return test.criterion !== null || test.testKey === 'relacao_transformacao';
}

/** The worst reading of every enabled test that holds at least one measured capture. */
export function worstReadings(evaluations: readonly TestEvaluation[]): WorstReading[] {
  const out: WorstReading[] = [];
  for (const test of evaluations) {
    if (!namesReadings(test)) continue;
    let worst: { rank: number; score: number; reading: WorstReading } | null = null;
    for (const table of test.tables) {
      for (const row of table.rows) {
        for (const cell of row.cells) {
          const ranked = rankedReading(test, table, row, cell);
          if (ranked === null) continue;
          if (worst === null || ranked.rank > worst.rank || (ranked.rank === worst.rank && ranked.score > worst.score)) worst = ranked;
        }
      }
    }
    if (worst !== null) out.push(worst.reading);
  }
  return out;
}

/**
 * Story 25.10 (seed v15, M14 and M-6): every reading out of its criterion (out by its rise, on a pole the rule
 * flags), test by test in order, each test's in row order (its tables, rows and captures as the sheet draws
 * them), named as `worstReadings` names a test's worst one.
 */
export function outReadings(evaluations: readonly TestEvaluation[]): WorstReading[] {
  const out: WorstReading[] = [];
  for (const test of evaluations) {
    if (!namesReadings(test)) continue;
    for (const table of test.tables) {
      for (const row of table.rows) {
        for (const cell of row.cells) {
          const ranked = rankedReading(test, table, row, cell);
          if (ranked !== null && ranked.reading.verdict === 'out') out.push(ranked.reading);
        }
      }
    }
  }
  return out;
}

/**
 * Story 25.10 (seed v15, M-6): the readings the conclusion names, in its order. With `every`, a test with a
 * reading out of its criterion names each of them in row order (`outReadings`), any other its worst one; without,
 * `worstReadings` as before (v1 to v14).
 */
export function namedReadings(evaluations: readonly TestEvaluation[], every: boolean): WorstReading[] {
  const worst = worstReadings(evaluations);
  if (!every) return worst;
  const outs = outReadings(evaluations);
  return worst.flatMap((reading) => (reading.verdict === 'out' ? outs.filter((one) => one.testKey === reading.testKey) : [reading]));
}
