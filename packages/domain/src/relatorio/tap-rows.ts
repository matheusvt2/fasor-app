import { formatDecimalGroupedPtBr, isNotApplicableNumber, NOT_APPLICABLE_TEXT, readNumberListRaw } from '../parse/pt-br-number.ts';
import type { BlockRow } from '../schemas/entities.ts';
import type { BlockDefinition, FieldDef, TableDef } from '../seed/schema.ts';
import { plural } from '../text/plural.ts';
import { isCellFilled } from './sheet-state.ts';

/*
 * Story 23.8 (seed v13, decision K's TTR clause; Base rev08 TR-OL-04 and TR-SE-04): the rows of a
 * table whose seed names `rows_from` (the transformer's ratio table, from its TAPS), one per tap
 * of the plate's list, in plate order. THE one rule of those rows: `evaluateTable` builds the
 * table from it, `assertCellGeometry` accepts exactly its plate rows, the run and the print read
 * the evaluation it shapes.
 *
 * - A row is keyed by its tap in whole V (13,8 kV is row 13800): a reading stays on its tap when
 *   the list is reordered or a tap leaves it, and never collides with the pre-TAPS row 0.
 * - TAP Nº is the tap's 1-based position on the plate; V PRIMÁRIO reads the tap, V SECUNDÁRIO
 *   the plate's BT (each typed value still wins).
 * - The current tap (the first row equal to the field that picks from the list, TAP ATUAL) and
 *   the two extremes are marked: their captures are required. An unmarked row requires nothing
 *   and reads "Não medido" until filled.
 * - A stored row the plate no longer lists (a tap that left TAPS, or row 0 typed before TAPS was
 *   filled) stays after the plate rows with its readings, flagged off the plate: judged and
 *   printed, never missing. The fold refuses every write to it (`tapRowAccepted`), so a reading
 *   typed offline on a tap another device removed from TAPS is rejected when it syncs.
 * - With the list empty or unreadable the seeded rows stand, as on v12.
 */

/** A marked row's word mark: the current tap, or an extreme of the list. */
export type TapMark = 'atual' | 'extremo';

/** What a row of a `rows_from` table is. */
export type TapRowKind = 'tap' | 'seeded' | 'off_plate';

export interface TapRowPlan {
  /** The row's stored index (the op path's `row`): a tap's volts, a seeded row's index. */
  row: number;
  /** `tap`: on the plate's list; `seeded`: the seed's own row while the list is empty; `off_plate`: a stored row the plate no longer lists. */
  kind: TapRowKind;
  /** 1-based position on the plate's list; null off it. */
  position: number | null;
  /** The tap in V; null for a seeded row and for row 0. */
  volts: number | null;
  /** The tap as the list field holds it, in that field's unit ("13.8"); null where `volts` is. */
  raw: string | null;
  mark: TapMark | null;
}

/** What `EvaluatedRow.tap` carries for a row of a `rows_from` table (null on every other row, every row of v1 to v12). */
export interface EvaluatedTap {
  /** 1-based position on the plate's list; null off it. */
  position: number | null;
  /** The tap in V; null for row 0 typed before the list. */
  volts: number | null;
  mark: TapMark | null;
  /** False for a stored row the plate no longer lists ("Fora da placa"). */
  onPlate: boolean;
  /** How the row is named: its position ("3"), or off the plate its tap ("13,2 kV"); null for row 0 typed before the list. */
  name: string | null;
}

/** The unit factor of a list in V or kV; null for another unit, whose rows cannot be keyed in volts. */
const VOLTS_PER_UNIT: Readonly<Record<string, number>> = { V: 1, kV: 1000 };

/** A positive dot-decimal value of `unit` in whole volts, or null when it is not one. */
function wholeVolts(raw: string, unit: string): number | null {
  const factor = VOLTS_PER_UNIT[unit];
  if (factor === undefined) return null;
  const volts = Math.round(Number(raw) * factor * 1000) / 1000;
  return Number.isInteger(volts) && volts > 0 ? volts : null;
}

/** A measured number cell's raw, or null. */
function measuredRaw(value: unknown): string | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as { raw?: unknown; state?: unknown };
  return v.state === 'measured' && typeof v.raw === 'string' ? v.raw : null;
}

/** The `list` field a table's rows come from, when the definition holds it in V or kV. */
function listFieldOf(definition: Pick<BlockDefinition, 'nameplate'>, table: Pick<TableDef, 'rows_from'>): FieldDef | null {
  if (table.rows_from === undefined) return null;
  const field = definition.nameplate.find((candidate) => candidate.key === table.rows_from);
  return field !== undefined && field.list === true && field.unit !== undefined && VOLTS_PER_UNIT[field.unit] !== undefined ? field : null;
}

