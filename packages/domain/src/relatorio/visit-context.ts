import { previousResultsFor, type PreviousResults } from '../print/reading-slots.ts';
import { relatorioVisitDate } from '../print/visit-date.ts';
import type { BlockRow, EquipmentRow, LocationRow } from '../schemas/entities.ts';
import { cabineOf } from './cabine.ts';
import { plateCelsiusOf } from './plate-temperature.ts';

/*
 * Batch e23v (Stories 23.5 and 23.6, seed v13): the two inputs of a sheet's judging that are not on
 * its block. The cabine's ambient temperature stands in for the equipment's own (Story 23.5,
 * decision B), and the previous visit's corrected reading judges the history rule (Story 23.6,
 * decision C); the first lives on the cabine row, the second on the equipment row. Every reader
 * that judges a sheet takes the same `VisitContext`, resolved here, so the Measurement table, the
 * conclusion, the points, the parecer, the progress and the document agree. A definition of v1 to
 * v12 reads neither (no test carries `temperature_correction` or `restriction`), so it judges the
 * same with any context; `NO_VISIT_CONTEXT` is every reader's default.
 */

export interface VisitContext {
  /** The cabine's AMBIENTE DE ENSAIO TEMPERATURA in °C, when measured and a finite number; else null. */
  ambientC: number | null;
  /** The previous visit the sheet reads (`previousResultsFor`), or null. */
  previous: PreviousResults | null;
  /**
   * Fix batch e24y (Y1, seed v14 `history_needs_like_with_like`): what a reading needs to tell whether the
   * previous one was corrected from its plate's temperature. ~~The plate that previous visit issued (the
   * equipment's `last_nameplate`, when it is that visit's), `previousPlate`.~~ Fix batch e25r (R-1 of the
   * Epic 24 retrospective, contract 49; the issue writes `last_nameplate` over with its own plate, so once
   * the relatório itself was issued that plate was "not known" and the rule compared as v13): the plate
   * keys of the previous visit that held a number (`plateCelsiusOf`), from that visit's own
   * `plate_measured`, kept on its `last_results` entry and moved into `prior` with it; else, for an entry
   * written before 49, from the equipment's `last_nameplate` while it is still that visit's (the same
   * relatório and revision). Absent when not known (an entry written before 49 whose plate another issue
   * has since written over).
   */
  previousPlateKeys?: readonly string[];
}

/** The context with neither input: what every reader takes when its caller gives none. */
export const NO_VISIT_CONTEXT: VisitContext = Object.freeze({ ambientC: null, previous: null });

/**
 * Fix batch e24y (Y1): true when the previous visit's plate held `key` measured (its TEMPERATURA DO ÓLEO, or DO
 * ENROLAMENTO, typed at that visit); false when it did not; null when that plate is not known. Fix batch e25r (R-1, E24-A1
 * item 2): measured means a finite number (`plateCelsiusOf`), read from `previousPlateKeys`.
 */
export function previousPlateMeasured(visit: VisitContext, key: string | undefined): boolean | null {
  if (visit.previousPlateKeys === undefined || key === undefined) return null;
  return visit.previousPlateKeys.includes(key);
}

/**
 * Fix batch e25r (D4): the plate keys `previous` typed as numbers: its own `plate_measured` when the
 * entry keeps one; else the keys of `plate` (the equipment's `last_nameplate`) whose cell holds a number,
 * sorted, when that plate is the previous visit's (the same relatório and revision); else null (not known).
 */
function previousPlateKeysOf(previous: PreviousResults, plate: EquipmentRow['last_nameplate'] | undefined): readonly string[] | null {
  if (previous.plate_measured !== undefined) return previous.plate_measured;
  if (plate === null || plate === undefined || plate.relatorio_id !== previous.relatorio_id || plate.revision_number !== previous.revision_number) return null;
  const fields = plate.fields;
  return Object.keys(fields)
    .filter((key) => plateCelsiusOf(fields[key]) !== null)
    .sort();
}

/** The ambient of a cabine row: its `env.temperature_c` when measured and finite. */
function ambientOf(cabine: Extract<LocationRow, { kind: 'cabine' }> | null): number | null {
  const value = cabine?.env.temperature_c ?? null;
  if (value === null || value.state !== 'measured' || !/^-?\d+(\.\d+)?$/.test(value.raw)) return null;
  const celsius = Number(value.raw);
  return Number.isFinite(celsius) ? celsius : null;
}

/** Stand-ins for a missing cabine or equipment row, so the memo below keys on objects only. */
const NO_CABINE = Object.freeze({});
const NO_EQUIPMENT = Object.freeze({});

/** cabine row -> equipment row -> `${relatorio_id}|${block_type}|${visit date}` -> context. */
const MEMO = new WeakMap<object, WeakMap<object, Map<string, VisitContext>>>();

/**
 * The visit context of `block`: the ambient of the cabine above its location (`cabineOf`) and the
 * previous visit of its equipment row (`previousResultsFor`, against the block's relatório). Rows
 * are immutable (every op folds into a new row object), so the same cabine row, equipment row and
 * relatório give the same object, which the evaluation memos key on; a context holding neither
 * input is `NO_VISIT_CONTEXT` itself.
 *
 * Fix batch e24x (D3): with the relatório (`source.relatorio`, a snapshot's), the previous visit is
 * never later than its own visit date (`previousResultsFor`); without it, as before. Every caller that
 * holds the relatório passes it, so the screen, the judgement and the print read the same visit.
 */
export function visitContextOf(
  source: { locations: readonly LocationRow[]; equipment: readonly (Pick<EquipmentRow, 'id' | 'last_results'> & Partial<Pick<EquipmentRow, 'last_nameplate'>>)[]; relatorio?: { setup: { service_start?: string | null; service_end?: string | null } } | null | undefined },
  block: Pick<BlockRow, 'location_id' | 'equipment_id' | 'block_type' | 'relatorio_id'>,
): VisitContext {
  const cabine = cabineOf(source.locations, block.location_id);
  const equipment = block.equipment_id === null ? undefined : source.equipment.find((row) => row.id === block.equipment_id);
  const cabineKey: object = cabine ?? NO_CABINE;
  const equipmentKey: object = equipment ?? NO_EQUIPMENT;
  let byEquipment = MEMO.get(cabineKey);
  if (byEquipment === undefined) {
    byEquipment = new WeakMap();
    MEMO.set(cabineKey, byEquipment);
  }
  let byBlock = byEquipment.get(equipmentKey);
  if (byBlock === undefined) {
    byBlock = new Map();
    byEquipment.set(equipmentKey, byBlock);
  }
  const visitDate = relatorioVisitDate(source.relatorio?.setup);
  const key = `${block.relatorio_id}|${block.block_type}|${visitDate ?? ''}`;
  const hit = byBlock.get(key);
  if (hit !== undefined) return hit;
  const ambientC = ambientOf(cabine);
  const previous = previousResultsFor(equipment, block, block.relatorio_id, visitDate);
  // Fix batch e24y (Y1): ~~the previous visit's own plate, when the equipment keeps that visit's~~. Fix batch e25r (D4): the plate
  // keys the previous visit typed as numbers, from its own entry first, else from the equipment's plate while it is that visit's.
  const previousPlateKeys = previous === null ? null : previousPlateKeysOf(previous, equipment?.last_nameplate);
  const context =
    ambientC === null && previous === null ? NO_VISIT_CONTEXT : Object.freeze({ ambientC, previous, ...(previousPlateKeys === null ? {} : { previousPlateKeys }) });
  byBlock.set(key, context);
  return context;
}
