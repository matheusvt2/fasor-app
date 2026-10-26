import { comparePhotos } from './order.ts';

/*
 * AD-17 (Story 6.6, also read by the gallery): the provisional photo numbers. Every live
 * photo of a relatório in capture order `(captured_at, local_seq, id)` gets 1, 2, 3...; a
 * removed photo gets none and the ones after it close the gap. The number is provisional
 * until a generation freezes it with the revision (Epic 7), which is why text stores a
 * `[[foto:<id>]]` token and never the number itself.
 *
 * Story 16.3: a "Ler visor" display shot (`reading_kind: 'display'`) is an instrument screen,
 * not a site photo; it takes no number and the numbered photos close around it. This is the
 * one filter every number reader (section 7, section 8, section 9, the audit, the screens)
 * follows from.
 */

/** The fields numbering reads off a file row (a snapshot's, or a device row with `company_id`). */
export interface NumberableFile {
  id: string;
  kind: string;
  removed_at: string | null;
  captured_at?: string;
  local_seq?: number;
  /** Story 16.3: a "Ler visor" display shot (`'display'`) takes no number. */
  reading_kind?: string | null;
}

/** The provisional number of every live photo, keyed by file id. */
export function numberPhotos(files: readonly NumberableFile[]): Map<string, number> {
  const photos = files
    .filter((file) => file.kind === 'photo' && file.removed_at === null && file.reading_kind !== 'display')
    .map((file) => ({ id: file.id, captured_at: file.captured_at ?? '', local_seq: file.local_seq ?? 0 }))
    .sort(comparePhotos);
  return new Map(photos.map((photo, i) => [photo.id, i + 1]));
}

/** "Imagem 12": how a photo reference reads (`72-pontos.html` `.photo-ref`). */
export function photoRefLabel(n: number): string {
  return `Imagem ${n}`;
}
