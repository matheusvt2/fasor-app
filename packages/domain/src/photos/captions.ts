import { safeParsePath } from '../ops/path.ts';
import type { OpDraft } from '../ops/op.ts';
import { captionSkipReason, ncObsSkipReason, type CaptionCandidate } from '../reading/prose.ts';
import type { Author } from '../relatorio/ops.ts';
import { confirmSuggestionOps, discardSuggestionOp } from '../relatorio/suggestions.ts';
import type { BlockRow, SuggestionRow } from '../schemas/entities.ts';
import { plural } from '../text/plural.ts';

/*
 * Stories 9.3 and 9.5 (FR-39, FR-75): which prose suggestion the device shows, where, and
 * which ones nothing will ever show again. A vision caption is a pending suggestion on
 * `file/{id}/caption`; it shows on a live photo with no sheet, no caption and no "Pessoas na
 * foto" mark (the job's own run-time rule, `captionSkipReason`). An NC draft is a pending
 * suggestion on `sheet/{block}/checklist/{item}/observation`; it shows while that row is NC
 * with a blank observation (`ncObsSkipReason`). Everything else is stale: never shown or
 * counted, and the post-pull sweep discards it.
 */

/** What the caption rules read of a photo. */
export type CaptionPhotoLike = CaptionCandidate & { id: string; removed_at?: string | null };

/** The photo id a pending caption suggestion targets, or null for any other target. */
export function captionSuggestionPhotoId(s: Pick<SuggestionRow, 'target_path'>): string | null {
  const path = safeParsePath(s.target_path);
  if (path === null || path.family !== 'file/field' || path.field !== 'caption') return null;
  return path.id;
}

/** The block and item an NC draft targets (`sheet/{block}/checklist/{item}/observation`), or null. */
export function ncDraftTarget(s: Pick<SuggestionRow, 'target_path'>): { blockId: string; itemKey: string } | null {
  const path = safeParsePath(s.target_path);
  if (path === null || path.family !== 'sheet/checklist' || path.field !== 'observation') return null;
  return { blockId: path.block_id, itemKey: path.item_key };
}

function captionable(photo: CaptionPhotoLike | undefined): boolean {
  return photo !== undefined && (photo.removed_at ?? null) === null && captionSkipReason(photo) === null;
}

/**
 * The caption suggestion each photo shows: the newest pending one on `file/{id}/caption` of a
 * live photo with no sheet, no caption and no mark.
 */
export function captionSuggestions(photos: readonly CaptionPhotoLike[], pending: readonly SuggestionRow[]): Map<string, SuggestionRow> {
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const out = new Map<string, SuggestionRow>();
  for (const row of pending) {
    if (row.status !== 'pending') continue;
    const photoId = captionSuggestionPhotoId(row);
    if (photoId === null || !captionable(byId.get(photoId))) continue;
    const held = out.get(photoId);
    if (held === undefined || row.id > held.id) out.set(photoId, row);
  }
  return out;
}

/** "Confirmar todas": the confirm pair of every shown caption suggestion, one batch. */
export function captionConfirmAllOps(author: Author, rows: readonly SuggestionRow[]): OpDraft[] {
  return rows.flatMap((row) => confirmSuggestionOps(author, row));
}

/** The discard of every pending caption suggestion of `photoId` (a caption typed, a mark set). */
export function captionDiscardOps(author: Author, photoId: string, pending: readonly SuggestionRow[]): OpDraft[] {
  return pending.filter((row) => row.status === 'pending' && captionSuggestionPhotoId(row) === photoId).map((row) => discardSuggestionOp(author, row));
}

/** The NC draft an NC checklist row shows above its Observation (newest wins); null when the row is not NC or its observation is filled. */
export function ncDraftFor(block: Pick<BlockRow, 'id' | 'sheet'>, itemKey: string, pending: readonly SuggestionRow[]): SuggestionRow | null {
  if (ncObsSkipReason(block, itemKey) !== null) return null;
  let best: SuggestionRow | null = null;
  for (const row of pending) {
    if (row.status !== 'pending') continue;
    const target = ncDraftTarget(row);
    if (target === null || target.blockId !== block.id || target.itemKey !== itemKey) continue;
    if (best === null || row.id > best.id) best = row;
  }
  return best;
}

export interface StaleProseInput {
  photos: readonly CaptionPhotoLike[];
  blocks: readonly Pick<BlockRow, 'id' | 'sheet' | 'removed_at'>[];
  pending: readonly SuggestionRow[];
}

/**
 * The pending prose suggestions nothing will show: a caption whose photo was removed or got a
 * caption, a sheet or the mark; an NC draft whose block was removed, whose row is no longer
 * NC, or whose observation was typed. The complement of `captionSuggestions` and `ncDraftFor`.
 */
export function staleProseSuggestions(input: StaleProseInput): SuggestionRow[] {
  const photos = new Map(input.photos.map((photo) => [photo.id, photo]));
  const blocks = new Map(input.blocks.map((block) => [block.id, block]));
  const out: SuggestionRow[] = [];
  for (const row of input.pending) {
    if (row.status !== 'pending') continue;
    const photoId = captionSuggestionPhotoId(row);
    if (photoId !== null) {
      if (!captionable(photos.get(photoId))) out.push(row);
      continue;
    }
    const target = ncDraftTarget(row);
    if (target === null) continue;
    const block = blocks.get(target.blockId);
    if (block === undefined || block.removed_at !== null || ncObsSkipReason(block, target.itemKey) !== null) out.push(row);
  }
  return out;
}

// --- the texts ---------------------------------------------------------------------------------

/** The gallery banner, the counter and section 7's row: "1 legenda sugerida", "12 legendas sugeridas". */
export function legendasSugeridasText(n: number): string {
  return plural(n, 'legenda sugerida', 'legendas sugeridas');
}

/** The toast of "Confirmar todas": "12 legendas confirmadas". */
export function legendasConfirmadasText(n: number): string {
  return plural(n, 'legenda confirmada', 'legendas confirmadas');
}

/** The toast of one tile's Confirmar (`70-fotos.html`): "Legenda da foto 1 confirmada". */
export function legendaConfirmadaText(n: number | null): string {
  return n === null ? 'Legenda confirmada' : `Legenda da foto ${n} confirmada`;
}

/** The tile Confirmar's accessible name: "Sugerido, Vista geral da cabine primária, confirmar". */
export function captionConfirmAnnouncement(text: string): string {
  return `Sugerido, ${text}, confirmar`;
}

/** The composer's "Usar" accessible name: "Usar a legenda sugerida: Vista geral da cabine primária". */
export function captionUsarAnnouncement(text: string): string {
  // authored: no mock names the button.
  return `Usar a legenda sugerida: ${text}`;
}

/** The NC draft's "Usar" accessible name: "Usar o rascunho da observação do item 8". */
export function ncDraftUsarAnnouncement(itemNumber: number): string {
  // authored: no mock names the button.
  return `Usar o rascunho da observação do item ${itemNumber}`;
}
