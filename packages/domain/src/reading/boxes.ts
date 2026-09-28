import type { OcrBbox } from '../contract/ocr.ts';

/*
 * Story 8.4: every bbox of a suggestion comes from OCR (the model cites tokens, never
 * coordinates). The job unions the cited tokens' pixel boxes and normalizes the union over
 * the width and height of the exact image both providers received.
 */

export type Box = readonly [number, number, number, number];

/** The smallest box holding every box given; null for none. */
export function unionBox(boxes: readonly Box[]): [number, number, number, number] | null {
  if (boxes.length === 0) return null;
  let [x0, y0, x1, y1] = boxes[0]!;
  for (const [a0, b0, a1, b1] of boxes.slice(1)) {
    x0 = Math.min(x0, a0);
    y0 = Math.min(y0, b0);
    x1 = Math.max(x1, a1);
    y1 = Math.max(y1, b1);
  }
  return [x0, y0, x1, y1];
}

function unit(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * 10_000) / 10_000;
}

/** A pixel box over `image` as `[x0, y0, x1, y1]` in [0, 1], clamped and rounded to 4 decimals. */
export function normalizeBox(box: Box | OcrBbox, image: { width: number; height: number }): [number, number, number, number] {
  const [x0, y0, x1, y1] = box;
  return [unit(x0 / image.width), unit(y0 / image.height), unit(x1 / image.width), unit(y1 / image.height)];
}
