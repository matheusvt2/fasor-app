import type { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { AUDIT_FINDING_KINDS, type AuditRef } from '@app/domain';
import { describe, expect, it } from 'vitest';
import { bedrockClientSource, usdFor, type BedrockConverseOutput, type BedrockLike } from '../../ai/bedrock.ts';
import { AiFeaturesOffError, isPermanentReadingError, ProviderError, ProviderRefusedError } from '../../ai/errors.ts';
import { createReadingProviders } from '../reading/providers/index.ts';
import { AUDIT_KIND_RULES, AUDIT_PROMPT_VERSION, AUDIT_SYSTEM, AUDIT_TOOL, AUDIT_TOOL_SCHEMA, auditPrompt } from './prompt.ts';
import { bedrockAuditProvider, createAuditProvider, fakeAuditProvider, FAKE_AUDIT_MODEL, resolveFakeSelector } from './provider.ts';

/*
 * Story 13.8: the audit's prompt, tool and providers, with no database and no cloud: the
 * prompt points and never rewrites, the tool's shape, the fake's selectors, a Bedrock call on
 * an injected client (its tokens and USD) and the permanent refusal with AI features off.
 */

const HAIKU = 'global.anthropic.claude-haiku-4-5-20251001-v1:0';
const BLOCK = '019966c1-0000-7000-8000-000000000012';
const PHOTO = '019966c1-0000-7000-8000-0000000000f1';

const refs: AuditRef[] = [
  { id: 'section:1', label: 'Seção 1 · Objetivo', target: { kind: 'section', rowKey: 'section_1' } },
  { id: 'section:10', label: 'Seção 10 · Conclusão e parecer', target: { kind: 'section', rowKey: 'section_10' } },
  { id: `photo:${PHOTO}`, label: 'Imagem 1', target: { kind: 'photos' } },
  { id: `sheet:${BLOCK}`, label: 'Chave seccionadora SEC-1', target: { kind: 'sheet', blockId: BLOCK } },
  { id: `row:${BLOCK}:2:3`, label: 'Chave seccionadora SEC-1 · Fase A', target: { kind: 'sheet', blockId: BLOCK } },
];

function fakeClient(respond: () => Promise<BedrockConverseOutput>): BedrockLike & { commands: ConverseCommand[] } {
  const commands: ConverseCommand[] = [];
  return {
    commands,
    async send(command) {
      commands.push(command);
      return respond();
    },
  };
}

const toolAnswer = (input: unknown): BedrockConverseOutput => ({
  output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 't1', name: AUDIT_TOOL, input: input as never } }] } },
  stopReason: 'tool_use',
  usage: { inputTokens: 9000, outputTokens: 300, totalTokens: 9300 },
});

describe('13.8-UNIT-010 the prompt and the tool', () => {
  it('is versioned', () => {
    expect(AUDIT_PROMPT_VERSION).toBe('audit-1');
  });

  it('names the four kinds and asks for one pt-BR sentence citing one given ref', () => {
    for (const kind of AUDIT_FINDING_KINDS) expect(AUDIT_SYSTEM).toContain(`- ${kind}: ${AUDIT_KIND_RULES[kind]}.`);
    expect(AUDIT_SYSTEM).toContain('Brazilian Portuguese (pt-BR)');
    expect(AUDIT_SYSTEM).toContain('cite only refs written in the report');
    expect(AUDIT_SYSTEM).toContain(`Call the ${AUDIT_TOOL} tool exactly once.`);
  });

  it('carries no instruction to rewrite, correct, suggest or propose text', () => {
    const words = `${AUDIT_SYSTEM}\n${auditPrompt('x')}\n${JSON.stringify(AUDIT_TOOL_SCHEMA)}`;
    expect(words).not.toMatch(/\b(rewrite|re-write|rephrase|correct|correction|fix|suggest|suggestion|propose|proposal|improve|replace|edit|amend|reword)\w*\b/i);
  });

  it('asks for {findings: [{kind, ref, text}]}, the kind one of the four', () => {
    const findings = (AUDIT_TOOL_SCHEMA.properties as Record<string, { items: { properties: Record<string, { enum?: string[] }>; required: string[] } }>).findings!;
    expect(AUDIT_TOOL_SCHEMA.required).toEqual(['findings']);
    expect(findings.items.required).toEqual(['kind', 'ref', 'text']);
    expect(findings.items.properties.kind?.enum).toEqual([...AUDIT_FINDING_KINDS]);
  });

  it('sends the assembled text and nothing else', () => {
    expect(auditPrompt('[section:1] 1 OBJETIVO')).toBe('The report:\n\n[section:1] 1 OBJETIVO');
  });
});

