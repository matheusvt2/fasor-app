import { BedrockRuntimeClient, ConverseCommand, type ContentBlock, type ConverseCommandOutput, type ToolUseBlock } from '@aws-sdk/client-bedrock-runtime';
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
import { PermanentReadingError, ProviderError, ProviderTimeoutError } from './errors.ts';

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
 * schema refuses (once the uncited values are dropped) is permanent (the same request fails the same way); throttling, 5xx and a
 * timeout are transient; a denied model, a bad model id or a malformed request are permanent.
 */

/** The prompt of the structuring step; bump it with every change of the prompt or the tool schema. */
export const BEDROCK_STRUCTURING_PROMPT_VERSION = 'bedrock-structuring-1';

/** The prompt of the prose step (caption, NC draft); bump it with every change of the prompt or the tool schema. */
export const BEDROCK_PROSE_PROMPT_VERSION = 'bedrock-prose-1';

export const BEDROCK_DEFAULT_REGION = 'us-east-1';

/** How long one Converse call may take before the attempt fails with `ProviderTimeoutError`. */
export const BEDROCK_TIMEOUT_MS = 60_000;

/** Converse's limit on one image's bytes; the print variant (at most 2000 px, JPEG) stays far below it. */
export const BEDROCK_MAX_IMAGE_BYTES = 3_750_000;

const STRUCTURING_TOOL = 'record_values';
const PROSE_TOOL = 'record_text';
const STRUCTURING_MAX_TOKENS = 2048;
const PROSE_MAX_TOKENS = 400;

/**
 * List prices on 2026-10-05 in us-east-1, standard tier, USD per million tokens, by the model or
 * inference-profile id sent (a geo `us.` profile costs 10 % more than the `global.` one). The
 * Story 11.6 candidates and the escalation model; a model missing here is refused at boot.
 */
export const BEDROCK_PRICES: Readonly<Record<string, { input: number; output: number }>> = {
  'global.anthropic.claude-haiku-4-5-20251001-v1:0': { input: 1.0, output: 5.0 },
  'us.anthropic.claude-haiku-4-5-20251001-v1:0': { input: 1.1, output: 5.5 },
  'us.amazon.nova-pro-v1:0': { input: 0.8, output: 3.2 },
  'amazon.nova-pro-v1:0': { input: 0.8, output: 3.2 },
  'global.amazon.nova-2-lite-v1:0': { input: 0.3, output: 2.5 },
  'us.amazon.nova-2-lite-v1:0': { input: 0.33, output: 2.75 },
  'qwen.qwen3-vl-235b-a22b': { input: 0.53, output: 2.66 },
  'mistral.mistral-large-3-675b-instruct': { input: 0.5, output: 1.5 },
};

/** The USD of one call at list price, to the micro-dollar; throws on a model with no price. */
export function usdFor(modelId: string, usage: { input_tokens: number; output_tokens: number }): number {
  const price = BEDROCK_PRICES[modelId];
  if (price === undefined) throw new Error(`bedrock: no price for model "${modelId}" (BEDROCK_PRICES)`);
  return Math.round(usage.input_tokens * price.input + usage.output_tokens * price.output) / 1e6;
}

/** Refuses a model id the price table does not hold, so a misconfigured model fails at boot, not per reading. */
export function assertPricedModel(modelId: string): void {
  if (BEDROCK_PRICES[modelId] === undefined) {
    throw new Error(`bedrock: model "${modelId}" has no list price in BEDROCK_PRICES; add it before configuring it`);
  }
}

/** What the adapter reads of a Converse answer. */
export type BedrockConverseOutput = Pick<ConverseCommandOutput, 'output' | 'stopReason' | 'usage'>;

/** The one method of `BedrockRuntimeClient` the adapter uses; tests inject a fake. */
export interface BedrockLike {
  send(command: ConverseCommand, options?: { abortSignal?: AbortSignal }): Promise<BedrockConverseOutput>;
}

export function createBedrockClient(region: string): BedrockLike {
  return new BedrockRuntimeClient({ region, maxAttempts: 1 });
}

export interface BedrockClientSource {
  /** The client, built on the first call. */
  client(): BedrockLike;
}

/** One lazily built client shared by every provider of a factory (one per process). */
export function bedrockClientSource(options: { region: string; client?: BedrockLike; createClient?: (region: string) => BedrockLike }): BedrockClientSource {
  let client: BedrockLike | undefined = options.client;
  const create = options.createClient ?? createBedrockClient;
  return {
    client() {
      client ??= create(options.region);
      return client;
    },
  };
}

export interface BedrockProviderOptions {
  source: BedrockClientSource;
  modelId: string;
  /** Defaults to `BEDROCK_TIMEOUT_MS`. */
  timeoutMs?: number;
}

// --- tool schemas -----------------------------------------------------------------

