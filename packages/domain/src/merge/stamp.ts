import { cellAt, entityKey, isCellFamily, type EntityState } from '../ops/apply.ts';
import type { Op } from '../ops/op.ts';
import { safeParsePath } from '../ops/path.ts';
import type { BlockRow, LocationRow } from '../schemas/entities.ts';

/*
 * Stories 10.2 and 10.3 (contract 12): what a device saw when it wrote, stamped on the op
 * at commit from the device's own materialized rows (`state`, the rows `targetsOf(op)`
 * names), and read by the fold (`isConcurrent`, the block removal branch of `applyOp`):
 *
 * - a `sheet/*` put, and (Story 14.3) a site checklist put (`location/{id}/checklist/...`):
 *   `meta.standing_op_id`, the `op_id` of the cell the row held (null when the slot was
 *   empty), and `meta.seen_conflict_op_id`, the `op_id` of that cell's `conflict` (null when none);
 * - a `block/{id}/removed_at` write (a `remove` or a put): `meta.seen_modified_at`, the
 *   block's `last_modified_at` (null when never edited);
 * - Story 30.4 (contract 61), a `location/{id}/removed_at` write on a local (a cabine):
 *   `meta.seen_modified_at`, the local's `site_modified_at` (null when no site work was
 *   attributed to it). A painel's or a coluna's is not stamped: it holds no site work.
 *
 * - fix batch e30h (Story 30.4, contract 61), site work on a local (a site checklist put, a
 *   site photo's or a site point's create naming the local): `meta.seen_removed_at`, the local's
 *   `removed_at` (null when live). The fold attributes only work carrying it, so work written by a
 *   bundle before contract 61 never counts, on the server or on a device (`siteAttributed`).
 *
 * A value the caller already set wins. Every other op is returned as it is.
 */
export function stampSeen(op: Op, state: EntityState): Op {
  const path = safeParsePath(op.path);
  if (path === null) return op;
  if (op.kind === 'create') {
    const siteId = siteLocationIdOf(op, path.family);
    return siteId === null ? op : withSeenRemovedAt(op, state, siteId);
  }
  if (isCellFamily(path.family)) {
    if (op.kind !== 'put') return op;
    const cell = cellAt(state, path);
    const stamps = {
      standing_op_id: op.meta?.standing_op_id !== undefined ? op.meta.standing_op_id : (cell?.op_id ?? null),
      seen_conflict_op_id: op.meta?.seen_conflict_op_id !== undefined ? op.meta.seen_conflict_op_id : (cell?.conflict?.op_id ?? null),
    };
    const stamped: Op = { ...op, meta: { ...(op.meta ?? {}), ...stamps } };
    return path.family === 'location/checklist' ? withSeenRemovedAt(stamped, state, path.id) : stamped;
  }
  if (path.family === 'block/field' && path.field === 'removed_at') {
    if (op.meta?.seen_modified_at !== undefined) return op;
    const block = state.get(entityKey('block', path.id)) as BlockRow | undefined;
    return { ...op, meta: { ...(op.meta ?? {}), seen_modified_at: block?.last_modified_at ?? null } };
  }
  if (path.family === 'location/field' && path.field === 'removed_at') {
    if (op.meta?.seen_modified_at !== undefined) return op;
    const location = state.get(entityKey('location', path.id)) as LocationRow | undefined;
    if (location?.kind !== 'cabine') return op;
    return { ...op, meta: { ...(op.meta ?? {}), seen_modified_at: location.site_modified_at ?? null } };
  }
  return op;
}

/** The local a site photo's or a site point's create names (`location_id` with no `block_id`), else null; the fold reads the same. */
function siteLocationIdOf(op: Op, family: string): string | null {
  if (family !== 'file' && family !== 'point') return null;
  const value = op.value as { kind?: unknown; block_id?: unknown; location_id?: unknown } | null;
  if (value === null || typeof value !== 'object') return null;
  if (family === 'file' && (value.kind !== 'photo' || (value.block_id ?? null) !== null)) return null;
  return typeof value.location_id === 'string' ? value.location_id : null;
}

/** `op` with `meta.seen_removed_at`: the local's `removed_at` as `state` holds it, when the local is a cabine there. */
function withSeenRemovedAt(op: Op, state: EntityState, locationId: string): Op {
  if (op.meta?.seen_removed_at !== undefined) return op;
  const location = state.get(entityKey('location', locationId)) as LocationRow | undefined;
  if (location?.kind !== 'cabine') return op;
  return { ...op, meta: { ...(op.meta ?? {}), seen_removed_at: location.removed_at } };
}
