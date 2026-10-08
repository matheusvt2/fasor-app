import { captionSuggestionPhotoId } from '../photos/captions.ts';
import type { SuggestionRow } from '../schemas/entities.ts';
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
  /** An equipment ficha: its own block's suggestions and its cabine's environment fields are drawn on it. */
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

/** The arrivals to announce, split: the readings ("N leituras prontas para confirmar") and the captions ("N legendas sugeridas"). */
export interface ArrivalAnnouncement {
  readings: SuggestionRow[];
  captions: SuggestionRow[];
}

/** The arrived rows not already on screen, readings and captions apart. */
export function arrivalsToAnnounce(arrived: readonly SuggestionRow[], screen: ArrivalScreen): ArrivalAnnouncement {
  const readings: SuggestionRow[] = [];
  const captions: SuggestionRow[] = [];
  for (const row of arrived) {
    if (suggestionOnScreen(row, screen)) continue;
    (isCaptionSuggestion(row) ? captions : readings).push(row);
  }
  return { readings, captions };
}

/**
 * An announcement is served once none of the rows it named is still pending, or every one
 * still pending is drawn on the screen now shown: its toast is then withdrawn.
 */
export function arrivalServed(announced: ReadonlySet<string>, pending: readonly SuggestionRow[], screen: ArrivalScreen): boolean {
  return pending.filter((row) => row.status === 'pending' && announced.has(row.id)).every((row) => suggestionOnScreen(row, screen));
}