type JsonSchema = Record<string, unknown>;

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
  '- date: YYYY-MM or YYYY-MM-DD.',
  '- voltage_class: the voltage as printed, for example "15 kV".',
  '- number: an object {"raw": the number with a dot as decimal separator and no thousands separator, "unit": the unit as printed or null, "state": "measured"}.',
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

/** Client faults no retry fixes: the request, the model id or the caller's rights are wrong. */
const PERMANENT_ERRORS = new Set([
  'AccessDeniedException',
  'ValidationException',
  'ResourceNotFoundException',
  'UnrecognizedClientException',
  'InvalidSignatureException',
]);

/** Client faults that are throttles, quotas or a model not ready yet: a later attempt may pass. */
// A credential fetch or refresh that fails (the ECS task role's endpoint, an expiring token the SDK renews) passes on a later attempt.
const TRANSIENT_CLIENT_ERRORS = new Set(['ExpiredTokenException', 'ThrottlingException', 'ServiceQuotaExceededException', 'ModelNotReadyException', 'ModelErrorException', 'ModelTimeoutException']);

/** How a failed `send` is classified (the matrix of Story 11.6). */
export function classifyBedrockError(error: unknown): Error {
  const name = error instanceof Error ? error.name : 'UnknownError';
  const message = error instanceof Error ? error.message : String(error);
  const fault = (error as { $fault?: unknown } | null)?.$fault;
  const retryable = (error as { $retryable?: unknown } | null)?.$retryable;
  if (PERMANENT_ERRORS.has(name)) return new PermanentReadingError(`bedrock: ${name}: ${message}`, { cause: error });
  // Any other client fault is permanent too, unless the SDK marks it retryable or it is a throttle.
  if (fault === 'client' && !retryable && !TRANSIENT_CLIENT_ERRORS.has(name)) return new PermanentReadingError(`bedrock: ${name}: ${message}`, { cause: error });
  // Throttling, ServiceUnavailable, InternalServer, any `$fault: 'server'`, a dropped connection: pg-boss tries again.
  return new ProviderError(`bedrock: ${name}: ${message}`, { cause: error });
}

function imageBlock(image: OcrImage): ContentBlock {
  if (image.bytes.byteLength > BEDROCK_MAX_IMAGE_BYTES) {
    throw new PermanentReadingError(`bedrock: the image is ${image.bytes.byteLength} bytes, over the ${BEDROCK_MAX_IMAGE_BYTES} limit`);
  }
  return { image: { format: image.mime === 'image/png' ? 'png' : 'jpeg', source: { bytes: image.bytes } } };
}

/** Story 13.8: exported so the emission audit (`jobs/audit/provider.ts`) makes its one call through the same adapter. */
export interface ConverseCall {
  modelId: string;
  system: string;
  content: ContentBlock[];
  tool: { name: string; description: string; schema: JsonSchema };
  maxTokens: number;
}

interface ToolAnswer {
  input: unknown;
  usage: { input_tokens: number; output_tokens: number; usd: number };
}

export async function converseTool(options: BedrockProviderOptions, call: ConverseCall): Promise<ToolAnswer> {
  const timeoutMs = options.timeoutMs ?? BEDROCK_TIMEOUT_MS;
  const client = options.source.client();
  const command = new ConverseCommand({
    modelId: call.modelId,
    system: [{ text: call.system }],
    messages: [{ role: 'user', content: call.content }],
    toolConfig: {
      tools: [{ toolSpec: { name: call.tool.name, description: call.tool.description, inputSchema: { json: call.tool.schema as never } } }],
      toolChoice: { tool: { name: call.tool.name } },
    },
    inferenceConfig: { maxTokens: call.maxTokens, temperature: 0 },
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let output: BedrockConverseOutput;
  try {
    output = await client.send(command, { abortSignal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new ProviderTimeoutError(`bedrock: ${call.modelId}: no answer within ${timeoutMs} ms`);
    throw classifyBedrockError(error);
  } finally {
    clearTimeout(timer);
  }
  const input_tokens = output.usage?.inputTokens ?? 0;
  const output_tokens = output.usage?.outputTokens ?? 0;
  const usage = { input_tokens, output_tokens, usd: usdFor(call.modelId, { input_tokens, output_tokens }) };
  const blocks = output.output?.message?.content ?? [];
  const toolUse = blocks.map((block) => block.toolUse).find((use): use is ToolUseBlock => use !== undefined && use.name === call.tool.name);
  // The same request answers the same way: a reply without the tool call is permanent.
  if (toolUse === undefined) {
    throw new PermanentReadingError(`bedrock: ${call.modelId} answered without calling ${call.tool.name} (stop reason ${output.stopReason ?? 'none'})`);
  }
  return { input: toolUse.input, usage };
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
