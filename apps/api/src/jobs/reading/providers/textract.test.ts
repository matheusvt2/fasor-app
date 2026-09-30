import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  AccessDeniedException,
  BadDocumentException,
  DocumentTooLargeException,
  InternalServerError,
  InvalidParameterException,
  InvalidS3ObjectException,
  LimitExceededException,
  ProvisionedThroughputExceededException,
  ThrottlingException,
  UnsupportedDocumentException,
  type Block,
  type DetectDocumentTextCommand,
} from '@aws-sdk/client-textract';
import { ocrReadResultSchema, type OcrImage } from '@app/domain';
import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { isPermanentReadingError, PermanentReadingError, ProviderError, ProviderTimeoutError } from './errors.ts';
import { TEXTRACT_MAX_BYTES, textractProvider, textractTokens, type TextractLike } from './textract.ts';

/*
 * Story 11.7: the `textract` provider on hand-built `DetectDocumentText` answers
 * (`fixtures/textract/`, see its README) through an injected client. No test here builds a
 * real `TextractClient`: every provider gets a fake `client`, and a `createClient` spy proves
 * the real one is built lazily, once, and never when a client is injected.
 */

const repoRoot = resolve(import.meta.dirname, '../../../../../..');
const FIXTURES = join(import.meta.dirname, 'fixtures', 'textract');
const PLATE_JPG = join(repoRoot, 'services/ocr/tests/fixtures/plate-transformador.jpg');
const PLATE_TOKENS = join(repoRoot, 'services/ocr/tests/fixtures/plate-transformador.tokens.json');

const answer = (name: string): { Blocks: Block[] } => JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'));

interface FakeClient extends TextractLike {
  commands: DetectDocumentTextCommand[];
}

function fakeClient(respond: (signal: AbortSignal | undefined) => Promise<{ Blocks?: Block[] }>): FakeClient {
  const commands: DetectDocumentTextCommand[] = [];
  return {
    commands,
    async send(command, options) {
      commands.push(command);
      return respond(options?.abortSignal);
    },
  };
}

const replying = (name: string) => fakeClient(async () => answer(name));
const failingWith = (error: unknown) =>
  fakeClient(async () => {
    throw error;
  });

const noRealClient = () => {
  throw new Error('a real TextractClient was built');
};

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a failure');
}

let wide: OcrImage;
let plate: OcrImage;

beforeAll(async () => {
  wide = { bytes: new Uint8Array(await sharp({ create: { width: 1000, height: 500, channels: 3, background: { r: 240, g: 240, b: 240 } } }).png().toBuffer()), mime: 'image/png' };
  plate = { bytes: new Uint8Array(readFileSync(PLATE_JPG)), mime: 'image/jpeg' };
});

const read = (client: TextractLike, image: OcrImage) => textractProvider({ client, region: 'us-east-1', createClient: noRealClient }).read(image);

describe('11.7 Textract WORD blocks to contract tokens', () => {
  it('sends only Document.Bytes, the image bytes as received', async () => {
    const client = replying('empty');
    await read(client, wide);
    expect(client.commands).toHaveLength(1);
    const input = client.commands[0]!.input;
    expect(Object.keys(input)).toEqual(['Document']);
    expect(Object.keys(input.Document!)).toEqual(['Bytes']);
    expect(input.Document!.Bytes).toBe(wide.bytes);
  });

  it('the synthetic plate round trip: texts, order and pixel boxes within 1 px of the expected tokens', async () => {
    const expected = JSON.parse(readFileSync(PLATE_TOKENS, 'utf8')) as { image: { width: number; height: number }; tokens: { text: string; bbox: number[] }[] };
    const result = await read(replying('plate-upright'), plate);
    expect(ocrReadResultSchema.safeParse(result).success).toBe(true);
    expect(result.image).toEqual(expected.image);
    expect(result.preprocessing_applied).toBe(false);
    expect(result.tokens.map((token) => token.text)).toEqual(expected.tokens.map((token) => token.text));
    expect(result.tokens.map((token) => token.id)).toEqual(expected.tokens.map((_, index) => `t${index}`));
    result.tokens.forEach((token, index) => {
      token.bbox.forEach((value, corner) => expect(Math.abs(value - expected.tokens[index]!.bbox[corner]!)).toBeLessThanOrEqual(1));
      expect(token.confidence).toBeGreaterThanOrEqual(0.95);
      expect(token.confidence).toBeLessThanOrEqual(0.99);
    });
  });

  it('upright boxes scale as floor(Left*W), floor(Top*H), ceil((Left+Width)*W), ceil((Top+Height)*H)', () => {
    const tokens = textractTokens(answer('skewed').Blocks, 1000, 500);
    expect(tokens).toEqual([
      { id: 't0', text: 'TR-01', bbox: [100, 50, 300, 100], confidence: 0.995 },
      { id: 't1', text: 'SECCIONADORA', bbox: [345, 40, 746, 101], confidence: 0.8825 },
    ]);
  });

  const rotations: [string, number[][]][] = [
    ['rotated-90', [[600, 50, 650, 150], [600, 200, 650, 450], [300, 50, 350, 100], [300, 120, 350, 170]]],
    ['rotated-180', [[600, 350, 900, 400], [100, 350, 500, 400], [700, 100, 800, 150], [500, 100, 600, 150]]],
    ['rotated-270', [[300, 300, 350, 450], [300, 50, 350, 250], [600, 350, 650, 450], [600, 200, 650, 300]]],
  ];
  for (const [name, boxes] of rotations) {
    it(`${name}: boxes from BoundingBox in the received grid, order from LINE and CHILD, never a geometric sort`, async () => {
      const result = await read(replying(name), wide);
      expect(result.image).toEqual({ width: 1000, height: 500 });
      expect(result.tokens.map((token) => [token.id, token.text])).toEqual([
        ['t0', 'TR-01'],
        ['t1', 'SECCIONADORA'],
        ['t2', '15'],
        ['t3', 'kV'],
      ]);
      expect(result.tokens.map((token) => token.bbox)).toEqual(boxes);
      expect(result.tokens.map((token) => token.confidence)).toEqual([0.98, 0.97, 0.96, 0.95]);
    });
  }

  it('a small skew: the Polygon is ignored, the BoundingBox is the box', async () => {
    const result = await read(replying('skewed'), wide);
    expect(result.tokens[0]!.bbox).toEqual([100, 50, 300, 100]);
  });

  it('off-edge boxes clamp; empty, boxless and zero-area words drop; orphans follow in block order; ids stay contiguous', async () => {
    const result = await read(replying('edge-and-degenerate'), wide);
    expect(ocrReadResultSchema.safeParse(result).success).toBe(true);
    expect(result.tokens).toEqual([
      { id: 't0', text: 'BORDA', bbox: [0, 50, 150, 100], confidence: 0.875 },
      { id: 't1', text: 'FIM', bbox: [900, 475, 1000, 500], confidence: 0.91 },
      { id: 't2', text: 'ORFA', bbox: [500, 250, 600, 300], confidence: 0.9 },
      { id: 't3', text: 'SOLTA', bbox: [200, 400, 300, 450], confidence: 1 },
    ]);
  });

  it('no text: only a PAGE block reads no token', async () => {
    const result = await read(replying('empty'), wide);
    expect(result).toEqual({ image: { width: 1000, height: 500 }, tokens: [], preprocessing_applied: false });
  });

  it('an answer without Blocks reads no token', async () => {
    expect((await read(fakeClient(async () => ({})), wide)).tokens).toEqual([]);
  });
});

