import type { LocationRow } from '../schemas/entities.ts';

/*
 * Story 4.4/4.5: where a location sits, as the tree and the TAG sentences name it:
 * "1° Subsolo › Coluna 5". Kept apart from `tree.ts` so the Sumário's restore list
 * (`sumario.ts`) reads the same path without an import cycle.
 */

const PATH_SEP = ' › ';

/**
 * The names from the root down to `id`, joined by " › "; removed locations count (a
 * removed sheet still names where it was). An id the list does not hold yields "".
 */
export function locationPathText(locations: readonly Pick<LocationRow, 'id' | 'parent_id' | 'name'>[], id: string | null): string {
  if (id === null) return '';
  const byId = new Map(locations.map((location) => [location.id, location]));
  const names: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current !== undefined && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parent_id === null ? undefined : byId.get(current.parent_id);
  }
  return names.join(PATH_SEP);
}
