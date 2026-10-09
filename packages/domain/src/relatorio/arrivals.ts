import { captionSuggestionPhotoId } from '../photos/captions.ts';
import type { SuggestionRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { cabineOf, cabineProgress } from './cabine.ts';
import { isCabineFirstSheet } from './sheet-progress.ts';
import { suggestionTarget } from './suggestion-rows.ts';

/*
 * Review fixes 2026-10-08 (DC-4, merging DB-5, DE-5, DG-3; H-7): the reading-arrival toast
 * announced every pending suggestion a pull brought in, the ones already drawn on the open
 * ficha and the caption rows of the gallery included, and stayed over the fields it announced.
 * These rules decide what an arrival announces given what is on screen, and when an
 * announcement has been served (nothing it named is pending anywhere off screen any more).
 * The route is read by the web; the rules are here, once.
 */

/** What the device shows when suggestions arrive, as the arrival rules read it. */
export type ArrivalScreen =
  /**
   * An equipment ficha: its own block's suggestions are drawn on it, and its cabine's
   * environment fields when the ficha draws them (`cabineId`; null when the cabine block is collapsed).
   */
  | { kind: 'ficha'; relatorioId: string; blockId: string; cabineId: string | null }
  /** The photo gallery of a relatório: its caption suggestions are drawn on it. */
  | { kind: 'gallery'; relatorioId: string }
  | { kind: 'other' };

/** A suggestion for a photo's caption (`file/{id}/caption`): a "legenda", never a "leitura". */
export function isCaptionSuggestion(row: Pick<SuggestionRow, 'target_path'>): boolean {
  return captionSuggestionPhotoId(row) !== null;
}

/** Whether `screen` draws this suggestion where the engineer already sees it. */
export function suggestionOnScreen(row: Pick<SuggestionRow, 'target_path' | 'relatorio_id'>, screen: ArrivalScreen): boolean {
  if (screen.kind === 'other' || row.relatorio_id !== screen.relatorioId) return false;
  if (isCaptionSuggestion(row)) return screen.kind === 'gallery';
  if (screen.kind !== 'ficha') return false;
  const target = suggestionTarget(row.target_path);
  if (target === null) return false;
  if (target.kind === 'block') return target.block_id === screen.blockId;
  return screen.cabineId !== null && target.location_id === screen.cabineId;
}

/**
 * The ficha `blockId` as the arrival rules read it. Its cabine's environment fields are drawn
 * only while the cabine block is open: on the cabine's first sheet, or while the cabine is
 * incomplete (`cabine-block.tsx`). The block's own "Editar" state is not stored, so a collapsed
 * block counts as off screen and its readings are announced.
 */
export function fichaArrivalScreen(
  snapshot: Pick<RelatorioSnapshot, 'relatorio' | 'locations' | 'blocks' | 'equipment'>,
  relatorioId: string,
  blockId: string,
): Extract<ArrivalScreen, { kind: 'ficha' }> {
  const block = snapshot.blocks.find((row) => row.id === blockId);
  const cabine = cabineOf(snapshot.locations, block?.location_id ?? null);
  const drawn = cabine !== null && (isCabineFirstSheet(snapshot, blockId) || !cabineProgress(snapshot, cabine.id).complete);
  return { kind: 'ficha', relatorioId, blockId, cabineId: drawn ? cabine.id : null };
}

/** The one arrival toast to show: "N leituras prontas para confirmar" or "N legendas sugeridas", and the rows it names. */
export interface ArrivalAnnouncement {
  kind: 'readings' | 'captions';
  rows: SuggestionRow[];
}

/**
 * The announcement the arrived rows not already on screen make. One toast at a time: readings
 * take it over captions in a mixed pull (the gallery's own line names the captions); null when
 * nothing is left to announce.
 */
export function arrivalToAnnounce(arrived: readonly SuggestionRow[], screen: ArrivalScreen): ArrivalAnnouncement | null {
  const readings: SuggestionRow[] = [];
  const captions: SuggestionRow[] = [];
  for (const row of arrived) {
    if (suggestionOnScreen(row, screen)) continue;
    (isCaptionSuggestion(row) ? captions : readings).push(row);
  }
  if (readings.length > 0) return { kind: 'readings', rows: readings };
  if (captions.length > 0) return { kind: 'captions', rows: captions };
  return null;
}

/**
 * An announcement is served once none of the rows it named is still pending, or every one
 * still pending is drawn on the screen now shown: its toast is then withdrawn.
 */
export function arrivalServed(announced: ReadonlySet<string>, pending: readonly SuggestionRow[], screen: ArrivalScreen): boolean {
  return pending.filter((row) => row.status === 'pending' && announced.has(row.id)).every((row) => suggestionOnScreen(row, screen));
}
