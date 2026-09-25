/*
 * Story 6.6: photo references inside a point of attention's text. A reference is stored
 * as the token `[[foto:<file id>]]` and never as a number: the number is provisional
 * (`numberPhotos`) until a generation freezes it, so the editor shows it as an "Imagem N"
 * chip and the renderer prints it. Anything else that looks like a token (`[[foto:]]`, an
 * id that is not a uuid) is plain text.
 */

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/** A photo token; global, so callers iterate with `matchAll` (or `new RegExp(PHOTO_TOKEN_RE)`). */
export const PHOTO_TOKEN_RE = new RegExp(`\\[\\[foto:(${UUID})\\]\\]`, 'g');

/** The token that references one photo. */
export function photoToken(id: string): string {
  return `[[foto:${id}]]`;
}

/** The photos a text references, first-seen order, each once. */
export function extractPhotoRefs(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(new RegExp(PHOTO_TOKEN_RE))) {
    const id = match[1]!;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export type PointTextToken = { kind: 'text'; text: string } | { kind: 'photo'; id: string };

/** A text as literal runs and photo tokens, in order; adjacent literal text is one run. */
export function pointTextTokens(text: string): PointTextToken[] {
  const out: PointTextToken[] = [];
  let at = 0;
  for (const match of text.matchAll(new RegExp(PHOTO_TOKEN_RE))) {
    if (match.index > at) out.push({ kind: 'text', text: text.slice(at, match.index) });
    out.push({ kind: 'photo', id: match[1]! });
    at = match.index + match[0].length;
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) });
  return out;
}
