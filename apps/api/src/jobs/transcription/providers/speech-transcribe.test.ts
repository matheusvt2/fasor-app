import type { GetTranscriptionJobCommand, StartTranscriptionJobCommand } from '@aws-sdk/client-transcribe';
import { describe, expect, it } from 'vitest';
import { isPermanentReadingError, ProviderError, ProviderRefusedError, ProviderTimeoutError } from '../../../ai/errors.ts';
import { mediaFormatOf, parseTranscript, transcribeSpeechProvider, TRANSCRIBE_USD_PER_SECOND, type TranscribeLike } from './speech-transcribe.ts';

/* Story 31.8: the adapter against recorded response shapes of Amazon Transcribe; no test calls AWS. */

// The shape of a Transcribe transcript file (synthetic words).
const TRANSCRIPT = JSON.stringify({
  jobName: 'x',
  status: 'COMPLETED',
  results: {
    transcripts: [{ transcript: 'megômetro ligado no TC dois.' }],
    items: [
      { type: 'pronunciation', start_time: '0.1', end_time: '0.9', alternatives: [{ confidence: '0.98', content: 'megômetro' }] },
      { type: 'pronunciation', start_time: '1.0', end_time: '1.4', alternatives: [{ confidence: '0.91', content: 'ligado' }] },
      { type: 'pronunciation', start_time: '1.5', end_time: '2.2', alternatives: [{ confidence: '0.40', content: 'TC' }] },
      { type: 'pronunciation', start_time: '2.3', end_time: '2.61', alternatives: [{ confidence: '0.99', content: 'dois' }] },
      { type: 'punctuation', alternatives: [{ confidence: '0.0', content: '.' }] },
    ],
  },
});

type Answer = { TranscriptionJob?: Record<string, unknown> };

function fakeClient(answers: (Answer | Error)[]) {
  const sent: (StartTranscriptionJobCommand | GetTranscriptionJobCommand)[] = [];
  const queue = [...answers];
  const client: TranscribeLike = {
    async send(command) {
      sent.push(command);
      const next = queue.shift();
      if (next === undefined) throw new Error('unexpected call');
      if (next instanceof Error) throw next;
      return next as never;
    },
  };
  return { client, sent };
}

const named = (name: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(`${name}: boom`), { name, ...extra });
const input = { bytes: new Uint8Array(), mime: 'audio/webm;codecs=opus', sha256: 'ab'.repeat(32), key: 'c/audio/original/1' };
const done = { TranscriptionJob: { TranscriptionJobStatus: 'COMPLETED', Transcript: { TranscriptFileUri: 'https://example.invalid/t.json' } } };
const running = { TranscriptionJob: { TranscriptionJobStatus: 'IN_PROGRESS' } };

function provider(answers: (Answer | Error)[], extra: Record<string, unknown> = {}) {
  const fake = fakeClient(answers);
  const speech = transcribeSpeechProvider({
    bucket: 'files-bucket',
    client: fake.client,
    fetchText: async () => TRANSCRIPT,
    sleep: async () => undefined,
    ...extra,
  });
  return { speech, ...fake };
}

