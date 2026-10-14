import type { LocationRemovalPlan, TreeEquipmentNode, TreeLocationNode } from '@app/domain';
import type { KeyboardEvent } from 'react';
import type { OverflowMenuAction } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import type { Reorder } from '../templates/use-reorder.ts';
import type { PaletteTarget } from './block-palette-field.tsx';
import type { TreeActions } from './tree-actions.ts';

/*
 * E14-A7: what the relatório tree (`relatorio-tree.tsx`) shares with its two presentations,
 * the Sumário's (`relatorio-tree-sumario.tsx`) and the rail's (`relatorio-tree-rail.tsx`): the
 * row context, the row comparator, the arrow keys and the location Overflow.
 */

export type Dialog =
  | { kind: 'remove'; node: TreeEquipmentNode }
  | { kind: 'duplicate'; node: TreeEquipmentNode }
  | { kind: 'rename-tag'; node: TreeEquipmentNode }
  | { kind: 'not-tested'; node: TreeEquipmentNode }
  | { kind: 'move'; node: TreeEquipmentNode }
  | { kind: 'rename-location'; node: TreeLocationNode }
  // Story 14.2, second pass: the Confirm of a location that takes sheets with it, with the plan it was opened on.
  | { kind: 'remove-location'; node: TreeLocationNode; plan: LocationRemovalPlan }
  // Story 14.2: the Função dialog, adding a local or editing one ("Função e nome").
  | { kind: 'local-add' }
  | { kind: 'local-edit'; node: TreeLocationNode };

/** What every row of one render shares. */
export interface Shared {
  presentation: 'sumario' | 'rail';
  isOpen: (node: TreeLocationNode) => boolean;
  setOpen: (node: TreeLocationNode, open: boolean) => void;
  currentBlockId: string | null;
  currentPath: ReadonlySet<string>;
  actions: TreeActions;
  openPalette: (target: PaletteTarget) => void;
  /**
   * Where the palette opened on a location puts the block (kernel `paletteLocationFor`): a
   * local's or a painel's current coluna, the local itself when it has none, the coluna itself;
   * null for a painel with no coluna (it takes no block).
   */
  paletteLocation: (node: TreeLocationNode) => string | null;
  /** "1° Subsolo › Coluna 5": a location's path (the duplicate line's accessible name). */
  pathOf: (locationId: string) => string;
  openDialog: (dialog: Dialog) => void;
  /** Story 11.2: another live location exists for the block to move to (the kernel's `moveTargets`). */
  canMove: (node: TreeEquipmentNode) => boolean;
  requestRemove: (node: TreeEquipmentNode) => void;
  /** "Remover" of a location: asks first only when a sheet leaves with it. */
  requestRemoveLocation: (node: TreeLocationNode) => void;
}

export const Chevron = () => (
  <svg className="ico" aria-hidden="true">
    <use href="/sprite.svg#i-chev-down" />
  </svg>
);

/**
 * Deep equality over the plain data of a tree node (strings, numbers, booleans, null,
 * arrays and plain objects): two renders of the same row compare equal when nothing it
 * draws changed, whatever the identity of the objects the kernel built.
 */
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameData(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) if (!sameData((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  return true;
}

/** A row redraws only when its node's content or the shared row context changed. */
export function sameRow<N>(prev: { node: N; shared: Shared }, next: { node: N; shared: Shared }): boolean {
  return prev.shared === next.shared && sameData(prev.node, next.node);
}

/** The parent location's chevron of the row `from` sits in. */
function focusParentChevron(from: HTMLElement): void {
  const li = from.closest('li');
  const parent = li?.parentElement?.closest<HTMLElement>('li[data-location-id]');
  const id = parent?.dataset.locationId;
  if (parent === null || parent === undefined || id === undefined) return;
  parent.querySelector<HTMLElement>(`[data-tree-chevron="${CSS.escape(id)}"]`)?.focus();
}

/**
 * Left/Right on a row (EXPERIENCE.md › Relatório tree): only from its chevron or its body,
 * so the caret keeps the arrows inside the Position box. `open` is null on a leaf.
 */
export function treeKeys(event: KeyboardEvent<HTMLElement>, open: boolean | null, setOpen: (open: boolean) => void): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const target = event.target as HTMLElement;
  if (!target.matches('[data-tree-chevron], [data-tree-open]')) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'ArrowRight') {
    if (open === false) setOpen(true);
    return;
  }
  if (open === true) setOpen(false);
  else focusParentChevron(target);
}

