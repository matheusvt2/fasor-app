import type { LocationRow } from '../schemas/entities.ts';

/*
 * Story 14.2, second pass (2026-10-13; AD-6): the one liveness rule of a location. A
 * location is live when its own row is not removed and no row above it is: a coluna of a
 * removed painel, or a painel of a removed local, is out of the relatório with it, whatever
 * its own `removed_at` says. A removal tombstones every row it takes (`locationRemovalPlan`);
 * this rule is the backstop for a row another device wrote under the location meanwhile.
 *
 * The snapshot builders and every kernel reader handed raw location rows read these two
 * functions, so a hand-built input and a snapshot agree. A leaf module (types only), so
 * `schemas/snapshot.ts` reads it without an import cycle.
 */

type LivenessRow = Pick<LocationRow, 'id' | 'parent_id' | 'removed_at'>;

/**
 * The ids of the live locations among `locations`: the rows with `removed_at === null` and
 * no removed ancestor among the given rows (`parent_id` walked upwards). An ancestor absent
 * from the input is not "removed" (a parent this device never pulled), and a parent cycle
 * terminates: it is not live only when one of its rows is removed.
 */
export function liveLocationIds(locations: readonly LivenessRow[]): Set<string> {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const verdicts = new Map<string, boolean>();
  for (const location of locations) {
    if (verdicts.has(location.id)) continue;
    const trail: string[] = [];
    const seen = new Set<string>();
    let verdict = true;
    let at: LivenessRow | undefined = location;
    while (at !== undefined && !seen.has(at.id)) {
      const known = verdicts.get(at.id);
      if (known !== undefined) {
        verdict = known;
        break;
      }
      seen.add(at.id);
      trail.push(at.id);
      // Removed is a row carrying its tombstone's timestamp; a partial row without the
      // field (a caller that reads only the structure) is read as not removed.
      if (typeof at.removed_at === 'string') {
        verdict = false;
        break;
      }
      at = at.parent_id === null ? undefined : byId.get(at.parent_id);
    }
    // A removed row was pushed last: it and every row walked before it (its descendants) are out.
    for (const id of trail) verdicts.set(id, verdict);
  }
  const live = new Set<string>();
  for (const [id, verdict] of verdicts) if (verdict) live.add(id);
  return live;
}

/**
 * The ids of the given rows that are not live: removed, or under a removed row. What a
 * block must not sit on to be shown or counted. An id the input does not hold is in neither
 * set: a block naming it is read as before (kept), since nothing says its location left.
 */
export function hiddenLocationIds(locations: readonly LivenessRow[]): Set<string> {
  const live = liveLocationIds(locations);
  const hidden = new Set<string>();
  for (const location of locations) if (!live.has(location.id)) hidden.add(location.id);
  return hidden;
}

/**
 * Story 14.3, Epic 14 QA Q-2: the points kept on live locals. A point created from a site item
 * names its local (`location_id`); while that local is not live among `locations` (removed,
 * under a removed row, or a row the input does not hold) the point is out of every count,
 * list and move with it, and comes back with the local's restore. A point naming no location
 * is kept. The snapshot and every reader of raw point rows (the reorder key, the "N de M"
 * place) read this one rule, so the list drawn and the key written count the same points.
 * Order and liveness of the points themselves are the caller's.
 */
export function pointsOnLiveLocals<P extends { location_id?: string | null }>(points: readonly P[], locations: readonly LivenessRow[]): P[] {
  if (!points.some((point) => (point.location_id ?? null) !== null)) return [...points];
  const liveIds = liveLocationIds(locations);
  return points.filter((point) => (point.location_id ?? null) === null || liveIds.has(point.location_id!));
}
