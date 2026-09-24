import {
  generationJobRowSchema,
  relatorioRowSchema,
  revisionRowSchema,
  sortRevisions,
  type GenerationJobRow,
  type RelatorioRow,
  type RevisionRow,
} from '@app/domain';
import { useLiveQuery } from './live.ts';
import type { AppDatabase, OutboxRow } from './schema.ts';

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

/** The relatório's newest generate job by `created_at` (then id), or null. */
export async function latestGenerationJob(db: AppDatabase, relatorioId: string): Promise<GenerationJobRow | null> {
  const records = await db.entities.where('relatorio_id').equals(relatorioId).toArray();
  let latest: GenerationJobRow | null = null;
  for (const record of records) {
    if (record.entity !== 'generation_job') continue;
    const parsed = generationJobRowSchema.safeParse(record.row);
    if (!parsed.success) continue;
    const job = parsed.data;
    if (latest === null || job.created_at > latest.created_at || (job.created_at === latest.created_at && job.id > latest.id)) latest = job;
  }
  return latest;
}

const byClientTsThenOpId = (a: OutboxRow, b: OutboxRow) =>
  a.client_ts < b.client_ts ? -1 : a.client_ts > b.client_ts ? 1 : a.op_id < b.op_id ? -1 : a.op_id > b.op_id ? 1 : 0;

/**
 * AD-15's `last_op_id`: the newest op this device wrote for the relatório (its own stream
 * or its project's), dead ones excluded, by `client_ts` then `op_id`; null when this
 * device wrote none. The server must hold it before it generates.
 */
export async function lastOpIdFor(db: AppDatabase, relatorioId: string): Promise<string | null> {
  const relatorio = await relatorioRow(db, relatorioId);
  const rows = (await db.outbox.toArray()).filter(
    (row) =>
      row.status !== 'dead' &&
      (row.relatorio_id === relatorioId || (relatorio !== null && row.project_id !== null && row.project_id === relatorio.project_id)),
  );
  return rows.sort(byClientTsThenOpId).at(-1)?.op_id ?? null;
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
