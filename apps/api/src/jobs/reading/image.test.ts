import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { renderVariants } from '../../storage/variants.ts';
import { readingImage } from './image.ts';

/*
 * Story 8.4, amended by Epic 9 A12: the reading image. The `print` variant is upright already
 * (the variants apply the original's EXIF orientation), so the job sends its bytes as they
 * are: a photo stored sideways is rotated once, when its variants are rendered, never again.
 */

describe('8.4-API readingImage', () => {
  it('A12: the print of an EXIF-6 original reaches OCR upright, the print bytes unchanged (not rotated a second time)', async () => {
    // Stored 200 x 100 with EXIF orientation 6: upright it is 100 x 200.
    const original = new Uint8Array(
      await sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 61, g: 6, b: 16 } } })
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer(),
    );
    const { print } = (await renderVariants(original, 'image/jpeg'))!;
    const image = await readingImage({ print: print.bytes, printMime: print.contentType });
    expect(image.bytes).toBe(print.bytes);
    expect(image).toMatchObject({ mime: 'image/jpeg', width: 100, height: 200 });
  });

  it('a JPEG or PNG print passes through byte for byte', async () => {
    const jpeg = new Uint8Array(await sharp({ create: { width: 60, height: 20, channels: 3, background: { r: 9, g: 9, b: 9 } } }).jpeg().toBuffer());
    expect(await readingImage({ print: jpeg, printMime: 'image/jpeg' })).toMatchObject({ bytes: jpeg, mime: 'image/jpeg', width: 60, height: 20 });
    const png = new Uint8Array(await sharp({ create: { width: 30, height: 40, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png().toBuffer());
    expect(await readingImage({ print: png, printMime: 'image/png' })).toMatchObject({ bytes: png, mime: 'image/png', width: 30, height: 40 });
  });

  it('a print in another format is re-encoded as its declared type', async () => {
    const webp = new Uint8Array(await sharp({ create: { width: 30, height: 10, channels: 3, background: { r: 9, g: 9, b: 9 } } }).webp().toBuffer());
    const image = await readingImage({ print: webp, printMime: 'image/png' });
    expect(image).toMatchObject({ mime: 'image/png', width: 30, height: 10 });
    expect((await sharp(image.bytes).metadata()).format).toBe('png');
  });
});
