import { describe, expect, it } from 'vitest';
import { AiFeaturesOffError, isPermanentReadingError } from './errors.ts';
import { createReadingProviders } from './index.ts';

/*
 * Story 11.8 follow-up: with AI_FEATURES=off the structuring and prose slots never reach the
 * provider LLM_PROVIDER names (here `fake`); each call fails permanently, so a job queued
 * before the flag flipped ends `failed` without a retry.
 */

const ctx = { photo_sha256: 'f'.repeat(64), reading_kind: 'plate' as const, block_type: 'transformador_forca', table_key: null };
const base = { OCR_PROVIDER: 'fake', LLM_PROVIDER: 'fake', OCR_SERVICE_URL: 'http://127.0.0.1:9' } as const;

describe('createReadingProviders with AI_FEATURES=off', () => {
  it('fails the structuring and prose steps permanently, naming the flag', async () => {
    const providers = createReadingProviders({ ...base, AI_FEATURES: 'off' })(ctx);
    const structuring = providers.structuring.structure({} as never);
    await expect(structuring).rejects.toBeInstanceOf(AiFeaturesOffError);
    await structuring.catch((error: unknown) => {
      expect(isPermanentReadingError(error)).toBe(true);
      expect(String(error)).toContain('AI_FEATURES=off');
    });
    await expect(providers.prose.describe({} as never)).rejects.toBeInstanceOf(AiFeaturesOffError);
    // OCR stays on the configured provider.
    expect(providers.ocr_name).toBe('fake');
  });

  it('keeps the configured LLM provider when on or unset', async () => {
    for (const config of [base, { ...base, AI_FEATURES: 'on' as const }]) {
      const providers = createReadingProviders(config)(ctx);
      const outcome = await providers.structuring.structure({} as never).then(
        () => null,
        (error: unknown) => error,
      );
      expect(outcome).not.toBeInstanceOf(AiFeaturesOffError);
    }
  });
});
