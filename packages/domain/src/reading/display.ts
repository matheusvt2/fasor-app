import type { OcrReadResult, OcrToken } from '../contract/ocr.ts';
import type { NewId } from '../ids.ts';
import { locationEnvPath, sheetTestCellPath } from '../ops/path.ts';
import { canonicalDecimal, INSULATION_UNITS } from '../parse/pt-br-number.ts';
import { isCellFilled } from '../relatorio/sheet-state.ts';
import { suggestionRowSchema, type BlockRow, type Cell, type LocationRow, type SuggestionRow } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import type { ColumnDef, TableDef, TestDef } from '../seed/schema.ts';
import { normalizeBox, unionBox } from './boxes.ts';
import { digitCoverage, inTokenOrder } from './digits.ts';
import { isDisplayCellTarget, type DisplayCellTarget, type DisplayReadingTarget } from './target.ts';

/*
 * Story 9.1 (FR-36/37): the pure core of one display reading. The OCR tokens of an
 * instrument display (`POST /read/display`, `services/ocr/app/display.py`) become values
 * (`displayValues`), each value a pending suggestion on one Measurement cell or one cabine
 * environment field (`buildDisplaySuggestions`). No model runs: the rule below is the whole
 * reading, mirrored by the spike tool (`services/ocr/tools/display_spike.py`).
 *
 * Values: a token holding `/` or `:` is a date or a time and is skipped; in a token with `=`
 * only the text after the last `=` is read, and `I=10.0A` (a head `I`, `1` or `l` then a
 * number and `A`) is the test current, skipped. A number followed by `A`, `V`, `kV`, `Hz`,
 * `s`, `min` or `m`, or preceded by `R` (`R30s`, `R1m`), is an annotation. A number's unit is
 * its suffix in the same token, else the next token when it sits on the same row (vertical
 * overlap) and holds no digit. The recognizer has no Ω or ° glyph, so `displayUnitOf` maps
 * its spellings back (`Gn`, `GO`, `GD` -> GΩ; `UR` -> µΩ; `CC` -> °C; `%UR` -> %).
 *
 * Units (Conflict 1): a unit the display does not print is never inferred from the photo.
 * The printed unit is kept when the column accepts it; otherwise the cell's own stored unit,
 * the previous row's stored unit, else the column's default. A printed unit the column does
 * not take, or a column default on a column of several units (insulation, MΩ/GΩ/TΩ), makes
 * the value `verify`.
 *
 * Trust: `verify` when the value token's confidence is under `DISPLAY_MIN_CONFIDENCE`, when
 * the unit rule says so, or when the value's digits are not the cited tokens' (8.5's
 * `digitCoverage`). `mode = replace` when the cell was filled at emission.
 */

/** A display value read at less than this confidence is flagged "Verificar" (the spike's finding). */
export const DISPLAY_MIN_CONFIDENCE = 0.5;

/** The `prompt_version` of a display suggestion: no model runs, the rule is the kernel's. */
export const DISPLAY_PROMPT_VERSION = 'display-1';

const MICRO_OHM = 'µΩ';
const OHM = 'Ω';

export interface DisplayValue {
  /** Canonical dot-decimal (`1.20` -> `1.2`, `3,42` -> `3.42`). */
  raw: string;
  /** The unit the display prints, mapped (`displayUnitOf`); null when it prints none. */
  unit: string | null;
  /** The value token's confidence. */
  confidence: number;
  /** The value token and, when the unit is its own token, the unit token, in token order. */
  tokens: OcrToken[];
}

const NUMBER = /-?\d+(?:[.,]\d+)?/g;
const ANNOTATION = /^(?:A|V|kV|Hz|s|min|m)$/u;
const ANNOTATION_AFTER = /^(?:A|V|kV|Hz|s|min|m)(?![\p{L}\p{N}])/u;
const TEST_CURRENT_HEAD = /^[I1l]$/;
const TEST_CURRENT_TAIL = /^\s*-?[\d.,]+\s*A/;

