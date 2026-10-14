import type { RelatorioSummary } from '../contract/sync.ts';
import { orderKeyAfter, sortByOrderKey } from '../ops/order-key.ts';
import type { BlockRow, EquipmentRow, LocationRow } from '../schemas/entities.ts';
import { removedText, restoredText } from '../templates/text.ts';
import { listPtBr, plural } from '../text/plural.ts';
import { liveLocationIds } from './location-live.ts';
import { isEquipmentBlock } from './sheet-state.ts';
import { siteResultOf } from './site-checklist.ts';
import { equipmentFreedByRemoval } from './tree.ts';

/*
 * Story 14.2, second pass (2026-10-13; AD-6): "Remover" of a coluna, a painel or a local in
 * the relatório tree, and its restore from "Restaurar ficha removida". A removal is one
 * batch of explicit tombstones: the location, every live location under it, every live
 * sheet on them and the equipment the removal frees, as a sheet removal does. No new op
 * path: the plans below name the rows, the surface writes `location/{id}/removed_at`,
 * `block/{id}/removed_at` and `equipment/{id}/removed_at` from them, and `applyOp` stays
 * the only reducer.
 *
 * Which removal a row belongs to is read from its timestamp: `applyOp` writes `removed_at =
 * op.client_ts` for a `remove`, and one batch stamps all of its ops with one `client_ts`, so
 * the rows of one removal share one `removed_at` string. The restore brings back the rows
 * removed at the location's own timestamp; a sheet or a location removed at another time
 * (on its own, before) stays removed. Accepted limit: two removals stamped in the same
 * millisecond (two devices) restore together.
 *
 * The plans are pure functions of the rows as they are at commit time; the counts, the
 * confirmation, the announcement and the restore entry's words are composed here (AD-1,
 * AD-13).
 */

type LocationKind = LocationRow['kind'];

/** What a removal takes with the location, or a restore brings back with it: the locations under it by kind, and the sheets. */
export interface LocationRemovalCounts {
  paineis: number;
  colunas: number;
  sheets: number;
  /**
   * Epic 14 QA Q-6: the site work of the locals among them (Story 14.3), which leaves and comes
   * back with the local: its answered site items, the photos of its site items (live `file`
   * rows carrying its `location_id`) and its live points of attention (`location_id`). Zero
   * on a painel or a coluna, which hold none.
   */
  siteAnswers: number;
  sitePhotos: number;
  sitePoints: number;
}

/** Epic 14 QA Q-6: a file or a point as the counts read it: whether it is live, and the local it names. */
export interface SiteWorkRow {
  removed_at: string | null;
  location_id?: string | null;
  /** A file's sheet: one that names a block is that block's photo, never a site photo. */
  block_id?: string | null;
}

const NO_COUNTS = (): LocationRemovalCounts => ({ paineis: 0, colunas: 0, sheets: 0, siteAnswers: 0, sitePhotos: 0, sitePoints: 0 });

/** Adds the site work of the locations `ids` (answers on their rows, live photos and points naming them) to `counts`. */
function countSiteWork(counts: LocationRemovalCounts, rows: readonly LocationRow[], ids: ReadonlySet<string>, files: readonly SiteWorkRow[], points: readonly SiteWorkRow[]): void {
  for (const row of rows) {
    if (!ids.has(row.id) || row.kind !== 'cabine') continue;
    counts.siteAnswers += Object.keys(row.checklist ?? {}).filter((key) => siteResultOf(row, key) !== null).length;
  }
  const names = (row: SiteWorkRow) => row.removed_at === null && (row.location_id ?? null) !== null && ids.has(row.location_id!);
  // A file that also names a block is read as its block's (`entities.ts`), never as a site photo.
  counts.sitePhotos += files.filter((row) => names(row) && (row.block_id ?? null) === null).length;
  counts.sitePoints += points.filter(names).length;
}

/**
 * Epic 14 QA Q-6: whether "Remover" of a location asks first: when it takes a sheet, or a
 * local's site answers, site photos or points; a location holding none of these leaves at once.
 */
export function locationRemovalAsks(counts: LocationRemovalCounts): boolean {
  return counts.sheets > 0 || counts.siteAnswers > 0 || counts.sitePhotos > 0 || counts.sitePoints > 0;
}

