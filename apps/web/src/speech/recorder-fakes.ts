import type { RecorderDeps } from './recorder.ts';

/*
 * Story 31.3: the recorder's browser parts as test doubles (unit tests only). The analyser hands
 * out whatever the current `source` makes for the frame being read; the clock moves only when a
 * test advances it, one frame interval at a time; the MediaRecorder hands back one chunk at stop.
 */

export type SampleSource = (frameIndex: number, length: number) => Float32Array<ArrayBuffer>;

/** A sine of this amplitude (0 to 1+ of full scale), plus uniform noise of `noise` amplitude. */
export function tone(amplitude: number, noise = 0): SampleSource {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  };
  return (_frame, length) => {
    const out = new Float32Array(length);
    for (let i = 0; i < length; i += 1) out[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / 48000) + noise * random();
    return out;
  };
}

/** Speech-like: the voice on for `on` frames, then `off` frames of the floor alone. */
export function syllables(voice: SampleSource, floor: SampleSource, on = 6, off = 4): SampleSource {
  return (frame, length) => (frame % (on + off) < on ? voice(frame, length) : floor(frame, length));
}

export const silence: SampleSource = (_frame, length) => new Float32Array(length);

export interface FakeRecorderWorld {
  deps: RecorderDeps;
  /** The samples the next frames read. */
  setSource: (source: SampleSource) => void;
  /** Moves the clock by `ms`, one frame interval (50 ms) at a time, running the sampler each time. */
  advance: (ms: number) => void;
  /** The tracks handed out, to check they were stopped. */
  tracks: { stopped: boolean }[];
  /** How many times the microphone was asked for. */
  asked: () => number;
}

export function fakeRecorderWorld(options: { refuse?: string; mime?: string } = {}): FakeRecorderWorld {
  let now = 0;
  let frame = 0;
  let source: SampleSource = silence;
  let asked = 0;
  const timers = new Map<number, { callback: () => void; ms: number }>();
  let nextTimer = 1;
  const tracks: { stopped: boolean }[] = [];

  class FakeAnalyser {
    fftSize = 2048;
    getFloatTimeDomainData(array: Float32Array<ArrayBuffer>) {
      array.set(source(frame, array.length));
    }
  }
  class FakeContext {
    sampleRate = 48000;
    createMediaStreamSource() {
      return { connect: () => undefined, disconnect: () => undefined };
    }
    createAnalyser() {
      return new FakeAnalyser();
    }
    close() {
      return Promise.resolve();
    }
  }
  class FakeMediaRecorder {
    static isTypeSupported(type: string) {
      return type === (options.mime ?? 'audio/webm;codecs=opus');
    }
    mimeType: string;
    state = 'inactive';
    private listeners: Record<string, ((event: { data?: Blob }) => void)[]> = {};
    constructor(_stream: MediaStream, init?: { mimeType?: string }) {
      this.mimeType = init?.mimeType ?? '';
    }
    addEventListener(type: string, listener: (event: { data?: Blob }) => void) {
      (this.listeners[type] ??= []).push(listener);
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      queueMicrotask(() => {
        for (const listener of this.listeners.dataavailable ?? []) listener({ data: new Blob(['opus-bytes'], { type: this.mimeType }) });
        for (const listener of this.listeners.stop ?? []) listener({});
      });
    }
  }

  const deps: RecorderDeps = {
    getUserMedia: () => {
      asked += 1;
      if (options.refuse !== undefined) return Promise.reject(Object.assign(new Error('refused'), { name: options.refuse }));
      const track = { stopped: false, stop: () => (track.stopped = true) };
      tracks.push(track);
      return Promise.resolve({ getTracks: () => [track] } as unknown as MediaStream);
    },
    MediaRecorder: FakeMediaRecorder as unknown as RecorderDeps['MediaRecorder'],
    AudioContext: FakeContext as unknown as RecorderDeps['AudioContext'],
    clock: {
      now: () => now,
      setInterval: (callback, ms) => {
        const id = nextTimer++;
        timers.set(id, { callback, ms });
        return id;
      },
      clearInterval: (handle) => {
        timers.delete(handle as number);
      },
    },
  };

  return {
    deps,
    setSource: (next) => {
      source = next;
    },
    advance: (ms) => {
      for (let left = ms; left > 0; left -= 50) {
        now += 50;
        for (const timer of [...timers.values()]) timer.callback();
        frame += 1;
      }
    },
    tracks,
    asked: () => asked,
  };
}