const OHM_PREFIX: Readonly<Record<string, string>> = {
  u: MICRO_OHM,
  U: MICRO_OHM,
  'µ': MICRO_OHM,
  'μ': MICRO_OHM,
  m: `m${OHM}`,
  M: `M${OHM}`,
  k: `k${OHM}`,
  K: `k${OHM}`,
  g: `G${OHM}`,
  G: `G${OHM}`,
  t: `T${OHM}`,
  T: `T${OHM}`,
};

/**
 * The unit a display's text spells, as the sheet stores it: `GΩ` read as `GO`, `Gn` or `GD`,
 * `µΩ` read as `UR`; any text with `%` is `%`; `C`, `CC`, `°C` is `°C`. Null for anything else.
 */
export function displayUnitOf(text: string): string | null {
  const t = text.trim();
  const ohm = /^([uU\u00b5\u03bcmMkKgGtT])([\u03a9\u2126OoQDn0R])$/u.exec(t);
  if (ohm !== null) return OHM_PREFIX[ohm[1]!] ?? null;
  if (t.includes('%')) return '%';
  if (/^[\u00b0\u00bao]?[Cc]{1,2}$/u.test(t)) return '\u00b0C';
  return null;
}

function sameRow(a: OcrToken['bbox'], b: OcrToken['bbox']): boolean {
  return Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0;
}

/** Every value a display's tokens show, in reading order (see the rule above). */
export function displayValues(tokens: readonly OcrToken[]): DisplayValue[] {
  const out: DisplayValue[] = [];
  tokens.forEach((token, index) => {
    let text = token.text;
    if (text.includes('/') || text.includes(':')) return;
    const eq = text.lastIndexOf('=');
    if (eq !== -1) {
      const head = text.slice(0, eq).trim();
      const tail = text.slice(eq + 1);
      if (TEST_CURRENT_HEAD.test(head) && TEST_CURRENT_TAIL.test(tail)) return;
      text = tail;
    }
    const matches = [...text.matchAll(NUMBER)];
    matches.forEach((match, m) => {
      const start = match.index;
      const end = start + match[0].length;
      const before = text.slice(0, start);
      const after = text.slice(end, matches[m + 1]?.index ?? text.length);
      if (before.endsWith('R') || ANNOTATION_AFTER.test(after)) return;
      const suffix = after.trim().replace(/^[.,]+/, '').trim();
      const cited: OcrToken[] = [token];
      let unit: string | null = suffix === '' ? null : displayUnitOf(suffix);
      if (suffix === '' && m === matches.length - 1) {
        const next = tokens[index + 1];
        if (next !== undefined && !/\d/.test(next.text) && sameRow(token.bbox, next.bbox)) {
          // "10 A" in two tokens is an annotation too.
          if (ANNOTATION.test(next.text.trim())) return;
          const spelled = displayUnitOf(next.text);
          if (spelled !== null) {
            unit = spelled;
            cited.push(next);
          }
        }
      }
      out.push({ raw: canonicalDecimal(match[0].replace(',', '.')), unit, confidence: token.confidence, tokens: cited });
    });
  });
  return out;
}

// --- the suggestions -------------------------------------------------------------------------

export type DisplayDropReason = 'no_cell' | 'print_column' | 'derived_column' | 'duplicate';

export interface DisplayDrop {
  /** The value as read, with its place in the display ("2:1.8"). */
  key: string;
  reason: DisplayDropReason;
}

export interface BuildDisplaySuggestionsInput {
  relatorioId: string;
  photoId: string;
  runId: string;
  target: DisplayReadingTarget;
  /** The target block (a cell target); null for an environment target. */
  block: Pick<BlockRow, 'id' | 'seed_version' | 'block_type' | 'sheet'> | null;
  /** The target cabine (an environment target); null for a cell target. */
  location: Pick<Extract<LocationRow, { kind: 'cabine' }>, 'id' | 'env'> | null;
  ocr: OcrReadResult;
  /** The width and height of the image the OCR received. */
  image: { width: number; height: number };
  newId: NewId;
}

export interface BuiltDisplaySuggestions {
  /** In the display's reading order. */
  rows: SuggestionRow[];
  dropped: DisplayDrop[];
}

