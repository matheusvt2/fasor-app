import {
  CAPTION_RECENTS_MAX,
  comparePhotos,
  photoFileRowSchema,
  type PhotoFileRow,
  type RegistryRow,
  type UserRow,
} from '@app/domain';
import { useLiveQuery } from './live.ts';
import { CAPTION_RECENTS_PREF, GEOLOCATION_DENIED_PREF, PHOTO_SEQ_PREF, type AppDatabase, type UploadError } from './schema.ts';

/*
 * Stories 6.1 and 6.2: the device-store reads the camera and the photo tiles need. Every
 * surface reads through here (AD-1: `apps/web` renders only from IndexedDB).
 */

/** One photo tile as a surface draws it: the kernel row's fields, the thumb and the local error. */
export interface PhotoTile {
  id: string;
  block_id: string | null;
  item_key: string | null;
  caption: string | null;
  captured_at: string;
  local_seq: number;
  coords: PhotoFileRow['coords'];
  uploaded_at: string | null;
  thumb: Blob | null;
  upload_error: UploadError | null;
}

/** The live photos of one relatório matching `keep`, with their thumbs, in the kernel's capture order. */
async function photoTiles(db: AppDatabase, relatorioId: string, keep: (row: PhotoFileRow) => boolean): Promise<PhotoTile[]> {
  // Read through the `entity` index, so the live query behind a sheet re-runs on a file
  // change only, never on each reading the sheet commits.
  const records = await db.entities.where('entity').equals('file').toArray();
  const tiles: PhotoTile[] = [];
  for (const record of records) {
    if (record.relatorio_id !== relatorioId) continue;
    const parsed = photoFileRowSchema.safeParse(record.row);
    if (!parsed.success) continue;
    const row = parsed.data;
    if (row.removed_at !== null || !keep(row)) continue;
    const [thumb, blob] = await Promise.all([db.thumbs.get(row.id), db.files.get(row.id)]);
    tiles.push({
      id: row.id,
      block_id: row.block_id,
      item_key: row.item_key,
      caption: row.caption,
      captured_at: row.captured_at,
      local_seq: row.local_seq,
      coords: row.coords,
      uploaded_at: row.uploaded_at,
      thumb: thumb?.blob ?? null,
      upload_error: blob?.upload_error ?? null,
    });
  }
  return tiles.sort(comparePhotos);
}

/** The live photos of one sheet (every checklist item's and the sheet's own), in capture order. */
export async function photoTilesOfBlock(db: AppDatabase, relatorioId: string, blockId: string): Promise<PhotoTile[]> {
  return photoTiles(db, relatorioId, (row) => row.block_id === blockId);
}

/** Stories 6.3/6.6: every live photo of a relatório, in capture order (the gallery, the point editor's picker). */
export async function photoTilesOfRelatorio(db: AppDatabase, relatorioId: string): Promise<PhotoTile[]> {
  return photoTiles(db, relatorioId, () => true);
}

export function useRelatorioPhotoTiles(db: AppDatabase | null, relatorioId: string): PhotoTile[] {
  return (
    useLiveQuery(() => (db === null ? Promise.resolve(NO_TILES) : photoTilesOfRelatorio(db, relatorioId)), [db, relatorioId], NO_TILES) ?? NO_TILES
  );
}

/** Story 6.5: the composer's recent words of one relatório, most recent first. */
export interface CaptionRecents {
  atividade: string[];
  equipamento: string[];
  local: string[];
}

const NO_RECENTS: CaptionRecents = { atividade: [], equipamento: [], local: [] };

function namesOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export async function readCaptionRecents(db: AppDatabase, relatorioId: string): Promise<CaptionRecents> {
  const row = await db.local_prefs.get(CAPTION_RECENTS_PREF(relatorioId));
  const value = (row?.value ?? null) as Partial<Record<keyof CaptionRecents, unknown>> | null;
  if (value === null || typeof value !== 'object') return NO_RECENTS;
  return { atividade: namesOf(value.atividade), equipamento: namesOf(value.equipamento), local: namesOf(value.local) };
}

/** Puts the words just saved first in their rows, each once (case-insensitive), at most five per row. */
export async function pushCaptionRecents(db: AppDatabase, relatorioId: string, words: Partial<Record<keyof CaptionRecents, string | null>>): Promise<void> {
  await db.transaction('rw', db.local_prefs, async () => {
    const before = await readCaptionRecents(db, relatorioId);
    const next: CaptionRecents = { ...before };
    for (const key of ['atividade', 'equipamento', 'local'] as const) {
      const word = words[key]?.trim() ?? '';
      if (word === '') continue;
      const lower = word.toLocaleLowerCase('pt-BR');
      next[key] = [word, ...before[key].filter((known) => known.toLocaleLowerCase('pt-BR') !== lower)].slice(0, CAPTION_RECENTS_MAX);
    }
    await db.local_prefs.put({ key: CAPTION_RECENTS_PREF(relatorioId), value: next });
  });
}

export function useCaptionRecents(db: AppDatabase | null, relatorioId: string): CaptionRecents {
  return useLiveQuery(() => (db === null ? Promise.resolve(NO_RECENTS) : readCaptionRecents(db, relatorioId)), [db, relatorioId], NO_RECENTS) ?? NO_RECENTS;
}

/** The registry's `atividade` words (the composer's typed-word agreement, AD-19). */
export async function atividadeWordRows(db: AppDatabase): Promise<RegistryRow[]> {
  const records = await db.entities.where('entity').equals('registry').toArray();
  return records.map((record) => record.row as RegistryRow).filter((row) => row.kind === 'atividade' || row.kind === 'local');
}

const NO_WORD_ROWS: RegistryRow[] = [];

/** The registry's `atividade` and `local` words. */
export function useCaptionWordRows(db: AppDatabase | null): RegistryRow[] {
  return useLiveQuery(() => (db === null ? Promise.resolve(NO_WORD_ROWS) : atividadeWordRows(db)), [db], NO_WORD_ROWS) ?? NO_WORD_ROWS;
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

/** Raises the per-device photo counter to at least `seq` (a shot numbered outside `commitPhotoBatch`). */
export async function writePhotoSeqAtLeast(db: AppDatabase, seq: number): Promise<void> {
  await db.transaction('rw', db.local_prefs, async () => {
    if ((await readPhotoSeq(db)) < seq) await db.local_prefs.put({ key: PHOTO_SEQ_PREF, value: seq });
  });
}
