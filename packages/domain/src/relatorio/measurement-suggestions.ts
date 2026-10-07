import { safeParsePath } from '../ops/path.ts';
import { formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import { displayCellTargetSchema } from '../reading/target.ts';
import type { BlockRow, Cell, PhotoFileRow, SuggestionRow } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import type { BlockDefinition, FieldDef } from '../seed/schema.ts';
import { evaluateSheetReadings, type CellAddress, type TestKey } from './readings.ts';
import { screenLabel } from './screen-label.ts';
import { isCellFilled } from './sheet-state.ts';
import { numberShape, suggestionView } from './suggestion-rows.ts';

/*
 * E9-A7, part of `suggestions.ts`: Story 9.1's Measurement cells ("Ler visor"): the pending
 * fill of each cell, a table's "Confirmar todos" and verify count, the mismatch line, the
 * burst's stops and the cells whose display photo is still queued.
 */

// --- Story 9.1: Measurement cells and the thermo-hygrometer ("Ler visor") -------------------

/** A display reading's value is a number cell: `compareSuggestion` reads it as `{kind: 'number'}`. */
export const NUMBER_FIELD: Pick<FieldDef, 'kind'> = { kind: 'number' };

/** The stored cell of a Measurement address, or null. */
export function storedTestCell(block: Pick<BlockRow, 'sheet'>, address: CellAddress): Cell | null {
  return block.sheet.test[address.testKey]?.cells[String(address.row)]?.[String(address.col)] ?? null;
}

export interface MeasurementSuggestion {
  address: CellAddress;
  suggestion: SuggestionRow;
  /** `fill` on an empty cell, `replace` beside a different typed value, `none` beside an equal one (auto-confirmed). */
  view: 'fill' | 'replace' | 'none';
}

function testOrder(block: Pick<BlockRow, 'seed_version' | 'block_type'>): readonly string[] {
  try {
    return getDefinition(block.seed_version, 'cabine_primaria', block.block_type).tests.map((test) => test.key);
  } catch {
    return [];
  }
}

/**
 * The pending suggestion each Measurement cell of `block` shows (the newest per cell, as on
 * the nameplate), with its view, in reading order (test, row, column).
 */
export function measurementSuggestions(block: Pick<BlockRow, 'id' | 'seed_version' | 'block_type' | 'sheet'>, pending: readonly SuggestionRow[]): MeasurementSuggestion[] {
  const byCell = new Map<string, { address: CellAddress; suggestion: SuggestionRow }>();
  for (const row of pending) {
    if (row.status !== 'pending') continue;
    const path = safeParsePath(row.target_path);
    if (path === null || path.family !== 'sheet/test/cell' || path.block_id !== block.id) continue;
    const address: CellAddress = { testKey: path.test_key as TestKey, row: path.row, col: path.col };
    const key = `${address.testKey}:${address.row}:${address.col}`;
    const held = byCell.get(key);
    if (held === undefined || row.id > held.suggestion.id) byCell.set(key, { address, suggestion: row });
  }
  const order = testOrder(block);
  const rank = (key: string) => (order.indexOf(key) === -1 ? order.length : order.indexOf(key));
  return [...byCell.values()]
    .sort((a, b) => rank(a.address.testKey) - rank(b.address.testKey) || a.address.row - b.address.row || a.address.col - b.address.col)
    .map(({ address, suggestion }) => ({ address, suggestion, view: suggestionView(storedTestCell(block, address), suggestion, NUMBER_FIELD) }));
}

/** The rows of one table of a test, across the test's tables (the op path's rows), or null. */
function tableRows(block: Pick<BlockRow, 'seed_version' | 'block_type'>, testKey: string, tableKey: string): { from: number; to: number } | null {
  try {
    const test = getDefinition(block.seed_version, 'cabine_primaria', block.block_type).tests.find((t) => t.key === testKey);
    if (test === undefined) return null;
    let offset = 0;
    for (const table of test.tables) {
      if (table.key === tableKey) return { from: offset, to: offset + table.rows.length };
      offset += table.rows.length;
    }
    return null;
  } catch {
    return null;
  }
}

/** The fills of one table the sheet shows as such: a cell in `exclude` (it shows a dictated reading) is not one. */
function tableFills(
  block: Pick<BlockRow, 'id' | 'seed_version' | 'block_type' | 'sheet'>,
  pending: readonly SuggestionRow[],
  testKey: string,
  tableKey: string,
  exclude: readonly CellAddress[],
): MeasurementSuggestion[] {
  const rows = tableRows(block, testKey, tableKey);
  if (rows === null) return [];
  const excluded = (address: CellAddress) => exclude.some((cell) => cell.testKey === address.testKey && cell.row === address.row && cell.col === address.col);
  return measurementSuggestions(block, pending).filter(
    (entry) => entry.address.testKey === testKey && entry.address.row >= rows.from && entry.address.row < rows.to && entry.view === 'fill' && !excluded(entry.address),
  );
}

/**
 * A table's "Confirmar todos": every `suggested` fill of its cells, in reading order. A
 * `verify` fill (its own tap) and a replace (the engineer's value is kept) are skipped, and so
 * is a cell in `exclude` (E9-Q1: a cell that shows a dictated reading, whose display fill the
 * sheet does not draw, so the count and the batch match what the table shows).
 */
export function measurementConfirmAllCandidates(
  block: Pick<BlockRow, 'id' | 'seed_version' | 'block_type' | 'sheet'>,
  pending: readonly SuggestionRow[],
  testKey: string,
  tableKey: string,
  exclude: readonly CellAddress[] = [],
): SuggestionRow[] {
  return tableFills(block, pending, testKey, tableKey, exclude)
    .filter((entry) => entry.suggestion.trust === 'suggested')
    .map((entry) => entry.suggestion);
}

/** The `verify` fills of one table, which its "Confirmar todos" leaves for their own tap (a cell in `exclude` is not counted). */
export function measurementTableVerifyCount(
  block: Pick<BlockRow, 'id' | 'seed_version' | 'block_type' | 'sheet'>,
  pending: readonly SuggestionRow[],
  testKey: string,
  tableKey: string,
  exclude: readonly CellAddress[] = [],
): number {
  return tableFills(block, pending, testKey, tableKey, exclude).filter((entry) => entry.suggestion.trust === 'verify').length;
}

export interface MismatchPart {
  text: string;
  /** The value a tap keeps: the display's (confirms the reading) or the typed one (drops the reading). */
  pick?: 'visor' | 'typed';
}

function numberText(value: unknown): string {
  const number = numberShape(value);
  if (number === null) return typeof value === 'string' ? value : '';
  if (number.state === 'not_measured') return '-';
  const shown = formatDecimalGroupedPtBr(number.raw);
  return number.unit === null ? shown : `${shown} ${number.unit}`;
}

/** The separator `text` holds between the two lines of a mismatch ("… GΩ · digitado …"). */
export const MISMATCH_LINE_SEP = ' · ';

/**
 * EXPERIENCE.md › Measurement readings: a display reading that disagrees with what was typed,
 * "Visor: 147 GΩ · digitado 14,7 GΩ — Conferir", the two values being the parts a tap picks.
 * Review fixes 2026-10-06 (F-22): `lines` draws it as two lines on purpose, "Visor: 147 GΩ"
 * then "digitado 14,7 GΩ — Conferir" (`MISMATCH_LINE_SEP` between them), where one line
 * wrapped inside the cell; `text` stays the one-line reading.
 */
export function displayMismatchText(cellValue: unknown, s: Pick<SuggestionRow, 'value'>): { text: string; parts: MismatchPart[]; lines: MismatchPart[][] } {
  const visor: MismatchPart[] = [{ text: 'Visor: ' }, { text: numberText(s.value), pick: 'visor' }];
  const typed: MismatchPart[] = [{ text: 'digitado ' }, { text: numberText(cellValue), pick: 'typed' }, { text: ' — Conferir' }];
  const parts: MismatchPart[] = [visor[0]!, visor[1]!, { text: `${MISMATCH_LINE_SEP}${typed[0]!.text}` }, typed[1]!, typed[2]!];
  return { text: parts.map((part) => part.text).join(''), parts, lines: [visor, typed] };
}

// --- the burst ---------------------------------------------------------------------------

/** One row a "Ler visor" burst shoots: the first capture cell of a Measurement row. */
export interface DisplayBurstStop {
  testKey: TestKey;
  tableKey: string;
  /** The op path's row, across the test's tables. */
  row: number;
  /** The row's first capture column. */
  col: number;
  /** The table's title, else its test's ("Seccionadora contato aberto", "Ensaio de isolação"). */
  tableTitle: string;
  /** The row's name ("T1", "Fase A"). */
  rowLabel: string;
}

/** Every row of the sheet's enabled tests a burst walks, in sheet order (tests, tables, rows). */
export function displayBurstStops(block: BlockRow, definition: BlockDefinition): DisplayBurstStop[] {
  const out: DisplayBurstStop[] = [];
  for (const test of evaluateSheetReadings(block, definition)) {
    for (const table of test.tables) {
      const capture = table.columns.find((column) => column.role === 'capture');
      if (capture === undefined) continue;
      for (const row of table.rows) {
        out.push({ testKey: test.testKey, tableKey: table.key, row: row.row, col: capture.col, tableTitle: table.title ?? test.title, rowLabel: row.label });
      }
    }
  }
  return out;
}

type DisplayPhotoLike = Pick<PhotoFileRow, 'reading_kind' | 'reading_target'> & { removed_at?: string | null };

/**
 * Where a burst opened on one table starts: the table's first row that no live display photo
 * of the block targets yet (a typed row still gets its evidence shot, so typing does not
 * skip it), else the table's first row; 0 when the table is not among the stops.
 */
export function displayBurstStart(stops: readonly DisplayBurstStop[], photos: readonly DisplayPhotoLike[], blockId: string, testKey: string, tableKey: string): number {
  const targeted = new Set<string>();
  for (const photo of photos) {
    if ((photo.removed_at ?? null) !== null || photo.reading_kind !== 'display') continue;
    const target = displayCellTargetSchema.safeParse(photo.reading_target);
    if (target.success && target.data.block_id === blockId) targeted.add(`${target.data.table_key}:${target.data.start_cell.row}`);
  }
  const inTable = stops.flatMap((stop, index) => (stop.testKey === testKey && stop.tableKey === tableKey ? [index] : []));
  const free = inTable.find((index) => !targeted.has(`${testKey}:${stops[index]!.row}`));
  return free ?? inTable[0] ?? 0;
}

/** The stop of the burst's `shot`-th shot (0-based) from `start`; null past the sheet's last row. */
export function displayBurstStop(stops: readonly DisplayBurstStop[], start: number, shot: number): DisplayBurstStop | null {
  return stops[start + shot] ?? null;
}

/** The viewfinder's hint: "Próxima leitura: Seccionadora contato aberto · T1", "Nada mais a ler nesta ficha" past the last row. */
export function displayBurstHintText(stop: DisplayBurstStop | null): string {
  if (stop === null) return 'Nada mais a ler nesta ficha';
  return `Próxima leitura: ${screenLabel(stop.tableTitle)} · ${screenLabel(stop.rowLabel)}`;
}

/**
 * Where a display photo's reading stands on the cell it starts at: queued (no signal yet),
 * running, or (Story 13.5, WAIT-2) failed while the cell it targets is still empty.
 */
export type DisplayQueuedState = 'queued' | 'running' | 'failed';

/** One display photo's line on its target: its state and the photo (the line's "Cancelar" and "Tentar novamente" act on it). */
export interface DisplayQueuedEntry {
  state: DisplayQueuedState;
  photoId: string;
}

type DisplayReadingPhoto = DisplayPhotoLike & Pick<PhotoFileRow, 'id' | 'reading_status'>;

/** The entry of one display photo, or null while its reading neither waits nor failed. */
function displayEntryOf(photo: DisplayReadingPhoto): DisplayQueuedEntry | null {
  if ((photo.removed_at ?? null) !== null || photo.reading_kind !== 'display') return null;
  const status = photo.reading_status;
  if (status !== 'queued' && status !== 'running' && status !== 'failed') return null;
  return { state: status, photoId: photo.id };
}

/** A waiting reading wins over a failed one on the same target (a later shot of the same row). */
function preferred(held: DisplayQueuedEntry | undefined, next: DisplayQueuedEntry): DisplayQueuedEntry {
  if (held === undefined) return next;
  return held.state !== 'failed' && next.state === 'failed' ? held : next;
}

/**
 * Story 13.5 (WAIT-2): whether a display photo's line shows on a target holding `value`. A
 * waiting reading always shows; a failed one only while the target is empty (a typed value
 * hides it: the engineer already did what the failure asks).
 */
export function displayLineShown(entry: DisplayQueuedEntry, value: unknown): boolean {
  if (entry.state !== 'failed') return true;
  return !isCellFilled(value === null || value === undefined ? null : ({ value } as Cell));
}

/**
 * The start cells of `blockId` whose display photo is still waiting for its reading: each
 * shows "Foto guardada — leitura quando houver sinal" (or "Lendo…") and stays typeable. With
 * the block's sheet (`block`), a failed reading is listed too while its start cell is empty
 * (Story 13.5); without it, never.
 */
export function displayQueuedCells(
  photos: readonly DisplayReadingPhoto[],
  blockId: string,
  block?: Pick<BlockRow, 'sheet'>,
): (DisplayQueuedEntry & { address: CellAddress })[] {
  const out = new Map<string, DisplayQueuedEntry & { address: CellAddress }>();
  for (const photo of photos) {
    const entry = displayEntryOf(photo);
    if (entry === null) continue;
    const target = displayCellTargetSchema.safeParse(photo.reading_target);
    if (!target.success || target.data.block_id !== blockId) continue;
    const address: CellAddress = { testKey: target.data.table_key as TestKey, row: target.data.start_cell.row, col: target.data.start_cell.col };
    if (entry.state === 'failed' && (block === undefined || !displayLineShown(entry, storedTestCell(block, address)?.value ?? null))) continue;
    const key = `${address.testKey}:${address.row}:${address.col}`;
    out.set(key, { ...preferred(out.get(key), entry), address });
  }
  return [...out.values()];
}

/**
 * The line of a cabine's thermo-hygrometer photo still waiting, or failed, or null. A failed
 * one shows only under an empty environment field (`displayLineShown` with the field's value).
 */
export function displayQueuedEnv(photos: readonly DisplayReadingPhoto[], locationId: string): DisplayQueuedEntry | null {
  let held: DisplayQueuedEntry | undefined;
  for (const photo of photos) {
    const entry = displayEntryOf(photo);
    if (entry === null) continue;
    const target = photo.reading_target as { location_id?: unknown } | null;
    if (target !== null && typeof target === 'object' && target.location_id === locationId) held = preferred(held, entry);
  }
  return held ?? null;
}
