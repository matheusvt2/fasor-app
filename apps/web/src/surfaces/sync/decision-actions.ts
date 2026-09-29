import {
  applyPickOps,
  keepBothTag,
  keptBothText,
  removalKeptText,
  removalRemovedText,
  type BlockRemovalDecision,
  type CellDecision,
  type ConflictPick,
  type DecisionTextContext,
  type DuplicateTagDecision,
  type OpDraft,
} from '@app/domain';
import { useCallback, useMemo } from 'react';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { commitBatch } from '../../db/commit.ts';
import type { HeldDecisions } from '../../db/decision-store.ts';
import { blockRowsOf, equipmentRows, projectBlockRows } from '../../db/home-store.ts';
import { relatorioVisibility } from '../../db/sync-store.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { useUndoableEdits } from '../../state/use-undoable-edits.ts';
import { putEquipmentTagOp } from '../relatorio/relatorio-ops.ts';
import { removeSheetOps, restoreSheetOps } from '../relatorio/tree-actions.ts';

/*
 * Stories 10.2 and 10.3 (epic-10 "Ownership"): every resolution is a plain client batch,
 * built by the kernel or the tree's existing builders and committed like any other edit
 * (`commitBatch` stamps `prev_op_id`, `standing_op_id` and `seen_modified_at`, so each write
 * is sequential and clears its mark on every device once synced). Each one toasts the
 * kernel's sentence with "Desfazer" (`undoBatch`).
 */

/** The words' context of one held relatório's decisions: its rows, the device's users and who is looking. */
export function useDecisionTextContext(entry: HeldDecisions | null): DecisionTextContext {
  const session = useSession();
  const sync = useSync();
  const viewerActorId = session.user?.id ?? null;
  const viewerDeviceId = sync.deviceId;
  const userNames = sync.userNames;
  return useMemo(
    () => ({
      blocks: entry?.blocks ?? [],
      equipment: entry?.equipment ?? [],
      locations: entry?.locations ?? [],
      users: Object.entries(userNames).map(([id, name]) => ({ id, name })),
      viewerActorId,
      viewerDeviceId,
    }),
    [entry, userNames, viewerActorId, viewerDeviceId],
  );
}

export interface DecisionActions {
  /** "Aplicar": one put per cell with the picked side. Resolves once written (or refused). */
  apply: (decision: CellDecision, picks: Readonly<Record<string, ConflictPick>>) => Promise<void>;
  /** "Manter": the block and its freed equipment come back (`restoreSheetOps`). */
  keep: (entry: HeldDecisions, decision: BlockRemovalDecision, context: DecisionTextContext) => Promise<void>;
  /** "Remover": the block is removed again, now having seen the edit (`removeSheetOps`). */
  remove: (entry: HeldDecisions, decision: BlockRemovalDecision, context: DecisionTextContext) => Promise<void>;
  /** "Manter as duas": the later equipment takes the next free suffix (`keepBothTag`). */
  keepBoth: (entry: HeldDecisions, decision: DuplicateTagDecision, context: DecisionTextContext) => Promise<void>;
}

export function useDecisionActions(): DecisionActions {
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const { write, undoable, notify } = useUndoableEdits();
  const t = copy.conflict;

  /** Writes one batch built from fresh rows; toasts the sentence with "Desfazer", or "gone" when there is nothing left to do. */
  const run = useCallback(
    async (build: () => Promise<{ ops: OpDraft[]; text: string } | null>): Promise<void> => {
      if (db === null) return;
      const out: { text: string | null } = { text: null };
      const batch = await write(async () => {
        const built = await build();
        if (built === null) return null;
        out.text = built.text;
        return (await commitBatch(db, built.ops, { newId, now })).batch_id;
      }).catch(() => null);
      if (batch === null || out.text === null) {
        if (out.text === null) notify(t.gone);
        return;
      }
      undoable(out.text, batch, { label: t.undo });
    },
    [db, write, undoable, notify, t.gone, t.undo],
  );

  const userId = user?.id ?? null;
  const companyId = user?.companyId ?? null;
  const author = useMemo(() => (userId === null || companyId === null ? null : { id: userId, companyId }), [userId, companyId]);

  const apply = useCallback(
    async (decision: CellDecision, picks: Readonly<Record<string, ConflictPick>>) => {
      if (author === null) return;
      await run(async () => {
        const ops = applyPickOps(author, decision, picks);
        return ops === null ? null : { ops, text: t.resolved };
      });
    },
    [run, author, t.resolved],
  );

  const keep = useCallback(
    async (entry: HeldDecisions, decision: BlockRemovalDecision, context: DecisionTextContext) => {
      if (author === null || db === null) return;
      await run(async () => {
        const [blocks, equipment] = await Promise.all([blockRowsOf(db, entry.relatorioId), equipmentRows(db, entry.projectId)]);
        const block = blocks.find((row) => row.id === decision.block_id && row.removed_at !== null && row.removal_conflict !== undefined);
        if (block === undefined) return null;
        const ops = restoreSheetOps(author, entry.relatorioId, entry.projectId, blocks, block.id, block.equipment_id, equipment);
        return ops === null ? null : { ops, text: removalKeptText(decision, context) };
      });
    },
    [run, db, author],
  );

  const remove = useCallback(
    async (entry: HeldDecisions, decision: BlockRemovalDecision, context: DecisionTextContext) => {
      if (author === null || db === null) return;
      await run(async () => {
        const [blocks, others, visibility, equipment] = await Promise.all([
          blockRowsOf(db, entry.relatorioId),
          projectBlockRows(db, entry.projectId),
          relatorioVisibility(db),
          equipmentRows(db, entry.projectId),
        ]);
        const block = blocks.find((row) => row.id === decision.block_id && row.removed_at !== null && row.removal_conflict !== undefined);
        if (block === undefined) return null;
        const elsewhere = others.filter((row) => row.relatorio_id !== entry.relatorioId);
        // The equipment an earlier removal already freed stays as it is: only a live one is removed with the sheet.
        const liveEquipment = new Set(equipment.filter((row) => row.removed_at === null).map((row) => row.id));
        const ops = removeSheetOps(author, entry.relatorioId, entry.projectId, [...blocks, ...elsewhere], block, visibility).filter(
          (op) => !op.path.startsWith('equipment/') || liveEquipment.has(op.path.split('/')[1]!),
        );
        return { ops, text: removalRemovedText(decision, context) };
      });
    },
    [run, db, author],
  );

  const keepBoth = useCallback(
    async (entry: HeldDecisions, decision: DuplicateTagDecision, context: DecisionTextContext) => {
      if (author === null || db === null) return;
      await run(async () => {
        const equipment = await equipmentRows(db, entry.projectId);
        const later = equipment.find((row) => row.id === decision.later_equipment_id && row.removed_at === null);
        if (later === undefined) return null;
        const tag = keepBothTag(decision, equipment);
        return { ops: [putEquipmentTagOp(author, entry.projectId, later.id, tag)], text: keptBothText(decision, tag, context) };
      });
    },
    [run, db, author],
  );

  return useMemo(() => ({ apply, keep, remove, keepBoth }), [apply, keep, remove, keepBoth]);
}
