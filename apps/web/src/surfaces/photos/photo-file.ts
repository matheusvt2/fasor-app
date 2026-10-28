import { photoFileName, photoSaveSource, type FileVariantName } from '@app/domain';
import { readLocalBlob } from '../../db/file-store.ts';
import type { AppDatabase } from '../../db/schema.ts';
import { shareFile, type ShareOutcome } from '../export/revision-file.ts';

/*
 * Story 17.7: "Salvar no aparelho" on the photo viewer. A photo leaves the relatório's store
 * only on this request: the JPEG (this device's original, else the server's original through
 * the file route) is handed to the system share sheet where the browser shares files, else
 * downloaded, by the Export dialog's own `shareFile`. Nothing in the relatório changes (no op,
 * no outbox row).
 */

/** The fields of a photo row the save reads. */
export interface PhotoSaveRow {
  id: string;
  captured_at: string;
  uploaded_at: string | null;
}

/** The server's file route (`useSyncActions().fetchFile`); rejects offline or on an error answer. */
export type FetchPhotoFile = (id: string, variant: FileVariantName) => Promise<Blob>;

/**
 * The photo's JPEG as a named, typed `File` (`photoFileName`, `image/jpeg`): this device's
 * original, else the server's once the photo was uploaded; null when neither exists yet.
 * Rejects when the server's original cannot be fetched.
 */
export async function photoSaveFile(db: AppDatabase, photo: PhotoSaveRow, fetchFile: FetchPhotoFile): Promise<File | null> {
  const local = await readLocalBlob(db, photo.id);
  const original = local !== null && local.variant === 'original' ? local.blob : null;
  const source = photoSaveSource({ hasLocalOriginal: original !== null, uploaded_at: photo.uploaded_at });
  if (source === 'none') return null;
  const blob = original ?? (await fetchFile(photo.id, 'original'));
  return new File([blob], photoFileName(photo), { type: 'image/jpeg' });
}

/**
 * The file to the share sheet, else saved (`shareFile`'s rule). Called inside the press with
 * the file already in hand, so `navigator.share` keeps the press's activation; a dismissed
 * sheet is `cancelled` and silent.
 */
export function savePhotoToDevice(file: File, title: string): Promise<ShareOutcome> {
  return shareFile(file, title);
}
