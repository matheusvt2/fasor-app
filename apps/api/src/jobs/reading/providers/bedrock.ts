import type { ContentBlock } from '@aws-sdk/client-bedrock-runtime';
import {
  blockTypeLabel,
  proseResultSchema,
  SEED_VERSION,
  structuringResultSchema,
  VECTOR_GROUP_CODES,
  type FieldDef,
  type OcrImage,
  type ProseInput,
  type ProseProvider,
  type ProseResult,
  type StructuringInput,
  type StructuringProvider,
  type StructuringResult,
} from '@app/domain';
import { z } from 'zod';
import { assertPricedModel, converseTool, type BedrockProviderOptions, type JsonSchema } from '../../../ai/bedrock.ts';
import { PermanentReadingError } from './errors.ts';
import { withoutUncitedValues } from './uncited.ts';
import { logVectorDiagram, VECTOR_DIAGRAM_KEY, VECTOR_DIAGRAM_TOOL_SCHEMA, vectorGroupKeyOf, vectorGroupOf, withVectorDiagram, type PlateStructuringInput } from './vector-diagram.ts';

export type { PlateStructuringInput } from './vector-diagram.ts';
// e21a (R-4): the uncited drop lives in a provider-neutral module; its name stays importable from here.
export { withoutUncitedValues } from './uncited.ts';

// Review 2026-10-08 (C4): the Converse client layer moved to `apps/api/src/ai/bedrock.ts`; its
// names stay importable from here for the reading's tests and scripts.
export {
  assertPricedModel,
  BEDROCK_DEFAULT_REGION,
  BEDROCK_PRICES,
  BEDROCK_TIMEOUT_MS,
  bedrockClientSource,
  classifyBedrockError,
  converseTool,
  createBedrockClient,
  usdFor,
  type BedrockClientSource,
  type BedrockConverseOutput,
  type BedrockLike,
  type BedrockProviderOptions,
  type ConverseCall,
} from '../../../ai/bedrock.ts';

/*
 * Story 11.6: the `bedrock` LLM provider, one Amazon Bedrock Converse adapter behind both the
 * structuring step (plate and panel) and the prose step (vision caption, NC draft). Converse is
 * the same call for every Bedrock model, so the model is configuration (`BEDROCK_MODEL_ID`,
 * `BEDROCK_PROSE_MODEL_ID`, `BEDROCK_ESCALATION_MODEL_ID`); Claude Haiku 4.5 is the reference
 * (Matheus, 2026-10-05). Credentials come only from the AWS SDK default provider chain (the env
 * session of the `fasor-app` profile locally, the ECS task role on AWS); nothing here reads or
 * stores a key. The account's AI services opt-out policy is attached by
 * `infra/bootstrap/organization.tf`.
 *
 * Structured output goes through Converse tool use: one tool whose input JSON Schema is derived
 * from the field definitions, forced with `toolChoice: {tool}`, and its `input` validated with
 * the contract's own result schema. The model cites OCR token ids, sent as `t<n>: text` lines
 * without coordinates, and never a box: every box and every trust stays server side
 * (`buildReadingSuggestions`, `assessReadingValue`). A token id or field key the OCR did not
 * return passes through here and is dropped there. A value with a missing or empty
 * `ocr_token_ids` (read from the image alone, nothing to box) is dropped here, before
 * validation, and the rest of the reading goes on (Matheus, 2026-10-05, after the live
 * evaluation: Haiku 4.5 and Mistral Large 3 returned the panel's block type uncited).
 *
 * One client per process, built lazily on the first call, SDK retries off (`maxAttempts: 1`):
 * pg-boss retries a transient failure as a new attempt. A reply without the tool call or one the
 * schema refuses (once the uncited values are dropped) is permanent (the same request fails the same way); throttling, 5xx, a
 * credential hiccup and a timeout are transient; a denied model, a bad model id or a malformed request are refused
 * (permanent), as `classifyAwsError` (`apps/api/src/ai/aws.ts`) decides.
 */

/** The prompt of the structuring step; bump it with every change of the prompt or the tool schema. */
// 2 (review 2026-10-08, AIR-1/AIR-V1): dates as precise as printed, never an invented month; pt-BR separators spelled out.
// 3 (Story 21.2): the transformer's vector group, printed or read from the drawn HV and LV diagrams, one of the 47 codes.
// 4 (e21f): a drawn diagram is described in the tool's `vector_diagram` facts and composed by the kernel (`composeVectorGroup`), never by the model.
// 5 (Stories 22.7 and 22.9): TIPO is the maker's designation, never the oil; the oil class and the oil insulation; EXATIDÃO as printed.
export const BEDROCK_STRUCTURING_PROMPT_VERSION = 'bedrock-structuring-5';

