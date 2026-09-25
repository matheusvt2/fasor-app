import {
  defaultBlockConfig,
  emptySheet,
  moveAnnouncement,
  moveLandingIndex,
  orderKeyAfter,
  orderKeyForMove,
  sectionBlocks,
  sectionMovedText,
  type BlockRow,
  type RelatorioStatus,
  type RestorableBlock,
  type SectionBlockType,
  type SumarioRow,
} from '@app/domain';
import { useNavigate } from 'react-router';
import { copy } from '../../copy/pt-br.ts';
import { newId } from '../../ids.ts';
import { focusAfterRemoval, restoreFocus } from '../../input/focus-restore.ts';
import { useToast } from '../../state/toast.tsx';
import type { RelatorioEditor } from './relatorio-editor.ts';
import { createBlockOp, putBlockOp, putRelatorioStatusOp, removeBlockOp } from './relatorio-ops.ts';
import type { RelatorioTreeHandle } from './relatorio-tree.tsx';
import type { RowActions } from './sumario-row.tsx';
import { blockTrigger, restoreSheetOps } from './tree-actions.ts';

/*
 * Story 4.3 (E4-A7(2)): every write the Sumário's rows make, through the relatório's one
 * edit queue (`useRelatorioEditor`), the way `tree-actions.ts` holds the tree's: a section
 * moved, added or duplicated below a row, removed and restored, and the header's backward
 * status move. Each is one batch, undoable from a toast where the mock gives one, and each
 * hands the focus to a control on purpose (E3-A8).
 */

export interface SumarioContext {
  relatorioId: string;
  projectId: string;
  /** The relatório's seed version: new section blocks are born on it. */
  seedVersion: string;
  editor: RelatorioEditor;
  /** Every block of the relatório, removed ones included (a restore reads its location). */
  allBlocks: readonly BlockRow[];
}

/** What the actions need of the Sumário they act on. */
export interface SumarioHost {
  /** The `ol.sumario` holding the rows. */
  list: () => HTMLElement | null;
  /** The visually hidden list heading (the focus target when a removal empties the rows). */
  heading: () => HTMLElement | null;
  /** The header's Overflow wrapper ("Mais opções do relatório"). */
  headerMenu: () => HTMLElement | null;
  tree: () => RelatorioTreeHandle | null;
  /** Opens section 9 (a restored equipment sheet comes back there). */
  expandSection9: () => void;
  /** "Adicionar abaixo": opens the section palette for the row. */
  pickBelow: (row: SumarioRow) => void;
}

export interface SumarioActions {
  rows: RowActions;
  /** The palette's pick: a new section of `type` right under `below`. */
  addSection: (below: SumarioRow, type: SectionBlockType) => void;
  /** "Restaurar" of a removed block (a section, or an equipment sheet with its TAG). */
  restore: (block: RestorableBlock) => void;
  /** The header's backward move Confirm: one `relatorio/status` put. */
  moveBack: (to: RelatorioStatus) => void;
}

/** The control the focus goes to on a numbered row `li`. */
export const rowFocusTarget = (li: Element | null | undefined): HTMLElement | null =>
  li?.querySelector<HTMLElement>('.sum-ctrls .overflow-trigger') ?? null;

