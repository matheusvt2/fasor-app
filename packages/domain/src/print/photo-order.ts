import { isGeralPhoto, livePhotos, type SnapshotPhoto } from '../photos/order.ts';
import { enabledSubBlocksOf } from '../relatorio/sheet-state.ts';
import type { BlockRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { findDefinition, findSeed } from '../seed/definitions.ts';
import { groupForPrint } from './group-for-print.ts';

/*
 * Stories 17.1 and 17.4 (Bruno, 2026-10-27; AD-1, AD-17): the one document order of the
 * photos of a relatório, the order `numberPhotos` numbers and section 9 prints. First the
 * "Geral" photos (`isGeralPhoto`, section 7) in capture order; then section 9's photos as its
 * layout prints them, subsection by subsection of `groupForPrint` (the stored scheme): a
 * local's site-item photos once, on the first subsection emitted for that local (only on a
 * seed shipping a site list, only items of that list), then per sheet its plate photos, its
 * checklist items' photos and the others (bursts, display shots, panels) in capture order
 * inside each group. A display shot is numbered like any photo and prints after the tests.
 *
 * A photo the walk cannot place (a block in no subsection, a block whose definition does not
 * resolve, a site photo whose item the seed does not list, a photo with an `item_key` or a
 * reading but no sheet and no local) still holds a number, after every placed photo, in
 * capture order, so no printed "Imagem N" skips a number. Every placed photo prints in
 * section 9, a Não ensaiada sheet's included (around its reason band). The walk never
 * evaluates a sheet: `groupForPrint` and the predicates below.
 */

/** What the walk reads: `groupForPrint`'s snapshot and the files. */
export type NumberingSnapshot = Pick<RelatorioSnapshot, 'files' | 'relatorio' | 'locations' | 'blocks' | 'equipment'>;

/** One sheet's photos by where section 9 prints them, each group in capture order. */
export interface SheetPhotoGroups {
  /** The nameplate's photos, after DADOS DO EQUIPAMENTO. */
  plate: SnapshotPhoto[];
  /** The checklist rows' photos, after VERIFICAÇÕES GERAIS (only when the checklist prints). */
  items: SnapshotPhoto[];
  /** The rest, after the tests: bursts, display shots, panels, items of a checklist not printed. */
  other: SnapshotPhoto[];
}

export interface DocumentPhotoOrder {
  /** Section 7's photos, in capture order. */
  geral: SnapshotPhoto[];
  /** Each local's site-item photos section 9 prints, keyed by the cabine id. */
  locals: ReadonlyMap<string, SnapshotPhoto[]>;
  /** Each placed sheet's photos, keyed by block id. */
  sheets: ReadonlyMap<string, SheetPhotoGroups>;
  /** Every live photo once, in document order: index + 1 is its number. */
  order: SnapshotPhoto[];
}

/**
 * Whether a sheet prints its VERIFICAÇÕES GERAIS table (and so its checklist rows' photos
 * after it): the sub-block is on, the block's seed version and definition resolve, and the
 * definition carries a checklist. The one predicate section 9 (`sheetOf`) and the walk read.
 */
export function sheetChecklistPrinted(block: Pick<BlockRow, 'config' | 'seed_version' | 'block_type'>): boolean {
  const definition = findDefinition(block.seed_version, block.block_type);
  return definition !== null && definition.checklist !== null && enabledSubBlocksOf(block).has('checklist') && findSeed(block.seed_version) !== null;
}

function groupsOf(photos: readonly SnapshotPhoto[], checklistPrinted: boolean): SheetPhotoGroups {
  const out: SheetPhotoGroups = { plate: [], items: [], other: [] };
  for (const photo of photos) {
    if (photo.reading_kind === 'display') out.other.push(photo);
    else if (photo.item_key !== null && checklistPrinted) out.items.push(photo);
    else if (photo.item_key === null && photo.reading_kind === 'plate') out.plate.push(photo);
    else out.other.push(photo);
  }
  return out;
}

function push(map: Map<string, SnapshotPhoto[]>, key: string, photo: SnapshotPhoto): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [photo]);
  else list.push(photo);
}

/** The document order of a snapshot's live photos and the groups section 9 prints. */
export function documentPhotoOrder(snapshot: NumberingSnapshot): DocumentPhotoOrder {
  const live = livePhotos(snapshot);
  const geral = live.filter(isGeralPhoto);
  const byBlock = new Map<string, SnapshotPhoto[]>();
  const byLocal = new Map<string, SnapshotPhoto[]>();
  for (const photo of live) {
    // A row carrying both a block and a local is read as its block's.
    if (photo.block_id !== null) push(byBlock, photo.block_id, photo);
    else if ((photo.location_id ?? null) !== null) push(byLocal, photo.location_id!, photo);
  }
  const blocks = new Map(snapshot.blocks.map((block) => [block.id, block]));
  const cabines = new Set(snapshot.locations.filter((location) => location.kind === 'cabine').map((location) => location.id));
  const siteList = findSeed(snapshot.relatorio.seed_version)?.site_checklist ?? null;
  const siteKeys = siteList === null ? null : new Set<string>(siteList.groups.flatMap((group) => group.items.map((item) => item.key)));

  const order: SnapshotPhoto[] = [...geral];
  const locals = new Map<string, SnapshotPhoto[]>();
  const sheets = new Map<string, SheetPhotoGroups>();
  for (const subsection of groupForPrint(snapshot).subsections) {
    // The local's site-item photos, once: on the first subsection emitted for it (`section9Layout`).
    if (siteKeys !== null && cabines.has(subsection.cabineId) && !locals.has(subsection.cabineId)) {
      const photos = (byLocal.get(subsection.cabineId) ?? []).filter((photo) => photo.item_key !== null && siteKeys.has(photo.item_key));
      locals.set(subsection.cabineId, photos);
      order.push(...photos);
    }
    for (const blockId of subsection.blockIds) {
      const block = blocks.get(blockId);
      // A block whose definition does not resolve prints no photo (`sheetOf`): its photos close the order.
      if (block === undefined || sheets.has(blockId) || findDefinition(block.seed_version, block.block_type) === null) continue;
      const groups = groupsOf(byBlock.get(blockId) ?? [], sheetChecklistPrinted(block));
      sheets.set(blockId, groups);
      order.push(...groups.plate, ...groups.items, ...groups.other);
    }
  }
  // Every photo the walk could not place closes the order, in capture order.
  const placed = new Set(order.map((photo) => photo.id));
  order.push(...live.filter((photo) => !placed.has(photo.id)));
  return { geral, locals, sheets, order };
}
