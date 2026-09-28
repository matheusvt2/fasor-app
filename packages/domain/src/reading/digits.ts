import type { OcrToken } from '../contract/ocr.ts';

/*
 * Story 8.5 AC 1 (wrong-digit protection): a value is `suggested` only when its digits are
 * exactly the digits of the OCR tokens it cites, read in the order the OCR read them. The
 * rule runs on the server for every kind, and ignores any trust or confidence the model
 * sends. A value without digits that cites a token with one ("Dyn" for "Dyn1") is the
 * missing-digit case, so it fails the same way.
 */

/** The digits of `text`, `0-9` only, in order. */
export function digitsOf(text: string): string {
  return text.replace(/[^0-9]/g, '');
}

/** The index of an OCR token id (`t12` -> 12); `Infinity` for an id of another shape. */
export function tokenIndex(id: string): number {
  const match = /^t(\d+)$/.exec(id);
  return match === null ? Number.POSITIVE_INFINITY : Number(match[1]);
}

/** The tokens in OCR array order (their `t{index}` ids), whatever order they were cited in. */
export function inTokenOrder<T extends Pick<OcrToken, 'id'>>(tokens: readonly T[]): T[] {
  return [...tokens].sort((a, b) => tokenIndex(a.id) - tokenIndex(b.id));
}

/**
 * True when `valueText` carries exactly the digits of the cited tokens' text joined in
 * token-array order: an extra digit or a missing one is false.
 */
export function digitCoverage(valueText: string, citedTokens: readonly Pick<OcrToken, 'id' | 'text'>[]): boolean {
  const cited = inTokenOrder(citedTokens)
    .map((token) => token.text)
    .join('');
  return digitsOf(valueText) === digitsOf(cited);
}
