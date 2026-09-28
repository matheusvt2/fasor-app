import { isUncaptioned, photoItemLine, photoStampFull } from '../photos/gallery.ts';
import { numberPhotos, photoRefLabel } from '../photos/numbering.ts';
import { livePhotos } from '../photos/order.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';

/*
 * Story 7.2 (AC1): section 7, the photo record, as layout data. Every live photo of the
 * frozen snapshot, in the `numberPhotos` order `(captured_at, local_seq, id)` and with its
 * number, two per row in the document. Under each photo: the bold label "Imagem 5:" and
 * the caption as a sentence, the full Photo stamp and, for a photo taken on a checklist
 * row, that row's line ("Item 8 · Contatos · NC"). A photo linked to a sheet prints here
 * too, with the same number, so a "conforme Imagem 5" of section 8 always finds it. The
 * renderer (`apps/api/src/jobs/generate/sections/section-7.ts`) embeds the `print`
 * variant and composes nothing: every string below is printed as given.
 */

/** authored: what a photo cell prints in place of the image when the server holds no bytes for it (open for Bruno). */
export const PHOTO_UNAVAILABLE_TEXT = '(foto não disponível no servidor)';

export interface LayoutPhoto {
  fileId: string;
  number: number;
  /** The bold run: "Imagem 5:" before a caption, "Imagem 5." for a photo with none. */
  label: string;
  /** The run after the label, its leading space included: " Detalhe da chave." ; null without a caption. */
  caption: string | null;
  /** "06/09/2026 14:32 · −23,5505, −46,6333", the time alone without coordinates. */
  stamp: string;
  /** "Item 8 · Contatos · NC" for a photo taken on a checklist row; null otherwise. */
  itemLine: string | null;
}

export interface LayoutSectionPhotos {
  number: number;
  title: string;
  kind: 'photos';
  photos: LayoutPhoto[];
}

/** A caption as a printed sentence: trimmed, with a final period unless it already ends in ".", "!" or "?". */
export function captionSentence(caption: string): string {
  const text = caption.trim();
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** The photos of section 7 in print order, numbered; empty when the relatório holds no live photo. */
export function section7Photos(snapshot: Pick<RelatorioSnapshot, 'files' | 'blocks'>): LayoutPhoto[] {
  const numbers = numberPhotos(snapshot.files);
  return livePhotos(snapshot)
    .map((photo) => {
      const number = numbers.get(photo.id)!;
      const captioned = !isUncaptioned(photo.caption);
      return {
        fileId: photo.id,
        number,
        label: `${photoRefLabel(number)}${captioned ? ':' : '.'}`,
        caption: captioned ? ` ${captionSentence(photo.caption!)}` : null,
        stamp: photoStampFull(photo),
        itemLine: photoItemLine(photo, snapshot)?.text ?? null,
      };
    })
    .sort((a, b) => a.number - b.number);
}

/** Section 7's layout under its heading; null when there is no live photo (the section prints the empty note). */
export function section7Layout(snapshot: Pick<RelatorioSnapshot, 'files' | 'blocks'>, heading: { number: number; title: string }): LayoutSectionPhotos | null {
  const photos = section7Photos(snapshot);
  return photos.length === 0 ? null : { number: heading.number, title: heading.title, kind: 'photos', photos };
}
