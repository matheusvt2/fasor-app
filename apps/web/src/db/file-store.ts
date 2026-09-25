import {
  evictionPlan,
  filePath,
  fileRowSchema,
  orderUploads,
  relatorioStatusSchema,
  storagePressureBytes,
  type EvictionBlob,
  type FileRow,
  type RelatorioStatus,
  type StorageReading,
} from '@app/domain';
import type { AppDatabase, FileBlobRow, ThumbRow, UploadError } from './schema.ts';

/*
 * AD-7 on the device: the local Blob store. The bytes of a file this device picked are
 * written by `commitFileBatch` in the same transaction as its ops; everything else here
 * reads them — for the uploader, for a tile, and for the on-demand fill that fetches a
 * file this device never held. The sync engine never prefetches an original (AC 2.2-3):
 * the only fetch is `ensureLocalBlob`, and only a surface calls it.
 */

/** One local blob, or null when this device does not hold the file's bytes. */
export async function readLocalBlob(db: AppDatabase, id: string): Promise<FileBlobRow | null> {
  return (await db.files.get(id)) ?? null;
}

/** Stores bytes this device did not pick (a variant or original fetched on demand). */
export async function putLocalBlob(
  db: AppDatabase,
  input: { id: string; blob: Blob; variant: FileBlobRow['variant']; createdAt: string; name?: string; acked?: boolean },
): Promise<void> {
  await db.files.put({
    id: input.id,
    variant: input.variant,
    blob: input.blob,
    acked: input.acked ?? true,
    created_at: input.createdAt,
    ...(input.name === undefined ? {} : { name: input.name }),
  });
}

/**
 * Marks a file's bytes as sent: AD-7's first eviction candidates, oldest `acked_at` first
 * (Story 6.2). A persisted upload error is cleared with it: the server took the bytes.
 */
export async function markBlobAcked(db: AppDatabase, id: string, ackedAt: string = new Date().toISOString()): Promise<void> {
  await db.files.where('id').equals(id).modify((row) => {
    row.acked = true;
    row.acked_at = ackedAt;
    delete row.upload_error;
  });
}

/** Story 6.2: records why an upload stopped, kept across reloads. */
export async function setUploadError(db: AppDatabase, id: string, error: UploadError): Promise<void> {
  await db.files.update(id, { upload_error: error });
}

/** Story 6.2: the tile's "Erro — Tentar novamente": the next cycle tries the file again. */
export async function clearUploadError(db: AppDatabase, id: string): Promise<void> {
  await db.files.where('id').equals(id).modify((row) => {
    delete row.upload_error;
  });
}

/** Story 6.1: a photo's thumb (the device's until the server's replaces it), or null. */
export async function readThumb(db: AppDatabase, id: string): Promise<ThumbRow | null> {
  return (await db.thumbs.get(id)) ?? null;
}

/** Story 6.2: the server's thumb replaces the device's on pull; thumbs are never evicted. */
export async function putServerThumb(db: AppDatabase, id: string, blob: Blob, createdAt: string): Promise<void> {
  await db.thumbs.put({ id, blob, source: 'server', created_at: createdAt });
}

/**
 * Story 6.2: the photos whose server thumb this device should fetch after a pull: the row
 * says the variants exist and the local thumb is missing or still the device's own.
 * Thumbs only: an original is never prefetched (AC 2.2-3).
 */
export async function thumbsToRefresh(db: AppDatabase): Promise<string[]> {
  const records = await db.entities.where('entity').equals('file').toArray();
  const wanted: string[] = [];
  for (const record of records) {
    const parsed = fileRowSchema.safeParse(record.row);
    if (!parsed.success || parsed.data.kind !== 'photo' || parsed.data.variants === null || parsed.data.removed_at !== null) continue;
    const thumb = await db.thumbs.get(parsed.data.id);
    if (thumb === undefined || thumb.source === 'device') wanted.push(parsed.data.id);
  }
  return wanted;
}

/** The kernel `file` row of an id on this device, or null when it does not parse or is absent. */
export async function localFileRow(db: AppDatabase, id: string): Promise<FileRow | null> {
  const record = await db.entities.get(['file', id]);
  if (record === undefined) return null;
  const parsed = fileRowSchema.safeParse(record.row);
  return parsed.success ? parsed.data : null;
}

export interface PendingUpload {
  id: string;
  blob: Blob;
  sha256: string;
  mime: string;
  kind: string;
  captured_at: string | null;
  reading_status: string | null;
  /** Story 6.2: the persisted failure, or null. A `dead` one is never retried on its own. */
  upload_error: UploadError | null;
}

/**
 * Files this device must still upload, in upload order (Story 6.2, `orderUploads`): a
 * local blob whose kernel row says `uploaded_at` is null and whose `file/{id}` create op
 * the server has already acked. The ack is the precondition of the route (`409
 * file_row_missing` otherwise), so the uploader never spends a cycle on a file the server
 * cannot accept yet. A file with a `dead` upload error is still listed (it is unacked
 * work); the uploader skips it.
 */
export async function pendingUploads(db: AppDatabase): Promise<PendingUpload[]> {
  // Scanned, not indexed: IndexedDB has no boolean key, so the `acked` index of
  // version 1 cannot answer this (`home-store.ts` scans for the same reason).
  const blobs = await db.files.filter((row) => !row.acked).toArray();
  if (blobs.length === 0) return [];
  const out: PendingUpload[] = [];
  for (const blob of blobs) {
    if (blob.variant !== 'original') continue;
    const row = await localFileRow(db, blob.id);
    if (row === null || row.uploaded_at !== null) continue;
    const createOp = await db.outbox.where('path').equals(filePath(blob.id)).first();
    if (createOp === undefined || createOp.status !== 'acked') continue;
    out.push({
      id: blob.id,
      blob: blob.blob,
      sha256: row.sha256,
      mime: row.mime,
      kind: row.kind,
      captured_at: row.kind === 'photo' ? row.captured_at : null,
      reading_status: row.kind === 'photo' ? row.reading_status : null,
      upload_error: blob.upload_error ?? null,
    });
  }
  return orderUploads(out);
}

