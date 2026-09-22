import { fileRowSchema, type FileRow } from '@app/domain';
import type { AppDatabase, FileBlobRow } from './schema.ts';

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

/** Marks a file's bytes as sent: AD-7's first eviction candidates. */
export async function markBlobAcked(db: AppDatabase, id: string): Promise<void> {
  await db.files.update(id, { acked: true });
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
}

/**
 * Files this device must still upload: a local blob whose kernel row says `uploaded_at`
 * is null and whose `file/{id}` create op the server has already acked. The ack is the
 * precondition of the route (`409 file_row_missing` otherwise), so the uploader never
 * spends a cycle on a file the server cannot accept yet.
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
    const createOp = await db.outbox.where('path').equals(`file/${blob.id}`).first();
    if (createOp === undefined || createOp.status !== 'acked') continue;
    out.push({ id: blob.id, blob: blob.blob, sha256: row.sha256, mime: row.mime });
  }
  return out;
}

/** How many files are still waiting to be uploaded, for `sync_state.files_pending`. */
export async function pendingUploadCount(db: AppDatabase): Promise<number> {
  return (await pendingUploads(db)).length;
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
  // original. Epic 6 widens the key when a photo needs several at once.
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
