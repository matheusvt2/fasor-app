import { canMarkSent, latestRevision, putRelatorioStatusOp, statusTable, type RevisionRow } from '@app/domain';
import { useCallback } from 'react';
import { now } from '../../clock.ts';
import { commitBatchIf } from '../../db/commit.ts';
import { editedSinceSnapshot, relatorioRow, revisionRows, useEditedSinceRead, useRelatorio } from '../../db/generate-store.ts';
import type { AppDatabase } from '../../db/schema.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';

/*
 * Status flow 2026-10-10 (AD-22, decision 2): "Marcar como enviado ao cliente", the one
 * emitter of the table's `issue` event. It is offered (the Sumário's foot, the Export
 * dialog) only in Em revisão with a revision on record and nothing edited since it, so
 * Emitido always means the client has the current content; the write re-reads the status,
 * the revisions and the edits from the device store at that moment, never from the render
 * that drew the button, and writes one `relatorio/status` op when the table allows it.
 */

/**
 * Writes the `issue` op when, as the store holds it inside the commit's own transaction, the
 * kernel offers the action (`canMarkSent`) and the table has the row; resolves to whether it
 * wrote. The check and the write are one transaction (`commitBatchIf`): an edit committed
 * meanwhile, or a second press, lands wholly before the check or wholly after the write, so
 * Emitido is never written over unsent content and never twice.
 */
export async function markSentNow(db: AppDatabase, author: { id: string; companyId: string }, relatorioId: string): Promise<boolean> {
  const stillOffered = async (): Promise<boolean> => {
    const current = await relatorioRow(db, relatorioId);
    if (current === null) return false;
    const latest = latestRevision(await revisionRows(db, relatorioId));
    if (latest === null) return false;
    const edited = await editedSinceSnapshot(db, relatorioId, latest.snapshot_seq);
    return canMarkSent({ status: current.status, latest: latest.number, edited }) && statusTable(current.status, 'issue') === 'emitido';
  };
  const written = await commitBatchIf(db, stillOffered, [putRelatorioStatusOp(author, relatorioId, 'emitido')], { newId, now });
  return written !== null;
}

export interface MarkSentState {
  /** Whether anything was edited since the newest revision (true until the read lands, and with no revision). */
  edited: boolean;
  /** Whether `edited` has been read for the newest revision; a surface says nothing about edits before it has. */
  read: boolean;
  /** Whether the action is offered now (`canMarkSent`). */
  offered: boolean;
  markSent: () => Promise<void>;
}

/**
 * The live state of "Marcar como enviado ao cliente" for one relatório. `revisions` are the
 * caller's own (the Sumário reads them off its `EntityState`), so the surface and the hook
 * name the same newest revision.
 */
export function useMarkSent(relatorioId: string, revisions: readonly RevisionRow[]): MarkSentState {
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const relatorio = useRelatorio(db, relatorioId);
  const latest = latestRevision(revisions);
  const { edited, read } = useEditedSinceRead(db, relatorioId, latest?.snapshot_seq ?? null);
  const offered = relatorio !== null && read && canMarkSent({ status: relatorio.status, latest: latest?.number ?? null, edited });
  const markSent = useCallback(async () => {
    if (db === null || user === null) return;
    await markSentNow(db, { id: user.id, companyId: user.companyId }, relatorioId).catch((error: unknown) => console.error('issue status op failed', error));
  }, [db, user, relatorioId]);
  return { edited, read, offered, markSent };
}
