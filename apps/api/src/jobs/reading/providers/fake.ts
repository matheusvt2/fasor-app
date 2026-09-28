import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ocrReadResultSchema,
  structuringOutputSchema,
  type OcrProvider,
  type OcrReadResult,
  type StructuringProvider,
  type StructuringResult,
} from '@app/domain';
import sharp from 'sharp';
import { z } from 'zod';
import { PermanentReadingError, ProviderError, ProviderTimeoutError } from './errors.ts';

/*
 * Story 8.4 (AD-27): the `fake` OCR and structuring providers replay a fixture keyed by the
 * photo's sha256 (`fixtures/<sha256>.json`, see its README), so every test and the local
 * stack read a plate without a model or a cloud account. `outcome: error` throws a transient
 * provider error and `timeout` a transient `ProviderTimeoutError`, both at once (never
 * sleeping).
 *
 * E78-Q2: the device re-encodes every shot, so a plate taken through the app never has the
 * sha256 of a committed image. A photo without its own fixture falls back to the default
 * fixture of its target block type (`DEFAULT_FIXTURE_BY_BLOCK_TYPE`: the synthetic plate for
 * `transformador_forca`), its OCR boxes scaled to the size of the image the job sends; a photo
 * of any other type without a fixture fails permanently, at its first attempt.
 */

export const DEFAULT_FIXTURES_DIR = join(import.meta.dirname, '..', 'fixtures');
export const FAKE_MODEL = 'fake';
export const FAKE_PROMPT_VERSION = 'fake-1';

export const fakeReadingFixtureSchema = z
  .object({
    outcome: z.enum(['ok', 'error', 'timeout']).default('ok'),
    ocr: ocrReadResultSchema.optional(),
    structuring: structuringOutputSchema.optional(),
  })
  .strict();
export type FakeReadingFixture = z.infer<typeof fakeReadingFixtureSchema>;

const SHA256 = /^[0-9a-f]{64}$/;

/** E78-Q2: the fixture a photo of this target block type replays when it has none of its own. */
export const DEFAULT_FIXTURE_BY_BLOCK_TYPE: Readonly<Partial<Record<string, string>>> = {
  // The synthetic transformer plate (`services/ocr/tests/fixtures/plate-transformador.jpg`).
  transformador_forca: 'a1eac9106f186a29ca82e896741922794eda7f86a231c4dcf942031d14dc26ac',
};

/** The fixture of one photo; a missing or malformed fixture is permanent (no retry adds a file). */
export async function loadFakeFixture(dir: string, sha256: string): Promise<FakeReadingFixture> {
  const found = await readFakeFixture(dir, sha256);
  if (found === null) throw new PermanentReadingError(`fake reading: no fixture for ${sha256}`);
  return found;
}

/** A fixture file, or null when there is none; a malformed key or fixture is permanent. */
async function readFakeFixture(dir: string, sha256: string): Promise<FakeReadingFixture | null> {
  if (!SHA256.test(sha256)) throw new PermanentReadingError(`fake reading: "${sha256}" is not a sha256`);
  let text: string;
  try {
    text = await readFile(join(dir, `${sha256}.json`), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new PermanentReadingError(`fake reading: fixture ${sha256} is not JSON`);
  }
  const parsed = fakeReadingFixtureSchema.safeParse(raw);
  if (!parsed.success) throw new PermanentReadingError(`fake reading: fixture ${sha256} is invalid: ${parsed.error.message}`);
  return parsed.data;
}

export interface ResolvedFakeFixture {
  fixture: FakeReadingFixture;
  /** The sha256 the fixture file is named after. */
  key: string;
  /** True when it is the block type's default fixture (E78-Q2): its OCR is scaled to the image read. */
  fallback: boolean;
}

/**
 * The photo's own fixture, else the default fixture of its target block type, else a
 * permanent failure naming both (E78-Q2).
 */
export async function resolveFakeFixture(dir: string, sha256: string, blockType: string | null): Promise<ResolvedFakeFixture> {
  const own = await readFakeFixture(dir, sha256);
  if (own !== null) return { fixture: own, key: sha256, fallback: false };
  const key = blockType === null ? undefined : DEFAULT_FIXTURE_BY_BLOCK_TYPE[blockType];
  if (key === undefined) throw new PermanentReadingError(`fake reading: no fixture for ${sha256} and no fixture for block type ${blockType ?? '(none)'}`);
  const fallback = await readFakeFixture(dir, key);
  if (fallback === null) throw new PermanentReadingError(`fake reading: no fixture for ${sha256}, and the default fixture ${key} of block type ${blockType} is missing`);
  return { fixture: fallback, key, fallback: true };
}

/** An OCR read replayed on an image of another size: every box scaled to it (E78-Q2). */
export function scaleOcrRead(ocr: OcrReadResult, image: { width: number; height: number }): OcrReadResult {
  const sx = image.width / ocr.image.width;
  const sy = image.height / ocr.image.height;
  const fit = (n: number, max: number) => Math.min(max, Math.max(0, Math.round(n * 1000) / 1000));
  return {
    ...ocr,
    image: { width: image.width, height: image.height },
    tokens: ocr.tokens.map((token) => {
      const [x0, y0, x1, y1] = token.bbox;
      return { ...token, bbox: [fit(x0 * sx, image.width), fit(y0 * sy, image.height), fit(x1 * sx, image.width), fit(y1 * sy, image.height)] };
    }),
  };
}

function failFor(fixture: FakeReadingFixture, sha256: string, step: string): void {
  if (fixture.outcome === 'error') throw new ProviderError(`fake ${step}: fixture ${sha256} declares outcome error`);
  if (fixture.outcome === 'timeout') throw new ProviderTimeoutError(`fake ${step}: fixture ${sha256} declares outcome timeout`);
}

export function fakeOcrProvider(dir: string, sha256: string, blockType: string | null = null): OcrProvider {
  return {
    async read(input): Promise<OcrReadResult> {
      const { fixture, key, fallback } = await resolveFakeFixture(dir, sha256, blockType);
      failFor(fixture, key, 'ocr');
      if (fixture.ocr === undefined) throw new PermanentReadingError(`fake ocr: fixture ${key} has no ocr`);
      if (!fallback) return fixture.ocr;
      // The default fixture replays on a photo of any size: its boxes follow the image read.
      let size: { width: number; height: number };
      try {
        const metadata = await sharp(input.bytes).metadata();
        size = { width: metadata.width, height: metadata.height };
      } catch (error) {
        throw new PermanentReadingError('fake ocr: the image cannot be decoded', { cause: error });
      }
      return scaleOcrRead(fixture.ocr, size);
    },
  };
}

export function fakeStructuringProvider(dir: string, sha256: string, blockType: string | null = null): StructuringProvider {
  return {
    async structure(): Promise<StructuringResult> {
      const { fixture, key } = await resolveFakeFixture(dir, sha256, blockType);
      failFor(fixture, key, 'structuring');
      return {
        output: fixture.structuring ?? { values: [] },
        model: FAKE_MODEL,
        prompt_version: FAKE_PROMPT_VERSION,
        usage: { input_tokens: 0, output_tokens: 0, usd: 0 },
      };
    },
  };
}
