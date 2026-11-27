import {
  refusedByDevice,
  settleAiAnswers,
  type AiAnswerDraft,
  type AiAnswerSettlement,
  type AiAnswerState,
  type AiWriteRefusalAction,
  type JsonValue,
  type SettleOp,
} from '@app/domain';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { aiAnswers } from '../db/schema.ts';
import { logError } from '../log.ts';
import type { Tx } from '../sync/apply.ts';

/*
 * Story 32.1 (Matheus, 2026-11-27): the api's side of the AI answer records. `recordAiAnswers` is the
 * one writer of new rows: every call site of a provider (`LLM_PROVIDER`, `OCR_PROVIDER`,
 * `STT_PROVIDER`) calls it with the kernel's records of its answer, inside the transaction that
 * writes its run row (the guard test `answers-guard.test.ts` fails a call site without it).
 * `settleAppliedAnswers` runs on the op apply path (`sync/apply.ts`), inside the push's or the server
 * batch's transaction, and writes what the kernel's rule (`settleAiAnswers`) says the applied ops
 * settled. Neither logs a value: the rows hold client text.
 */

type Executor = Db | Tx;

/** Inserts the records of one answered call; nothing for none. */
export async function recordAiAnswers(executor: Executor, drafts: readonly AiAnswerDraft[]): Promise<void> {
  if (drafts.length === 0) return;
  await executor.insert(aiAnswers).values(drafts.map((draft) => ({ ...draft })));
}

function stateOf(row: typeof aiAnswers.$inferSelect): AiAnswerState {
  return {
    id: row.id,
    relatorio_id: row.relatorio_id,
    use: row.use as AiAnswerState['use'],
    run_id: row.run_id,
    target_path: row.target_path,
    suggestion_id: row.suggestion_id,
    watch_paths: Array.isArray(row.watch_paths) ? (row.watch_paths as string[]) : null,
    input_text: row.input_text,
    shown: (row.shown ?? null) as JsonValue | null,
    created_at: row.created_at,
    outcome: row.outcome as AiAnswerState['outcome'],
    action: row.action as AiAnswerState['action'],
    final_value: (row.final_value ?? null) as JsonValue | null,
    settled_by: row.settled_by,
    settled_at: row.settled_at,
    closed_at: row.closed_at,
  };
}

async function writeSettlement(executor: Executor, companyId: CompanyId, id: string, settlement: AiAnswerSettlement): Promise<void> {
  await executor
    .update(aiAnswers)
    .set({ ...settlement })
    .where(and(eq(aiAnswers.company_id, companyId), eq(aiAnswers.id, id)));
}

/**
 * Settles the open records of the relatórios `applied` touches, by the kernel's rule, in the caller's
 * transaction. `applied` are the ops in the order they were applied (a duplicate a device re-sent is
 * left out by the caller). One read when an op names a relatório; no write when nothing settles.
 */
export async function settleAppliedAnswers(tx: Tx, companyId: CompanyId, applied: readonly SettleOp[]): Promise<void> {
  const relatorios = new Set<string>();
  for (const op of applied) {
    if (op.relatorio_id) relatorios.add(op.relatorio_id);
    const value = op.value as { relatorio_id?: unknown } | null;
    if (op.kind === 'create' && op.path.startsWith('revision/') && value !== null && typeof value === 'object' && typeof value.relatorio_id === 'string') relatorios.add(value.relatorio_id);
  }
  if (relatorios.size === 0) return;
  // Under a savepoint: a fault here is logged and rolled back alone, and never refuses the ops a
  // device or a job applied (the records serve the quality report, not the relatório).
  try {
    await tx.transaction(async (savepoint) => {
      const rows = await savepoint
        .select()
        .from(aiAnswers)
        .where(and(eq(aiAnswers.company_id, companyId), inArray(aiAnswers.relatorio_id, [...relatorios]), isNull(aiAnswers.closed_at)))
        .orderBy(asc(aiAnswers.created_at), asc(aiAnswers.id));
      if (rows.length === 0) return;
      const settled = settleAiAnswers(rows.map(stateOf), applied);
      for (const [id, settlement] of settled) await writeSettlement(savepoint, companyId, id, settlement);
    });
  } catch (error) {
    // Closed values only: the error's class, never a row.
    logError('ai answers not settled', { company_id: companyId, error_class: error instanceof Error ? error.name : typeof error });
  }
}

/** The AI control's record of one tap (`run_id`, the `transcription_runs` row), in one relatório of one company; null when none. */
export async function aiWriteAnswerOf(db: Db, companyId: CompanyId, relatorioId: string, runId: string): Promise<(AiAnswerState & { target: unknown }) | null> {
  const [row] = await db
    .select()
    .from(aiAnswers)
    .where(and(eq(aiAnswers.company_id, companyId), eq(aiAnswers.relatorio_id, relatorioId), eq(aiAnswers.run_id, runId), eq(aiAnswers.use, 'ai_write')))
    .limit(1);
  return row === undefined ? null : { ...stateOf(row), target: row.target };
}

/** Story 31.10's report: settles the proposal `refused` with the device's action; false when it was already settled or closed. */
export async function settleReportedRefusal(db: Db, companyId: CompanyId, record: AiAnswerState, action: AiWriteRefusalAction, by: { userId: string; at: string }): Promise<boolean> {
  const settlement = refusedByDevice(record, action, by);
  if (settlement === null) return false;
  // Only while still open: a confirm that landed meanwhile is never overwritten by a late report.
  const updated = await db
    .update(aiAnswers)
    .set({ ...settlement })
    .where(and(eq(aiAnswers.company_id, companyId), eq(aiAnswers.id, record.id), isNull(aiAnswers.outcome), isNull(aiAnswers.closed_at)))
    .returning({ id: aiAnswers.id });
  return updated.length > 0;
}
