import { canonicalDecimal, formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import { evaluateSheetMeasurements, measurementWhere, type MeasurementTestEvaluation } from '../relatorio/measurement-evaluation.ts';
import type { EvaluatedCell } from '../relatorio/reading-cells.ts';
import { deviationPct } from '../relatorio/reading-evaluation.ts';
import { whereOf } from '../relatorio/reading-run.ts';
import { evaluateSheetReadings, readingRowLabel, type TestEvaluation } from '../relatorio/readings.ts';
import { INSULATION_REFERENCE_C, WINDING_REFERENCE_C } from '../relatorio/temperature-correction.ts';
import type { VisitContext } from '../relatorio/visit-context.ts';
import type { BlockRow } from '../schemas/entities.ts';
import { scaleToUnit } from '../seed/criteria.ts';
import { seedRule } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { previousReadingsByAddress, readingAddressKey, type LastResultReading } from './reading-slots.ts';

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

// --- Story 28.8 (seed v18 `history_note_relevant`, B-7, Matheus's Q-7): the variation note by Bruno's numbers ------------

/*
 * On a sheet whose seed turns `history_note_relevant` on (v18), the note against the previous visit names a cell only when
 * it moved past Bruno's numbers or changed level, compared cell by cell with the previous visit's reading of the same
 * address (`previousReadingsByAddress`):
 * - the insulation test (`isolacao`): its reading corrected to 20 °C fell more than 50 % from the previous corrected one;
 * - the contact resistance (`resistencia_contato`): it rose more than 25 % over the previous one;
 * - the ratio (`relacao_transformacao`): its error against the row's calculated value moved more than 0,5 percentage point
 *   (the previous error read against the same calculated value, the row's today);
 * - the winding resistance (a measurement test with `winding_correction`): its value corrected to 75 °C varied more than
 *   2 % from the previous corrected one;
 * - any cell whose level (within, restricted, out) differs from the previous reading's, both ways. The previous level is
 *   judged by today's criterion (Q-7): the sheet is evaluated once more with the previous readings in its cells and no
 *   previous visit, so the rules between rows judge them as today's and no history rule runs; a corrected reading enters at
 *   the value today's correction turns into its own corrected value, so it is judged at that value.
 * Never a reading above the limit (`over_range`) on either visit, a cell not measured or "Não se aplica" on either visit, or a
 * row the technician added. The thresholds decide the note only: no verdict moves. A cell both past a number and changed in
 * level is named by its change of level.
 *
 * The short form names where, what moved and from which value, with no revision and no date. Three or more on one equipment
 * become one line after its last table that names the tests and counts the variations; with fewer, each test's note lists its
 * own. Every value keeps its unit (a no-break space). v1 to v17 print Story 24.16's note, unchanged.
 */

/** One relevant variation of a sheet's cell against the previous visit. */
export interface RelevantVariation {
  testKey: string;
  /** The test's title as the one-line form names it ("Ensaio de isolação"). */
  testTitle: string;
  where: string;
  /** The short form after `where`: "subiu 30 % (antes 40 µΩ)". */
  text: string;
}

/** Bruno's numbers (B-7). Each bound is exclusive: a cell exactly at the number is not named. */
export const VARIATION_THRESHOLDS = { insulationDropPct: 50, contactRisePct: 25, ratioErrorPp: 0.5, windingVariationPct: 2 } as const;
/** The many form starts at this count of relevant variations on one equipment. */
export const VARIATIONS_ONE_LINE_FROM = 3;

const NBSP = ' ';
const EPSILON = 1e-9;

type Level = 'within' | 'restricted' | 'out';

// authored (Story 28.1's frame, listed for Bruno): the level words of the short form ("passou a fora do critério (antes 236 µΩ,
// dentro do critério)"); "com restrição" is the batch's, after the frame's two.
const LEVEL_WORDS: Readonly<Record<Level, string>> = { within: 'dentro do critério', restricted: 'com restrição', out: 'fora do critério' };

function levelOf(verdict: string | null | undefined): Level | null {
  return verdict === 'within' || verdict === 'restricted' || verdict === 'out' ? verdict : null;
}

/** A number with one decimal at most: "30", "12,5". */
function oneDecimal(value: number): string {
  return formatDecimalGroupedPtBr(canonicalDecimal((Math.round(value * 10) / 10).toFixed(1)));
}

/** A share as the note prints it, kept with its sign: "30 %". */
function pctText(value: number): string {
  return `${oneDecimal(value)}${NBSP}%`;
}

/** A value with its unit kept together: "40 µΩ". */
function valueText(raw: string, unit: string | null): string {
  const shown = formatDecimalGroupedPtBr(raw);
  return unit === null || unit === '' ? shown : `${shown}${NBSP}${unit}`;
}

/** A corrected value with its reference temperature: "3,6 GΩ a 20 °C". */
function correctedValueText(raw: string, unit: string | null, referenceC: number): string {
  return `${valueText(raw, unit)} a ${referenceC}${NBSP}°C`;
}

// authored (Story 28.1's frame for the rise and the change of level, the batch for the others; listed for Bruno): the short forms.
const shortForms = {
  drop: (pct: string, before: string) => `caiu ${pct} (antes ${before})`,
  rise: (pct: string, before: string) => `subiu ${pct} (antes ${before})`,
  ratio: (pp: string, before: string) => `teve o erro alterado em ${pp}${NBSP}ponto percentual (antes ${before})`,
  variation: (pct: string, before: string) => `variou ${pct} (antes ${before})`,
  level: (now: Level, before: string, was: Level) => `passou a ${LEVEL_WORDS[now]} (antes ${before}, ${LEVEL_WORDS[was]})`,
};

/** "Em relação à manutenção anterior: T1-T2 subiu 30 % (antes 40 µΩ); T5-T6 …."; null with none. */
export function relevantNoteText(items: readonly Pick<RelevantVariation, 'where' | 'text'>[]): string | null {
  if (items.length === 0) return null;
  return `${HISTORY_NOTE_OPENING}: ${items.map((item) => `${item.where} ${item.text}`).join('; ')}.`;
}

/** "Em relação à manutenção anterior: 3 variações relevantes (Ensaio de isolação: 1; Resistência ôhmica de contato: 2)."; null with none. */
export function manyVariationsText(items: readonly Pick<RelevantVariation, 'testKey' | 'testTitle'>[]): string | null {
  if (items.length === 0) return null;
  const byTest = new Map<string, { title: string; count: number }>();
  for (const item of items) {
    const entry = byTest.get(item.testKey);
    if (entry === undefined) byTest.set(item.testKey, { title: item.testTitle, count: 1 });
    else entry.count += 1;
  }
  const tests = [...byTest.values()].map((entry) => `${entry.title}: ${entry.count}`).join('; ');
  // authored (Story 28.1's frame, listed for Bruno): the one-line form.
  return `${HISTORY_NOTE_OPENING}: ${items.length} ${items.length === 1 ? 'variação relevante' : 'variações relevantes'} (${tests}).`;
}

/** What one sheet's tests print of the note on v18: each test's line, or the one line after its last table. */
export interface SheetVariationNotes {
  /** A test's own note line by its key; empty when the one line stands for them. */
  byTest: ReadonlyMap<string, string>;
  /** The one line after the equipment's last table, at three or more variations; null otherwise. */
  line: string | null;
}

/** Whether section 9 prints Story 28.8's note on a sheet of `seedVersion` (`history_note_relevant`, v18). */
export function relevantHistoryNoteOn(seedVersion: string): boolean {
  return seedRule(seedVersion, 'history_note_relevant');
}

type CellValue = { raw: string; unit: string | null; state: 'measured' };

/** A previous reading's value as it enters the second evaluation: at the value today's correction turns into its own corrected one. */
function ghostValue(before: LastResultReading, now: { raw: string; unit: string | null; corrected?: { raw: string; unit: string | null } | null }): CellValue | null {
  if (before.state !== 'measured') return null;
  const nowCorrected = now.corrected ?? null;
  if (nowCorrected === null) return { raw: before.raw, unit: before.unit, state: 'measured' };
  const corrected = before.corrected ?? null;
  // A reading corrected today against one never corrected: not alike, no level to compare.
  if (corrected === null) return null;
  const factor = Number(nowCorrected.raw) / Number(now.raw);
  if (!(factor > 0) || !Number.isFinite(factor)) return null;
  const raw = canonicalDecimal((Number(corrected.raw) / factor).toPrecision(12));
  return Number(raw) > 0 ? { raw, unit: corrected.unit, state: 'measured' } : null;
}

/**
 * The sheet's relevant variations against its previous visit, in the order the sheet prints its tests (the seeded tests,
 * then the measurement tests; table, row and column order inside each); empty with no previous visit.
 */
export function relevantVariations(
  block: BlockRow,
  definition: BlockDefinition,
  visit: VisitContext,
  evaluations: readonly TestEvaluation[],
  measurements: readonly MeasurementTestEvaluation[],
): RelevantVariation[] {
  const entry = visit.previous;
  if (entry === null) return [];
  const before = previousReadingsByAddress(entry, definition, block);
  if (before.size === 0) return [];

  // The second evaluation: the previous readings in the cells of the current ones, judged by today's criteria.
  const ghost = structuredClone(block);
  const put = (address: { testKey: string; row: number; col: number }, value: CellValue | null) => {
    const row = ghost.sheet.test[address.testKey]?.cells[String(address.row)];
    if (row === undefined) return;
    if (value === null) {
      delete row[String(address.col)];
      return;
    }
    const held = row[String(address.col)];
    if (held !== undefined) row[String(address.col)] = { ...held, value };
  };
  for (const evaluation of evaluations) {
    for (const table of evaluation.tables) {
      for (const row of table.rows) {
        for (const cell of row.cells) {
          if (cell.role !== 'capture') continue;
          const was = before.get(readingAddressKey(cell.address));
          put(cell.address, was === undefined ? null : ghostValue(was, cell));
        }
      }
    }
  }
  for (const test of measurements) {
    for (const row of test.rows) {
      if (row.added !== undefined) continue;
      for (const cell of row.cells) {
        if (cell.kind !== 'number' || cell.fixed !== null) continue;
        const was = before.get(readingAddressKey(cell.address));
        put(cell.address, was === undefined ? null : ghostValue(was, cell));
      }
    }
  }
  const quiet: VisitContext = { ...visit, previous: null };
  const ghostLevels = new Map<string, Level | null>();
  for (const evaluation of evaluateSheetReadings(ghost, definition, quiet)) {
    for (const table of evaluation.tables) {
      for (const row of table.rows) for (const cell of row.cells) if (cell.role === 'capture') ghostLevels.set(readingAddressKey(cell.address), levelOf(cell.verdict));
    }
  }
  for (const test of evaluateSheetMeasurements(ghost, definition, quiet)) {
    for (const row of test.rows) for (const cell of row.cells) if (cell.kind === 'number') ghostLevels.set(readingAddressKey(cell.address), levelOf(cell.verdict));
  }

  const out: RelevantVariation[] = [];
  for (const evaluation of evaluations) {
    const ratio = evaluation.testKey === 'relacao_transformacao';
    for (const table of evaluation.tables) {
      for (const row of table.rows) {
        if (row.notApplicable === true) continue;
        const calculated = row.calculated === null ? null : Number(row.calculated.raw);
        for (const cell of row.cells) {
          if (cell.role !== 'capture' || cell.state !== 'measured') continue;
          const key = readingAddressKey(cell.address);
          const was = before.get(key);
          if (was === undefined || was.state !== 'measured') continue;
          // Named as the restricted rows of the note are (`readingRowLabel`, "T1-T2", "Primário/Massa"), with the column where the
          // table captures more than one.
          const captures = table.columns.filter((column) => column.role === 'capture').length;
          const where = captures > 1 ? `${readingRowLabel(table.rows, row)}, ${cell.column}` : readingRowLabel(table.rows, row);
          const nowLevel = levelOf(cell.verdict);
          const wasLevel = ghostLevels.get(key) ?? null;
          // The value the comparison reads: the deviation on the ratio, the corrected one where the test corrects.
          const corrected = cell.corrected ?? null;
          // authored (Story 28.8, listed for Bruno): the ratio's previous value as its deviation, as the points name it.
          const beforeText =
            ratio && calculated !== null && calculated > 0
              ? `desvio de ${pctText(deviationPct(Number(was.raw), calculated))}`
              : corrected !== null && was.corrected !== undefined
                ? correctedValueText(was.corrected.raw, was.corrected.unit, INSULATION_REFERENCE_C)
                : valueText(was.raw, was.unit);
          if (nowLevel !== null && wasLevel !== null && nowLevel !== wasLevel) {
            out.push({ testKey: evaluation.testKey, testTitle: evaluation.title, where, text: shortForms.level(nowLevel, beforeText, wasLevel) });
            continue;
          }
          const moved = seededMove(evaluation.testKey, cell, was, calculated);
          if (moved !== null) out.push({ testKey: evaluation.testKey, testTitle: evaluation.title, where, text: moved(beforeText) });
        }
      }
    }
  }
  for (const test of measurements) {
    const winding = definition.measurement_tests?.find((one) => one.key === test.testKey)?.winding_correction !== undefined;
    for (const row of test.rows) {
      if (row.added !== undefined) continue;
      for (const cell of row.cells) {
        if (cell.kind !== 'number' || cell.fixed !== null || cell.state !== 'measured') continue;
        const key = readingAddressKey(cell.address);
        const was = before.get(key);
        if (was === undefined || was.state !== 'measured') continue;
        const where = measurementWhere(test, row, cell);
        const nowLevel = levelOf(cell.verdict);
        const wasLevel = ghostLevels.get(key) ?? null;
        const corrected = cell.corrected ?? null;
        const beforeText = corrected !== null && was.corrected !== undefined ? correctedValueText(was.corrected.raw, was.corrected.unit, WINDING_REFERENCE_C) : valueText(was.raw, was.unit);
        if (nowLevel !== null && wasLevel !== null && nowLevel !== wasLevel) {
          out.push({ testKey: test.testKey, testTitle: test.label, where, text: shortForms.level(nowLevel, beforeText, wasLevel) });
          continue;
        }
        if (!winding || corrected === null || was.corrected === undefined) continue;
        const then = scaleToUnit(Number(was.corrected.raw), was.corrected.unit, corrected.unit);
        if (then === null || !(then > 0)) continue;
        const varied = (Math.abs(Number(corrected.raw) - then) / then) * 100;
        if (varied > VARIATION_THRESHOLDS.windingVariationPct * (1 + EPSILON)) out.push({ testKey: test.testKey, testTitle: test.label, where, text: shortForms.variation(pctText(varied), beforeText) });
      }
    }
  }
  return out;
}

/** The short form of a seeded cell past Bruno's number for its test, awaiting the previous value's text; null when not past it. */
function seededMove(testKey: string, cell: Pick<EvaluatedCell, 'raw' | 'unit' | 'corrected'>, was: LastResultReading, calculated: number | null): ((before: string) => string) | null {
  if (testKey === 'isolacao') {
    const now = cell.corrected ?? null;
    if (now === null || was.corrected === undefined) return null;
    const then = scaleToUnit(Number(was.corrected.raw), was.corrected.unit, now.unit);
    if (then === null || !(then > 0)) return null;
    const drop = ((then - Number(now.raw)) / then) * 100;
    return drop > VARIATION_THRESHOLDS.insulationDropPct * (1 + EPSILON) ? (before) => shortForms.drop(pctText(drop), before) : null;
  }
  if (testKey === 'resistencia_contato') {
    const then = Number(was.raw);
    const now = scaleToUnit(Number(cell.raw), cell.unit, was.unit);
    if (now === null || !(then > 0)) return null;
    const rise = ((now - then) / then) * 100;
    return rise > VARIATION_THRESHOLDS.contactRisePct * (1 + EPSILON) ? (before) => shortForms.rise(pctText(rise), before) : null;
  }
  if (testKey === 'relacao_transformacao') {
    if (calculated === null || !(calculated > 0)) return null;
    const moved = Math.abs(deviationPct(Number(cell.raw), calculated) - deviationPct(Number(was.raw), calculated));
    return moved > VARIATION_THRESHOLDS.ratioErrorPp * (1 + EPSILON) ? (before) => shortForms.ratio(oneDecimal(moved), before) : null;
  }
  return null;
}

/**
 * Story 28.8: what one sheet of a seed with `history_note_relevant` prints of the note: each test's line, or, at
 * `VARIATIONS_ONE_LINE_FROM` or more, one line after its last table. Null on v1 to v17 (Story 24.16's note prints).
 */
export function sheetVariationNotes(
  block: BlockRow,
  definition: BlockDefinition,
  visit: VisitContext,
  evaluations: readonly TestEvaluation[],
  measurements: readonly MeasurementTestEvaluation[],
): SheetVariationNotes | null {
  if (!relevantHistoryNoteOn(block.seed_version)) return null;
  const items = relevantVariations(block, definition, visit, evaluations, measurements);
  if (items.length >= VARIATIONS_ONE_LINE_FROM) return { byTest: new Map(), line: manyVariationsText(items) };
  const byTest = new Map<string, string>();
  for (const testKey of new Set(items.map((item) => item.testKey))) byTest.set(testKey, relevantNoteText(items.filter((item) => item.testKey === testKey))!);
  return { byTest, line: null };
}
