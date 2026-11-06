import { composeVectorGroup, vectorGroupReadOf, type FieldDef, type OcrToken, type StructuringInput } from '@app/domain';
import { z } from 'zod';
import type { JsonSchema } from '../../../ai/bedrock.ts';
import { log } from '../../../log.ts';

/*
 * e21f (Story 21.2 fix, the coordinator's paid eval of 2026-11-05): asked for the vector group of
 * a plate that draws its diagrams and prints no code, the production model perceived the drawing
 * right but composed the code wrong (the drawn Yyn0 plate read "Dy1" 3 of 3); asked for what the
 * drawing shows it answered right 5 of 5. So the structuring tool asks for those facts in a
 * top-level `vector_diagram`, and `composeVectorGroup` (the kernel) composes the code.
 *
 * The facts never leave the provider: `withVectorDiagram` folds the composed code into the group
 * field's structured value and strips `vector_diagram`, before `withoutUncitedValues` and the
 * contract parse (`StructuringOutput` is strict and unchanged). The value cites the diagram's
 * terminal labels, which print no group, so `buildReadingSuggestions` makes it a diagram read
 * (`verify`, no token cited, the whole image, "Lido do diagrama — confira"). A group the model
 * gives citing words that print it wins over the diagram.
 *
 * e21a (Epic 21 retrospective R-1 to R-3): whether the model's entry is printed is the kernel's
 * classification (`vectorGroupReadOf`, the one rule the job stores by); facts none of whose ids the
 * OCR returned cannot be cited and are ignored, so the model's own entry stays; and the fold returns
 * its outcome, logged as one `reading vector diagram` line (`logVectorDiagram`).
 */

/** The tool input's key that carries the drawn diagram's facts. */
export const VECTOR_DIAGRAM_KEY = 'vector_diagram';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The OCR ids the diagram cites. */
const TOKEN_ID = /^t\d+$/;
const WINDING_SHAPES = ['star', 'delta', 'zigzag'] as const;

/**
 * The facts the tool answers (lenient: unknown extra keys are stripped). A missing key or a wrong
 * type fails the parse, and the fold then ignores the diagram, never the reading.
 */
export const vectorDiagramFactsSchema = z.object({
  hv_shape: z.enum(WINDING_SHAPES),
  hv_neutral: z.boolean(),
  lv_shape: z.enum(WINDING_SHAPES),
  lv_neutral: z.boolean(),
  x1_hours: z.number().int().min(0).max(11),
  ocr_token_ids: z.array(z.string().regex(TOKEN_ID)),
});
export type VectorDiagramAnswer = z.infer<typeof vectorDiagramFactsSchema>;

/** The `vector_diagram` property of the structuring tool's input JSON Schema (the wording of the 5-of-5 probe). */
export const VECTOR_DIAGRAM_TOOL_SCHEMA: JsonSchema = {
  type: ['object', 'null'],
  description: 'Only when the plate prints no vector group code and draws the winding diagrams; null otherwise. Describe what is drawn; do not compose the code.',
  properties: {
    hv_shape: {
      type: 'string',
      enum: [...WINDING_SHAPES],
      description: 'The high-voltage (H1 H2 H3) diagram: star = three arms from one centre point; delta = a closed triangle; zigzag = a star whose arms bend.',
    },
    hv_neutral: { type: 'boolean', description: 'true only when H0 is printed at the high-voltage star centre.' },
    lv_shape: { type: 'string', enum: [...WINDING_SHAPES], description: 'The low-voltage (X1 X2 X3) diagram, same shapes.' },
    lv_neutral: { type: 'boolean', description: 'true only when X0 is printed at the low-voltage centre.' },
    x1_hours: {
      type: 'integer',
      minimum: 0,
      maximum: 11,
      description: 'With the H1 arm (or corner) at 12 o\'clock, the clock hour the X1 arm (or corner) points to: same direction 0, opposite 6, each 30 degrees clockwise one hour.',
    },
    ocr_token_ids: { type: 'array', items: { type: 'string', pattern: '^t\\d+$' }, description: "The OCR ids of the diagram's terminal labels." },
  },
  required: ['hv_shape', 'hv_neutral', 'lv_shape', 'lv_neutral', 'x1_hours', 'ocr_token_ids'],
  additionalProperties: false,
};

