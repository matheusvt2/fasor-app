import type { OcrReadResult, OcrToken, StructuringOutput, StructuringValue } from '../contract/ocr.ts';
import type { NewId } from '../ids.ts';
import { sheetNameplatePath } from '../ops/path.ts';
import { isCellFilled } from '../relatorio/sheet-state.ts';
import { isVectorGroupField, parseVectorGroup } from '../relatorio/vector-group.ts';
import { suggestionRowSchema, type BlockRow, type SuggestionRow } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import type { FieldDef } from '../seed/schema.ts';
import { assessReadingValue, type ReadingRegistry } from './assess.ts';
import { normalizeBox, unionBox } from './boxes.ts';
import { inTokenOrder } from './digits.ts';
import { FULL_IMAGE_BBOX } from './prose.ts';
import { normalizeReadingValue, type NormalizedReadingValue } from './value.ts';

/*
 * Stories 8.4 and 8.5: the pure core of one reading run. Every structured value becomes a
 * pending `suggestion` row on its nameplate cell, with the trust and hint of
 * `assessReadingValue`, the union of its cited tokens' boxes normalized over the image sent,
 * and `mode = replace` when the cell was already filled at emission (no op family lets the
 * device write `mode`, so the server records it). A value that names a key the block's
 * nameplate does not have, cites a token the OCR did not return, or has an invalid shape is
 * dropped with its reason for the job to log. A field the model left out gets nothing.
 *
 * Story 21.2: the transformador de força's LIGAÇÃO SECUNDÁRIA holds a vector group. A value the
 * group parser reads is stored as its code ("DYN1" as "Dyn1"; on the v11 select the option
 * mapping already does so, and a value naming no group is dropped `invalid_shape` like any select;
 * on the v9/v10 text an unparsed value stays as read). A group the cited tokens print (any run of
 * them, in token order, parses to it) follows the digit rule. A group whose cited runs print another
 * group ("Dyn11" for "Dyn1") keeps its citations and box and is `verify`. A group no cited run prints
 * as any group was read from the drawn diagram: `verify`, citing no token (`ocr_token_ids: []`) over
 * the whole image, the device's signal for "Lido do diagrama — confira" (`plateSuggestionNoteText`).
 */

export type ReadingDropReason = 'unknown_key' | 'unknown_token' | 'invalid_shape';

export interface ReadingDrop {
  key: string;
  reason: ReadingDropReason;
}

export interface BuildReadingSuggestionsInput {
  relatorioId: string;
  photoId: string;
  runId: string;
  block: Pick<BlockRow, 'id' | 'seed_version' | 'block_type' | 'sheet'>;
  ocr: OcrReadResult;
  /** The width and height of the image both providers received. */
  image: { width: number; height: number };
  output: StructuringOutput;
  promptVersion: string;
  registry: ReadingRegistry;
  newId: NewId;
}

export interface BuiltReadingSuggestions {
  /** In the nameplate's definition order. */
  rows: SuggestionRow[];
  dropped: ReadingDrop[];
}

function nameplateOf(block: Pick<BlockRow, 'seed_version' | 'block_type'>): readonly FieldDef[] {
  try {
    return getDefinition(block.seed_version, 'cabine_primaria', block.block_type).nameplate;
  } catch {
    return [];
  }
}

