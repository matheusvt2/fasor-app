import {
  applyPickOps,
  holdsLocationRemovalMark,
  keepBothTag,
  keptBothText,
  normalizeTag,
  locationControlName,
  locationRestorePlan,
  locationRestoredText,
  removalKeptText,
  removalRemovedText,
  type BlockRemovalDecision,
  type LocationRemovalDecision,
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
import { allLocationRows, blockRowsOf, equipmentRows, projectBlockRows } from '../../db/home-store.ts';
import { relatorioVisibility } from '../../db/sync-store.ts';
import { newId } from '../../ids.ts';
import { useDefinitionContext } from '../../state/definition-context.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { useUndoableEdits } from '../../state/use-undoable-edits.ts';
import { leaveLocationRemovedOp } from '../relatorio/relatorio-ops.ts';
import { renameEquipmentOps } from '../relatorio/tag-rename-ops.ts';
import { removeSheetOps, restoreLocationOps, restoreSheetOps } from '../relatorio/tree-actions.ts';

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
  // e22h B1: a company sheet's cells and name are read through its version.
  const definitions = useDefinitionContext();
  return useMemo(
    () => ({
      definitions,
      blocks: entry?.blocks ?? [],
      equipment: entry?.equipment ?? [],
      locations: entry?.locations ?? [],
      users: Object.entries(userNames).map(([id, name]) => ({ id, name })),
      viewerActorId,
      viewerDeviceId,
    }),
    [entry, userNames, viewerActorId, viewerDeviceId, definitions],
  );
}

export interface DecisionActions {
  /** "Aplicar": one put per cell with the picked side. Resolves once written (or refused). */
  apply: (decision: CellDecision, picks: Readonly<Record<string, ConflictPick>>) => Promise<void>;
  /** "Manter": the block, its freed equipment and any removed location above it come back (`restoreSheetOps`). */
  keep: (entry: HeldDecisions, decision: BlockRemovalDecision, context: DecisionTextContext) => Promise<void>;
  /** "Remover": the block is removed again, now having seen the edit (`removeSheetOps`). */
  remove: (entry: HeldDecisions, decision: BlockRemovalDecision, context: DecisionTextContext) => Promise<void>;
  /** "Manter as duas": the later equipment takes the next free suffix (`keepBothTag`). */
  keepBoth: (entry: HeldDecisions, decision: DuplicateTagDecision, context: DecisionTextContext) => Promise<void>;
  /** Story 30.4, "Restaurar local": the local's existing restore (`locationRestorePlan`), which clears the mark. */
  restoreLocal: (entry: HeldDecisions, decision: LocationRemovalDecision) => Promise<void>;
  /** Story 30.4, "Deixar removido": a put of the removal's own time (`leaveLocationRemovedOp`) clears the mark; the local stays removed. */
  leaveRemoved: (entry: HeldDecisions, decision: LocationRemovalDecision) => Promise<void>;
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
        // Story 14.2, second pass: every location row, removed ones included. A sheet that left
        // with its coluna, painel or local is kept together with the removed rows above it, so
        // it never comes back into a location the tree does not show.
        const [blocks, equipment, locations] = await Promise.all([blockRowsOf(db, entry.relatorioId), equipmentRows(db, entry.projectId), allLocationRows(db, entry.relatorioId)]);
        const block = blocks.find((row) => row.id === decision.block_id && row.removed_at !== null && row.removal_conflict !== undefined);
        if (block === undefined) return null;
        const ops = restoreSheetOps(author, entry.relatorioId, entry.projectId, blocks, block.id, block.equipment_id, equipment, locations);
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
        const [equipment, blocks, locations] = await Promise.all([equipmentRows(db, entry.projectId), blockRowsOf(db, entry.relatorioId), allLocationRows(db, entry.relatorioId)]);
        const later = equipment.find((row) => row.id === decision.later_equipment_id && row.removed_at === null);
        // A second tap, or a rename already made elsewhere: nothing left to keep apart.
        if (later === undefined || normalizeTag(later.tag) !== normalizeTag(decision.tag)) return null;
        const tag = keepBothTag(decision, equipment);
        // Fix batch e24y (P2, P3): the new TAG carries the relatório's unedited conclusion and stored plate TAG in the same batch.
        // Fix batch e24x (D3): the relatório bounds the previous visit the conclusion is composed under.
        const relatorio = ((await db.entities.get(['relatorio', entry.relatorioId]))?.row ?? null) as { setup: { service_start?: string | null; service_end?: string | null } } | null;
        const ops = renameEquipmentOps(author, { projectId: entry.projectId, relatorioId: entry.relatorioId, rows: { blocks, locations, equipment, definitions: context.definitions, relatorio } }, later.id, tag);
        return { ops, text: keptBothText(decision, tag, context) };
      });
    },
    [run, db, author],
  );

  const restoreLocal = useCallback(
    async (entry: HeldDecisions, decision: LocationRemovalDecision) => {
      if (author === null || db === null) return;
      await run(async () => {
        const [blocks, equipment, locations] = await Promise.all([blockRowsOf(db, entry.relatorioId), equipmentRows(db, entry.projectId), allLocationRows(db, entry.relatorioId)]);
        const local = locations.find((row) => row.id === decision.location_id && holdsLocationRemovalMark(row));
        if (local === undefined) return null;
        const plan = locationRestorePlan({ locations, blocks, equipment, locationId: local.id });
        if (plan === null) return null;
        const text = locationRestoredText(local.kind, locationControlName(locations, local.id));
        return { ops: restoreLocationOps(author, entry.relatorioId, entry.projectId, plan), text };
      });
    },
    [run, db, author],
  );

  const leaveRemoved = useCallback(
    async (entry: HeldDecisions, decision: LocationRemovalDecision) => {
      if (author === null || db === null) return;
      const out: { name: string | null } = { name: null };
      const batch = await write(async () => {
        const locations = await allLocationRows(db, entry.relatorioId);
        const local = locations.find((row) => row.id === decision.location_id && holdsLocationRemovalMark(row));
        if (local === undefined || local.removed_at === null) return null;
        out.name = local.name.trim();
        return (await commitBatch(db, [leaveLocationRemovedOp(author, entry.relatorioId, local.id, local.removed_at)], { newId, now })).batch_id;
      }).catch(() => null);
      // No "Desfazer": the mark is never put back by an undo; the local stays in "Restaurar ficha removida".
      notify(batch === null || out.name === null ? t.gone : t.leftRemoved(out.name));
    },
    [db, author, write, notify, t],
  );

  return useMemo(() => ({ apply, keep, remove, keepBoth, restoreLocal, leaveRemoved }), [apply, keep, remove, keepBoth, restoreLocal, leaveRemoved]);
}