describe('13.8-UNIT-011 the fake audit', () => {
  it('resolves the fixture selectors against the refs sent', () => {
    expect(resolveFakeSelector('first-sheet', refs)).toBe(`sheet:${BLOCK}`);
    expect(resolveFakeSelector('first-row', refs)).toBe(`row:${BLOCK}:2:3`);
    expect(resolveFakeSelector('first-photo', refs)).toBe(`photo:${PHOTO}`);
    expect(resolveFakeSelector('section:10', refs)).toBe('section:10');
    expect(resolveFakeSelector('section:12', refs)).toBeNull();
    expect(resolveFakeSelector('first-photo', refs.filter((ref) => !ref.id.startsWith('photo:')))).toBeNull();
  });

  it('answers one finding per kind with no cloud call and no cost; a selector with no match is skipped', async () => {
    const answer = await fakeAuditProvider().audit({ text: 'x', refs });
    expect(answer.model).toBe(FAKE_AUDIT_MODEL);
    expect(answer.usage).toEqual({ input_tokens: 0, output_tokens: 0, usd: 0 });
    expect((answer.findings as { kind: string }[]).map((finding) => finding.kind)).toEqual([...AUDIT_FINDING_KINDS]);
    expect((answer.findings as { ref: string }[]).map((finding) => finding.ref)).toEqual([`sheet:${BLOCK}`, `row:${BLOCK}:2:3`, 'section:10', `photo:${PHOTO}`]);
    const noPhoto = await fakeAuditProvider().audit({ text: 'x', refs: refs.filter((ref) => !ref.id.startsWith('photo:')) });
    expect((noPhoto.findings as { kind: string }[]).map((finding) => finding.kind)).toEqual(['conclusion_vs_nc', 'reading_out_of_family', 'parecer_vs_restricoes']);
  });

  it('is what LLM_PROVIDER=fake builds', async () => {
    const answer = await createAuditProvider({ LLM_PROVIDER: 'fake', AI_FEATURES: 'on' }).audit({ text: 'x', refs });
    expect(answer.model).toBe(FAKE_AUDIT_MODEL);
  });
});