/** The prompt of the prose step (caption, NC draft); bump it with every change of the prompt or the tool schema. */
export const BEDROCK_PROSE_PROMPT_VERSION = 'bedrock-prose-1';

/** Converse's limit on one image's bytes; the print variant (at most 2000 px, JPEG) stays far below it. */
export const BEDROCK_MAX_IMAGE_BYTES = 3_750_000;

const STRUCTURING_TOOL = 'record_values';
const PROSE_TOOL = 'record_text';
const STRUCTURING_MAX_TOKENS = 2048;
const PROSE_MAX_TOKENS = 400;

// --- tool schemas -----------------------------------------------------------------

const NUMBER_VALUE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    raw: { type: 'string', description: 'The number as a plain decimal: digits, an optional minus sign and a dot as decimal separator.' },
    unit: { type: ['string', 'null'], description: 'The unit as printed, or null when none is printed.' },
    state: { type: 'string', enum: ['measured'] },
  },
  required: ['raw', 'unit', 'state'],
  additionalProperties: false,
};

const TEXT_VALUE_SCHEMA: JsonSchema = { type: 'string', minLength: 1 };

/** The value shapes the fields need: the number object, a string, or either. */
function valueSchemaFor(fields: readonly FieldDef[]): JsonSchema {
  const hasNumber = fields.some((field) => field.kind === 'number');
  const hasText = fields.some((field) => field.kind !== 'number');
  if (hasNumber && hasText) return { anyOf: [TEXT_VALUE_SCHEMA, NUMBER_VALUE_SCHEMA] };
  return hasNumber ? NUMBER_VALUE_SCHEMA : TEXT_VALUE_SCHEMA;
}

/**
 * The structuring tool's input JSON Schema, derived from the field definitions: the shape of
 * `structuringOutputSchema`, its keys narrowed to the fields' keys and its values to the
 * shapes their kinds take. Per-field detail (kind, unit, options) goes in the prompt.
 *
 * e21f: with a `vectorGroupKey` naming one of the fields, a required, nullable top-level
 * `vector_diagram` asks for the drawn diagrams' facts (`VECTOR_DIAGRAM_TOOL_SCHEMA`); the provider
 * folds them into the group's value (`withVectorDiagram`). Without one the schema is as before.
 */
export function structuringToolSchema(fields: readonly FieldDef[], vectorGroupKey?: string): JsonSchema {
  const schema = valuesToolSchema(fields);
  if (vectorGroupKey === undefined || !fields.some((field) => field.key === vectorGroupKey)) return schema;
  return {
    ...schema,
    properties: { ...(schema.properties as Record<string, unknown>), [VECTOR_DIAGRAM_KEY]: VECTOR_DIAGRAM_TOOL_SCHEMA },
    required: ['values', VECTOR_DIAGRAM_KEY],
  };
}

function valuesToolSchema(fields: readonly FieldDef[]): JsonSchema {
  return {
    type: 'object',
    properties: {
      values: {
        type: 'array',
        description: 'One entry per field read on the photo; a field that cannot be read is left out.',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: fields.map((field) => field.key) },
            value: valueSchemaFor(fields),
            ocr_token_ids: {
              type: 'array',
              items: { type: 'string', pattern: '^t\\d+$' },
              minItems: 1,
              description: 'The ids of the OCR words that spell the value, from the list given.',
            },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['key', 'value', 'ocr_token_ids', 'confidence'],
          additionalProperties: false,
        },
      },
    },
    required: ['values'],
    additionalProperties: false,
  };
}

const PROSE_TOOL_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'One sentence in Brazilian Portuguese, or an empty string when nothing applies.' },
  },
  required: ['text'],
  additionalProperties: false,
};

// --- prompts ----------------------------------------------------------------------

const STRUCTURING_SYSTEM = [
  'You read equipment nameplates and panel fronts photographed during inspections of medium-voltage electrical substations in Brazil.',
  'You get the photo, the words an OCR engine found on it (one per line as "<id>: <text>", in reading order) and the fields to fill.',
  `Call the ${STRUCTURING_TOOL} tool exactly once.`,
  'For each field you can read on the photo, give one value and cite in ocr_token_ids the ids of the OCR words that spell it.',
  'Rules: cite only ids from the list; never invent a value or an id; leave out a field you cannot read or whose words are not in the list; never give coordinates.',
  'Value by field kind:',
  '- text, manufacturer: the text as printed.',
  '- select: exactly one of the options listed for the field.',
  '- date: exactly as precise as printed: YYYY for a year alone, YYYY-MM for a month and year, YYYY-MM-DD for a day; never add a month or a day the photo does not print.',
  '- voltage_class: the voltage as printed, for example "15 kV".',
  '- number: an object {"raw": the number with a dot as decimal separator and no thousands separator, "unit": the unit as printed or null, "state": "measured"}. Plates print the Brazilian way: "13.800" is 13800 and "1,5" is 1.5. Give the unit printed beside the number even when the field has another one.',
  'confidence is your confidence in the value, from 0 to 1.',
].join('\n');

