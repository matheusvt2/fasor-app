import type { OcrImage } from '@app/domain';
import sharp from 'sharp';
import { JPEG_QUALITY } from '../../storage/variants.ts';

/*
 * Story 8.4 (closes the Story 8.3 orientation entry): the image both reading providers
 * receive. The `print` variant is re-encoded without `.rotate()` (AD-7, `storage/variants.ts`),
 * so a photo whose pixels are stored sideways would reach OCR sideways; when the original's
 * EXIF orientation is 2 to 8 the job applies it to the print bytes and re-encodes them in the
 * same format with no EXIF. The OCR sidecar reads the pixel grid as received, so its boxes,
 * and the suggestions' normalized boxes, are in the space of exactly these bytes.
 */

export interface ReadingImage extends OcrImage {
  width: number;
  height: number;
}

export interface ReadingImageInput {
  print: Uint8Array;
  /** The stored print variant's content type; the bytes' own format wins when they disagree. */
  printMime: string;
  /** The original's EXIF orientation (`sharp(original).metadata().orientation`), when it has one. */
  orientation: number | undefined;
}

/** The pipeline that turns pixels stored with EXIF orientation `n` upright (sharp mirrors before it rotates). */
function orient(image: sharp.Sharp, orientation: number): sharp.Sharp {
  switch (orientation) {
    case 2:
      return image.flop();
    case 3:
      return image.rotate(180);
    case 4:
      return image.flip();
    case 5:
      return image.flip().rotate(90);
    case 6:
      return image.rotate(90);
    case 7:
      return image.flop().rotate(90);
    case 8:
      return image.rotate(270);
    default:
      return image;
  }
}

function mimeOf(format: string | undefined, fallback: string): OcrImage['mime'] {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'png') return 'image/png';
  return fallback === 'image/jpeg' ? 'image/jpeg' : 'image/png';
}

export async function readingImage(input: ReadingImageInput): Promise<ReadingImage> {
  const metadata = await sharp(input.print).metadata();
  const mime = mimeOf(metadata.format, input.printMime);
  const upright = input.orientation !== undefined && input.orientation >= 2 && input.orientation <= 8;
  const sameFormat = metadata.format === 'jpeg' || metadata.format === 'png';
  if (!upright && sameFormat) {
    return { bytes: input.print, mime, width: metadata.width, height: metadata.height };
  }
  const pipeline = orient(sharp(input.print), upright ? input.orientation! : 1);
  const encoded = mime === 'image/jpeg' ? pipeline.jpeg({ quality: JPEG_QUALITY }) : pipeline.png();
  const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
  return { bytes: new Uint8Array(data), mime, width: info.width, height: info.height };
}

/** The EXIF orientation of the original bytes, or undefined when it carries none (or is not an image sharp reads). */
export async function exifOrientation(original: Uint8Array): Promise<number | undefined> {
  try {
    return (await sharp(original).metadata()).orientation;
  } catch {
    return undefined;
  }
}