describe('13.8-UNIT-012 the Bedrock audit on an injected client', () => {
  it('makes one Converse tool call with the prompt and returns the findings, the model, the prompt version, the tokens and the USD', async () => {
    const client = fakeClient(async () => toolAnswer({ findings: [{ kind: 'parecer_vs_restricoes', ref: 'section:10', text: 'O parecer não cita a restrição.' }] }));
    const provider = bedrockAuditProvider({ source: bedrockClientSource({ region: 'us-east-1', client }), modelId: HAIKU });
    const answer = await provider.audit({ text: '[section:10] 10 CONCLUSÃO E PARECER', refs });
    expect(client.commands).toHaveLength(1);
    const input = client.commands[0]!.input;
    expect(input.modelId).toBe(HAIKU);
    expect(input.system).toEqual([{ text: AUDIT_SYSTEM }]);
    expect(input.messages).toEqual([{ role: 'user', content: [{ text: auditPrompt('[section:10] 10 CONCLUSÃO E PARECER') }] }]);
    expect(input.toolConfig?.toolChoice).toEqual({ tool: { name: AUDIT_TOOL } });
    expect(answer).toEqual({
      findings: [{ kind: 'parecer_vs_restricoes', ref: 'section:10', text: 'O parecer não cita a restrição.' }],
      model: HAIKU,
      prompt_version: AUDIT_PROMPT_VERSION,
      usage: { input_tokens: 9000, output_tokens: 300, usd: usdFor(HAIKU, { input_tokens: 9000, output_tokens: 300 }) },
    });
    // About one US cent for a full 48k-character input on Haiku 4.5.
    expect(answer.usage.usd).toBeCloseTo(0.0105, 6);
  });

  it('fails permanently on a tool input that is not {findings: [...]}', async () => {
    const client = fakeClient(async () => toolAnswer({ text: 'nada' }));
    const provider = bedrockAuditProvider({ source: bedrockClientSource({ region: 'us-east-1', client }), modelId: HAIKU });
    const error = await provider.audit({ text: 'x', refs }).catch((caught: unknown) => caught);
    expect(isPermanentReadingError(error)).toBe(true);
  });

  it('passes a transient Bedrock failure as a provider error (the job fails the run; nothing retries)', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('slow down'), { name: 'ThrottlingException', $fault: 'client' });
    });
    const provider = bedrockAuditProvider({ source: bedrockClientSource({ region: 'us-east-1', client }), modelId: HAIKU });
    await expect(provider.audit({ text: 'x', refs })).rejects.toBeInstanceOf(ProviderError);
  });

  it('API-V2: a denied call is a refusal, which the job records as provider_refused, not invalid_output', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('explicit deny'), { name: 'AccessDeniedException', $fault: 'client' });
    });
    const provider = bedrockAuditProvider({ source: bedrockClientSource({ region: 'us-east-1', client }), modelId: HAIKU });
    await expect(provider.audit({ text: 'x', refs })).rejects.toBeInstanceOf(ProviderRefusedError);
  });

  it('a credential hiccup is transient', async () => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('Could not load credentials from any providers'), { name: 'CredentialsProviderError' });
    });
    const provider = bedrockAuditProvider({ source: bedrockClientSource({ region: 'us-east-1', client }), modelId: HAIKU });
    const error = await provider.audit({ text: 'x', refs }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderError);
    expect(isPermanentReadingError(error)).toBe(false);
  });
});

describe('API-3 (review 2026-10-08) one Bedrock client per process', () => {
  it('the reading providers and the audit given one source build one client, on the first call', async () => {
    const client = fakeClient(async () => toolAnswer({ findings: [] }));
    let built = 0;
    const source = bedrockClientSource({
      region: 'us-east-1',
      createClient: () => {
        built += 1;
        return client;
      },
    });
    const config = { LLM_PROVIDER: 'bedrock', OCR_PROVIDER: 'fake', OCR_SERVICE_URL: 'http://ocr:8000', AI_FEATURES: 'on' } as const;
    const reading = createReadingProviders(config, { bedrock: { source } });
    const audit = createAuditProvider(config, { bedrock: { source } });
    expect(built).toBe(0);
    await audit.audit({ text: 'x', refs });
    const providers = reading({ photo_sha256: 'e'.repeat(64), reading_kind: 'caption', block_type: null, table_key: null });
    await providers.prose.describe({ image: { bytes: new Uint8Array([1]), mime: 'image/jpeg' }, kind: 'caption', context: { block_type: null, item_label: null } }).catch(() => undefined);
    expect(built).toBe(1);
    expect(client.commands.length).toBeGreaterThanOrEqual(2);
  });
});

describe('13.8-UNIT-013 AI features off', () => {
  it('refuses permanently whatever LLM_PROVIDER says, and builds no Bedrock client', async () => {
    for (const LLM_PROVIDER of ['fake', 'bedrock'] as const) {
      const provider = createAuditProvider(
        { LLM_PROVIDER, AI_FEATURES: 'off' },
        {
          bedrock: {
            createClient: () => {
              throw new Error('no client may be built');
            },
          },
        },
      );
      const error = await provider.audit({ text: 'x', refs }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AiFeaturesOffError);
      expect(isPermanentReadingError(error)).toBe(true);
    }
  });
});
