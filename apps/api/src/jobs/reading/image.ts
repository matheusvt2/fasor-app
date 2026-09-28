import type { OcrImage } from '@app/domain';
import sharp from 'sharp';
import { JPEG_QUALITY } from '../../storage/variants.ts';

/*
 * Story 8.4: the image both reading providers receive. Since Epic 9 A12 the `print` variant
 * is already upright with no EXIF (`storage/variants.ts` applies the original's orientation
 * when it renders), so the job sends the print bytes as they are and never rotates them a
 * second time; bytes in another format are re-encoded (JPEG when the print is declared JPEG,
 * else PNG). The OCR sidecar reads the pixel grid as received, so its boxes, and the
 * suggestions' normalized boxes, are in the space of exactly these bytes.
 */

export interface ReadingImage extends OcrImage {
  width: number;
  height: number;
}

export interface ReadingImageInput {
  print: Uint8Array;
  /** The stored print variant's content type; the bytes' own format wins when they disagree. */
  printMime: string;
}

function mimeOf(format: string | undefined, fallback: string): OcrImage['mime'] {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'png') return 'image/png';
  return fallback === 'image/jpeg' ? 'image/jpeg' : 'image/png';
}

export async function readingImage(input: ReadingImageInput): Promise<ReadingImage> {
  const metadata = await sharp(input.print).metadata();
  const mime = mimeOf(metadata.format, input.printMime);
  if (metadata.format === 'jpeg' || metadata.format === 'png') {
    return { bytes: input.print, mime, width: metadata.width, height: metadata.height };
  }
  const pipeline = sharp(input.print);
  const encoded = mime === 'image/jpeg' ? pipeline.jpeg({ quality: JPEG_QUALITY }) : pipeline.png();
  const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
  return { bytes: new Uint8Array(data), mime, width: info.width, height: info.height };
}
