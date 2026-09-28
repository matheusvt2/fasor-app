import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { PRINT_MAX_PX, renderVariants, THUMB_MAX_PX } from './variants.ts';

/*
 * Epic 9 A12: the variants are upright. A phone portrait is usually stored as landscape
 * pixels tagged EXIF orientation 6; both variants apply the tag to the pixels and drop it.
 */

/** A 2400 x 1200 JPEG whose left half is red and right half blue, tagged orientation 6. */
async function sidewaysJpeg(): Promise<Uint8Array> {
  const left = await sharp({ create: { width: 1200, height: 1200, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
  const pixels = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: { r: 0, g: 0, b: 255 } } })
    .composite([{ input: left, left: 0, top: 0 }])
    .png()
    .toBuffer();
  return new Uint8Array(await sharp(pixels).withMetadata({ orientation: 6 }).jpeg({ quality: 90 }).toBuffer());
}

/** The mean colour of a small patch centred on (x, y). */
async function patch(bytes: Uint8Array, x: number, y: number): Promise<{ r: number; b: number }> {
  const { data } = await sharp(bytes).extract({ left: x - 2, top: y - 2, width: 5, height: 5 }).raw().toBuffer({ resolveWithObject: true });
  let r = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 3) {
    r += data[i]!;
    b += data[i + 2]!;
  }
  return { r: r / (data.length / 3), b: b / (data.length / 3) };
}

describe('A12 renderVariants auto-orients', () => {
  it('an EXIF-6 original yields upright thumb and print (width and height swapped vs the raw pixels), with no EXIF', async () => {
    const original = await sidewaysJpeg();
    const raw = await sharp(original).metadata();
    expect([raw.width, raw.height, raw.orientation]).toEqual([2400, 1200, 6]);

    const variants = (await renderVariants(original, 'image/jpeg'))!;
    for (const [name, variant, maxPx] of [
      ['thumb', variants.thumb, THUMB_MAX_PX],
      ['print', variants.print, PRINT_MAX_PX],
    ] as const) {
      const meta = await sharp(variant.bytes).metadata();
      expect(variant.contentType, name).toBe('image/jpeg');
      // Upright: portrait, the long edge bounded by the variant's size.
      expect(meta.height, name).toBe(maxPx);
      expect(meta.width, name).toBe(maxPx / 2);
      expect(meta.orientation, name).toBeUndefined();
      expect(meta.exif, name).toBeUndefined();
      // Orientation 6 turns the pixels 90 degrees clockwise: the raw left (red) half is on top.
      const top = await patch(variant.bytes, meta.width! / 2, Math.round(meta.height! / 4));
      const bottom = await patch(variant.bytes, meta.width! / 2, Math.round((3 * meta.height!) / 4));
      expect(top.r, name).toBeGreaterThan(200);
      expect(bottom.b, name).toBeGreaterThan(200);
    }
  });

  it('an untagged image keeps its orientation', async () => {
    const png = new Uint8Array(await sharp({ create: { width: 600, height: 300, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer());
    const variants = (await renderVariants(png, 'image/png'))!;
    const meta = await sharp(variants.thumb.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([THUMB_MAX_PX, THUMB_MAX_PX / 2]);
  });

  it('bytes that are not the image they claim still throw (the caller logs and keeps the file without variants)', async () => {
    await expect(renderVariants(new Uint8Array([1, 2, 3]), 'image/jpeg')).rejects.toThrow();
  });
});
