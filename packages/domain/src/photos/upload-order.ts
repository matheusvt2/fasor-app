/*
 * Story 6.2 (AD-7, AR-6): the order the uploader sends files in. A photo whose reading is
 * waiting goes first (Epic 8 reads it as soon as the server holds it), then the photos in
 * the order they were taken, then every other kind in the order they were given. Story 31.3:
 * an audio goes with the waiting readings, the first rank ordered by id.
 */

export interface UploadOrderItem {
  id: string;
  kind: string;
  reading_status?: string | null;
  captured_at?: string | null;
}

function rank(item: UploadOrderItem): number {
  // Story 31.3 (AD-30): an audio is transcribed as soon as the server holds it, like a waiting reading.
  if (item.kind === 'audio' || item.reading_status === 'queued' || item.reading_status === 'running') return 0;
  if (item.kind === 'photo') return 1;
  return 2;
}

/** A new array in upload order; stable for the other kinds. */
export function orderUploads<T extends UploadOrderItem>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index, rank: rank(item) }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.rank === 2) return a.index - b.index;
      // Story 31.3: inside the first rank, by id (uuid v7 is time-ordered), so audios and waiting photos go as they were made.
      if (a.rank === 0) return a.item.id === b.item.id ? a.index - b.index : a.item.id < b.item.id ? -1 : 1;
      const ta = a.item.captured_at ?? '';
      const tb = b.item.captured_at ?? '';
      if (ta !== tb) return ta < tb ? -1 : 1;
      if (a.item.id !== b.item.id) return a.item.id < b.item.id ? -1 : 1;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}
