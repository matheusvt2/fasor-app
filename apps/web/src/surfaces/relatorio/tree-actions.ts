import {
  addedText,
  agruparToggledText,
  blockCreatedText,
  blockMovedText,
  equipmentFreedByRemoval,
  isEquipmentBlockType,
  locationBlocks,
  localUpdatedText,
  locationControlName,
  locationRemovalPlan,
  locationRemovedText,
  moveAnnouncement,
  moveLandingIndex,
  movePlan,
  newBlockOrderKey,
  newEquipmentBlock,
  newLocation,
  orderKeyForMove,
  panelRetargetOps,
  panelSuggestionStatusOp,
  removedAncestorIds,
  renamedText,
  siblingLocations,
  suggestTag,
  tagRenamedText,
  tagTakenText,
  tagVerdict,
  toIso,
  type BlockRow,
  type EquipmentRow,
  type LocationRemovalPlan,
  type LocationRestorePlan,
  type LocationRow,
  type MovePlan,
  type OpDraft,
  type RelatorioSummary,
  type TreeEquipmentNode,
  type TreeLocationNode,
} from '@app/domain';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { projectBlockRows } from '../../db/home-store.ts';
import { writeLastSheet } from '../../db/prefs.ts';
import { relatorioVisibility, type RelatorioVisibility } from '../../db/sync-store.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import { notTestedOp } from '../ficha/ficha-ops.ts';
import type { PaletteCreate, PanelPhotoInput } from './block-palette-field.tsx';
import type { Build, RelatorioEditor } from './relatorio-editor.ts';
import { focusAfterRemoval, restoreFocus } from '../../input/focus-restore.ts';
import {
  createBlockOp,
  createEquipmentOp,
  createLocationOp,
  equipmentRemovedOp,
  locationRemovedOp,
  putAgruparOp,
  putBlockOp,
  putEquipmentTagOp,
  putFuncaoOp,
  putLocationOp,
  removeBlockOp,
  type Author,
} from './relatorio-ops.ts';

/*
 * Stories 4.4 and 4.5: every write the location tree makes, through the relatório's one
 * edit queue (`useRelatorioEditor`): a block created from the palette or by "Duplicar", a
 * block or a location moved, a block removed, a TAG renamed, a location added, renamed or
 * removed with everything under it (Story 14.2, second pass), the local's "Agrupar por tipo"
 * and its "Função e nome" (Story 14.2: a local, a painel or a coluna). Each is one batch, announced where it moves something and undoable from a toast;
 * each hands the focus to a control on purpose (E3-A8).
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
  /** The foot's "Adicionar local" (the focus target once an added local is undone). */
  addLocal: () => HTMLElement | null;
}

