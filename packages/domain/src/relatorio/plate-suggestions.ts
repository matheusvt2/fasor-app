import type { PhotoFileRow, SuggestionRow } from '../schemas/entities.ts';
import { plural } from '../text/plural.ts';

/*
 * E9-A7, part of `suggestions.ts`: the plate photo (which one, its reading state, the crop
 * geometry) and the arrival and count texts of Stories 8.2 and 8.6.
 */

// --- the plate photo (Stories 8.2 and 8.6) ---------------------------------------------------

/** The caption of a plate photo, set at capture (it is a normal sheet photo otherwise). */
export const PLATE_CAPTION = 'placa de identificação';

/** What `platePhotoOf` reads of a photo row. */
export type PlatePhotoLike = Pick<PhotoFileRow, 'id' | 'block_id' | 'reading_kind' | 'local_seq' | 'captured_at'> & { removed_at?: string | null };

/**
 * The plate photo of one sheet: the newest live photo taken with the "Fotografar placa" tile
 * (`reading_kind = 'plate'`) on that block, by `local_seq` then `captured_at`; null when none.
 */
export function platePhotoOf<T extends PlatePhotoLike>(photos: readonly T[], blockId: string): T | null {
  let best: T | null = null;
  for (const photo of photos) {
    if ((photo.removed_at ?? null) !== null || photo.reading_kind !== 'plate' || photo.block_id !== blockId) continue;
    if (best === null || photo.local_seq > best.local_seq || (photo.local_seq === best.local_seq && photo.captured_at > best.captured_at)) best = photo;
  }
  return best;
}

/**
 * Review 2026-10-08 (CAPT-V1): the plate photos a retake supersedes, whose readings this
 * device cancels: the live plate photos of `blockId`, the new shot (`keepId`) excepted.
 */
export function supersededPlatePhotos<T extends PlatePhotoLike>(photos: readonly T[], blockId: string, keepId: string | null | undefined): T[] {
  return photos.filter((photo) => (photo.removed_at ?? null) === null && photo.reading_kind === 'plate' && photo.block_id === blockId && photo.id !== keepId);
}

export type PlateReadingView = 'queued' | 'running' | 'failed' | 'ready' | 'done' | 'empty';

/**
 * Where the plate photo's reading stands on the sheet: `ready` while any pending suggestion
 * was read from it (whatever its stored status), else its `reading_status`: `queued`
 * ("Foto guardada — leitura quando houver sinal"), `running` ("Lendo…"), `failed` ("Não foi
 * possível ler"), and `done` (nothing left to confirm; `none` reads the same, no line).
 *
 * Review 2026-10-08 (CAPT-V1): `empty` is a `done` reading that read nothing: no suggestion
 * row of any status cites the photo ("Nada foi lido nesta foto", a retake and the way to
 * type). `rows` are all the device's suggestion rows of the relatório, not only the pending
 * ones: a reading whose suggestions were all confirmed or discarded is `done`, not `empty`.
 * The server writes a run's rows and its `done` status in one batch, so the device never
 * sees `done` before the rows.
 */
export function plateReadingView(photo: Pick<PhotoFileRow, 'id' | 'reading_status'>, rows: readonly Pick<SuggestionRow, 'status' | 'source'>[]): PlateReadingView {
  if (rows.some((row) => row.status === 'pending' && row.source.photo_id === photo.id)) return 'ready';
  switch (photo.reading_status) {
    case 'queued':
    case 'running':
    case 'failed':
      return photo.reading_status;
    case 'done':
      return rows.some((row) => row.source.photo_id === photo.id) ? 'done' : 'empty';
    default:
      return 'done';
  }
}

/** A normalized region of a picture, `[x0, y0, x1, y1]`, each 0 to 1. */
export type NormalizedBox = readonly [number, number, number, number];

/** The margin around the read region of the plate crop, in normalized units. */
export const PLATE_CROP_MARGIN = 0.02;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * The plate crop's region: the union of the `bbox`es of the pending suggestions read from
 * `photoId`, grown by a small margin and clamped to the picture; null when none is.
 */
export function plateCropRegion(pending: readonly Pick<SuggestionRow, 'status' | 'source'>[], photoId: string, margin = PLATE_CROP_MARGIN): NormalizedBox | null {
  let box: [number, number, number, number] | null = null;
  for (const row of pending) {
    if (row.status !== 'pending' || row.source.photo_id !== photoId) continue;
    const [x0, y0, x1, y1] = row.source.bbox;
    box = box === null ? [x0, y0, x1, y1] : [Math.min(box[0], x0), Math.min(box[1], y0), Math.max(box[2], x1), Math.max(box[3], y1)];
  }
  if (box === null) return null;
  const out: [number, number, number, number] = [clamp01(box[0] - margin), clamp01(box[1] - margin), clamp01(box[2] + margin), clamp01(box[3] + margin)];
  // A degenerate region still draws a sliver of the picture.
  if (out[2] <= out[0]) out[0] = Math.max(0, out[2] - 0.01);
  if (out[3] <= out[1]) out[1] = Math.max(0, out[3] - 0.01);
  return out;
}

