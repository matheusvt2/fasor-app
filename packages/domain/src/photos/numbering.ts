import { documentPhotoOrder, type NumberingSnapshot } from '../print/photo-order.ts';

/*
 * AD-17 (Story 6.6, also read by the gallery): the provisional photo numbers. Stories 17.1
 * and 17.4 (Bruno, 2026-10-27): every live photo of a relatório, a "Ler visor" display shot
 * included, holds one number in one sequence, in document order (`documentPhotoOrder`):
 * section 7's "Geral" photos first in capture order, then section 9's photos as the layout
 * prints them. A removed photo gets none and the ones after it close the gap. The number is
 * provisional until a generation freezes it with the revision (Epic 7), which is why text
 * stores a `[[foto:<id>]]` token and never the number itself. Every number reader (section 7,
 * section 8, section 9, the audit, the screens) reads this map.
 */

/** The provisional number of every live photo, keyed by file id. */
export function numberPhotos(snapshot: NumberingSnapshot): Map<string, number> {
  return new Map(documentPhotoOrder(snapshot).order.map((photo, i) => [photo.id, i + 1]));
}

/** "Imagem 12": how a photo reference reads (`72-pontos.html` `.photo-ref`). */
export function photoRefLabel(n: number): string {
  return `Imagem ${n}`;
}