export interface TreeActions {
  openSheet: (blockId: string) => void;
  moveBlock: (node: TreeEquipmentNode, toIndex: number) => Promise<void>;
  moveLocation: (node: TreeLocationNode, toIndex: number) => Promise<void>;
  /** Story 11.2: "Mover para…" to another location, with the TAG re-suggested when `rename`. */
  moveToLocation: (node: TreeEquipmentNode, targetId: string, rename: boolean) => void;
  createBlock: (input: PaletteCreate) => void;
  removeBlock: (node: TreeEquipmentNode) => void;
  /**
   * Story 14.2, second pass: "Remover" of a coluna, a painel or a local. One batch tombstones
   * the location, every live location under it, every live sheet on them and the equipment
   * the removal frees (the kernel's `locationRemovalPlan` on the rows as they are at commit time).
   */
  removeLocation: (node: TreeLocationNode) => void;
  duplicateBlock: (node: TreeEquipmentNode, tag: string) => void;
  renameTag: (node: TreeEquipmentNode, tag: string) => void;
  markNotTested: (node: TreeEquipmentNode, reason: string, text: string | null) => void;
  /** "Adicionar painel" under a local; "Adicionar coluna" under a painel, or under a local that already holds colunas directly. */
  addLocation: (parent: TreeLocationNode, kind: 'painel' | 'coluna') => void;
  /** The foot's "Adicionar local", with what the Função dialog chose. */
  addLocal: (chosen: { funcao: string | null; name: string }) => void;
  /** "Função e nome": the local's `funcao` and `name` puts in one batch. A null Função leaves the stored one as it is. */
  updateLocal: (node: TreeLocationNode, chosen: { funcao: string | null; name: string }) => void;
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

/** The `li` of a location row. */
export function locationRow(root: HTMLElement | null, locationId: string): HTMLElement | null {
  return root?.querySelector<HTMLElement>(`li[data-location-id="${esc(locationId)}"]`) ?? null;
}

/** A location row's own Overflow trigger (the Sumário presentation: a local, a painel or a coluna row). */
export function locationTrigger(row: Element | null | undefined): HTMLElement | null {
  return row?.querySelector<HTMLElement>(':scope > .s9-loc-row .overflow-trigger, :scope > .s9-pnl-row .overflow-trigger, :scope > .s9-col .overflow-trigger') ?? null;
}

/** A location's chevron. */
export function locationChevron(root: HTMLElement | null, locationId: string): HTMLElement | null {
  return root?.querySelector<HTMLElement>(`[data-tree-chevron="${esc(locationId)}"]`) ?? null;
}

export function useTreeActions(context: TreeContext, host: TreeHost): TreeActions {
  const { relatorioId, projectId, seedVersion, editor } = context;
  const { edit, announce, undoable, settle } = editor;
  const db = useSession().database;
  const { showToast } = useToast();
  const t = copy.sumario.tree;

  const navigate = useNavigate();
  // Story 5.1: a tree row opens its sheet (the rail's rows too, moving to another sheet).
  // The pref is written first, so the path back to it is "você parou aqui".
  const openSheet = useCallback(
    (blockId: string) => {
      const go = () => void navigate(`/relatorio/${relatorioId}/ficha/${blockId}`);
      if (db === null) {
        go();
        return;
      }
      void writeLastSheet(db, relatorioId, blockId).then(go, go);
    },
    [db, relatorioId, navigate],
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
      // Said, and the toast shown, in the render that draws the row in its new slot (Q7).
      settle(
        () => {
          const row = blockRow(host.root(), node.blockId);
          return row === null || row.parentElement === null || [...row.parentElement.children].indexOf(row) === to;
        },
        text,
        // "Desfazer" hands the focus back to the row's Position box once it is in its old slot.
        () =>
          undoable(text, batch, () => {
            const back = blockRow(host.root(), node.blockId);
            const list = back?.parentElement ?? null;
            if (back === null || list === null || [...list.children].indexOf(back) !== fromIndex) return null;
            return back.querySelector<HTMLElement>('.pos-box');
          }),
      );
    },
    [host, edit, relatorioId, showToast, t.gone, settle, undoable],
  );

