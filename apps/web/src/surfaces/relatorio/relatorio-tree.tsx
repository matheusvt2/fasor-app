import {
  duplicateTagSuggestion,
  duplicateTagText,
  locationTree,
  removeBlockTitle,
  treePathTo,
  type EquipmentRow,
  type RelatorioSnapshot,
  type TreeEquipmentNode,
  type TreeLocationNode,
} from '@app/domain';
import { Button as AriaButton } from 'react-aria-components';
import { useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { ConfirmDialog, OverflowMenu, TextButton, type OverflowMenuAction } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import { DragHandle, PositionBox } from '../templates/reorder-controls.tsx';
import { LIST_FOCUS_WATCH_FRAMES, useReorder, type Reorder } from '../templates/use-reorder.ts';
import { FieldPalette, type PaletteTarget } from './block-palette-field.tsx';
import { blockRow, blockTrigger, locationChevron, useTreeActions, type TreeActions, type TreeContext } from './tree-actions.ts';
import { NameDialog, TagDialog } from './tag-dialogs.tsx';

/*
 * Stories 4.4 and 4.5: the location tree, ONE component in two presentations
 * (EXPERIENCE.md › Relatório tree).
 *
 * - `sumario`: section 9's expansion on the Sumário (`40-relatorio-overview.html`
 *   `.s9-tree`): cabine rows with their data line, counter and Overflow; coluna rows;
 *   equipment rows with the Position box, the drag handle, the state glyph and word and the
 *   Overflow; "Adicionar bloco em ⟨cabine⟩" under each open cabine and "Adicionar cabine"
 *   at the foot. Everything that edits the tree lives here.
 * - `rail`: the tree alone (`shell-foot.html` `.relatorio-tree`), cabines and fichas, the
 *   current sheet `aria-current`; its cabine Overflow opens the first sheet and toggles
 *   "Agrupar por tipo", nothing more.
 *
 * Rows are lists with `aria-expanded` chevrons, not an ARIA `tree`: each row holds a
 * Position box, buttons and a menu. Left/Right on a focused chevron or row body expand and
 * collapse, and Left on a leaf or a collapsed node goes to its parent's chevron. Expand
 * state is local to the mount and never persisted: cabines start collapsed (the path to
 * the last sheet opens when the Sumário opens on it), colunas open with their cabine.
 */

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
  context: TreeContext;
  ref?: Ref<RelatorioTreeHandle>;
}

type Dialog =
  | { kind: 'remove'; node: TreeEquipmentNode }
  | { kind: 'duplicate'; node: TreeEquipmentNode }
  | { kind: 'rename-tag'; node: TreeEquipmentNode }
  | { kind: 'rename-location'; node: TreeLocationNode };

/** What every row of one render shares. */
interface Shared {
  presentation: 'sumario' | 'rail';
  isOpen: (node: TreeLocationNode) => boolean;
  setOpen: (node: TreeLocationNode, open: boolean) => void;
  currentBlockId: string | null;
  currentPath: ReadonlySet<string>;
  actions: TreeActions;
  openPalette: (target: PaletteTarget) => void;
  openDialog: (dialog: Dialog) => void;
  requestRemove: (node: TreeEquipmentNode) => void;
}

const Chevron = () => (
  <svg className="ico" aria-hidden="true">
    <use href="/sprite.svg#i-chev-down" />
  </svg>
);

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

export function RelatorioTree({ presentation, snapshot, equipment, lastSheetId, id, expandToLastSheet = false, context, ref }: RelatorioTreeProps) {
  const t = copy.sumario.tree;
  const tree = useMemo(() => locationTree(snapshot, equipment), [snapshot, equipment]);
  const rootRef = useRef<HTMLUListElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [palette, setPalette] = useState<PaletteTarget | null>(null);
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
      addCabine: () => footRef.current?.querySelector<HTMLElement>('button') ?? null,
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

  const currentPath = useMemo(() => new Set(lastSheetId === null ? [] : treePathTo(tree, { blockId: lastSheetId })), [tree, lastSheetId]);

  const shared: Shared = {
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
    openDialog: setDialog,
    requestRemove: (node) => {
      // EXPERIENCE.md › Block Model: only a sheet holding data asks first (the kernel's `holdsData`).
      if (node.holdsData) setDialog({ kind: 'remove', node });
      else actions.removeBlock(node);
    },
  };

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
            <TextButton onPress={() => actions.addLocation(null)}>
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-plus" />
              </svg>
              {t.addCabine}
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
        />
      )}

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
          action={copy.sumario.tagDialogs.duplicate}
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