/**
 * What a removal needs to know about the obra's relatórios this device cannot see, as
 * `equipmentFreedByRemoval` reads it (E9 sweep B15): the equipment of a removed sheet is
 * freed only when every relatório that could hold it is here to be asked.
 */
export interface RemovalVisibility {
  companyDownloaded: boolean;
  summaries: readonly Pick<RelatorioSummary, 'id' | 'project_id'>[];
  heldRelatorioIds: ReadonlySet<string> | readonly string[];
  downloadedStreamIds: ReadonlySet<string> | readonly string[];
}

export interface LocationRemovalPlan {
  /** The kind of the location removed (`cabine` is the local). */
  kind: LocationKind;
  locationId: string;
  /** The location, then every live location under it in tree order: one `location/{id}/removed_at` remove each. */
  locationIds: string[];
  /** Every live block on those locations, location by location in tree order: one `block/{id}/removed_at` remove each. */
  blockIds: string[];
  /** The equipment the removal frees, each once, in the order of the blocks: one `equipment/{id}/removed_at` remove each. */
  equipmentIds: string[];
  /** The locations under the target by kind and the sheets, for the confirmation. */
  counts: LocationRemovalCounts;
}

/** A location's children among `rows`, in drawing order: the colunas (and anything not a painel) first, then the painéis, each in `order_key` order. */
function childrenInTreeOrder(rows: readonly LocationRow[], parentId: string): LocationRow[] {
  const children = sortByOrderKey(rows.filter((row) => row.parent_id === parentId));
  return [...children.filter((child) => child.kind !== 'painel'), ...children.filter((child) => child.kind === 'painel')];
}

function countLocation(counts: LocationRemovalCounts, kind: LocationKind): void {
  if (kind === 'painel') counts.paineis += 1;
  else if (kind === 'coluna') counts.colunas += 1;
}

/**
 * What "Remover" of a location writes, on the rows as they are now. Null when the location
 * is not live (removed meanwhile, under a removed location, or not in `locations`).
 *
 * `locationIds`: the location and every live location under it (a removed child is skipped
 * with its subtree: it left before and keeps its own timestamp). `blockIds`: every live
 * block on them. `equipmentIds`: the equipment each of those blocks frees, by
 * `equipmentFreedByRemoval` evaluated with the other blocks of this same removal taken out
 * of `blocks`: an equipment two removed sheets share is freed once, and one a sheet outside
 * the removal (in `blocks`) or another relatório (in `otherBlocks`, or one this device
 * cannot see, `visibility`) holds stays live.
 *
 * `blocks` are the relatório's, `otherBlocks` those of the obra's other relatórios on this
 * device; both may carry removed rows.
 */
export function locationRemovalPlan(input: {
  locations: readonly LocationRow[];
  blocks: readonly BlockRow[];
  otherBlocks: readonly Pick<BlockRow, 'id' | 'equipment_id' | 'removed_at'>[];
  locationId: string;
  projectId: string;
  relatorioId: string;
  visibility: RemovalVisibility;
  /** Epic 14 QA Q-6: the relatório's files and points, for the site work the counts name (none when absent). */
  files?: readonly SiteWorkRow[];
  points?: readonly SiteWorkRow[];
}): LocationRemovalPlan | null {
  const liveIds = liveLocationIds(input.locations);
  const target = liveIds.has(input.locationId) ? input.locations.find((row) => row.id === input.locationId) : undefined;
  if (target === undefined) return null;
  const live = input.locations.filter((row) => liveIds.has(row.id));

  const counts = NO_COUNTS();
  const locationIds: string[] = [];
  const seen = new Set<string>();
  const walk = (location: LocationRow, under: boolean) => {
    if (seen.has(location.id)) return;
    seen.add(location.id);
    locationIds.push(location.id);
    if (under) countLocation(counts, location.kind);
    for (const child of childrenInTreeOrder(live, location.id)) walk(child, true);
  };
  walk(target, false);
  countSiteWork(counts, live, new Set(locationIds), input.files ?? [], input.points ?? []);

  const removed = locationIds.flatMap((id) => sortByOrderKey(input.blocks.filter((block) => block.removed_at === null && block.location_id === id)));
  counts.sheets = removed.filter((block) => isEquipmentBlock(block)).length;
  const removing = new Set(removed.map((block) => block.id));
  // The holders that outlive this removal: the relatório's other blocks and the obra's other relatórios.
  const remaining = [...input.blocks.filter((block) => !removing.has(block.id)), ...input.otherBlocks];
  const equipmentIds: string[] = [];
  for (const block of removed) {
    if (block.equipment_id === null || equipmentIds.includes(block.equipment_id)) continue;
    const freed = equipmentFreedByRemoval({
      blocks: remaining,
      equipmentId: block.equipment_id,
      blockId: block.id,
      projectId: input.projectId,
      relatorioId: input.relatorioId,
      ...input.visibility,
    });
    if (freed) equipmentIds.push(block.equipment_id);
  }
  return { kind: target.kind, locationId: target.id, locationIds, blockIds: removed.map((block) => block.id), equipmentIds, counts };
}

