import {
  AUDIO_RECORDING_LIMITS,
  audioLiveConditions,
  audioLiveWarning,
  audioMeterLevel,
  type AudioLiveMeasures,
  type AudioLiveWarning,
  type AudioQualityMeasures,
} from '@app/domain';

/*
 * Story 31.3 (AD-30, FR-77): the recorder. One gesture: a tap starts, a second tap (or 3:00)
 * stops. The microphone's samples are measured on the device by fixed rules while the
 * MediaRecorder keeps the audio in memory; nothing is stored until the stop hands back the
 * Blob and its measures (the caller commits them in one transaction, or drops a recording that
 * heard nothing). Closing the tab mid-recording leaves no trace. The thresholds and the words
 * are the kernel's (`audio/recording.ts`, `audio/quality.ts`); this file only computes numbers.
 *
 * The browser parts are injected (`RecorderDeps`), so the unit tests drive the whole recorder
 * with fake buffers and a fake clock, and Playwright drives the real one through a `getUserMedia`
 * override (`e2e/support/audio.ts`) with no microphone.
 */

/** The measures of one slice of samples: its RMS, its peak and how many samples clipped. */
export interface AudioFrame {
  rms: number;
  peak: number;
  clipped: number;
}

/** How often the samples are read, in milliseconds. */
export const FRAME_MS = 50;
/** A sample at or over this magnitude counts as clipped. */
const CLIP_AT = 0.99;
/** The lowest frame RMS that may be voice, whatever the noise floor. */
const VOICE_GATE = 0.015;
/** The window of the live level and clipping (the last half second). */
const LIVE_FRAMES = 10;
/** The window of the live noise floor against the voice (the last three seconds). */
const NOISE_FRAMES = 60;
/** How often the recording state is handed to React (8 Hz), so typing is never slowed. */
const PUBLISH_MS = 125;

/** One slice's frame from its samples. */
export function frameOf(samples: ArrayLike<number>): AudioFrame {
  let sum = 0;
  let peak = 0;
  let clipped = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.abs(samples[i]!);
    sum += value * value;
    if (value > peak) peak = value;
    if (value >= CLIP_AT) clipped += 1;
  }
  return { rms: samples.length === 0 ? 0 : Math.sqrt(sum / samples.length), peak, clipped };
}

function rmsOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value * value;
  return Math.sqrt(sum / values.length);
}

/** The RMS of the quietest fifth of the frames: the noise floor. */
function noiseFloorOf(frames: readonly AudioFrame[]): number {
  if (frames.length === 0) return 0;
  const sorted = frames.map((frame) => frame.rms).sort((a, b) => a - b);
  return rmsOf(sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.2))));
}

