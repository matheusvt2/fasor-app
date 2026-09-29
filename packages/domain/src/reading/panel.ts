import { z } from 'zod';
import type { OcrReadResult, OcrToken, StructuringOutput, StructuringValue } from '../contract/ocr.ts';
import { uuidV7Schema, type NewId } from '../ids.ts';
import { fileFieldPath } from '../ops/path.ts';
import { EQUIPMENT_BLOCK_TYPES, equipmentBlockTypeSchema, isEquipmentBlockType, type EquipmentBlockType } from '../schemas/block-config.ts';
import { suggestionRowSchema, type SuggestionRow } from '../schemas/entities.ts';
import type { FieldDef } from '../seed/schema.ts';
import { normalizeBox, unionBox } from './boxes.ts';
import { inTokenOrder } from './digits.ts';

/*
 * Story 9.2 (FR-38): "Fotografar equipamento". A photo of a panel front is read for the
 * equipment's type (one of the eight equipment block types) and its column label ("C09").
 * The panel does not exist as a block yet, so the reading has no sheet cell to target: its one
 * pending suggestion targets the photo's own `file/{id}/block_id` (Conflict 6 of the Epic 9
 * context), a path `suggestionTarget` does not understand, so it is never counted anywhere.
 * The device composes the create batch from it (`relatorio/panel.ts`).
 */

/** What a panel photo's `reading_target` names: the location the palette was opened on. Extra keys are kept. */
export const panelReadingTargetSchema = z.looseObject({ location_id: uuidV7Schema });
export type PanelReadingTarget = z.infer<typeof panelReadingTargetSchema>;

/** The `reading_target` of a panel shot taken from the palette opened on `locationId`. */
export function panelReadingTarget(locationId: string): PanelReadingTarget {
  return { location_id: locationId };
}

/** Below this confidence a kept value is shown as a guess flagged "Verificar". */
export const PANEL_MIN_CONFIDENCE = 0.5;

/** The two values the structuring step is asked for on a panel photo. */
export const PANEL_FIELDS: readonly FieldDef[] = [
  { key: 'block_type', label: 'Tipo do equipamento', kind: 'select', options: [...EQUIPMENT_BLOCK_TYPES] },
  { key: 'column', label: 'Coluna', kind: 'text' },
];

/** The value of a panel suggestion: the type read (null when not one of the eight), the column number and its label as printed. */
export const panelSuggestionValueSchema = z.object({
  block_type: equipmentBlockTypeSchema.nullable(),
  column: z.number().int().min(1).max(99).nullable(),
  column_text: z.string().nullable(),
});
export type PanelSuggestionValue = z.infer<typeof panelSuggestionValueSchema>;

export type PanelDropReason = 'unknown_key' | 'unknown_token' | 'invalid_shape' | 'unknown_type' | 'no_column';

export interface PanelDrop {
  key: string;
  reason: PanelDropReason;
}

export interface BuildPanelSuggestionInput {
  relatorioId: string;
  photoId: string;
  runId: string;
  ocr: OcrReadResult;
  /** The width and height of the image both providers received. */
  image: { width: number; height: number };
  output: StructuringOutput;
  promptVersion: string;
  newId: NewId;
}

export interface BuiltPanelSuggestion {
  /** None or one. */
  rows: SuggestionRow[];
  dropped: PanelDrop[];
}

/** The first integer from 1 to 99 in a column label: "C09", "9", "Coluna 9" are 9. */
export function panelColumnOf(text: string): number | null {
  for (const match of text.matchAll(/\d+/g)) {
    const n = Number.parseInt(match[0], 10);
    if (n >= 1 && n <= 99) return n;
  }
  return null;
}

function textOf(value: StructuringValue['value']): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  return null;
}

export function buildPanelSuggestion(input: BuildPanelSuggestionInput): BuiltPanelSuggestion {
  const tokens = new Map<string, OcrToken>(input.ocr.tokens.map((token) => [token.id, token]));
  const dropped: PanelDrop[] = [];
  const kept: { value: StructuringValue; cited: OcrToken[] }[] = [];
  let blockType: EquipmentBlockType | null = null;
  let column: number | null = null;
  let columnText: string | null = null;

  const seen = new Set<string>();
  for (const value of input.output.values) {
    if ((value.key !== 'block_type' && value.key !== 'column') || seen.has(value.key)) {
      dropped.push({ key: value.key, reason: 'unknown_key' });
      continue;
    }
    seen.add(value.key);
    const cited: OcrToken[] = [];
    let unknown = false;
    for (const id of new Set(value.ocr_token_ids)) {
      const token = tokens.get(id);
      if (token === undefined) unknown = true;
      else cited.push(token);
    }
    if (unknown || cited.length === 0) {
      dropped.push({ key: value.key, reason: 'unknown_token' });
      continue;
    }
    const text = textOf(value.value);
    if (text === null) {
      dropped.push({ key: value.key, reason: 'invalid_shape' });
      continue;
    }
    if (value.key === 'block_type') {
      const type = text.toLowerCase();
      if (!isEquipmentBlockType(type)) {
        dropped.push({ key: value.key, reason: 'unknown_type' });
        continue;
      }
      blockType = type;
    } else {
      const n = panelColumnOf(text);
      if (n === null) {
        dropped.push({ key: value.key, reason: 'no_column' });
        continue;
      }
      column = n;
      columnText = text;
    }
    kept.push({ value, cited });
  }

  if (blockType === null && column === null) return { rows: [], dropped };
  const ordered = inTokenOrder([...new Map(kept.flatMap((entry) => entry.cited).map((token) => [token.id, token])).values()]);
  const union = unionBox(ordered.map((token) => token.bbox))!;
  const verify = kept.some((entry) => entry.value.confidence < PANEL_MIN_CONFIDENCE);
  const value: PanelSuggestionValue = { block_type: blockType, column, column_text: columnText };
  const row = suggestionRowSchema.parse({
    id: input.newId(),
    relatorio_id: input.relatorioId,
    target_path: fileFieldPath(input.photoId, 'block_id'),
    value,
    trust: verify ? 'verify' : 'suggested',
    mode: 'fill',
    source: {
      photo_id: input.photoId,
      bbox: normalizeBox(union, input.image),
      ocr_token_ids: ordered.map((token) => token.id),
      reading_run_id: input.runId,
    },
    status: 'pending',
    prompt_version: input.promptVersion,
    hint: null,
  });
  return { rows: [row], dropped };
}
