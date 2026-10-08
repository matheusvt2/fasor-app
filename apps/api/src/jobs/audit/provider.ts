import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuditRef } from '@app/domain';
import { z } from 'zod';
import { DEFAULT_BEDROCK_MODEL_ID, type Config } from '../../config.ts';
import { assertPricedModel, BEDROCK_DEFAULT_REGION, bedrockClientSource, converseTool, type BedrockClientSource, type BedrockLike, type BedrockProviderOptions } from '../../ai/bedrock.ts';
import { AiFeaturesOffError, PermanentReadingError } from '../../ai/errors.ts';
import { AUDIT_MAX_TOKENS, AUDIT_PROMPT_VERSION, AUDIT_SYSTEM, AUDIT_TOOL, AUDIT_TOOL_DESCRIPTION, AUDIT_TOOL_SCHEMA, auditPrompt } from './prompt.ts';

/*
 * Story 13.8: the audit's one LLM call, chosen by env like the reading providers
 * (`jobs/reading/providers/index.ts`): `AI_FEATURES=off` refuses every call permanently
 * whatever `LLM_PROVIDER` says; `fake` (the default) answers the canned findings of
 * `fixtures/fake-audit.json` with no cloud call; `bedrock` sends the assembled text through
 * the AI provider base's Converse adapter (`apps/api/src/ai/bedrock.ts` `converseTool`, Claude
 * Haiku 4.5 by default), on the Bedrock client the reading uses when `main.ts` passes it. The
 * backend never uses a personal Claude subscription.
 *
 * The provider returns the model's raw findings list; the job keeps only the ones the kernel
 * validates against the refs it sent (`validateAuditFindings`).
 */

export interface AuditProviderInput {
  text: string;
  refs: readonly AuditRef[];
}

export interface AuditProviderResult {
  /** The tool's `findings`, unchecked: the job validates each one. */
  findings: unknown[];
  model: string;
  prompt_version: string;
  usage: { input_tokens: number; output_tokens: number; usd: number };
}

export interface AuditProvider {
  audit(input: AuditProviderInput): Promise<AuditProviderResult>;
}

export const FAKE_AUDIT_MODEL = 'fake';
export const FAKE_AUDIT_PROMPT_VERSION = 'fake-audit-1';
export const DEFAULT_AUDIT_FIXTURE = join(import.meta.dirname, 'fixtures', 'fake-audit.json');

const fakeAuditFixtureSchema = z.object({
  $comment: z.string().optional(),
  findings: z.array(z.object({ kind: z.string(), ref: z.string(), text: z.string() })),
});

/**
 * A fixture ref as a ref the run sent: `first-sheet`, `first-row` and `first-photo` name the
 * first of that sort in text order; anything else is a ref id as written. Null when the run
 * sent none (the finding is then skipped).
 */
export function resolveFakeSelector(selector: string, refs: readonly AuditRef[]): string | null {
  const firstWith = (prefix: string) => refs.find((ref) => ref.id.startsWith(prefix))?.id ?? null;
  switch (selector) {
    case 'first-sheet':
      return firstWith('sheet:');
    case 'first-row':
      return firstWith('row:');
    case 'first-photo':
      return firstWith('photo:');
    default:
      return refs.some((ref) => ref.id === selector) ? selector : null;
  }
}

/** The `fake` audit: the fixture's findings, their selectors resolved against the refs sent; no cloud call, no cost. */
export function fakeAuditProvider(fixturePath: string = DEFAULT_AUDIT_FIXTURE): AuditProvider {
  return {
    async audit(input) {
      const fixture = fakeAuditFixtureSchema.parse(JSON.parse(readFileSync(fixturePath, 'utf8')));
      const findings = fixture.findings.flatMap((finding) => {
        const ref = resolveFakeSelector(finding.ref, input.refs);
        return ref === null ? [] : [{ kind: finding.kind, ref, text: finding.text }];
      });
      return { findings, model: FAKE_AUDIT_MODEL, prompt_version: FAKE_AUDIT_PROMPT_VERSION, usage: { input_tokens: 0, output_tokens: 0, usd: 0 } };
    },
  };
}

/** The audit while `AI_FEATURES=off`: every call fails permanently, no provider is called. */
export function aiFeaturesOffAuditProvider(): AuditProvider {
  return {
    async audit() {
      throw new AiFeaturesOffError();
    },
  };
}

const toolInputSchema = z.object({ findings: z.array(z.unknown()) });

/** The `bedrock` audit: one Converse tool call on `modelId` with the versioned prompt. */
export function bedrockAuditProvider(options: BedrockProviderOptions): AuditProvider {
  assertPricedModel(options.modelId);
  return {
    async audit(input) {
      const answer = await converseTool(options, {
        modelId: options.modelId,
        system: AUDIT_SYSTEM,
        content: [{ text: auditPrompt(input.text) }],
        tool: { name: AUDIT_TOOL, description: AUDIT_TOOL_DESCRIPTION, schema: AUDIT_TOOL_SCHEMA },
        maxTokens: AUDIT_MAX_TOKENS,
      });
      const parsed = toolInputSchema.safeParse(answer.input);
      if (!parsed.success) throw new PermanentReadingError(`bedrock: ${options.modelId}: the audit tool input is not {findings: [...]}: ${parsed.error.message.slice(0, 300)}`);
      return { findings: parsed.data.findings, model: options.modelId, prompt_version: AUDIT_PROMPT_VERSION, usage: answer.usage };
    },
  };
}

export interface AuditProviderOptions {
  /** The fake's fixture; defaults to the committed `fixtures/fake-audit.json`. */
  fixturePath?: string;
  /**
   * An injected Bedrock Runtime client (tests; nothing then reaches AWS), its timeout and its
   * builder; `source` (review 2026-10-08, API-3) is the reading's client source, used as is.
   */
  bedrock?: { client?: BedrockLike; timeoutMs?: number; createClient?: (region: string) => BedrockLike; source?: BedrockClientSource };
}

/** The audit provider the env names; with AI features off none is built (and no model is checked). */
export function createAuditProvider(
  config: Pick<Config, 'LLM_PROVIDER'> & Partial<Pick<Config, 'AI_FEATURES' | 'BEDROCK_REGION' | 'BEDROCK_MODEL_ID'>>,
  options: AuditProviderOptions = {},
): AuditProvider {
  if (config.AI_FEATURES === 'off') return aiFeaturesOffAuditProvider();
  if (config.LLM_PROVIDER === 'fake') return fakeAuditProvider(options.fixturePath);
  const source =
    options.bedrock?.source ??
    bedrockClientSource({
      region: config.BEDROCK_REGION ?? BEDROCK_DEFAULT_REGION,
      ...(options.bedrock?.client === undefined ? {} : { client: options.bedrock.client }),
      ...(options.bedrock?.createClient === undefined ? {} : { createClient: options.bedrock.createClient }),
    });
  return bedrockAuditProvider({
    source,
    modelId: config.BEDROCK_MODEL_ID ?? DEFAULT_BEDROCK_MODEL_ID,
    ...(options.bedrock?.timeoutMs === undefined ? {} : { timeoutMs: options.bedrock.timeoutMs }),
  });
}
