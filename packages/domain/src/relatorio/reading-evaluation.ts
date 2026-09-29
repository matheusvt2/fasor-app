import { canonicalDecimal, formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import type { BlockRow } from '../schemas/entities.ts';
import { compareCriterion, formatCriterionValue, scaleToUnit, SEEDED_CRITERIA, type CriterionSeed } from '../seed/criteria.ts';
import type { BlockDefinition, ColumnDef, TableDef, TestDef } from '../seed/schema.ts';
import { listPtBr } from '../text/plural.ts';
import { enabledSubBlocksOf } from './sheet-state.ts';
import {
  convertRatioUnit,
  DECIMAL,
  headerText,
  nameplateRatioInput,
  RATIO_POWER,
  readingLabelText,
  readStored,
  sentenceCase,
  shiftDecimal,
  storedCell,
  unitsOf,
  type CellAddress,
  type EvaluatedCell,
  type EvaluatedRow,
  type EvaluatedTable,
  type TestEvaluation,
  type TestKey,
  type VisibleColumn,
} from './reading-cells.ts';

/*
 * E9-A7: THE evaluation of a sheet's readings (see `reading-cells.ts` for the addressing) and
 * the lookups over it. `readings.ts` re-exports the public part.
 */

// --- the evaluation ------------------------------------------------------------------------

function criterionOf(test: TestDef): CriterionSeed {
  const found = SEEDED_CRITERIA.find((criterion) => criterion.key === test.criterion_key);
  if (found === undefined) throw new Error(`readings: unknown criterion "${test.criterion_key}"`);
  return found;
}

/**
 * E5-A4: the criterion a test of this sheet is judged by: the seed's, with the value and
 * unit of the sheet's `test.{key}.criterion_override` when it is well formed -- `{raw, unit}`
 * (AR-10's number shape), `raw` a decimal string and `unit` one the seed's unit converts
 * to (`scaleToUnit`). The operator, type and source stay the seed's. A malformed override
 * (a negative value among them: it would make `>` pass and `±` fail every reading) is
 * ignored and the seed stands. Open question: no document fixes the override's shape;
 * this is the conservative reading, and no surface writes it yet.
 */
export function effectiveCriterion(block: Pick<BlockRow, 'sheet'>, test: TestDef): CriterionSeed {
  const seed = criterionOf(test);
  const value = block.sheet.test[test.key]?.criterion_override?.value;
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return seed;
  const override = value as { raw?: unknown; unit?: unknown };
  if (typeof override.raw !== 'string' || !DECIMAL.test(override.raw)) return seed;
  if (override.unit !== null && typeof override.unit !== 'string') return seed;
  const number = Number(override.raw);
  if (!Number.isFinite(number) || number < 0 || scaleToUnit(number, override.unit, seed.unit) === null) return seed;
  return { ...seed, value: number, unit: override.unit };
}

function outHelperText(criterion: CriterionSeed): string {
  const text = formatCriterionValue(criterion);
  if (criterion.operator === '>' || criterion.operator === '>=') return `Abaixo do aceitável (${text})`;
  if (criterion.operator === '<' || criterion.operator === '<=') return `Acima do aceitável (${text})`;
  return `Fora do aceitável (${text})`;
}

/** The typed columns of a table, in column order. */
function typedColumns(table: TableDef): { col: number; column: ColumnDef }[] {
  return table.value_columns.flatMap((column, col) => (column.role === 'capture' || column.role === 'input' ? [{ col, column }] : []));
}

/** Every typed cell address of a test, in table order then row then column (the op log's addressing). */
export function cellAddressesOf(definition: BlockDefinition, testKey: TestKey): CellAddress[] {
  const test = definition.tests.find((t) => t.key === testKey);
  if (test === undefined) return [];
  const out: CellAddress[] = [];
  let offset = 0;
  for (const table of test.tables) {
    for (let r = 0; r < table.rows.length; r++) for (const { col } of typedColumns(table)) out.push({ testKey, row: offset + r, col });
    offset += table.rows.length;
  }
  return out;
}

/** The deviation of a ratio reading from the calculated ratio, in %, rounded clear of float noise. */
export function deviationPct(measured: number, calculated: number): number {
  return Math.round((Math.abs(measured - calculated) / calculated) * 100 * 1e9) / 1e9;
}

function formatCalculated(value: number): string {
  return formatDecimalGroupedPtBr(value.toFixed(2));
}

function evaluateTable(block: BlockRow, definition: BlockDefinition, test: TestDef, criterion: CriterionSeed, table: TableDef, offset: number): EvaluatedTable {
  const ratio = test.key === 'relacao_transformacao';
  const columns: VisibleColumn[] = [];
  const derived = table.value_columns.flatMap((c, i) => (c.role === 'derived' ? [i] : []));
  table.value_columns.forEach((column, col) => {
    if (column.role === 'print') return;
    columns.push({
      col,
      label: column.label,
      header: headerText(column.label),
      role: column.role,
      unit: column.unit,
      derivedKind: column.role !== 'derived' ? null : col === derived[derived.length - 1] && derived.length > 1 ? 'condicao' : 'calculated',
    });
  });
  const typed = typedColumns(table);
  const inputs = typed.filter(({ column }) => column.role === 'input');
  const helper = outHelperText(criterion);

  const rows: EvaluatedRow[] = table.rows.map((connection, r) => {
    const row = offset + r;
    const cells: EvaluatedCell[] = [];
    // The ratio: the effective primário / secundário, each typed or from the nameplate.
    let calculated: EvaluatedRow['calculated'] = null;
    const effective: (number | null)[] = [];
    for (const { col, column } of typed) {
      const address: CellAddress = { testKey: test.key, row, col };
      const stored = readStored(storedCell(block, address));
      const state = stored?.state ?? 'empty';
      const unit = stored?.unit ?? column.unit;
      const cell: EvaluatedCell = {
        address,
        role: column.role as 'capture' | 'input',
        column: headerText(column.label),
        state,
        raw: stored?.raw ?? '',
        unit,
        units: unitsOf(column),
        displayText: state === 'measured' ? formatDecimalGroupedPtBr(stored!.raw) : state === 'not_measured' ? '-' : state === 'invalid' ? stored!.raw : '—',
        source: state === 'empty' ? null : 'typed',
        fallback: null,
        verdict: null,
        helperText: null,
        outlier: null,
        missing: false,
      };
      if (column.role === 'input') {
        const index = inputs.findIndex((input) => input.col === col);
        let base: string | null = null;
        if (state === 'measured') base = convertRatioUnit(stored!.raw, unit, column.unit === null ? null : column.unit);
        else if (state === 'empty') {
          const fromPlate = nameplateRatioInput(block, definition, index, column.unit);
          if (fromPlate !== null) {
            cell.fallback = { raw: fromPlate, text: formatDecimalGroupedPtBr(fromPlate) };
            cell.source = 'nameplate';
            base = fromPlate;
          }
        }
        const power = column.unit === null ? 0 : (RATIO_POWER[column.unit] ?? 0);
        effective[index] = base === null ? null : Number(shiftDecimal(base, power));
        cell.missing = state === 'empty' && cell.fallback === null;
      } else {
        cell.missing = state === 'empty';
      }
      cells.push(cell);
    }
    if (ratio && inputs.length === 2) {
      const [primary, secondary] = effective;
      // VAL CALCULADO exists only for a positive primário and secundário: a zero or negative
      // side would give a zero ratio and an infinite deviation.
      if (primary !== null && primary !== undefined && secondary !== null && secondary !== undefined && primary > 0 && secondary > 0) {
        const value = primary / secondary;
        const raw = canonicalDecimal(value.toFixed(6));
        if (Number.isFinite(value) && Number(raw) > 0) calculated = { raw, text: formatCalculated(value) };
      }
    }
    // The verdicts: every measured capture against the criterion.
    for (const cell of cells) {
      if (cell.role !== 'capture' || cell.state !== 'measured') continue;
      const value = Number(cell.raw);
      let within: boolean | null;
      try {
        if (ratio) within = calculated === null ? null : compareCriterion({ value: deviationPct(value, Number(calculated.raw)), unit: '%' }, criterion);
        else within = compareCriterion({ value, unit: cell.unit }, criterion);
      } catch {
        within = null;
      }
      if (within !== null) {
        cell.verdict = within ? 'within' : 'out';
        cell.helperText = within ? null : helper;
      }
    }
    const captures = cells.filter((cell) => cell.role === 'capture');
    const condicao = ratio && calculated !== null && captures.length > 0 && captures.every((cell) => cell.verdict === 'within') ? 'SATISFATÓRIO' : null;
    const shown = connection.map((text) => readingLabelText(text));
    return { row, connection: shown, label: shown[0] ?? '', cells, calculated, condicao };
  });

  // The units an empty cell shows: the previous row's, else the column's (Story 5.5 AC 2).
  for (const { col } of typed) {
    let previous: string | null = null;
    rows.forEach((row, r) => {
      const cell = row.cells.find((c) => c.address.col === col)!;
      if (cell.state === 'empty' && r > 0 && cell.units.length > 1 && previous !== null) cell.unit = previous;
      previous = cell.unit;
    });
  }

  markOutliers(rows, typed);

  return {
    key: table.key,
    title: table.title === undefined ? null : sentenceCase(table.title),
    connectionHeaders: table.connection_columns.map(headerText),
    columns,
    rows,
    ratio,
  };
}

/**
 * E5-Q15: the power of ten nearest `ratio` on a log scale (970 reads 1000, not 100), never
 * below 100, the outlier threshold itself.
 */
function nearestPowerOfTen(ratio: number): number {
  return Math.max(100, 10 ** Math.round(Math.log10(ratio)));
}

/** The others' labels with the prefix they share with the row dropped: "Fase A", "Fase B" -> "A", "B". */
function othersText(label: string, others: string[]): string {
  const first = label.split(' ')[0];
  const shared = first !== undefined && label.includes(' ') && others.every((other) => other.startsWith(`${first} `));
  return listPtBr(shared ? others.map((other) => other.slice(first!.length + 1)) : others);
}

/**
 * FR-28: a measured capture at least 100x below (or above) every other measured capture of
 * the same table and column, with at least two others to compare: "Fase C 1000× abaixo de
 * A e B. Conferir?". A hint for the field, never a verdict.
 */
function markOutliers(rows: EvaluatedRow[], typed: { col: number; column: ColumnDef }[]): void {
  for (const { col, column } of typed) {
    if (column.role !== 'capture') continue;
    const measured = rows.flatMap((row) => {
      const cell = row.cells.find((c) => c.address.col === col)!;
      if (cell.state !== 'measured') return [];
      const value = scaleToUnit(Number(cell.raw), cell.unit, column.unit);
      return value === null ? [] : [{ row, cell, value }];
    });
    if (measured.length < 3 || measured.some((m) => !(m.value > 0))) continue;
    for (const target of measured) {
      const others = measured.filter((m) => m !== target);
      const below = Math.min(...others.map((m) => m.value / target.value));
      const above = Math.min(...others.map((m) => target.value / m.value));
      const direction = below >= 100 * (1 - 1e-9) ? 'abaixo' : above >= 100 * (1 - 1e-9) ? 'acima' : null;
      if (direction === null) continue;
      const factor = nearestPowerOfTen(direction === 'abaixo' ? below : above);
      const names = othersText(target.row.label, others.map((m) => m.row.label));
      target.cell.outlier = { text: `${target.row.label} ${factor}× ${direction} de ${names}. Conferir?` };
    }
  }
}

/** One test sub-block's evaluation. */
export function evaluateTest(block: BlockRow, definition: BlockDefinition, test: TestDef): TestEvaluation {
  const criterion = effectiveCriterion(block, test);
  const tables: EvaluatedTable[] = [];
  let offset = 0;
  for (const table of test.tables) {
    tables.push(evaluateTable(block, definition, test, criterion, table, offset));
    offset += table.rows.length;
  }
  return {
    testKey: test.key,
    title: sentenceCase(test.label),
    criterion,
    criterionText: formatCriterionValue(criterion),
    sourceName: criterion.source.name,
    tables,
  };
}

/** THE evaluation: every enabled test of the sheet (AR-17: a disabled sub-block is ignored), in the definition's order. */
export function evaluateSheetReadings(block: BlockRow, definition: BlockDefinition): TestEvaluation[] {
  const enabled = enabledSubBlocksOf(block);
  return definition.tests.filter((test) => enabled.has(test.key)).map((test) => evaluateTest(block, definition, test));
}

/** Every evaluated cell of the sheet, test by test, table by table, row by row. */
export function evaluatedCells(evaluations: readonly TestEvaluation[]): EvaluatedCell[] {
  return evaluations.flatMap((test) => test.tables.flatMap((table) => table.rows.flatMap((row) => row.cells)));
}

export function sameAddress(a: CellAddress, b: CellAddress): boolean {
  return a.testKey === b.testKey && a.row === b.row && a.col === b.col;
}

/** The evaluated cell at an address, or null. */
export function cellAt(evaluations: readonly TestEvaluation[], address: CellAddress): EvaluatedCell | null {
  return evaluatedCells(evaluations).find((cell) => sameAddress(cell.address, address)) ?? null;
}

/** Story 5.5 AC 2: the unit a cell's slot shows before it holds a value: the previous row's, else the column's. */
export function unitDefaultFor(evaluation: TestEvaluation, address: CellAddress): string | null {
  for (const table of evaluation.tables) {
    const at = table.rows.findIndex((row) => row.row === address.row);
    if (at === -1) continue;
    const column = table.columns.find((c) => c.col === address.col);
    if (at > 0) {
      const previous = table.rows[at - 1]!.cells.find((cell) => cell.address.col === address.col);
      if (previous !== undefined) return previous.unit;
    }
    return column?.unit ?? null;
  }
  return null;
}
