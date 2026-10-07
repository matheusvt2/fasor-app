import { auditDisplay, auditRunRowSchema, toIso, type AuditDisplay, type AuditRunRow } from '@app/domain';
import { now } from '../clock.ts';
import { useLiveQuery } from './live.ts';
import type { AppDatabase } from './schema.ts';

/*
 * Story 13.8: the emission audit's runs as the device holds them, pulled server rows of the
 * relatório stream (AD-1: the surfaces render from IndexedDB only). Which run is shown, and
 * every word about it, is the kernel's (`auditDisplay`, `auditFindingRows`).
 */

const NO_RUNS: AuditRunRow[] = [];

/** The relatório's audit runs on this device, as stored (any order). */
export async function auditRuns(db: AppDatabase, relatorioId: string): Promise<AuditRunRow[]> {
  const records = await db.entities.where('relatorio_id').equals(relatorioId).toArray();
  const rows: AuditRunRow[] = [];
  for (const record of records) {
    if (record.entity !== 'audit_run' || record.removed_at !== null) continue;
    const parsed = auditRunRowSchema.safeParse(record.row);
    if (parsed.success) rows.push(parsed.data);
  }
  return rows.length === 0 ? NO_RUNS : rows;
}

/** One run by id, as pulled, or null. */
export async function auditRunRow(db: AppDatabase, id: string): Promise<AuditRunRow | null> {
  const record = await db.entities.get(['audit_run', id]);
  if (record === undefined) return null;
  const parsed = auditRunRowSchema.safeParse(record.row);
  return parsed.success ? parsed.data : null;
}

/** `auditRuns`, live; none until the first read lands. */
export function useAuditRuns(db: AppDatabase | null, relatorioId: string): AuditRunRow[] {
  return useLiveQuery(() => (db === null ? Promise.resolve(NO_RUNS) : auditRuns(db, relatorioId)), [db, relatorioId], NO_RUNS);
}

/**
 * The run the device shows, live (the kernel's `auditDisplay` over `useAuditRuns`): the newest
 * run's state and the newest finished run's findings. Read at render time, so a run that
 * outlived its age reads as failed on the next render.
 */
export function useLatestAuditRun(db: AppDatabase | null, relatorioId: string): AuditDisplay {
  const runs = useAuditRuns(db, relatorioId);
  return auditDisplay(runs, toIso(now()));
}
