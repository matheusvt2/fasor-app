import {
  concludedByText,
  conclusionRestrictionOf,
  conclusionResultOf,
  conclusionTextOnConclude,
  filledByText,
  formatTimeOfDay,
  moveTargets,
  sheetProgress,
  suggestedInstruments,
  tagRenamedText,
  tagTakenText,
  tagVerdict,
  toIso,
  type BlockDefinition,
  type BlockRow,
  type InstrumentRow,
  type NextSheet,
  type OpDraft,
  type RelatorioSnapshot,
  type SheetProgress,
  type SheetStep,
  type UserRow,
} from '@app/domain';
import { useCallback, useState } from 'react';
import type { NavigateFunction } from 'react-router';
import { type OverflowMenuAction } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import type { SessionState } from '../../state/session.tsx';
import type { ToastState } from '../../state/toast.tsx';
import type { RelatorioEditor } from '../relatorio/relatorio-editor.ts';
import { putEquipmentTagOp } from '../relatorio/relatorio-ops.ts';
import { commitMove } from '../relatorio/tree-actions.ts';
import type { FichaApi } from './ficha-api.ts';
import { concludedByOp, conclusionOp, notTestedOp, testInstrumentOp } from './ficha-ops.ts';

/**
 * Story 13.4 (INP-4): the instant the last commit landed in the outbox, for the header's
 * saved line (`FichaSavedLine`), kept to the minute so a burst of commits re-renders the
 * sheet once a minute at most. The server's reachability is read by the line itself, never
 * here: this hook runs in the sheet's body, and a body subscribed to the sync state would
 * re-render the whole sheet on every outbox count change, slowing the readings' Enter run.
 */
export function useSavedStatus(): { at: string | null; saved: () => void } {
  const [at, setAt] = useState<string | null>(null);
  const saved = useCallback(() => {
    const landed = now().toISOString();
    // Within the same minute the line would read the same: keep the state, render nothing.
    setAt((previous) => (previous !== null && formatTimeOfDay(previous) === formatTimeOfDay(landed) ? previous : landed));
  }, []);
  return { at, saved };
}

export interface FichaActions {
  primaryLabel: string;
  primary: () => void;
  menu: OverflowMenuAction[];
  filledBy: string | null;
  concludedBy: string | null;
  renaming: boolean;
  setRenaming: (open: boolean) => void;
  notTestedDialogOpen: boolean;
  setNotTestedDialogOpen: (open: boolean) => void;
  markNotTested: (reason: string, text: string | null) => void;
  rename: (value: string) => void;
  /** Story 11.2: the "Mover para…" dialog, and the move it commits. */
  moveDialogOpen: boolean;
  setMoveDialogOpen: (open: boolean) => void;
  moveTo: (targetId: string, rename: boolean) => void;
}

