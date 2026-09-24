import {
  addedText,
  agruparToggledText,
  blockCreatedText,
  blockMovedText,
  isEquipmentBlockType,
  locationBlocks,
  moveAnnouncement,
  moveLandingIndex,
  newBlockOrderKey,
  newEquipmentBlock,
  newLocation,
  orderKeyForMove,
  renamedText,
  siblingLocations,
  suggestTag,
  tagRenamedText,
  tagTakenText,
  tagVerdict,
  type BlockRow,
  type OpDraft,
  type TreeEquipmentNode,
  type TreeLocationNode,
} from '@app/domain';
import { useCallback, useMemo } from 'react';
import { copy } from '../../copy/pt-br.ts';
import { writeLastSheet } from '../../db/prefs.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import type { PaletteCreate } from './block-palette-field.tsx';
import type { RelatorioEditor } from './relatorio-editor.ts';
import { focusAfterRemoval, focusWhenRendered } from './relatorio-focus.ts';
import {
  createBlockOp,
  createEquipmentOp,
  createLocationOp,
  equipmentRemovedOp,
  putAgruparOp,
  putBlockOp,
  putEquipmentTagOp,
  putLocationOp,
  removeBlockOp,
  type Author,
} from './relatorio-ops.ts';

/*
 * Stories 4.4 and 4.5: every write the location tree makes, through the relatório's one
 * edit queue (`useRelatorioEditor`): a block created from the palette or by "Duplicar", a
 * block or a location moved, a block removed, a TAG renamed, a location added or renamed,
 * the cabine's "Agrupar por tipo". Each is one batch, announced where it moves something
 * and undoable from a toast; each hands the focus to a control on purpose (E3-A8).
 */

export interface TreeContext {
  relatorioId: string;
  projectId: string;
  /** The relatório's seed version: new blocks are born on it. */
  seedVersion: string;
  editor: RelatorioEditor;
}

/** What the actions need of the tree they act on. */
export interface TreeHost {
  /** The element holding the tree's rows. */
  root: () => HTMLElement | null;
  /** Expands the locations from the root down to `locationId`. */
  reveal: (locationId: string) => void;
  /** The location a block sits in, as the tree's snapshot holds it (drawn or not). */
  locationOf: (blockId: string) => string | null;
  /** The foot's "Adicionar cabine" (the focus target once an added cabine is undone). */
  addCabine: () => HTMLElement | null;
}

export interface TreeActions {
  openSheet: (blockId: string) => void;
  moveBlock: (node: TreeEquipmentNode, toIndex: number) => Promise<void>;
  moveLocation: (node: TreeLocationNode, toIndex: number) => Promise<void>;
  createBlock: (input: PaletteCreate) => void;
  removeBlock: (node: TreeEquipmentNode) => void;
  duplicateBlock: (node: TreeEquipmentNode, tag: string) => void;
  renameTag: (node: TreeEquipmentNode, tag: string) => void;
  addLocation: (parent: TreeLocationNode | null) => void;
  renameLocation: (node: TreeLocationNode, name: string) => void;
  toggleAgrupar: (node: TreeLocationNode) => void;
}

const esc = (value: string) => CSS.escape(value);

/** The `li` of an equipment row. */
export function blockRow(root: HTMLElement | null, blockId: string): HTMLElement | null {
  return root?.querySelector<HTMLElement>(`li[data-block-id="${esc(blockId)}"]`) ?? null;
}

/** The control that opens an equipment row's sheet (`.s9-eq-open`, the rail's `.tree-body`). */
export function blockOpen(root: HTMLElement | null, blockId: string): HTMLElement | null {
  return blockRow(root, blockId)?.querySelector<HTMLElement>('[data-tree-open]') ?? null;
}

/** An equipment row's Overflow trigger. */
export function blockTrigger(row: Element | null | undefined): HTMLElement | null {
  return row?.querySelector<HTMLElement>(':scope > .overflow-trigger, :scope > .s9-eq-ctrls .overflow-trigger') ?? null;
}

/** A location's chevron. */
export function locationChevron(root: HTMLElement | null, locationId: string): HTMLElement | null {
  return root?.querySelector<HTMLElement>(`[data-tree-chevron="${esc(locationId)}"]`) ?? null;
}

