import { formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import { evaluateSheetMeasurements, measurementCells } from '../relatorio/measurement-evaluation.ts';
import { isReadingValue, overRangeText } from '../relatorio/over-range.ts';
import { plateCelsiusOf, plateTemperatureFields } from '../relatorio/plate-temperature.ts';
import { correctedText } from '../relatorio/temperature-correction.ts';
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
import { compareVisits, visitDateText } from './visit-date.ts';

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
 *
 * Fix batch e25r (R-1 of the Epic 24 retrospective, contract 49): an entry of a sheet whose
 * definition names a plate temperature (`plateTemperatureFields`) keeps `plate_measured`, the keys
 * of those fields that held a number when it was issued, so the next visit's "like with like" rule
 * (seed v14) still knows the plate after this issue writes the equipment's `last_nameplate` over.
 * An entry without it (written before 49) whose plate is still the equipment's `last_nameplate` is
 * filled from that plate by any issue that writes for the equipment, or that may write its plate
 * over while it writes no entry for it (a sheet marked not tested or with no reading, the two
 * branches that keep a later visit's place).
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
  // Batch e23t (Story 23.15): a measurement cell corrected to 75 °C keeps that value too, which the next visit's history rule reads.
  for (const cell of measurementCells(evaluateSheetMeasurements(block, definition, visit))) {
    if (cell.kind === 'number') keep(cell.address, cell.state, cell.raw, cell.unit, cell.corrected ?? null);
  }
  return readings;
}

/**
 * One entry per live equipment block of the snapshot that holds a reading, in snapshot order (one
 * per equipment). The prior chain (Design Notes): writing for relatório X over the snapshot's
 * value E keeps `prior = E === null ? null : E.relatorio_id === X ? E.prior : E` (without its own
 * prior), so a re-issue of X still points at the visit before it.
 *
 * Fix batch e23w (W2-1, AD-25 order rule): visits are ordered by first issue. `firstIssuedAt` is
 * the instant X was first issued (its earliest revision; `issuedAt` on revision 1). Over a value
 * E of another relatório:
 * - E's `prior` is X (X re-issued after E was issued over it): E stays on top, its `prior`
 *   becomes X's new entry (without prior);
 * - E is unrelated to X, this is a re-issue (revision > 1) and E was issued after X's first
 *   issue: E is a later visit, and nothing is written for that equipment;
 * - otherwise as before (X on top, prior E).
 *
 * Batch e24p (Story 24.15, every seed): each entry keeps its visit's service date (`service_date`:
 * the relatório's `service_end`, else its `service_start`; no key when both are empty), and the
 * visits are ordered by their dates (`compareVisits`) where at least one of the two carries a
 * service date. After the "E's prior is X" rule, over a value E of another relatório:
 * - X's visit is older than E's: X never becomes the top; it is written as E's `prior` when E holds
 *   no prior or an older one (equal dates keep today's order: X, issued now, is the newer), else
 *   nothing is written for that equipment;
 * - X's visit is newer than E's: X on top, prior E, a re-issue included (the dates decide, not the
 *   issue order the e23w skip stands in for);
 * - equal dates, or no service date on either: today's rules, unchanged.
 *
 * Fix batch e25r (R-1, contract 49): `own` keeps `plate_measured` on a definition that names a plate
 * temperature, and every value written passes through `withPlateMeasured` (a top or a prior written
 * before 49 whose plate is the equipment's `last_nameplate` gets the field from it). Where nothing is
 * written for an equipment while this issue may still write its plate over (the date rule's and the
 * e23w rule's skips, a live sheet marked not tested or with no reading), its value is written with the
 * field filled and nothing else changed when that fills anything; else nothing is written, as before.
 */
export function lastResults(snapshot: RelatorioSnapshot, input: { revisionNumber: number; issuedAt: string; firstIssuedAt?: string }): LastResultsEntry[] {
  const out: LastResultsEntry[] = [];
  const done = new Set<string>();
  // Fix batch e25r (D3): an equipment a live sheet binds that writes no entry of its own (marked not tested, or with no reading),
  // with the plate temperature fields of that sheet's definition (the first such sheet's); filled after every sheet is read.
  const unwritten = new Map<string, readonly string[]>();
  // Story 14.6: a company sheet's definition is the version its block references (the snapshot's `equipment_types`).
  const ctx = snapshotDefinitionContext(snapshot);
  // Batch e24p (Story 24.15): the visit's service date, its last day else its first.
  const serviceDate = snapshot.relatorio.setup.service_end ?? snapshot.relatorio.setup.service_start ?? null;
  const equipmentOf = (id: string) => snapshot.equipment.find((row) => row.id === id);
  for (const block of snapshot.blocks) {
    if (block.removed_at !== null || block.equipment_id === null || !isEquipmentBlock(block)) continue;
    if (block.not_tested !== null) {
      // Fix batch e25r (D3): a sheet marked not tested writes no entry, but the issue still writes its plate (`lastNameplates`).
      const definition = blockDefinitionIn(ctx, block);
      if (definition !== null && !unwritten.has(block.equipment_id)) unwritten.set(block.equipment_id, plateTemperatureFields(definition));
      continue;
    }
    if (done.has(block.equipment_id)) continue;
    const definition = blockDefinitionIn(ctx, block);
    if (definition === null) continue;
    const plateFields = plateTemperatureFields(definition);
    const readings = blockReadings(block, definition, visitContextOf(snapshot, block));
    if (Object.keys(readings).length === 0) {
      if (!unwritten.has(block.equipment_id)) unwritten.set(block.equipment_id, plateFields);
      continue;
    }
    done.add(block.equipment_id);
    const equipmentId = block.equipment_id;
    const equipment = equipmentOf(equipmentId);
    const existing = equipment?.last_results ?? null;
    // Fix batch e25r (D3): the equipment's plate as it stands before this issue writes its own over it.
    const plate = equipment?.last_nameplate ?? null;
    const fill = (value: LastResults): LastResults => withPlateMeasured(value, plate, plateFields);
    const own = {
      relatorio_id: snapshot.relatorio.id,
      revision_number: input.revisionNumber,
      issued_at: input.issuedAt,
      ...(serviceDate === null ? {} : { service_date: serviceDate }),
      seed_version: block.seed_version,
      block_type: block.block_type,
      readings,
      // Fix batch e25r (D3): the plate temperatures this sheet holds as numbers, the very cells its judgement read (the
      // nameplate sub-block's switch is not consulted, as `testTemperature` does not consult it); no key on a definition that
      // names none, so every entry of v1 to v12 keeps its bytes.
      ...(plateFields.length === 0 ? {} : { plate_measured: plateFields.filter((key) => plateCelsiusOf(block.sheet.nameplate[key]?.value) !== null) }),
    };
    // Fix batch e25r (D3): where this sheet writes nothing, the existing value with the field filled, when that fills anything.
    const keep = (value: LastResults) => {
      const filled = fill(value);
      if (filled !== value) out.push({ equipmentId, value: filled });
    };
    // Fix batch e23w (W2-1): a later visit on top keeps its place; this one refreshes its prior, or writes nothing.
    if (existing !== null && existing.relatorio_id !== snapshot.relatorio.id && existing.prior?.relatorio_id === snapshot.relatorio.id) {
      out.push({ equipmentId: block.equipment_id, value: fill({ ...existing, prior: own }) });
      continue;
    }
    // Batch e24p (Story 24.15): an older visit never becomes the top; a newer one by date takes it, even on a re-issue.
    const order = existing === null || existing.relatorio_id === snapshot.relatorio.id ? 0 : compareVisits(own, existing);
    if (existing !== null && order < 0) {
      if (existing.prior === null || compareVisits(existing.prior, own) <= 0) out.push({ equipmentId: block.equipment_id, value: fill({ ...existing, prior: own }) });
      else keep(existing);
      continue;
    }
    if (order === 0 && existing !== null && existing.relatorio_id !== snapshot.relatorio.id && input.revisionNumber > 1 && input.firstIssuedAt !== undefined && Date.parse(existing.issued_at) > Date.parse(input.firstIssuedAt)) {
      keep(existing);
      continue;
    }
    const prior = existing === null ? null : existing.relatorio_id === snapshot.relatorio.id ? existing.prior : withoutPrior(existing);
    out.push({ equipmentId: block.equipment_id, value: fill({ ...own, prior }) });
  }
  // Fix batch e25r (D3): an equipment no sheet wrote an entry for, whose plate this issue may still write over: its value with the
  // field filled and nothing else changed, when that fills anything; else nothing, as before.
  for (const [equipmentId, plateFields] of unwritten) {
    if (done.has(equipmentId)) continue;
    const equipment = equipmentOf(equipmentId);
    const existing = equipment?.last_results ?? null;
    if (existing === null) continue;
    const filled = withPlateMeasured(existing, equipment?.last_nameplate ?? null, plateFields);
    if (filled !== existing) out.push({ equipmentId, value: filled });
  }
  return out;
}

/**
 * Fix batch e25r (D3, R-1): `value` with `plate_measured` filled on each of its entries (the top and its
 * `prior`) that lacks it while `plate`, the equipment's `last_nameplate` before this issue writes its own
 * over it, is that entry's own (the same relatório and revision): the keys of `plateFields` (the issuing
 * sheet's definition's, `plateTemperatureFields`: `previousResultsFor` hands an entry only to a sheet of
 * its block type, and the rule asks about that sheet's own keys) that hold a number on that plate
 * (`plateCelsiusOf`). The same object when nothing is filled, and always on a definition that names no
 * plate temperature, so an entry of v1 to v12 keeps its bytes.
 */
function withPlateMeasured(value: LastResults, plate: EquipmentRow['last_nameplate'] | undefined, plateFields: readonly string[]): LastResults {
  if (plate === null || plate === undefined || plateFields.length === 0) return value;
  const { relatorio_id: plateRelatorio, revision_number: plateRevision, fields } = plate;
  const owns = (entry: PreviousResults): boolean => entry.plate_measured === undefined && entry.relatorio_id === plateRelatorio && entry.revision_number === plateRevision;
  const top = owns(value);
  const prior = value.prior !== null && owns(value.prior);
  if (!top && !prior) return value;
  const measured = plateFields.filter((key) => plateCelsiusOf(fields[key]) !== null);
  return {
    ...value,
    ...(top ? { plate_measured: measured } : {}),
    prior: prior && value.prior !== null ? { ...value.prior, plate_measured: measured } : value.prior,
  };
}

/** A previous reading as the helper and MANUT. ANTERIOR print it: "4,9 GΩ", "> 2 TΩ". */
export function previousReadingText(reading: LastResultReading): string {
  if (!isReadingValue(reading.state)) return '-';
  if (reading.state === 'over_range') return overRangeText(reading.raw, reading.unit);
  const shown = formatDecimalGroupedPtBr(reading.raw);
  return reading.unit === null || reading.unit === '' ? shown : `${shown} ${reading.unit}`;
}

/**
 * The line under a capture cell: "Anterior: 4,9 GΩ (rev. 1, 05/11/2026)".
 * Batch e24p (Story 24.15, every seed): the date is the visit's (`visitDateText`: its service date
 * when the entry keeps one, else its issue date, as before).
 * Fix batch e23p (P3, the behaviour pass's F4): with the test's reference temperature (`referenceC`,
 * null for an uncorrected test) and the reading's corrected value, the value the history rule judges
 * by follows the measured one: "Anterior: 12 GΩ, 30 GΩ a 20 °C (rev. 1, 05/11/2026)". A reading with
 * no `corrected` (a v12 visit, an uncorrected test) reads as before.
 */
export function previousHelperText(entry: Pick<PreviousResults, 'revision_number' | 'issued_at'> & Partial<Pick<PreviousResults, 'service_date'>>, reading: LastResultReading, referenceC: number | null = null): string {
  // authored (e23p, listed for Bruno): the previous corrected value beside the measured one.
  const corrected = referenceC === null || reading.corrected === undefined ? '' : `, ${correctedText(reading.corrected.raw, reading.corrected.unit)} a ${referenceC} °C`;
  return `Anterior: ${previousReadingText(reading)}${corrected} (rev. ${entry.revision_number}, ${visitDateText(entry)})`;
}

/** Fix batch e23p (P3): a test's reference temperature by key: a table test's `temperature_correction.to_c`, a measurement test's `winding_correction.to_c`. */
function referenceOf(definition: SlotDefinition, testKey: string): number | null {
  const table = definition.tests.find((test) => test.key === testKey);
  if (table !== undefined) return table.temperature_correction?.to_c ?? null;
  return definition.measurement_tests?.find((test) => test.key === testKey)?.winding_correction?.to_c ?? null;
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
  /** Fix batch e24x (D3): the relatório's own visit date (`relatorioVisitDate`): a later visit is no previous one. */
  visitDate: string | null = null,
): ReadonlyMap<string, string> {
  const entry = previousResultsFor(equipment, block, relatorioId, visitDate);
  const out = new Map<string, string>();
  if (entry === null) return out;
  const rows = block.sheet === undefined ? undefined : { sheet: block.sheet };
  for (const [address, reading] of previousReadingsByAddress(entry, definition, rows)) out.set(address, previousHelperText(entry, reading, referenceOf(definition, address.slice(0, address.indexOf('/')))));
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
