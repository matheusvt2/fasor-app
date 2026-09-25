import { photoFileRowSchema, type RegistryRow, type UserRow } from '@app/domain';
import { useLiveQuery } from './live.ts';
import { GEOLOCATION_DENIED_PREF, PHOTO_SEQ_PREF, type AppDatabase, type UploadError } from './schema.ts';

/*
 * Stories 6.1 and 6.2: the device-store reads the camera and the photo tiles need. Every
 * surface reads through here (AD-1: `apps/web` renders only from IndexedDB).
 */

/** One photo tile as a surface draws it: the kernel row's fields, the thumb and the local error. */
export interface PhotoTile {
  id: string;
  item_key: string | null;
  caption: string | null;
  captured_at: string;
  local_seq: number;
  uploaded_at: string | null;
  thumb: Blob | null;
  upload_error: UploadError | null;
}

const byCapture = (a: PhotoTile, b: PhotoTile) =>
  a.captured_at !== b.captured_at ? (a.captured_at < b.captured_at ? -1 : 1) : a.local_seq !== b.local_seq ? a.local_seq - b.local_seq : a.id < b.id ? -1 : 1;

/** The live photos of one sheet (every checklist item's and the sheet's own), in capture order. */
export async function photoTilesOfBlock(db: AppDatabase, relatorioId: string, blockId: string): Promise<PhotoTile[]> {
  // Read through the `entity` index, so the live query behind a sheet re-runs on a file
  // change only, never on each reading the sheet commits.
  const records = await db.entities.where('entity').equals('file').toArray();
  const tiles: PhotoTile[] = [];
  for (const record of records) {
    if (record.relatorio_id !== relatorioId) continue;
    const parsed = photoFileRowSchema.safeParse(record.row);
    if (!parsed.success) continue;
    const row = parsed.data;
    if (row.removed_at !== null || row.block_id !== blockId) continue;
    const [thumb, blob] = await Promise.all([db.thumbs.get(row.id), db.files.get(row.id)]);
    tiles.push({
      id: row.id,
      item_key: row.item_key,
      caption: row.caption,
      captured_at: row.captured_at,
      local_seq: row.local_seq,
      uploaded_at: row.uploaded_at,
      thumb: thumb?.blob ?? null,
      upload_error: blob?.upload_error ?? null,
    });
  }
  return tiles.sort(byCapture);
}

const NO_TILES: PhotoTile[] = [];

export function useBlockPhotoTiles(db: AppDatabase | null, relatorioId: string, blockId: string): PhotoTile[] {
  return (
    useLiveQuery(
      () => (db === null ? Promise.resolve(NO_TILES) : photoTilesOfBlock(db, relatorioId, blockId)),
      [db, relatorioId, blockId],
      NO_TILES,
    ) ?? NO_TILES
  );
}

/** The registry's `local` words (gender and number for the caption's location, AD-19). */
export async function localWordRows(db: AppDatabase): Promise<RegistryRow[]> {
  const records = await db.entities.where('entity').equals('registry').toArray();
  return records.map((record) => record.row as RegistryRow).filter((row) => row.kind === 'local');
}

const NO_REGISTRY: RegistryRow[] = [];

export function useLocalWordRows(db: AppDatabase | null): RegistryRow[] {
  return useLiveQuery(() => (db === null ? Promise.resolve(NO_REGISTRY) : localWordRows(db)), [db], NO_REGISTRY) ?? NO_REGISTRY;
}

/** FR-8: the user's `photo_location_enabled`, true until their row says otherwise (the default). */
export async function photoLocationEnabled(db: AppDatabase, userId: string): Promise<boolean> {
  const record = await db.entities.get(['user', userId]);
  const row = record?.row as UserRow | undefined;
  return row?.photo_location_enabled ?? true;
}

/** Story 6.1: the browser refused the position (read by Epic 11's location switch surface). */
export async function writeGeolocationDenied(db: AppDatabase): Promise<void> {
  await db.local_prefs.put({ key: GEOLOCATION_DENIED_PREF, value: true });
}

/** The current per-device photo counter (the capture rescue numbers a shot it cannot store with it). */
export async function readPhotoSeq(db: AppDatabase): Promise<number> {
  const row = await db.local_prefs.get(PHOTO_SEQ_PREF);
  return typeof row?.value === 'number' ? row.value : 0;
}
