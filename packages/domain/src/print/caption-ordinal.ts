/*
 * Story 22.3 (Bruno, 2026-11-06): inside one photo block of section 9 (a sheet's, a local's)
 * and inside section 7, a caption that repeats an earlier one reads apart at print: the first
 * keeps its text, the second takes " (2)", the third " (3)", the suffix before the closing
 * period ("Ensaio de resistência de isolamento — TR-1 (2)."). Captions stay as stored, so the
 * screen is unchanged, and the photo numbers are untouched. An uncaptioned photo is never
 * suffixed and never counts.
 */

/** The text two captions are compared by: trimmed, one final "." ignored. */
function captionKey(caption: string): string {
  const text = caption.trim();
  return text.endsWith('.') ? text.slice(0, -1).trimEnd() : text;
}

/** One caption with its ordinal: " (n)" before a final ".", else at the end. */
function withOrdinal(caption: string, n: number): string {
  const text = caption.trim();
  return text.endsWith('.') ? `${text.slice(0, -1).trimEnd()} (${n}).` : `${text} (${n})`;
}

/**
 * A block's captions in print order, each repeated one with its ordinal (equal when trimmed,
 * a final "." ignored); a null or blank caption comes back as given and never counts. Same
 * length and order as the input.
 */
export function withCaptionOrdinals(captions: readonly (string | null)[]): (string | null)[] {
  const seen = new Map<string, number>();
  return captions.map((caption) => {
    if (caption === null || caption.trim() === '') return caption;
    const key = captionKey(caption);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? caption : withOrdinal(caption, count);
  });
}