/**
 * The taps a `list` field in V or kV holds, in plate order, each with its raw and volts: THE one
 * reading of the list, for the TTR's rows and the TAP ATUAL picker alike. Null when the list is
 * empty or unreadable, or an entry is not whole in V or repeats another (a list stored by another
 * device or a reading, never through the typed parse that refuses it).
 */
function listTaps(block: Pick<BlockRow, 'sheet'>, field: FieldDef): { raw: string; volts: number }[] | null {
  const entries = readNumberListRaw(measuredRaw(block.sheet.nameplate[field.key]?.value));
  if (entries === null) return null;
  const taps: { raw: string; volts: number }[] = [];
  for (const raw of entries) {
    const volts = wholeVolts(raw, field.unit!);
    if (volts === null || taps.some((tap) => tap.volts === volts)) return null;
    taps.push({ raw, volts });
  }
  return taps;
}

/** The plate's taps of a `rows_from` table, in plate order, each with its raw and volts; null when the list is empty or unreadable. */
export function plateTaps(block: Pick<BlockRow, 'sheet'>, definition: Pick<BlockDefinition, 'nameplate'>, table: Pick<TableDef, 'rows_from'>): { raw: string; volts: number }[] | null {
  const field = listFieldOf(definition, table);
  return field === null ? null : listTaps(block, field);
}

/**
 * Story 23.7: the values a `pick_from` field picks from (TAP ATUAL from TAPS), in plate order; null
 * when that list is empty or unreadable, read as the TTR reads its rows (`listTaps`), so the
 * picker never lists taps the table does not show.
 */
export function plateTapsOfField(block: Pick<BlockRow, 'sheet'>, definition: Pick<BlockDefinition, 'nameplate'>, field: Pick<FieldDef, 'pick_from'>): { raw: string }[] | null {
  if (field.pick_from === undefined) return null;
  const list = definition.nameplate.find((candidate) => candidate.key === field.pick_from);
  if (list === undefined || list.list !== true || list.unit === undefined || VOLTS_PER_UNIT[list.unit] === undefined) return null;
  return listTaps(block, list)?.map((tap) => ({ raw: tap.raw })) ?? null;
}

/** One option of the TAP ATUAL picker: the tap's 1-based position as its key, its text, and the raw a pick commits (null for a stored value off the list and for "N/A"). */
export interface TapPickerOption {
  key: string;
  label: string;
  raw: string | null;
}

/** The picker's key of "N/A", the not-applicable value every plate number field takes (Story 16.4). */
export const TAP_PICKER_NOT_APPLICABLE_KEY = 'nao_aplicavel';

/**
 * Story 23.7: the picker of a `pick_from` field (TAP ATUAL): one option per tap of its list in plate
 * order ("3 — 12,6 kV"), a stored value the list no longer holds kept readable as an option of its
 * own, "N/A" last where the field takes it (or holds it), and the option the stored value selects;
 * null while the list is empty or unreadable (the field is then a plain number field).
 */
export function tapPickerOf(
  block: Pick<BlockRow, 'sheet'>,
  definition: Pick<BlockDefinition, 'nameplate'>,
  field: Pick<FieldDef, 'key' | 'pick_from' | 'unit'>,
  options: { acceptsNotApplicable?: boolean } = {},
): { options: TapPickerOption[]; selectedKey: string | null } | null {
  const taps = plateTapsOfField(block, definition, field);
  if (taps === null) return null;
  const unit = field.unit ?? null;
  const value = block.sheet.nameplate[field.key]?.value;
  const raw = measuredRaw(value);
  const stored = raw !== null && /^\d+(\.\d+)?$/.test(raw) ? raw : null;
  const at = stored === null ? -1 : taps.findIndex((tap) => Number(tap.raw) === Number(stored));
  const out: TapPickerOption[] = taps.map((tap, i) => ({ key: String(i + 1), label: tapOptionText(i + 1, formatDecimalGroupedPtBr(tap.raw), unit), raw: tap.raw }));
  if (stored !== null && at === -1) out.push({ key: OFF_LIST_KEY, label: unit === null ? formatDecimalGroupedPtBr(stored) : `${formatDecimalGroupedPtBr(stored)} ${unit}`, raw: null });
  const notApplicable = isNotApplicableNumber(value);
  if (notApplicable || options.acceptsNotApplicable === true) out.push({ key: TAP_PICKER_NOT_APPLICABLE_KEY, label: NOT_APPLICABLE_TEXT, raw: null });
  return { options: out, selectedKey: notApplicable ? TAP_PICKER_NOT_APPLICABLE_KEY : stored === null ? null : at === -1 ? OFF_LIST_KEY : String(at + 1) };
}