describe('11.7 Textract failures', () => {
  it('bytes over the 10 MiB synchronous limit are never sent: permanent', async () => {
    const client = replying('empty');
    const big = { bytes: new Uint8Array(TEXTRACT_MAX_BYTES + 1), mime: 'image/jpeg' as const };
    const error = await failure(read(client, big));
    expect(error).toBeInstanceOf(PermanentReadingError);
    expect(client.commands).toHaveLength(0);
  });

  it('bytes that do not decode are never sent: permanent', async () => {
    const client = replying('empty');
    const error = await failure(read(client, { bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' }));
    expect(error).toBeInstanceOf(PermanentReadingError);
    expect(client.commands).toHaveLength(0);
  });

  const meta = { $metadata: {}, message: 'refused' };
  const credentials = Object.assign(new Error('Could not load credentials from any providers'), { name: 'CredentialsProviderError' });
  const permanent: [string, unknown][] = [
    ['InvalidParameterException', new InvalidParameterException(meta)],
    ['UnsupportedDocumentException', new UnsupportedDocumentException(meta)],
    ['BadDocumentException', new BadDocumentException(meta)],
    ['DocumentTooLargeException', new DocumentTooLargeException(meta)],
    ['AccessDeniedException', new AccessDeniedException(meta)],
    ['InvalidS3ObjectException', new InvalidS3ObjectException(meta)],
    ['CredentialsProviderError', credentials],
  ];
  for (const [name, thrown] of permanent) {
    it(`${name} is permanent and named`, async () => {
      const error = await failure(read(failingWith(thrown), wide));
      expect(error).toBeInstanceOf(PermanentReadingError);
      expect(isPermanentReadingError(error)).toBe(true);
      expect((error as Error).message).toContain(name);
    });
  }

  const serverFault = Object.assign(new Error('boom'), { name: 'SomethingNew', $fault: 'server' });
  const network = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
  const transient: [string, unknown][] = [
    ['ThrottlingException', new ThrottlingException(meta)],
    ['ProvisionedThroughputExceededException', new ProvisionedThroughputExceededException(meta)],
    ['LimitExceededException', new LimitExceededException(meta)],
    ['InternalServerError', new InternalServerError(meta)],
    ['a server fault', serverFault],
    ['a network error', network],
  ];
  for (const [name, thrown] of transient) {
    it(`${name} is transient`, async () => {
      const error = await failure(read(failingWith(thrown), wide));
      expect(error).toBeInstanceOf(ProviderError);
      expect(isPermanentReadingError(error)).toBe(false);
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
    const error = await failure(textractProvider({ client, region: 'us-east-1', timeoutMs: 20, createClient: noRealClient }).read(wide));
    expect(error).toBeInstanceOf(ProviderTimeoutError);
    expect(seen[0]?.aborted).toBe(true);
  });
});

describe('11.7 one client per process, built lazily', () => {
  it('without an injected client, the real one is built on the first read, once, for the region', async () => {
    const client = replying('empty');
    const createClient = vi.fn((): TextractLike => client);
    const provider = textractProvider({ region: 'us-east-1', createClient });
    expect(createClient).not.toHaveBeenCalled();
    await provider.read(wide);
    await provider.read(wide);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith('us-east-1');
    expect(client.commands).toHaveLength(2);
  });
});
