import { canonicalDecimal, formatDecimalGroupedPtBr, parseDecimalPtBr } from '../parse/pt-br-number.ts';
import type { BlockRow } from '../schemas/entities.ts';
import type { TableDef, TestDef } from '../seed/schema.ts';
import { TEST_VOLTAGE_OPTIONS_KV } from '../seed/test-voltages.ts';
import { storedInstrumentHeader } from './instrument-pick.ts';
import { DECIMAL, readingLabelText } from './reading-cells.ts';
import { voltsOf } from './reading-evaluation.ts';
import { testParameterVolts } from './test-voltage.ts';

/*
 * Story 22.8 (seed v12; Bruno's item 2, the options and defaults the coordinator's reading): each
 * row of a v12 insulation table carries its own test voltage, a `voltage` column of its table
 * (`seed/v12.ts`), typed through the existing cell put (`sheet/{b}/test/{t}/cell/{row}/{col}`,
 * `{raw, unit: 'kV', state: 'measured'}`). A row's effective voltage is the typed cell, else the
 * row's seeded default (the transformer's SECUNDÁRIO/MASSA starts at 1 kV), else the default its
 * winding's rating gives (`ratingDefaultKv`), else the instrument header's TENSÃO ENSAIO when it
 * is one of the options, else none ("-"). It is never missing and never judged: the criterion
 * stays the test's for every row.
 *
 * 2026-11-07, e22g (Bruno's test base rev03, his answer to the coordinator's reading of Story
 * 22.8): a row with no seeded default whose winding is rated above 600 V starts at 2,5 kV up to
 * 5000 V and at 5 kV above (the transformer's PRIMÁRIO/MASSA and PRIMÁRIO/SECUNDÁRIO from TENSÃO
 * NOMINAL AT); a rating at most 600 V, empty or unreadable gives no default, and the instrument's
 * TENSÃO ENSAIO applies as before. The SECUNDÁRIO/MASSA row keeps its seeded 1 kV.
 *
 * The notice (OQ-1, Bruno's words read over the DoR's 500 V band, listed in the PR): a row whose
 * winding (`voltage_rows[].winding`, a nameplate number field) is rated at most 1000 V warns when
 * its voltage is above 1 kV, suggesting 0,5 or 1 kV; a winding rated above 1000 V, or one whose
 * rating is empty or unparsable, warns of nothing. The notice is on the sheet only and never
 * blocks a save or the conclusion. Tables of v1 to v11 have no voltage column: every reader here
 * answers null on them.
 */

export { TEST_VOLTAGE_OPTIONS_KV };

/** The highest test voltage, in V, a low-voltage winding takes. */
const LOW_VOLTAGE_TEST_LIMIT_V = 1000;
/** The rating, in V, at or under which a winding is a low-voltage one. */
const LOW_VOLTAGE_WINDING_V = 1000;

/** Where a row's effective voltage came from. */
export type RowVoltageSource = 'typed' | 'default';

/** A row's test voltage: its column, the effective kV (dot-decimal) and its pt-BR text, its source and the notice. */
export interface RowTestVoltage {
  /** The voltage column's index in its table's `value_columns` (the cell put's `col`). */
  col: number;
  /** The effective voltage in kV, dot-decimal ("0.5", "10"), or null when none applies. */
  kv: string | null;
  /** The effective voltage as the select and the print show it ("0,5", "10"), "-" when none. */
  text: string;
  source: RowVoltageSource | null;
  /** The screen-only notice when the voltage is above what the row's winding supports, else null. */
  notice: string | null;
}

/** The table holding `row` (counted across the test's tables) and the row's index inside it. */
function tableOfRow(test: TestDef, row: number): { table: TableDef; r: number } | null {
  let offset = 0;
  for (const table of test.tables) {
    if (row >= offset && row < offset + table.rows.length) return { table, r: row - offset };
    offset += table.rows.length;
  }
  return null;
}

/** The index of a table's voltage column, or -1 (every table of v1 to v11). */
export function voltageColumnOf(table: Pick<TableDef, 'value_columns'>): number {
  return table.value_columns.findIndex((column) => column.role === 'voltage');
}

/** The options of the select as dot-decimal kV ("0.5", "1", "2.5", "5", "10"). */
const OPTION_KV: readonly string[] = TEST_VOLTAGE_OPTIONS_KV.map((text) => parseDecimalPtBr(text)!);

/** A dot-decimal kV as the select shows it: "0.5" -> "0,5". */
function kvText(kv: string): string {
  return formatDecimalGroupedPtBr(kv);
}

/** A typed voltage cell's kV (dot-decimal), or null when the cell holds no positive kV. */
function typedKv(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const cell = value as { raw?: unknown; unit?: unknown; state?: unknown };
  if (cell.state !== 'measured' || cell.unit !== 'kV' || typeof cell.raw !== 'string' || !/^\d+(\.\d+)?$/.test(cell.raw)) return null;
  return Number(cell.raw) > 0 ? cell.raw : null;
}

/** The instrument header's TENSÃO ENSAIO in kV when it is one of the options, else null. */
function instrumentKv(block: Pick<BlockRow, 'sheet'>, test: TestDef): string | null {
  const parameter = storedInstrumentHeader(block.sheet.test[test.key]?.instrument?.value)?.test_parameter ?? null;
  const volts = testParameterVolts(parameter);
  if (volts === null) return null;
  const kv = canonicalDecimal(String(volts / 1000));
  return OPTION_KV.includes(kv) ? kv : null;
}

const VOLTAGE_PAIR = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/;

