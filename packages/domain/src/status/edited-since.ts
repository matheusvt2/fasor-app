import type { Op } from '../ops/op.ts';
import { safeParsePath, targetOf, type PathFamily } from '../ops/path.ts';
import type { BlockRow, RelatorioStatus } from '../schemas/entities.ts';
import { statusTable } from './table.ts';

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

/*
 * Epic 4 retro items 18 and Q15: what "this relatório was edited" reads. A relatório's
 * stream is its own ops plus the project-scope ops of the equipment its live blocks
 * reference -- never every project-scope op of the obra, or an equipment added by a second
 * relatório of the same obra would make the first one "edited" and give it a needless
 * revision. The referenced set is recomputed from the live blocks at check time: a block
 * removed or re-pointed after the snapshot is itself a relatório-scoped edit, so no history
 * of references is needed. The api's generate barrier, the Export dialog and the
 * `Emitido --edit--> Em revisão` emitter all ask the same predicate.
 */

/** The relatório whose stream is being read, and the equipment its live blocks reference. */
export interface RelatorioStream {
  relatorioId: string;
  equipmentIds: ReadonlySet<string>;
}

/** What `inRelatorioStream` reads of an op, on top of `EditCandidate`. */
export type StreamCandidate = EditCandidate & { scope?: Op['scope']; relatorio_id?: string | null };

/** The equipment ids the live blocks reference (removed blocks and blocks with no equipment are skipped). */
export function referencedEquipmentIds(blocks: readonly Pick<BlockRow, 'equipment_id' | 'removed_at'>[]): Set<string> {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (block.removed_at === null && block.equipment_id !== null) ids.add(block.equipment_id);
  }
  return ids;
}

/**
 * True when the op belongs to the relatório's stream: one of its own ops, or a
 * project-scope `equipment/{id}` or `equipment/{id}/{field}` op of an equipment it references.
 */
export function inRelatorioStream(op: StreamCandidate, stream: RelatorioStream): boolean {
  if (op.relatorio_id != null) return op.relatorio_id === stream.relatorioId;
  if (op.scope !== 'project') return false;
  const parsed = safeParsePath(op.path);
  if (parsed === null || (parsed.family !== 'equipment' && parsed.family !== 'equipment/field')) return false;
  const { id } = targetOf(parsed);
  return id !== null && stream.equipmentIds.has(id);
}

/** `editedSince` over the ops of the relatório's stream only (items 18, Q15). */
export function relatorioEditedSince(ops: readonly StreamCandidate[], snapshotSeq: number, stream: RelatorioStream): boolean {
  return editedSince(
    ops.filter((op) => inRelatorioStream(op, stream)),
    snapshotSeq,
  );
}

/**
 * The device's view of `editedSince` (Epic 4 QA Q11): the pulled ops of the relatório's
 * stream past the snapshot, plus this device's ops the server has not applied yet (no
 * `seq`, pending or sent), any of which that `countsAsEdit` will be an edit once it lands.
 * With `stream`, both lists are first narrowed to the relatório's stream (item 18).
 */
export function editedOnDevice(
  pulled: readonly StreamCandidate[],
  unsent: readonly StreamCandidate[],
  snapshotSeq: number,
  stream?: RelatorioStream,
): boolean {
  const own = <T extends StreamCandidate>(ops: readonly T[]) => (stream === undefined ? ops : ops.filter((op) => inRelatorioStream(op, stream)));
  return editedSince(own(pulled), snapshotSeq) || own(unsent).some(countsAsEdit);
}

/**
 * Epic 4 retro items 19 and 20: the status a revision's arrival moves the relatório to.
 * `statusTable(status, 'issue')` when nothing was edited after the revision's snapshot;
 * null when something was (the revision lacks that edit, so the relatório stays Em revisão
 * and the next generate allocates a new number).
 */
export function issueOnRevision(status: RelatorioStatus, editedAfterSnapshot: boolean): RelatorioStatus | null {
  if (editedAfterSnapshot) return null;
  return statusTable(status, 'issue');
}
