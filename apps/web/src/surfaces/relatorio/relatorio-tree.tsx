import {
  CABINE_META_NONE,
  duplicateTagSuggestion,
  duplicateTagText,
  locationPathText,
  locationTree,
  moveTargets,
  paletteLocationFor,
  removeBlockTitle,
  SITE_CHECKLIST_LABEL,
  treePathTo,
  type EquipmentRow,
  type RelatorioSnapshot,
  type TreeEquipmentNode,
  type TreeLocationNode,
  type PhotoFileRow,
  type SuggestionRow,
} from '@app/domain';
import { Button as AriaButton } from 'react-aria-components';
import { useSearchParams } from 'react-router';
import { memo, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { WholeWords } from '../../components/whole-words.tsx';
import { ConfirmDialog, OverflowMenu, TextButton, type OverflowMenuAction } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import { DragHandle, PositionBox } from '../templates/reorder-controls.tsx';
import { LIST_FOCUS_WATCH_FRAMES } from '../../input/focus-restore.ts';
import { useReorder, type Reorder } from '../templates/use-reorder.ts';
import { FieldPalette, type PaletteTarget } from './block-palette-field.tsx';
import { PanelCapture, panelAwaitingRows, type PanelCaptureHandle } from './panel-capture.tsx';
import { useSession } from '../../state/session.tsx';
import { useAiFeatures } from '../../state/ai-features.tsx';
import { blockOpen, blockRow, blockTrigger, locationChevron, useTreeActions, type TreeActions, type TreeContext } from './tree-actions.ts';
import { NameDialog, TagDialog } from './tag-dialogs.tsx';
import { NotTestedDialog } from './not-tested-dialog.tsx';
import { MoveBlockDialog } from './move-block-dialog.tsx';
import { LocalDialog } from '../templates/local-dialog.tsx';

/*
 * Stories 4.4 and 4.5: the location tree, ONE component in two presentations
 * (EXPERIENCE.md › Relatório tree).
 *
 * Story 14.2: three levels, Local › Painel › Coluna. A local (the `kind = cabine` row) holds
 * equipment directly and zero or more painéis; a painel only groups colunas; a coluna
 * directly under a local (a tree from before the painel level) is drawn directly under it.
 *
 * - `sumario`: section 9's expansion on the Sumário (`40-relatorio-overview.html`
 *   `.s9-tree`): `.s9-local` rows with their Função-led data line, counter and Overflow,
 *   their own sheets under "Equipamentos no local", then their `.s9-painel` rows; coluna
 *   rows; equipment rows with the Position box, the drag handle, the state glyph and word
 *   and the Overflow; "Adicionar equipamento no local" under each open local, "Adicionar
 *   bloco em ⟨painel⟩" under each open painel, and "Adicionar local" (the Função dialog) at
 *   the foot. Everything that edits the tree lives here.
 * - `rail`: the tree alone (`shell-foot.html` `.relatorio-tree`), locais, painéis, colunas
 *   and fichas, the current sheet `aria-current`; its local Overflow opens the first sheet
 *   and toggles "Agrupar por tipo", nothing more.
 *
 * Rows are lists with `aria-expanded` chevrons, not an ARIA `tree`: each row holds a
 * Position box, buttons and a menu. Left/Right on a focused chevron or row body expand and
 * collapse, and Left on a leaf or a collapsed node goes to its parent's chevron. Expand
 * state is local to the mount and never persisted: locais start collapsed (the path to
 * the last sheet opens when the Sumário opens on it), painéis and colunas open with their local.
 *
 * Rendering (Epic 4 QA Q7): every committed op re-reads the relatório and rebuilds the
 * tree's nodes, and a move also re-renders the Sumário for its announcement and its toast.
 * Each row is memoized on its node's content and on \`shared\`, which keeps its identity
 * while the expand state, the last sheet and the actions hold, so a move redraws only the
 * rows whose data changed (the moved row's siblings and their parents), not all 94.
 */

/** Story 13.5 (WAIT-3): the Sumário parameter that reopens a panel photo's result dialog (`reading-arrivals.tsx`). */
export const PANEL_PARAM = 'panel';

export interface RelatorioTreeHandle {
  /** Expands the locations down to `locationId` (a restore makes its row visible again). */
  reveal: (locationId: string) => void;
}

export interface RelatorioTreeProps {
  presentation: 'sumario' | 'rail';
  snapshot: RelatorioSnapshot;
  /** The project's equipment, removed rows included: the TAGs, the duplicates and the suggestions read it. */
  equipment: readonly EquipmentRow[];
  /** The block id of the last sheet worked on this device (`last_sheet:{id}`), or null. */
  lastSheetId: string | null;
  /** The id of the root list (the section 9 chevron's `aria-controls`). */
  id?: string;
  /** Opens the path to the last sheet once it is known, and scrolls it into view (Em campo; the rail). */
  expandToLastSheet?: boolean;
  /**
   * Story 12.2: the sheet just left by "Voltar": the path to it opens once, its row is
   * scrolled into view and its open button takes the focus.
   */
  focusBlockId?: string | null;
  /** F-24: a new value asks for `focusBlockId` again (a Sumário header count tapped once more). */
  focusToken?: number;
  context: TreeContext;
  ref?: Ref<RelatorioTreeHandle>;
  /** Story 8.1: the device's pending suggestion rows; a block holding one is not concluded in the counters. */
  pending?: readonly SuggestionRow[];
}

type Dialog =
  | { kind: 'remove'; node: TreeEquipmentNode }
  | { kind: 'duplicate'; node: TreeEquipmentNode }
  | { kind: 'rename-tag'; node: TreeEquipmentNode }
  | { kind: 'not-tested'; node: TreeEquipmentNode }
  | { kind: 'move'; node: TreeEquipmentNode }
  | { kind: 'rename-location'; node: TreeLocationNode }
  // Story 14.2: the Função dialog, adding a local or editing one ("Função e nome").
  | { kind: 'local-add' }
  | { kind: 'local-edit'; node: TreeLocationNode };

/** What every row of one render shares. */
interface Shared {
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
}

const Chevron = () => (
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
function sameRow<N>(prev: { node: N; shared: Shared }, next: { node: N; shared: Shared }): boolean {
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
function treeKeys(event: KeyboardEvent<HTMLElement>, open: boolean | null, setOpen: (open: boolean) => void): void {
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

export function RelatorioTree({ presentation, snapshot, equipment, lastSheetId, id, expandToLastSheet = false, focusBlockId = null, focusToken = 0, context, ref, pending }: RelatorioTreeProps) {
  const t = copy.sumario.tree;
  const tree = useMemo(() => locationTree(snapshot, equipment, pending), [snapshot, equipment, pending]);
  const rootRef = useRef<HTMLUListElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [palette, setPalette] = useState<PaletteTarget | null>(null);
  // Story 9.2: "Fotografar equipamento" outlives the palette, which closes when its tile is tapped.
  const panelRef = useRef<PanelCaptureHandle>(null);
  // Story 11.8 follow-up: "Fotografar equipamento" (the panel reading) is hidden while the server's AI features are off.
  const aiFeatures = useAiFeatures();
  const online = useSession().online;
  // Story 13.5 (WAIT-3): a panel photo whose result dialog was left (the Sumário opened with
  // `?panel={photoId}` by the arrival toast's "Ver") reopens it once; the parameter is then
  // dropped from the address, so a reload or a step back opens the Sumário alone.
  const [search, setSearch] = useSearchParams();
  const panelParam = presentation === 'sumario' ? search.get(PANEL_PARAM) : null;
  useEffect(() => {
    if (panelParam === null) return;
    const photo = snapshot.files.find((file) => file.id === panelParam);
    const target = photo === undefined || photo.kind !== 'photo' ? null : (photo.reading_target as { location_id?: unknown } | null);
    if (photo !== undefined && photo.kind === 'photo' && photo.reading_kind === 'panel' && target !== null && typeof target === 'object' && typeof target.location_id === 'string') {
      panelRef.current?.resume(photo.id, { locationId: target.location_id, anchorBlockId: null });
    }
    setSearch(
      (current) => {
        const params = new URLSearchParams(current);
        params.delete(PANEL_PARAM);
        return params;
      },
      { replace: true },
    );
  }, [panelParam, snapshot.files, setSearch]);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  // The parents of every location, so a reveal works for a location the tree does not draw yet.
  const parents = useRef(new Map<string, string | null>());
  parents.current = new Map(snapshot.locations.map((row) => [row.id, row.parent_id]));
  const blockLocations = useRef(new Map<string, string | null>());
  blockLocations.current = new Map(snapshot.blocks.map((row) => [row.id, row.location_id]));

  const reveal = useCallback((locationId: string) => {
    const path: string[] = [];
    const seen = new Set<string>();
    for (let at: string | null | undefined = locationId; at !== null && at !== undefined && !seen.has(at); at = parents.current.get(at)) {
      seen.add(at);
      path.push(at);
    }
    setExpanded((current) => {
      const next = new Map(current);
      for (const location of path) next.set(location, true);
      return next;
    });
  }, []);
  useImperativeHandle(ref, () => ({ reveal }), [reveal]);

  const host = useMemo(
    () => ({
      root: () => rootRef.current,
      reveal,
      locationOf: (blockId: string) => blockLocations.current.get(blockId) ?? null,
      addLocal: () => footRef.current?.querySelector<HTMLElement>('button') ?? null,
    }),
    [reveal],
  );
  const actions = useTreeActions(context, host);

  // The Sumário opened on the last sheet (Em campo) and the rail: the path to it opens once,
  // as soon as the pref is read, and the row is scrolled into view once drawn.
  const seeded = useRef(false);
  const scrollPending = useRef(false);
  useEffect(() => {
    if (seeded.current || !expandToLastSheet || lastSheetId === null) return;
    const path = treePathTo(tree, { blockId: lastSheetId });
    if (path.length === 0) return;
    seeded.current = true;
    scrollPending.current = true;
    reveal(path.at(-1)!);
  }, [expandToLastSheet, lastSheetId, tree, reveal]);
  useEffect(() => {
    if (!scrollPending.current || lastSheetId === null) return;
    const row = blockRow(rootRef.current, lastSheetId);
    if (row === null) return;
    scrollPending.current = false;
    // jsdom draws no layout and has no `scrollIntoView`.
    row.scrollIntoView?.({ block: 'center' });
  });

  // Story 12.2: back from a sheet, its row opens, scrolls into view and takes the focus, once.
  const focusSeeded = useRef(false);
  const focusPending = useRef(false);
  // F-24: each new token is a new request for the row (declared first, so it runs before the seeding below).
  const focusRequest = useRef(focusToken);
  useEffect(() => {
    if (focusRequest.current === focusToken) return;
    focusRequest.current = focusToken;
    focusSeeded.current = false;
  }, [focusToken]);
  useEffect(() => {
    if (focusSeeded.current || focusBlockId === null) return;
    const path = treePathTo(tree, { blockId: focusBlockId });
    if (path.length === 0) return;
    focusSeeded.current = true;
    focusPending.current = true;
    reveal(path.at(-1)!);
  }, [focusBlockId, focusToken, tree, reveal]);
  useEffect(() => {
    if (!focusPending.current || focusBlockId === null) return;
    const open = blockOpen(rootRef.current, focusBlockId);
    if (open === null) return;
    focusPending.current = false;
    blockRow(rootRef.current, focusBlockId)?.scrollIntoView?.({ block: 'center' });
    open.focus({ preventScroll: true });
  });

  // The path to the last sheet, kept by content so a rebuilt tree with the same path keeps `shared`.
  const currentPathKey = (lastSheetId === null ? [] : treePathTo(tree, { blockId: lastSheetId })).join(' ');
  const currentPath = useMemo(() => new Set(currentPathKey === '' ? [] : currentPathKey.split(' ')), [currentPathKey]);
  // Read at call time: a row's menu action needs the latest snapshot, not the one `shared` was built with.
  const latestSnapshot = useRef(snapshot);
  latestSnapshot.current = snapshot;
  // The locations as rows see them through `pathOf` (a duplicate line's accessible name): a
  // rename, a move or a removal changes `shared`, so memoized rows redraw with the new path.
  const locationsKey = snapshot.locations.map((row) => `${row.id}\u0000${row.name}\u0000${row.parent_id ?? ''}\u0000${row.removed_at ?? ''}`).join('\u0001');

  // The tree draws some edits in renders of its own (a reveal of a collapsed location): a
  // pending `settle` is checked here too, not only in the Sumário's render (Q7).
  const { settleCheck } = context.editor;
  useLayoutEffect(() => settleCheck());

  const shared: Shared = useMemo(
    () => ({
      presentation,
      isOpen: (node) => expanded.get(node.id) ?? node.level > 0,
      setOpen: (node, open) =>
        setExpanded((current) => {
          const next = new Map(current);
          next.set(node.id, open);
          return next;
        }),
      currentBlockId: lastSheetId,
      currentPath,
      actions,
      openPalette: setPalette,
      paletteLocation: (node) => (node.kind === 'coluna' ? node.id : paletteLocationFor(latestSnapshot.current, node.id, lastSheetId)),
      pathOf: (locationId) => locationPathText(latestSnapshot.current.locations, locationId),
      openDialog: setDialog,
      canMove: (node) => moveTargets(latestSnapshot.current.locations, { location_id: node.locationId }).length > 0,
      requestRemove: (node) => {
        // EXPERIENCE.md › Block Model: only a sheet holding data asks first (the kernel's `holdsData`).
        if (node.holdsData) setDialog({ kind: 'remove', node });
        else actions.removeBlock(node);
      },
    }),
    // `locationsKey` is read through `latestSnapshot`; it is a dependency so a new path renews `shared`.
    [presentation, expanded, lastSheetId, currentPath, actions, locationsKey],
  );

  const closeDialog = (focusTo?: () => HTMLElement | null) => {
    setDialog(null);
    if (focusTo !== undefined) requestAnimationFrame(() => focusTo()?.focus());
  };

  return (
    <>
      {presentation === 'sumario' ? (
        <>
          <ul className="s9-tree" id={id} aria-label={copy.sumario.s9TreeLabel} ref={rootRef}>
            {tree.map((node) => (
              <SumarioLocation key={node.id} node={node} shared={shared} />
            ))}
          </ul>
          <div className="s9-foot" ref={footRef}>
            <TextButton onPress={() => setDialog({ kind: 'local-add' })}>
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-plus" />
              </svg>
              {t.addLocal}
            </TextButton>
          </div>
        </>
      ) : (
        <ul className="relatorio-tree" id={id} aria-label={copy.sumario.rail.title} ref={rootRef}>
          {tree.map((node) => (
            <RailLocation key={node.id} node={node} shared={shared} />
          ))}
        </ul>
      )}

      {palette === null ? null : (
        <FieldPalette
          target={palette}
          seedVersion={context.seedVersion}
          locations={snapshot.locations}
          blocks={snapshot.blocks}
          equipment={equipment}
          onClose={() => setPalette(null)}
          onCreate={(input) => {
            setPalette(null);
            actions.createBlock(input);
          }}
          {...(presentation === 'sumario' && aiFeatures
            ? {
                onPhotograph: (target: PaletteTarget) => {
                  panelRef.current?.open(target);
                  setPalette(null);
                },
              }
            : {})}
          {...(presentation === 'sumario'
            ? {
                awaiting: panelAwaitingRows({
                  photos: snapshot.files.filter((file): file is PhotoFileRow => file.kind === 'photo') as PhotoFileRow[],
                  pending: pending ?? [],
                  locationId: palette.locationId,
                  seedVersion: context.seedVersion,
                  locations: snapshot.locations,
                  equipment,
                  online,
                }),
                onResume: (photoId: string, target: PaletteTarget) => {
                  setPalette(null);
                  panelRef.current?.resume(photoId, target);
                },
              }
            : {})}
        />
      )}
      {presentation === 'sumario' ? (
        <PanelCapture
          ref={panelRef}
          relatorioId={context.relatorioId}
          seedVersion={context.seedVersion}
          locations={snapshot.locations}
          equipment={equipment}
          onConfirm={(input) => actions.createBlock({ ...input, tag: null })}
          focusAfter={(target) => locationChevron(rootRef.current, target.locationId)}
        />
      ) : null}

      {dialog?.kind === 'remove' ? (
        <ConfirmDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) closeDialog(() => blockTrigger(blockRow(rootRef.current, dialog.node.blockId)));
          }}
          title={removeBlockTitle(dialog.node.name)}
          description={t.removeDescription}
          confirmLabel={t.removeConfirm}
          cancelLabel={ui.confirmDialog.cancel}
          isDestructive
          onConfirm={() => {
            const node = dialog.node;
            setDialog(null);
            actions.removeBlock(node);
          }}
        />
      ) : null}
      {dialog?.kind === 'duplicate' ? (
        <TagDialog
          title={copy.sumario.tagDialogs.duplicateTitle(dialog.node.name)}
          action={copy.sumario.duplicate}
          initial={duplicateTagSuggestion(dialog.node, snapshot.locations, equipment)}
          equipment={equipment}
          blocks={snapshot.blocks}
          locations={snapshot.locations}
          onClose={() => closeDialog(() => blockTrigger(blockRow(rootRef.current, dialog.node.blockId)))}
          onSubmit={(tag) => {
            const node = dialog.node;
            setDialog(null);
            actions.duplicateBlock(node, tag);
          }}
        />
      ) : null}
      {dialog?.kind === 'rename-tag' ? (
        <TagDialog
          title={copy.sumario.tagDialogs.renameTagTitle(dialog.node.name)}
          action={copy.sumario.tagDialogs.save}
          initial={dialog.node.tag}
          equipment={equipment}
          blocks={snapshot.blocks}
          locations={snapshot.locations}
          selfId={dialog.node.equipmentId ?? undefined}
          onClose={() => closeDialog(() => blockTrigger(blockRow(rootRef.current, dialog.node.blockId)))}
          onSubmit={(tag) => {
            const node = dialog.node;
            setDialog(null);
            actions.renameTag(node, tag);
          }}
        />
      ) : null}
      {dialog?.kind === 'not-tested' ? (
        <NotTestedDialog
          seedVersion={context.seedVersion}
          onClose={() => closeDialog(() => blockTrigger(blockRow(rootRef.current, dialog.node.blockId)))}
          onSubmit={(reason, text) => {
            const node = dialog.node;
            setDialog(null);
            actions.markNotTested(node, reason, text);
          }}
        />
      ) : null}
      {dialog?.kind === 'move' ? (
        <MoveBlockDialog
          name={dialog.node.name}
          blockId={dialog.node.blockId}
          locations={snapshot.locations}
          blocks={snapshot.blocks}
          equipment={equipment}
          onClose={() => closeDialog(() => blockTrigger(blockRow(rootRef.current, dialog.node.blockId)))}
          onSubmit={(targetId, rename) => {
            const node = dialog.node;
            setDialog(null);
            actions.moveToLocation(node, targetId, rename);
          }}
        />
      ) : null}
      {dialog?.kind === 'local-add' ? (
        <LocalDialog
          mode="add"
          onClose={() => closeDialog(() => footRef.current?.querySelector<HTMLElement>('button') ?? null)}
          onSubmit={(chosen) => {
            setDialog(null);
            actions.addLocal(chosen);
          }}
        />
      ) : null}
      {dialog?.kind === 'local-edit' ? (
        <LocalDialog
          mode="edit"
          initial={{ funcao: dialog.node.funcao, name: dialog.node.name }}
          onClose={() => closeDialog(() => locationChevron(rootRef.current, dialog.node.id))}
          onSubmit={(chosen) => {
            const node = dialog.node;
            setDialog(null);
            actions.updateLocal(node, chosen);
          }}
        />
      ) : null}
      {dialog?.kind === 'rename-location' ? (
        <NameDialog
          title={copy.sumario.tagDialogs.renameTitle(dialog.node.name)}
          initial={dialog.node.name}
          onClose={() => closeDialog(() => locationChevron(rootRef.current, dialog.node.id))}
          onSubmit={(name) => {
            const node = dialog.node;
            setDialog(null);
            actions.renameLocation(node, name);
          }}
        />
      ) : null}
    </>
  );
}

// --- the Sumário presentation ----------------------------------------------------------

/**
 * A location's Overflow, by kind (`40-relatorio-overview.html` `#sum-menu-local`,
 * `#sum-menu-painel`). A local: its first sheet, "Agrupar por tipo", "Adicionar
 * equipamento", "Adicionar painel", "Função e nome" and the moves. A painel: "Adicionar
 * bloco" (while it has a coluna to put it in), "Adicionar coluna", "Renomear" and the
 * moves. A coluna: "Adicionar bloco", "Renomear" and the moves. A local that already holds
 * colunas directly (a tree from before the painel level) keeps its "Adicionar coluna". The
 * rail keeps the local's first two and nothing else.
 */
function locationMenu(node: TreeLocationNode, shared: Shared, reorder: Reorder | null, trigger: () => HTMLElement | null): OverflowMenuAction[] {
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
  if (shared.presentation === 'rail') return items;
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
  return items;
}

const PlusIcon = () => (
  <svg className="ico" aria-hidden="true">
    <use href="/sprite.svg#i-plus" />
  </svg>
);

/** A local row, a painel row or a coluna row, with what hangs under it when open. */
const SumarioLocation = memo(function SumarioLocation({ node, shared }: { node: TreeLocationNode; shared: Shared }) {
  const t = copy.sumario.tree;
  const open = shared.isOpen(node);
  const eqsId = useId();
  const colsId = useId();
  const pnlsId = useId();
  const reorder = useReorder({
    itemKey: node.id,
    position: node.position,
    siblings: node.siblings,
    onMove: (to) => shared.actions.moveLocation(node, to),
    focusFrames: LIST_FOCUS_WATCH_FRAMES,
  });
  const trigger = () => reorder.row()?.querySelector<HTMLElement>(':scope > .s9-loc-row .overflow-trigger, :scope > .s9-pnl-row .overflow-trigger, :scope > .s9-col .overflow-trigger') ?? null;
  const menu = locationMenu(node, shared, reorder, trigger);
  // The root row is the local; a `cabine` row drawn under another location is read as a coluna row, as before.
  const local = node.kind === 'cabine' && node.level === 0;
  const painel = node.kind === 'painel';
  const current = shared.currentPath.has(node.id);
  const colunas = node.locations.filter((child) => child.kind !== 'painel');
  const paineis = node.locations.filter((child) => child.kind === 'painel');
  const controls = [node.equipment.length > 0 ? eqsId : null, colunas.length > 0 ? colsId : null, paineis.length > 0 ? pnlsId : null].filter(Boolean).join(' ');

  const chevron = (
    <button
      type="button"
      className="tree-chevron"
      data-tree-chevron={node.id}
      aria-label={open ? t.collapse(node.controlName) : t.expand(node.controlName)}
      aria-expanded={open}
      aria-controls={open && controls !== '' ? controls : undefined}
      onClick={() => shared.setOpen(node, !open)}
    >
      <Chevron />
    </button>
  );
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => treeKeys(event, open, (value) => shared.setOpen(node, value));
  // EXPERIENCE.md › Relatório tree: "drag, Position box, Overflow menu, or Alt+↑/↓" at every level
  // (Story 14.2). The mock draws neither on a location row; the experience wins. Every control of
  // the row reads the kernel's `controlName`: a painel is named with its local, as the mock's
  // chevron and Overflow are ("Mais opções de Painel de entrada de Cubículo Enel").
  const reorderControls = (
    <>
      <DragHandle name={node.controlName} reorder={reorder} />
      <PositionBox name={node.controlName} position={node.position} siblings={node.siblings} reorder={reorder} className="s9-pos" />
    </>
  );
  const equipmentList =
    open && node.equipment.length > 0 ? (
      <ul className="s9-eqs" id={eqsId} aria-label={local ? t.locDirectLabel(node.name) : undefined}>
        {node.equipment.map((row) => (
          <SumarioEquipment key={row.blockId} node={row} shared={shared} />
        ))}
      </ul>
    ) : null;
  const colunaList =
    open && colunas.length > 0 ? (
      <ul className="s9-cols" id={colsId}>
        {colunas.map((child) => (
          <SumarioLocation key={child.id} node={child} shared={shared} />
        ))}
      </ul>
    ) : null;
  const target = shared.paletteLocation(node);

  if (local) {
    const className = ['s9-local', open && 'is-open', current && 'is-current', reorder.dragging && 'is-dragging'].filter(Boolean).join(' ');
    // The palette opened here adds to the local itself, or to its current coluna when it holds colunas directly.
    const onLocal = target === node.id;
    const addButton =
      open && target !== null ? (
        <AriaButton
          className="btn btn-text s9-add"
          aria-label={onLocal ? t.addEquipamentoNoLocalLabel(node.name) : undefined}
          onPress={() => shared.openPalette({ locationId: target, anchorBlockId: null })}
        >
          <PlusIcon />
          {onLocal ? t.addEquipamentoNoLocal : t.addBlockIn(node.name)}
        </AriaButton>
      ) : null;
    return (
      <li className={className} data-location-id={node.id} {...reorder.rowProps}>
        <div className="s9-loc-row" onKeyDown={onKeyDown}>
          {chevron}
          {reorderControls}
          <span className="s9-loc-body">
            <span className="s9-loc-name">
              {node.name}
              {/* The last sheet's row says it when drawn; a collapsed local says it for it. */}
              {current && !open ? <span className="sum-here"> {copy.sumario.here}</span> : null}
            </span>
            {/* Story 12.3 (`key-relatorio-overview-v09.html`): "falta a umidade" after the data
                line; alone, with no "—" before it, when the local holds no data yet. */}
            {node.metaMissing === null ? (
              <span className="s9-loc-meta">{node.meta}</span>
            ) : node.meta === CABINE_META_NONE ? (
              <span className="s9-loc-meta">
                <span className="cl-missing">{node.metaMissing}</span>
              </span>
            ) : (
              <span className="s9-loc-meta">
                {node.meta}
                {' · '}
                <span className="cl-missing">{node.metaMissing}</span>
              </span>
            )}
            {/* Story 14.3 (`40-relatorio-overview.html` `.s9-verif`): the local's site checklist and its counter, the kernel's text. */}
            {node.site === null ? null : (
              <AriaButton className="btn btn-text s9-verif" aria-label={copy.local.entryLabel(node.site.text, node.name)} onPress={() => shared.actions.openVerificacoes(node.id)}>
                <svg className="ico ico-sm" aria-hidden="true">
                  <use href="/sprite.svg#i-check-all" />
                </svg>
                {node.site.text}
              </AriaButton>
            )}
          </span>
          <span className="progress-counter" data-state={node.counterState}>
            <span className="dot" aria-hidden="true" />
            {node.counterText}
          </span>
          <OverflowMenu name={node.controlName} items={menu} />
        </div>
        {/* The local's own sheets first, under their heading line (the mock's `.s9-col` of `.s9-eqs`). */}
        {open && node.equipment.length > 0 ? (
          <p className="s9-col s9-col-direct">
            <span className="s9-col-name">{t.locDirectTitle}</span>
            <span className="s9-col-meta">{node.ownCounterText}</span>
          </p>
        ) : null}
        {equipmentList}
        {/* The mock draws "Adicionar equipamento no local" right under the local's own sheets;
            a local that holds colunas directly keeps "Adicionar bloco em ⟨local⟩" after them, as before. */}
        {onLocal ? addButton : null}
        {colunaList}
        {onLocal ? null : addButton}
        {open && paineis.length > 0 ? (
          <ul className="s9-pnls" id={pnlsId} aria-label={t.painelListLabel(node.name)}>
            {paineis.map((child) => (
              <SumarioLocation key={child.id} node={child} shared={shared} />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }
  if (painel) {
    const className = ['s9-painel', open && 'is-open', current && 'is-current', reorder.dragging && 'is-dragging'].filter(Boolean).join(' ');
    return (
      <li className={className} data-location-id={node.id} data-level={node.level} {...reorder.rowProps}>
        <div className="s9-pnl-row" onKeyDown={onKeyDown}>
          {chevron}
          {reorderControls}
          <span className="s9-pnl-body">
            <span className="s9-pnl-name">
              {node.name}
              {current && !open ? <span className="sum-here"> {copy.sumario.here}</span> : null}
            </span>
            <span className="s9-pnl-meta">{node.meta}</span>
          </span>
          <span className="progress-counter" data-state={node.counterState}>
            <span className="dot" aria-hidden="true" />
            {node.counterText}
          </span>
          <OverflowMenu name={node.controlName} items={menu} />
        </div>
        {/* A painel takes no block, but a row can still sit on one (a block whose op was folded
            before the painel reached this device): it is counted, so it is drawn. A block never vanishes. */}
        {equipmentList}
        {colunaList}
        {open && colunas.length === 0 ? (
          // A painel only groups colunas: with none, it says why it takes no equipment.
          <>
            <p className="section-note pnl-empty" role="note">
              {t.painelEmpty}
            </p>
            <AriaButton className="btn btn-text s9-add" onPress={() => shared.actions.addLocation(node, 'coluna')}>
              <PlusIcon />
              {t.addColuna}
            </AriaButton>
          </>
        ) : null}
        {open && target !== null ? (
          <AriaButton className="btn btn-text s9-add" onPress={() => shared.openPalette({ locationId: target, anchorBlockId: null })}>
            <PlusIcon />
            {t.addBlockIn(node.name)}
          </AriaButton>
        ) : null}
      </li>
    );
  }
  return (
    <li className={['s9-coluna', open && 'is-open', reorder.dragging && 'is-dragging'].filter(Boolean).join(' ')} data-location-id={node.id} data-level={node.level} {...reorder.rowProps}>
      <div className="s9-col" onKeyDown={onKeyDown}>
        {chevron}
        {reorderControls}
        <span className="s9-col-name">{node.name}</span>
        <span className="s9-col-meta">{node.counterText}</span>
        <OverflowMenu name={node.controlName} items={menu} />
      </div>
      {equipmentList}
      {colunaList}
    </li>
  );
}, sameRow);

function equipmentMenu(node: TreeEquipmentNode, shared: Shared, reorder: Reorder, trigger: () => HTMLElement | null) {
  const t = copy.sumario.tree;
  const s = copy.sumario;
  const items: OverflowMenuAction[] = [{ id: 'add-below', label: s.addBelow, onAction: () => shared.openPalette({ locationId: node.locationId, anchorBlockId: node.blockId }) }];
  if (node.position > 1) items.push({ id: 'up', label: s.moveUp, onAction: () => void reorder.moveTo(node.position - 2, trigger) });
  if (node.position < node.siblings) items.push({ id: 'down', label: s.moveDown, onAction: () => void reorder.moveTo(node.position, trigger) });
  // Story 11.2 (EXPERIENCE.md: "Mover para…" beside "Subir · Descer" wherever a location can change).
  if (shared.canMove(node)) items.push({ id: 'move-to', label: t.moveTo, onAction: () => shared.openDialog({ kind: 'move', node }) });
  items.push({ id: 'duplicate', label: s.duplicate, onAction: () => shared.openDialog({ kind: 'duplicate', node }) });
  // DESIGN.md Block card row: "Marcar não ensaiado" right after "Duplicar"; kept available
  // whatever `concluded_by` holds (AR-17 precedence lets not_tested override it), hidden
  // only once the sheet is already not tested (spec OPEN QUESTION, the literal AC reading).
  if (node.state !== 'nao_ensaiada') items.push({ id: 'not-tested', label: t.markNotTested, onAction: () => shared.openDialog({ kind: 'not-tested', node }) });
  if (node.equipmentId !== null) items.push({ id: 'rename-tag', label: t.renameTag, onAction: () => shared.openDialog({ kind: 'rename-tag', node }) });
  const destructiveItems: OverflowMenuAction[] = [{ id: 'remove', label: s.remove, onAction: () => shared.requestRemove(node) }];
  return { items, destructiveItems };
}

/** An equipment row: drag handle, Position box, the row body that opens the sheet, the Overflow, and the duplicate line. */
const SumarioEquipment = memo(function SumarioEquipment({ node, shared }: { node: TreeEquipmentNode; shared: Shared }) {
  const t = copy.sumario.tree;
  const reorder = useReorder({
    itemKey: node.blockId,
    position: node.position,
    siblings: node.siblings,
    onMove: (to) => shared.actions.moveBlock(node, to),
    focusFrames: LIST_FOCUS_WATCH_FRAMES,
  });
  const trigger = () => blockTrigger(reorder.row());
  const menu = equipmentMenu(node, shared, reorder, trigger);
  const current = shared.currentBlockId === node.blockId;
  const className = ['s9-eq', current && 'is-current', reorder.dragging && 'is-dragging'].filter(Boolean).join(' ');
  return (
    <li
      className={className}
      data-block-id={node.blockId}
      data-level={node.level}
      aria-current={current ? 'true' : undefined}
      {...reorder.rowProps}
      onKeyDown={(event) => {
        reorder.rowProps.onKeyDown(event);
        if (!event.defaultPrevented) treeKeys(event, null, () => undefined);
      }}
    >
      <DragHandle name={node.name} reorder={reorder} />
      <PositionBox name={node.name} position={node.position} siblings={node.siblings} reorder={reorder} className="s9-pos" />
      <button type="button" className="s9-eq-open" data-tree-open onClick={() => shared.actions.openSheet(node.blockId)}>
        <span className="block-tag">{node.tag}</span>
        <span className="s9-eq-name">
          <WholeWords className="s9-word" text={node.typeLabel} />
        </span>
        {current ? <span className="sum-here">{copy.sumario.here}</span> : null}
        <span className="s9-state" data-state={node.sumarioStateAttr}>
          <span aria-hidden="true">{node.glyph}</span> {node.stateText}
        </span>
      </button>
      <OverflowMenu name={node.name} items={menu.items} destructiveItems={menu.destructiveItems} />
      {node.duplicate ? (
        <p className="s9-dup">
          <span>{duplicateTagText(node.tag)}</span>
          <TextButton aria-label={t.renameDuplicateLabel(node.tag, shared.pathOf(node.locationId))} onPress={() => shared.openDialog({ kind: 'rename-tag', node })}>
            {t.rename}
          </TextButton>
        </p>
      ) : null}
    </li>
  );
}, sameRow);

// --- the rail presentation -------------------------------------------------------------

const RailLocation = memo(function RailLocation({ node, shared }: { node: TreeLocationNode; shared: Shared }) {
  const t = copy.sumario.tree;
  const open = shared.isOpen(node);
  const groupId = useId();
  const menu = locationMenu(node, shared, null, () => null);
  // Story 14.3: a local opens on its "Verificações do local" row, so it always has something below.
  const site = node.site;
  const hasChildren = site !== null || node.equipment.length > 0 || node.locations.length > 0;
  return (
    <li data-location-id={node.id}>
      <div className="tree-row" data-level={node.level} onKeyDown={(event) => treeKeys(event, hasChildren ? open : null, (value) => shared.setOpen(node, value))}>
        {hasChildren ? (
          <button
            type="button"
            className="tree-chevron"
            data-tree-chevron={node.id}
            aria-label={open ? t.collapse(node.controlName) : t.expand(node.controlName)}
            aria-expanded={open}
            aria-controls={open ? groupId : undefined}
            onClick={() => shared.setOpen(node, !open)}
          >
            <Chevron />
          </button>
        ) : (
          // Nothing hangs below (an empty local, a new painel or coluna): no control that expands to nothing.
          <span className="tree-chevron" aria-hidden="true" />
        )}
        <div className="tree-body">
          <span>{node.name}</span>
          {/* Story 14.2: the rail line of each level is the kernel's ("Local · Entrada · 1 painel · 3 de 9 fichas", "Painel · 1 coluna · 3 de 9"). */}
          <span className="tree-meta">{node.railMeta}</span>
        </div>
        {menu.length > 0 ? <OverflowMenu name={node.controlName} items={menu} /> : null}
      </div>
      {open && hasChildren ? (
        <ul className="relatorio-tree" id={groupId}>
          {/* Story 14.3 (`shell-foot.html`): the local's site checklist first, one level under it. */}
          {site === null ? null : (
            <li data-site-of={node.id}>
              <div className="tree-row" data-level={node.level + 1} onKeyDown={(event) => treeKeys(event, null, () => undefined)}>
                <span className="tree-chevron" aria-hidden="true">
                  <svg className="ico" aria-hidden="true">
                    <use href="/sprite.svg#i-check-all" />
                  </svg>
                </span>
                <button type="button" className="tree-body" data-tree-open aria-label={copy.local.entryLabel(SITE_CHECKLIST_LABEL, node.name)} onClick={() => shared.actions.openVerificacoes(node.id)}>
                  <span>{SITE_CHECKLIST_LABEL}</span>
                  <span className="tree-meta">{site.railMeta}</span>
                </button>
                <span className="tree-state" data-state={site.railStateAttr}>
                  <span aria-hidden="true">{site.glyph}</span>
                  {site.railCounter}
                </span>
              </div>
            </li>
          )}
          {node.equipment.map((row) => (
            <RailEquipment key={row.blockId} node={row} shared={shared} />
          ))}
          {node.locations.map((child) => (
            <RailLocation key={child.id} node={child} shared={shared} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}, sameRow);

const RailEquipment = memo(function RailEquipment({ node, shared }: { node: TreeEquipmentNode; shared: Shared }) {
  const current = shared.currentBlockId === node.blockId;
  return (
    <li data-block-id={node.blockId}>
      <div
        className={current ? 'tree-row is-selected' : 'tree-row'}
        data-level={node.level}
        aria-current={current ? 'true' : undefined}
        onKeyDown={(event) => treeKeys(event, null, () => undefined)}
      >
        <span className="tree-chevron" aria-hidden="true" />
        <button type="button" className="tree-body" data-tree-open onClick={() => shared.actions.openSheet(node.blockId)}>
          <span>{node.typeLabel}</span>
          {/* F-07: the TAG never breaks inside itself; the reason after it wraps as words do. */}
          <span className="tree-meta">
            {node.tag === '' ? null : <span className="tree-tag">{node.tag}</span>}
            {node.railMetaRest}
          </span>
        </button>
        {/* The 320 px rail keeps the state to its word; a not-tested sheet's reason is on the meta line (review F-1). */}
        <span className="tree-state" data-state={node.stateAttr}>
          <span aria-hidden="true">{node.glyph}</span>
          {node.stateWord}
        </span>
      </div>
    </li>
  );
}, sameRow);
