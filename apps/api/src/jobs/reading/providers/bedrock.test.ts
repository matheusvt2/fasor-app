import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AccessDeniedException,
  InternalServerException,
  ModelNotReadyException,
  ResourceNotFoundException,
  ServiceUnavailableException,
  ThrottlingException,
  ValidationException,
  type ContentBlock,
  type ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  buildReadingSuggestions,
  getDefinition,
  ocrReadResultSchema,
  PANEL_FIELDS,
  SEED_VERSION,
  structuringOutputSchema,
  type BlockRow,
  type OcrImage,
  type StructuringInput,
} from '@app/domain';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_FIXTURES_DIR } from './fake.ts';
import {
  BEDROCK_MAX_IMAGE_BYTES,
  BEDROCK_PRICES,
  BEDROCK_PROSE_PROMPT_VERSION,
  BEDROCK_STRUCTURING_PROMPT_VERSION,
  bedrockClientSource,
  bedrockProseProvider,
  bedrockStructuringProvider,
  usdFor,
  type BedrockConverseOutput,
  type BedrockLike,
} from './bedrock.ts';
import { isPermanentReadingError, PermanentReadingError, ProviderError, ProviderRefusedError, ProviderTimeoutError } from './errors.ts';

/*
 * Story 11.6: the `bedrock` provider on hand-built Converse answers through an injected
 * client, one test per row of the story's I/O matrix. No test here builds a real
 * `BedrockRuntimeClient`: every provider gets a fake client, and `createClient` throws.
 * The plate input is the committed fake fixture of the synthetic transformer plate (its OCR
 * read and its structured values), so the values are the ones `build.test.ts` checks.
 */

const PLATE_SHA = 'a1eac9106f186a29ca82e896741922794eda7f86a231c4dcf942031d14dc26ac';
const PANEL_SHA = '36f3fca92f329117f736195e6bcdcae60ba683a82a7d3dcd0aff154b158d3d51';
const fixture = (sha: string) => JSON.parse(readFileSync(join(DEFAULT_FIXTURES_DIR, `${sha}.json`), 'utf8')) as { ocr: unknown; structuring: unknown };
const plate = fixture(PLATE_SHA);
const plateOcr = ocrReadResultSchema.parse(plate.ocr);
const plateValues = structuringOutputSchema.parse(plate.structuring);
const panel = fixture(PANEL_SHA);
const panelOcr = ocrReadResultSchema.parse(panel.ocr);
const panelValues = structuringOutputSchema.parse(panel.structuring);
const plateFields = [...getDefinition(SEED_VERSION, 'cabine_primaria', 'transformador_forca').nameplate];

const HAIKU = 'global.anthropic.claude-haiku-4-5-20251001-v1:0';
const NOVA_LITE = 'global.amazon.nova-2-lite-v1:0';
const image: OcrImage = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), mime: 'image/jpeg' };
const plateInput: StructuringInput = { image, ocr: plateOcr, fields: plateFields };

interface FakeClient extends BedrockLike {
  commands: ConverseCommand[];
}

function fakeClient(respond: (signal: AbortSignal | undefined) => Promise<BedrockConverseOutput>): FakeClient {
  const commands: ConverseCommand[] = [];
  return {
    commands,
    async send(command, options) {
      commands.push(command);
      return respond(options?.abortSignal);
    },
  };
}

const usage = { inputTokens: 1800, outputTokens: 400, totalTokens: 2200 };

/** A Converse answer whose message holds these blocks. */
const answer = (content: ContentBlock[], stopReason: BedrockConverseOutput['stopReason'] = 'tool_use'): BedrockConverseOutput => ({
  output: { message: { role: 'assistant', content } },
  stopReason,
  usage,
});
const toolUse = (name: string, input: unknown): ContentBlock => ({ toolUse: { toolUseId: 'tooluse-1', name, input: input as never } });
const replying = (content: ContentBlock[], stopReason?: BedrockConverseOutput['stopReason']) => fakeClient(async () => answer(content, stopReason));
const failingWith = (error: unknown) =>
  fakeClient(async () => {
    throw error;
  });

const noRealClient = () => {
  throw new Error('a real BedrockRuntimeClient was built');
};
const source = (client: BedrockLike) => bedrockClientSource({ region: 'us-east-1', client, createClient: noRealClient });
const structurer = (client: BedrockLike, modelId = HAIKU, timeoutMs?: number) =>
  bedrockStructuringProvider({ source: source(client), modelId, ...(timeoutMs === undefined ? {} : { timeoutMs }) });
