import { GetTranscriptionJobCommand, StartTranscriptionJobCommand, TranscribeClient, type GetTranscriptionJobCommandOutput, type MediaFormat } from '@aws-sdk/client-transcribe';
import type { SpeechProvider } from '@app/domain';
import { callWithTimeout, classifyAwsError } from '../../../ai/aws.ts';
import { PermanentReadingError, ProviderError, ProviderTimeoutError } from '../../../ai/errors.ts';

/*
 * Story 31.8 (AD-30): the `transcribe` speech step (`STT_PROVIDER=transcribe`), Amazon Transcribe in
 * batch mode, pt-BR, on the audio object already stored in the files bucket. Shaped like the Bedrock
 * adapter: a lazily built client, SDK retries off (pg-boss retries), credentials only from the SDK
 * default chain (the ECS task role), one timeout per call, and the failure classification of `aws.ts`.
 *
 * The job reads the object with the caller's own rights (no data-access role), writes its transcript to
 * a service-managed location and answers a presigned URI that this adapter reads once. Nothing is
 * deleted: the Transcribe job record expires on the service's own schedule and the audio object is
 * never touched (AD-30 retention). The text is returned as heard; the writing step comes after.
 */

export const TRANSCRIBE_DEFAULT_REGION = 'us-east-1';
export const TRANSCRIBE_LANGUAGE = 'pt-BR';
/** One start, get or transcript-read call. */
export const TRANSCRIBE_CALL_TIMEOUT_MS = 30_000;
/** How long the whole job may wait for Transcribe; the pg-boss job expires at 600 s (`TRANSCRIPTION_QUEUE_OPTIONS`). */
export const TRANSCRIBE_JOB_TIMEOUT_MS = 540_000;
export const TRANSCRIBE_POLL_MS = 3_000;
/**
 * Standard batch, usage type `TranscribeAudio`, USD per second of audio: 0.0001 (USD 0.006 a minute), flat with
 * no volume tiers, the same in us-east-1 and sa-east-1, billed per second with no minimum per request, custom
 * vocabulary included. Source: the AWS Price List API
 * (https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/transcribe/current/<region>/index.json, publication
 * 2026-11-21, read 2026-11-26) and the pricing page's example "Batch transcription is priced at $0.006 per minute".
 * The 60 free minutes of the first 12 months are not counted.
 */
export const TRANSCRIBE_USD_PER_SECOND = 0.0001;
export const TRANSCRIBE_MODEL = 'amazon-transcribe-batch';

/** Transcribe's client faults that pass on a later attempt: a job name that exists, a concurrency limit. */
const TRANSCRIBE_TRANSIENT_ERRORS: ReadonlySet<string> = new Set(['ConflictException', 'LimitExceededException', 'InternalFailureException']);

export function classifyTranscribeError(error: unknown): Error {
  return classifyAwsError('transcribe', error, { transient: TRANSCRIBE_TRANSIENT_ERRORS });
}

/** The two calls of the client the adapter uses; tests inject a fake. */
export interface TranscribeLike {
  send(command: StartTranscriptionJobCommand | GetTranscriptionJobCommand, options?: { abortSignal?: AbortSignal }): Promise<Pick<GetTranscriptionJobCommandOutput, 'TranscriptionJob'>>;
}

export function createTranscribeClient(region: string): TranscribeLike {
  return new TranscribeClient({ region, maxAttempts: 1 }) as unknown as TranscribeLike;
}

export interface TranscribeProviderOptions {
  bucket: string;
  region?: string;
  /** The custom vocabulary's name; empty or unset sends none. */
  vocabularyName?: string;
  client?: TranscribeLike;
  /** Reads the transcript at its presigned URI; defaults to `fetch`. */
  fetchText?: (uri: string, signal: AbortSignal) => Promise<string>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  pollMs?: number;
  jobTimeoutMs?: number;
  callTimeoutMs?: number;
}

/** The media formats Transcribe takes, by the recorder's MIME type (WebM/Opus, MP4/AAC, and the common others). */
export function mediaFormatOf(mime: string): MediaFormat {
  const base = (mime.split(';')[0] ?? '').trim().toLowerCase();
  switch (base) {
    case 'audio/webm':
    case 'video/webm':
      return 'webm';
    case 'audio/mp4':
    case 'audio/x-m4a':
    case 'audio/aac':
    case 'video/mp4':
      return 'mp4';
    case 'audio/mpeg':
    case 'audio/mp3':
      return 'mp3';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/wav':
    case 'audio/x-wav':
    case 'audio/wave':
      return 'wav';
    case 'audio/flac':
      return 'flac';
    default:
      throw new PermanentReadingError(`transcribe: the audio type "${mime}" is not one Amazon Transcribe takes`);
  }
}