/**
 * Story 21.2: the plate kind's structuring input. `vectorGroupKey` names the field that holds a
 * transformador de força's vector group (its LIGAÇÃO SECUNDÁRIA), set by `kinds/plate.ts`; the
 * contract's `StructuringInput` (`contract/ocr.ts`) stays as it is, and every other provider
 * ignores the extra key.
 */
export interface PlateStructuringInput extends StructuringInput {
  vectorGroupKey?: string;
}

/** The vector-group key of a structuring input when it names one of its fields; undefined otherwise. */
export function vectorGroupKeyOf(input: Partial<Pick<PlateStructuringInput, 'fields' | 'vectorGroupKey'>> | null | undefined): string | undefined {
  const key = input?.vectorGroupKey;
  const fields: unknown = input?.fields;
  if (key === undefined || !Array.isArray(fields)) return undefined;
  return fields.some((field: unknown) => isRecord(field) && field.key === key) ? key : undefined;
}

/** e21a (R-2): the vector-group field of a structuring input: its key and its definition, which the kernel classification reads. */
export interface VectorGroupTarget {
  key: string;
  field: Pick<FieldDef, 'kind' | 'unit' | 'options' | 'option_aliases'>;
}

/** The vector-group field of a structuring input (`vectorGroupKeyOf`, then its definition in `fields`); undefined when it names none. */
export function vectorGroupOf(input: Partial<Pick<PlateStructuringInput, 'fields' | 'vectorGroupKey'>> | null | undefined): VectorGroupTarget | undefined {
  const key = vectorGroupKeyOf(input);
  if (key === undefined) return undefined;
  const field = input!.fields!.find((candidate) => isRecord(candidate) && candidate.key === key);
  return field === undefined ? undefined : { key, field };
}

/**
 * e21a (R-3): what the fold did. `absent`: the input carries no `vector_diagram`; `null`: it is null;
 * `malformed`: the facts fail their schema (or the input's `values` is not an array, left for the
 * contract parse); `uncomposable`: the facts name no row of the table; `printed_wins`: the model's
 * own entry prints its group; `uncited`: none of the ids the facts cite is in the OCR read, so they
 * are ignored and the model's entry stays; `composed`: the composed code is the group's value.
 */
export type VectorDiagramOutcome = 'absent' | 'null' | 'malformed' | 'uncomposable' | 'printed_wins' | 'uncited' | 'composed';

export interface VectorDiagramFold {
  /** The tool input, `vector_diagram` stripped and the composed value folded in when `composed`. */
  input: unknown;
  /** Null when the input names no vector-group field: nothing is logged. */
  outcome: VectorDiagramOutcome | null;
  /** The facts as parsed; null when absent, null or malformed. */
  facts: VectorDiagramAnswer | null;
  /** The code the facts compose; null when they compose none. */
  code: string | null;
  /** How many distinct ids of the facts the OCR read returned (what the composed value cites). */
  cited: number;
  /** True when the composed value replaced an entry the model gave. */
  replaced: boolean;
}

/**
 * The tool input with `vector_diagram` folded into the group field's value and stripped: always
 * stripped; with no `group` nothing else changes. A group entry the model gave that the kernel
 * reads as printed (`vectorGroupReadOf`) wins and the diagram is ignored. Facts that validate and
 * compose but cite no id the OCR returned are ignored too (R-1: the model's own entry stays, read by
 * the kernel as any entry). Otherwise the composed code becomes
 * `{key, value: <code>, ocr_token_ids: <the diagram's known ids>, confidence: 0.5}`, replacing a
 * non-printed entry. A null, malformed or uncomposable diagram changes nothing else. A malformed
 * input is returned as it is, for the schema to judge.
 */
