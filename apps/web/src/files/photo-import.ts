import { capturedAtFrom, parseExif, toIso } from '@app/domain';
import type { PhotoCaptureInput } from '../db/file-commit.ts';
import type { EncodedPhoto } from './photo-encode.ts';

/*
 * Story 6.4 (FR-45, AR-16): photos that come in as files -- picked with "Escolher arquivos"
 * or dropped on a sheet or the gallery, during the visit or after it, from this device or
 * someone else's phone. Each file is read on the device: a HEIC is converted to JPEG first
 * (`heic-to`, loaded only when a HEIC arrives), the EXIF time and GPS are read from the
 * source bytes (else the file's `lastModified`, else the device clock; no coords), the
 * picture is re-encoded like a shot (`encodePhoto`) and saved through the same one-shot
 * commit as the camera (`commitPhotoCapture`). A file that is not a picture, or that cannot
 * be decoded, is skipped and counted.
 */

const EXIF_HEAD_BYTES = 256 * 1024;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'jpe', 'png', 'webp', 'heic', 'heif']);
const HEIC_TYPES = new Set(['image/heic', 'image/heif']);
const HEIC_EXTENSIONS = new Set(['heic', 'heif']);

/** What the `<input type="file">` offers: every image, plus HEIC by extension (some systems give it no type). */
export const PHOTO_ACCEPT = 'image/*,.heic,.heif';

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** A picture this path can read: JPEG, PNG, WebP or HEIC/HEIF, by type or extension. */
export function isImportableImage(file: Pick<File, 'name' | 'type'>): boolean {
  return IMAGE_TYPES.has(file.type.toLowerCase()) || IMAGE_EXTENSIONS.has(extensionOf(file.name));
}

/** The pictures of a pick or a drop, and how many other files it held. */
export function splitImportable<F extends Pick<File, 'name' | 'type'>>(files: readonly F[]): { images: F[]; skipped: number } {
  const images = files.filter(isImportableImage);
  return { images, skipped: files.length - images.length };
}

export function isHeic(file: Pick<File, 'name' | 'type'>): boolean {
  return HEIC_TYPES.has(file.type.toLowerCase()) || HEIC_EXTENSIONS.has(extensionOf(file.name));
}

/** The browser's HEIC decoder, loaded on first use only (it is large). */
export async function heicToJpeg(blob: Blob): Promise<Blob> {
  const { heicTo } = await import('heic-to');
  return heicTo({ blob, type: 'image/jpeg', quality: 0.92 });
}

/** Where the imported photos go: a sheet (and item) with its caption, or "Geral". */
export interface ImportTarget {
  blockId: string | null;
  itemKey: string | null;
  caption: string | null;
}

export interface ImportDeps {
  companyId: string;
  relatorioId: string;
  actorId: string;
  newId: () => string;
  now: () => Date;
  encode: (source: Blob) => Promise<EncodedPhoto>;
  commit: (input: PhotoCaptureInput) => Promise<unknown>;
  convertHeic?: (blob: Blob) => Promise<Blob>;
  /** FR-8: the EXIF position is kept only while the user allows photo locations. */
  withLocation?: boolean;
}

export interface ImportResult {
  /** The ids of the photos saved, in the order the files came. */
  saved: string[];
  /** Files left out: not a picture, or one that could not be read. */
  skipped: number;
}

async function readHead(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, EXIF_HEAD_BYTES).arrayBuffer());
}

/** Imports the files one after another, in the order given. */
export async function importPhotoFiles(files: readonly File[], target: ImportTarget, deps: ImportDeps): Promise<ImportResult> {
  const saved: string[] = [];
  let skipped = 0;
  for (const file of files) {
    if (!isImportableImage(file)) {
      skipped += 1;
      continue;
    }
    try {
      // A HEIC keeps its Exif item anywhere in the file: read it whole.
      const exif = parseExif(isHeic(file) ? new Uint8Array(await file.arrayBuffer()) : await readHead(file));
      const source = isHeic(file) ? await (deps.convertHeic ?? heicToJpeg)(file) : file;
      const encoded = await deps.encode(source);
      const clock = deps.now();
      const deviceOffset = -clock.getTimezoneOffset();
      // No EXIF time: the file's own date, else the device clock.
      const fallback = Number.isFinite(file.lastModified) && file.lastModified > 0 ? new Date(file.lastModified) : clock;
      const time = capturedAtFrom(exif, toIso(fallback), exif.dateTimeOriginal === null ? -fallback.getTimezoneOffset() : deviceOffset);
      const coords = (deps.withLocation ?? true) && exif.gps !== null ? { ...exif.gps, accuracy_m: null, source: 'exif' as const } : null;
      const fileId = deps.newId();
      await deps.commit({
        companyId: deps.companyId,
        relatorioId: deps.relatorioId,
        actorId: deps.actorId,
        fileId,
        blockId: target.blockId,
        itemKey: target.itemKey,
        caption: target.caption,
        capturedAt: time.captured_at,
        tzOffset: time.tz_offset,
        coords,
        original: encoded.original,
        thumb: encoded.thumb,
        sha256: encoded.sha256,
      });
      saved.push(fileId);
    } catch (error) {
      console.error('photo import failed', error);
      skipped += 1;
    }
  }
  return { saved, skipped };
}