/** The recorded shape of a Transcribe transcript file that the adapter reads. */
interface TranscriptFile {
  results?: {
    transcripts?: { transcript?: string }[];
    items?: { type?: string; end_time?: string; alternatives?: { content?: string; confidence?: string }[] }[];
  };
}

/** The text, per-word confidence and audio seconds of a transcript file. */
export function parseTranscript(raw: string): { text: string; words: { text: string; confidence: number }[]; seconds: number } {
  let file: TranscriptFile;
  try {
    file = JSON.parse(raw) as TranscriptFile;
  } catch (cause) {
    throw new ProviderError('transcribe: the transcript file is not JSON', { cause });
  }
  const results = file.results;
  if (results === undefined) throw new ProviderError('transcribe: the transcript file has no results');
  const words: { text: string; confidence: number }[] = [];
  let seconds = 0;
  for (const item of results.items ?? []) {
    if (item.type !== 'pronunciation') continue;
    const best = item.alternatives?.[0];
    if (best?.content === undefined) continue;
    const confidence = Number(best.confidence);
    words.push({ text: best.content, confidence: Number.isFinite(confidence) ? confidence : 0 });
    const end = Number(item.end_time);
    if (Number.isFinite(end) && end > seconds) seconds = end;
  }
  const text = (results.transcripts?.[0]?.transcript ?? words.map((w) => w.text).join(' ')).trim();
  return { text, words, seconds: Math.ceil(seconds) };
}

/** A Transcribe job's own failure: a bad or unreadable media file is permanent, anything else passes on a later attempt. */
function failureOf(reason: string | undefined): Error {
  const text = `transcribe: the job failed: ${reason ?? 'no reason given'}`;
  return /format|codec|corrupt|invalid|duration|sample rate|channel|media/i.test(reason ?? '') ? new PermanentReadingError(text) : new ProviderError(text);
}

async function defaultFetchText(uri: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(uri, { signal });
  if (!response.ok) throw new ProviderError(`transcribe: the transcript download answered ${response.status}`);
  return response.text();
}

export function transcribeSpeechProvider(options: TranscribeProviderOptions): SpeechProvider {
  const callTimeout = options.callTimeoutMs ?? TRANSCRIBE_CALL_TIMEOUT_MS;
  const jobTimeout = options.jobTimeoutMs ?? TRANSCRIBE_JOB_TIMEOUT_MS;
  const pollMs = options.pollMs ?? TRANSCRIBE_POLL_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const fetchText = options.fetchText ?? defaultFetchText;
  let client: TranscribeLike | undefined = options.client;
  const getClient = () => (client ??= createTranscribeClient(options.region ?? TRANSCRIBE_DEFAULT_REGION));
  let counter = 0;

  return {
    name: 'transcribe',
    async transcribe(input) {
      const format = mediaFormatOf(input.mime);
      // Unique per attempt (a retry never meets a name it already used); [0-9a-zA-Z._-] only.
      const jobName = `fasor-stt-${input.sha256.slice(0, 16)}-${now().toString(36)}-${(counter++).toString(36)}`;
      const started = now();
      await callWithTimeout(
        'transcribe: start',
        callTimeout,
        (abortSignal) =>
          getClient().send(
            new StartTranscriptionJobCommand({
              TranscriptionJobName: jobName,
              LanguageCode: TRANSCRIBE_LANGUAGE,
              MediaFormat: format,
              Media: { MediaFileUri: `s3://${options.bucket}/${input.key}` },
              ...(options.vocabularyName ? { Settings: { VocabularyName: options.vocabularyName } } : {}),
            }),
            { abortSignal },
          ),
        classifyTranscribeError,
      );
      for (;;) {
        if (now() - started > jobTimeout) throw new ProviderTimeoutError(`transcribe: job ${jobName} not done within ${jobTimeout} ms`);
        await sleep(pollMs);
        const answer = await callWithTimeout(
          'transcribe: get',
          callTimeout,
          (abortSignal) => getClient().send(new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }), { abortSignal }),
          classifyTranscribeError,
        );
        const job = answer.TranscriptionJob;
        const status = job?.TranscriptionJobStatus;
        if (status === 'FAILED') throw failureOf(job?.FailureReason);
        if (status !== 'COMPLETED') continue;
        const uri = job?.Transcript?.TranscriptFileUri;
        if (uri === undefined) throw new ProviderError('transcribe: the job completed without a transcript uri');
        const raw = await callWithTimeout('transcribe: transcript', callTimeout, (signal) => fetchText(uri, signal), (error) =>
          error instanceof ProviderError ? error : new ProviderError(`transcribe: the transcript download failed: ${String(error)}`, { cause: error }),
        );
        const parsed = parseTranscript(raw);
        return { text: parsed.text, words: parsed.words, model: TRANSCRIBE_MODEL, audio_seconds: parsed.seconds, usd: Math.round(parsed.seconds * TRANSCRIBE_USD_PER_SECOND * 1e6) / 1e6 };
      }
    },
  };
}
