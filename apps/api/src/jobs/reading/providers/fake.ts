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
import { z } from 'zod';
import { PermanentReadingError, ProviderError, ProviderTimeoutError } from './errors.ts';

/*
 * Story 8.4 (AD-27): the `fake` OCR and structuring providers replay a fixture keyed by the
 * photo's sha256 (`fixtures/<sha256>.json`, see its README), so every test and the local
 * stack read a plate without a model or a cloud account. `outcome: error` throws a transient
 * provider error and `timeout` a transient `ProviderTimeoutError`, both at once (never
 * sleeping); a photo without a fixture fails permanently.
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

/** The fixture of one photo; a missing or malformed fixture is permanent (no retry adds a file). */
export async function loadFakeFixture(dir: string, sha256: string): Promise<FakeReadingFixture> {
  if (!SHA256.test(sha256)) throw new PermanentReadingError(`fake reading: "${sha256}" is not a sha256`);
  let text: string;
  try {
    text = await readFile(join(dir, `${sha256}.json`), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new PermanentReadingError(`fake reading: no fixture for ${sha256}`);
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

function failFor(fixture: FakeReadingFixture, sha256: string, step: string): void {
  if (fixture.outcome === 'error') throw new ProviderError(`fake ${step}: fixture ${sha256} declares outcome error`);
  if (fixture.outcome === 'timeout') throw new ProviderTimeoutError(`fake ${step}: fixture ${sha256} declares outcome timeout`);
}

export function fakeOcrProvider(dir: string, sha256: string): OcrProvider {
  return {
    async read(): Promise<OcrReadResult> {
      const fixture = await loadFakeFixture(dir, sha256);
      failFor(fixture, sha256, 'ocr');
      if (fixture.ocr === undefined) throw new PermanentReadingError(`fake ocr: fixture ${sha256} has no ocr`);
      return fixture.ocr;
    },
  };
}

export function fakeStructuringProvider(dir: string, sha256: string): StructuringProvider {
  return {
    async structure(): Promise<StructuringResult> {
      const fixture = await loadFakeFixture(dir, sha256);
      failFor(fixture, sha256, 'structuring');
      return {
        output: fixture.structuring ?? { values: [] },
        model: FAKE_MODEL,
        prompt_version: FAKE_PROMPT_VERSION,
        usage: { input_tokens: 0, output_tokens: 0, usd: 0 },
      };
    },
  };
}
