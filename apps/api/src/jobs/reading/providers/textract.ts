import { DetectDocumentTextCommand, TextractClient, type Block, type DetectDocumentTextCommandOutput } from '@aws-sdk/client-textract';
import { ocrReadResultSchema, type OcrImage, type OcrProvider, type OcrReadResult, type OcrToken } from '@app/domain';
import sharp from 'sharp';
import { PermanentReadingError, ProviderError, ProviderTimeoutError } from './errors.ts';

/*
 * Story 11.7: the `textract` OCR provider, Amazon Textract `DetectDocumentText` (synchronous,
 * image bytes in the request, no S3). Textract has no `sa-east-1` endpoint, so the region is
 * `TEXTRACT_REGION` (default `us-east-1`). The account's AI services opt-out policy (no
 * content kept to train AWS models) is attached by `infra/bootstrap/organization.tf`; this
 * code never recreates it. Credentials come only from the AWS SDK default provider chain
 * (the env session of `aws configure export-credentials --profile fasor-app` locally, the
 * instance role on AWS); nothing here reads or stores a key.
 *
 * One client per process: the factory builds this provider once and the provider builds its
 * client lazily on the first read. SDK retries are off (`maxAttempts: 1`): pg-boss retries a
 * transient failure as a new attempt. WORD blocks become tokens in LINE order then CHILD
 * order (orphan WORDs after, in block order), their boxes the axis-aligned `BoundingBox`
 * (never the rotated `Polygon`) scaled into the pixel grid of the bytes sent.
 */

/** Textract's synchronous request limit on document bytes. */
export const TEXTRACT_MAX_BYTES = 10 * 1024 * 1024;

/** How long one call may take before the attempt fails with `ProviderTimeoutError`. */
export const TEXTRACT_TIMEOUT_MS = 30_000;

export const TEXTRACT_DEFAULT_REGION = 'us-east-1';

/** The one method of `TextractClient` the provider uses; tests inject a fake. */
export interface TextractLike {
  send(command: DetectDocumentTextCommand, options?: { abortSignal?: AbortSignal }): Promise<Pick<DetectDocumentTextCommandOutput, 'Blocks'>>;
}

export interface TextractProviderOptions {
  /** An injected client (tests); when absent one is built on the first read. */
  client?: TextractLike;
  region: string;
  /** Defaults to `TEXTRACT_TIMEOUT_MS`. */
  timeoutMs?: number;
  /** How the real client is built; injectable so a test can prove it is built once, lazily, or never. */
  createClient?: (region: string) => TextractLike;
}

export function createTextractClient(region: string): TextractLike {
  return new TextractClient({ region, maxAttempts: 1 });
}

/** Client faults no retry fixes: the request, the document or the caller's rights are wrong. */
const PERMANENT_ERRORS = new Set([
  'InvalidParameterException',
  'UnsupportedDocumentException',
  'BadDocumentException',
  'DocumentTooLargeException',
  'AccessDeniedException',
  'InvalidS3ObjectException',
  'CredentialsProviderError',
  'UnrecognizedClientException',
  'ExpiredTokenException',
  'InvalidSignatureException',
  'ValidationException',
]);

/** Client faults that are throttles or limits: a later attempt may pass. */
const THROTTLE_ERRORS = new Set(['ThrottlingException', 'ProvisionedThroughputExceededException', 'LimitExceededException']);

/** A pixel coordinate of a normalized one; the rounding drops float noise before floor/ceil. */
function pixel(normalized: number, size: number, round: (n: number) => number): number {
  const value = round(Math.round(normalized * size * 1e6) / 1e6);
  return Math.min(size, Math.max(0, value));
}

function token(block: Block, width: number, height: number): Omit<OcrToken, 'id'> | null {
  const text = block.Text?.trim() ?? '';
  const box = block.Geometry?.BoundingBox;
  if (text === '' || box === undefined) return null;
  const { Left, Top, Width, Height } = box;
  if (Left === undefined || Top === undefined || Width === undefined || Height === undefined) return null;
  const x0 = pixel(Left, width, Math.floor);
  const y0 = pixel(Top, height, Math.floor);
  const x1 = pixel(Left + Width, width, Math.ceil);
  const y1 = pixel(Top + Height, height, Math.ceil);
  if (x0 >= x1 || y0 >= y1) return null;
  const raw = block.Confidence;
  const confidence = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(1, Math.max(0, raw / 100)) : 0;
  return { text, bbox: [x0, y0, x1, y1], confidence };
}