function unitsOf(column: ColumnDef): readonly string[] {
  if (column.unit !== null && INSULATION_UNITS.includes(column.unit)) return INSULATION_UNITS;
  return column.unit === null ? [] : [column.unit];
}

function storedUnit(cell: Cell | undefined): string | null {
  const value = cell?.value;
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null;
  const unit = (value as { unit?: unknown }).unit;
  return typeof unit === 'string' && unit !== '' ? unit : null;
}

/** Conflict 1: the unit a value takes in a cell, and whether it asks for a check. */
function resolveUnit(value: DisplayValue, column: ColumnDef, stored: string | null, previous: string | null): { unit: string | null; verify: boolean } {
  const accepted = unitsOf(column);
  if (value.unit !== null) {
    if (accepted.includes(value.unit)) return { unit: value.unit, verify: false };
    return { unit: stored ?? previous ?? column.unit, verify: true };
  }
  if (stored !== null) return { unit: stored, verify: false };
  if (previous !== null) return { unit: previous, verify: false };
  return { unit: column.unit, verify: accepted.length > 1 };
}

function trustOf(value: DisplayValue, unitVerify: boolean): SuggestionRow['trust'] {
  if (unitVerify || value.confidence < DISPLAY_MIN_CONFIDENCE || !digitCoverage(value.raw, value.tokens)) return 'verify';
  return 'suggested';
}

function dropKey(index: number, value: DisplayValue): string {
  return `${index}:${value.raw}`;
}

interface CellSlot {
  table: TableDef;
  /** The row of the table's first row, across the test's tables. */
  offset: number;
  row: number;
  col: number;
  column: ColumnDef;
}

/** The table holding `row` of `test`, with its offset. */
function tableOf(test: TestDef, row: number): { table: TableDef; offset: number } | null {
  let offset = 0;
  for (const table of test.tables) {
    if (row >= offset && row < offset + table.rows.length) return { table, offset };
    offset += table.rows.length;
  }
  return null;
}

/** Every capture cell of `test` in reading order (table, row, column), as slots. */
function captureSlots(test: TestDef): CellSlot[] {
  const out: CellSlot[] = [];
  let offset = 0;
  for (const table of test.tables) {
    for (let r = 0; r < table.rows.length; r++) {
      table.value_columns.forEach((column, col) => {
        if (column.role === 'capture') out.push({ table, offset, row: offset + r, col, column });
      });
    }
    offset += table.rows.length;
  }
  return out;
}

/**
 * The cells the values go to, in value order (null: dropped with its reason). Several values
 * on a start column that belongs to a `group` of exactly that many columns fill that group's
 * row (a tester's stored 30 s / 1 min / 10 min, Conflict 3: print and derived columns are
 * dropped); otherwise the values walk the test's capture cells from `start_cell`.
 */
function slotsFor(test: TestDef, target: DisplayCellTarget, count: number): ({ slot: CellSlot } | { drop: DisplayDropReason })[] {
  const start = target.start_cell;
  const home = tableOf(test, start.row);
  if (count > 1 && home !== null) {
    const group = home.table.value_columns[start.col]?.group;
    if (group !== undefined) {
      const columns = home.table.value_columns.flatMap((column, col) => (column.group === group ? [{ column, col }] : []));
      if (columns.length === count) {
        return columns.map(({ column, col }) => {
          if (column.role === 'print') return { drop: 'print_column' as const };
          if (column.role === 'derived') return { drop: 'derived_column' as const };
          return { slot: { table: home.table, offset: home.offset, row: start.row, col, column } };
        });
      }
    }
  }
  const slots = captureSlots(test);
  const from = slots.findIndex((slot) => slot.row > start.row || (slot.row === start.row && slot.col >= start.col));
  return Array.from({ length: count }, (_, i) => {
    const slot = from === -1 ? undefined : slots[from + i];
    return slot === undefined ? { drop: 'no_cell' as const } : { slot };
  });
}

