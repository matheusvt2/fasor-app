import { canonicalDecimal, formatDecimalGroupedPtBr, INSULATION_UNITS, parseDecimalPtBr } from '../parse/pt-br-number.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import { compareCriterion, formatCriterionValue, scaleToUnit, SEEDED_CRITERIA, type CriterionSeed } from '../seed/criteria.ts';
import type { BlockDefinition, ColumnDef, TableDef, TestDef } from '../seed/schema.ts';
import { listPtBr } from '../text/plural.ts';
import { enabledSubBlocksOf } from './sheet-state.ts';

/*
 * Stories 5.5-5.6 (FR-27, FR-28, UX-DR39/40): THE evaluation of a sheet's readings. The
 * Measurement table, `sheetProgress`, `suggestConclusionPair` and `composeConclusion` all read
 * `evaluateSheetReadings`, so "out of criterion" has exactly one rule and `compareCriterion`
 * is called for a sheet from nowhere else (AD-1/AD-13).
 *
 * Cell addressing, the op log's (`sheet/{b}/test/{t}/cell/{row}/{col}`, the Porto Seguro
 * fixture's `op-log.ts`): `row` counts the rows across the test's tables in table order
 * (contato aberto 0-2, contato fechado 3-5); `col` indexes that row's table
 * `value_columns` (the single insulation capture `1 MINUTO` is col 1; the TP ratio inputs
 * are cols 0 and 1, its capture col 3). `print` columns are neither shown nor required but
 * stay writable (the fixture writes them `not_measured`); `derived` columns are the
 * kernel's (VAL CALCULADO, CONDIÇÕES) and never written.
 */

export type TestKey = TestDef['key'];

export interface CellAddress {
  testKey: TestKey;
  row: number;
  col: number;
}

export type ReadingState = 'empty' | 'measured' | 'not_measured' | 'invalid';
export type ReadingVerdict = 'within' | 'out';
export type ReadingSource = 'typed' | 'nameplate' | 'derived';

/** A column the Measurement table draws (every value column but `print`). */
export interface VisibleColumn {
  col: number;
  /** The seed's label, as FO.SERV-03 prints it ("1 MINUTO"). */
  label: string;
  /** The header the table shows ("1 minuto", "Valor", "Calculado"). */
  header: string;
  role: 'capture' | 'input' | 'derived';
  unit: string | null;
  /** On a derived column: which of the two the kernel computes. */
  derivedKind: 'calculated' | 'condicao' | null;
}

export interface EvaluatedCell {
  address: CellAddress;
  role: 'capture' | 'input';
  /** The column's header ("1 minuto"), for the cell's accessible name. */
  column: string;
  state: ReadingState;
  /** The stored dot-decimal raw; '' when nothing is stored. */
  raw: string;
  /** The unit the cell shows: the stored one, else the previous row's, else the column's. */
  unit: string | null;
  /** The units the unit slot may take: the insulation family (a tap-cycle) or the one fixed unit. */
  units: readonly string[];
  /** The stored reading as the cell shows it: "3.300", "-" (not measured), "—" (empty). */
  displayText: string;
  source: ReadingSource | null;
  /** A ratio input left untyped reads the nameplate: its value in the column's unit, as the cell's placeholder. */
  fallback: { raw: string; text: string } | null;
  verdict: ReadingVerdict | null;
  /** "Abaixo do aceitável (>400 MΩ)" when out of criterion. */
  helperText: string | null;
  outlier: { text: string } | null;
  /** Counted by `sheetProgress`: a capture not filled, or an input with no effective value. */
  missing: boolean;
}

export interface EvaluatedRow {
  /** The row index across the test's tables (the op path's `row`). */
  row: number;
  /** The connection cells as the table shows them ("Fase A", "Massa", ""). */
  connection: string[];
  /** The row's name: its first connection cell, sentence-cased ("Fase C"). */
  label: string;
  cells: EvaluatedCell[];
  /** Ratio rows: VAL CALCULADO, computed from the effective primary and secondary. */
  calculated: { raw: string; text: string } | null;
  /** Ratio rows: "SATISFATÓRIO" when every capture of the row is within the criterion. */
  condicao: 'SATISFATÓRIO' | null;
}