function fieldLine(field: FieldDef): string {
  const details = [field.kind, field.unit === undefined ? null : `unit ${field.unit}`, field.options === undefined ? null : `options: ${field.options.join(' | ')}`].filter(
    (part): part is string => part !== null,
  );
  return `- ${field.key} (${details.join('; ')}): ${field.label}`;
}

/** Story 21.2: the paragraph that asks for the vector group, printed or drawn, as one of the 47 codes. */
export function vectorGroupPrompt(key: string): string {
  return [
    `The field ${key} holds the transformer's vector group (IEC 60076-1: high-voltage connection in capitals, low-voltage connection in lower case, then the clock number).`,
    `Give exactly one of these codes: ${VECTOR_GROUP_CODES.join(' | ')}.`,
    'When the plate prints the code (for example "Dyn1", "DYN1" or "Dyn 1"), give that code and cite the words that print it.',
    `When no code is printed, leave ${key} out of values and fill vector_diagram instead: describe what is drawn, never compose the code.`,
  ].join('\n');
}

/**
 * Stories 22.7 and 22.9 (seed v12): the lines that say what a v12 field holds, for the fields the
 * request carries: the transformer's TIPO (the maker's designation, never the oil), its TIPO DO
 * ÓLEO (the oil class letter) and its TIPO DE ISOLAÇÃO (oil when the plate names insulating oil),
 * and an EXATIDÃO select's class, sent as printed for the kernel to read (`parseAccuracyClass`).
 * Empty for a request with none of them, so every other plate's prompt is as before.
 */
export function plateFieldNotes(fields: readonly FieldDef[]): string[] {
  const field = (key: string) => fields.find((candidate) => candidate.key === key);
  const notes: string[] = [];
  const oil = field('tipo_do_oleo');
  if (oil !== undefined) {
    if (field('tipo') !== undefined) notes.push('The field tipo is the manufacturer\'s type or model designation (for example "TRICAST"), never the insulating oil.');
    notes.push(`The field tipo_do_oleo is the class letter of the insulating oil: "Tipo óleo isolante B" is tipo_do_oleo = B; give one of: ${oil.options?.join(' | ') ?? 'A | B'}.`);
    const insulation = field('tipo_de_isolacao');
    const oilOption = insulation?.options?.find((option) => /óleo/i.test(option));
    if (oilOption !== undefined) notes.push(`The field tipo_de_isolacao is ${oilOption} when the plate names an insulating oil ("óleo isolante", "óleo mineral"); leave it out when the plate prints no insulation word.`);
  }
  const exatidao = field('exatidao');
  if (exatidao?.kind === 'select') {
    notes.push('The field exatidao is the accuracy class exactly as printed, burden included (for example "0,6C25" or "10P20"): give it as text, not forced to one of its options.');
  }
  return notes;
}

/** The structuring request's text: the fields, then the OCR words as `t<n>: text` lines, never their boxes. */
export function structuringPrompt(input: Pick<PlateStructuringInput, 'ocr' | 'fields' | 'vectorGroupKey'>): string {
  const words = input.ocr.tokens.length === 0 ? '(no words)' : input.ocr.tokens.map((token) => `${token.id}: ${token.text}`).join('\n');
  const key = vectorGroupKeyOf(input);
  const group = key !== undefined ? `\n\n${vectorGroupPrompt(key)}` : '';
  const notes = plateFieldNotes(input.fields);
  const fieldNotes = notes.length === 0 ? '' : `\n\n${notes.join('\n')}`;
  return `Fields:\n${input.fields.map(fieldLine).join('\n')}${fieldNotes}${group}\n\nOCR words:\n${words}`;
}

const PROSE_SYSTEM = [
  'You write one short sentence in Brazilian Portuguese (pt-BR) for the technical report of an inspection of a medium-voltage electrical substation.',
  `Call the ${PROSE_TOOL} tool exactly once.`,
  'Describe only what the photo shows; never identify or describe a person; never invent a measurement or a brand.',
  'When nothing applies, give an empty text.',
].join('\n');

