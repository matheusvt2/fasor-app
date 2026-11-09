import { formatDateOfInstant } from '../format/datetime.ts';
import { canonicalDecimal, formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import { readingAddressKey, type LastResultReading, type PreviousResults } from '../print/reading-slots.ts';
import type { BlockRow } from '../schemas/entities.ts';
import { scaleToUnit } from '../seed/criteria.ts';
import type { BlockDefinition, ColumnDef, TestDef } from '../seed/schema.ts';
import { selectOptionFor } from '../seed/select-option.ts';
import { overRangeText } from './over-range.ts';
import { readingRowLabel, sentenceCase, type EvaluatedCell, type EvaluatedRow } from './reading-cells.ts';
import { correctedText, INSULATION_REFERENCE_C } from './temperature-correction.ts';

/*
 * Story 23.6 (seed v13; decision C) and Story 23.14 (decision L): the third level of a reading. A
 * reading already within its criterion is `restricted` when a rule of its test's `restriction`
 * flags it; nothing here touches a reading out of its criterion (out > restricted > within), and a
 * test without `restriction` (every test of v1 to v12) is never touched. Only the rules the base
 * gives in numbers exist (no vague term makes a band, open item B-1):
 *
 * - history (`history_drop_pct`, Base rev08 TR-OL-02): a corrected reading that fell more than the
 *   share since the previous visit's corrected reading of the same cell (`last_results`, Story
 *   22.12). It judges only when both carry a corrected value (`corrected`), so a previous visit on
 *   v12, an uncorrected reading or none is shown as Story 22.12 shows it and judges nothing.
 * - below the largest (`below_largest_pct`, CB-02 between phases, PR-02 against the largest unit):
 *   a reading below the share of the largest other row of its table and column (FASE RESERVA
 *   included).
 * - pole deviation (`pole_deviation_pct`, DJ-03, SC-03, NETA MTS-2023 7.6.3 and 7.5.1): a reading
 *   above the lowest measured row of its table and column by more than the share.
 *
 * A reading above the instrument's limit (Story 22.10) enters a comparison at its limit, a lower
 * bound of its value: it may be the largest other row (a reading below the share of a lower bound
 * is certainly below the share of the value), it is never the lowest pole, and it is never
 * restricted itself. A restriction is given only when certain. Each bound is exclusive: a reading
 * at exactly the share is within. The two comparisons between rows read the readings as measured
 * (a test's correction factor is the same on every row, so it never changes their ratio).
 *
 * The prerequisite (`prerequisite`, PR-02's disconnector) is not a level: a plate value that fails
 * it fails the test (`prerequisiteFailure`), which the floor reads as Reprovado.
 */

/** The relative tolerance the bounds are compared with, so float noise never crosses one. */
const EPSILON = 1e-9;

/** "50" for 50, "12,5" for 12.5. */
function pctText(pct: number): string {
  return formatDecimalGroupedPtBr(canonicalDecimal(String(pct)));
}

/** A reading as the helper names it: "5 GΩ", "> 2 TΩ". */
function readingText(cell: EvaluatedCell): string {
  if (cell.state === 'over_range') return overRangeText(cell.raw, cell.unit);
  return cell.unit === null || cell.unit === '' ? cell.displayText : `${cell.displayText} ${cell.unit}`;
}

// authored (Story 23.6, listed for Bruno): the reasons and the helper's sentences of the three rules.
// The closing sentence is `60-ficha.html`'s (#/ficha/TR1), verbatim.
const CLOSING = 'Dentro do aceitável; a conclusão sobe para Com restrições.';

/** One rule's finding on a cell: the short reason and the helper's detail. */
interface Finding {
  reason: string;
  detail: string;
}

function historyFinding(pct: number, entry: PreviousResults, previous: NonNullable<LastResultReading['corrected']>): Finding {
  return {
    reason: `queda de mais de ${pctText(pct)} % desde a manutenção anterior`,
    detail: `caiu mais de ${pctText(pct)} % desde a manutenção anterior (${correctedText(previous.raw, previous.unit)} a ${INSULATION_REFERENCE_C} °C, rev. ${entry.revision_number}, ${formatDateOfInstant(entry.issued_at)})`,
  };
}

function belowLargestFinding(pct: number, name: string, cell: EvaluatedCell): Finding {
  return { reason: `abaixo de ${pctText(pct)} % da maior leitura`, detail: `abaixo de ${pctText(pct)} % da maior leitura (${name}: ${readingText(cell)})` };
}

function poleFinding(pct: number, name: string, cell: EvaluatedCell): Finding {
  return { reason: `mais de ${pctText(pct)} % acima do menor polo`, detail: `mais de ${pctText(pct)} % acima do menor polo (${name}: ${readingText(cell)})` };
}

/** What the rules read beyond the table: the previous visit and its readings by `readingAddressKey`. */
export interface RestrictionPrevious {
  entry: PreviousResults | null;
  byAddress: ReadonlyMap<string, LastResultReading>;
}

/** One reading of a column, in the column's unit, as the comparisons take it. */
interface ColumnReading {
  row: EvaluatedRow;
  cell: EvaluatedCell;
  value: number;
}

/** The readings of one capture column of a table, in the column's unit (a unit that does not scale leaves the cell out). */
function columnReadings(rows: readonly EvaluatedRow[], col: number, column: ColumnDef): ColumnReading[] {
  return rows.flatMap((row) => {
    const cell = row.cells.find((candidate) => candidate.address.col === col);
    if (cell === undefined || cell.role !== 'capture' || (cell.state !== 'measured' && cell.state !== 'over_range')) return [];
    const value = scaleToUnit(Number(cell.raw), cell.unit, column.unit);
    return value === null || !Number.isFinite(value) ? [] : [{ row, cell, value }];
  });
}

/**
 * The history finding of one corrected cell: its corrected value against the previous visit's
 * corrected value of the same cell, both in the current one's unit; null when either is missing.
 */
function historyOf(cell: EvaluatedCell, pct: number, previous: RestrictionPrevious): Finding | null {
  const corrected = cell.corrected ?? null;
  if (corrected === null || previous.entry === null) return null;
  const before = previous.byAddress.get(readingAddressKey(cell.address))?.corrected ?? null;
  if (before === null) return null;
  const was = scaleToUnit(Number(before.raw), before.unit, corrected.unit);
  const now = Number(corrected.raw);
  if (was === null || !(was > 0) || !Number.isFinite(now)) return null;
  const drop = ((was - now) / was) * 100;
  return drop > pct * (1 + EPSILON) ? historyFinding(pct, previous.entry, before) : null;
}

/**
 * Stories 23.6 and 23.14: applies `test.restriction`'s rules to one evaluated table, in place: every
 * capture cell of the table takes `restriction` (null when no rule flags it), and a cell within its
 * criterion that a rule flags takes the verdict `restricted` with its reason and helper sentence.
 * `captureColumns` are the table's capture columns (index and definition).
 */
export function applyRestrictions(test: TestDef, rows: readonly EvaluatedRow[], captureColumns: readonly { col: number; column: ColumnDef }[], previous: RestrictionPrevious): void {
  const rules = test.restriction;
  if (rules === undefined) return;
  for (const { col, column } of captureColumns) {
    const readings = columnReadings(rows, col, column);
    for (const row of rows) {
      const cell = row.cells.find((candidate) => candidate.address.col === col && candidate.role === 'capture');
      if (cell === undefined) continue;
      cell.restriction = null;
      if (cell.verdict !== 'within' || cell.state !== 'measured') continue;
      const own = readings.find((reading) => reading.cell === cell);
      const findings: Finding[] = [];
      if (rules.history_drop_pct !== undefined) {
        const found = historyOf(cell, rules.history_drop_pct, previous);
        if (found !== null) findings.push(found);
      }
      if (own !== undefined && rules.below_largest_pct !== undefined) {
        const others = readings.filter((reading) => reading !== own);
        const largest = others.reduce<ColumnReading | null>((best, reading) => (best === null || reading.value > best.value ? reading : best), null);
        if (largest !== null && own.value < ((largest.value * rules.below_largest_pct) / 100) * (1 - EPSILON)) findings.push(belowLargestFinding(rules.below_largest_pct, readingRowLabel(rows, largest.row), largest.cell));
      }
      if (own !== undefined && rules.pole_deviation_pct !== undefined) {
        // The lowest pole is a measured one: a reading above the limit is a lower bound, never the lowest.
        const measured = readings.filter((reading) => reading.cell.state === 'measured');
        const lowest = measured.reduce<ColumnReading | null>((best, reading) => (best === null || reading.value < best.value ? reading : best), null);
        if (lowest !== null && lowest !== own && lowest.value > 0) {
          const deviation = ((own.value - lowest.value) / lowest.value) * 100;
          if (deviation > rules.pole_deviation_pct * (1 + EPSILON)) findings.push(poleFinding(rules.pole_deviation_pct, readingRowLabel(rows, lowest.row), lowest.cell));
        }
      }
      if (findings.length === 0) continue;
      cell.verdict = 'restricted';
      cell.restriction = { reason: findings.map((finding) => finding.reason).join('; '), text: `${findings.map((finding) => finding.detail).join('; ')}. ${CLOSING}` };
    }
  }
}

/**
 * Story 23.6 (PR-02's prerequisite): the failure of a test whose `restriction.prerequisite` names a
 * select of the plate that holds one of its `fails_on` values (aliases resolved), with the clause
 * the points and the conclusion name it by: "pré-requisito não atendido (Desligador íntegro:
 * NÃO)"; null when the field holds another value or none (SIM or empty: no effect).
 */
export function prerequisiteFailure(block: Pick<BlockRow, 'sheet'>, definition: Pick<BlockDefinition, 'nameplate'>, test: TestDef): { failed: true; text: string } | null {
  const rule = test.restriction?.prerequisite;
  if (rule === undefined) return null;
  const field = definition.nameplate.find((candidate) => candidate.key === rule.field);
  const value = block.sheet.nameplate[rule.field]?.value;
  if (field === undefined || typeof value !== 'string' || value.trim() === '') return null;
  const option = selectOptionFor(field, value);
  if (option === null || !rule.fails_on.includes(option)) return null;
  // authored (Story 23.6, listed for Bruno): a failed prerequisite as the points and the conclusion name it.
  return { failed: true, text: `pré-requisito não atendido (${sentenceCase(field.label)}: ${option})` };
}