/**
 * A winding's rating in V: the nameplate number (`voltsOf`), or the higher side of a two-level
 * secondary ("380/220", fix batch fxpw G4); null when the cell holds neither. Story 23.2: exported,
 * the rating a v13 criterion table picks its row by (`rowCriterion`).
 */
export function ratedVoltsOf(value: unknown): number | null {
  return ratedVolts(value);
}

function ratedVolts(value: unknown): number | null {
  const single = voltsOf(value);
  if (single !== null) return single;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const cell = value as { raw?: unknown; unit?: unknown; state?: unknown };
  const pair = typeof cell.raw === 'string' && cell.state === 'measured' ? VOLTAGE_PAIR.exec(cell.raw) : null;
  if (pair === null) return null;
  const higher = Math.max(Number(pair[1]), Number(pair[2]));
  if (!(higher > 0)) return null;
  return voltsOf({ raw: String(higher), unit: cell.unit, state: 'measured' });
}

/** A nameplate number cell as its rating reads: "220 V", "380/220 V", "13,8 kV". */
function ratingText(value: unknown): string {
  const cell = value as { raw?: unknown; unit?: unknown };
  const raw = typeof cell.raw === 'string' && (DECIMAL.test(cell.raw) || VOLTAGE_PAIR.test(cell.raw)) ? formatDecimalGroupedPtBr(cell.raw) : '';
  return [raw, typeof cell.unit === 'string' ? cell.unit : ''].filter((part) => part !== '').join(' ');
}

/**
 * The notice of a row tested at `kv` on the winding `winding` names: the text when the winding is
 * rated at most 1000 V and the voltage is above 1 kV; null otherwise (no winding, an empty or
 * unparsable rating, a rating above 1000 V, a voltage at or under 1 kV, no voltage).
 */
export function rowVoltageNotice(block: Pick<BlockRow, 'sheet'>, winding: string | null, kv: string | null, linha: string): string | null {
  if (winding === null || kv === null) return null;
  const cell = block.sheet.nameplate[winding]?.value;
  const rated = ratedVolts(cell);
  if (rated === null || rated > LOW_VOLTAGE_WINDING_V) return null;
  if (Number(kv) * 1000 <= LOW_VOLTAGE_TEST_LIMIT_V) return null;
  // authored (Story 22.8, listed for Bruno): a low-voltage winding tested above what it supports.
  return `Tensão de ensaio acima do suportado pelo enrolamento ${readingLabelText(linha)} (${ratingText(cell)}): use 0,5 ou 1 kV.`;
}

/** The rating, in V, above which a winding's rows start at 2,5 kV (e22g, Bruno's test base rev03). */
const RATING_BAND_LOW_V = 600;
/** The rating, in V, above which they start at 5 kV. */
const RATING_BAND_HIGH_V = 5000;

/**
 * e22g: the default test voltage, in kV (dot-decimal), the winding `winding` names gives its row:
 * "2.5" for a rating above 600 V up to 5000 V, "5" above 5000 V; null with no winding, a rating at
 * most 600 V, or one empty or unparsable (the instrument's TENSÃO ENSAIO then applies).
 */
export function ratingDefaultKv(block: Pick<BlockRow, 'sheet'>, winding: string | null): string | null {
  if (winding === null) return null;
  const rated = ratedVolts(block.sheet.nameplate[winding]?.value);
  if (rated === null || rated <= RATING_BAND_LOW_V) return null;
  return rated <= RATING_BAND_HIGH_V ? '2.5' : '5';
}

/**
 * The test voltage of `row` (counted across the test's tables, the cell put's `row`): null when
 * its table has no voltage column (every table of v1 to v11); else the effective voltage, its
 * source and the notice. Never throws.
 */
export function rowTestVoltage(block: Pick<BlockRow, 'sheet'>, test: TestDef, row: number): RowTestVoltage | null {
  const home = tableOfRow(test, row);
  if (home === null) return null;
  const col = voltageColumnOf(home.table);
  if (col === -1) return null;
  const seeded = home.table.voltage_rows?.[home.r] ?? { default_kv: null, winding: null };
  const typed = typedKv(block.sheet.test[test.key]?.cells[String(row)]?.[String(col)]?.value);
  const rated = seeded.default_kv === null ? ratingDefaultKv(block, seeded.winding) : null;
  const fallback = seeded.default_kv ?? rated ?? instrumentKv(block, test);
  const kv = typed ?? fallback;
  const source: RowVoltageSource | null = typed !== null ? 'typed' : fallback !== null ? 'default' : null;
  const linha = home.table.rows[home.r]?.[0] ?? '';
  // e22g (review loop): a voltage the winding's own rating chose (an AT rated 601 V to 1000 V starts at 2,5 kV) never warns
  // that the winding does not support it; a typed or instrument voltage on that winding still does.
  const notice = typed === null && rated !== null ? null : rowVoltageNotice(block, seeded.winding, kv, linha);
  return { col, kv, text: kv === null ? '-' : kvText(kv), source, notice };
}

/**
 * The stored cell of a voltage the select offers ("0,5" -> `{raw: '0.5', unit: 'kV', state:
 * 'measured'}`), the value the cell put writes; null for a text that is not one of the options.
 */
export function rowVoltageCell(option: string): { raw: string; unit: 'kV'; state: 'measured' } | null {
  if (!(TEST_VOLTAGE_OPTIONS_KV as readonly string[]).includes(option)) return null;
  return { raw: parseDecimalPtBr(option)!, unit: 'kV', state: 'measured' };
}
