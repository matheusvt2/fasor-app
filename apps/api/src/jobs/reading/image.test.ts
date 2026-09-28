import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { exifOrientation, readingImage } from './image.ts';

/*
 * Story 8.4: the reading image. A photo stored sideways (EXIF orientation 6, the usual phone
 * portrait) reaches OCR upright; an upright one passes through byte for byte.
 */

/** A 60 x 20 image whose four corners have four colours, so every orientation is visible. */
async function corners(): Promise<Buffer> {
  const w = 60;
  const h = 20;
  const pixels = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const right = x >= w / 2;
      const bottom = y >= h / 2;
      pixels[i] = right ? 255 : 0;
      pixels[i + 1] = bottom ? 255 : 0;
      pixels[i + 2] = right && bottom ? 255 : 40;
    }
  }
  return sharp(pixels, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

async function rawPixels(bytes: Uint8Array): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

describe('8.4-API readingImage', () => {
  it('orientation 6: the print comes out rotated, width and height swapped, JPEG without EXIF', async () => {
    const print = await sharp(await corners()).jpeg({ quality: 90 }).toBuffer();
    const original = await sharp(print).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const orientation = await exifOrientation(original);
    expect(orientation).toBe(6);
    const image = await readingImage({ print, printMime: 'image/jpeg', orientation });
    expect(image).toMatchObject({ mime: 'image/jpeg', width: 20, height: 60 });
    const metadata = await sharp(image.bytes).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(20);
    expect(metadata.height).toBe(60);
    expect(metadata.orientation).toBeUndefined();
  });

  it('orientation 1 or none: the print bytes pass through', async () => {
    const print = new Uint8Array(await sharp(await corners()).jpeg().toBuffer());
    for (const orientation of [1, undefined]) {
      const image = await readingImage({ print, printMime: 'image/jpeg', orientation });
      expect(image.bytes).toBe(print);
      expect(image).toMatchObject({ mime: 'image/jpeg', width: 60, height: 20 });
    }
  });

  it('every orientation 2 to 8 matches sharp auto-orienting the same pixels', async () => {
    const png = await corners();
    for (let orientation = 2; orientation <= 8; orientation++) {
      const tagged = await sharp(png).withMetadata({ orientation }).png().toBuffer();
      const reference = await rawPixels(await sharp(tagged).rotate().png().toBuffer());
      const image = await readingImage({ print: png, printMime: 'image/png', orientation });
      expect(image.mime).toBe('image/png');
      const ours = await rawPixels(image.bytes);
      expect({ width: ours.width, height: ours.height }, `orientation ${orientation}`).toEqual({ width: reference.width, height: reference.height });
      expect(ours.data.equals(reference.data), `orientation ${orientation}`).toBe(true);
    }
  });

  it('reads no orientation from bytes that are not an image', async () => {
    expect(await exifOrientation(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});