function suggestionRow(input: BuildDisplaySuggestionsInput, value: DisplayValue, targetPath: string, stored: { raw: string; unit: string | null }, trust: SuggestionRow['trust'], filled: boolean): SuggestionRow {
  const ordered = inTokenOrder(value.tokens);
  const union = unionBox(ordered.map((token) => token.bbox))!;
  return suggestionRowSchema.parse({
    id: input.newId(),
    relatorio_id: input.relatorioId,
    target_path: targetPath,
    value: { raw: stored.raw, unit: stored.unit, state: 'measured' },
    trust,
    mode: filled ? 'replace' : 'fill',
    source: {
      photo_id: input.photoId,
      bbox: normalizeBox(union, input.image),
      ocr_token_ids: ordered.map((token) => token.id),
      reading_run_id: input.runId,
    },
    status: 'pending',
    prompt_version: DISPLAY_PROMPT_VERSION,
    hint: null,
  });
}

function testOf(block: Pick<BlockRow, 'seed_version' | 'block_type'>, testKey: string): TestDef | null {
  try {
    return getDefinition(block.seed_version, 'cabine_primaria', block.block_type).tests.find((test) => test.key === testKey) ?? null;
  } catch {
    return null;
  }
}

const ENV_FIELD_BY_UNIT: Readonly<Record<string, 'temperature_c' | 'humidity_pct'>> = { '\u00b0C': 'temperature_c', '%': 'humidity_pct' };

/**
 * One display reading's pending suggestions: one per value that finds a cell (a test target)
 * or an environment field (a cabine target: `°C` -> temperature, `%` -> humidity, a second
 * value of either and a value without a unit are dropped). Every value that finds nowhere is
 * dropped with its reason, for the job to log. No value: no suggestion.
 */
export function buildDisplaySuggestions(input: BuildDisplaySuggestionsInput): BuiltDisplaySuggestions {
  const values = displayValues(input.ocr.tokens);
  const rows: SuggestionRow[] = [];
  const dropped: DisplayDrop[] = [];

  if (!isDisplayCellTarget(input.target)) {
    const location = input.location;
    const seen = new Set<string>();
    values.forEach((value, index) => {
      const field = value.unit === null ? undefined : ENV_FIELD_BY_UNIT[value.unit];
      if (location === null || field === undefined) {
        dropped.push({ key: dropKey(index, value), reason: 'no_cell' });
        return;
      }
      if (seen.has(field)) {
        dropped.push({ key: dropKey(index, value), reason: 'duplicate' });
        return;
      }
      seen.add(field);
      const current = location.env[field];
      const filled = current !== null && current.state !== 'empty';
      rows.push(suggestionRow(input, value, locationEnvPath(location.id, field), { raw: value.raw, unit: value.unit }, trustOf(value, false), filled));
    });
    return { rows, dropped };
  }

  const target = input.target;
  const block = input.block;
  const test = block === null ? null : testOf(block, target.table_key);
  if (block === null || test === null) {
    values.forEach((value, index) => dropped.push({ key: dropKey(index, value), reason: 'no_cell' }));
    return { rows, dropped };
  }
  const cells = block.sheet.test[test.key]?.cells ?? {};
  const cellAt = (row: number, col: number): Cell | undefined => cells[String(row)]?.[String(col)];
  const places = slotsFor(test, target, values.length);
  values.forEach((value, index) => {
    const place = places[index]!;
    if ('drop' in place) {
      dropped.push({ key: dropKey(index, value), reason: place.drop });
      return;
    }
    const { slot } = place;
    const stored = cellAt(slot.row, slot.col);
    const previous = slot.row > slot.offset ? storedUnit(cellAt(slot.row - 1, slot.col)) : null;
    const unit = resolveUnit(value, slot.column, storedUnit(stored), previous);
    rows.push(
      suggestionRow(
        input,
        value,
        sheetTestCellPath(block.id, test.key, slot.row, slot.col),
        { raw: value.raw, unit: unit.unit },
        trustOf(value, unit.verify),
        isCellFilled(stored),
      ),
    );
  });
  return { rows, dropped };
}