/**
 * How many files a sync can still upload: the Export dialog drains these before it asks
 * to generate. A `dead` file is left out -- no cycle retries it, and a photo never blocks
 * "Gerar" (coordinator decision 2026-09-25).
 */
export async function pendingUploadCount(db: AppDatabase): Promise<number> {
  return (await pendingUploads(db)).filter((item) => item.upload_error?.state !== 'dead').length;
}

/** Story 6.1/6.2: one photo's upload view for its tile: the persisted error, if any. */
export async function localUploadError(db: AppDatabase, id: string): Promise<UploadError | null> {
  return (await db.files.get(id))?.upload_error ?? null;
}

/**
 * Story 6.2 (AR-6): deletes the local originals the kernel's `evictionPlan` names. Only
 * photo originals the server acknowledged are candidates; thumbs are never touched. The
 * relatórios' statuses come from this device's rows; `reading` sizes the pressure.
 * Returns the ids actually deleted.
 */
export async function runEviction(db: AppDatabase, reading: StorageReading | null): Promise<string[]> {
  const acked = await db.files.filter((row) => row.acked && row.variant === 'original').toArray();
  if (acked.length === 0) return [];
  const blobs: EvictionBlob[] = [];
  const relatorioStatus: Record<string, RelatorioStatus> = {};
  for (const blob of acked) {
    const row = await localFileRow(db, blob.id);
    if (row === null || row.kind !== 'photo' || row.uploaded_at === null) continue;
    const relatorioId = row.relatorio_id;
    if (relatorioId !== null && relatorioStatus[relatorioId] === undefined) {
      const record = await db.entities.get(['relatorio', relatorioId]);
      const status = relatorioStatusSchema.safeParse((record?.row as { status?: unknown } | undefined)?.status);
      if (status.success) relatorioStatus[relatorioId] = status.data;
    }
    // The row's `size` is the original's byte count (the server checks the PUT against it).
    blobs.push({ id: blob.id, acked: true, acked_at: blob.acked_at ?? null, size: row.size, relatorio_id: relatorioId });
  }
  const plan = evictionPlan({ blobs, relatorioStatus, pressure: storagePressureBytes(reading) });
  const deleted: string[] = [];
  if (plan.length > 0) {
    await db.transaction('rw', db.files, async () => {
      for (const id of plan) {
        // Re-checked inside the write: an original is deleted only while it is still acked.
        const current = await db.files.get(id);
        if (current?.acked === true && current.variant === 'original') {
          await db.files.delete(id);
          deleted.push(id);
        }
      }
    });
  }
  return deleted;
}

/**
 * The one rendering a surface asked for. Served from the store when the bytes kept there
 * are that same rendering, otherwise fetched. Null when the server has nothing to give
 * (the file was never uploaded, or the fetch failed) — the surface then draws its
 * placeholder and the next open tries again.
 */
export async function ensureLocalBlob(
  db: AppDatabase,
  id: string,
  variant: 'original' | 'thumb' | 'print',
  deps: { fetchFile: (id: string, variant: 'original' | 'thumb' | 'print') => Promise<Blob>; nowIso: string },
): Promise<Blob | null> {
  // `files` is keyed by id alone, so it holds one rendering of a file at a time. The
  // cached blob is only the answer when it is the rendering that was asked for: a
  // full-size original is not a thumb, and a thumb is not something to hand back as an
  // original. A photo keeps its thumb apart, in `thumbs` (Story 6.1, `readThumb`), so
  // it holds both at once without widening this key.
  const local = await readLocalBlob(db, id);
  const cachedAs = local === null ? null : localVariantName(local.variant);
  if (local !== null && cachedAs === variant) return local.blob;
  let blob: Blob;
  try {
    blob = await deps.fetchFile(id, variant);
  } catch {
    return null;
  }
  // Kept only when the id is free and the variant is one `FileBlobRow` can name exactly.
  // Caching otherwise would either evict the rendering already stored under this id
  // (often the original this device picked and has not uploaded yet) or file `print`
  // under `thumb`, where the next thumb request would be handed the wrong bytes.
  if (local === null && (variant === 'original' || variant === 'thumb')) {
    await putLocalBlob(db, { id, blob, variant, createdAt: deps.nowIso, acked: true });
  }
  return blob;
}

/** How a stored row's `variant` reads as a server variant name; `crop` is neither. */
function localVariantName(variant: FileBlobRow['variant']): 'original' | 'thumb' | null {
  return variant === 'original' || variant === 'thumb' ? variant : null;
}

/**
 * A picture of the file for a tile or the brand preview: any rendering this device
 * already holds will do (a file just picked here has only its original, and it has not
 * been uploaded yet, so the server has no thumb to give), and only a device that holds
 * nothing asks the server for the thumb.
 */
export async function previewBlob(
  db: AppDatabase,
  id: string,
  deps: { fetchFile: (id: string, variant: 'original' | 'thumb' | 'print') => Promise<Blob>; nowIso: string },
): Promise<Blob | null> {
  const local = await readLocalBlob(db, id);
  if (local !== null) return local.blob;
  return ensureLocalBlob(db, id, 'thumb', deps);
}
