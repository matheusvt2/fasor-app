import { z } from 'zod';
import type { AudioWritingContext } from '../audio/context.ts';
import { uuidV7Schema } from '../ids.ts';

/*
 * Stories 31.1 and 31.2 (AD-30): the transcription contract. The server turns an uploaded audio
 * into text in a pg-boss `transcription` job, in two steps behind two interfaces: the speech step
 * (`SpeechProvider`, `STT_PROVIDER`: `fake` replays fixtures, `transcribe` is Story 31.8) returns
 * the text as heard; the writing step (`WritingProvider`, under `LLM_PROVIDER`: `fake` replays
 * fixtures, `bedrock` through the Converse layer) returns one text at the field's level. Neither is
 * the device-server sync contract; the route below is.
 */

/** Story 31.2: `POST /api/audios/{id}/retranscribe` queues a `failed` audio again ("Tentar de novo"). */
export const AUDIO_RETRANSCRIBE_PATH = '/api/audios/:id/retranscribe';

/** The route of one audio, as the device calls it. */
export function audioRetranscribePath(audioId: string): string {
  return AUDIO_RETRANSCRIBE_PATH.replace(':id', audioId);
}

/**
 * `202` with the audio's new status. Only a `failed` audio is queued again (`409 invalid_request`
 * otherwise; `409 not_caught_up` when its bytes are not stored, `409 ai_features_off` while the
 * server's AI features are off); another company's audio answers exactly as an unknown id
 * (`404 not_found`); a role without the key of the audio's field answers `403 forbidden`.
 */
export const audioRetranscribeResponseSchema = z.object({
  audio_id: uuidV7Schema,
  audio_status: z.literal('transcribing'),
});
export type AudioRetranscribeResponse = z.infer<typeof audioRetranscribeResponseSchema>;

/** What the speech step is given: the audio's bytes and where they are stored (Amazon Transcribe reads the object). */
export interface SpeechInput {
  bytes: Uint8Array;
  mime: string;
  sha256: string;
  /** The object key of the original in the bucket. */
  key: string;
}

/** The text as heard, with the confidence of each word when the provider gives it, and what the call cost. */
export interface SpeechResult {
  text: string;
  words?: { text: string; confidence: number }[];
  /** The provider's model or engine name. */
  model: string;
  /** The seconds of audio billed. */
  audio_seconds: number;
  usd: number;
}

/** The speech step: `fake` (the default) replays fixtures; `transcribe` arrives with Story 31.8. */
export interface SpeechProvider {
  name: string;
  transcribe(input: SpeechInput): Promise<SpeechResult>;
}

/** The two levels a model writes at (`audioWritingLevel`): a measurement table's `reading` is never written. */
export type WritingStepLevel = 'polish' | 'report';

/** One writing call: the text as heard, the field's level and the context the kernel assembled. */
export interface WritingInput {
  text: string;
  level: WritingStepLevel;
  context: AudioWritingContext;
}

/** One text, and what the call cost (the `transcription_run` row's model, prompt version and usage). */
export interface WritingResult {
  text: string;
  model: string;
  prompt_version: string;
  usage: { input_tokens: number; output_tokens: number; usd: number };
}

/** The writing step: `fake` replays fixtures; `bedrock` writes through Converse. `ProseProvider` (AD-14) is not reused: it takes an image. */
export interface WritingProvider {
  write(input: WritingInput): Promise<WritingResult>;
}
