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
    const ordered = citedInOrder(structured.ocr_token_ids, tokens);
    if (ordered === null) {
      dropped.push({ key: field.key, reason: 'unknown_token' });
      continue;
    }
    let normalized: NormalizedReadingValue = normalizeReadingValue(field, structured.value, ordered);
    if (!normalized.ok) {
      dropped.push({ key: field.key, reason: normalized.reason });
      continue;
    }
    // Story 21.2: the vector group, as its code; read from the drawing when no cited run prints a group,
    // and to verify when the cited runs print another group (`groupReadOf`, the one rule).
    let diagram = false;
    let otherGroup = false;
    if (isVectorGroupField(input.block.block_type, field.key)) {
      const group = groupReadOf(normalized.value, ordered);
      if (group !== null) {
        normalized = { ok: true, value: group.code, verify: normalized.verify };
        diagram = group.kind === 'diagram';
        otherGroup = group.kind === 'other_group';
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

/**
 * The cited tokens of a structured value, deduplicated and in token order; null when it cites none
 * or any id the OCR read did not return (a non-string id included): the value is then dropped
 * `unknown_token`.
 */
function citedInOrder<T extends Pick<OcrToken, 'id'>>(ids: readonly unknown[], tokens: ReadonlyMap<string, T>): T[] | null {
  const cited: T[] = [];
  for (const id of new Set(ids)) {
    const token = typeof id === 'string' ? tokens.get(id) : undefined;
    if (token === undefined) return null;
    cited.push(token);
  }
  return cited.length === 0 ? null : inTokenOrder(cited);
}

/** e21a (R-2): how a vector-group value the job keeps reads against its cited words. */
export type VectorGroupReadKind = 'printed' | 'other_group' | 'diagram';

/**
 * The group a normalized value names and how the cited runs print it: `printed` (they print that
 * group), `other_group` (they print another), `diagram` (they print none: read from the drawing);
 * null when the value names no group.
 */
function groupReadOf(value: unknown, ordered: readonly Pick<OcrToken, 'text'>[]): { kind: VectorGroupReadKind; code: string } | null {
  const group = parseVectorGroup(value);
  if (group === null) return null;
  const printed = printedVectorGroups(ordered);
  const kind: VectorGroupReadKind = printed.size === 0 ? 'diagram' : printed.has(group.code) ? 'printed' : 'other_group';
  return { kind, code: group.code };
}

/**
 * e21a (R-2): what the job stores for one structured LIGAÇÃO SECUNDÁRIA value of a transformador de
 * força. `printed`: the group as its code, citing its words, by the digit rule; `other_group`: the
 * code, `verify`, its citations kept; `diagram`: the code, `verify`, citing no token over the whole
 * image ("Lido do diagrama — confira"); `unparsed`: a v9/v10 text naming no group, stored as read
 * (`value`); `dropped`: nothing stored, for `reason`.
 */
export type VectorGroupRead =
  | { kind: VectorGroupReadKind; code: string }
  | { kind: 'unparsed'; value: unknown }
  | { kind: 'dropped'; reason: ReadingDropReason };

/**
 * e21a (R-2): THE classification of one structured vector-group value (`field` is the v11 select or
 * the v9/v10 text), made by the same steps `buildReadingSuggestions` takes: the citation check, the
 * value's normalization, then the cited runs. The plate reading's vector-diagram fold asks it whether
 * the model's own entry is printed, and the eval prints its kind.
 */
export function vectorGroupReadOf(
  field: Pick<FieldDef, 'kind' | 'unit' | 'options' | 'option_aliases'>,
  entry: { value: unknown; ocr_token_ids: readonly unknown[] },
  tokens: readonly Pick<OcrToken, 'id' | 'text'>[],
): VectorGroupRead {
  const ordered = citedInOrder(entry.ocr_token_ids, new Map(tokens.map((token) => [token.id, token])));
  if (ordered === null) return { kind: 'dropped', reason: 'unknown_token' };
  const normalized = normalizeReadingValue(field, entry.value, ordered);
  if (!normalized.ok) return { kind: 'dropped', reason: normalized.reason };
  return groupReadOf(normalized.value, ordered) ?? { kind: 'unparsed', value: normalized.value };
}

/**
 * Story 21.2: the codes of the groups the runs of the cited tokens print, in token order (each run joined with spaces, read by the parser).
 * Exported (e21f) for the plate reading's vector-diagram fold and the eval: a printed group there wins over the drawn diagram.
 */
export function printedVectorGroups(ordered: readonly Pick<OcrToken, 'text'>[]): Set<string> {
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