/** The frames that carry voice: over max(0.015, twice the noise floor). */
function voicedOf(frames: readonly AudioFrame[], floor: number): AudioFrame[] {
  const gate = Math.max(VOICE_GATE, 2 * floor);
  return frames.filter((frame) => frame.rms > gate);
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The measures of a whole recording (the kernel's `AudioQualityMeasures`): `level` the RMS of
 * the voiced frames, `clipped_share` the clipped samples over all samples, `noise_ratio` the
 * noise floor over the voice (0 with no voice), `duration_ms` and `speech_ms` the frames' time
 * and the voiced frames' time.
 */
export function measureFrames(frames: readonly AudioFrame[], frame: { ms: number; samples: number }): AudioQualityMeasures {
  const floor = noiseFloorOf(frames);
  const voiced = voicedOf(frames, floor);
  const level = rmsOf(voiced.map((one) => one.rms));
  const clipped = frames.reduce((total, one) => total + one.clipped, 0);
  const samples = frames.length * frame.samples;
  return {
    level: clamp01(level),
    clipped_share: samples === 0 ? 0 : clamp01(clipped / samples),
    noise_ratio: level === 0 ? 0 : floor / level,
    duration_ms: Math.round(frames.length * frame.ms),
    speech_ms: Math.round(voiced.length * frame.ms),
  };
}

/** The running measures of the last frames: the level and clipping of the last half second, the noise against the voice of the last three. */
export function liveMeasures(frames: readonly AudioFrame[], samplesPerFrame: number): AudioLiveMeasures {
  const recent = frames.slice(-LIVE_FRAMES);
  const longer = frames.slice(-NOISE_FRAMES);
  const floor = noiseFloorOf(longer);
  const voice = rmsOf(voicedOf(longer, floor).map((one) => one.rms));
  const clipped = recent.reduce((total, one) => total + one.clipped, 0);
  const samples = recent.length * samplesPerFrame;
  return {
    level: rmsOf(recent.map((one) => one.rms)),
    clipped_share: samples === 0 ? 0 : clipped / samples,
    noise_ratio: voice === 0 ? 0 : floor / voice,
  };
}

/** What the screen shows of a recording while it runs. */
export interface RecordingTick {
  elapsedMs: number;
  /** Bars lit on the meter, 0 to 5. */
  meter: number;
  warning: AudioLiveWarning | null;
}

/** What a stop hands back: the bytes, the row's mime (the container alone) and the measures. */
export interface RecordingResult {
  blob: Blob;
  mime: 'audio/webm' | 'audio/mp4';
  measures: AudioQualityMeasures;
}

export interface Recording {
  /** Ends the recording and hands back its bytes and measures. */
  stop: () => Promise<RecordingResult>;
  /** Ends it and throws everything away. */
  cancel: () => void;
}

interface AnalyserLike {
  fftSize: number;
  getFloatTimeDomainData: (array: Float32Array<ArrayBuffer>) => void;
}

interface AudioContextLike {
  sampleRate: number;
  createMediaStreamSource: (stream: MediaStream) => { connect: (node: AnalyserLike) => unknown; disconnect?: () => void };
  createAnalyser: () => AnalyserLike;
  close: () => Promise<void>;
  /** A context made outside a tap may start suspended (autoplay rules): it is resumed at once. */
  resume?: () => Promise<void>;
}

interface MediaRecorderLike {
  mimeType: string;
  state: string;
  start: (timeslice?: number) => void;
  stop: () => void;
  addEventListener: (type: 'dataavailable' | 'stop', listener: (event: { data?: Blob }) => void) => void;
}

export interface MediaRecorderClass {
  new (stream: MediaStream, options?: { mimeType?: string }): MediaRecorderLike;
  isTypeSupported: (type: string) => boolean;
}

export interface RecorderClock {
  now: () => number;
  setInterval: (callback: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

export interface RecorderDeps {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  MediaRecorder: MediaRecorderClass;
  AudioContext: new () => AudioContextLike;
  clock: RecorderClock;
}

/** The browser's own parts, or null when it cannot record (no MediaRecorder, no getUserMedia, no Web Audio). */
export function browserRecorderDeps(): RecorderDeps | null {
  const scope = globalThis as unknown as {
    MediaRecorder?: MediaRecorderClass;
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
    navigator?: Navigator;
  };
  const devices = scope.navigator?.mediaDevices;
  const Context = scope.AudioContext ?? scope.webkitAudioContext;
  if (scope.MediaRecorder === undefined || devices === undefined || typeof devices.getUserMedia !== 'function' || Context === undefined) return null;
  return {
    getUserMedia: (constraints) => devices.getUserMedia(constraints),
    MediaRecorder: scope.MediaRecorder,
    AudioContext: Context,
    clock: {
      now: () => performance.now(),
      setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
      clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>),
    },
  };
}

/** WebM/Opus first, MP4/AAC otherwise (Safari), else the browser's default. */
function pickMime(Recorder: MediaRecorderClass): string | undefined {
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (Recorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

/** The row's mime: the container alone, the two the server stores (`FILE_KIND_MIME.audio`). */
export function containerMime(type: string): 'audio/webm' | 'audio/mp4' {
  return type.split(';')[0]!.trim().toLowerCase() === 'audio/mp4' ? 'audio/mp4' : 'audio/webm';
}

/** The constraints of an honest measure: one channel, no echo cancelling, no noise suppression, no gain control. */
export const RECORDING_CONSTRAINTS: MediaStreamConstraints = {
  audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
};

/**
 * Starts a recording. Rejects as `getUserMedia` does when the microphone is refused or absent
 * (`NotAllowedError`, `NotFoundError`), before anything is kept. `onTick` hears the elapsed time,
 * the meter and the warning at most 8 times a second; `onLimit` hears 3:00, once.
 */
export async function startRecording(deps: RecorderDeps, handlers: { onTick: (tick: RecordingTick) => void; onLimit: () => void }): Promise<Recording> {
  const stream = await deps.getUserMedia(RECORDING_CONSTRAINTS);
  const stopTracks = () => {
    for (const track of stream.getTracks()) track.stop();
  };
  let context: AudioContextLike;
  let recorder: MediaRecorderLike;
  try {
    context = new deps.AudioContext();
    const mimeType = pickMime(deps.MediaRecorder);
    recorder = new deps.MediaRecorder(stream, mimeType === undefined ? undefined : { mimeType });
  } catch (error) {
    stopTracks();
    throw error;
  }
  void context.resume?.().catch(() => undefined);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  const source = context.createMediaStreamSource(stream);
  source.connect(analyser);
  const samplesPerFrame = Math.min(analyser.fftSize, Math.round((context.sampleRate * FRAME_MS) / 1000));
  const buffer = new Float32Array(analyser.fftSize);
  const chunks: Blob[] = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data !== undefined && event.data.size > 0) chunks.push(event.data);
  });
  const stopped = new Promise<void>((resolve) => recorder.addEventListener('stop', () => resolve()));

  const frames: AudioFrame[] = [];
  const held = { low_level_ms: 0, clipping_ms: 0, noisy_ms: 0 };
  const startedAt = deps.clock.now();
  let lastTickAt = startedAt;
  let lastPublishAt = Number.NEGATIVE_INFINITY;
  let limitSaid = false;
  let ended = false;

  const sample = () => {
    const at = deps.clock.now();
    const step = at - lastTickAt;
    lastTickAt = at;
    analyser.getFloatTimeDomainData(buffer);
    frames.push(frameOf(buffer.subarray(buffer.length - samplesPerFrame)));
    const live = liveMeasures(frames, samplesPerFrame);
    const holds = audioLiveConditions(live);
    held.low_level_ms = holds.low_level ? held.low_level_ms + step : 0;
    held.clipping_ms = holds.clipping ? held.clipping_ms + step : 0;
    held.noisy_ms = holds.noisy ? held.noisy_ms + step : 0;
    const elapsedMs = at - startedAt;
    if (at - lastPublishAt >= PUBLISH_MS) {
      lastPublishAt = at;
      handlers.onTick({ elapsedMs, meter: audioMeterLevel(live.level), warning: audioLiveWarning({ ...live, ...held }) });
    }
    if (!limitSaid && elapsedMs >= AUDIO_RECORDING_LIMITS.max_ms) {
      limitSaid = true;
      handlers.onLimit();
    }
  };
  const timer = deps.clock.setInterval(sample, FRAME_MS);
  recorder.start(1000);
  handlers.onTick({ elapsedMs: 0, meter: 0, warning: null });

  const teardown = () => {
    deps.clock.clearInterval(timer);
    stopTracks();
    source.disconnect?.();
    void context.close().catch(() => undefined);
  };

  return {
    stop: async () => {
      if (ended) throw new Error('the recording already ended');
      ended = true;
      const elapsed = Math.max(0, deps.clock.now() - startedAt);
      deps.clock.clearInterval(timer);
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch (error) {
        // e31f: the microphone is released even when the recorder fails at stop (the field then says so).
        teardown();
        throw error;
      }
      await stopped;
      teardown();
      const mime = containerMime(recorder.mimeType || 'audio/webm');
      const measures = measureFrames(frames, { ms: frames.length === 0 ? 0 : elapsed / frames.length, samples: samplesPerFrame });
      return { blob: new Blob(chunks, { type: mime }), mime, measures: { ...measures, duration_ms: Math.round(elapsed) } };
    },
    cancel: () => {
      if (ended) return;
      ended = true;
      if (recorder.state !== 'inactive') recorder.stop();
      chunks.length = 0;
      teardown();
    },
  };
}

/** Whether a rejection of `getUserMedia` is the microphone refused or absent (the explanation shows). */
export function isMicRefusal(error: unknown): boolean {
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  return name === 'NotAllowedError' || name === 'NotFoundError' || name === 'SecurityError' || name === 'PermissionDeniedError';
}