export function useSumarioActions(context: SumarioContext, host: SumarioHost): SumarioActions {
  const { relatorioId, projectId, seedVersion, editor, allBlocks } = context;
  const { edit, undoable, settle } = editor;
  const navigate = useNavigate();
  const { showToast } = useToast();
  const t = copy.sumario;

  const rowLi = (blockId: string | null): HTMLElement | null =>
    blockId === null ? null : (host.list()?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`) ?? null);
  const headerTrigger = (): HTMLElement | null => host.headerMenu()?.querySelector<HTMLElement>('.overflow-trigger') ?? null;

  /**
   * A new section block right under `after`, as one create op; `spec` names its type and
   * config from the row `after` as this device holds it now (a duplicate copies the current
   * config, not the one drawn when the menu opened).
   */
  const insertBelow = (after: SumarioRow, spec: (source: BlockRow) => { type: string; config: unknown }, toastText: string) => {
    void edit((fresh, by) => {
      const siblings = sectionBlocks(fresh);
      const source = siblings.find((block) => block.id === after.blockId);
      if (source === undefined) return null;
      const order_key = orderKeyAfter(siblings, source.id);
      const { type, config } = spec(source);
      const row: BlockRow = {
        id: newId(),
        relatorio_id: relatorioId,
        location_id: null,
        equipment_id: null,
        block_type: type,
        config: config as BlockRow['config'],
        seed_version: seedVersion,
        order_key,
        feeds_block_id: null,
        not_tested: null,
        concluded_by: null,
        sheet: emptySheet(),
        created_by: null,
        first_edited_at: null,
        last_modified_by: null,
        last_modified_at: null,
        removed_at: null,
      };
      return [createBlockOp(by, relatorioId, row)];
    })
      .then((batch) => {
        if (batch === null) showToast(t.gone);
        else undoable(toastText, batch);
      })
      .catch(() => undefined);
  };

  const rows: RowActions = {
    onMove: async (row, toIndex) => {
      if (row.blockId === null) return;
      const blockId = row.blockId;
      // Where the row sits now, so "Desfazer" can hand the focus back once it is there again.
      const li = rowLi(blockId);
      const fromIndex = li === null || li.parentElement === null ? -1 : [...li.parentElement.children].indexOf(li);
      let present = true;
      const batch = await edit((fresh, by) => {
        const siblings = sectionBlocks(fresh);
        if (!siblings.some((block) => block.id === blockId)) {
          present = false;
          return null;
        }
        const key = orderKeyForMove(siblings, blockId, toIndex);
        return key === null ? null : [putBlockOp(by, relatorioId, blockId, 'order_key', key)];
      }).catch(() => null);
      if (batch === null) {
        // A same-slot move is nothing to say; a row another device removed is.
        if (!present) showToast(t.gone);
        return;
      }
      // Said, and the toast shown, in the render that draws the row in its new slot (Q7).
      const to = moveLandingIndex(row.siblings, toIndex);
      settle(
        () => {
          const li = rowLi(blockId);
          if (li === null || li.parentElement === null) return true;
          return [...li.parentElement.children].filter((el) => el.hasAttribute('data-block-id')).indexOf(li) === to;
        },
        moveAnnouncement('section', String(row.number), toIndex + 1, row.siblings),
        () =>
          undoable(sectionMovedText(row.title), batch, () => {
            const back = rowLi(blockId);
            const list = back?.parentElement ?? null;
            if (back === null || list === null || [...list.children].indexOf(back) !== fromIndex) return null;
            return back.querySelector<HTMLElement>('.pos-box');
          }),
      );
    },
    onOpen: (row) => {
      if (row.kind === 'setup') void navigate(`/relatorio/${relatorioId}/setup?etapa=2`);
      else if (row.kind === 'text' && row.blockId !== null) void navigate(`/relatorio/${relatorioId}/secao/${row.blockId}`);
      else if (row.rowKey === 'capa') void navigate(`/relatorio/${relatorioId}/setup?etapa=1`);
    },
    onAddBelow: (row) => host.pickBelow(row),
    onDuplicate: (row) => {
      if (row.blockId === null) return;
      insertBelow(row, (source) => ({ type: source.block_type, config: structuredClone(source.config) }), t.duplicated);
    },
    onRemove: (row) => {
      if (row.blockId === null) return;
      const li = rowLi(row.blockId);
      const blockId = row.blockId;
      void edit((fresh, by) => (fresh.some((block) => block.id === blockId && block.removed_at === null) ? [removeBlockOp(by, relatorioId, blockId)] : null))
        .then((batch) => {
          if (batch === null) {
            showToast(t.gone);
            return;
          }
          focusAfterRemoval(li, { focusOf: rowFocusTarget, fallback: host.heading, mode: 'settled' });
          undoable(t.removed, batch, () => rowFocusTarget(rowLi(blockId)));
        })
        .catch(() => undefined);
    },
  };

  function addSection(below: SumarioRow, type: SectionBlockType): void {
    insertBelow(below, () => ({ type, config: { ...defaultBlockConfig(seedVersion, type), section_text: null } }), t.added);
  }

  /**
   * "Desfazer" of a Restaurar tombstones the row again: the focus goes back to where the
   * restore came from, the header's "Mais opções do relatório", once the row is gone (E3-A8).
   */
  const undoneRestoreFocus = (blockId: string) => () =>
    host.list()?.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`) != null ? null : headerTrigger();

  function restore(block: RestorableBlock): void {
    const locationId = allBlocks.find((row) => row.id === block.id)?.location_id ?? null;
    void edit((fresh, by, rows) =>
      locationId === null
        ? fresh.some((row) => row.id === block.id && row.removed_at !== null)
          ? [putBlockOp(by, relatorioId, block.id, 'removed_at', null)]
          : null
        : restoreSheetOps(by, relatorioId, projectId, fresh, block.id, block.equipmentId, rows.equipment),
    )
      .then((batch) => {
        if (batch === null) {
          showToast(t.gone);
          return;
        }
        if (locationId !== null) {
          // An equipment sheet comes back in section 9: it opens, with the path down to the row.
          host.expandSection9();
          host.tree()?.reveal(locationId);
          restoreFocus(() => blockTrigger(host.list()?.querySelector(`li.s9-eq[data-block-id="${CSS.escape(block.id)}"]`)), { mode: 'settled' });
          undoable(t.tree.restored, batch, undoneRestoreFocus(block.id));
          return;
        }
        restoreFocus(() => rowFocusTarget(rowLi(block.id)), { mode: 'settled' });
        undoable(t.restored, batch, undoneRestoreFocus(block.id));
      })
      .catch(() => undefined);
  }

  function moveBack(to: RelatorioStatus): void {
    void edit((_fresh, by) => [putRelatorioStatusOp(by, relatorioId, to)])
      .then((batch) => {
        if (batch === null) return;
        restoreFocus(headerTrigger, { mode: 'settled' });
      })
      .catch(() => undefined);
  }

  return { rows, addSection, restore, moveBack };
}
