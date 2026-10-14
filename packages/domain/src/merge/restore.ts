import { applyOp, cellAt, entityKey, isCellFamily, type EntityState } from '../ops/apply.ts';
import type { Op, RestoreMarks } from '../ops/op.ts';
import { safeParsePath } from '../ops/path.ts';
import type { BlockRow } from '../schemas/entities.ts';

/*
 * E10-Q2 (contract 13): the conflict marks an op's apply clears, so its undo can carry them
 * back (`invertBatch` puts them on the inverse as `meta.restore`, the fold writes them).
 * Without it, "Desfazer" after "Aplicar", "Manter" or "Remover" put the old value back with
 * no mark: the other device's side was lost with no one asked.
 *
 * - a `sheet/*` put whose apply drops the cell's `conflict`: that `conflict` and the op whose
 *   value the cell showed (`shown_op_id ?? op_id`); on `sheet/{id}/conclusion/text` also the
 *   `merge` record the apply dropped (contract 16, c16-3);
 * - a site checklist put (`location/{id}/checklist/...`, Story 14.3; review of 2026-10-13),
 *   as a sheet cell: its puts are stamped with `seen_conflict_op_id` and clear the cell's
 *   `conflict` the same way, and `mergeCell` writes the marks back for both families;
 * - a `block/{id}/removed_at` write whose apply drops the block's `removal_conflict`: that
 *   mark and the block's `removed_by`.
 *
 * `state` holds the rows `targetsOf(op)` names, as they stand before the op; `next` is the
 * state after it (computed when omitted). Undefined when the op clears no mark.
 */
export function clearedMarks(state: EntityState, op: Op, next?: EntityState): RestoreMarks | undefined {
  if (op.kind === 'create') return undefined;
  const path = safeParsePath(op.path);
  if (path === null) return undefined;
  if (isCellFamily(path.family)) {
    if (op.kind !== 'put') return undefined;
    // The row holding the cell: the sheet's block, or (Story 14.3) the local of a site checklist cell.
    const key = path.family === 'location/checklist' ? entityKey('location', path.id) : entityKey('block', (path as { block_id: string }).block_id);
    const cell = cellAt(state, path);
    // Contract 16 (c16-3): on the conclusion text only, the `merge` record counts as a mark too
    // (the emptied edit's `filled_over_empty` is what the conclusion row reads).
    const conclusionText = path.family === 'sheet/conclusion' && path.field === 'text';
    const merge = conclusionText ? cell?.merge : undefined;
    if (cell === undefined || (cell.conflict === undefined && merge === undefined)) return undefined;
    const after = next ?? applyOp(state, op);
    if (after.get(key) === undefined) return undefined;
    const afterCell = cellAt(after, path);
    const conflict = cell.conflict !== undefined && afterCell?.conflict === undefined ? cell.conflict : undefined;
    const mergeCleared = merge !== undefined && afterCell?.merge === undefined ? merge : undefined;
    if (cell.conflict !== undefined && conflict === undefined) return undefined;
    if (conflict === undefined && mergeCleared === undefined) return undefined;
    return { ...(conflict === undefined ? {} : { conflict }), ...(mergeCleared === undefined ? {} : { merge: mergeCleared }), shown_op_id: cell.shown_op_id ?? cell.op_id };
  }
  if (path.family === 'block/field' && path.field === 'removed_at') {
    const key = entityKey('block', path.id);
    const before = state.get(key) as BlockRow | undefined;
    if (before?.removal_conflict === undefined) return undefined;
    const after = (next ?? applyOp(state, op)).get(key) as BlockRow | undefined;
    if (after === undefined || after.removal_conflict !== undefined) return undefined;
    return { removed_by: before.removed_by ?? null, removal_conflict: before.removal_conflict };
  }
  return undefined;
}
