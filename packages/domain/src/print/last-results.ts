import { formatDateOfInstant } from '../format/datetime.ts';
import { formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import { evaluateSheetMeasurements, measurementCells } from '../relatorio/measurement-evaluation.ts';
import { isReadingValue, overRangeText } from '../relatorio/over-range.ts';
import { evaluatedCells, evaluateSheetReadings } from '../relatorio/readings.ts';
import { isEquipmentBlock } from '../relatorio/sheet-state.ts';
import { NO_VISIT_CONTEXT, visitContextOf, type VisitContext } from '../relatorio/visit-context.ts';
import type { BlockRow, EquipmentRow, LastResults } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, snapshotDefinitionContext } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import {
  previousReadingsByAddress,
  previousResultsFor,
  readingAddressKey,
  readingSlotsOf,
  withoutPrior,
  type LastResultReading,
  type PreviousResults,
  type SlotDefinition,
} from './reading-slots.ts';

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
 * - a key met again in one definition takes `~2`, `~3`, ... in definition order;
 * - seed v13 (Story 23.8): a table whose rows come from the plate (`rows_from`, the TTR), read
 *   with the block, has the block's rows: a tap of the plate or a row off it keyed by its tap in
 *   whole V (`${table.key}:@13800`), so a reading is found again on the same tap at the next visit
 *   whatever its position on the plate; row 0, typed before the list, keeps the seeded key.
 * Only `measured` and `over_range` captures of the tests that print are kept (enabled seeded
 * tests; measurement tests switched on and run, on the rows the configuration shows); a block
 * marked not tested, removed or with no equipment gives no entry, and an entry with no reading
 * is not written (the older one stays, as `last_nameplate` does).
 *
 * Batch e23v (Story 23.6, contract 36): a reading of a v13 test with `temperature_correction`
 * keeps its value corrected to 20 °C as the sheet judged it (`corrected`, under the block's visit
 * context: the cabine's ambient), the value the next visit's history rule compares with; a reading
 * of any other test, every reading of v1 to v12, and one with no temperature carry none.
 */

export type LastResultsValue = LastResults;

// Batch e23v (Story 23.6): the reading keys and the previous-visit lookups live in `reading-slots.ts`
// (no evaluation imported there, so the reading evaluation reads them); re-exported here unchanged.
export {
  previousReadingsByAddress,
  previousResultsFor,
  readingAddressKey,
  readingSlotsOf,
  type LastResultReading,
  type PreviousResults,
  type ReadingSlot,
} from './reading-slots.ts';

export interface LastResultsEntry {
  equipmentId: string;
  value: LastResultsValue;
}

/**
 * The readings a block holds now, keyed as `readingSlotsOf` keys them (its own tap rows included); empty for a block with nothing measured.
 * Batch e23v: under `visit` (the block's visit context), a corrected reading keeps its value at 20 °C.
 */
export function blockReadings(block: BlockRow, definition: BlockDefinition, visit: VisitContext = NO_VISIT_CONTEXT): Record<string, LastResultReading> {
  const keys = new Map(readingSlotsOf(definition, block).map((slot) => [readingAddressKey(slot), slot.key]));
  const readings: Record<string, LastResultReading> = {};
  const keep = (address: { testKey: string; row: number; col: number }, state: string, raw: string, unit: string | null, corrected: { raw: string; unit: string | null } | null = null) => {
    const key = keys.get(readingAddressKey(address));
    if (key === undefined || !isReadingValue(state)) return;
    readings[key] = corrected === null ? { raw, unit, state } : { raw, unit, state, corrected: { raw: corrected.raw, unit: corrected.unit } };
  };
  for (const cell of evaluatedCells(evaluateSheetReadings(block, definition, visit))) {
    if (cell.role === 'capture') keep(cell.address, cell.state, cell.raw, cell.unit, cell.corrected ?? null);
  }
  for (const cell of measurementCells(evaluateSheetMeasurements(block, definition))) {
    if (cell.kind === 'number') keep(cell.address, cell.state, cell.raw, cell.unit);
  }
  return readings;
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
  // Story 14.6: a company sheet's definition is the version its block references (the snapshot's `equipment_types`).
  const ctx = snapshotDefinitionContext(snapshot);
  for (const block of snapshot.blocks) {
    if (block.removed_at !== null || block.equipment_id === null || !isEquipmentBlock(block) || block.not_tested !== null) continue;
    if (done.has(block.equipment_id)) continue;
    const definition = blockDefinitionIn(ctx, block);
    if (definition === null) continue;
    const readings = blockReadings(block, definition, visitContextOf(snapshot, block));
    if (Object.keys(readings).length === 0) continue;
    done.add(block.equipment_id);
    const existing = snapshot.equipment.find((row) => row.id === block.equipment_id)?.last_results ?? null;
    const prior = existing === null ? null : existing.relatorio_id === snapshot.relatorio.id ? existing.prior : withoutPrior(existing);
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

/**
 * The "Anterior: …" line of every capture cell of a sheet that has a previous value, by
 * `readingAddressKey`; empty with no previous visit (`previousResultsFor`). With the block's
 * `sheet`, its tap rows have theirs (Story 23.8).
 */
export function previousHelpers(
  equipment: Pick<EquipmentRow, 'last_results'> | null | undefined,
  block: Pick<BlockRow, 'block_type'> & Partial<Pick<BlockRow, 'sheet'>>,
  definition: SlotDefinition,
  relatorioId: string,
): ReadonlyMap<string, string> {
  const entry = previousResultsFor(equipment, block, relatorioId);
  const out = new Map<string, string>();
  if (entry === null) return out;
  const rows = block.sheet === undefined ? undefined : { sheet: block.sheet };
  for (const [address, reading] of previousReadingsByAddress(entry, definition, rows)) out.set(address, previousHelperText(entry, reading));
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