/** The picker's key of a stored value its list does not hold. */
const OFF_LIST_KEY = 'fora_da_lista';

/** The current tap in V: the measured value of the field that picks from the table's list (TAP ATUAL), or null. */
function currentTapVolts(block: Pick<BlockRow, 'sheet'>, definition: Pick<BlockDefinition, 'nameplate'>, list: FieldDef): number | null {
  const picker = definition.nameplate.find((candidate) => candidate.pick_from === list.key);
  if (picker === undefined || picker.unit === undefined) return null;
  const raw = measuredRaw(block.sheet.nameplate[picker.key]?.value);
  return raw === null || !/^\d+(\.\d+)?$/.test(raw) ? null : wholeVolts(raw, picker.unit);
}

/** The rows a test entry stores that hold a filled cell, by index, ascending. */
function storedRows(block: Pick<BlockRow, 'sheet'>, testKey: string): number[] {
  const cells = block.sheet.test[testKey]?.cells ?? {};
  return Object.entries(cells)
    .filter(([key, row]) => /^\d+$/.test(key) && Object.values(row).some((cell) => isCellFilled(cell)))
    .map(([key]) => Number(key))
    .sort((a, b) => a - b);
}

/**
 * The rows of a `rows_from` table on this sheet, in the order the table shows them: the plate's
 * taps (or, with the list empty, the seed's rows), then the stored rows the plate no longer
 * lists. Null for a table without `rows_from` and for one whose list is empty and holds no such
 * row: the seeded rows stand exactly as on v12.
 */
export function tapRowsOf(block: Pick<BlockRow, 'sheet'>, definition: Pick<BlockDefinition, 'nameplate'>, table: Pick<TableDef, 'rows_from' | 'rows'>, testKey: string): TapRowPlan[] | null {
  const list = listFieldOf(definition, table);
  if (list === null) return null;
  const taps = plateTaps(block, definition, table);
  let base: TapRowPlan[];
  if (taps === null) {
    base = table.rows.map((_, row): TapRowPlan => ({ row, kind: 'seeded', position: null, volts: null, raw: null, mark: null }));
  } else {
    const current = currentTapVolts(block, definition, list);
    const atual = current === null ? -1 : taps.findIndex((tap) => tap.volts === current);
    base = taps.map((tap, i): TapRowPlan => ({
      row: tap.volts,
      kind: 'tap',
      position: i + 1,
      volts: tap.volts,
      raw: tap.raw,
      mark: i === atual ? 'atual' : i === 0 || i === taps.length - 1 ? 'extremo' : null,
    }));
  }
  const shown = new Set(base.map((entry) => entry.row));
  const off = storedRows(block, testKey)
    .filter((row) => !shown.has(row))
    .map((row): TapRowPlan => {
      // Row 0 is the seed's typed row, a reading taken before the list; any other index is a tap in V.
      const volts = row === 0 ? null : row;
      return { row, kind: 'off_plate', position: null, volts, raw: volts === null ? null : String(volts / VOLTS_PER_UNIT[list.unit!]!), mark: null };
    });
  if (taps === null && off.length === 0) return null;
  return [...base, ...off];
}

/** Whether the fold accepts a cell write on `row` of a `rows_from` table: a tap of the block's current list in V, or, the list empty, a seeded row. */
export function tapRowAccepted(block: Pick<BlockRow, 'sheet'>, definition: Pick<BlockDefinition, 'nameplate'>, table: Pick<TableDef, 'rows_from' | 'rows'>, row: number): boolean {
  const taps = plateTaps(block, definition, table);
  return taps === null ? row < table.rows.length : taps.some((tap) => tap.volts === row);
}

/** What a plan entry's evaluated row carries (null for a seeded row, which is v12's own); `unit` is the list field's. */
export function evaluatedTapOf(entry: TapRowPlan, unit: string | null): EvaluatedTap | null {
  if (entry.kind === 'seeded') return null;
  const value = entry.raw === null ? null : unit === null || unit === '' ? formatDecimalGroupedPtBr(entry.raw) : `${formatDecimalGroupedPtBr(entry.raw)} ${unit}`;
  return { position: entry.position, volts: entry.volts, mark: entry.mark, onPlate: entry.kind === 'tap', name: entry.position === null ? value : String(entry.position) };
}

// authored (Story 23.8, listed for Bruno): a tap row's name, the mock's card "Tap 1" (`60-ficha.html` #/ficha/TR1); off the plate "Tap 13,2 kV".
/** A tap row's name on screen and in its cells' accessible names: "Tap 3", "Tap 13,2 kV"; '' for row 0 typed before the list. */
export function tapRowLabel(tap: EvaluatedTap): string {
  return tap.name === null ? '' : `Tap ${tap.name}`;
}

