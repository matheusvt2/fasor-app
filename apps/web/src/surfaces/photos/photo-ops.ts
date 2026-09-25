import { fileFieldPath, relatorioOpEnvelope, toIso, type Author, type JsonValue, type OpDraft } from '@app/domain';
import { now } from '../../clock.ts';
import { commitBatch } from '../../db/commit.ts';
import type { AppDatabase } from '../../db/schema.ts';
import { newId } from '../../ids.ts';

/*
 * Stories 6.3-6.5: the edits a photo takes after it is born, each a `file/{id}/{field}` put
 * in relatório scope (`FILE_FIELDS`): its caption, its tombstone (AD-20: removing sets
 * `removed_at`, "Desfazer" clears it) and, for an import batch, its sheet. No new op family.
 */

function put(author: Author, relatorioId: string, fileId: string, field: 'caption' | 'block_id' | 'item_key' | 'removed_at', value: JsonValue): OpDraft {
  return { ...relatorioOpEnvelope(author, relatorioId), kind: 'put', path: fileFieldPath(fileId, field), value };
}

const deps = { newId, now };

/** The caption as saved: a blank text is no caption (null). */
export function captionValue(text: string | null): string | null {
  return text === null || text.trim() === '' ? null : text.trim();
}

/** "Salvar legenda": one `file/{id}/caption` op. */
export async function setPhotoCaption(db: AppDatabase, author: Author, relatorioId: string, fileId: string, text: string | null): Promise<void> {
  await commitBatch(db, [put(author, relatorioId, fileId, 'caption', captionValue(text))], deps);
}

/** "Remover": the photo's tombstone. */
export async function removePhoto(db: AppDatabase, author: Author, relatorioId: string, fileId: string): Promise<void> {
  await commitBatch(db, [put(author, relatorioId, fileId, 'removed_at', toIso(now()))], deps);
}

/** The toast's "Desfazer": the tombstone cleared, the photo back with its number. */
export async function restorePhoto(db: AppDatabase, author: Author, relatorioId: string, fileId: string): Promise<void> {
  await commitBatch(db, [put(author, relatorioId, fileId, 'removed_at', null)], deps);
}

/** A batch placed on a sheet (or "Geral") after it was saved: sheet, no item, and the batch caption. */
export async function setBatchPlacement(
  db: AppDatabase,
  author: Author,
  relatorioId: string,
  fileIds: readonly string[],
  placement: { blockId: string | null; caption: string | null },
): Promise<void> {
  const ops = fileIds.flatMap((fileId) => [
    put(author, relatorioId, fileId, 'block_id', placement.blockId),
    put(author, relatorioId, fileId, 'item_key', null),
    put(author, relatorioId, fileId, 'caption', captionValue(placement.caption)),
  ]);
  if (ops.length > 0) await commitBatch(db, ops, deps);
}