/**
 * A location's Overflow, by kind (`40-relatorio-overview.html` `#sum-menu-local`,
 * `#sum-menu-painel`). A local: its first sheet, "Agrupar por tipo", "Adicionar
 * equipamento", "Adicionar painel", "Função e nome" and the moves. A painel: "Adicionar
 * bloco" (while it has a coluna to put it in), "Adicionar coluna", "Renomear" and the
 * moves. A coluna: "Adicionar bloco", "Renomear" and the moves. A local that already holds
 * colunas directly (a tree from before the painel level) keeps its "Adicionar coluna". Each
 * of the three ends in "Remover", alone in the destructive group (the mock's red item on a
 * local and a painel; the story's criterion of 2026-10-13 gives the coluna the same). The
 * rail keeps the local's first two and nothing else: it never removes.
 */
export function locationMenu(node: TreeLocationNode, shared: Shared, reorder: Reorder | null, trigger: () => HTMLElement | null): { items: OverflowMenuAction[]; destructiveItems: OverflowMenuAction[] } {
  const t = copy.sumario.tree;
  const items: OverflowMenuAction[] = [];
  const local = node.kind === 'cabine';
  if (local) {
    if (node.firstBlockId !== null) {
      const first = node.firstBlockId;
      items.push({ id: 'open-first', label: t.openFirst, onAction: () => shared.actions.openSheet(first) });
    }
    items.push({ id: 'agrupar', label: t.agrupar, checked: node.agruparPorTipo === true, onAction: () => shared.actions.toggleAgrupar(node) });
  }
  if (shared.presentation === 'rail') return { items, destructiveItems: [] };
  const target = shared.paletteLocation(node);
  // A painel with no coluna takes no block: nothing to offer until it has one.
  // "Adicionar equipamento" only when the block goes on the local itself; a local that holds colunas
  // directly (every tree born from the standard template) adds to its current coluna, which is "Adicionar bloco".
  if (target !== null) items.push({ id: 'add-block', label: local && target === node.id ? t.addEquipamento : t.addBlock, onAction: () => shared.openPalette({ locationId: target, anchorBlockId: null }) });
  if (local) items.push({ id: 'add-painel', label: t.addPainel, onAction: () => shared.actions.addLocation(node, 'painel') });
  if (node.kind === 'painel' || (local && node.locations.some((child) => child.kind === 'coluna'))) {
    items.push({ id: 'add-coluna', label: t.addColuna, onAction: () => shared.actions.addLocation(node, 'coluna') });
  }
  if (local) items.push({ id: 'funcao-nome', label: t.funcaoENome, onAction: () => shared.openDialog({ kind: 'local-edit', node }) });
  else items.push({ id: 'rename', label: t.rename, onAction: () => shared.openDialog({ kind: 'rename-location', node }) });
  if (reorder !== null && node.position > 1) items.push({ id: 'up', label: copy.sumario.moveUp, onAction: () => void reorder.moveTo(node.position - 2, trigger) });
  if (reorder !== null && node.position < node.siblings) items.push({ id: 'down', label: copy.sumario.moveDown, onAction: () => void reorder.moveTo(node.position, trigger) });
  return { items, destructiveItems: [{ id: 'remove', label: copy.sumario.remove, onAction: () => shared.requestRemoveLocation(node) }] };
}
