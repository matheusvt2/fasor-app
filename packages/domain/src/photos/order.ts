import type { RelatorioSnapshot } from '../schemas/snapshot.ts';

/*
 * Story 6.3 (AD-13, AD-17): the one capture order of the photos of a relatório. Photos sort by `(captured_at, local_seq, id)`: AD-17's device component
 * collapses because the photo row carries no `device_id` and only one device fills a
 * relatório (source-deltas row 14), so the UUIDv7 `id` is the final deterministic
 * tie-breaker. The numbers themselves are `numberPhotos` (`numbering.ts`, Story 6.6), on this order.
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
