/*
 * Story 6.1 (AD-7, AR-16): the on-device re-encode of one shot. The original is a JPEG
 * whose long edge is at most 2560 px at quality 0.85, with the EXIF orientation applied
 * (`imageOrientation: 'from-image'`, so the pixels are upright and no orientation tag is
 * needed); the device thumb is at most 512 px. The sha256 is of the bytes that will be
 * uploaded, which is what the server checks (`PUT /api/files/{id}`).
 *
 * Story 13.1 (CAP-1), re-measured 2026-10-07: the camera now streams (and a single shot
 * takes) at up to 3840x2160, and 2560 px / 0.85 is kept as the story allows. Whether a
 * larger cap reads plates better cannot be scored here: under the `fake` providers the OCR
 * returns canned values whatever the pixels, so the fixture plates give no accuracy signal.
 * The cap is revisited once a real provider can score the fixtures.
 */

export const ORIGINAL_MAX_PX = 2560;
export const ORIGINAL_QUALITY = 0.85;
export const THUMB_MAX_PX = 512;
export const THUMB_QUALITY = 0.8;

export interface EncodedPhoto {
  original: Blob;
  thumb: Blob;
  sha256: string;
}

/** The size that fits `max` on the long edge, never enlarged. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const long = Math.max(width, height);
  const scale = long > max ? max / long : 1;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

type Canvas = OffscreenCanvas | HTMLCanvasElement;

/** `source` drawn at `width` x `height` on a new canvas. */
function drawn(source: CanvasImageSource, width: number, height: number): Canvas {
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (context === null) throw new Error('no 2d context');
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

function jpegOf(canvas: Canvas, quality: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => (blob === null ? reject(new Error('jpeg encode failed')) : resolve(blob)), 'image/jpeg', quality);
  });
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Re-encodes one shot: a picked file (a Blob, EXIF orientation applied on decode) or a
 * frame already decoded (the viewfinder's ImageBitmap). A bitmap this function decoded is
 * closed before it returns; one the caller passed stays the caller's.
 */
export async function encodePhoto(source: Blob | ImageBitmap): Promise<EncodedPhoto> {
  const owned = source instanceof Blob;
  const bitmap = owned ? await createImageBitmap(source, { imageOrientation: 'from-image' }) : source;
  try {
    const size = fitWithin(bitmap.width, bitmap.height, ORIGINAL_MAX_PX);
    const large = drawn(bitmap, size.width, size.height);
    const original = await jpegOf(large, ORIGINAL_QUALITY);
    // W-24 (full review 2026-09-30): the thumb is drawn from the resized canvas, never from
    // the full-size picture again; its size is still fitted to the picture's own.
    const thumbSize = fitWithin(bitmap.width, bitmap.height, THUMB_MAX_PX);
    const thumb = await jpegOf(drawn(large, thumbSize.width, thumbSize.height), THUMB_QUALITY);
    return { original, thumb, sha256: await sha256Hex(original) };
  } finally {
    if (owned) bitmap.close();
  }
}