export function useFichaActions({
  relatorioId,
  snapshot,
  block,
  definition,
  progress,
  next,
  instruments,
  users,
  sessionUser,
  api,
  editor,
  goTo,
  navigate,
  showToast,
  saved,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  block: BlockRow;
  definition: BlockDefinition;
  progress: SheetProgress;
  next: NextSheet;
  instruments: InstrumentRow[];
  users: UserRow[];
  sessionUser: SessionState['user'];
  api: FichaApi;
  editor: RelatorioEditor;
  goTo: (step: SheetStep, missing: boolean) => void;
  navigate: NavigateFunction;
  showToast: ToastState['showToast'];
  saved: () => void;
}): FichaActions {
  const t = copy.ficha;
  const blockId = block.id;
  const relatorio = snapshot.relatorio;
  const projectId = relatorio.project_id;

  // --- "Concluir ficha" and the way on ------------------------------------------------------
  const goNext = () => {
    if (next.kind === 'relatorio') void navigate(`/relatorio/${relatorioId}`);
    else void navigate(`/relatorio/${relatorioId}/ficha/${next.blockId}`);
  };

  /**
   * "Concluir ficha" (Story 12.1): completeness is decided on the fresh rows inside the
   * edit, which runs after the commit of the value typed just before (the one queue), never
   * on this render's progress, which may predate that commit. `otherwise` runs when the
   * fresh rows are not complete: the menu and a primary labelled "Concluir ficha" say so and
   * jump to the first missing field; a primary still labelled "Próxima ficha" moves on.
   * Story 12.3 (D-4): the conclusion confirms every suggested instrument of the sheet, in
   * the same batch as `concluded_by` ("Próxima ficha" alone writes nothing).
   * Review 2026-10-08 Decision 1 (JRN-V1, `source-deltas.md` row of 2026-10-08): the same
   * batch also confirms the conclusion text the kernel composes from the fresh rows
   * (`conclusionTextOnConclude`: `text`, `text_status = confirmed`, `text_basis`) when the
   * pair is set and no text was confirmed or edited yet (`text_status` null); an edited or
   * already confirmed text is left as it is, and the tap count does not change.
   */
  const conclude = (otherwise: 'jump' | 'next' = 'jump') => {
    if (block.concluded_by !== null) {
      goNext();
      return;
    }
    let firstMissing: SheetStep | null = null;
    void api
      .edit((blocks, by, rows) => {
        const fresh = blocks.find((row) => row.id === blockId && row.removed_at === null);
        if (fresh === undefined || fresh.concluded_by !== null || fresh.not_tested !== null) return null;
        const freshProgress = sheetProgress({ blocks, locations: rows.locations, equipment: rows.equipment, relatorio }, blockId);
        if (!freshProgress.complete) {
          firstMissing = freshProgress.firstIncompleteStep ?? 'placa';
          return null;
        }
        // The TAG the ficha's own text field composes with: the fresh project equipment row's
        // (`useProjectEquipment`, the same source as Story 5.8's "Confirmar"), '' when none.
        const tag = fresh.equipment_id === null ? '' : (rows.equipment.find((row) => row.id === fresh.equipment_id)?.tag ?? '');
        const text = conclusionTextOnConclude(fresh, definition, tag);
        return [
          ...suggestedInstruments({ blocks, instruments }, blockId).map((suggestion) => testInstrumentOp(by, relatorioId, blockId, suggestion.testKey, suggestion.header)),
          ...(text === null
            ? []
            : [
                conclusionOp(by, relatorioId, blockId, 'text', text.text),
                conclusionOp(by, relatorioId, blockId, 'text_status', 'confirmed'),
                conclusionOp(by, relatorioId, blockId, 'text_basis', text.basis),
              ]),
          concludedByOp(by, relatorioId, blockId, toIso(now())),
        ];
      })
      .then((batch) => {
        if (batch === null) {
          if (otherwise === 'next') goNext();
          else if (firstMissing !== null) {
            editor.announce(t.incomplete);
            goTo(firstMissing, true);
          }
          return;
        }
        showToast(t.concluded);
        goNext();
      })
      .catch(() => undefined);
  };

  const concludable = progress.complete && block.concluded_by === null && block.not_tested === null;
  const primaryLabel = concludable ? t.concluir : next.kind === 'ficha' ? t.proximaFicha : next.kind === 'coluna' ? t.proximaColuna : t.voltarRelatorio;
  // An open sheet's primary concludes on the fresh rows: right after the last value is typed
  // this render may still say "Próxima ficha" (the commit has not been drawn yet).
  const primary = block.concluded_by === null && block.not_tested === null ? () => conclude(concludable ? 'jump' : 'next') : goNext;

  // --- the header -----------------------------------------------------------------------
  const [renaming, setRenaming] = useState(false);
  const [notTestedDialogOpen, setNotTestedDialogOpen] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const nameOf = (actorId: string | null) => (actorId === null ? null : (users.find((row) => row.id === actorId)?.name ?? (sessionUser?.id === actorId ? sessionUser.name : null)));
  const filledName = nameOf(block.last_modified_by);
  const filledBy = filledName === null || block.last_modified_at === null ? null : filledByText(filledName, block.last_modified_at);
  const concludedName = block.concluded_by === null ? null : nameOf(block.concluded_by.actor_id);
  const concludedBy = block.concluded_by === null || concludedName === null ? null : concludedByText(concludedName, block.concluded_by.at);
  const menu: OverflowMenuAction[] = [];
  if (block.concluded_by === null && block.not_tested === null) menu.push({ id: 'concluir', label: t.menuConcluir, onAction: () => conclude() });
  if (block.equipment_id !== null) menu.push({ id: 'rename-tag', label: t.menuRenameTag, onAction: () => setRenaming(true) });
  if (block.not_tested === null) menu.push({ id: 'nao-ensaiado', label: copy.sumario.tree.markNotTested, onAction: () => setNotTestedDialogOpen(true) });
  // Story 11.2 (`60-ficha.html` sheet Overflow): an equipment block placed in a location moves.
  if (block.location_id !== null && moveTargets(snapshot.locations, block).length > 0) menu.push({ id: 'mover', label: copy.sumario.tree.moveTo, onAction: () => setMoveDialogOpen(true) });
  // E5-Q17 (EXPERIENCE › Conclusion control: "Limpar" via Delete/Backspace or the sheet
  // Overflow menu): clears the result and the restriction in one edit, undoable like any
  // other; the stored text stays, hidden while the result is empty.
  if (block.not_tested === null && (conclusionResultOf(block) !== null || conclusionRestrictionOf(block) !== null)) {
    menu.push({ id: 'limpar-conclusao', label: t.menuLimparConclusao, onAction: () => clearConclusion() });
  }

  const clearConclusion = () => {
    void api
      .edit((blocks, by) => {
        const fresh = blocks.find((row) => row.id === blockId && row.removed_at === null);
        if (fresh === undefined) return null;
        const ops: OpDraft[] = [];
        if (conclusionResultOf(fresh) !== null) ops.push(conclusionOp(by, relatorioId, blockId, 'result', null));
        if (conclusionRestrictionOf(fresh) !== null) ops.push(conclusionOp(by, relatorioId, blockId, 'restriction', null));
        return ops.length === 0 ? null : ops;
      })
      .then((batch) => api.undoable(t.conclusionCleared, batch))
      .catch(() => undefined);
  };

  const markNotTested = (reason: string, text: string | null) => {
    void api
      .edit((blocks, by) => {
        const fresh = blocks.find((row) => row.id === blockId && row.removed_at === null);
        if (fresh === undefined) return null;
        return [notTestedOp(by, relatorioId, blockId, { reason, text, at: toIso(now()) })];
      })
      .then((batch) => {
        // Same feedback as the tree's `markNotTested` on the same null-batch case (review
        // finding, 2026-09-24): the block was removed by another device meanwhile.
        showToast(batch === null ? copy.sumario.tree.gone : t.notTestedToast);
      })
      .catch(() => undefined);
  };

  const rename = (value: string) => {
    const equipmentId = block.equipment_id;
    setRenaming(false);
    if (equipmentId === null) return;
    let refusal: string | null = null;
    void editor
      .edit((_blocks, by, fresh) => {
        const row = fresh.equipment.find((e) => e.id === equipmentId && e.removed_at === null);
        if (row === undefined || row.tag === value.trim()) return null;
        const verdict = tagVerdict(value, fresh.equipment, equipmentId);
        if (verdict !== null) {
          refusal = verdict.reason === 'empty' ? copy.sumario.tagDialogs.emptyTag : tagTakenText(verdict.holder.tag, null);
          return null;
        }
        return [putEquipmentTagOp(by, projectId, equipmentId, value.trim())];
      })
      .then((batch) => {
        if (batch === null) {
          if (refusal !== null) showToast(refusal);
          return;
        }
        saved();
        editor.undoable(tagRenamedText(value.trim()), batch);
      })
      .catch(() => undefined);
  };

  const moveTo = (targetId: string, rename: boolean) => {
    setMoveDialogOpen(false);
    void commitMove(editor.edit, { relatorioId, projectId, blockId, targetId, rename })
      .then(({ batch, plan }) => {
        if (batch === null || plan.kind !== 'move') {
          // Already there (another device moved it first): nothing to write, nothing to say.
          if (plan.kind === 'refused' && plan.reason !== 'same-location') showToast(plan.reason === 'location-gone' ? copy.sumario.tree.locationGone : copy.sumario.tree.gone);
          return;
        }
        // The header's cabine line reads the moved block's location live; the sentence is said and undoable.
        editor.announce(plan.text);
        editor.undoable(plan.text, batch);
      })
      .catch(() => undefined);
  };

  return {
    primaryLabel,
    primary,
    menu,
    filledBy,
    concludedBy,
    renaming,
    setRenaming,
    notTestedDialogOpen,
    setNotTestedDialogOpen,
    markNotTested,
    rename,
    moveDialogOpen,
    setMoveDialogOpen,
    moveTo,
  };
}
