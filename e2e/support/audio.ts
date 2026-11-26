import type { BrowserContext, Page } from '@playwright/test';

/*
 * Story 31.3: the recorder's test seam. Playwright has no microphone, so an init script replaces
 * `navigator.mediaDevices.getUserMedia` for audio-only requests (a camera request still reaches
 * the browser's own): it answers a `MediaStream` made by a Web Audio graph, a 220 Hz oscillator
 * through a gain that a 2 Hz square wave opens and closes (speech-like syllables, so the quietest
 * frames are the floor), plus looped white noise through a second gain. The whole real pipeline
 * runs on it: MediaRecorder, the analyser, the measures, the commit. `window.__voice.set({ level,
 * noise })` changes the voice's amplitude and the noise at any time; `refuse` rejects every audio
 * request with `NotAllowedError` instead.
 */

export interface VoiceSettings {
  /** The voice's peak amplitude, 0 to 1 of full scale (more clips). */
  level: number;
  /** The noise's amplitude. */
  noise: number;
}

interface VoiceWindow {
  __voice?: { set: (settings: Partial<VoiceSettings>) => void; requests: number };
}

/** Installs the seam from the next document on. */
export async function installVoice(target: BrowserContext | Page, options: { mode?: 'voice' | 'refuse'; level?: number; noise?: number } = {}): Promise<void> {
  await target.addInitScript(
    ({ mode, level, noise }) => {
      const devices = navigator.mediaDevices;
      if (devices === undefined) return;
      const original = devices.getUserMedia.bind(devices);
      const settings = { level, noise };
      let graph: { voice: GainNode; lfo: GainNode; noise: GainNode; context: AudioContext } | null = null;
      const apply = () => {
        if (graph === null) return;
        // The voice's gain swings between 0 and `level`: a base of level/2 plus a square wave of level/2.
        graph.voice.gain.value = settings.level / 2;
        graph.lfo.gain.value = settings.level / 2;
        graph.noise.gain.value = settings.noise;
      };
      const state = {
        requests: 0,
        set: (next: { level?: number; noise?: number }) => {
          Object.assign(settings, next);
          apply();
        },
      };
      (window as unknown as { __voice: typeof state }).__voice = state;
      devices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        if (constraints?.audio === undefined || constraints.audio === false || (constraints.video !== undefined && constraints.video !== false)) return original(constraints);
        state.requests += 1;
        if (mode === 'refuse') throw new DOMException('Permission denied', 'NotAllowedError');
        const context = new AudioContext();
        await context.resume().catch(() => undefined);
        const oscillator = context.createOscillator();
        oscillator.frequency.value = 220;
        const voice = context.createGain();
        const square = context.createOscillator();
        square.type = 'square';
        square.frequency.value = 2;
        const lfo = context.createGain();
        square.connect(lfo).connect(voice.gain);
        oscillator.connect(voice);
        const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const noiseGain = context.createGain();
        source.connect(noiseGain);
        const destination = context.createMediaStreamDestination();
        voice.connect(destination);
        noiseGain.connect(destination);
        graph = { voice, lfo, noise: noiseGain, context };
        apply();
        oscillator.start();
        square.start();
        source.start();
        return destination.stream;
      };
    },
    { mode: options.mode ?? 'voice', level: options.level ?? 0.3, noise: options.noise ?? 0.002 },
  );
}

/** Changes the voice the seam plays now. */
export async function setVoice(page: Page, settings: Partial<VoiceSettings>): Promise<void> {
  await page.evaluate((next) => (window as unknown as VoiceWindow).__voice!.set(next), settings);
}

/** How many times the page asked for the microphone. */
export async function micRequests(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as VoiceWindow).__voice?.requests ?? 0);
}

export interface AudioRecord {
  id: string;
  kind: string;
  relatorio_id: string;
  audio_status: string;
  audio_target: Record<string, unknown>;
  quality: { verdict: string; reasons: string[]; duration_ms: number; speech_ms: number };
  mime: string;
  transcript_heard: string | null;
  transcript_written: string | null;
}

/** The audio rows this device holds. */
export async function deviceAudios(page: Page, database: string): Promise<AudioRecord[]> {
  return page.evaluate(async (name: string) => {
    const open = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const all = await new Promise<{ entity: string; row: { kind?: string } }[]>((resolve, reject) => {
      const request = open.transaction('entities', 'readonly').objectStore('entities').getAll();
      request.onsuccess = () => resolve(request.result as never);
      request.onerror = () => reject(request.error);
    });
    open.close();
    return all.filter((record) => record.entity === 'file' && record.row.kind === 'audio').map((record) => record.row) as never;
  }, database);
}

/** The Blob this device keeps for a file: its size and type, or null. */
export async function deviceBlob(page: Page, database: string, id: string): Promise<{ size: number; type: string } | null> {
  return page.evaluate(
    async ({ name, fileId }) => {
      const open = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const row = await new Promise<{ blob?: Blob } | undefined>((resolve, reject) => {
        const request = open.transaction('files', 'readonly').objectStore('files').get(fileId);
        request.onsuccess = () => resolve(request.result as never);
        request.onerror = () => reject(request.error);
      });
      open.close();
      return row?.blob === undefined ? null : { size: row.blob.size, type: row.blob.type };
    },
    { name: database, fileId: id },
  );
}
