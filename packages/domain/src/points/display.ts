import { photoRefLabel } from '../photos/numbering.ts';
import { pointTextTokens } from './refs.ts';

/*
 * Story 27.9 (F36, every seed: screen only): a point's text as its card reads it, literal runs and photo
 * references, a list of two or more numbered references joined by ", " or " e " read as one plural
 * reference: "conforme Imagens 1 e 2" (the first reference "Imagens 1", each later one its number alone).
 * A single reference reads "Imagem N"; a reference the numbering lacks is `removed` and breaks a list.
 */

export type PointTextPiece = { kind: 'text'; text: string } | { kind: 'photo'; id: string; label: string | null };

/** The pieces of a point's text: a photo's `label` is null when the numbering lacks it (the screen names it removed). */
export function pointTextPieces(text: string, numbering: ReadonlyMap<string, number>): PointTextPiece[] {
  const tokens = pointTextTokens(text);
  const out: PointTextPiece[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i]!;
    if (token.kind === 'text') {
      out.push(token);
      i += 1;
      continue;
    }
    // A run: numbered references separated only by ", " or " e ".
    const run = [i];
    let j = i + 1;
    while (j + 1 < tokens.length) {
      const between = tokens[j]!;
      const next = tokens[j + 1]!;
      if (between.kind !== 'text' || !/^(, | e )$/.test(between.text) || next.kind !== 'photo') break;
      run.push(j, j + 1);
      j += 2;
    }
    const photos = run.filter((at) => tokens[at]!.kind === 'photo').map((at) => tokens[at] as { kind: 'photo'; id: string });
    const plural = photos.length > 1 && photos.every((photo) => numbering.has(photo.id)) && (tokens[run.at(-2)!] as { text: string }).text === ' e ';
    if (!plural) {
      const n = numbering.get(token.id);
      out.push({ kind: 'photo', id: token.id, label: n === undefined ? null : photoRefLabel(n) });
      i += 1;
      continue;
    }
    photos.forEach((photo, k) => {
      if (k > 0) out.push(tokens[run[2 * k - 1]!] as { kind: 'text'; text: string });
      // authored (Story 27.9, listed for Bruno): "Imagens 1 e 2" for a list of references.
      out.push({ kind: 'photo', id: photo.id, label: k === 0 ? `Imagens ${numbering.get(photo.id)!}` : String(numbering.get(photo.id)!) });
    });
    i = j;
  }
  return out;
}
