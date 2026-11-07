import { formatDateOfInstant } from '../format/datetime.ts';
import { formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import { evaluateSheetMeasurements, measurementCells } from '../relatorio/measurement-evaluation.ts';
import { isReadingValue, overRangeText } from '../relatorio/over-range.ts';
import { evaluatedCells, evaluateSheetReadings } from '../relatorio/readings.ts';
import { isEquipmentBlock } from '../relatorio/sheet-state.ts';
import type { BlockRow, EquipmentRow, LastResults } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { findDefinition } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';

/*
 * Story 22.12 (contract 32, AD-25's second projection): the readings an issued revision leaves on
 * each equipment row (`equipment/{id}/last_results`), so the next relatório of the obra shows
 * "Anterior: 4,9 GΩ (rev. 1, dd/mm/aaaa)" under each capture cell and its section 9 prints a
 * MANUT. ANTERIOR column. Computed from the frozen snapshot the revision printed, as
 * `last-nameplate.ts` is; the issue job writes one put per entry in the same batch as the
 * revision. A previous value is never copied into a cell and nothing here is an equipment
 * history: only the last issued revision of another relatório (and, on a re-issue of the same
 * relatório, the one before it, `prior`) is ever read.
 *
 * Readings are matched by equipment, test key and row key (the coordinator's reading), never by
 * the op path's indices, so a later seed that moves a row still finds it, and one that renames it
 * finds nothing ("-"). The key is `${testKey}|${rowKey}|${colKey}`:
 * - a seeded test: rowKey `${table.key}:${the seed's connection cells trimmed, joined '/'}`
 *   (`#${index in the table}` when every connection cell is blank, the typed TAP row), colKey the
 *   seed label of a `capture` column;
 * - a measurement test: the row's `key` and the column's `key`, number cells only;
 * - a key met again in one definition takes `~2`, `~3`, ... in definition order.
 * Only `measured` and `over_range` captures of the tests that print are kept (enabled seeded
 * tests; measurement tests switched on and run, on the rows the configuration shows); a block
 * marked not tested, removed or with no equipment gives no entry, and an entry with no reading
 * is not written (the older one stays, as `last_nameplate` does).
 */

export type LastResultsValue = LastResults;
/** One revision's readings, without its `prior`. */
export type PreviousResults = Omit<LastResults, 'prior'>;
export type LastResultReading = LastResults['readings'][string];

export interface LastResultsEntry {
  equipmentId: string;
  value: LastResultsValue;
}

/** One reading cell of a definition and its key. */
export interface ReadingSlot {
  testKey: string;
  /** The op path's `row` and `col` (`reading-cells.ts` for a seeded test, `measurement-evaluation.ts` for a measurement test). */
  row: number;
  col: number;
  key: string;
}

/** The op-path address of a cell as one string: `${testKey}/${row}/${col}`. */
export function readingAddressKey(address: { testKey: string; row: number; col: number }): string {
  return `${address.testKey}/${address.row}/${address.col}`;
}

/**
 * Every reading cell of a definition, keyed: the capture cells of every seeded test, in table,
 * row and column order, then the number cells of every measurement test (fixed cells left out),
 * whatever the block's configuration or switches.
 */
export function readingSlotsOf(definition: Pick<BlockDefinition, 'tests' | 'measurement_tests'>): ReadingSlot[] {
  const out: ReadingSlot[] = [];
  const seen = new Map<string, number>();
  const push = (testKey: string, row: number, col: number, base: string) => {
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({ testKey, row, col, key: n === 1 ? base : `${base}~${n}` });
  };
  for (const test of definition.tests) {
    let offset = 0;
    for (const table of test.tables) {
      table.rows.forEach((connection, r) => {
        const cells = connection.map((text) => text.trim());
        const rowKey = `${table.key}:${cells.every((text) => text === '') ? `#${r}` : cells.join('/')}`;
        table.value_columns.forEach((column, col) => {
          if (column.role === 'capture') push(test.key, offset + r, col, `${test.key}|${rowKey}|${column.label}`);
        });
      });
      offset += table.rows.length;
    }
  }
  for (const test of definition.measurement_tests ?? []) {
    test.rows.forEach((row, r) => {
      test.columns.forEach((column, col) => {
        const kind = row.kind ?? column.kind;
        if (kind !== 'number' || row.fixed?.[column.key] !== undefined) return;
        push(test.key, r, col, `${test.key}|${row.key}|${column.key}`);
      });
    });
  }
  return out;
}

/** The readings a block holds now, keyed as `readingSlotsOf` keys them; empty for a block with nothing measured. */
export function blockReadings(block: BlockRow, definition: BlockDefinition): Record<string, LastResultReading> {
  const keys = new Map(readingSlotsOf(definition).map((slot) => [readingAddressKey(slot), slot.key]));
  const readings: Record<string, LastResultReading> = {};
  const keep = (address: { testKey: string; row: number; col: number }, state: string, raw: string, unit: string | null) => {
    const key = keys.get(readingAddressKey(address));
    if (key === undefined || !isReadingValue(state)) return;
    readings[key] = { raw, unit, state };
  };
  for (const cell of evaluatedCells(evaluateSheetReadings(block, definition))) {
    if (cell.role === 'capture') keep(cell.address, cell.state, cell.raw, cell.unit);
  }
  for (const cell of measurementCells(evaluateSheetMeasurements(block, definition))) {
    if (cell.kind === 'number') keep(cell.address, cell.state, cell.raw, cell.unit);
  }
  return readings;
}

function strip(entry: LastResults): PreviousResults {
  return {
    relatorio_id: entry.relatorio_id,
    revision_number: entry.revision_number,
    issued_at: entry.issued_at,
    seed_version: entry.seed_version,
    block_type: entry.block_type,
    readings: entry.readings,
  };
}

/**
 * One entry per live equipment block of the snapshot that holds a reading, in snapshot order (one
 * per equipment). The prior chain (Design Notes): writing for relatório X over the snapshot's
 * value E keeps `prior = E === null ? null : E.relatorio_id === X ? E.prior : E` (without its own
 * prior), so a re-issue of X still points at the visit before it.
 */
export function lastResults(snapshot: RelatorioSnapshot, input: { revisionNumber: number; issuedAt: string }): LastResultsEntry[] {
  const out: LastResultsEntry[] = [];
  const done = new Set<string>();
  for (const block of snapshot.blocks) {
    if (block.removed_at !== null || block.equipment_id === null || !isEquipmentBlock(block) || block.not_tested !== null) continue;
    if (done.has(block.equipment_id)) continue;
    const definition = findDefinition(block.seed_version, block.block_type);
    if (definition === null) continue;
    const readings = blockReadings(block, definition);
    if (Object.keys(readings).length === 0) continue;
    done.add(block.equipment_id);
    const existing = snapshot.equipment.find((row) => row.id === block.equipment_id)?.last_results ?? null;
    const prior = existing === null ? null : existing.relatorio_id === snapshot.relatorio.id ? existing.prior : strip(existing);
    out.push({
      equipmentId: block.equipment_id,
      value: {
        relatorio_id: snapshot.relatorio.id,
        revision_number: input.revisionNumber,
        issued_at: input.issuedAt,
        seed_version: block.seed_version,
        block_type: block.block_type,
        readings,
        prior,
      },
    });
  }
  return out;
}

/**
 * The previous visit a sheet of relatório `relatorioId` reads: the equipment's entry when another
 * relatório left it, else (this relatório re-issued) its `prior`; null with none, or when the
 * entry is of another block type than the sheet's (the equipment changed type).
 */
export function previousResultsFor(equipment: Pick<EquipmentRow, 'last_results'> | null | undefined, block: Pick<BlockRow, 'block_type'>, relatorioId: string): PreviousResults | null {
  const top = equipment?.last_results ?? null;
  if (top === null) return null;
  const entry = top.relatorio_id !== relatorioId ? strip(top) : top.prior;
  if (entry === null || entry.block_type !== block.block_type) return null;
  return entry;
}

/** A previous reading as the helper and MANUT. ANTERIOR print it: "4,9 GΩ", "> 2 TΩ". */
export function previousReadingText(reading: LastResultReading): string {
  if (!isReadingValue(reading.state)) return '-';
  if (reading.state === 'over_range') return overRangeText(reading.raw, reading.unit);
  const shown = formatDecimalGroupedPtBr(reading.raw);
  return reading.unit === null || reading.unit === '' ? shown : `${shown} ${reading.unit}`;
}

/** The line under a capture cell: "Anterior: 4,9 GΩ (rev. 1, 05/11/2026)". */
export function previousHelperText(entry: Pick<PreviousResults, 'revision_number' | 'issued_at'>, reading: LastResultReading): string {
  return `Anterior: ${previousReadingText(reading)} (rev. ${entry.revision_number}, ${formatDateOfInstant(entry.issued_at)})`;
}

/** The previous reading of each cell of `definition` the entry holds, by `readingAddressKey`. */
export function previousReadingsByAddress(entry: PreviousResults | null, definition: Pick<BlockDefinition, 'tests' | 'measurement_tests'>): ReadonlyMap<string, LastResultReading> {
  const out = new Map<string, LastResultReading>();
  if (entry === null) return out;
  for (const slot of readingSlotsOf(definition)) {
    const reading = entry.readings[slot.key];
    if (reading !== undefined) out.set(readingAddressKey(slot), reading);
  }
  return out;
}

/**
 * The "Anterior: …" line of every capture cell of a sheet that has a previous value, by
 * `readingAddressKey`; empty with no previous visit (`previousResultsFor`).
 */
export function previousHelpers(
  equipment: Pick<EquipmentRow, 'last_results'> | null | undefined,
  block: Pick<BlockRow, 'block_type'>,
  definition: Pick<BlockDefinition, 'tests' | 'measurement_tests'>,
  relatorioId: string,
): ReadonlyMap<string, string> {
  const entry = previousResultsFor(equipment, block, relatorioId);
  const out = new Map<string, string>();
  if (entry === null) return out;
  for (const [address, reading] of previousReadingsByAddress(entry, definition)) out.set(address, previousHelperText(entry, reading));
  return out;
}

/**
 * The MANUT. ANTERIOR cell of one printed row: the previous values of its cells in column order,
 * joined " · ", "-" for a missing one; "-" alone when the row has none.
 */
export function previousRowText(readings: ReadonlyMap<string, LastResultReading>, addresses: readonly { testKey: string; row: number; col: number }[]): string {
  const texts = addresses.map((address) => {
    const reading = readings.get(readingAddressKey(address));
    return reading === undefined ? null : previousReadingText(reading);
  });
  if (texts.every((text) => text === null)) return '-';
  return texts.map((text) => text ?? '-').join(' · ');
}
