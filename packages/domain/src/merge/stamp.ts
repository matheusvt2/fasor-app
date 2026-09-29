import { entityKey, sheetCellAt, type EntityState } from '../ops/apply.ts';
import type { Op } from '../ops/op.ts';
import { safeParsePath } from '../ops/path.ts';
import type { BlockRow } from '../schemas/entities.ts';

/*
 * Stories 10.2 and 10.3 (contract 12): what a device saw when it wrote, stamped on the op
 * at commit from the device's own materialized rows (`state`, the rows `targetsOf(op)`
 * names), and read by the fold (`isConcurrent`, the block removal branch of `applyOp`):
 *
 * - a `sheet/*` put: `meta.standing_op_id`, the `op_id` of the cell the row held (null when
 *   the slot was empty), and `meta.seen_conflict_op_id`, the `op_id` of that cell's
 *   `conflict` (null when none);
 * - a `block/{id}/removed_at` write (a `remove` or a put): `meta.seen_modified_at`, the
 *   block's `last_modified_at` (null when never edited).
 *
 * A value the caller already set wins. Every other op is returned as it is.
 */
export function stampSeen(op: Op, state: EntityState): Op {
  if (op.kind === 'create') return op;
  const path = safeParsePath(op.path);
  if (path === null) return op;
  if (path.family.startsWith('sheet/')) {
    if (op.kind !== 'put') return op;
    const blockId = (path as { block_id: string }).block_id;
    const block = state.get(entityKey('block', blockId)) as BlockRow | undefined;
    const cell = block === undefined ? undefined : sheetCellAt(block.sheet, path);
    const stamps = {
      standing_op_id: op.meta?.standing_op_id !== undefined ? op.meta.standing_op_id : (cell?.op_id ?? null),
      seen_conflict_op_id: op.meta?.seen_conflict_op_id !== undefined ? op.meta.seen_conflict_op_id : (cell?.conflict?.op_id ?? null),
    };
    return { ...op, meta: { ...(op.meta ?? {}), ...stamps } };
  }
  if (path.family === 'block/field' && path.field === 'removed_at') {
    if (op.meta?.seen_modified_at !== undefined) return op;
    const block = state.get(entityKey('block', path.id)) as BlockRow | undefined;
    return { ...op, meta: { ...(op.meta ?? {}), seen_modified_at: block?.last_modified_at ?? null } };
  }
  return op;
}
