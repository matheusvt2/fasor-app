import { composeVectorGroup, inTokenOrder, parseVectorGroup, printedVectorGroups, type OcrToken, type StructuringInput } from '@app/domain';
import { z } from 'zod';
import type { JsonSchema } from '../../../ai/bedrock.ts';

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
 * gives citing words that print a group wins over the diagram.
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

/**
 * Whether a structured group entry is a printed read the kernel keeps: its value parses, every id it
 * cites is in the OCR read (the kernel drops an entry citing an unknown id, `buildReadingSuggestions`),
 * and its cited words print that same group (`printedVectorGroups`, the kernel's rule).
 */
function printsItsGroup(entry: Record<string, unknown>, tokens: readonly Pick<OcrToken, 'id' | 'text'>[]): boolean {
  const group = parseVectorGroup(entry.value);
  if (group === null) return false;
  const ids = entry.ocr_token_ids;
  if (!Array.isArray(ids) || ids.length === 0) return false;
  const byId = new Map(tokens.map((token) => [token.id, token]));
  const cited: Pick<OcrToken, 'id' | 'text'>[] = [];
  for (const id of new Set(ids)) {
    const token = typeof id === 'string' ? byId.get(id) : undefined;
    if (token === undefined) return false;
    cited.push(token);
  }
  return printedVectorGroups(inTokenOrder(cited)).has(group.code);
}

/**
 * The tool input with `vector_diagram` folded into the group field's value and stripped: always
 * stripped; with no `key` nothing else changes. A group entry the model gave whose value parses and
 * whose cited words print a group wins and the diagram is ignored. Otherwise a diagram that
 * validates and composes becomes `{key, value: <code>, ocr_token_ids: <the diagram's>, confidence: 0.5}`,
 * replacing a non-printed entry. A null, malformed or uncomposable diagram changes nothing else.
 * A malformed input is returned as it is, for the schema to judge.
 */
export function withVectorDiagram(input: unknown, key: string | undefined, tokens: readonly Pick<OcrToken, 'id' | 'text'>[]): unknown {
  if (!isRecord(input) || !Object.hasOwn(input, VECTOR_DIAGRAM_KEY)) return input;
  const { [VECTOR_DIAGRAM_KEY]: raw, ...rest } = input;
  if (key === undefined) return rest;
  const facts = vectorDiagramFactsSchema.safeParse(raw);
  if (!facts.success) return rest;
  const code = composeVectorGroup(facts.data);
  if (code === null) return rest;
  const values = rest.values;
  if (!Array.isArray(values)) return rest;
  const index = values.findIndex((value: unknown) => isRecord(value) && value.key === key);
  if (index >= 0 && printsItsGroup(values[index] as Record<string, unknown>, tokens)) return rest;
  // Only the labels the OCR read returned are cited (the kernel drops a value citing an unknown id);
  // none left is an uncited value, dropped next by `withoutUncitedValues`.
  const known = new Set(tokens.map((token) => token.id));
  // The server ignores the model's confidence (`reading/digits.ts`): 0.5 is inert.
  const composed = { key, value: code, ocr_token_ids: [...new Set(facts.data.ocr_token_ids)].filter((id) => known.has(id)), confidence: 0.5 };
  return { ...rest, values: index >= 0 ? values.map((value: unknown, i) => (i === index ? composed : value)) : [...values, composed] };
}