export function buildReadingSuggestions(input: BuildReadingSuggestionsInput): BuiltReadingSuggestions {
  const fields = nameplateOf(input.block);
  const fieldKeys = new Set(fields.map((field) => field.key));
  const tokens = new Map<string, OcrToken>(input.ocr.tokens.map((token) => [token.id, token]));
  const dropped: ReadingDrop[] = [];
  const byKey = new Map<string, StructuringValue>();
  for (const value of input.output.values) {
    if (!fieldKeys.has(value.key)) dropped.push({ key: value.key, reason: 'unknown_key' });
    else byKey.set(value.key, value);
  }

  const rows: SuggestionRow[] = [];
  for (const field of fields) {
    const structured = byKey.get(field.key);
    if (structured === undefined) continue;
    const cited: OcrToken[] = [];
    let unknownToken = false;
    for (const id of new Set(structured.ocr_token_ids)) {
      const token = tokens.get(id);
      if (token === undefined) unknownToken = true;
      else cited.push(token);
    }
    if (unknownToken || cited.length === 0) {
      dropped.push({ key: field.key, reason: 'unknown_token' });
      continue;
    }
    const ordered = inTokenOrder(cited);
    let normalized: NormalizedReadingValue = normalizeReadingValue(field, structured.value, ordered);
    if (!normalized.ok) {
      dropped.push({ key: field.key, reason: normalized.reason });
      continue;
    }
    // Story 21.2: the vector group, as its code; read from the drawing when no cited run prints a group,
    // and to verify when the cited runs print another group.
    let diagram = false;
    let otherGroup = false;
    if (isVectorGroupField(input.block.block_type, field.key)) {
      const group = parseVectorGroup(normalized.value);
      if (group !== null) {
        normalized = { ok: true, value: group.code, verify: normalized.verify };
        const printed = printedVectorGroups(ordered);
        diagram = printed.size === 0;
        otherGroup = !diagram && !printed.has(group.code);
      }
    }
    const assessed = assessReadingValue({
      field,
      value: normalized.value,
      cited: ordered,
      registry: input.registry,
      verify: normalized.verify || diagram || otherGroup,
      ...(normalized.printedText === undefined ? {} : { printedText: normalized.printedText }),
    });
    const union = unionBox(ordered.map((token) => token.bbox))!;
    rows.push(
      suggestionRowSchema.parse({
        id: input.newId(),
        relatorio_id: input.relatorioId,
        target_path: sheetNameplatePath(input.block.id, field.key),
        value: assessed.value,
        trust: assessed.trust,
        mode: isCellFilled(input.block.sheet.nameplate[field.key]) ? 'replace' : 'fill',
        source: {
          photo_id: input.photoId,
          bbox: diagram ? [...FULL_IMAGE_BBOX] : normalizeBox(union, input.image),
          ocr_token_ids: diagram ? [] : ordered.map((token) => token.id),
          reading_run_id: input.runId,
        },
        status: 'pending',
        prompt_version: input.promptVersion,
        hint: assessed.hint,
      }),
    );
  }
  return { rows, dropped };
}

/** Story 21.2: the codes of the groups the runs of the cited tokens print, in token order (each run joined with spaces, read by the parser). */
function printedVectorGroups(ordered: readonly Pick<OcrToken, 'text'>[]): Set<string> {
  const codes = new Set<string>();
  for (let start = 0; start < ordered.length; start++) {
    let text = '';
    for (let end = start; end < ordered.length; end++) {
      text = end === start ? ordered[end]!.text : `${text} ${ordered[end]!.text}`;
      const group = parseVectorGroup(text);
      if (group !== null) codes.add(group.code);
    }
  }
  return codes;
}

/** The nameplate path `sheet/{block}/nameplate/{key}`. */
const NAMEPLATE_PATH = /^sheet\/[^/]+\/nameplate\/[^/]+$/;

// authored: Story 21.2, the note under a plate suggestion read from the drawn diagram, not from a printed word.
export const DIAGRAM_READ_NOTE = 'Lido do diagrama — confira';

/**
 * Story 21.2: the note under a pending nameplate suggestion: "Lido do diagrama — confira" when the
 * reading cites no OCR token (a vector group read from the drawn diagram, `buildReadingSuggestions`);
 * null for every other suggestion.
 */
export function plateSuggestionNoteText(suggestion: Pick<SuggestionRow, 'target_path' | 'source'>): string | null {
  if (!NAMEPLATE_PATH.test(suggestion.target_path)) return null;
  return suggestion.source.ocr_token_ids.length === 0 ? DIAGRAM_READ_NOTE : null;
}