/**
 * E78-Q14: the crop region widened symmetrically until its aspect in pixels of the picture
 * (`image`) is at least `minRatio` (the box's own width over height), so a tall, narrow read
 * region fills the box's width instead of drawing a sliver. The wider region is shifted to
 * stay inside the picture and stops at its full width; its height never changes. A region
 * already wide enough (or a degenerate input) is returned as it is.
 */
export function padCropToAspect(region: NormalizedBox, image: { width: number; height: number }, minRatio: number): NormalizedBox {
  const [x0, y0, x1, y1] = region;
  const heightPx = (y1 - y0) * image.height;
  if (!(heightPx > 0) || !(image.width > 0) || !(minRatio > 0)) return region;
  if (((x1 - x0) * image.width) / heightPx >= minRatio) return region;
  const width = Math.min(1, (minRatio * heightPx) / image.width);
  const centre = (x0 + x1) / 2;
  let left = centre - width / 2;
  let right = centre + width / 2;
  if (left < 0) {
    right -= left;
    left = 0;
  }
  if (right > 1) {
    left -= right - 1;
    right = 1;
  }
  return [clamp01(left), y0, clamp01(right), y1];
}

/** E78-R1: the margin around the focused field's own region when the plate crop zooms to it, in normalized units. */
export const PLATE_FOCUS_MARGIN = 0.03;

/**
 * E78-R1: the part of the plate photo the crop shows. While a field is focused, its own
 * region grown by `margin` and clamped to the picture, so its plate text is drawn legibly
 * (the whole read region shrank it to about 7 px at 768 px); otherwise the read region.
 * Once the picture's size is known (`image`), the result is widened to the box's aspect
 * (`padCropToAspect`, `boxRatio` = the box's width over its height).
 */
export function plateCropView(
  region: NormalizedBox,
  focused: NormalizedBox | null,
  image: { width: number; height: number } | null,
  boxRatio: number,
  margin = PLATE_FOCUS_MARGIN,
): NormalizedBox {
  const base: NormalizedBox =
    focused === null ? region : [clamp01(focused[0] - margin), clamp01(focused[1] - margin), clamp01(focused[2] + margin), clamp01(focused[3] + margin)];
  return image === null ? base : padCropToAspect(base, image, boxRatio);
}

/**
 * Where `inner` sits inside `outer` (both normalized boxes of one picture), in percent of
 * `outer`: the outline of the focused field on the plate crop, clamped to the crop.
 */
export function regionWithin(outer: NormalizedBox, inner: NormalizedBox): { left: number; top: number; width: number; height: number } {
  const w = outer[2] - outer[0];
  const h = outer[3] - outer[1];
  if (w <= 0 || h <= 0) return { left: 0, top: 0, width: 100, height: 100 };
  const x0 = clamp01((inner[0] - outer[0]) / w);
  const y0 = clamp01((inner[1] - outer[1]) / h);
  const x1 = clamp01((inner[2] - outer[0]) / w);
  const y1 = clamp01((inner[3] - outer[1]) / h);
  return { left: x0 * 100, top: y0 * 100, width: Math.max(0, x1 - x0) * 100, height: Math.max(0, y1 - y0) * 100 };
}

// --- arrivals and counts (Stories 8.2 and 8.6) -------------------------------------------------

/** "da foto 3": the one photo every row was read from, null when none or several. */
export function singleSourcePhotoId(rows: readonly Pick<SuggestionRow, 'source'>[]): string | null {
  const ids = new Set(rows.map((row) => row.source.photo_id));
  if (ids.size !== 1) return null;
  return [...ids][0]!;
}

/** How many readings arrived with these new suggestion rows: their distinct reading runs. */
export function arrivedReadingsCount(newRows: readonly Pick<SuggestionRow, 'source'>[]): number {
  return new Set(newRows.map((row) => row.source.reading_run_id)).size;
}

/** The arrival toast: "3 leituras prontas para confirmar" / "1 leitura pronta para confirmar". */
export function leiturasProntasText(n: number): string {
  return plural(n, 'leitura pronta para confirmar', 'leituras prontas para confirmar');
}

/** Sync status, "Leituras": "2 leituras na fila" / "1 leitura na fila". */
export function leiturasNaFilaText(n: number): string {
  return plural(n, 'leitura na fila', 'leituras na fila');
}

/** The sheet's banner: "Sugestões prontas — 9 campos para confirmar". */
export function sugestoesProntasBannerText(n: number): string {
  return `Sugestões prontas — ${plural(n, 'campo para confirmar', 'campos para confirmar')}`;
}
