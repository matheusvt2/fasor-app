import type { SpeechProvider, WritingProvider } from '@app/domain';
import { DEFAULT_BEDROCK_MODEL_ID, type Config } from '../../../config.ts';
import { BEDROCK_DEFAULT_REGION, bedrockClientSource, type BedrockClientSource, type BedrockLike } from '../../../ai/bedrock.ts';
import { AiFeaturesOffError } from '../../../ai/errors.ts';
import { fakeSpeechProvider } from './speech-fake.ts';
import { transcribeSpeechProvider, type TranscribeLike } from './speech-transcribe.ts';
import { bedrockWritingProvider } from './writing-bedrock.ts';
import { fakeWritingProvider } from './writing-fake.ts';

/*
 * Story 31.2 (AD-30): the two providers of the transcription job, chosen by env. `STT_PROVIDER`
 * names the speech step (`fake` by default; `transcribe` is Amazon Transcribe, Story 31.8); `LLM_PROVIDER` the writing step (`fake` by default,
 * `bedrock` through Converse). `AI_FEATURES=off` refuses every writing call permanently.
 */

export interface SpeechProviderOptions {
  /** The fake's fixture; defaults to the committed `fixtures/speech.json`. */
  fixturePath?: string;
  /** An injected Transcribe client and timings (tests). */
  transcribe?: { client?: TranscribeLike; pollMs?: number; jobTimeoutMs?: number; sleep?: (ms: number) => Promise<void> };
}

/** The speech provider the env names (Story 31.8: `transcribe` is Amazon Transcribe batch). */
export function createSpeechProvider(
  config: Pick<Config, 'STT_PROVIDER'> & Partial<Pick<Config, 'S3_BUCKET' | 'TRANSCRIBE_REGION' | 'TRANSCRIBE_VOCABULARY_NAME'>>,
  options: SpeechProviderOptions = {},
): SpeechProvider {
  if (config.STT_PROVIDER === 'transcribe') {
    if (config.S3_BUCKET === undefined) throw new Error('STT_PROVIDER=transcribe needs S3_BUCKET');
    return transcribeSpeechProvider({
      bucket: config.S3_BUCKET,
      ...(config.TRANSCRIBE_REGION === undefined ? {} : { region: config.TRANSCRIBE_REGION }),
      ...(config.TRANSCRIBE_VOCABULARY_NAME === undefined ? {} : { vocabularyName: config.TRANSCRIBE_VOCABULARY_NAME }),
      ...options.transcribe,
    });
  }
  return fakeSpeechProvider(options.fixturePath);
}

export interface WritingProviderOptions {
  /** The fake's fixture; defaults to the committed `fixtures/writing.json`. */
  fixturePath?: string;
  /** An injected Bedrock client (tests), or the process's client source (`main.ts`). */
  bedrock?: { client?: BedrockLike; timeoutMs?: number; source?: BedrockClientSource };
}

/** The writing provider the env names, and its name for the run row. */
export function createWritingProvider(
  config: Pick<Config, 'LLM_PROVIDER'> & Partial<Pick<Config, 'AI_FEATURES' | 'BEDROCK_REGION' | 'BEDROCK_PROSE_MODEL_ID' | 'BEDROCK_MODEL_ID'>>,
  options: WritingProviderOptions = {},
): { name: string; provider: WritingProvider } {
  if (config.AI_FEATURES === 'off') {
    return {
      name: 'off',
      provider: {
        async write() {
          throw new AiFeaturesOffError();
        },
      },
    };
  }
  if (config.LLM_PROVIDER === 'fake') return { name: 'fake', provider: fakeWritingProvider(options.fixturePath) };
  const source =
    options.bedrock?.source ??
    bedrockClientSource({ region: config.BEDROCK_REGION ?? BEDROCK_DEFAULT_REGION, ...(options.bedrock?.client === undefined ? {} : { client: options.bedrock.client }) });
  return {
    name: 'bedrock',
    provider: bedrockWritingProvider({
      source,
      modelId: config.BEDROCK_PROSE_MODEL_ID ?? config.BEDROCK_MODEL_ID ?? DEFAULT_BEDROCK_MODEL_ID,
      ...(options.bedrock?.timeoutMs === undefined ? {} : { timeoutMs: options.bedrock.timeoutMs }),
    }),
  };
}