export function withVectorDiagram(input: unknown, group: VectorGroupTarget | undefined, tokens: readonly Pick<OcrToken, 'id' | 'text'>[]): VectorDiagramFold {
  const fold = (outcome: VectorDiagramOutcome, folded: unknown, facts: VectorDiagramAnswer | null = null, code: string | null = null, cited = 0, replaced = false): VectorDiagramFold => ({
    input: folded,
    outcome: group === undefined ? null : outcome,
    facts,
    code,
    cited,
    replaced,
  });
  if (!isRecord(input) || !Object.hasOwn(input, VECTOR_DIAGRAM_KEY)) return fold('absent', input);
  const { [VECTOR_DIAGRAM_KEY]: raw, ...rest } = input;
  if (group === undefined) return fold('absent', rest);
  if (raw === null) return fold('null', rest);
  const parsed = vectorDiagramFactsSchema.safeParse(raw);
  if (!parsed.success) return fold('malformed', rest);
  const facts = parsed.data;
  const code = composeVectorGroup(facts);
  // Only the labels the OCR read returned are cited (the kernel drops a value citing an unknown id).
  const known = new Set(tokens.map((token) => token.id));
  const ids = [...new Set(facts.ocr_token_ids)].filter((id) => known.has(id));
  if (code === null) return fold('uncomposable', rest, facts, null, ids.length);
  const values = rest.values;
  if (!Array.isArray(values)) return fold('malformed', rest, facts, code, ids.length);
  const index = values.findIndex((value: unknown) => isRecord(value) && value.key === group.key);
  if (index >= 0 && isPrinted(group, values[index] as Record<string, unknown>, tokens)) return fold('printed_wins', rest, facts, code, ids.length);
  // R-1: facts that cannot be cited are ignored; the model's own entry (if any) goes on as it is.
  if (ids.length === 0) return fold('uncited', rest, facts, code, 0);
  // The server ignores the model's confidence (`reading/digits.ts`): 0.5 is inert.
  const composed = { key: group.key, value: code, ocr_token_ids: ids, confidence: 0.5 };
  const folded = { ...rest, values: index >= 0 ? values.map((value: unknown, i) => (i === index ? composed : value)) : [...values, composed] };
  return fold('composed', folded, facts, code, ids.length, index >= 0);
}

/** Whether the kernel reads the model's own group entry as printed (`vectorGroupReadOf`, the rule the job stores by). */
function isPrinted(group: VectorGroupTarget, entry: Record<string, unknown>, tokens: readonly Pick<OcrToken, 'id' | 'text'>[]): boolean {
  const ids = Array.isArray(entry.ocr_token_ids) ? (entry.ocr_token_ids as unknown[]) : [];
  return vectorGroupReadOf(group.field, { value: entry.value, ocr_token_ids: ids }, tokens).kind === 'printed';
}

/**
 * e21a (R-3): one `reading vector diagram` line per structuring call that names a vector-group field:
 * the model, the fold's outcome, the composed code, the five facts, how many of the facts' ids the
 * OCR returned, and whether a model entry was replaced. Never any OCR text.
 */
export function logVectorDiagram(fold: VectorDiagramFold, model: string): void {
  if (fold.outcome === null) return;
  log('reading vector diagram', {
    model,
    outcome: fold.outcome,
    code: fold.code,
    hv_shape: fold.facts?.hv_shape ?? null,
    hv_neutral: fold.facts?.hv_neutral ?? null,
    lv_shape: fold.facts?.lv_shape ?? null,
    lv_neutral: fold.facts?.lv_neutral ?? null,
    x1_hours: fold.facts?.x1_hours ?? null,
    cited: fold.cited,
    replaced: fold.replaced,
  });
}