/**
 * The location itself and the locations above it that are removed, root first: the rows a
 * restore must put back for the location to be visible again (rule 1: a location under a
 * removed one is not shown). Empty for null, for an id `locations` does not hold, and when
 * nothing on the way up is removed. It also serves the restore of a sheet ("Restaurar", and
 * "Manter a ficha" of a removed-versus-edited decision): the removed rows above the sheet's
 * location come back with it, so a kept sheet is never restored into a hidden location.
 */
export function removedAncestorIds(locations: readonly Pick<LocationRow, 'id' | 'parent_id' | 'removed_at'>[], locationId: string | null): string[] {
  if (locationId === null) return [];
  const byId = new Map(locations.map((location) => [location.id, location]));
  const out: string[] = [];
  const seen = new Set<string>();
  let at = byId.get(locationId);
  while (at !== undefined && !seen.has(at.id)) {
    seen.add(at.id);
    if (at.removed_at !== null) out.unshift(at.id);
    at = at.parent_id === null ? undefined : byId.get(at.parent_id);
  }
  return out;
}

export interface LocationRestorePlan {
  kind: LocationKind;
  locationId: string;
  /** The rows to put back live, root first: its removed ancestors (alone), itself, then the locations under it that left with it, in tree order. One `location/{id}/removed_at` put of null each. */
  locationIds: string[];
  /** The blocks that left in the same removal, location by location in tree order: one `block/{id}/removed_at` put of null each. */
  blockIds: string[];
  /** The equipment of those blocks that is not live, each once: one `equipment/{id}/removed_at` put of null each. */
  equipmentIds: string[];
  /**
   * Epic 14 QA Q-13: the restored locations whose `order_key` a live sibling took meanwhile
   * (a move into the hole the removal left mints the same key), each with the key that places
   * it right after that sibling: one `location/{id}/order_key` put each, in the same batch.
   */
  orderKeys: { id: string; orderKey: string }[];
  /** What becomes visible under the location: the locations by kind (restored, and live ones the removal hid) and the sheets on them and on it. */
  counts: LocationRemovalCounts;
}

/**
 * Epic 14 QA Q-13: the key a row coming back takes when a live sibling holds its `order_key`
 * (a move landed in the hole its removal left, between the same two neighbours, and minted
 * the same key): right after the last sibling holding it. Null when no live sibling holds it,
 * so the row keeps its own. `siblings` are the rows beside it (removed ones are skipped).
 */
export function restoredOrderKey<T extends { id: string; order_key: string; removed_at: string | null }>(siblings: readonly T[], row: { id: string; order_key: string }): string | null {
  const live = sortByOrderKey(siblings.filter((sibling) => sibling.id !== row.id && sibling.removed_at === null));
  const holders = live.filter((sibling) => sibling.order_key === row.order_key);
  if (holders.length === 0) return null;
  return orderKeyAfter(live, holders.at(-1)!.id);
}

/**
 * What restoring a removed location writes. `locations`, `blocks` and `equipment` carry the
 * removed rows. Null when the location is not removed (or not in `locations`).
 *
 * With `T` the location's own `removed_at` (the shared timestamp of its removal):
 * `locationIds` are its removed ancestors (those rows alone: nothing else of theirs comes
 * back), itself, and the locations under it whose `removed_at` is `T`, reached through rows
 * that are live or removed at `T`; a row removed at another time stops the descent, and
 * stays removed with what is under it. `blockIds` are the blocks on the locations reached
 * (the location, the restored ones and the live ones in between) whose `removed_at` is `T`;
 * a sheet removed on its own before stays removed. `equipmentIds` are the equipment of
 * those blocks with no live row in `equipment` (one another sheet kept live is left as it is).
 */
