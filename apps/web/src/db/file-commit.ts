import { type OpDraft, type UploadFileKind } from '@app/domain';
import type { PickedFile } from '../components/upload-tile.tsx';
import { commitFileBatch, commitPhotoBatch, type CommitDeps } from './commit.ts';
import { readLocalBlob, localFileRow } from './file-store.ts';
import { useLiveQuery } from './live.ts';
import type { AppDatabase } from './schema.ts';
import type { AttachedFile } from '../components/upload-tile.tsx';

/*
 * AD-7, AR-6: the one call a surface makes when a file is picked. The `file/{id}` create
 * op, the owner's `_file_id` op(s) and the Blob go in as one batch; nothing else in
 * `apps/web` builds a file create op.
 */

export interface FilePickInput {
  companyId: string;
  actorId: string;
  /** Minted by the caller, so the owner op can name it in the same batch. */
  fileId: string;
  kind: UploadFileKind;
  picked: PickedFile;
  /**
   * What points at the file: `registry/instrument/{id}/certificate_file_id`, or the
   * Empresa create plus its `logo_file_id` when the row does not exist yet.
   */
  ownerOps: readonly OpDraft[];
}

export async function commitFilePick(db: AppDatabase, input: FilePickInput, deps: CommitDeps): Promise<{ batch_id: string }> {
  const base: Omit<OpDraft, 'kind' | 'path' | 'value'> = {
    scope: 'company',
    company_id: input.companyId,
    project_id: null,
    relatorio_id: null,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: input.actorId,
  };
  const create: OpDraft = {
    ...base,
    kind: 'create',
    path: `file/${input.fileId}`,
    value: {
      id: input.fileId,
      company_id: input.companyId,
      relatorio_id: null,
      kind: input.kind,
      sha256: input.picked.sha256,
      mime: input.picked.file.type,
      size: input.picked.file.size,
      uploaded_at: null,
      variants: null,
      removed_at: null,
    } as never,
  };
  const { batch_id } = await commitFileBatch(
    db,
    { ops: [create, ...input.ownerOps], blob: input.picked.file, fileId: input.fileId, fileName: input.picked.file.name },
    deps,
  );
  return { batch_id };
}

export interface PhotoCaptureInput {
  companyId: string;
  relatorioId: string;
  actorId: string;
  /** Minted by the caller (the camera counts the shot before the commit lands). */
  fileId: string;
  blockId: string | null;
  itemKey: string | null;
  /** The kernel's `contextCaption`, stored as a plain editable value (null: no context). */
  caption: string | null;
  capturedAt: string;
  tzOffset: number;
  coords: { lat: number; lng: number; accuracy_m: number | null; source: 'geolocation' | 'exif' } | null;
  original: Blob;
  thumb: Blob;
  sha256: string;
}

/**
 * Story 6.1 (AD-7, AR-6, AR-16): one shot. The `file/{id}` create of kind `photo` in
 * relatório scope, with the full photo row, goes in one transaction with the original, the
 * device thumb and the bumped `photo_seq` (`commitPhotoBatch`). No owner op: a photo points
 * at its sheet through its own `block_id` / `item_key`.
 */
export async function commitPhotoCapture(
  db: AppDatabase,
  input: PhotoCaptureInput,
  deps: CommitDeps,
): Promise<{ batch_id: string; localSeq: number }> {
  // `local_seq` is stamped inside the transaction from the device's `photo_seq`.
  const create = photoCreateDraft(input, 0);
  const { batch_id, localSeq } = await commitPhotoBatch(db, { create, fileId: input.fileId, original: input.original, thumb: input.thumb }, deps);
  return { batch_id, localSeq };
}

/** The photo's `file/{id}` create draft: relatório scope, the full `photoFileRowSchema` row. */
export function photoCreateDraft(input: Omit<PhotoCaptureInput, 'thumb'>, localSeq: number): OpDraft {
  return {
    scope: 'relatorio',
    company_id: input.companyId,
    project_id: null,
    relatorio_id: input.relatorioId,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: input.actorId,
    kind: 'create',
    path: `file/${input.fileId}`,
    value: {
      id: input.fileId,
      company_id: input.companyId,
      relatorio_id: input.relatorioId,
      kind: 'photo',
      sha256: input.sha256,
      mime: 'image/jpeg',
      size: input.original.size,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      captured_at: input.capturedAt,
      tz_offset: input.tzOffset,
      coords: input.coords,
      local_seq: localSeq,
      block_id: input.blockId,
      item_key: input.itemKey,
      caption: input.caption,
      reading_kind: null,
      reading_target: null,
      reading_status: 'none',
    } as never,
  };
}

/**
 * The tile's view of an attached file: the kernel row (size, mime, `uploaded_at`) plus
 * the name only the device that picked it holds. Null while nothing is attached, or
 * while the row has not been pulled yet.
 */
export function useAttachedFile(db: AppDatabase | null, fileId: string | null): AttachedFile | null {
  return (
    useLiveQuery(
      async () => {
        if (db === null || fileId === null) return null;
        const row = await localFileRow(db, fileId);
        if (row === null) return null;
        const local = await readLocalBlob(db, fileId);
        return {
          name: local?.name ?? null,
          mime: row.mime,
          size: row.size,
          uploaded_at: row.uploaded_at,
        } satisfies AttachedFile;
      },
      [db, fileId],
      null,
    ) ?? null
  );
}