export interface EvaluatedTable {
  key: string;
  /** The seed table's title sentence-cased ("Seccionadora contato aberto"), or null. */
  title: string | null;
  connectionHeaders: string[];
  columns: VisibleColumn[];
  rows: EvaluatedRow[];
  /** A ratio (TTR) table: stacked into cards below 768 px. */
  ratio: boolean;
}

export interface TestEvaluation {
  testKey: TestKey;
  /** The test's heading ("Ensaio de isolação"). */
  title: string;
  criterion: CriterionSeed;
  /** The criterion value alone, as the caption shows it (">400 MΩ"). */
  criterionText: string;
  /** The criterion's source ("aceitável na ficha"). */
  sourceName: string;
  tables: EvaluatedTable[];
}

// --- text helpers ------------------------------------------------------------------------

const VOWEL = /[aeiouáéíóúâêôãõà]/i;

/** A seed label as the table shows it: "FASE A" -> "Fase A", "1 MINUTO" -> "1 minuto", "H1-H2 / X1-X2" kept. */
export function readingLabelText(label: string): string {
  const words = label.split(' ').map((word) => {
    if (word.length <= 2 || /[\d']/.test(word) || !VOWEL.test(word)) return word;
    return word.toLocaleLowerCase('pt-BR');
  });
  const text = words.join(' ');
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
}

/** A title sentence-cased: "ENSAIO DE ISOLAÇÃO" -> "Ensaio de isolação". */
function sentenceCase(text: string): string {
  const lower = text.toLocaleLowerCase('pt-BR');
  return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
}

/** The Measurement table's column headers where FO.SERV-03's own label reads badly on screen (`60-ficha.html`). */
const HEADER_TEXT: Readonly<Record<string, string>> = {
  VALORES: 'Valor',
  'VAL CALCULADO': 'Calculado',
  CONDIÇÕES: 'Condição',
};

function headerText(label: string): string {
  return HEADER_TEXT[label] ?? readingLabelText(label);
}

// --- units ---------------------------------------------------------------------------------

/** The unit tap-cycle: MΩ -> GΩ -> TΩ -> MΩ; any other unit stays as it is. */
export function nextUnit(unit: string | null): string | null {
  const at = unit === null ? -1 : INSULATION_UNITS.indexOf(unit);
  if (at === -1) return unit;
  return INSULATION_UNITS[(at + 1) % INSULATION_UNITS.length]!;
}

function unitsOf(column: ColumnDef): readonly string[] {
  if (column.unit !== null && INSULATION_UNITS.includes(column.unit)) return INSULATION_UNITS;
  return column.unit === null ? [] : [column.unit];
}

/** Powers of ten of the ratio test's input units, relative to V and A. */
const RATIO_POWER: Readonly<Record<string, number>> = { V: 0, kV: 3, A: 0, kA: 3 };

/** `raw` times 10^exp, exact (a decimal-point move, never a float product). */
function shiftDecimal(raw: string, exp: number): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (match === null) return raw;
  let digits = match[2]! + (match[3] ?? '');
  let point = match[2]!.length + exp;
  if (point <= 0) {
    digits = '0'.repeat(1 - point) + digits;
    point = 1;
  }
  if (point > digits.length) digits += '0'.repeat(point - digits.length);
  const fraction = digits.slice(point);
  return canonicalDecimal(`${match[1]}${digits.slice(0, point)}${fraction === '' ? '' : `.${fraction}`}`);
}

/** A ratio input value moved from `from` into `to` (kV <-> V, kA <-> A); null when either unit is unknown. */
function convertRatioUnit(raw: string, from: string | null, to: string | null): string | null {
  if (from === to) return raw;
  if (from === null || to === null || !(from in RATIO_POWER) || !(to in RATIO_POWER)) return null;
  return shiftDecimal(raw, RATIO_POWER[from]! - RATIO_POWER[to]!);
}

// --- stored cells --------------------------------------------------------------------------

const DECIMAL = /^-?\d+(\.\d+)?$/;

interface StoredReading {
  state: ReadingState;
  raw: string;
  unit: string | null;
}

function readStored(cell: Cell | undefined): StoredReading | null {
  const value = cell?.value;
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return { state: 'invalid', raw: String(value), unit: null };
  const v = value as { raw?: unknown; unit?: unknown; state?: unknown };
  const unit = typeof v.unit === 'string' ? v.unit : null;
  const raw = typeof v.raw === 'string' ? v.raw : '';
  if (v.state === 'empty') return null;
  if (v.state === 'not_measured') return { state: 'not_measured', raw: '', unit };
  if (v.state === 'measured' && DECIMAL.test(raw)) return { state: 'measured', raw, unit };
  return { state: 'invalid', raw, unit };
}

function storedCell(block: BlockRow, address: CellAddress): Cell | undefined {
  return block.sheet.test[address.testKey]?.cells[String(address.row)]?.[String(address.col)];
}

// --- the ratio test's inputs from the nameplate ------------------------------------------

function nameplateNumber(block: BlockRow, key: string): { raw: string; unit: string | null } | null {
  const value = block.sheet.nameplate[key]?.value;
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as { raw?: unknown; unit?: unknown; state?: unknown };
  if (v.state !== 'measured' || typeof v.raw !== 'string' || !DECIMAL.test(v.raw)) return null;
  return { raw: v.raw, unit: typeof v.unit === 'string' ? v.unit : null };
}

/**
 * Story 5.6 AC 3 (open question 1: an untyped input reads the nameplate): the TP's and the
 * transformer's TENSÃO NOMINAL AT (kV) and BT (V), the TC's RELAÇÃO ("200/5"), for the
 * ratio table's first (primário) and second (secundário) input column.
 */
function nameplateRatioInput(block: BlockRow, definition: BlockDefinition, index: number, columnUnit: string | null): string | null {
  if (definition.nameplate.some((field) => field.key === 'relacao')) {
    const text = block.sheet.nameplate.relacao?.value;
    if (typeof text !== 'string') return null;
    const parts = text.split(/[/:]/);
    if (parts.length !== 2) return null;
    const raw = parseDecimalPtBr(parts[index]!);
    return raw === null ? null : canonicalDecimal(raw);
  }
  const key = index === 0 ? 'tensao_nominal_at' : 'tensao_nominal_bt';
  const field = definition.nameplate.find((f) => f.key === key);
  const value = nameplateNumber(block, key);
  if (field === undefined || value === null) return null;
  return convertRatioUnit(value.raw, value.unit ?? field.unit ?? null, columnUnit);
}

// --- the evaluation ------------------------------------------------------------------------

function criterionOf(test: TestDef): CriterionSeed {
  const found = SEEDED_CRITERIA.find((criterion) => criterion.key === test.criterion_key);
  if (found === undefined) throw new Error(`readings: unknown criterion "${test.criterion_key}"`);
  return found;
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
function deviationPct(measured: number, calculated: number): number {
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
      if (primary !== null && primary !== undefined && secondary !== null && secondary !== undefined && secondary !== 0 && Number.isFinite(primary / secondary)) {
        const value = primary / secondary;
        calculated = { raw: canonicalDecimal(value.toFixed(6)), text: formatCalculated(value) };
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

/** The largest power of ten not above `ratio` (clear of float noise: 330 / 0,33 is 1000). */
function powerOfTenBelow(ratio: number): number {
  return 10 ** Math.floor(Math.log10(ratio) + 1e-9);
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
      const factor = powerOfTenBelow(direction === 'abaixo' ? below : above);
      const names = othersText(target.row.label, others.map((m) => m.row.label));
      target.cell.outlier = { text: `${target.row.label} ${factor}× ${direction} de ${names}. Conferir?` };
    }
  }
}

/** One test sub-block's evaluation. */
export function evaluateTest(block: BlockRow, definition: BlockDefinition, test: TestDef): TestEvaluation {
  const criterion = criterionOf(test);
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

function sameAddress(a: CellAddress, b: CellAddress): boolean {
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