  const moveLocation = useCallback(
    async (node: TreeLocationNode, toIndex: number) => {
      let present = true;
      let total = node.siblings;
      const batch = await edit((_blocks, by, fresh) => {
        // Story 14.2: a painel moves among the painéis of its local, a coluna among the colunas of its parent.
        const siblings = siblingLocations(fresh.locations, node.parentId, node.parentId === null ? undefined : node.kind);
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
      const text = moveAnnouncement(node.kind, node.name, to + 1, total);
      settle(
        () => {
          const row = host.root()?.querySelector<HTMLElement>(`li[data-location-id="${esc(node.id)}"]`) ?? null;
          return row === null || row.parentElement === null || [...row.parentElement.children].indexOf(row) === to;
        },
        text,
        () => undoable(text, batch, () => locationChevron(host.root(), node.id)),
      );
    },
    [edit, relatorioId, showToast, t.locationGone, settle, undoable, host],
  );

  const moveToLocation = useCallback(
    (node: TreeEquipmentNode, targetId: string, rename: boolean) => {
      void commitMove(edit, { relatorioId, projectId, blockId: node.blockId, targetId, rename })
        .then(({ batch, plan }) => {
          if (batch === null || plan.kind !== 'move') {
            // Already there (another device moved it first): nothing to write, nothing to say.
            if (plan.kind === 'refused' && plan.reason !== 'same-location') showToast(plan.reason === 'gone' ? t.gone : t.locationGone);
            return;
          }
          host.reveal(targetId);
          // The moved row's open button, only once it is drawn under the target: the row in
          // its old place is unmounted by the move, so focusing it would drop the focus on body.
          const moved = () => {
            const row = blockRow(host.root(), node.blockId);
            return row !== null && row.closest(`li[data-location-id="${esc(targetId)}"]`) !== null ? blockOpen(host.root(), node.blockId) : null;
          };
          // Watched from now, not from the settle: the Move dialog's own focus return and a
          // slow re-render (the settle's fallback fires before the row is drawn) must not win.
          restoreFocus(moved, { mode: 'settled', frames: 600 });
          // Said, and the toast shown, in the render that draws the row under its new
          // location (Q7).
          settle(
            () => blockRow(host.root(), node.blockId) === null || moved() !== null,
            plan.text,
            () => {
              // "Desfazer" puts it back: the focus goes to its Overflow trigger under the old location.
              undoable(
                plan.text,
                batch,
                () => blockTrigger(blockRow(host.root(), node.blockId)),
                () => host.reveal(node.locationId),
              );
            },
          );
        })
        .catch(() => undefined);
    },
    [edit, relatorioId, projectId, showToast, t.gone, t.locationGone, host, settle, undoable],
  );

  /** One equipment + block pair, as the palette or "Duplicar" asks for it; `copyFrom` names the block whose config is copied. */
  const createPair = useCallback(
    (input: { type: string; locationId: string; anchorBlockId: string | null; tag: string | null; copyFrom?: string; photo?: PanelPhotoInput }) => {
      const out: { refusal: string | null; created: { tag: string; blockId: string; location: { kind: 'cabine' | 'coluna'; name: string } } | null } = { refusal: null, created: null };
      void edit((blocks, by, fresh) => {
        const location = fresh.locations.find((row) => row.id === input.locationId);
        // A painel takes no block (the kernel's fold refuses one): the palette never opens on it.
        if (location === undefined || location.kind === 'painel' || !isEquipmentBlockType(input.type)) {
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
        // Story 9.2: "Fotografar equipamento" re-targets its photo to the new block's plate, and
        // settles its panel suggestion, in the same batch ("Desfazer" reverts all of it).
        const photo = input.photo;
        const retarget =
          photo === undefined
            ? []
            : [...panelRetargetOps(by, relatorioId, photo.id, pair.block), ...(photo.suggestion === null ? [] : [panelSuggestionStatusOp(by, photo.suggestion.row, photo.suggestion.status)])];
        return [createEquipmentOp(by, pair.equipment), createBlockOp(by, relatorioId, pair.block), ...retarget];
      })
        .then((batch) => {
          const made = out.created;
          if (batch === null || made === null) {
            showToast(out.refusal ?? t.locationGone);
            return;
          }
          host.reveal(input.locationId);
          restoreFocus(() => blockOpen(host.root(), made.blockId), { mode: 'settled' });
          // "Desfazer" removes the new row: the focus goes back to the row it went under, else the location's chevron.
          const anchor = input.anchorBlockId;
          // The toast comes with the new row, never before it (Q7).
          settle(
            () => blockOpen(host.root(), made.blockId) !== null,
            null,
            () =>
              undoable(blockCreatedText(made.tag, made.location), batch, () =>
                anchor !== null && blockOpen(host.root(), anchor) !== null
                  ? blockOpen(host.root(), anchor)
                  : blockOpen(host.root(), made.blockId) === null
                    ? locationChevron(host.root(), input.locationId)
                    : null,
              ),
          );
        })
        .catch(() => undefined);
    },
    [edit, relatorioId, projectId, seedVersion, showToast, t.locationGone, t.gone, host, undoable, settle],
  );

  const createBlock = useCallback((input: PaletteCreate) => createPair(input), [createPair]);

  const duplicateBlock = useCallback(
    (node: TreeEquipmentNode, tag: string) =>
      createPair({ type: node.blockType, locationId: node.locationId, anchorBlockId: node.blockId, tag, copyFrom: node.blockId }),
    [createPair],
  );

  // The obra's other relatórios on this device: a later relatório reuses the project's
  // equipment (Q4), so a sheet's TAG is freed only when no other live block holds it,
  // and only when every relatório of the obra is here to be asked (E9 sweep B15).
  const readElsewhere = useCallback(
    (): Promise<{ others: BlockRow[]; visibility: RelatorioVisibility }> =>
      db === null
        ? Promise.resolve({
            others: [],
            visibility: { companyDownloaded: false, summaries: [], heldRelatorioIds: [relatorioId], downloadedStreamIds: [] } satisfies RelatorioVisibility,
          })
        : Promise.all([projectBlockRows(db, projectId), relatorioVisibility(db)]).then(([rows, visibility]) => ({
            others: rows.filter((row) => row.relatorio_id !== relatorioId),
            visibility,
          })),
    [db, projectId, relatorioId],
  );

  const removeBlock = useCallback(
    (node: TreeEquipmentNode) => {
      const root = host.root();
      const li = blockRow(root, node.blockId);
      const parentId = node.locationId;
      void readElsewhere()
        .then(({ others, visibility }) =>
          edit((blocks, by) => {
            const block = blocks.find((row) => row.id === node.blockId && row.removed_at === null);
            if (block === undefined) return null;
            return removeSheetOps(by, relatorioId, projectId, [...blocks, ...others], block, visibility);
          }),
        )
        .then((batch) => {
          if (batch === null) {
            showToast(t.gone);
            return;
          }
          focusAfterRemoval(li, {
            rows: (list) => [...list.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.matches('li[data-block-id]')),
            focusOf: (row) => row?.querySelector<HTMLElement>('[data-tree-open]') ?? null,
            fallback: () => locationChevron(host.root(), parentId),
            mode: 'settled',
          });
          undoable(
            t.removed,
            batch,
            () => blockTrigger(blockRow(host.root(), node.blockId)),
            () => host.reveal(parentId),
          );
        })
        .catch(() => undefined);
    },
    [host, readElsewhere, edit, relatorioId, projectId, showToast, t.gone, t.removed, undoable],
  );

  const removeLocation = useCallback(
    (node: TreeLocationNode) => {
      const li = locationRow(host.root(), node.id);
      const parentId = node.parentId;
      const out: { plan: LocationRemovalPlan | null; name: string } = { plan: null, name: node.controlName };
      void readElsewhere()
        .then(({ others, visibility }) =>
          edit((blocks, by, fresh) => {
            // The plan on the rows as they are now, removed ones included: a location removed
            // meanwhile, or one whose parent was, is not live and nothing is written.
            const plan = locationRemovalPlan({ locations: fresh.allLocations, blocks, otherBlocks: others, locationId: node.id, projectId, relatorioId, visibility });
            out.plan = plan;
            if (plan === null) return null;
            out.name = locationControlName(fresh.allLocations, node.id);
            return removeLocationOps(by, relatorioId, projectId, plan);
          }),
        )
        .then((batch) => {
          const plan = out.plan;
          if (batch === null || plan === null) {
            showToast(t.locationGone);
            return;
          }
          // The next row of the same list, else the one before it, else the parent's chevron,
          // else (the last local left) the foot's "Adicionar local".
          focusAfterRemoval(li, {
            rows: (list) => [...list.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.matches('li[data-location-id]')),
            focusOf: (row) => (row?.dataset.locationId === undefined ? null : locationChevron(host.root(), row.dataset.locationId)),
            fallback: () => (parentId === null ? null : locationChevron(host.root(), parentId)) ?? host.addLocal(),
            mode: 'settled',
          });
          // Said, and the toast shown, in the render that takes the row away (Q7). The toast is
          // the surface's sentence per kind; the announcement names which location left.
          settle(
            () => locationRow(host.root(), node.id) === null,
            locationRemovedText(plan.kind, out.name),
            () =>
              undoable(
                t.locationRemoved[plan.kind],
                batch,
                // "Desfazer" puts every row back: the focus goes to the location's Overflow trigger.
                () => locationTrigger(locationRow(host.root(), node.id)),
                () => {
                  if (parentId !== null) host.reveal(parentId);
                },
              ),
          );
        })
        .catch(() => undefined);
    },
    [host, readElsewhere, edit, relatorioId, projectId, showToast, t.locationGone, t.locationRemoved, settle, undoable],
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
          restoreFocus(() => blockTrigger(blockRow(host.root(), node.blockId)), { mode: 'settled' });
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

  const markNotTested = useCallback(
    (node: TreeEquipmentNode, reason: string, text: string | null) => {
      void edit((blocks, by) => {
        const block = blocks.find((row) => row.id === node.blockId && row.removed_at === null);
        if (block === undefined) return null;
        return [notTestedOp(by, relatorioId, node.blockId, { reason, text, at: toIso(now()) })];
      })
        .then((batch) => {
          if (batch === null) {
            showToast(t.gone);
            return;
          }
          // The band on the sheet gives it its own Desfazer once opened; the toast here
          // states what happened, verbatim from `60-ficha.html`'s Overflow (spec Boundaries).
          showToast(copy.ficha.notTestedToast);
        })
        .catch(() => undefined);
    },
    [edit, relatorioId, showToast, t.gone],
  );

  /** One location create, with its toast, its focus and its undo. */
  const createLocation = useCallback(
    (parent: TreeLocationNode | null, build: (locations: Parameters<typeof newLocation>[0]) => ReturnType<typeof newLocation>) => {
      const out: { created: { id: string; name: string; kind: 'cabine' | 'painel' | 'coluna' } | null } = { created: null };
      void edit((_blocks, by, fresh) => {
        if (parent !== null && !fresh.locations.some((row) => row.id === parent.id && row.removed_at === null)) return null;
        const row = build(fresh.locations);
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
          // A new painel opens, so its "this painel has no coluna yet" note and "Adicionar coluna" are in view.
          if (made.kind === 'painel') host.reveal(made.id);
          restoreFocus(() => locationChevron(host.root(), made.id), { mode: 'settled' });
          // "Desfazer" removes the new location: the focus goes to its parent's chevron, or to "Adicionar local".
          undoable(addedText(made.kind, made.name), batch, () =>
            locationChevron(host.root(), made.id) !== null ? null : parent !== null ? locationChevron(host.root(), parent.id) : host.addLocal(),
          );
        })
        .catch(() => undefined);
    },
    [edit, relatorioId, showToast, t.locationGone, host, undoable],
  );

  const addLocation = useCallback(
    (parent: TreeLocationNode, kind: 'painel' | 'coluna') => createLocation(parent, (locations) => newLocation(locations, { id: newId(), relatorioId, kind, parentId: parent.id })),
    [createLocation, relatorioId],
  );

  const addLocal = useCallback(
    (chosen: { funcao: string | null; name: string }) =>
      createLocation(null, (locations) => newLocation(locations, { id: newId(), relatorioId, kind: 'cabine', parentId: null, name: chosen.name, funcao: chosen.funcao })),
    [createLocation, relatorioId],
  );

  const updateLocal = useCallback(
    (node: TreeLocationNode, chosen: { funcao: string | null; name: string }) => {
      const out = { gone: false, name: chosen.name };
      void edit((_blocks, by, fresh) => {
        const row = fresh.locations.find((l) => l.id === node.id);
        if (row === undefined || row.kind !== 'cabine' || row.removed_at !== null) {
          out.gone = true;
          return null;
        }
        const ops: OpDraft[] = [];
        // Only what the user changed in the dialog is written: each answer is compared with what
        // the dialog opened on (`node`), never with the fresh row, so a field left untouched does
        // not write its stale dialog value over an edit pulled from another device meanwhile.
        // With no Função chosen (a local that held none), the stored one stays as it is.
        if (chosen.funcao !== null && chosen.funcao !== (node.funcao ?? null)) ops.push(putFuncaoOp(by, relatorioId, node.id, chosen.funcao));
        if (chosen.name !== node.name) ops.push(putLocationOp(by, relatorioId, node.id, 'name', chosen.name));
        // A name left untouched is the row's own, which is what the toast names.
        else out.name = row.name;
        return ops.length === 0 ? null : ops;
      })
        .then((batch) => {
          if (out.gone) {
            showToast(t.locationGone);
            return;
          }
          restoreFocus(() => locationChevron(host.root(), node.id), { mode: 'settled' });
          const text = localUpdatedText(out.name);
          if (batch !== null) announce(text);
          undoable(text, batch, () => locationChevron(host.root(), node.id));
        })
        .catch(() => undefined);
    },
    [edit, relatorioId, host, undoable, announce, showToast, t.locationGone],
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
          restoreFocus(() => locationChevron(host.root(), node.id), { mode: 'settled' });
          const text = renamedText(node.kind, name);
          if (batch !== null) announce(text);
          undoable(text, batch, () => locationChevron(host.root(), node.id));
        })
        .catch(() => undefined);
    },
    [edit, relatorioId, host, undoable, announce, showToast, t.locationGone],
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
    () => ({ openSheet, moveBlock, moveLocation, moveToLocation, createBlock, removeBlock, removeLocation, duplicateBlock, renameTag, markNotTested, addLocation, addLocal, updateLocal, renameLocation, toggleAgrupar }),
    [openSheet, moveBlock, moveLocation, moveToLocation, createBlock, removeBlock, removeLocation, duplicateBlock, renameTag, markNotTested, addLocation, addLocal, updateLocal, renameLocation, toggleAgrupar],
  );
}

/**
 * "Remover" of an equipment sheet: the block's tombstone, plus its equipment's when no
 * other live block in `blocks` (this relatório's and the obra's other relatórios on this
 * device) references that equipment (Q4) and every relatório of the obra the company
 * summary lists is on this device, pulled to the end (E9 sweep B15, `equipmentFreedByRemoval`).
 */
export function removeSheetOps(
  author: Author,
  relatorioId: string,
  projectId: string,
  blocks: readonly BlockRow[],
  block: Pick<BlockRow, 'id' | 'equipment_id'>,
  visibility: {
    companyDownloaded: boolean;
    summaries: readonly Pick<RelatorioSummary, 'id' | 'project_id'>[];
    heldRelatorioIds: readonly string[];
    downloadedStreamIds: readonly string[];
  },
): OpDraft[] {
  const ops: OpDraft[] = [removeBlockOp(author, relatorioId, block.id)];
  if (
    block.equipment_id !== null &&
    equipmentFreedByRemoval({ blocks, equipmentId: block.equipment_id, blockId: block.id, projectId, relatorioId, ...visibility })
  ) {
    ops.push(equipmentRemovedOp(author, projectId, block.equipment_id, true));
  }
  return ops;
}

/**
 * Story 14.2, second pass: the batch of a location's removal, from the kernel's plan, in the
 * order the spec fixes: the `location/{id}/removed_at` removes (the target first, then what
 * is under it in tree order), the `block/{id}/removed_at` removes, the
 * `equipment/{id}/removed_at` removes. One batch, so every tombstone carries one `client_ts`,
 * which is how the restore tells the rows of one removal.
 */
export function removeLocationOps(author: Author, relatorioId: string, projectId: string, plan: LocationRemovalPlan): OpDraft[] {
  return [
    ...plan.locationIds.map((id) => locationRemovedOp(author, relatorioId, id, true)),
    ...plan.blockIds.map((id) => removeBlockOp(author, relatorioId, id)),
    ...plan.equipmentIds.map((id) => equipmentRemovedOp(author, projectId, id, true)),
  ];
}

/**
 * Story 14.2, second pass: the batch of a location's restore, from the kernel's plan: the
 * `location/{id}/removed_at` puts of null (its removed ancestors root first, itself, then what
 * left with it), the `block/{id}/removed_at` puts of null, the `equipment/{id}/removed_at`
 * puts of null.
 */
export function restoreLocationOps(author: Author, relatorioId: string, projectId: string, plan: LocationRestorePlan): OpDraft[] {
  return [
    ...plan.locationIds.map((id) => locationRemovedOp(author, relatorioId, id, false)),
    ...plan.blockIds.map((id) => putBlockOp(author, relatorioId, id, 'removed_at', null)),
    ...plan.equipmentIds.map((id) => equipmentRemovedOp(author, projectId, id, false)),
  ];
}

/**
 * "Restaurar" of an equipment sheet: the block and, when its removal freed it, its
 * equipment row come back in one batch. An equipment another sheet kept live (Q4) is left
 * as it is. Story 14.2, second pass: the removed locations above the sheet (its own and its
 * ancestors, `removedAncestorIds` over `locations`, which carries the removed rows) come back
 * first, root first, so a restored or kept sheet is never put back into a hidden location.
 */
export function restoreSheetOps(
  author: Author,
  relatorioId: string,
  projectId: string,
  blocks: readonly BlockRow[],
  blockId: string,
  equipmentId: string | null,
  equipment: readonly Pick<EquipmentRow, 'id' | 'removed_at'>[],
  locations: readonly Pick<LocationRow, 'id' | 'parent_id' | 'removed_at'>[],
): OpDraft[] | null {
  const block = blocks.find((row) => row.id === blockId && row.removed_at !== null);
  if (block === undefined) return null;
  const ops: OpDraft[] = [
    ...removedAncestorIds(locations, block.location_id).map((id) => locationRemovedOp(author, relatorioId, id, false)),
    putBlockOp(author, relatorioId, blockId, 'removed_at', null),
  ];
  const live = equipment.some((row) => row.id === equipmentId && row.removed_at === null);
  if (equipmentId !== null && !live) ops.push(equipmentRemovedOp(author, projectId, equipmentId, false));
  return ops;
}

/**
 * Story 11.2: the one write of "Mover para…", shared by the tree and the sheet header. The
 * kernel's `movePlan` runs on the fresh rows inside the edit (the block or the target
 * removed meanwhile refuses; a TAG taken meanwhile is re-suggested), and one batch carries
 * `block/{id}/location_id`, `block/{id}/order_key` and, when accepted, `equipment/{id}/tag`.
 */
export async function commitMove(
  edit: (build: Build) => Promise<string | null>,
  input: { relatorioId: string; projectId: string; blockId: string; targetId: string; rename: boolean },
): Promise<{ batch: string | null; plan: MovePlan }> {
  const out: { plan: MovePlan } = { plan: { kind: 'refused', reason: 'gone' } };
  const batch = await edit((blocks, by, fresh) => {
    const plan = movePlan({ blocks, locations: fresh.locations, equipment: fresh.equipment, blockId: input.blockId, targetId: input.targetId, rename: input.rename });
    out.plan = plan;
    if (plan.kind !== 'move') return null;
    const ops: OpDraft[] = [
      putBlockOp(by, input.relatorioId, plan.blockId, 'location_id', plan.targetId),
      putBlockOp(by, input.relatorioId, plan.blockId, 'order_key', plan.orderKey),
    ];
    if (plan.rename !== null) ops.push(putEquipmentTagOp(by, input.projectId, plan.rename.equipmentId, plan.rename.tag));
    return ops;
  });
  return { batch, plan: out.plan };
}
