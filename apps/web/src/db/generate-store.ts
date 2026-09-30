import Dexie from 'dexie';
import {
  editedOnDevice,
  entityKey,
  referencedEquipmentIds,
  generationJobRowSchema,
  relatorioRowSchema,
  revisionRowSchema,
  sortRevisions,
  type GenerationJobRow,
  type RelatorioRow,
  type RevisionRow,
} from '@app/domain';
import { byClientTsThenOpId } from './commit.ts';
import { blockRowsOf } from './home-store.ts';
import { useLiveQuery } from './live.ts';
import { DEVICE_ID_PREF, type AppDatabase, type RemoteOpRow } from './schema.ts';

/*
 * Story 4.8: what the Export dialog reads from the device store (AD-1): the relatório
 * row, its revisions and its newest generate job, all pulled server rows, plus the newest
 * op this device holds for the generate barrier. Dexie stays inside `src/db`.
 */

const NO_REVISIONS: RevisionRow[] = [];

/** The relatório row on this device, or null. */
export async function relatorioRow(db: AppDatabase, relatorioId: string): Promise<RelatorioRow | null> {
  const record = await db.entities.get(['relatorio', relatorioId]);
  if (record === undefined || record.removed_at !== null) return null;
  const parsed = relatorioRowSchema.safeParse(record.row);
  return parsed.success ? parsed.data : null;
}

/** The relatório's revisions, newest first. */
export async function revisionRows(db: AppDatabase, relatorioId: string): Promise<RevisionRow[]> {
  const records = await db.entities.where('relatorio_id').equals(relatorioId).toArray();
  const rows: RevisionRow[] = [];
  for (const record of records) {
    if (record.entity !== 'revision' || record.removed_at !== null) continue;
    const parsed = revisionRowSchema.safeParse(record.row);
    if (parsed.success) rows.push(parsed.data);
  }
  return sortRevisions(rows);
}

/**
 * The relatório's newest generate job of `kind` by `created_at` (then id), or null. Story
 * 7.5: the Export dialog's issue flow reads `issue` jobs only, so a preview never reads as
 * a running issue.
 */
export async function latestGenerationJob(db: AppDatabase, relatorioId: string, kind: GenerationJobRow['kind'] = 'issue'): Promise<GenerationJobRow | null> {
  const records = await db.entities.where('relatorio_id').equals(relatorioId).toArray();
  let latest: GenerationJobRow | null = null;
  for (const record of records) {
    if (record.entity !== 'generation_job') continue;
    const parsed = generationJobRowSchema.safeParse(record.row);
    if (!parsed.success || parsed.data.kind !== kind) continue;
    const job = parsed.data;
    if (latest === null || job.created_at > latest.created_at || (job.created_at === latest.created_at && job.id > latest.id)) latest = job;
  }
  return latest;
}

/**
 * Epic 4 QA Q11: whether the relatório was edited on this device's view since the
 * snapshot at `snapshotSeq` — the pulled ops of its stream past that seq, plus this
 * device's ops of the same stream the server has not applied yet (pending or sent). The
 * stream is the kernel's (Epic 4 retro item 18): the relatório's own ops plus the ops of
 * the equipment its live blocks reference, the same rule the api's generate barrier reads.
 */
export async function editedSinceSnapshot(db: AppDatabase, relatorioId: string, snapshotSeq: number): Promise<boolean> {
  const blocks = await blockRowsOf(db, relatorioId);
  const stream = { relatorioId, equipmentIds: referencedEquipmentIds(blocks) };
  // Full review 2026-09-30: only what the stream can hold is read -- the relatório's own ops
  // past the snapshot through `[relatorio_id+seq]`, and the ops on the equipment its live
  // blocks reference through `targets` -- never every stream's ops past that seq.
  const [ownPulled, equipmentPulled] = await Promise.all([
    db.remote_ops.where('[relatorio_id+seq]').between([relatorioId, snapshotSeq], [relatorioId, Dexie.maxKey], false, true).toArray(),
    stream.equipmentIds.size === 0
      ? Promise.resolve([] as RemoteOpRow[])
      : db.remote_ops.where('targets').anyOf([...stream.equipmentIds].map((id) => entityKey('equipment', id))).filter((op) => op.seq > snapshotSeq).toArray(),
  ]);
  const pulled = [...ownPulled, ...equipmentPulled];
  // An op of this device the server acked (its `seq` known) before the pull brought it back.
  const acked = (await db.outbox.where('seq').above(snapshotSeq).toArray()).filter((op) => op.status === 'acked');
  const unsent = await db.outbox.where('status').anyOf('pending', 'sent').toArray();
  return editedOnDevice([...pulled, ...acked], unsent, snapshotSeq, stream);
}

