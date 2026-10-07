/*
 * Story 8.1 (AD-12, EXPERIENCE.md › Suggestion field): every rule of a Suggestion on the
 * device, computed once. A suggestion is a `suggestion` row the reading job writes with
 * `status = pending`; it is never a cell, so nothing reads it as filled, counted or printed
 * until the engineer taps. The only writes are the batches built here:
 *
 * - Confirmar: `suggestion/{id}/status = confirmed` + the target put carrying
 *   `meta.source_suggestion_id` (the cell's provenance, `applyOp`'s `cellOf`);
 * - typing into the guess: the typed value put (no meta) + `status = discarded`;
 * - Confirmar todos: the confirm pairs of every `suggested` fill of the group, one batch;
 * - auto-confirm after a pull: the confirm batch with `meta.auto = true`.
 *
 * `pending` is the stored status, never inferred. The group of the nameplate is the only
 * target Epic 8 reads (`sheet/{block}/nameplate/{field}`).
 *
 * E9-A7: this file is a barrel. The code lives in six concern modules:
 *   - `suggestion-rows.ts`: reading the rows, comparing, the view on a field;
 *   - `suggestion-group.ts`: the nameplate group and the editable guess;
 *   - `suggestion-ops.ts`: the confirm and discard batches and the texts;
 *   - `plate-suggestions.ts`: the plate photo, its crop geometry, arrivals and counts;
 *   - `measurement-suggestions.ts`: Story 9.1's Measurement cells, mismatch, burst, queued;
 *   - `env-suggestions.ts`: Story 9.1's thermo-hygrometer on a cabine.
 * Only the public names are re-exported; the helpers the modules share stay internal.
 */

export {
  suggestionRowsOf,
  pendingSuggestions,
  suggestionBlockId,
  pendingByNameplateField,
  type SuggestionTarget,
  suggestionTarget,
  livePendingSuggestions,
  blocksWithPendingSuggestions,
  suggestionFieldDef,
  compareSuggestion,
  suggestionView,
} from './suggestion-rows.ts';
export {
  type NameplateSuggestion,
  nameplateSuggestions,
  type RegistryNames,
  hasCreateHint,
  unknownManufacturer,
  confirmAllCandidates,
  suggestionGroupCounts,
  showsConfirmedGlyph,
  fieldInputText,
  parseFieldInput,
} from './suggestion-group.ts';
export {
  confirmSuggestionOps,
  discardSuggestionOp,
  suggestionValueText,
  confirmarTodosText,
  confirmedAllToastText,
  confirmedFieldToastText,
  suggestionGroupNoteText,
  suggestionAnnouncement,
  replaceLineText,
  fichasComSugestoesText,
  criarText,
  criarAnnouncement,
} from './suggestion-ops.ts';
export {
  PLATE_CAPTION,
  type PlatePhotoLike,
  platePhotoOf,
  type PlateReadingView,
  plateReadingView,
  type NormalizedBox,
  PLATE_CROP_MARGIN,
  plateCropRegion,
  padCropToAspect,
  PLATE_FOCUS_MARGIN,
  plateCropView,
  regionWithin,
  singleSourcePhotoId,
  arrivedReadingsCount,
  leiturasProntasText,
  leiturasNaFilaText,
  sugestoesProntasBannerText,
} from './plate-suggestions.ts';
export {
  storedTestCell,
  type MeasurementSuggestion,
  measurementSuggestions,
  measurementConfirmAllCandidates,
  measurementTableVerifyCount,
  type MismatchPart,
  displayMismatchText,
  MISMATCH_LINE_SEP,
  type DisplayBurstStop,
  displayBurstStops,
  displayBurstStart,
  displayBurstStop,
  displayBurstHintText,
  type DisplayQueuedState,
  displayQueuedCells,
  displayQueuedEnv,
} from './measurement-suggestions.ts';
export {
  type EnvSuggestionField,
  type EnvSuggestion,
  envSuggestions,
} from './env-suggestions.ts';