export function locationRestorePlan(input: {
  locations: readonly LocationRow[];
  blocks: readonly BlockRow[];
  equipment: readonly Pick<EquipmentRow, 'id' | 'removed_at'>[];
  locationId: string;
  /** Epic 14 QA Q-6: the relatório's files and points, for the site work the counts name (none when absent). */
  files?: readonly SiteWorkRow[];
  points?: readonly SiteWorkRow[];
}): LocationRestorePlan | null {
  const target = input.locations.find((row) => row.id === input.locationId);
  if (target === undefined || target.removed_at === null) return null;
  const at = target.removed_at;

  const counts = NO_COUNTS();
  const locationIds = removedAncestorIds(input.locations, target.id);
  const reached = [target.id];
  const seen = new Set(reached);
  const walk = (parentId: string) => {
    for (const child of childrenInTreeOrder(input.locations, parentId)) {
      if (seen.has(child.id)) continue;
      // Removed at another time: it left on its own, and stays out with everything under it.
      if (child.removed_at !== null && child.removed_at !== at) continue;
      seen.add(child.id);
      if (child.removed_at === at) locationIds.push(child.id);
      reached.push(child.id);
      countLocation(counts, child.kind);
      walk(child.id);
    }
  };
  walk(target.id);
  countSiteWork(counts, input.locations, new Set(reached), input.files ?? [], input.points ?? []);

  const blockIds: string[] = [];
  const equipmentIds: string[] = [];
  const liveEquipment = new Set(input.equipment.filter((row) => row.removed_at === null).map((row) => row.id));
  for (const id of reached) {
    for (const block of sortByOrderKey(input.blocks.filter((row) => row.location_id === id))) {
      if (block.removed_at !== null && block.removed_at !== at) continue;
      if (isEquipmentBlock(block)) counts.sheets += 1;
      if (block.removed_at === null) continue;
      blockIds.push(block.id);
      if (block.equipment_id !== null && !liveEquipment.has(block.equipment_id) && !equipmentIds.includes(block.equipment_id)) equipmentIds.push(block.equipment_id);
    }
  }
  // Q-13: a restored location whose key a live sibling took is placed right after it.
  return { kind: target.kind, locationId: target.id, locationIds, blockIds, equipmentIds, orderKeys: restoredLocationOrderKeys(input.locations, locationIds), counts };
}

/**
 * Epic 14 QA Q-13: the `order_key` puts a batch that puts the locations `ids` back live needs
 * (in that order: a restore plan's, or the removed ancestors a sheet restore brings back): one
 * for each whose key a live sibling took meanwhile (`restoredOrderKey`), placing it right
 * after that sibling. The rows already back, with their final key, count as live siblings of
 * the next ones. `locations` carry the removed rows.
 */
export function restoredLocationOrderKeys(
  locations: readonly Pick<LocationRow, 'id' | 'parent_id' | 'order_key' | 'removed_at'>[],
  ids: readonly string[],
): { id: string; orderKey: string }[] {
  const restored = new Set(ids);
  const back = new Map<string, string>();
  const orderKeys: { id: string; orderKey: string }[] = [];
  for (const id of ids) {
    const row = locations.find((candidate) => candidate.id === id);
    if (row === undefined) continue;
    const siblings = locations
      .filter((candidate) => candidate.parent_id === row.parent_id && (!restored.has(candidate.id) || back.has(candidate.id)))
      .map((candidate) => (back.has(candidate.id) ? { ...candidate, order_key: back.get(candidate.id)!, removed_at: null } : candidate));
    const key = restoredOrderKey(siblings, row);
    back.set(id, key ?? row.order_key);
    if (key !== null) orderKeys.push({ id, orderKey: key });
  }
  return orderKeys;
}

// --- the texts -------------------------------------------------------------------------

/** The Overflow item that lists what a removal took (`40-relatorio-overview.html` `#sum-menu-rel`), as the confirmation names it. */
export const RESTORE_REMOVED_LABEL = 'Restaurar ficha removida';

const SEP = ' · ';

