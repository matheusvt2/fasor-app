import type { Op } from '../ops/op.ts';
import { safeParsePath, targetOf, type PathFamily } from '../ops/path.ts';
import type { BlockRow } from '../schemas/entities.ts';

/*
 * AD-15: `editedSince(snapshot_seq)` is the one predicate for "was this relatório
 * edited after that snapshot". It feeds the revision guard, the Home banner and
 * AD-22's `Emitido --edit--> Em revisão` row, so all three agree on what an edit is.
 *
 * AD-15's family set: `relatorio/setup`, `location`, `block`, `sheet`, `file` (photo),
 * `point`, `equipment`. System ops and the `suggestion`, `relatorio/status`,
 * `registry`, `template` and `user` families never count.
 */

/**
 * The decision of one path family: `edit`, an edit can come from it, or `never` with the
 * one-line reason it is never one.
 */
type FamilyDecision = 'edit' | { readonly never: string };

const never = (reason: string): FamilyDecision => ({ never: reason });

/**
 * Every op path family of `ops/path.ts`, decided once (2026-10-13, Matheus, review of PR #125):
 * is an op of this family an edit of the relatório's content (AD-15), or never one. The map is
 * typed over `PathFamily`, so a family added to `opPathSchema` fails `pnpm static` right here
 * until someone writes its decision; `edited-since.test.ts` checks the same against the runtime
 * family table. Nothing is "not an edit" by omission: a family left out would silently never
 * reopen an Emitido relatório, never count for the revision guard, and never move Rascunho.
 *
 * Deciding `edit` is half of it: `countsAsFieldContent` below then needs the family's answer
 * for Rascunho (content or structure), which its own test table forces.
 */
const FAMILY_DECISIONS = {
  // AD-15's family set, expanded to `path.ts`'s granularity.
  'relatorio/setup': 'edit',
  location: 'edit',
  'location/field': 'edit',
  'location/se': 'edit',
  'location/env': 'edit',
  'location/agrupar_por_tipo': 'edit',
  block: 'edit',
  'block/field': 'edit',
  'sheet/nameplate': 'edit',
  'sheet/checklist': 'edit',
  'sheet/test': 'edit',
  'sheet/test/cell': 'edit',
  'sheet/conclusion': 'edit',
  'sheet/observations': 'edit',
  file: 'edit',
  'file/field': 'edit',
  point: 'edit',
  'point/field': 'edit',
  equipment: 'edit',
  'equipment/field': 'edit',

  // Never an edit.
  project: never('the obra row is created before any relatório of it; AD-15 names no project family'),
  'project/field': never('the obra own fields (name, client, site) are project data, not the content of one relatório'),
  relatorio: never('the relatório create comes before any revision of it, so it can never be an edit since one'),
  'relatorio/status': never('the status itself: counting it would make every transition an edit and reopen what it just issued'),
  'relatorio/export/scheme': never('the order the printed document lists the sheets in: a print choice, not content; AD-15 does not name it'),
  'relatorio/preview_file_id': never('server-only: the preview job pointing at its own file'),
  'equipment/last_nameplate': never('server-only: the last issued plate of an equipment, kept for "Copiar da última visita"'),
  'file/server': never('server-only: the upload, the variants and the reading state of a file, written by the server'),
  suggestion: never('server-only: the reading job proposing a value, which nobody has accepted yet'),
  'suggestion/status': never('confirming or discarding a suggestion; a confirmed value lands as its own sheet op, which counts'),
  registry: never('company registries (empresa, clients, instruments and the rest) are company scope, outside the relatório stream'),
  'registry/field': never('company registries are company scope, outside the relatório stream'),
  template: never('a template is company scope; a relatório keeps the content it was created with'),
  'template/field': never('a template is company scope; a relatório keeps the content it was created with'),
  'template/seed_version': never('server-only: the seed moving an unedited template to the current version'),
  user: never('server-only: the provisioning projection of an identity user'),
  'user/field': never('a user profile field is company scope, outside the relatório stream'),
  generation_job: never('server-only: the generate job row'),
  'generation_job/field': never('server-only: the generate job writing its own progress'),
  revision: never('server-only: the revision row the generate job cuts'),
  audit_run: never('server-only: the emission audit run row'),
  'audit_run/field': never('server-only: the audit job writing its own fields; a finding is information, never an op'),
} as const satisfies Record<PathFamily, FamilyDecision>;

const DECIDED = Object.entries(FAMILY_DECISIONS) as ReadonlyArray<[PathFamily, FamilyDecision]>;

/** The path families an edit can come from (AD-15), expanded to `path.ts`'s granularity. */
export const EDITED_SINCE_FAMILIES: ReadonlySet<PathFamily> = new Set(DECIDED.filter(([, decision]) => decision === 'edit').map(([family]) => family));

/**
 * The path families that are never an edit, each with the reason. Together with
 * `EDITED_SINCE_FAMILIES` it holds every family of `ops/path.ts` exactly once.
 */
export const NEVER_EDIT_FAMILIES: ReadonlyMap<PathFamily, string> = new Map(
  DECIDED.flatMap(([family, decision]): Array<[PathFamily, string]> => (decision === 'edit' ? [] : [[family, decision.never]])),
);

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

/** The `block/{id}/{field}` fields that are a sheet's own state, not the tree's structure. */
const BLOCK_CONTENT_FIELDS: ReadonlySet<string> = new Set(['not_tested', 'concluded_by']);
/** The `point/{id}/{field}` and `file/{id}/{field}` fields that order or remove a row instead of filling it. */
const ARRANGING_FIELDS: ReadonlySet<string> = new Set(['order_key', 'removed_at']);

/**
 * Status flow 2026-10-10, decision 3 (Matheus): the edits that are field **content**, the only
 * ones that move a Rascunho relatório to Em campo (`advanceOnEdit`). Content is what is filled
 * on site: a sheet value (`sheet/*`, and a sheet concluded or marked not tested), a cabine's
 * data fields (CARACTERÍSTICAS DA SE and AMBIENTE DE ENSAIO: `location/se`, `location/env`), a
 * photo (its create, its caption and what it shows) and a point of attention (its create and
 * its fields). Structure is not: creating, removing, restoring, reordering, moving or renaming
 * a location, a block, an equipment or a Sumário section (`location`, `location/field`,
 * `location/agrupar_por_tipo`, `block`, the other `block/field`s including `config`,
 * `equipment`, `equipment/field`), nor any `remove`, nor `relatorio/setup` (decision 1). The
 * office prepares the tree in Rascunho. Always a subset of `countsAsEdit`.
 */
export function countsAsFieldContent(op: EditCandidate): boolean {
  if (!countsAsEdit(op) || op.kind === 'remove') return false;
  const parsed = safeParsePath(op.path);
  if (parsed === null) return false;
  switch (parsed.family) {
    case 'sheet/nameplate':
    case 'sheet/checklist':
    case 'sheet/test':
    case 'sheet/test/cell':
    case 'sheet/conclusion':
    case 'sheet/observations':
    case 'location/se':
    case 'location/env':
    case 'file':
    case 'point':
      return true;
    case 'block/field':
      return BLOCK_CONTENT_FIELDS.has(parsed.field);
    case 'file/field':
    case 'point/field':
      return !ARRANGING_FIELDS.has(parsed.field);
    default:
      return false;
  }
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
