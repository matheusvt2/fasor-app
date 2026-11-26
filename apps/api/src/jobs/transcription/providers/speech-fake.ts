import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SpeechProvider } from '@app/domain';
import { z } from 'zod';
import { PermanentReadingError, ProviderError } from '../../../ai/errors.ts';

/*
 * Story 31.2: the `fake` speech step (`STT_PROVIDER=fake`, the default). No cloud call: the text as
 * heard comes from `fixtures/speech.json`, by the audio's sha256 (a test copies the file and adds
 * the recordings it uploads), else the file's `default`. An entry may name an `error` instead, so a
 * test drives a transient (retried) or a permanent failure.
 */

export const DEFAULT_SPEECH_FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'speech.json');
export const FAKE_SPEECH_MODEL = 'fake';

const entrySchema = z.union([
  z.object({ text: z.string(), audio_seconds: z.number().nonnegative().optional() }),
  z.object({ error: z.enum(['transient', 'permanent']) }),
]);

export const speechFixtureSchema = z.object({
  $comment: z.string().optional(),
  default: z.string(),
  by_sha256: z.record(z.string(), entrySchema),
});
export type SpeechFixture = z.infer<typeof speechFixtureSchema>;

export function fakeSpeechProvider(fixturePath: string = DEFAULT_SPEECH_FIXTURE): SpeechProvider {
  return {
    name: 'fake',
    async transcribe(input) {
      const fixture = speechFixtureSchema.parse(JSON.parse(readFileSync(fixturePath, 'utf8')));
      const entry = fixture.by_sha256[input.sha256];
      if (entry !== undefined && 'error' in entry) {
        if (entry.error === 'permanent') throw new PermanentReadingError(`fake speech: permanent failure for ${input.sha256}`);
        throw new ProviderError(`fake speech: transient failure for ${input.sha256}`);
      }
      return { text: entry?.text ?? fixture.default, model: FAKE_SPEECH_MODEL, audio_seconds: entry?.audio_seconds ?? 0, usd: 0 };
    },
  };
}
