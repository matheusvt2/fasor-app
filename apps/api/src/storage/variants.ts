import sharp from 'sharp';

/*
 * AD-7: the server derives two sizes from an uploaded image — `thumb` for a tile and
 * `print` for the rendered document. `application/pdf` produces none (Epic 7's renderer
 * embeds the original); `image/svg+xml` is rasterized through sharp's `density` path so
 * a vector logo still has a bitmap the DOCX renderer can place.
 */

export const THUMB_MAX_PX = 480;
export const PRINT_MAX_PX = 1600;

export interface RenderedVariant {
  bytes: Uint8Array;
  contentType: string;
}

export interface RenderedVariants {
  thumb: RenderedVariant;
  print: RenderedVariant;
}

/** JPEG stays JPEG (photographic covers); everything else, including SVG, becomes PNG. */
function outputFormat(mime: string): 'jpeg' | 'png' {
  return mime === 'image/jpeg' ? 'jpeg' : 'png';
}

/** True when sharp can read this mime at all; a pdf cannot, so it gets no variants. */
export function hasVariants(mime: string): boolean {
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/svg+xml';
}

async function render(source: Uint8Array, mime: string, maxPx: number): Promise<RenderedVariant> {
  const format = outputFormat(mime);
  // A vector has no intrinsic pixel size: the density makes sharp rasterize it large
  // enough that the `resize` below is a downscale, never an upscale of a 72 dpi render.
  const input = mime === 'image/svg+xml' ? sharp(source, { density: 300 }) : sharp(source);
  const pipeline = input.resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true });
  const bytes = await (format === 'jpeg' ? pipeline.jpeg({ quality: 82 }) : pipeline.png()).toBuffer();
  return { bytes: new Uint8Array(bytes), contentType: format === 'jpeg' ? 'image/jpeg' : 'image/png' };
}

/**
 * Both variants of one uploaded image, or null when the mime has none. Throws when the
 * bytes are not the image they claim to be; the caller logs it and leaves the file
 * uploaded without variants (a sharp failure is never fatal to the upload).
 */
export async function renderVariants(source: Uint8Array, mime: string): Promise<RenderedVariants | null> {
  if (!hasVariants(mime)) return null;
  const [thumb, print] = await Promise.all([render(source, mime, THUMB_MAX_PX), render(source, mime, PRINT_MAX_PX)]);
  return { thumb, print };
}
