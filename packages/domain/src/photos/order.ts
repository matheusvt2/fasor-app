import type { RelatorioSnapshot } from '../schemas/snapshot.ts';

/*
 * Story 6.3 (AD-13, AD-17): the one capture order of the photos of a relatório. Photos sort by `(captured_at, local_seq, id)`: AD-17's device component
 * collapses because the photo row carries no `device_id` and only one device fills a
 * relatório (source-deltas row 14), so the UUIDv7 `id` is the final deterministic
 * tie-breaker. The numbers themselves are `numberPhotos` (`numbering.ts`, Story 6.6): since
 * Story 17.1 they follow the document order (`print/photo-order.ts`), which reads this order
 * inside each of its groups.
 */

/** The fields the order reads; a snapshot file and a device tile both carry them. */
export interface OrderablePhoto {
  id: string;
  captured_at: string;
  local_seq: number;
}

/** The snapshot's photo rows, typed. */
export type SnapshotPhoto = Extract<RelatorioSnapshot['files'][number], { kind: 'photo' }>;

function instant(iso: string): number {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/** Capture order: the instant, then the per-device counter, then the id. */
export function comparePhotos(a: OrderablePhoto, b: OrderablePhoto): number {
  const ta = instant(a.captured_at);
  const tb = instant(b.captured_at);
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (a.local_seq !== b.local_seq) return a.local_seq - b.local_seq;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The live photos of a snapshot, in capture order. */
export function livePhotos(snapshot: Pick<RelatorioSnapshot, 'files'>): SnapshotPhoto[] {
  return snapshot.files.filter((file): file is SnapshotPhoto => file.kind === 'photo' && file.removed_at === null).sort(comparePhotos);
}

/**
 * Story 11.11 (AD-1): the live photos of one sheet, in capture order: the nameplate photo,
 * the bursts and the imports whose `block_id` is this block, every checklist item's included.
 * The "Fotos da ficha" strip draws exactly this list; its numbers are `numberPhotos` over
 * the whole relatório.
 */
export function photosOfBlock(snapshot: Pick<RelatorioSnapshot, 'files'>, blockId: string): SnapshotPhoto[] {
  return livePhotos(snapshot).filter((photo) => photo.block_id === blockId);
}

/** The fields the "Geral" predicate reads; a snapshot photo and a device tile both carry them. */
export interface GeralCandidate {
  block_id: string | null;
  item_key: string | null;
  /** Absent and null both mean no local (contract 18). */
  location_id?: string | null;
  reading_kind: string | null;
}

/**
 * Story 17.1 (Bruno, 2026-10-27): a "Geral" photo, one added to the REGISTRO FOTOGRÁFICO by
 * hand: no sheet, no checklist or site item, no local, and no reading that names a place. The
 * vision-caption request (`reading_kind: 'caption'`) counts as Geral: Story 9.3's
 * `captionReadingOf` gives it to exactly the photos with no sheet, no caption and no "Pessoas
 * na foto" mark, so it is what a context-less gallery photo carries. 'plate', 'display',
 * 'panel' and 'nc_obs' are never Geral. The one predicate: section 7 prints exactly these
 * photos, and the screens that say where a photo prints read it too. Every other photo prints
 * only under its sheet or its local in section 9.
 */
export function isGeralPhoto(photo: GeralCandidate): boolean {
  return (
    photo.block_id === null &&
    photo.item_key === null &&
    (photo.location_id ?? null) === null &&
    (photo.reading_kind === null || photo.reading_kind === 'caption')
  );
}

/** Story 17.1: the live "Geral" photos of a snapshot, in capture order (section 7's photos). */
export function geralPhotos(snapshot: Pick<RelatorioSnapshot, 'files'>): SnapshotPhoto[] {
  return livePhotos(snapshot).filter(isGeralPhoto);
}
