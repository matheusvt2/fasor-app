import { isUncaptioned, photoItemLine, photoStampFull } from '../photos/gallery.ts';
import { numberPhotos, photoRefLabel } from '../photos/numbering.ts';
import { geralPhotos } from '../photos/order.ts';
import type { NumberingSnapshot } from './photo-order.ts';

/*
 * Story 7.2 (AC1), Story 17.1 (Bruno, 2026-10-27): section 7, the REGISTRO FOTOGRÁFICO, as
 * layout data. It holds only the "Geral" photos (`isGeralPhoto`: no sheet, no item, no local,
 * no reading), the ones added to it by hand, in capture order; they open the one numbering
 * sequence (`numberPhotos`), so they are "Imagem 1" to "Imagem N" here, two per row in the
 * document. A photo of a sheet, a checklist or site item, a plate or a display shot prints
 * only under its sheet or its local in section 9, with its own number of the same sequence,
 * so a "conforme Imagem 5" of section 8 always finds it there. Under each photo: the bold
 * label "Imagem 5:" and the caption as a sentence, the full Photo stamp and, for a photo
 * taken on a checklist row, that row's line (`photoItemLine`; a "Geral" photo carries no
 * item, so none prints today). The renderer (`apps/api/src/jobs/generate/sections/section-7.ts`)
 * embeds the `print` variant and composes nothing: every string below is printed as given.
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

/**
 * What section 7 reads: what the numbering walks (`NumberingSnapshot`), the relatório row and
 * the locations included (a photo's item line reads them too).
 */
type Section7Snapshot = NumberingSnapshot;

/** A caption as a printed sentence: trimmed, with a final period unless it already ends in ".", "!" or "?". */
export function captionSentence(caption: string): string {
  const text = caption.trim();
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** The "Geral" photos of section 7 in print order, numbered; empty when the relatório holds none. */
export function section7Photos(snapshot: Section7Snapshot): LayoutPhoto[] {
  const numbers = numberPhotos(snapshot);
  return geralPhotos(snapshot)
    .flatMap((photo) => {
      const number = numbers.get(photo.id);
      if (number === undefined) return [];
      const captioned = !isUncaptioned(photo.caption);
      return [{
        fileId: photo.id,
        number,
        label: `${photoRefLabel(number)}${captioned ? ':' : '.'}`,
        caption: captioned ? ` ${captionSentence(photo.caption!)}` : null,
        stamp: photoStampFull(photo),
        itemLine: photoItemLine(photo, snapshot)?.text ?? null,
      }];
    })
    .sort((a, b) => a.number - b.number);
}

/** Section 7's layout under its heading; null when there is no live "Geral" photo (the section prints the empty note). */
export function section7Layout(snapshot: Section7Snapshot, heading: { number: number; title: string }): LayoutSectionPhotos | null {
  const photos = section7Photos(snapshot);
  return photos.length === 0 ? null : { number: heading.number, title: heading.title, kind: 'photos', photos };
}
