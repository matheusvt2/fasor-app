import type { OcrReadResult, OcrToken, StructuringOutput, StructuringValue } from '../contract/ocr.ts';
import type { NewId } from '../ids.ts';
import { sheetNameplatePath } from '../ops/path.ts';
import { isCellFilled } from '../relatorio/sheet-state.ts';
import { suggestionRowSchema, type BlockRow, type SuggestionRow } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import type { FieldDef } from '../seed/schema.ts';
import { assessReadingValue, type ReadingRegistry } from './assess.ts';
import { normalizeBox, unionBox } from './boxes.ts';
import { inTokenOrder } from './digits.ts';
import { normalizeReadingValue } from './value.ts';

/*
 * Stories 8.4 and 8.5: the pure core of one reading run. Every structured value becomes a
 * pending `suggestion` row on its nameplate cell, with the trust and hint of
 * `assessReadingValue`, the union of its cited tokens' boxes normalized over the image sent,
 * and `mode = replace` when the cell was already filled at emission (no op family lets the
 * device write `mode`, so the server records it). A value that names a key the block's
 * nameplate does not have, cites a token the OCR did not return, or has an invalid shape is
 * dropped with its reason for the job to log. A field the model left out gets nothing.
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
    const normalized = normalizeReadingValue(field, structured.value, ordered);
    if (!normalized.ok) {
      dropped.push({ key: field.key, reason: normalized.reason });
      continue;
    }
    const assessed = assessReadingValue({
      field,
      value: normalized.value,
      cited: ordered,
      registry: input.registry,
      verify: normalized.verify,
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
          bbox: normalizeBox(union, input.image),
          ocr_token_ids: ordered.map((token) => token.id),
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