/** The prose request's text for a caption or an NC observation draft. */
export function prosePrompt(input: Pick<ProseInput, 'kind' | 'context'>): string {
  if (input.kind === 'caption') {
    return 'Write the caption of this photo: what it shows (equipment, room or condition), at most 12 words, like "Vista geral da cabine primária".';
  }
  const item = input.context.item_label ?? '(unnamed item)';
  // The seed's pt-BR name of the type ("Chave seccionadora"), the code itself when it has none.
  const block = input.context.block_type === null ? '(unknown equipment)' : blockTypeLabel(SEED_VERSION, input.context.block_type);
  return (
    `The checklist item "${item}" of the equipment "${block}" was marked non-conforming (NC). ` +
    'Write one observation sentence that describes the non-conformity this photo shows, like "Oxidação aparente na estrutura do equipamento.". ' +
    'If the photo does not show it, give an empty text.'
  );
}

// --- the call ---------------------------------------------------------------------

function imageBlock(image: OcrImage): ContentBlock {
  if (image.bytes.byteLength > BEDROCK_MAX_IMAGE_BYTES) {
    throw new PermanentReadingError(`bedrock: the image is ${image.bytes.byteLength} bytes, over the ${BEDROCK_MAX_IMAGE_BYTES} limit`);
  }
  return { image: { format: image.mime === 'image/png' ? 'png' : 'jpeg', source: { bytes: image.bytes } } };
}

/** Story 11.6: the structuring step (plate, panel) through Converse tool use on `modelId`. */
export function bedrockStructuringProvider(options: BedrockProviderOptions): StructuringProvider {
  assertPricedModel(options.modelId);
  return {
    async structure(input: StructuringInput): Promise<StructuringResult> {
      const plate = input as PlateStructuringInput;
      const groupKey = vectorGroupKeyOf(plate);
      const content: ContentBlock[] = [imageBlock(input.image), { text: structuringPrompt(plate) }];
      const answer = await converseTool(options, {
        modelId: options.modelId,
        system: STRUCTURING_SYSTEM,
        content,
        tool: { name: STRUCTURING_TOOL, description: 'Records the field values read on the photo, each citing the OCR word ids that spell it.', schema: structuringToolSchema(input.fields, groupKey) },
        maxTokens: STRUCTURING_MAX_TOKENS,
      });
      // e21f: the drawn diagram's facts become the group's value (or are dropped), then the uncited values go.
      // e21a (R-3): the fold's outcome is one log line.
      const fold = withVectorDiagram(answer.input, vectorGroupOf(plate), input.ocr.tokens);
      logVectorDiagram(fold, options.modelId);
      const parsed = structuringResultSchema.safeParse({ output: withoutUncitedValues(fold.input), model: options.modelId, prompt_version: BEDROCK_STRUCTURING_PROMPT_VERSION, usage: answer.usage });
      if (!parsed.success) throw new PermanentReadingError(`bedrock: ${options.modelId}: the tool input is not a StructuringOutput: ${parsed.error.message.slice(0, 300)}`);
      return parsed.data;
    },
  };
}

const proseToolInputSchema = z.object({ text: z.string().nullable() }).strict();

/** Story 11.6: the prose step (vision caption, NC draft) through Converse tool use on `modelId`; no OCR. */
export function bedrockProseProvider(options: BedrockProviderOptions): ProseProvider {
  assertPricedModel(options.modelId);
  return {
    async describe(input: ProseInput): Promise<ProseResult> {
      const answer = await converseTool(options, {
        modelId: options.modelId,
        system: PROSE_SYSTEM,
        content: [imageBlock(input.image), { text: prosePrompt(input) }],
        tool: { name: PROSE_TOOL, description: 'Records the one sentence written for the photo.', schema: PROSE_TOOL_SCHEMA },
        maxTokens: PROSE_MAX_TOKENS,
      });
      const tool = proseToolInputSchema.safeParse(answer.input);
      if (!tool.success) throw new PermanentReadingError(`bedrock: ${options.modelId}: the tool input is not {text}: ${tool.error.message.slice(0, 300)}`);
      const text = tool.data.text?.trim() ?? '';
      const parsed = proseResultSchema.safeParse({ output: text === '' ? null : { text }, model: options.modelId, prompt_version: BEDROCK_PROSE_PROMPT_VERSION, usage: answer.usage });
      if (!parsed.success) throw new PermanentReadingError(`bedrock: ${options.modelId}: not a ProseResult: ${parsed.error.message.slice(0, 300)}`);
      return parsed.data;
    },
  };
}
