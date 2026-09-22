import type { Op } from '../ops/op.ts';
import { safeParsePath, type PathFamily } from '../ops/path.ts';

/*
 * AD-15: `editedSince(snapshot_seq)` is the one predicate for "was this relatório
 * edited after that snapshot". It feeds the revision guard, the Home banner and
 * AD-22's `Emitido --edit--> Em revisão` row, so all three agree on what an edit is.
 *
 * AD-15's family set: `relatorio/setup`, `location`, `block`, `sheet`, `file` (photo),
 * `point`, `equipment`. System ops and the `suggestion`, `relatorio/status`,
 * `registry`, `template` and `user` families never count.
 */

/** The path families an edit can come from (AD-15), expanded to `path.ts`'s granularity. */
export const EDITED_SINCE_FAMILIES: ReadonlySet<PathFamily> = new Set<PathFamily>([
  'relatorio/setup',
  'location',
  'location/field',
  'location/se',
  'location/env',
  'location/agrupar_por_tipo',
  'block',
  'block/field',
  'sheet/nameplate',
  'sheet/checklist',
  'sheet/test',
  'sheet/test/cell',
  'sheet/conclusion',
  'sheet/observations',
  'file',
  'file/field',
  'point',
  'point/field',
  'equipment',
  'equipment/field',
]);

/** What `countsAsEdit` reads of an op. */
export type EditCandidate = Pick<Op, 'path' | 'actor_id'> & { kind?: Op['kind']; value?: unknown; seq?: number };

function isSystemActor(actorId: string): boolean {
  return actorId.startsWith('system:');
}

/**
 * True when this op is a user edit of the relatório's content. A `file` create counts
 * only for a photo (AD-3: the other file kinds are brand and certificate rows in
 * company scope); `file/server` is a `system:files` family and never reaches here.
 */
export function countsAsEdit(op: EditCandidate): boolean {
  if (isSystemActor(op.actor_id)) return false;
  const parsed = safeParsePath(op.path);
  if (parsed === null) return false;
  if (!EDITED_SINCE_FAMILIES.has(parsed.family)) return false;
  if (parsed.family === 'file') {
    return (op.value as { kind?: unknown } | null | undefined)?.kind === 'photo';
  }
  return true;
}

/**
 * AD-15: exists an op with `seq > snapshotSeq` that `countsAsEdit`. An op at exactly
 * the snapshot seq is part of the snapshot, not an edit of it; an op with no `seq`
 * has not been applied by the server yet and is not counted either.
 */
export function editedSince(ops: readonly EditCandidate[], snapshotSeq: number): boolean {
  for (const op of ops) {
    if (op.seq === undefined || op.seq <= snapshotSeq) continue;
    if (countsAsEdit(op)) return true;
  }
  return false;
}
