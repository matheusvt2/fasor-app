import { BedrockRuntimeClient, ConverseCommand, type ContentBlock, type ConverseCommandOutput, type ToolUseBlock } from '@aws-sdk/client-bedrock-runtime';
import { callWithTimeout, classifyAwsError } from './aws.ts';
import { PermanentReadingError } from './errors.ts';

/*
 * Story 11.6, moved here by the review of 2026-10-08 (C4, API-3): the Bedrock Converse client
 * layer every LLM call of the api goes through: the reading's structuring and prose providers
 * (`jobs/reading/providers/bedrock.ts`) and the emission audit (`jobs/audit/provider.ts`). One
 * lazily built client per process (`bedrockClientSource`, shared by the reading and the audit),
 * SDK retries off (`maxAttempts: 1`, pg-boss retries), credentials only from the AWS SDK default
 * chain, list-price USD per call, and the failure classification and timeout of `aws.ts`.
 */

export const BEDROCK_DEFAULT_REGION = 'us-east-1';

/** How long one Converse call may take before the attempt fails with `ProviderTimeoutError`. */
export const BEDROCK_TIMEOUT_MS = 60_000;

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


export type JsonSchema = Record<string, unknown>;

/** Bedrock's model-side client faults that pass on a later attempt (a model not ready yet, a model-side error or timeout). */
const BEDROCK_TRANSIENT_ERRORS: ReadonlySet<string> = new Set(['ModelNotReadyException', 'ModelErrorException', 'ModelTimeoutException']);

/** How a failed `send` is classified (the matrix of Story 11.6, credentials and refusals as `classifyAwsError`). */
export function classifyBedrockError(error: unknown): Error {
  return classifyAwsError('bedrock', error, { transient: BEDROCK_TRANSIENT_ERRORS });
}

/** One Converse tool call: the reading's providers and the emission audit (Story 13.8) make theirs through it. */
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
  const output = await callWithTimeout(`bedrock: ${call.modelId}`, timeoutMs, (abortSignal) => client.send(command, { abortSignal }), classifyBedrockError);
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
