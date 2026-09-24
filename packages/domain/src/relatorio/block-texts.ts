import type { EquipmentRow } from '../schemas/entities.ts';
import { normalizeTag } from './tag.ts';

/*
 * Story 4.5: the sentences the tree and the block palette say about an equipment block —
 * a move, a creation, a TAG refused or duplicated, the remove Confirm's title — and the
 * TAG verdict a field reads on blur. Composed once here (AD-2); the surface only shows them.
 */

/** Every block move's announcement and toast: "SEC-C09 movido para a posição 3 de 5" (EXPERIENCE.md › Block card). */
export function blockMovedText(tag: string, position: number, total: number): string {
  return `${tag} movido para a posição ${position} de ${total}`;
}

/** The toast of a block created from the palette or by "Duplicar": "SEC-C09 criada na Coluna 9" (`40-relatorio-overview.html`). */
export function blockCreatedText(tag: string, locationName: string): string {
  return `${tag} criada na ${locationName}`;
}

/**
 * The inline refusal of a TAG a live equipment row of the obra already carries
 * (EXPERIENCE.md › Equipment identity): "TAG já existe nesta obra — SEC-C05 em 1° Subsolo ›
 * Coluna 5", or without the place when the holder sits in no block of this relatório.
 */
export function tagTakenText(tag: string, path: string | null): string {
  return path === null || path === '' ? `TAG já existe nesta obra — ${tag}` : `TAG já existe nesta obra — ${tag} em ${path}`;
}

/** The line of a row whose TAG another live equipment row shares (an `integrity` finding): "TAG SEC-C05 duplicada". */
export function duplicateTagText(tag: string): string {
  return `TAG ${tag} duplicada`;
}

/** The toast of a TAG renamed from the tree: "TAG alterada para SEC-C05A". authored. */
export function tagRenamedText(tag: string): string {
  return `TAG alterada para ${tag}`;
}

/** What a TAG field says of its text: fine (null), empty, or taken by a live equipment row other than the row itself. */
export type TagVerdict = null | { reason: 'empty' } | { reason: 'taken'; holder: Pick<EquipmentRow, 'id' | 'tag'> };

/**
 * The verdict of a typed TAG against the project's equipment (removed rows never count,
 * comparison trimmed and case-insensitive); `selfId` is the row being renamed, never
 * "taken" by its own TAG.
 */
export function tagVerdict(tag: string, equipment: readonly Pick<EquipmentRow, 'id' | 'tag' | 'removed_at'>[], selfId?: string): TagVerdict {
  const wanted = normalizeTag(tag);
  if (wanted === '') return { reason: 'empty' };
  const holder = equipment.find((row) => row.removed_at === null && row.id !== selfId && normalizeTag(row.tag) === wanted);
  return holder === undefined ? null : { reason: 'taken', holder: { id: holder.id, tag: holder.tag } };
}

/** The announcement of the cabine Overflow's "Agrupar por tipo" toggle. authored: "Agrupar por tipo ativado em 1° Subsolo". */
export function agruparToggledText(name: string, on: boolean): string {
  return `Agrupar por tipo ${on ? 'ativado' : 'desativado'} em ${name}`;
}

/** The remove Confirm's title (Story 4.5 AC): "Remover ficha SEC-C05?". */
export function removeBlockTitle(tag: string): string {
  return `Remover ficha ${tag}?`;
}
