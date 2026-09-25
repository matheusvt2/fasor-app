import { fileFieldPath, relatorioOpEnvelope, toIso, type Author, type JsonValue, type OpDraft } from '@app/domain';
import { now } from '../../clock.ts';
import { commitBatch } from '../../db/commit.ts';
import type { AppDatabase } from '../../db/schema.ts';
import { newId } from '../../ids.ts';

/*
 * Stories 6.3-6.5: the edits a photo takes after it is born, each a `file/{id}/{field}` put
 * in relatório scope (`FILE_FIELDS`): its caption and its tombstone (AD-20: removing sets
 * `removed_at`, "Desfazer" clears it). No new op family.
 */

function put(author: Author, relatorioId: string, fileId: string, field: 'caption' | 'removed_at' | 'block_id', value: JsonValue): OpDraft {
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

/**
 * E6-Q8: "Adicionar N fotos" of a gallery batch already saved as "Geral": the chosen sheet
 * and the caption, as `file/{id}/block_id` and `file/{id}/caption` puts on every photo, in
 * one batch. A part left at its saved value ("Geral", no caption) writes nothing.
 */
export async function assignPhotoBatch(db: AppDatabase, author: Author, relatorioId: string, fileIds: readonly string[], blockId: string | null, caption: string | null): Promise<void> {
  const value = captionValue(caption);
  const drafts = fileIds.flatMap((id) => [
    ...(blockId === null ? [] : [put(author, relatorioId, id, 'block_id', blockId)]),
    ...(value === null ? [] : [put(author, relatorioId, id, 'caption', value)]),
  ]);
  if (drafts.length > 0) await commitBatch(db, drafts, deps);
}

/** "Remover": the photo's tombstone. */
export async function removePhoto(db: AppDatabase, author: Author, relatorioId: string, fileId: string): Promise<void> {
  await commitBatch(db, [put(author, relatorioId, fileId, 'removed_at', toIso(now()))], deps);
}

/** The toast's "Desfazer": the tombstone cleared, the photo back with its number. */
export async function restorePhoto(db: AppDatabase, author: Author, relatorioId: string, fileId: string): Promise<void> {
  await commitBatch(db, [put(author, relatorioId, fileId, 'removed_at', null)], deps);
}
