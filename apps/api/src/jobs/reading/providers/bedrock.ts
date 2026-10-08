import type { ContentBlock } from '@aws-sdk/client-bedrock-runtime';
import {
  blockTypeLabel,
  proseResultSchema,
  SEED_VERSION,
  structuringResultSchema,
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
export const BEDROCK_STRUCTURING_PROMPT_VERSION = 'bedrock-structuring-2';

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
 */
export function structuringToolSchema(fields: readonly FieldDef[]): JsonSchema {
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

/** The structuring request's text: the fields, then the OCR words as `t<n>: text` lines, never their boxes. */
export function structuringPrompt(input: Pick<StructuringInput, 'ocr' | 'fields'>): string {
  const words = input.ocr.tokens.length === 0 ? '(no words)' : input.ocr.tokens.map((token) => `${token.id}: ${token.text}`).join('\n');
  return `Fields:\n${input.fields.map(fieldLine).join('\n')}\n\nOCR words:\n${words}`;
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

/**
 * The tool input without the values that cite no OCR token (`ocr_token_ids` missing, `null` or `[]`);
 * anything else, a malformed input included, is left for the schema to judge.
 */
export function withoutUncitedValues(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;
  const values = (input as { values?: unknown }).values;
  if (!Array.isArray(values)) return input;
  const cited = values.filter((value: unknown) => {
    if (typeof value !== 'object' || value === null) return true;
    const ids = (value as { ocr_token_ids?: unknown }).ocr_token_ids;
    return !(ids === undefined || ids === null || (Array.isArray(ids) && ids.length === 0));
  });
  return { ...input, values: cited };
}

/** Story 11.6: the structuring step (plate, panel) through Converse tool use on `modelId`. */
export function bedrockStructuringProvider(options: BedrockProviderOptions): StructuringProvider {
  assertPricedModel(options.modelId);
  return {
    async structure(input: StructuringInput): Promise<StructuringResult> {
      const content: ContentBlock[] = [imageBlock(input.image), { text: structuringPrompt(input) }];
      const answer = await converseTool(options, {
        modelId: options.modelId,
        system: STRUCTURING_SYSTEM,
        content,
        tool: { name: STRUCTURING_TOOL, description: 'Records the field values read on the photo, each citing the OCR word ids that spell it.', schema: structuringToolSchema(input.fields) },
        maxTokens: STRUCTURING_MAX_TOKENS,
      });
      const parsed = structuringResultSchema.safeParse({ output: withoutUncitedValues(answer.input), model: options.modelId, prompt_version: BEDROCK_STRUCTURING_PROMPT_VERSION, usage: answer.usage });
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
