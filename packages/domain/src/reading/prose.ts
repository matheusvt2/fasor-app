import type { ProseOutput } from '../contract/prose.ts';
import type { NewId } from '../ids.ts';
import { isCellFilled } from '../relatorio/sheet-state.ts';
import { suggestionRowSchema, type BlockRow, type PhotoFileRow, type SuggestionRow } from '../schemas/entities.ts';
import type { NcObsReadingTarget } from './target.ts';

/*
 * Stories 9.3 and 9.5 (FR-39, FR-75; Conflicts 7, 8 and 10 of the Epic 9 context): the pure
 * core of the two prose readings. A vision caption targets `file/{id}/caption`; an NC draft
 * targets `sheet/{block}/checklist/{item}/observation` of the photo's own row. Prose is never
 * guessed: an answer is one `suggested` fill (never `verify`) on the whole image (bbox
 * `[0, 0, 1, 1]`, no OCR token), and no text is no row. Which photo is read as `caption`,
 * which NC row's photo as `nc_obs`, and when a reading is skipped at run time are decided
 * here, once, for the device and the job.
 */

/** The whole image: prose cites no region. */
export const FULL_IMAGE_BBOX: [number, number, number, number] = [0, 0, 1, 1];

/** A prose answer as the one sentence it suggests: trimmed, inner whitespace collapsed; null when blank or absent. */
export function proseText(output: ProseOutput | undefined): string | null {
  if (output === null || output === undefined) return null;
  const text = output.text.trim().replace(/\s+/g, ' ');
  return text === '' ? null : text;
}

export interface BuildProseSuggestionInput {
  relatorioId: string;
  photoId: string;
  runId: string;
  /** `file/{id}/caption` or `sheet/{block}/checklist/{item}/observation`. */
  targetPath: string;
  output: ProseOutput | undefined;
  promptVersion: string;
  newId: NewId;
}

export interface BuiltProseSuggestion {
  rows: SuggestionRow[];
  dropped: { key: string; reason: 'no_text' }[];
}

/** The one pending `suggested` fill of a prose answer, or nothing (dropped `no_text`) when it says nothing. */
export function buildProseSuggestion(input: BuildProseSuggestionInput): BuiltProseSuggestion {
  const text = proseText(input.output);
  if (text === null) return { rows: [], dropped: [{ key: input.targetPath, reason: 'no_text' }] };
  const row = suggestionRowSchema.parse({
    id: input.newId(),
    relatorio_id: input.relatorioId,
    target_path: input.targetPath,
    value: text,
    trust: 'suggested',
    mode: 'fill',
    source: { photo_id: input.photoId, bbox: [...FULL_IMAGE_BBOX], ocr_token_ids: [], reading_run_id: input.runId },
    status: 'pending',
    prompt_version: input.promptVersion,
    hint: null,
  });
  return { rows: [row], dropped: [] };
}

/** What a photo create reads to choose its caption reading. */
export type CaptionCandidate = Pick<PhotoFileRow, 'block_id' | 'caption'> & { people_in_photo?: boolean | null };

function blank(text: string | null | undefined): boolean {
  return text === null || text === undefined || text.trim() === '';
}

/**
 * Story 9.3: the reading a new photo is created with when it has no context: no sheet, no
 * caption and no "Pessoas na foto" mark; null otherwise (the photo prints with its context).
 */
export function captionReadingOf(photo: CaptionCandidate): { kind: 'caption'; target: null } | null {
  return captionSkipReason(photo) === null ? { kind: 'caption', target: null } : null;
}

export type CaptionSkipReason = 'people_in_photo' | 'captioned' | 'has_block';

/**
 * Why a caption reading is not sent at run time (Conflict 7: the mark, a typed caption or a
 * chosen equipment may land after the create); null when it should run.
 */
export function captionSkipReason(photo: CaptionCandidate): CaptionSkipReason | null {
  if (photo.people_in_photo === true) return 'people_in_photo';
  if (!blank(photo.caption)) return 'captioned';
  if (photo.block_id !== null) return 'has_block';
  return null;
}

/** Story 9.5: the reading of a photo taken from an NC checklist row of `block`. */
export function ncObsReadingOf(block: Pick<BlockRow, 'id' | 'block_type'>, itemKey: string): { kind: 'nc_obs'; target: NcObsReadingTarget } {
  return { kind: 'nc_obs', target: { block_id: block.id, block_type: block.block_type, item_key: itemKey } };
}

export type NcObsSkipReason = 'not_nc' | 'observation_filled';

/** True when the checklist row of `itemKey` holds a non-blank observation. */
export function checklistObservationFilled(block: Pick<BlockRow, 'sheet'>, itemKey: string): boolean {
  return isCellFilled(block.sheet.checklist[itemKey]?.observation);
}

/** True when the checklist row of `itemKey` is stored `NC` (a default is never NC). */
export function checklistRowIsNc(block: Pick<BlockRow, 'sheet'>, itemKey: string): boolean {
  const cell = block.sheet.checklist[itemKey]?.result;
  return isCellFilled(cell) && cell!.value === 'NC';
}

/**
 * Why an NC draft is not sent at run time (Conflict 10: the row turned C/NA or was cleared,
 * or its observation was typed before the job ran); null when it should run.
 */
export function ncObsSkipReason(block: Pick<BlockRow, 'sheet'>, itemKey: string): NcObsSkipReason | null {
  if (!checklistRowIsNc(block, itemKey)) return 'not_nc';
  if (checklistObservationFilled(block, itemKey)) return 'observation_filled';
  return null;
}
