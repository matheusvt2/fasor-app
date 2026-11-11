import { previousResultsFor, type PreviousResults } from '../print/reading-slots.ts';
import { relatorioVisitDate } from '../print/visit-date.ts';
import type { BlockRow, EquipmentRow, LocationRow } from '../schemas/entities.ts';
import { cabineOf } from './cabine.ts';

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
   * Fix batch e24y (Y1, seed v14 `history_needs_like_with_like`): the plate that previous visit issued
   * (the equipment's `last_nameplate`, when it is that visit's: the same relatório and revision), so a
   * reading can tell whether the previous one was corrected from its plate's temperature. Absent when
   * unknown (no plate kept, or the plate of another visit).
   */
  previousPlate?: Readonly<Record<string, unknown>>;
}

/** The context with neither input: what every reader takes when its caller gives none. */
export const NO_VISIT_CONTEXT: VisitContext = Object.freeze({ ambientC: null, previous: null });

/**
 * Fix batch e24y (Y1): true when the previous visit's plate held `key` measured (its TEMPERATURA DO ÓLEO, or DO
 * ENROLAMENTO, typed at that visit); false when it did not; null when that plate is not known.
 */
export function previousPlateMeasured(visit: VisitContext, key: string | undefined): boolean | null {
  if (visit.previousPlate === undefined || key === undefined) return null;
  const value = visit.previousPlate[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value) && (value as { state?: unknown }).state === 'measured';
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
  // Fix batch e24y (Y1): the previous visit's own plate, when the equipment keeps that visit's.
  const plate = equipment?.last_nameplate ?? null;
  const previousPlate = previous !== null && plate !== null && plate.relatorio_id === previous.relatorio_id && plate.revision_number === previous.revision_number ? plate.fields : null;
  const context =
    ambientC === null && previous === null ? NO_VISIT_CONTEXT : Object.freeze({ ambientC, previous, ...(previousPlate === null ? {} : { previousPlate: previousPlate as Readonly<Record<string, unknown>> }) });
  byBlock.set(key, context);
  return context;
}
