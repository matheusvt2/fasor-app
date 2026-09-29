import { safeParsePath } from '../ops/path.ts';
import type { Cell, LocationRow, SuggestionRow } from '../schemas/entities.ts';
import { NUMBER_FIELD } from './measurement-suggestions.ts';
import { suggestionView } from './suggestion-rows.ts';

/*
 * E9-A7, part of `suggestions.ts`: Story 9.1's thermo-hygrometer, the pending suggestion of
 * each environment field of a cabine.
 */

/** A cabine's environment value as a cell, for the same comparison as a sheet cell's. */
function envCell(value: unknown): Cell | null {
  return value === null || value === undefined ? null : ({ value, source_suggestion_id: null, op_id: '' } as unknown as Cell);
}

export type EnvSuggestionField = 'temperature_c' | 'humidity_pct' | 'altitude_m';

export interface EnvSuggestion {
  field: EnvSuggestionField;
  suggestion: SuggestionRow;
  view: 'fill' | 'replace' | 'none';
}

/** The pending thermo-hygrometer suggestion of each environment field of a cabine, newest wins. */
export function envSuggestions(location: Pick<Extract<LocationRow, { kind: 'cabine' }>, 'id' | 'env'>, pending: readonly SuggestionRow[]): EnvSuggestion[] {
  const byField = new Map<EnvSuggestionField, SuggestionRow>();
  for (const row of pending) {
    if (row.status !== 'pending') continue;
    const path = safeParsePath(row.target_path);
    if (path === null || path.family !== 'location/env' || path.id !== location.id) continue;
    const field = path.field as EnvSuggestionField;
    const held = byField.get(field);
    if (held === undefined || row.id > held.id) byField.set(field, row);
  }
  return [...byField.entries()].map(([field, suggestion]) => ({ field, suggestion, view: suggestionView(envCell(location.env[field]), suggestion, NUMBER_FIELD) }));
}