export function useTreeActions(context: TreeContext, host: TreeHost): TreeActions {
  const { relatorioId, projectId, seedVersion, editor } = context;
  const { edit, announce, undoable } = editor;
  const db = useSession().database;
  const { showToast } = useToast();
  const t = copy.sumario.tree;

  const openSheet = useCallback(
    (blockId: string) => {
      const locationId = host.locationOf(blockId);
      if (locationId !== null) host.reveal(locationId);
      focusWhenRendered(() => blockOpen(host.root(), blockId));
      if (db !== null) void writeLastSheet(db, relatorioId, blockId);
      showToast(t.openStub);
    },
    [host, db, relatorioId, showToast, t.openStub],
  );

  const moveBlock = useCallback(
    async (node: TreeEquipmentNode, toIndex: number) => {
      const fromIndex = node.position - 1;
      let present = true;
      let total = node.siblings;
      const batch = await edit((blocks, by) => {
        const siblings = locationBlocks(blocks, node.locationId);
        if (!siblings.some((block) => block.id === node.blockId)) {
          present = false;
          return null;
        }
        total = siblings.length;
        const key = orderKeyForMove(siblings, node.blockId, toIndex);
        return key === null ? null : [putBlockOp(by, relatorioId, node.blockId, 'order_key', key)];
      }).catch(() => null);
      if (batch === null) {
        if (!present) showToast(t.gone);
        return;
      }
      const to = moveLandingIndex(total, toIndex);
      const text = blockMovedText(node.name, to + 1, total);
      announce(text);
      // "Desfazer" hands the focus back to the row's Position box once it is in its old slot.
      undoable(text, batch, () => {
        const back = blockRow(host.root(), node.blockId);
        const list = back?.parentElement ?? null;
        if (back === null || list === null || [...list.children].indexOf(back) !== fromIndex) return null;
        return back.querySelector<HTMLElement>('.pos-box');
      });
    },
    [host, edit, relatorioId, showToast, t.gone, announce, undoable],
  );

  const moveLocation = useCallback(
    async (node: TreeLocationNode, toIndex: number) => {
      let present = true;
      let total = node.siblings;
      const batch = await edit((_blocks, by, fresh) => {
        const siblings = siblingLocations(fresh.locations, node.parentId);
        if (!siblings.some((row) => row.id === node.id)) {
          present = false;
          return null;
        }
        total = siblings.length;
        const key = orderKeyForMove(siblings, node.id, toIndex);
        return key === null ? null : [putLocationOp(by, relatorioId, node.id, 'order_key', key)];
      }).catch(() => null);
      if (batch === null) {
        if (!present) showToast(t.locationGone);
        return;
      }
      const to = moveLandingIndex(total, toIndex);
      const text = moveAnnouncement(node.kind === 'cabine' ? 'cabine' : 'coluna', node.name, to + 1, total);
      announce(text);
      undoable(text, batch, () => locationChevron(host.root(), node.id));
    },
    [edit, relatorioId, showToast, t.locationGone, announce, undoable, host],
  );

  /** One equipment + block pair, as the palette or "Duplicar" asks for it; `copyFrom` names the block whose config is copied. */
  const createPair = useCallback(
    (input: { type: string; locationId: string; anchorBlockId: string | null; tag: string | null; copyFrom?: string }) => {
      const out: { refusal: string | null; created: { tag: string; blockId: string; location: { kind: 'cabine' | 'coluna'; name: string } } | null } = { refusal: null, created: null };
      void edit((blocks, by, fresh) => {
        const location = fresh.locations.find((row) => row.id === input.locationId);
        if (location === undefined || !isEquipmentBlockType(input.type)) {
          out.refusal = t.locationGone;
          return null;
        }
        const source = input.copyFrom === undefined ? undefined : blocks.find((block) => block.id === input.copyFrom && block.removed_at === null);
        if (input.copyFrom !== undefined && source === undefined) {
          out.refusal = t.gone;
          return null;
        }
        const tag = input.tag ?? suggestTag(input.type, { kind: location.kind, name: location.name }, fresh.equipment);
        const verdict = tagVerdict(tag, fresh.equipment);
        if (verdict !== null) {
          out.refusal = verdict.reason === 'empty' ? copy.sumario.tagDialogs.emptyTag : tagTakenText(verdict.holder.tag, null);
          return null;
        }
        const pair = newEquipmentBlock({
          blockId: newId(),
          equipmentId: newId(),
          relatorioId,
          projectId,
          locationId: location.id,
          type: input.type,
          tag,
          seedVersion,
          orderKey: newBlockOrderKey(blocks, location.id, input.anchorBlockId),
          // "Duplicar" copies the structure (sub-blocks, subtype), never the data (EXPERIENCE.md › Block Model).
          ...(source === undefined ? {} : { config: source.config }),
        });
        out.created = { tag: pair.equipment.tag, blockId: pair.block.id, location: { kind: location.kind, name: location.name } };
        return [createEquipmentOp(by, pair.equipment), createBlockOp(by, relatorioId, pair.block)];
      })
        .then((batch) => {
          const made = out.created;
          if (batch === null || made === null) {
            showToast(out.refusal ?? t.locationGone);
            return;
          }
          host.reveal(input.locationId);
          focusWhenRendered(() => blockOpen(host.root(), made.blockId));
          // "Desfazer" removes the new row: the focus goes back to the row it went under, else the location's chevron.
          const anchor = input.anchorBlockId;
          undoable(blockCreatedText(made.tag, made.location), batch, () =>
            anchor !== null && blockOpen(host.root(), anchor) !== null
              ? blockOpen(host.root(), anchor)
              : blockOpen(host.root(), made.blockId) === null
                ? locationChevron(host.root(), input.locationId)
                : null,
          );
        })
        .catch(() => undefined);
    },
    [edit, relatorioId, projectId, seedVersion, showToast, t.locationGone, t.gone, host, undoable],
  );

  const createBlock = useCallback((input: PaletteCreate) => createPair(input), [createPair]);

  const duplicateBlock = useCallback(
    (node: TreeEquipmentNode, tag: string) =>
      createPair({ type: node.blockType, locationId: node.locationId, anchorBlockId: node.blockId, tag, copyFrom: node.blockId }),
    [createPair],
  );

  const removeBlock = useCallback(
    (node: TreeEquipmentNode) => {
      const root = host.root();
      const li = blockRow(root, node.blockId);
      const parentId = node.locationId;
      void edit((blocks, by) => {
        const block = blocks.find((row) => row.id === node.blockId && row.removed_at === null);
        if (block === undefined) return null;
        const ops: OpDraft[] = [removeBlockOp(by, relatorioId, block.id)];
        // One equipment per block in this MVP: its TAG is freed with the sheet (Design Notes).
        if (block.equipment_id !== null) ops.push(equipmentRemovedOp(by, projectId, block.equipment_id, true));
        return ops;
      })
        .then((batch) => {
          if (batch === null) {
            showToast(t.gone);
            return;
          }
          focusAfterRemoval(
            li,
            (list) => [...list.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.matches('li[data-block-id]')),
            (row) => row?.querySelector<HTMLElement>('[data-tree-open]') ?? null,
            () => locationChevron(host.root(), parentId),
          );
          undoable(
            t.removed,
            batch,
            () => blockTrigger(blockRow(host.root(), node.blockId)),
            () => host.reveal(parentId),
          );
        })
        .catch(() => undefined);
    },
    [host, edit, relatorioId, projectId, showToast, t.gone, t.removed, undoable],
  );

  const renameTag = useCallback(
    (node: TreeEquipmentNode, tag: string) => {
      const equipmentId = node.equipmentId;
      if (equipmentId === null) return;
      const out: { refusal: string | null } = { refusal: null };
      void edit((_blocks, by, fresh) => {
        const row = fresh.equipment.find((e) => e.id === equipmentId && e.removed_at === null);
        if (row === undefined) {
          out.refusal = t.gone;
          return null;
        }
        if (row.tag === tag.trim()) return null;
        const verdict = tagVerdict(tag, fresh.equipment, equipmentId);
        if (verdict !== null) {
          out.refusal = verdict.reason === 'empty' ? copy.sumario.tagDialogs.emptyTag : tagTakenText(verdict.holder.tag, null);
          return null;
        }
        return [putEquipmentTagOp(by, projectId, equipmentId, tag.trim())];
      })
        .then((batch) => {
          focusWhenRendered(() => blockTrigger(blockRow(host.root(), node.blockId)));
          if (batch === null) {
            if (out.refusal !== null) showToast(out.refusal);
            return;
          }
          undoable(tagRenamedText(tag.trim()), batch, () => blockTrigger(blockRow(host.root(), node.blockId)));
        })
        .catch(() => undefined);
    },
    [edit, projectId, host, showToast, undoable, t.gone],
  );

  const addLocation = useCallback(
    (parent: TreeLocationNode | null) => {
      const out: { created: { id: string; name: string; kind: 'cabine' | 'coluna' } | null } = { created: null };
      void edit((_blocks, by, fresh) => {
        if (parent !== null && !fresh.locations.some((row) => row.id === parent.id)) return null;
        const row = newLocation(fresh.locations, { id: newId(), relatorioId, parentId: parent?.id ?? null });
        out.created = { id: row.id, name: row.name, kind: row.kind };
        return [createLocationOp(by, relatorioId, row)];
      })
        .then((batch) => {
          const made = out.created;
          if (batch === null || made === null) {
            showToast(t.locationGone);
            return;
          }
          if (parent !== null) host.reveal(parent.id);
          focusWhenRendered(() => locationChevron(host.root(), made.id));
          // "Desfazer" removes the new location: the focus goes to its cabine's chevron, or to "Adicionar cabine".
          undoable(addedText(made.kind, made.name), batch, () =>
            locationChevron(host.root(), made.id) !== null ? null : parent !== null ? locationChevron(host.root(), parent.id) : host.addCabine(),
          );
        })
        .catch(() => undefined);
    },
    [edit, relatorioId, showToast, t.locationGone, host, undoable],
  );

  const renameLocation = useCallback(
    (node: TreeLocationNode, name: string) => {
      const out = { gone: false };
      void edit((_blocks, by, fresh) => {
        const row = fresh.locations.find((l) => l.id === node.id);
        if (row === undefined) {
          out.gone = true;
          return null;
        }
        if (row.name === name) return null;
        return [putLocationOp(by, relatorioId, node.id, 'name', name)];
      })
        .then((batch) => {
          if (out.gone) {
            showToast(t.locationGone);
            return;
          }
          focusWhenRendered(() => locationChevron(host.root(), node.id));
          undoable(renamedText(node.kind === 'cabine' ? 'cabine' : 'coluna', name), batch, () => locationChevron(host.root(), node.id));
        })
        .catch(() => undefined);
    },
    [edit, relatorioId, host, undoable, showToast, t.locationGone],
  );

  const toggleAgrupar = useCallback(
    (node: TreeLocationNode) => {
      const out = { on: false };
      void edit((_blocks, by: Author, fresh) => {
        const row = fresh.locations.find((l) => l.id === node.id);
        if (row === undefined || row.kind !== 'cabine') return null;
        out.on = !row.agrupar_por_tipo;
        return [putAgruparOp(by, relatorioId, node.id, out.on)];
      })
        .then((batch) => {
          if (batch === null) {
            showToast(t.locationGone);
            return;
          }
          const text = agruparToggledText(node.name, out.on);
          announce(text);
          undoable(text, batch, () => locationChevron(host.root(), node.id));
        })
        .catch(() => undefined);
    },
    [edit, relatorioId, showToast, t.locationGone, announce, undoable, host],
  );

  return useMemo(
    () => ({ openSheet, moveBlock, moveLocation, createBlock, removeBlock, duplicateBlock, renameTag, addLocation, renameLocation, toggleAgrupar }),
    [openSheet, moveBlock, moveLocation, createBlock, removeBlock, duplicateBlock, renameTag, addLocation, renameLocation, toggleAgrupar],
  );
}

/** "Restaurar" of an equipment sheet: the block and its equipment row come back in one batch. */
export function restoreSheetOps(author: Author, relatorioId: string, projectId: string, blocks: readonly BlockRow[], blockId: string, equipmentId: string | null): OpDraft[] | null {
  if (!blocks.some((row) => row.id === blockId && row.removed_at !== null)) return null;
  const ops: OpDraft[] = [putBlockOp(author, relatorioId, blockId, 'removed_at', null)];
  if (equipmentId !== null) ops.push(equipmentRemovedOp(author, projectId, equipmentId, false));
  return ops;
}