/** The on-screen noun of each kind with its article, and capitalised alone: the root row is the "local". */
const KIND_WORDS: Readonly<Record<LocationKind, { subject: string; noun: string; title: string }>> = {
  cabine: { subject: 'O local', noun: 'local', title: 'Local' },
  painel: { subject: 'O painel', noun: 'painel', title: 'Painel' },
  coluna: { subject: 'A coluna', noun: 'coluna', title: 'Coluna' },
};

/**
 * "1 painel", "2 colunas", "5 fichas", then (Epic 14 QA Q-6) the local's site work: "19
 * respostas das verificações", "1 foto", "1 ponto de atenção"; the parts that are not zero, in
 * that order.
 */
function countParts(counts: LocationRemovalCounts): string[] {
  const parts: string[] = [];
  if (counts.paineis > 0) parts.push(plural(counts.paineis, 'painel', 'painéis'));
  if (counts.colunas > 0) parts.push(plural(counts.colunas, 'coluna', 'colunas'));
  if (counts.sheets > 0) parts.push(plural(counts.sheets, 'ficha', 'fichas'));
  // authored: Epic 14 QA Q-6 (open for Bruno).
  if (counts.siteAnswers > 0) parts.push(plural(counts.siteAnswers, 'resposta das verificações', 'respostas das verificações'));
  if (counts.sitePhotos > 0) parts.push(plural(counts.sitePhotos, 'foto', 'fotos'));
  if (counts.sitePoints > 0) parts.push(plural(counts.sitePoints, 'ponto de atenção', 'pontos de atenção'));
  return parts;
}

/** The title of the removal's Confirm dialog: "Remover Coluna 1 de Painel 1 de Cubículo Enel?" (the location's control name). */
export function locationRemovalConfirmTitle(controlName: string): string {
  // authored: the Confirm pattern of the other removals ("Remover ⟨nome⟩?"); the mock draws no dialog here.
  return `Remover ${controlName}?`;
}

/**
 * The Confirm dialog's sentence of consequence, with the plan's counts: "O painel, 2 colunas
 * e 5 fichas saem do relatório. Dá para recuperar até a emissão, em "Restaurar ficha
 * removida".", "A coluna e 1 ficha saem do relatório. …", "O local, 1 painel, 2 colunas e 7
 * fichas saem do relatório. …". A zero part is left out; with nothing under it the verb is
 * singular ("O painel sai do relatório. …").
 */
export function locationRemovalConfirmText(kind: LocationKind, counts: LocationRemovalCounts): string {
  const parts = [KIND_WORDS[kind].subject, ...countParts(counts)];
  // authored: no mock draws this confirmation; the second sentence says the toast's "recuperável até a emissão" and where.
  return `${listPtBr(parts)} ${parts.length > 1 ? 'saem' : 'sai'} do relatório. Dá para recuperar até a emissão, em "${RESTORE_REMOVED_LABEL}".`;
}

/** The Confirm dialog's button, carrying the verb: "Remover coluna", "Remover painel", "Remover local". */
export function locationRemovalConfirmLabel(kind: LocationKind): string {
  // authored: as the sheet's "Remover ficha".
  return `Remover ${KIND_WORDS[kind].noun}`;
}

/**
 * The removal's polite announcement, naming the location by its control name: "Coluna 1 de
 * Painel 1 de Cubículo Enel removida", "Painel 1 de Cubículo Enel removido", "Local Cubículo
 * Enel removido" (`removedText`, the sentence of the tree's other announcements).
 */
export function locationRemovedText(kind: LocationKind, controlName: string): string {
  // authored: the toast is the mock's sentence per kind (the surface's copy); this one names which location left.
  return removedText(kind, controlName);
}

/** The restore's polite announcement: "Painel 1 de Cubículo Enel restaurado", "Coluna 1 de Painel 1 de Cubículo Enel restaurada". */
export function locationRestoredText(kind: LocationKind, controlName: string): string {
  // authored: the counterpart of `locationRemovedText`.
  return restoredText(kind, controlName);
}

/**
 * The detail of a removed location in the restore list: its kind, then what comes back with
 * it: "Painel · 2 colunas · 5 fichas", "Coluna · 3 fichas", "Local · 1 painel · 2 colunas · 7
 * fichas", and the kind alone when nothing hangs under it ("Local").
 */
export function locationRestoreDetailText(kind: LocationKind, counts: LocationRemovalCounts): string {
  // authored: no mock draws a location in the restore list.
  return [KIND_WORDS[kind].title, ...countParts(counts)].join(SEP);
}
