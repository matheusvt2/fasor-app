import { formatDateOfInstant } from '../format/datetime.ts';
import { canonicalDecimal, formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import { readingAddressKey, type LastResultReading, type PreviousResults } from '../print/reading-slots.ts';
import type { BlockRow } from '../schemas/entities.ts';
import { scaleToUnit } from '../seed/criteria.ts';
import { seedRule } from '../seed/definitions.ts';
import type { BlockDefinition, ColumnDef, TestDef } from '../seed/schema.ts';
import { selectOptionFor } from '../seed/select-option.ts';
import { overRangeText } from './over-range.ts';
import { readingRowLabel, sentenceCase, type EvaluatedCell, type EvaluatedRow } from './reading-cells.ts';
import { enabledSubBlocksOf } from './sheet-state.ts';
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

/** One rule's finding on a cell: the short reason, the helper's detail and (fix batch e23p, P3) the history rule's comparison. */
interface Finding {
  reason: string;
  detail: string;
  compared?: string;
  /** Batch e24p (Story 24.16): set on a finding of a previous-visit rule (the history note's rows). */
  history?: true;
}

/** Batch e24p (Story 24.15): the previous visit's date a history text names: `dateText` when the caller gave it (the block's seed), else the issue date (v1 to v13). */
function previousDateOf(entry: PreviousResults, previous: Pick<RestrictionPrevious, 'dateText'>): string {
  return previous.dateText ?? formatDateOfInstant(entry.issued_at);
}

function historyFinding(pct: number, entry: PreviousResults, previous: NonNullable<LastResultReading['corrected']>, now: { raw: string; unit: string | null }, dateText: string): Finding {
  return {
    reason: `queda de mais de ${pctText(pct)} % desde a manutenção anterior`,
    detail: `caiu mais de ${pctText(pct)} % desde a manutenção anterior (${correctedText(previous.raw, previous.unit)} a ${INSULATION_REFERENCE_C} °C, rev. ${entry.revision_number}, ${dateText})`,
    // authored (e23p, listed for Bruno): both corrected values, as the derived point names them.
    compared: `de ${correctedText(previous.raw, previous.unit)} para ${correctedText(now.raw, now.unit)}, a ${INSULATION_REFERENCE_C} °C`,
    history: true,
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
  /**
   * Batch e24p (Story 24.15): the previous visit's date as the history texts name it
   * (`previousVisitDateText` of the block's seed: the visit's date on v14, the issue date on v1 to
   * v13); absent, the issue date.
   */
  dateText?: string;
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
  return drop > pct * (1 + EPSILON) ? historyFinding(pct, previous.entry, before, corrected, previousDateOf(previous.entry, previous)) : null;
}

/**
 * Stories 23.6 and 23.14: applies `test.restriction`'s rules to one evaluated table, in place: every
 * capture cell of the table takes `restriction` (null when no rule flags it), and a cell within its
 * criterion that a rule flags takes the verdict `restricted` with its reason and helper sentence.
 * `captureColumns` are the table's capture columns (index and definition).
 *
 * Fix batch e23w (W2-3): the rules also run on a measured reading already out (its verdict and
 * `restriction` unchanged); the return is true when a rule flags one, so the test records that its
 * restriction still stands (`TestEvaluation.restrictionStands`).
 */
export function applyRestrictions(test: TestDef, rows: readonly EvaluatedRow[], captureColumns: readonly { col: number; column: ColumnDef }[], previous: RestrictionPrevious): boolean {
  const rules = test.restriction;
  if (rules === undefined) return false;
  let stands = false;
  for (const { col, column } of captureColumns) {
    const readings = columnReadings(rows, col, column);
    for (const row of rows) {
      const cell = row.cells.find((candidate) => candidate.address.col === col && candidate.role === 'capture');
      if (cell === undefined) continue;
      cell.restriction = null;
      if ((cell.verdict !== 'within' && cell.verdict !== 'out') || cell.state !== 'measured') continue;
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
        // The lowest pole is a measured one above zero: a reading above the limit is a lower bound, never the lowest, and a
        // pole at 0 gives no share to deviate from (review fix: it no longer turns the rule off for the column).
        const measured = readings.filter((reading) => reading.cell.state === 'measured' && reading.value > 0);
        const lowest = measured.reduce<ColumnReading | null>((best, reading) => (best === null || reading.value < best.value ? reading : best), null);
        if (lowest !== null && lowest !== own) {
          const deviation = ((own.value - lowest.value) / lowest.value) * 100;
          if (deviation > rules.pole_deviation_pct * (1 + EPSILON)) findings.push(poleFinding(rules.pole_deviation_pct, readingRowLabel(rows, lowest.row), lowest.cell));
        }
      }
      if (findings.length === 0) continue;
      if (cell.verdict === 'out') {
        stands = true;
        continue;
      }
      cell.verdict = 'restricted';
      // Fix batch e23p (P3): the point's reason, each history finding's comparison right after its own reason.
      const reason = findings.map((finding) => finding.reason).join('; ');
      const pointReason = findings.map((finding) => (finding.compared === undefined ? finding.reason : `${finding.reason} (${finding.compared})`)).join('; ');
      // Batch e24p (Story 24.16): the previous-visit rule's part of the point's reason, which the history note names.
      const history = findings.filter((finding) => finding.history === true).map((finding) => (finding.compared === undefined ? finding.reason : `${finding.reason} (${finding.compared})`)).join('; ');
      cell.restriction = {
        reason,
        text: `${findings.map((finding) => finding.detail).join('; ')}. ${CLOSING}`,
        ...(pointReason === reason ? {} : { pointReason }),
        ...(history === '' ? {} : { history }),
      };
    }
  }
  return stands;
}

/** "v13" -> 13; null for a version that is not "v" and a number. */
function seedNumber(version: string): number | null {
  const match = /^v(\d+)$/.exec(version);
  return match === null ? null : Number(match[1]);
}

/** The first seed whose previous visit the rise rule reads (B-6: both visits judged by the base). */
const RISE_FROM_SEED = 13;

/**
 * Fix batch e23w (B-6, Bruno 2026-11-09; seed v13, `restriction.history_rise_out_pct`, DJ-03 and
 * SC-03): a measured pole within its criterion becomes out when its value, in the previous one's
 * unit, is more than the share above the same cell's previous measured value. The previous visit
 * (`visit.previous`) judges only when it was issued on seed v13 or later and the cell's previous
 * reading is measured and above zero; a reading above the instrument's limit, on either visit,
 * judges nothing. The bound is exclusive (exactly the share is within). Applied before the
 * restriction rules (`applyRestrictions`), so a pole both risen and deviating is out.
 * `captureColumns` are the table's capture columns. A reading already out keeps its own reason.
 */
export function applyHistoryRise(test: TestDef, rows: readonly EvaluatedRow[], captureColumns: readonly { col: number; column: ColumnDef }[], previous: RestrictionPrevious): void {
  const pct = test.restriction?.history_rise_out_pct;
  const entry = previous.entry;
  if (pct === undefined || entry === null) return;
  const seed = seedNumber(entry.seed_version);
  if (seed === null || seed < RISE_FROM_SEED) return;
  for (const { col } of captureColumns) {
    for (const row of rows) {
      const cell = row.cells.find((candidate) => candidate.address.col === col && candidate.role === 'capture');
      if (cell === undefined || cell.state !== 'measured' || cell.verdict !== 'within') continue;
      const before = previous.byAddress.get(readingAddressKey(cell.address));
      if (before === undefined || before.state !== 'measured') continue;
      const was = Number(before.raw);
      const now = scaleToUnit(Number(cell.raw), cell.unit, before.unit);
      if (!(was > 0) || !Number.isFinite(was) || now === null || !Number.isFinite(now)) continue;
      const rise = ((now - was) / was) * 100;
      if (!(rise > pct * (1 + EPSILON))) continue;
      // authored (e23w, listed for Bruno): a pole out by its rise since the previous visit, as the helper, the points and the conclusion name it.
      // The rise is shown rounded up to one decimal, so a rise just past the limit never reads as the limit (review fix).
      const reason = `alta de ${pctText(Math.ceil(rise * 10 - EPSILON) / 10)} % sobre ${previousReadingValueText(before)} da manutenção anterior, rev. ${entry.revision_number} de ${previousDateOf(entry, previous)}, acima do limite de ${pctText(pct)} %`;
      cell.verdict = 'out';
      cell.rise = { reason };
      cell.helperText = `Acima do aceitável: ${reason}`;
    }
  }
}

/** A previous measured reading as the rise names it: "40 µΩ". */
function previousReadingValueText(reading: LastResultReading): string {
  const shown = formatDecimalGroupedPtBr(reading.raw);
  return reading.unit === null || reading.unit === '' ? shown : `${shown} ${reading.unit}`;
}

/**
 * Story 23.6 (PR-02's prerequisite): the failure of a test whose `restriction.prerequisite` names a
 * select of the plate that holds one of its `fails_on` values (aliases resolved), with the clause
 * the points and the conclusion name it by: "pré-requisito não atendido (Desligador íntegro:
 * NÃO)"; null when the field holds another value or none (SIM or empty: no effect).
 *
 * Batch e24a (Story 24.3, seed v14, row 3344): the prerequisite is a plate value, so it is read only
 * while the block's nameplate sub-block is on (`prerequisite_needs_nameplate`, the block's own seed);
 * with the plate switched off nothing fails, so the floor, the conclusion text, the parecer and
 * "Origem resolvida" ignore a value stored before. On v1 to v13 read whatever the switch.
 */
export function prerequisiteFailure(block: Pick<BlockRow, 'sheet' | 'config' | 'seed_version'>, definition: Pick<BlockDefinition, 'nameplate'>, test: TestDef): { failed: true; text: string } | null {
  const rule = test.restriction?.prerequisite;
  if (rule === undefined) return null;
  if (seedRule(block.seed_version, 'prerequisite_needs_nameplate') && !enabledSubBlocksOf(block).has('nameplate')) return null;
  const field = definition.nameplate.find((candidate) => candidate.key === rule.field);
  const value = block.sheet.nameplate[rule.field]?.value;
  if (field === undefined || typeof value !== 'string' || value.trim() === '') return null;
  const option = selectOptionFor(field, value);
  if (option === null || !rule.fails_on.includes(option)) return null;
  // authored (Story 23.6, listed for Bruno): a failed prerequisite as the points and the conclusion name it.
  return { failed: true, text: `pré-requisito não atendido (${sentenceCase(field.label)}: ${option})` };
}

/** Fix batch e23w (W2-2): one test whose plate fails its prerequisite, as the floor, the points, the conclusion and the parecer read it. */
export interface FailedPrerequisite {
  testKey: TestDef['key'];
  /** The test's heading as the sheet names it ("Ensaio de isolação"). */
  title: string;
  /** `prerequisiteFailure`'s clause: "pré-requisito não atendido (Desligador íntegro: NÃO)". */
  text: string;
}

/**
 * Fix batch e23w (W2-2): THE reader of failed prerequisites. Every test of the definition carrying
 * `restriction.prerequisite` whose plate fails it, in the definition's order, whatever its
 * sub-block's switch or its applicability: switching the arrester's insulation test off (or the
 * plate making it NA) never makes a failed disconnector vanish. With the test on, the list holds
 * what the evaluation's `prerequisite` holds. Empty on every definition of v1 to v12 (no
 * `restriction`). Batch e24a (Story 24.3): on seed v14 empty while the nameplate sub-block is off
 * (`prerequisiteFailure`).
 */
export function failedPrerequisites(block: Pick<BlockRow, 'sheet' | 'config' | 'seed_version'>, definition: Pick<BlockDefinition, 'nameplate' | 'tests'>): FailedPrerequisite[] {
  return definition.tests.flatMap((test) => {
    if (test.restriction?.prerequisite === undefined) return [];
    const failure = prerequisiteFailure(block, definition, test);
    return failure === null ? [] : [{ testKey: test.key, title: sentenceCase(test.label), text: failure.text }];
  });
}