function locationMenu(node: TreeLocationNode, shared: Shared, reorder: Reorder | null, trigger: () => HTMLElement | null): OverflowMenuAction[] {
  const t = copy.sumario.tree;
  const items: OverflowMenuAction[] = [];
  if (node.kind === 'cabine') {
    if (node.firstBlockId !== null) {
      const first = node.firstBlockId;
      items.push({ id: 'open-first', label: t.openFirst, onAction: () => shared.actions.openSheet(first) });
    }
    items.push({ id: 'agrupar', label: t.agrupar, checked: node.agruparPorTipo === true, onAction: () => shared.actions.toggleAgrupar(node) });
  }
  if (shared.presentation === 'rail') return items;
  items.push({ id: 'add-block', label: t.addBlock, onAction: () => shared.openPalette({ locationId: node.id, anchorBlockId: null }) });
  if (node.kind === 'cabine') items.push({ id: 'add-coluna', label: t.addColuna, onAction: () => shared.actions.addLocation(node) });
  items.push({ id: 'rename', label: t.rename, onAction: () => shared.openDialog({ kind: 'rename-location', node }) });
  if (reorder !== null && node.position > 1) items.push({ id: 'up', label: t.moveUp, onAction: () => void reorder.moveTo(node.position - 2, trigger) });
  if (reorder !== null && node.position < node.siblings) items.push({ id: 'down', label: t.moveDown, onAction: () => void reorder.moveTo(node.position, trigger) });
  return items;
}

/** A cabine row, or a coluna row (any location below a cabine), with what hangs under it when open. */
function SumarioLocation({ node, shared }: { node: TreeLocationNode; shared: Shared }) {
  const t = copy.sumario.tree;
  const open = shared.isOpen(node);
  const eqsId = useId();
  const colsId = useId();
  const reorder = useReorder({
    itemKey: node.id,
    position: node.position,
    siblings: node.siblings,
    onMove: (to) => shared.actions.moveLocation(node, to),
    focusFrames: LIST_FOCUS_WATCH_FRAMES,
  });
  const trigger = () => reorder.row()?.querySelector<HTMLElement>(':scope > .s9-cab-row .overflow-trigger, :scope > .s9-col .overflow-trigger') ?? null;
  const menu = locationMenu(node, shared, reorder, trigger);
  const cabine = node.kind === 'cabine' && node.level === 0;
  const current = shared.currentPath.has(node.id);
  const controls = [node.equipment.length > 0 ? eqsId : null, node.locations.length > 0 ? colsId : null].filter(Boolean).join(' ');

  const chevron = (
    <button
      type="button"
      className="tree-chevron"
      data-tree-chevron={node.id}
      aria-label={open ? t.collapse(node.name) : t.expand(node.name)}
      aria-expanded={open}
      aria-controls={open && controls !== '' ? controls : undefined}
      onClick={() => shared.setOpen(node, !open)}
    >
      <Chevron />
    </button>
  );
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => treeKeys(event, open, (value) => shared.setOpen(node, value));
  const children: ReactNode = open ? (
    <>
      {node.equipment.length > 0 ? (
        <ul className="s9-eqs" id={eqsId}>
          {node.equipment.map((row) => (
            <SumarioEquipment key={row.blockId} node={row} shared={shared} />
          ))}
        </ul>
      ) : null}
      {node.locations.length > 0 ? (
        <ul className="s9-cols" id={colsId}>
          {node.locations.map((child) => (
            <SumarioLocation key={child.id} node={child} shared={shared} />
          ))}
        </ul>
      ) : null}
    </>
  ) : null;

  if (cabine) {
    const className = ['s9-cabine', open && 'is-open', current && 'is-current'].filter(Boolean).join(' ');
    return (
      <li className={className} data-location-id={node.id} {...reorder.rowProps}>
        <div className="s9-cab-row" onKeyDown={onKeyDown}>
          {chevron}
          <span className="s9-cab-body">
            <span className="s9-cab-name">
              {node.name}
              {/* The last sheet's row says it when drawn; a collapsed cabine says it for it. */}
              {current && !open ? <span className="sum-here"> {copy.sumario.here}</span> : null}
            </span>
            <span className="s9-cab-meta">{node.meta}</span>
          </span>
          <span className="progress-counter" data-state={node.counterState}>
            <span className="dot" aria-hidden="true" />
            {node.counterText}
          </span>
          <OverflowMenu name={node.name} items={menu} />
        </div>
        {children}
        {open ? (
          <AriaButton className="btn btn-text s9-add" onPress={() => shared.openPalette({ locationId: node.id, anchorBlockId: null })}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-plus" />
            </svg>
            {t.addBlockIn(node.name)}
          </AriaButton>
        ) : null}
      </li>
    );
  }
  return (
    <li className={open ? 's9-coluna is-open' : 's9-coluna'} data-location-id={node.id} data-level={node.level} {...reorder.rowProps}>
      <div className="s9-col" onKeyDown={onKeyDown}>
        {chevron}
        <span className="s9-col-name">{node.name}</span>
        <span className="s9-col-meta">{node.counterText}</span>
        <OverflowMenu name={node.name} items={menu} />
      </div>
      {children}
    </li>
  );
}