const proser = (client: BedrockLike, modelId = HAIKU) => bedrockProseProvider({ source: source(client), modelId });

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a failure');
}

describe('11.6 Bedrock structuring: the plate happy path', () => {
  it('sends the image bytes, the token list and the forced tool, and returns the StructuringResult with usage and USD', async () => {
    const client = replying([{ text: 'Reading the plate.' }, toolUse('record_values', plateValues)]);
    const result = await structurer(client).structure(plateInput);

    expect(result.output).toEqual(plateValues);
    expect(result.model).toBe(HAIKU);
    expect(result.prompt_version).toBe(BEDROCK_STRUCTURING_PROMPT_VERSION);
    expect(result.usage).toEqual({ input_tokens: 1800, output_tokens: 400, usd: (1800 * 1.0 + 400 * 5.0) / 1e6 });

    expect(client.commands).toHaveLength(1);
    const request = client.commands[0]!.input;
    expect(request.modelId).toBe(HAIKU);
    const content = request.messages![0]!.content!;
    expect(content[0]!.image).toEqual({ format: 'jpeg', source: { bytes: image.bytes } });
    const text = content[1]!.text!;
    // Every OCR word as a `t<n>: text` line, and never a coordinate.
    for (const token of plateOcr.tokens) expect(text).toContain(`${token.id}: ${token.text}`);
    expect(text).toContain('t4: TR-01');
    expect(text).not.toMatch(/bbox|\[\s*\d+(\.\d+)?\s*,/);
    expect(text.split('\n').filter((line) => /^t\d+: /.test(line))).toEqual(plateOcr.tokens.map((token) => `${token.id}: ${token.text}`));
    for (const field of plateFields) expect(text).toContain(`- ${field.key} (${field.kind}`);
    expect(text).toContain('options: ');
    // The tool is forced and its schema is derived from the fields.
    const tools = request.toolConfig!;
    expect(tools.toolChoice).toEqual({ tool: { name: 'record_values' } });
    const spec = tools.tools![0]!.toolSpec!;
    expect(spec.name).toBe('record_values');
    const schema = spec.inputSchema!.json as { properties: { values: { items: { properties: { key: { enum: string[] }; value: { anyOf: unknown[] } }; required: string[] } } } };
    const item = schema.properties.values.items;
    expect(item.properties.key.enum).toEqual(plateFields.map((field) => field.key));
    expect(item.properties.value.anyOf).toHaveLength(2);
    expect(item.required).toEqual(['key', 'value', 'ocr_token_ids', 'confidence']);
    expect(request.inferenceConfig).toMatchObject({ temperature: 0 });
  });

  it('reads the panel front with the panel fields: a string-only value schema', async () => {
    const client = replying([toolUse('record_values', panelValues)]);
    const result = await structurer(client, NOVA_LITE).structure({ image: { ...image, mime: 'image/png' }, ocr: panelOcr, fields: [...PANEL_FIELDS] });
    expect(result.output).toEqual(panelValues);
    expect(result.usage.usd).toBe((1800 * 0.3 + 400 * 2.5) / 1e6);
    const request = client.commands[0]!.input;
    expect(request.messages![0]!.content![0]!.image!.format).toBe('png');
    const schema = request.toolConfig!.tools![0]!.toolSpec!.inputSchema!.json as { properties: { values: { items: { properties: { key: { enum: string[] }; value: { type: string } } } } } };
    expect(schema.properties.values.items.properties.key.enum).toEqual(['block_type', 'column']);
    expect(schema.properties.values.items.properties.value.type).toBe('string');
    expect(request.messages![0]!.content![1]!.text).toContain('options: cabos_entrada | para_raio | chave_seccionadora');
  });
});

describe('11.6 Bedrock structuring: unknown token or key', () => {
  it('passes t999 and an unknown key through; buildReadingSuggestions drops them', async () => {
    const values = [
      { key: 'identificacao', value: 'TR-01', ocr_token_ids: ['t999'], confidence: 0.9 },
      { key: 'corrente_nominal', value: 'X', ocr_token_ids: ['t4'], confidence: 0.9 },
      { key: 'n_serie', value: '240815-07', ocr_token_ids: ['t9'], confidence: 0.9 },
    ];
    const result = await structurer(replying([toolUse('record_values', { values })])).structure(plateInput);
    expect(result.output.values).toEqual(values);
    const uuid = (n: number) => `019966b0-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
    let next = 100;
    const built = buildReadingSuggestions({
      relatorioId: uuid(1),
      photoId: uuid(2),
      runId: uuid(3),
      block: { id: uuid(4), seed_version: SEED_VERSION, block_type: 'transformador_forca', sheet: { nameplate: {}, checklist: {}, test: {} } as unknown as BlockRow['sheet'] },
      ocr: plateOcr,
      image: plateOcr.image,
      output: result.output,
      promptVersion: result.prompt_version,
      registry: { manufacturers: [], voltageClasses: [] },
      newId: () => uuid(next++),
    });
    expect(built.dropped).toEqual(
      expect.arrayContaining([
        { key: 'corrente_nominal', reason: 'unknown_key' },
        { key: 'identificacao', reason: 'unknown_token' },
      ]),
    );
    expect(built.rows.map((row) => row.target_path.split('/').at(-1))).toEqual(['n_serie']);
    expect(built.rows[0]!.prompt_version).toBe(BEDROCK_STRUCTURING_PROMPT_VERSION);
  });
});

describe('11.6 Bedrock structuring: uncited values are dropped (Matheus, 2026-10-05)', () => {
  it('one cited and one uncited value: the StructuringResult keeps only the cited one', async () => {
    const cited = { key: 'column', value: 'C09', ocr_token_ids: ['t0'], confidence: 0.9 };
    const values = [cited, { key: 'block_type', value: 'chave_seccionadora', ocr_token_ids: [], confidence: 0.8 }];
    const result = await structurer(replying([toolUse('record_values', { values })])).structure({ image, ocr: panelOcr, fields: [...PANEL_FIELDS] });
    expect(result.output).toEqual({ values: [cited] });
    expect(result.usage.input_tokens).toBe(1800);
  });

  it('a value with no ocr_token_ids at all is dropped the same way', async () => {
    const cited = { key: 'tipo', value: 'TSE-500/15', ocr_token_ids: ['t11'], confidence: 0.9 };
    const result = await structurer(replying([toolUse('record_values', { values: [{ key: 'identificacao', value: 'TR-01', confidence: 0.9 }, cited] })])).structure(plateInput);
    expect(result.output).toEqual({ values: [cited] });
  });

  it('a value whose ocr_token_ids is null is dropped the same way (independent review, 2026-10-06)', async () => {
    const cited = { key: 'tipo', value: 'TSE-500/15', ocr_token_ids: ['t11'], confidence: 0.9 };
    const result = await structurer(replying([toolUse('record_values', { values: [{ key: 'identificacao', value: 'TR-01', ocr_token_ids: null, confidence: 0.9 }, cited] })])).structure(plateInput);
    expect(result.output).toEqual({ values: [cited] });
  });

  it('a reading whose only value is uncited is values: [], not an error', async () => {
    const result = await structurer(replying([toolUse('record_values', { values: [{ key: 'block_type', value: 'chave_seccionadora', ocr_token_ids: [], confidence: 0.8 }] })])).structure({
      image,
      ocr: panelOcr,
      fields: [...PANEL_FIELDS],
    });
    expect(result.output).toEqual({ values: [] });
    expect(result.model).toBe(HAIKU);
  });
});

describe('11.6 Bedrock: no tool_use or invalid JSON is permanent', () => {
  const cases: [string, ContentBlock[]][] = [
    ['a text-only reply', [{ text: 'I cannot read this plate.' }]],
    ['another tool', [toolUse('other_tool', { values: [] })]],
    ['values missing', [toolUse('record_values', { fields: [] })]],
    ['an extra property', [toolUse('record_values', { values: [{ key: 'tipo', value: 'X', ocr_token_ids: ['t11'], confidence: 0.5, bbox: [0, 0, 1, 1] }] })]],
    ['a citation that is not an id list', [toolUse('record_values', { values: [{ key: 'tipo', value: 'X', ocr_token_ids: 't11', confidence: 0.5 }] })]],
    ['a key twice', [toolUse('record_values', { values: [{ key: 'tipo', value: 'X', ocr_token_ids: ['t11'], confidence: 0.5 }, { key: 'tipo', value: 'Y', ocr_token_ids: ['t11'], confidence: 0.5 }] })]],
    ['a string for the whole input', [toolUse('record_values', '{"values": []}')]],
  ];
  for (const [name, content] of cases) {
    it(`${name}: PermanentReadingError`, async () => {
      const error = await failure(structurer(replying(content)).structure(plateInput));
      expect(error).toBeInstanceOf(PermanentReadingError);
      expect(isPermanentReadingError(error)).toBe(true);
    });
  }

  it('a prose reply without its tool is permanent too', async () => {
    const error = await failure(proser(replying([{ text: 'Vista geral.' }], 'end_turn')).describe({ image, kind: 'caption', context: { block_type: null, item_label: null } }));
    expect(error).toBeInstanceOf(PermanentReadingError);
    expect((error as Error).message).toContain('end_turn');
  });
});

describe('AIR-1 and AIR-V1 (review 2026-10-08): the structuring prompt', () => {
  it('asks for dates exactly as precise as printed and spells out the pt-BR separators; its version is 2', async () => {
    expect(BEDROCK_STRUCTURING_PROMPT_VERSION).toBe('bedrock-structuring-2');
    const client = replying([toolUse('record_values', plateValues)]);
    await structurer(client).structure(plateInput);
    const system = client.commands[0]!.input.system![0]!.text!;
    expect(system).toContain('YYYY for a year alone');
    expect(system).toContain('never add a month or a day');
    expect(system).not.toContain('- date: YYYY-MM or YYYY-MM-DD.');
    expect(system).toContain('"13.800" is 13800 and "1,5" is 1.5');
  });
});

describe('11.6 Bedrock: throttling, 5xx and timeout are transient', () => {
  const transient: [string, unknown][] = [
    ['ThrottlingException', new ThrottlingException({ $metadata: {}, message: 'Too many tokens' })],
    ['ServiceUnavailableException', new ServiceUnavailableException({ $metadata: {}, message: 'unavailable' })],
    ['InternalServerException', new InternalServerException({ $metadata: {}, message: 'boom' })],
    ['ModelNotReadyException', new ModelNotReadyException({ $metadata: {}, message: 'warming up' })],
    ['a network error', Object.assign(new Error('socket hang up'), { name: 'Error', code: 'ECONNRESET' })],
    // Independent review 2026-10-06: a credential hiccup (the task role's endpoint, a token the SDK renews) passes on a later attempt.
    ['CredentialsProviderError', Object.assign(new Error('Could not load credentials from any providers'), { name: 'CredentialsProviderError' })],
    ['ExpiredTokenException', Object.assign(new Error('The security token included in the request is expired'), { name: 'ExpiredTokenException', $fault: 'client' })],
  ];
  for (const [name, thrown] of transient) {
    it(`${name} is transient`, async () => {
      const error = await failure(structurer(failingWith(thrown)).structure(plateInput));
      expect(error).toBeInstanceOf(ProviderError);
      expect(isPermanentReadingError(error)).toBe(false);
      expect((error as Error).message).toContain('bedrock');
    });
  }

  it('no answer within the timeout aborts the call: ProviderTimeoutError', async () => {
    const seen: (AbortSignal | undefined)[] = [];
    const client = fakeClient(
      (signal) =>
        new Promise((_, reject) => {
          seen.push(signal);
          signal?.addEventListener('abort', () => reject(Object.assign(new Error('Request aborted'), { name: 'AbortError' })));
        }),
    );
    const error = await failure(structurer(client, HAIKU, 20).structure(plateInput));
    expect(error).toBeInstanceOf(ProviderTimeoutError);
    expect(isPermanentReadingError(error)).toBe(false);
    expect(seen[0]?.aborted).toBe(true);
  });
});

describe('11.6 Bedrock: access denied and a bad model id are permanent', () => {
  const permanent: [string, unknown][] = [
    ['AccessDeniedException', new AccessDeniedException({ $metadata: {}, message: 'explicit deny' })],
    ['ValidationException', new ValidationException({ $metadata: {}, message: 'The provided model identifier is invalid.' })],
    ['ResourceNotFoundException', new ResourceNotFoundException({ $metadata: {}, message: 'model not found' })],
    ['an unlisted client fault', Object.assign(new Error('signature'), { name: 'SignatureDoesNotMatch', $fault: 'client' })],
  ];
  for (const [name, thrown] of permanent) {
    it(`${name} is permanent and names the AWS error`, async () => {
      const error = await failure(structurer(failingWith(thrown)).structure(plateInput));
      expect(error).toBeInstanceOf(PermanentReadingError);
      // API-V2 (review 2026-10-08): a denied or misconfigured call is a refusal, not a bad answer.
      expect(error).toBeInstanceOf(ProviderRefusedError);
      expect((error as Error).message).toContain((thrown as Error).name);
    });
  }

  it('an image over the Converse limit is never sent', async () => {
    const client = replying([toolUse('record_values', plateValues)]);
    const big: OcrImage = { bytes: new Uint8Array(BEDROCK_MAX_IMAGE_BYTES + 1), mime: 'image/jpeg' };
    expect(await failure(structurer(client).structure({ ...plateInput, image: big }))).toBeInstanceOf(PermanentReadingError);
    expect(client.commands).toHaveLength(0);
  });

  it('a model without a list price is refused when the provider is built', () => {
    expect(() => bedrockStructuringProvider({ source: source(replying([])), modelId: 'anthropic.claude-unknown' })).toThrow(/no list price/);
    expect(() => bedrockProseProvider({ source: source(replying([])), modelId: 'anthropic.claude-unknown' })).toThrow(/no list price/);
  });
});

describe('11.6 Bedrock prose: caption and NC draft', () => {
  it('a caption is one pt-BR sentence from the image alone, with usage and USD', async () => {
    const client = replying([toolUse('record_text', { text: '  Vista geral da cabine primária ' })]);
    const result = await proser(client).describe({ image, kind: 'caption', context: { block_type: null, item_label: null } });
    expect(result).toEqual({
      output: { text: 'Vista geral da cabine primária' },
      model: HAIKU,
      prompt_version: BEDROCK_PROSE_PROMPT_VERSION,
      usage: { input_tokens: 1800, output_tokens: 400, usd: 0.0038 },
    });
    const request = client.commands[0]!.input;
    expect(request.messages![0]!.content![0]!.image!.source).toEqual({ bytes: image.bytes });
    expect(request.toolConfig!.toolChoice).toEqual({ tool: { name: 'record_text' } });
    expect(request.messages![0]!.content![1]!.text).toContain('caption');
  });

  it('an NC draft names the checklist item and the block type by its pt-BR name', async () => {
    const client = replying([toolUse('record_text', { text: 'Oxidação aparente na estrutura do equipamento.' })]);
    const result = await proser(client, NOVA_LITE).describe({ image, kind: 'nc_obs', context: { block_type: 'chave_seccionadora', item_label: 'ESTRUTURA' } });
    expect(result.output).toEqual({ text: 'Oxidação aparente na estrutura do equipamento.' });
    expect(result.model).toBe(NOVA_LITE);
    const text = client.commands[0]!.input.messages![0]!.content![1]!.text!;
    expect(text).toContain('"ESTRUTURA"');
    expect(text).toContain('"Chave seccionadora"');
    expect(text).not.toContain('chave_seccionadora');
  });

  it('a block type the seed does not name is sent as its code', async () => {
    const client = replying([toolUse('record_text', { text: 'x' })]);
    await proser(client).describe({ image, kind: 'nc_obs', context: { block_type: 'tipo_desconhecido', item_label: 'ESTRUTURA' } });
    expect(client.commands[0]!.input.messages![0]!.content![1]!.text).toContain('"tipo_desconhecido"');
  });

  it('an empty or null text is null: nothing applies', async () => {
    for (const text of ['', '   ', null]) {
      const result = await proser(replying([toolUse('record_text', { text })])).describe({ image, kind: 'caption', context: { block_type: null, item_label: null } });
      expect(result.output).toBeNull();
    }
  });

  it('a prose tool input of another shape is permanent', async () => {
    const error = await failure(proser(replying([toolUse('record_text', { caption: 'x' })])).describe({ image, kind: 'caption', context: { block_type: null, item_label: null } }));
    expect(error).toBeInstanceOf(PermanentReadingError);
  });
});

describe('11.6 Bedrock prices and the client', () => {
  it('prices every candidate and the escalation model at the 2026-10-05 list prices', () => {
    for (const model of [HAIKU, 'us.amazon.nova-pro-v1:0', NOVA_LITE, 'qwen.qwen3-vl-235b-a22b', 'mistral.mistral-large-3-675b-instruct']) {
      expect(BEDROCK_PRICES[model]).toBeDefined();
    }
    expect(usdFor(HAIKU, { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(6);
    expect(usdFor('mistral.mistral-large-3-675b-instruct', { input_tokens: 2000, output_tokens: 100 })).toBe(0.00115);
    expect(() => usdFor('unknown', { input_tokens: 1, output_tokens: 1 })).toThrow(/no price/);
  });

  it('builds the real client lazily, once, for the region, and never when one is injected', async () => {
    const client = replying([toolUse('record_values', plateValues)]);
    const createClient = vi.fn((): BedrockLike => client);
    const shared = bedrockClientSource({ region: 'us-west-2', createClient });
    const structuring = bedrockStructuringProvider({ source: shared, modelId: HAIKU });
    const prose = bedrockProseProvider({ source: shared, modelId: HAIKU });
    expect(createClient).not.toHaveBeenCalled();
    await structuring.structure(plateInput);
    await failure(prose.describe({ image, kind: 'caption', context: { block_type: null, item_label: null } }));
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith('us-west-2');
    expect(client.commands).toHaveLength(2);
  });
});
