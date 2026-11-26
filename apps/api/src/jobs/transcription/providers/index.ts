import type { SpeechProvider, WritingProvider } from '@app/domain';
import { DEFAULT_BEDROCK_MODEL_ID, type Config } from '../../../config.ts';
import { BEDROCK_DEFAULT_REGION, bedrockClientSource, type BedrockClientSource, type BedrockLike } from '../../../ai/bedrock.ts';
import { AiFeaturesOffError } from '../../../ai/errors.ts';
import { fakeSpeechProvider } from './speech-fake.ts';
import { bedrockWritingProvider } from './writing-bedrock.ts';
import { fakeWritingProvider } from './writing-fake.ts';

/*
 * Story 31.2 (AD-30): the two providers of the transcription job, chosen by env. `STT_PROVIDER`
 * names the speech step (`fake` by default; `transcribe`, Amazon Transcribe, arrives with Story
 * 31.8 and refuses to boot until then); `LLM_PROVIDER` the writing step (`fake` by default,
 * `bedrock` through Converse). `AI_FEATURES=off` refuses every writing call permanently.
 */

/** Story 31.2: `STT_PROVIDER=transcribe` before Story 31.8 delivers its adapter. */
export class SpeechProviderUnavailableError extends Error {
  constructor() {
    super('STT_PROVIDER=transcribe: the Amazon Transcribe adapter arrives with Story 31.8; set STT_PROVIDER=fake until then');
    this.name = 'SpeechProviderUnavailableError';
  }
}

export interface SpeechProviderOptions {
  /** The fake's fixture; defaults to the committed `fixtures/speech.json`. */
  fixturePath?: string;
}

/** The speech provider the env names; `transcribe` throws (boot fails with the reason). */
export function createSpeechProvider(config: Pick<Config, 'STT_PROVIDER'>, options: SpeechProviderOptions = {}): SpeechProvider {
  if (config.STT_PROVIDER === 'transcribe') throw new SpeechProviderUnavailableError();
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
