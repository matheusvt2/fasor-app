import {
  duplicateTagSuggestion,
  locationPathText,
  locationRemovalAsks,
  locationRemovalConfirmLabel,
  locationRemovalConfirmText,
  locationRemovalConfirmTitle,
  locationRemovalPlan,
  locationTree,
  moveTargets,
  paletteLocationFor,
  sectionMention,
  sectionRefText,
  removeBlockTitle,
  treePathTo,
  type EquipmentRow,
  type RelatorioSnapshot,
  type PhotoFileRow,
  type SuggestionRow,
} from '@app/domain';
import { useSearchParams } from 'react-router';
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import { ConfirmDialog, TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import { FieldPalette, type PaletteTarget } from './block-palette-field.tsx';
import { PanelCapture, panelAwaitingRows, type PanelCaptureHandle } from './panel-capture.tsx';
import { useSession } from '../../state/session.tsx';
import { useAiFeatures } from '../../state/ai-features.tsx';
import { blockOpen, blockRow, blockTrigger, locationChevron, locationRow, locationTrigger, useTreeActions, type TreeContext } from './tree-actions.ts';
import { NameDialog, TagDialog } from './tag-dialogs.tsx';
import { NotTestedDialog } from './not-tested-dialog.tsx';
import { MoveBlockDialog } from './move-block-dialog.tsx';
import { LocalDialog } from '../templates/local-dialog.tsx';
import { RailLocation } from './relatorio-tree-rail.tsx';
import type { Dialog, Shared } from './relatorio-tree-shared.tsx';
import { SumarioLocation } from './relatorio-tree-sumario.tsx';

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
 *   the foot. Everything that edits the tree lives here, "Remover" of a coluna, a painel or
 *   a local included (Story 14.2, second pass).
 * - `rail`: the tree alone (`shell-foot.html` `.relatorio-tree`), locais, painéis, colunas
 *   and fichas, the current sheet `aria-current`; its local Overflow opens the first sheet
 *   and toggles "Agrupar por tipo", nothing more (no removal).
 *
 * Rows are lists with `aria-expanded` chevrons, not an ARIA `tree`: each row holds a
 * Position box, buttons and a menu. Left/Right on a focused chevron or row body expand and
 * collapse, and Left on a leaf or a collapsed node goes to its parent's chevron. Expand
 * state is local to the mount and never persisted: locais start collapsed (the path to
 * the last sheet opens when the Sumário opens on it), painéis and colunas open with their local.
 *
 * E14-A7: this module keeps the tree core (the expand state, the focus requests, the row
 * context and the dialogs); the rows of each presentation live in `relatorio-tree-sumario.tsx`
 * and `relatorio-tree-rail.tsx`, and what they share in `relatorio-tree-shared.tsx`.
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
  /**
   * F-24, 2026-10-14: "NC abertos" landing on a local's NC site items: that local's
   * "Verificações do local" button (`.s9-verif`) takes the focus. Wins over `focusBlockId`.
   */
  focusLocationId?: string | null;
  /** F-24: a new value asks for `focusBlockId` (or `focusLocationId`) again (a Sumário header count tapped once more). */
  focusToken?: number;
  context: TreeContext;
  ref?: Ref<RelatorioTreeHandle>;
  /** Story 8.1: the device's pending suggestion rows; a block holding one is not concluded in the counters. */
  pending?: readonly SuggestionRow[];
}

/**
 * What the press of "Remover" reads the plan with: the Confirm needs the counts alone (the
 * locations and the sheets under the target), which no other relatório changes. The batch
 * is planned again on the fresh rows, with the obra's other relatórios, when it is written.
 */
const COUNTS_ONLY = { otherBlocks: [], visibility: { companyDownloaded: false, summaries: [], heldRelatorioIds: [], downloadedStreamIds: [] } } as const;

/** A local's "Verificações do local" button (`.s9-verif`) on its card, the first under the open local (Story 15.2), or null while not drawn. */
function siteRowButton(root: HTMLElement | null, locationId: string): HTMLElement | null {
  return root?.querySelector<HTMLElement>(`li[data-location-id="${CSS.escape(locationId)}"] > ul.s9-site .s9-verif`) ?? null;
}