/** A failed tap row as the conclusion and the parecer name it ("TAP 3", "TAP 13,2 kV"), or "TAP" for row 0. */
export function tapFailedRowLabel(tap: EvaluatedTap): string {
  return tap.name === null ? 'TAP' : `TAP ${tap.name}`;
}

/**
 * Whether a cell of a row is typed on the sheet: every cell of a v12 row; on a tap row its
 * captures (V PRIMÁRIO and V SECUNDÁRIO come from the plate, drawn as text); on a row off the
 * plate nothing (the fold refuses it). The run walks these cells only.
 */
export function tapCellTyped(row: { tap: EvaluatedTap | null }, cell: { role: 'capture' | 'input' }): boolean {
  if (row.tap === null) return true;
  return row.tap.onPlate && cell.role === 'capture';
}

/** Whether a row's empty captures are required: every v12 row, a marked tap row; never an unmarked or off-plate one. */
export function tapRowRequired(row: { tap: EvaluatedTap | null }): boolean {
  return row.tap === null || (row.tap.onPlate && row.tap.mark !== null);
}

/** What `tapInputText` reads of a cell. */
interface TapInputCell {
  state: string;
  displayText: string;
  unit: string | null;
  fallback: { text: string } | null;
}

/**
 * Story 23.8: a tap row's V PRIMÁRIO or V SECUNDÁRIO as the sheet draws it, a text (the mock's
 * `td.cell-dim`): its typed value, else the plate's, with the unit ("13,8 kV", "380 V"); "—" with neither.
 */
export function tapInputText(cell: TapInputCell): string {
  const text = cell.state === 'measured' ? cell.displayText : (cell.fallback?.text ?? null);
  if (text === null) return '—';
  return cell.unit === null || cell.unit === '' ? text : `${text} ${cell.unit}`;
}

// --- the texts -------------------------------------------------------------------------------

// authored (Story 23.8, listed for Bruno): the marks of the TTR's tap rows. "Atual" and "Extremo" are
// the mock's (`60-ficha.html` #/ficha/TR1); "Fora da placa", a row whose tap left TAPS, is this story's.
const TAP_MARK_TEXT: Readonly<Record<TapMark, string>> = { atual: 'Atual', extremo: 'Extremo' };
export const TAP_OFF_PLATE_TEXT = 'Fora da placa';

/** The word mark a tap row shows: "Atual", "Extremo", "Fora da placa"; null for an unmarked row on the plate and for a v12 row. */
export function tapMarkText(tap: EvaluatedTap | null): string | null {
  if (tap === null) return null;
  if (!tap.onPlate) return TAP_OFF_PLATE_TEXT;
  return tap.mark === null ? null : TAP_MARK_TEXT[tap.mark];
}

/** The line above a tap table: "Taps da placa" with the count in bold, then what to measure (`60-ficha.html` #/ficha/TR1 `.v13-line`). */
export interface TapsLine {
  label: string;
  count: string;
  note: string;
}

// authored (Story 23.1's frame, built by Story 23.8): the TTR's tap line.
/** "Taps da placa 5 · medir o tap atual e os extremos (marcados) · os outros são opcionais". */
export function tapsLine(n: number): TapsLine {
  return { label: 'Taps da placa', count: String(n), note: 'medir o tap atual e os extremos (marcados) · os outros são opcionais' };
}

/** `tapsLine` as one sentence, for a reader that draws no bold. */
export function tapsLineText(n: number): string {
  const line = tapsLine(n);
  return `${line.label} ${line.count} · ${line.note}`;
}

// authored (Story 23.1's frame, built by Story 23.7): the helper under the TAPS field.
/** The helper under a `list` field: "Na ordem da placa · 5 taps" for a stored list, "Na ordem da placa" while it holds none. */
export function tapsHelperText(value: unknown): string {
  const entries = readNumberListRaw(measuredRaw(value));
  return entries === null ? 'Na ordem da placa' : `Na ordem da placa · ${plural(entries.length, 'tap', 'taps')}`;
}

// authored (Story 23.1's frame "3 — 12,6 kV", built by Story 23.7): an option of the TAP ATUAL picker.
/** "3 — 12,6 kV": a tap's position and value, as the TAP ATUAL picker lists it. */
export function tapOptionText(position: number, valueText: string, unit: string | null): string {
  return unit === null || unit === '' ? `${position} — ${valueText}` : `${position} — ${valueText} ${unit}`;
}
