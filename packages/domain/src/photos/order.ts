import type { RelatorioSnapshot } from '../schemas/snapshot.ts';

/*
 * Story 6.3 (AD-13, AD-17): the one order and the one provisional numbering of the photos
 * of a relatório. Photos sort by `(captured_at, local_seq, id)`: AD-17's device component
 * collapses because the photo row carries no `device_id` and only one device fills a
 * relatório (source-deltas row 14), so the UUIDv7 `id` is the final deterministic
 * tie-breaker. The numbers are provisional until generation freezes them with the revision.
 */

/** The fields the order reads; a snapshot file and a device tile both carry them. */
export interface OrderablePhoto {
  id: string;
  captured_at: string;
  local_seq: number;
}

/** A file the numbering can read: a snapshot file, or a device tile (always a live photo). */
export type NumberablePhoto = OrderablePhoto & { kind?: string; removed_at?: string | null };

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

function isLivePhoto(file: { kind?: string; removed_at?: string | null }): boolean {
  return (file.kind === undefined || file.kind === 'photo') && (file.removed_at ?? null) === null;
}

/** The live photos of a snapshot, in capture order. */
export function livePhotos(snapshot: Pick<RelatorioSnapshot, 'files'>): SnapshotPhoto[] {
  return snapshot.files.filter((file): file is SnapshotPhoto => file.kind === 'photo' && file.removed_at === null).sort(comparePhotos);
}

/**
 * The provisional number of every live photo, 1..n in capture order; a removed photo has
 * none. Reads a snapshot, or any list of photo-like rows (the gallery's device tiles).
 */
export function numberPhotos(snapshot: { files: readonly (NumberablePhoto | { id: string; kind: string; removed_at: string | null })[] }): Map<string, number> {
  const numbers = new Map<string, number>();
  snapshot.files
    .filter((file): file is NumberablePhoto => isLivePhoto(file) && 'captured_at' in file)
    .sort(comparePhotos)
    .forEach((photo, index) => numbers.set(photo.id, index + 1));
  return numbers;
}
