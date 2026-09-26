import {
  concludedByText,
  conclusionRestrictionOf,
  conclusionResultOf,
  filledByText,
  sheetProgress,
  suggestedInstruments,
  tagRenamedText,
  tagTakenText,
  tagVerdict,
  toIso,
  type BlockRow,
  type InstrumentRow,
  type NextSheet,
  type OpDraft,
  type RelatorioSnapshot,
  type SheetProgress,
  type SheetStep,
  type UserRow,
} from '@app/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NavigateFunction } from 'react-router';
import { type OverflowMenuAction } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import type { SessionState } from '../../state/session.tsx';
import type { ToastState } from '../../state/toast.tsx';
import type { RelatorioEditor } from '../relatorio/relatorio-editor.ts';
import { putEquipmentTagOp } from '../relatorio/relatorio-ops.ts';
import type { FichaApi } from './ficha-api.ts';
import { concludedByOp, conclusionOp, notTestedOp, testInstrumentOp } from './ficha-ops.ts';

/** EXPERIENCE.md › Autosave: "Salvo" is announced at most every few seconds, never per keystroke. */
export const SAVED_THROTTLE_MS = 3000;
const SAVED_SHOWN_MS = 1500;

/** The "Salvo" live region's text, set at most once per `SAVED_THROTTLE_MS`. */
export function useSavedStatus(): { text: string; saved: () => void } {
  const [text, setText] = useState('');
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const saved = useCallback(() => {
    const at = Date.now();
    if (at - last.current < SAVED_THROTTLE_MS) return;
    last.current = at;
    setText(copy.ficha.saved);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(''), SAVED_SHOWN_MS);
  }, []);
  return { text, saved };
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
}

export function useFichaActions({
  relatorioId,
  snapshot,
  block,
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
        return [
          ...suggestedInstruments({ blocks, instruments }, blockId).map((suggestion) => testInstrumentOp(by, relatorioId, blockId, suggestion.testKey, suggestion.header)),
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
  const nameOf = (actorId: string | null) => (actorId === null ? null : (users.find((row) => row.id === actorId)?.name ?? (sessionUser?.id === actorId ? sessionUser.name : null)));
  const filledName = nameOf(block.last_modified_by);
  const filledBy = filledName === null || block.last_modified_at === null ? null : filledByText(filledName, block.last_modified_at);
  const concludedName = block.concluded_by === null ? null : nameOf(block.concluded_by.actor_id);
  const concludedBy = block.concluded_by === null || concludedName === null ? null : concludedByText(concludedName, block.concluded_by.at);
  const menu: OverflowMenuAction[] = [];
  if (block.concluded_by === null && block.not_tested === null) menu.push({ id: 'concluir', label: t.menuConcluir, onAction: () => conclude() });
  if (block.equipment_id !== null) menu.push({ id: 'rename-tag', label: t.menuRenameTag, onAction: () => setRenaming(true) });
  if (block.not_tested === null) menu.push({ id: 'nao-ensaiado', label: copy.sumario.tree.markNotTested, onAction: () => setNotTestedDialogOpen(true) });
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

  return { primaryLabel, primary, menu, filledBy, concludedBy, renaming, setRenaming, notTestedDialogOpen, setNotTestedDialogOpen, markNotTested, rename };
}