function equipmentMenu(node: TreeEquipmentNode, shared: Shared, reorder: Reorder, trigger: () => HTMLElement | null) {
  const t = copy.sumario.tree;
  const items: OverflowMenuAction[] = [{ id: 'add-below', label: t.addBelow, onAction: () => shared.openPalette({ locationId: node.locationId, anchorBlockId: node.blockId }) }];
  if (node.position > 1) items.push({ id: 'up', label: t.moveUp, onAction: () => void reorder.moveTo(node.position - 2, trigger) });
  if (node.position < node.siblings) items.push({ id: 'down', label: t.moveDown, onAction: () => void reorder.moveTo(node.position, trigger) });
  items.push({ id: 'duplicate', label: t.duplicate, onAction: () => shared.openDialog({ kind: 'duplicate', node }) });
  if (node.equipmentId !== null) items.push({ id: 'rename-tag', label: t.renameTag, onAction: () => shared.openDialog({ kind: 'rename-tag', node }) });
  const destructiveItems: OverflowMenuAction[] = [{ id: 'remove', label: t.remove, onAction: () => shared.requestRemove(node) }];
  return { items, destructiveItems };
}

/** An equipment row: drag handle, Position box, the row body that opens the sheet, the Overflow, and the duplicate line. */
function SumarioEquipment({ node, shared }: { node: TreeEquipmentNode; shared: Shared }) {
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
        <span className="s9-eq-name">{node.typeLabel}</span>
        {current ? <span className="sum-here">{copy.sumario.here}</span> : null}
        <span className="s9-state" data-state={node.sumarioStateAttr}>
          <span aria-hidden="true">{node.glyph}</span> {node.stateText}
        </span>
      </button>
      <OverflowMenu name={node.name} items={menu.items} destructiveItems={menu.destructiveItems} />
      {node.duplicate ? (
        <p className="s9-dup">
          <span>{duplicateTagText(node.tag)}</span>
          <TextButton onPress={() => shared.openDialog({ kind: 'rename-tag', node })}>{t.rename}</TextButton>
        </p>
      ) : null}
    </li>
  );
}

// --- the rail presentation -------------------------------------------------------------

function RailLocation({ node, shared }: { node: TreeLocationNode; shared: Shared }) {
  const t = copy.sumario.tree;
  const open = shared.isOpen(node);
  const groupId = useId();
  const menu = locationMenu(node, shared, null, () => null);
  const hasChildren = node.equipment.length > 0 || node.locations.length > 0;
  return (
    <li data-location-id={node.id}>
      <div className="tree-row" data-level={node.level} onKeyDown={(event) => treeKeys(event, hasChildren ? open : null, (value) => shared.setOpen(node, value))}>
        {hasChildren ? (
          <button
            type="button"
            className="tree-chevron"
            data-tree-chevron={node.id}
            aria-label={open ? t.collapse(node.name) : t.expand(node.name)}
            aria-expanded={open}
            aria-controls={open ? groupId : undefined}
            onClick={() => shared.setOpen(node, !open)}
          >
            <Chevron />
          </button>
        ) : (
          // Nothing hangs below (an empty cabine, a new coluna): no control that expands to nothing.
          <span className="tree-chevron" aria-hidden="true" />
        )}
        <div className="tree-body">
          <span>{node.name}</span>
          <span className="tree-meta">{node.kind === 'cabine' && node.level === 0 ? node.meta : node.counterText}</span>
        </div>
        {menu.length > 0 ? <OverflowMenu name={node.name} items={menu} /> : null}
      </div>
      {open && hasChildren ? (
        <ul className="relatorio-tree" id={groupId}>
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
}

function RailEquipment({ node, shared }: { node: TreeEquipmentNode; shared: Shared }) {
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
          <span className="tree-meta">{node.tag}</span>
        </button>
        <span className="tree-state" data-state={node.stateAttr}>
          <span aria-hidden="true">{node.glyph}</span>
          {node.stateText}
        </span>
      </div>
    </li>
  );
}
