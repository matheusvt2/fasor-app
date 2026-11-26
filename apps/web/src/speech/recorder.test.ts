import { audioQualityOf } from '@app/domain';
import { describe, expect, it, vi } from 'vitest';
import { containerMime, frameOf, isMicRefusal, measureFrames, startRecording, type AudioFrame, type RecordingTick } from './recorder.ts';
import { fakeRecorderWorld, silence, syllables, tone, type SampleSource } from './recorder-fakes.ts';

/*
 * 31.3-WEB the recorder: the measures over fixed buffers (good, quiet, clipped, noisy, silent,
 * short), and the recorder itself on fake browser parts and a fake clock: start, stop, refusal,
 * the live warnings, the countdown and the 3:00 limit.
 */

const FRAME = { ms: 50, samples: 2048 };

function framesOf(source: SampleSource, count: number): AudioFrame[] {
  return Array.from({ length: count }, (_, index) => frameOf(source(index, FRAME.samples)));
}

const speech = (amplitude: number, noise = 0.002) => syllables(tone(amplitude, noise), tone(0, noise));

describe('31.3-WEB-003 measureFrames on fixed buffers', () => {
  it('good speech is judged good: level, low noise against the voice, speech time', () => {
    const measures = measureFrames(framesOf(speech(0.3), 80), FRAME);
    expect(measures.duration_ms).toBe(4000);
    expect(measures.speech_ms).toBe(2400);
    expect(measures.level).toBeGreaterThan(0.2);
    expect(measures.noise_ratio).toBeLessThan(0.05);
    expect(measures.clipped_share).toBe(0);
    expect(audioQualityOf(measures)).toMatchObject({ verdict: 'good', reasons: [] });
  });

  it('quiet speech is low level', () => {
    expect(audioQualityOf(measureFrames(framesOf(speech(0.035), 80), FRAME)).reasons).toEqual(['low_level']);
  });

  it('clipped speech is clipping', () => {
    expect(audioQualityOf(measureFrames(framesOf(speech(1.4), 80), FRAME)).reasons).toEqual(['clipping']);
  });

  it('speech over loud noise is noisy', () => {
    const noisy = syllables(tone(0.3, 0.15), tone(0, 0.15));
    expect(audioQualityOf(measureFrames(framesOf(noisy, 80), FRAME)).reasons).toEqual(['noisy']);
  });

  it('silence has no speech', () => {
    const measures = measureFrames(framesOf(silence, 80), FRAME);
    expect(measures).toMatchObject({ level: 0, noise_ratio: 0, speech_ms: 0, clipped_share: 0 });
    expect(audioQualityOf(measures).reasons).toContain('no_speech');
  });

  it('a short take is too short', () => {
    expect(audioQualityOf(measureFrames(framesOf(speech(0.3), 12), FRAME)).reasons).toContain('too_short');
  });

  it('a frame counts its RMS, peak and clipped samples', () => {
    expect(frameOf([0.5, -0.5, 1, -1.2])).toEqual({ rms: Math.sqrt((0.25 + 0.25 + 1 + 1.44) / 4), peak: 1.2, clipped: 2 });
    expect(frameOf([])).toEqual({ rms: 0, peak: 0, clipped: 0 });
  });
});

describe('31.3-WEB-004 startRecording on fake browser parts', () => {
  it('records, measures and hands back the Blob with the container mime, then lets the microphone go', async () => {
    const world = fakeRecorderWorld();
    world.setSource(speech(0.3));
    const ticks: RecordingTick[] = [];
    const recording = await startRecording(world.deps, { onTick: (tick) => ticks.push(tick), onLimit: vi.fn() });
    world.advance(4000);
    const result = await recording.stop();
    expect(result.mime).toBe('audio/webm');
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.measures.duration_ms).toBe(4000);
    expect(audioQualityOf(result.measures).verdict).toBe('good');
    expect(world.tracks.every((track) => track.stopped)).toBe(true);
    // At most 8 a second, the meter moving with the voice.
    expect(ticks.length).toBeLessThanOrEqual(1 + 4000 / 125);
    expect(Math.max(...ticks.map((tick) => tick.meter))).toBeGreaterThan(2);
  });

  it('a refused microphone rejects before anything is kept', async () => {
    const world = fakeRecorderWorld({ refuse: 'NotAllowedError' });
    const error = await startRecording(world.deps, { onTick: vi.fn(), onLimit: vi.fn() }).catch((caught: unknown) => caught);
    expect(isMicRefusal(error)).toBe(true);
    expect(isMicRefusal(Object.assign(new Error(), { name: 'NotFoundError' }))).toBe(true);
    expect(isMicRefusal(Object.assign(new Error(), { name: 'NotReadableError' }))).toBe(false);
  });

  it('says low level, then clipping, once each has held longer than 1.5 s', async () => {
    const world = fakeRecorderWorld();
    const ticks: RecordingTick[] = [];
    const recording = await startRecording(world.deps, { onTick: (tick) => ticks.push(tick), onLimit: vi.fn() });
    world.setSource(tone(0.01));
    world.advance(1000);
    expect(ticks.at(-1)!.warning).toBeNull();
    world.advance(1500);
    expect(ticks.at(-1)!.warning).toBe('low_level');
    world.setSource(tone(1.4));
    world.advance(2500);
    expect(ticks.at(-1)!.warning).toBe('clipping');
    world.setSource(speech(0.3));
    world.advance(1000);
    expect(ticks.at(-1)!.warning).toBeNull();
    recording.cancel();
  });

  it('reaches the countdown at 2:50 and says the limit at 3:00, once', async () => {
    const world = fakeRecorderWorld();
    world.setSource(speech(0.3));
    const ticks: RecordingTick[] = [];
    const onLimit = vi.fn();
    const recording = await startRecording(world.deps, { onTick: (tick) => ticks.push(tick), onLimit });
    world.advance(170_000);
    expect(ticks.at(-1)!.elapsedMs).toBeGreaterThanOrEqual(169_800);
    expect(onLimit).not.toHaveBeenCalled();
    world.advance(10_000);
    expect(onLimit).toHaveBeenCalledTimes(1);
    world.advance(500);
    expect(onLimit).toHaveBeenCalledTimes(1);
    const result = await recording.stop();
    expect(result.measures.duration_ms).toBe(180_500);
  });

  it('a cancelled recording keeps nothing and lets the microphone go', async () => {
    const world = fakeRecorderWorld();
    const recording = await startRecording(world.deps, { onTick: vi.fn(), onLimit: vi.fn() });
    world.advance(500);
    recording.cancel();
    expect(world.tracks[0]!.stopped).toBe(true);
    await expect(recording.stop()).rejects.toThrow();
  });

  it('names the row mime by its container: MP4/AAC on Safari, WebM otherwise', async () => {
    expect(containerMime('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(containerMime('audio/mp4;codecs=mp4a.40.2')).toBe('audio/mp4');
    const world = fakeRecorderWorld({ mime: 'audio/mp4' });
    world.setSource(speech(0.3));
    const recording = await startRecording(world.deps, { onTick: vi.fn(), onLimit: vi.fn() });
    world.advance(2000);
    expect((await recording.stop()).mime).toBe('audio/mp4');
  });
});