/** `editedSinceSnapshot`, live; true (the next number) until the first read lands or with no snapshot. */
export function useEditedSince(db: AppDatabase | null, relatorioId: string, snapshotSeq: number | null): boolean {
  return useLiveQuery(
    () => (db === null || snapshotSeq === null ? Promise.resolve(true) : editedSinceSnapshot(db, relatorioId, snapshotSeq)),
    [db, relatorioId, snapshotSeq],
    true,
  );
}

/**
 * AD-15's `last_op_id`: the newest op this device wrote for the relatório (its own stream
 * or its project's), dead ones excluded, by `client_ts` then `op_id`; null when this
 * device wrote none. The server must hold it before it generates.
 */
export async function lastOpIdFor(db: AppDatabase, relatorioId: string): Promise<string | null> {
  const relatorio = await relatorioRow(db, relatorioId);
  const projectId = relatorio?.project_id ?? null;
  const inScope = (row: { relatorio_id?: string | null; project_id?: string | null }) =>
    row.relatorio_id === relatorioId || (projectId !== null && row.project_id != null && row.project_id === projectId);
  // Full review 2026-09-30: the relatório's own rows through the outbox's `relatorio_id`
  // index; the project's rows (an equipment op carries no relatório) from the rest of the
  // outbox, which the prune keeps small.
  const [ownRows, projectRows] = await Promise.all([
    db.outbox.where('relatorio_id').equals(relatorioId).toArray(),
    projectId === null ? Promise.resolve([]) : db.outbox.filter((row) => row.relatorio_id !== relatorioId && inScope(row)).toArray(),
  ]);
  const candidates: { op_id: string; client_ts: string }[] = [...ownRows, ...projectRows].filter((row) => row.status !== 'dead');
  // W-1: this device's ops the prune removed are in the server log (they were acked and
  // pulled back); they are still among the ops this device wrote for the relatório.
  const device = await db.local_prefs.get(DEVICE_ID_PREF);
  if (typeof device?.value === 'string' && device.value !== '') {
    const held = new Set(candidates.map((row) => row.op_id));
    const [ownPulled, projectPulled] = await Promise.all([
      db.remote_ops.where('relatorio_id').equals(relatorioId).toArray(),
      projectId === null ? Promise.resolve([] as RemoteOpRow[]) : db.remote_ops.where('project_id').equals(projectId).toArray(),
    ]);
    for (const op of [...ownPulled, ...projectPulled]) {
      if (op.device_id !== device.value || held.has(op.op_id) || !inScope(op)) continue;
      held.add(op.op_id);
      candidates.push(op);
    }
  }
  return candidates.sort(byClientTsThenOpId).at(-1)?.op_id ?? null;
}

export function useRelatorio(db: AppDatabase | null, relatorioId: string): RelatorioRow | null {
  return useLiveQuery(() => (db === null ? Promise.resolve(null) : relatorioRow(db, relatorioId)), [db, relatorioId], null);
}

export function useRevisions(db: AppDatabase | null, relatorioId: string): RevisionRow[] {
  return useLiveQuery(() => (db === null ? Promise.resolve(NO_REVISIONS) : revisionRows(db, relatorioId)), [db, relatorioId], NO_REVISIONS);
}

export function useLatestGenerationJob(db: AppDatabase | null, relatorioId: string): GenerationJobRow | null {
  return useLiveQuery(() => (db === null ? Promise.resolve(null) : latestGenerationJob(db, relatorioId)), [db, relatorioId], null);
}

/** One generate job by id, as pulled, or null. */
export async function generationJobRow(db: AppDatabase, id: string): Promise<GenerationJobRow | null> {
  const record = await db.entities.get(['generation_job', id]);
  if (record === undefined) return null;
  const parsed = generationJobRowSchema.safeParse(record.row);
  return parsed.success ? parsed.data : null;
}