export function RelatorioTree({ presentation, snapshot, equipment, lastSheetId, id, expandToLastSheet = false, focusBlockId = null, focusLocationId = null, focusToken = 0, context, ref, pending }: RelatorioTreeProps) {
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

  // Read at call time: a row's menu action needs the latest snapshot, not the one `shared` was built with.
  const latestSnapshot = useRef(snapshot);
  latestSnapshot.current = snapshot;

  const host = useMemo(
    () => ({
      root: () => rootRef.current,
      sectionMention: (section: number) => sectionMention(latestSnapshot.current, section),
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
    if (focusSeeded.current) return;
    // Story 15.2: a local's site card is drawn only while the local is open, so the local opens.
    // Only a root this tree draws with a site checklist is a target; anything else asks for nothing.
    if (focusLocationId !== null) {
      if (!tree.some((node) => node.id === focusLocationId && node.site !== null)) return;
      focusSeeded.current = true;
      focusPending.current = true;
      reveal(focusLocationId);
      return;
    }
    if (focusBlockId === null) return;
    const path = treePathTo(tree, { blockId: focusBlockId });
    if (path.length === 0) return;
    focusSeeded.current = true;
    focusPending.current = true;
    reveal(path.at(-1)!);
  }, [focusBlockId, focusLocationId, focusToken, tree, reveal]);
  useEffect(() => {
    if (!focusPending.current) return;
    if (focusLocationId !== null) {
      const verif = siteRowButton(rootRef.current, focusLocationId);
      if (verif === null) return;
      focusPending.current = false;
      verif.scrollIntoView?.({ block: 'center' });
      verif.focus({ preventScroll: true });
      return;
    }
    if (focusBlockId === null) return;
    const open = blockOpen(rootRef.current, focusBlockId);
    if (open === null) return;
    focusPending.current = false;
    blockRow(rootRef.current, focusBlockId)?.scrollIntoView?.({ block: 'center' });
    open.focus({ preventScroll: true });
  });

  // The path to the last sheet, kept by content so a rebuilt tree with the same path keeps `shared`.
  const currentPathKey = (lastSheetId === null ? [] : treePathTo(tree, { blockId: lastSheetId })).join(' ');
  const currentPath = useMemo(() => new Set(currentPathKey === '' ? [] : currentPathKey.split(' ')), [currentPathKey]);
  // F43: the name of section 9 the rows' "Agrupar por tipo na seção N" says; a new position renews `shared`.
  const section9Ref = sectionRefText(snapshot, 9);
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
      sectionRef: (section) => sectionRefText(latestSnapshot.current, section),
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
      requestRemoveLocation: (node) => {
        const current = latestSnapshot.current;
        const plan = locationRemovalPlan({
          locations: current.locations,
          blocks: current.blocks,
          locationId: node.id,
          projectId: context.projectId,
          relatorioId: context.relatorioId,
          // Epic 14 QA Q-6: a local's site photos and points count, as its site answers do.
          files: current.files,
          points: current.points,
          ...COUNTS_ONLY,
        });
        // With a sheet or a local's site work underneath (`locationRemovalAsks`), the consequence
        // is stated first; with none, the location leaves at once (a location gone meanwhile is
        // answered by the action's own toast).
        if (plan !== null && locationRemovalAsks(plan.counts)) setDialog({ kind: 'remove-location', node, plan });
        else actions.removeLocation(node);
      },
    }),
    // `locationsKey` is read through `latestSnapshot`; it is a dependency so a new path renews `shared`.
    [presentation, expanded, lastSheetId, currentPath, actions, locationsKey, section9Ref, context.projectId, context.relatorioId],
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
      {dialog?.kind === 'remove-location' ? (
        <ConfirmDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) closeDialog(() => locationTrigger(locationRow(rootRef.current, dialog.node.id)));
          }}
          title={locationRemovalConfirmTitle(dialog.node.controlName)}
          description={locationRemovalConfirmText(dialog.plan.kind, dialog.plan.counts)}
          confirmLabel={locationRemovalConfirmLabel(dialog.plan.kind)}
          cancelLabel={ui.confirmDialog.cancel}
          isDestructive
          onConfirm={() => {
            const node = dialog.node;
            setDialog(null);
            actions.removeLocation(node);
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
          seedVersion={context.seedVersion}
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
          seedVersion={context.seedVersion}
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
