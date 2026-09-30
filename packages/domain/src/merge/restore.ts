import { applyOp, entityKey, sheetCellAt, type EntityState } from '../ops/apply.ts';
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
 *   value the cell showed (`shown_op_id ?? op_id`);
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
  if (path.family.startsWith('sheet/')) {
    if (op.kind !== 'put') return undefined;
    const key = entityKey('block', (path as { block_id: string }).block_id);
    const before = state.get(key) as BlockRow | undefined;
    const cell = before === undefined ? undefined : sheetCellAt(before.sheet, path);
    if (cell?.conflict === undefined) return undefined;
    const after = (next ?? applyOp(state, op)).get(key) as BlockRow | undefined;
    if (after === undefined || sheetCellAt(after.sheet, path)?.conflict !== undefined) return undefined;
    return { conflict: cell.conflict, shown_op_id: cell.shown_op_id ?? cell.op_id };
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
