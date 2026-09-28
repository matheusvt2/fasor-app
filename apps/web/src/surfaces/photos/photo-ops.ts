import {
  captionConfirmAllOps,
  captionDiscardOps,
  confirmSuggestionOps,
  fileFieldPath,
  relatorioOpEnvelope,
  toIso,
  type Author,
  type JsonValue,
  type OpDraft,
  type SuggestionRow,
} from '@app/domain';
import { now } from '../../clock.ts';
import { commitBatch } from '../../db/commit.ts';
import type { AppDatabase } from '../../db/schema.ts';
import { newId } from '../../ids.ts';

/*
 * Stories 6.3-6.5: the edits a photo takes after it is born, each a `file/{id}/{field}` put
 * in relatório scope (`FILE_FIELDS`): its caption and its tombstone (AD-20: removing sets
 * `removed_at`, "Desfazer" clears it). No new op family.
 *
 * Stories 9.3: the vision caption's writes. Confirmar (a tile, the composer's "Usar") and
 * "Confirmar todas" are the kernel's confirm pairs; a caption saved by hand and the "Pessoas
 * na foto" mark discard the photo's pending caption suggestion in the same batch
 * (`captionDiscardOps`), so the suggestion never outlives what the engineer wrote.
 */

function put(author: Author, relatorioId: string, fileId: string, field: 'caption' | 'removed_at' | 'block_id' | 'people_in_photo', value: JsonValue): OpDraft {
  return { ...relatorioOpEnvelope(author, relatorioId), kind: 'put', path: fileFieldPath(fileId, field), value };
}

const deps = { newId, now };

/** The caption as saved: a blank text is no caption (null). */
export function captionValue(text: string | null): string | null {
  return text === null || text.trim() === '' ? null : text.trim();
}

/** "Salvar legenda": one `file/{id}/caption` op, with the discard of the photo's pending caption suggestion (Story 9.3). */
export async function setPhotoCaption(
  db: AppDatabase,
  author: Author,
  relatorioId: string,
  fileId: string,
  text: string | null,
  pending: readonly SuggestionRow[] = [],
): Promise<void> {
  await commitBatch(db, [put(author, relatorioId, fileId, 'caption', captionValue(text)), ...captionDiscardOps(author, fileId, pending)], deps);
}

/** Story 9.3: a tile's Confirmar, the composer's "Usar": the suggestion's confirm pair, one batch. */
export async function confirmCaptionSuggestion(db: AppDatabase, author: Author, suggestion: SuggestionRow): Promise<void> {
  await commitBatch(db, confirmSuggestionOps(author, suggestion), deps);
}

/** Story 9.3: "Confirmar todas": every shown caption suggestion confirmed in one batch. */
export async function confirmAllCaptionSuggestions(db: AppDatabase, author: Author, suggestions: readonly SuggestionRow[]): Promise<void> {
  if (suggestions.length > 0) await commitBatch(db, captionConfirmAllOps(author, suggestions), deps);
}

/** Story 9.3: the "Pessoas na foto" mark; setting it discards the photo's pending caption suggestion in the same batch. */
export async function setPeopleInPhoto(
  db: AppDatabase,
  author: Author,
  relatorioId: string,
  fileId: string,
  marked: boolean,
  pending: readonly SuggestionRow[] = [],
): Promise<void> {
  await commitBatch(db, [put(author, relatorioId, fileId, 'people_in_photo', marked), ...(marked ? captionDiscardOps(author, fileId, pending) : [])], deps);
}

/**
 * E6-Q8: "Adicionar N fotos" of a gallery batch already saved as "Geral": the chosen sheet
 * and the caption, as `file/{id}/block_id` and `file/{id}/caption` puts on every photo, in
 * one batch. A part left at its saved value ("Geral", no caption) writes nothing. Story 9.3:
 * "Pessoas na foto" pressed puts `people_in_photo: true` on every photo of the batch.
 */
export async function assignPhotoBatch(
  db: AppDatabase,
  author: Author,
  relatorioId: string,
  fileIds: readonly string[],
  blockId: string | null,
  caption: string | null,
  peopleInPhoto = false,
): Promise<void> {
  const value = captionValue(caption);
  const drafts = fileIds.flatMap((id) => [
    ...(blockId === null ? [] : [put(author, relatorioId, id, 'block_id', blockId)]),
    ...(value === null ? [] : [put(author, relatorioId, id, 'caption', value)]),
    ...(peopleInPhoto ? [put(author, relatorioId, id, 'people_in_photo', true)] : []),
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
