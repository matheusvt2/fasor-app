import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dictatedText, type WritingProvider } from '@app/domain';
import { z } from 'zod';
import { PermanentReadingError, ProviderError } from '../../../ai/errors.ts';

/*
 * Story 31.2: the `fake` writing step (`LLM_PROVIDER=fake`, the default). No cloud call: the text
 * comes from `fixtures/writing.json`, the first entry whose `heard` is the text as heard (and whose
 * `level`, when given, is the call's), else the heard text tidied the way a prose field shows it
 * (`dictatedText`) with a closing full stop. An entry may name an `error`, so a test drives a
 * writing call that fails transiently or for good.
 */

export const DEFAULT_WRITING_FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'writing.json');
export const FAKE_WRITING_MODEL = 'fake';
export const FAKE_WRITING_PROMPT_VERSION = 'fake-writing-1';

const entrySchema = z.union([
  z.object({ heard: z.string(), level: z.enum(['polish', 'report']).optional(), text: z.string() }),
  z.object({ heard: z.string(), level: z.enum(['polish', 'report']).optional(), error: z.enum(['transient', 'permanent']) }),
]);

export const writingFixtureSchema = z.object({
  $comment: z.string().optional(),
  entries: z.array(entrySchema),
});
export type WritingFixture = z.infer<typeof writingFixtureSchema>;

/** The fake's text when no entry matches: the heard text as a field shows it, ending in a full stop. */
export function fakeWrittenText(heard: string): string {
  const text = dictatedText(heard);
  return text === '' || /[.!?]$/.test(text) ? text : `${text}.`;
}

export function fakeWritingProvider(fixturePath: string = DEFAULT_WRITING_FIXTURE): WritingProvider {
  return {
    async write(input) {
      const fixture = writingFixtureSchema.parse(JSON.parse(readFileSync(fixturePath, 'utf8')));
      const entry = fixture.entries.find((one) => one.heard === input.text && (one.level === undefined || one.level === input.level));
      if (entry !== undefined && 'error' in entry) {
        if (entry.error === 'permanent') throw new PermanentReadingError('fake writing: permanent failure');
        throw new ProviderError('fake writing: transient failure');
      }
      const text = entry === undefined ? fakeWrittenText(input.text) : entry.text;
      return { text, model: FAKE_WRITING_MODEL, prompt_version: FAKE_WRITING_PROMPT_VERSION, usage: { input_tokens: 0, output_tokens: 0, usd: 0 } };
    },
  };
}