/**
 * The contract tokens of a `DetectDocumentText` answer read on a `width` x `height` image:
 * one per WORD, in LINE order then CHILD order, orphan WORDs after; a WORD without text,
 * without a box or of zero area once clamped is dropped and the ids stay contiguous.
 */
export function textractTokens(blocks: readonly Block[], width: number, height: number): OcrToken[] {
  const words = new Map<string, Block>();
  for (const block of blocks) if (block.BlockType === 'WORD' && block.Id !== undefined) words.set(block.Id, block);
  const ordered: Block[] = [];
  const placed = new Set<Block>();
  for (const line of blocks) {
    if (line.BlockType !== 'LINE') continue;
    for (const relationship of line.Relationships ?? []) {
      if (relationship.Type !== 'CHILD') continue;
      for (const id of relationship.Ids ?? []) {
        const word = words.get(id);
        if (word === undefined || placed.has(word)) continue;
        placed.add(word);
        ordered.push(word);
      }
    }
  }
  for (const block of blocks) {
    if (block.BlockType === 'WORD' && !placed.has(block)) {
      placed.add(block);
      ordered.push(block);
    }
  }
  const tokens: OcrToken[] = [];
  for (const word of ordered) {
    const found = token(word, width, height);
    if (found !== null) tokens.push({ id: `t${tokens.length}`, ...found });
  }
  return tokens;
}

/** How a failed `send` is classified (the matrix of Story 11.7). */
export function classifyTextractError(error: unknown): Error {
  const name = error instanceof Error ? error.name : 'UnknownError';
  const message = error instanceof Error ? error.message : String(error);
  const fault = (error as { $fault?: unknown } | null)?.$fault;
  const retryable = (error as { $retryable?: unknown } | null)?.$retryable;
  if (PERMANENT_ERRORS.has(name)) return new PermanentReadingError(`textract: ${name}: ${message}`, { cause: error });
  // Any other client fault (a signature mismatch, a new validation error) is permanent too,
  // unless the SDK marks it retryable or it is a throttle or limit.
  if (fault === 'client' && !retryable && !THROTTLE_ERRORS.has(name)) return new PermanentReadingError(`textract: ${name}: ${message}`, { cause: error });
  // Throttling, quota, any `$fault: 'server'`, a dropped connection and anything else are
  // transient: pg-boss tries again.
  return new ProviderError(`textract: ${name}: ${message}`, { cause: error });
}

export function textractProvider(options: TextractProviderOptions): OcrProvider {
  const timeoutMs = options.timeoutMs ?? TEXTRACT_TIMEOUT_MS;
  const createClient = options.createClient ?? createTextractClient;
  let client: TextractLike | undefined = options.client;
  return {
    // The read mode chooses nothing here: the factory routes display readings to `ocr-svc`.
    async read(image: OcrImage): Promise<OcrReadResult> {
      if (image.bytes.byteLength > TEXTRACT_MAX_BYTES) {
        throw new PermanentReadingError(`textract: the image is ${image.bytes.byteLength} bytes, over the ${TEXTRACT_MAX_BYTES} limit`);
      }
      let size: { width: number; height: number };
      try {
        const metadata = await sharp(image.bytes).metadata();
        size = { width: metadata.width, height: metadata.height };
      } catch (error) {
        throw new PermanentReadingError('textract: the image cannot be decoded', { cause: error });
      }
      client ??= createClient(options.region);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let output: Pick<DetectDocumentTextCommandOutput, 'Blocks'>;
      try {
        output = await client.send(new DetectDocumentTextCommand({ Document: { Bytes: image.bytes } }), { abortSignal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) throw new ProviderTimeoutError(`textract: no answer within ${timeoutMs} ms`);
        throw classifyTextractError(error);
      } finally {
        clearTimeout(timer);
      }
      const result = { image: size, tokens: textractTokens(output.Blocks ?? [], size.width, size.height), preprocessing_applied: false };
      const parsed = ocrReadResultSchema.safeParse(result);
      // The mapping is deterministic: the same answer fails the same way on every attempt.
      if (!parsed.success) throw new PermanentReadingError(`textract: the mapped read is not an OcrReadResult: ${parsed.error.message.slice(0, 300)}`);
      return parsed.data;
    },
  };
}