describe('transcribeSpeechProvider', () => {
  it('starts a pt-BR job on the stored object with the vocabulary, polls, and returns the text as heard with confidence and cost', async () => {
    const { speech, sent } = provider([{}, running, done], { vocabularyName: 'fasor-trade-words' });
    const result = await speech.transcribe(input);
    expect(result.text).toBe('megômetro ligado no TC dois.');
    expect(result.words).toEqual([
      { text: 'megômetro', confidence: 0.98 },
      { text: 'ligado', confidence: 0.91 },
      { text: 'TC', confidence: 0.4 },
      { text: 'dois', confidence: 0.99 },
    ]);
    expect(result.model).toBe('amazon-transcribe-batch');
    expect(result.audio_seconds).toBe(3);
    expect(result.usd).toBeCloseTo(3 * TRANSCRIBE_USD_PER_SECOND, 9);
    expect(sent).toHaveLength(3);
    const start = sent[0]?.input as unknown as Record<string, unknown>;
    expect(start).toMatchObject({
      LanguageCode: 'pt-BR',
      MediaFormat: 'webm',
      Media: { MediaFileUri: 's3://files-bucket/c/audio/original/1' },
      Settings: { VocabularyName: 'fasor-trade-words' },
    });
    expect(String(start.TranscriptionJobName)).toMatch(/^[0-9a-zA-Z._-]{1,200}$/);
  });

  it('sends no Settings without a vocabulary, and a retry uses a new job name', async () => {
    const { speech, sent } = provider([{}, done, {}, done]);
    await speech.transcribe(input);
    await speech.transcribe(input);
    const first = sent[0]?.input as unknown as Record<string, unknown>;
    const second = sent[2]?.input as unknown as Record<string, unknown>;
    expect(first.Settings).toBeUndefined();
    expect(first.TranscriptionJobName).not.toBe(second.TranscriptionJobName);
  });

  it('a job that does not finish within the timeout is a transient timeout', async () => {
    let clock = 0;
    const { speech } = provider([{}, running, running, running], { jobTimeoutMs: 5_000, now: () => (clock += 2_000) });
    const failure = await speech.transcribe(input).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ProviderTimeoutError);
    expect(isPermanentReadingError(failure)).toBe(false);
  });

  it('a failed job: a media fault is permanent, any other reason is transient', async () => {
    const media = await provider([{}, { TranscriptionJob: { TranscriptionJobStatus: 'FAILED', FailureReason: 'The media format is not valid.' } }]).speech.transcribe(input).catch((e: unknown) => e);
    expect(isPermanentReadingError(media)).toBe(true);
    const other = await provider([{}, { TranscriptionJob: { TranscriptionJobStatus: 'FAILED', FailureReason: 'Internal hiccup.' } }]).speech.transcribe(input).catch((e: unknown) => e);
    expect(other).toBeInstanceOf(ProviderError);
    expect(isPermanentReadingError(other)).toBe(false);
  });

  it('classifies service errors like the Bedrock adapter: refusals permanent, throttles and credentials transient', async () => {
    const denied = await provider([named('AccessDeniedException', { $fault: 'client' })]).speech.transcribe(input).catch((e: unknown) => e);
    expect(denied).toBeInstanceOf(ProviderRefusedError);
    const bad = await provider([named('BadRequestException', { $fault: 'client' })]).speech.transcribe(input).catch((e: unknown) => e);
    expect(isPermanentReadingError(bad)).toBe(true);
    for (const name of ['ThrottlingException', 'LimitExceededException', 'ConflictException', 'CredentialsProviderError']) {
      const error = await provider([named(name, { $fault: 'client' })]).speech.transcribe(input).catch((e: unknown) => e);
      expect(error, name).toBeInstanceOf(ProviderError);
      expect(isPermanentReadingError(error), name).toBe(false);
    }
  });

  it('a completed job without a transcript uri, or a transcript download that fails, is transient', async () => {
    const noUri = await provider([{}, { TranscriptionJob: { TranscriptionJobStatus: 'COMPLETED' } }]).speech.transcribe(input).catch((e: unknown) => e);
    expect(noUri).toBeInstanceOf(ProviderError);
    const broken = await provider([{}, done], {
      fetchText: async () => {
        throw new Error('socket hang up');
      },
    })
      .speech.transcribe(input)
      .catch((e: unknown) => e);
    expect(broken).toBeInstanceOf(ProviderError);
    expect(isPermanentReadingError(broken)).toBe(false);
  });

  it('an audio type Transcribe does not take is permanent before any call', async () => {
    const { speech, sent } = provider([]);
    const failure = await speech.transcribe({ ...input, mime: 'audio/amr' }).catch((e: unknown) => e);
    expect(isPermanentReadingError(failure)).toBe(true);
    expect(sent).toHaveLength(0);
  });
});

describe('mediaFormatOf and parseTranscript', () => {
  it('maps the recorder types: WebM/Opus and MP4/AAC', () => {
    expect(mediaFormatOf('audio/webm;codecs=opus')).toBe('webm');
    expect(mediaFormatOf('audio/mp4')).toBe('mp4');
    expect(mediaFormatOf('audio/mp4;codecs=mp4a.40.2')).toBe('mp4');
  });

  it('an empty transcript is empty text and zero seconds; a non-JSON file is transient', () => {
    expect(parseTranscript(JSON.stringify({ results: { transcripts: [{ transcript: '' }], items: [] } }))).toEqual({ text: '', words: [], seconds: 0 });
    expect(() => parseTranscript('not json')).toThrow(ProviderError);
    expect(() => parseTranscript('{}')).toThrow(ProviderError);
  });
});
