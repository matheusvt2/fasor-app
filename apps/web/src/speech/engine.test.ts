import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpeechEngine, speechEngineName } from './engine.ts';
import { createFakeEngine } from './fake-engine.ts';
import { createWebSpeechEngine, type RecognitionLike } from './webspeech-engine.ts';

/*
 * 9.4-UNIT: the speech engine selection, the Web Speech engine over a stubbed recognition
 * constructor and the fake engine the e2e bundle drives.
 */

describe('9.4-UNIT speechEngineName and createSpeechEngine', () => {
  it('reads unset as webspeech and an unknown name as none', () => {
    expect(speechEngineName(undefined)).toBe('webspeech');
    expect(speechEngineName('')).toBe('webspeech');
    expect(speechEngineName('webspeech')).toBe('webspeech');
    expect(speechEngineName('fake')).toBe('fake');
    expect(speechEngineName('none')).toBe('none');
    expect(speechEngineName('whisper')).toBe('none');
  });

  it('the none engine is never available and hears nothing', async () => {
    const engine = createSpeechEngine('none');
    expect(engine.name).toBe('none');
    expect(engine.available()).toBe(false);
    await expect(engine.listen(new AbortController().signal)).resolves.toEqual({ kind: 'none' });
  });
});

/** A stub recognition: records its settings and lets the test fire its events. */
class StubRecognition implements RecognitionLike {
  static last: StubRecognition | null = null;
  lang = '';
  interimResults = true;
  continuous = true;
  maxAlternatives = 5;
  onresult: RecognitionLike['onresult'] = null;
  onerror: RecognitionLike['onerror'] = null;
  onend: RecognitionLike['onend'] = null;
  start = vi.fn();
  abort = vi.fn();
  constructor() {
    StubRecognition.last = this;
  }
}

describe('9.4-UNIT the webspeech engine', () => {
  afterEach(() => {
    StubRecognition.last = null;
  });

  it('is unavailable with neither SpeechRecognition nor webkitSpeechRecognition', async () => {
    const engine = createWebSpeechEngine({});
    expect(engine.available()).toBe(false);
    await expect(engine.listen(new AbortController().signal)).resolves.toMatchObject({ kind: 'error' });
  });

  it('listens once in pt-BR, final results only, one alternative, and hands over the transcript', async () => {
    const engine = createWebSpeechEngine({ webkitSpeechRecognition: StubRecognition });
    expect(engine.available()).toBe(true);
    const heard = engine.listen(new AbortController().signal);
    const recognition = StubRecognition.last!;
    expect(recognition).toMatchObject({ lang: 'pt-BR', interimResults: false, continuous: false, maxAlternatives: 1 });
    expect(recognition.start).toHaveBeenCalledOnce();
    recognition.onresult!({ results: [[{ transcript: 'Fase A 147 giga' }]] });
    recognition.onend!();
    await expect(heard).resolves.toEqual({ kind: 'text', text: 'Fase A 147 giga' });
  });

  it('prefers the unprefixed SpeechRecognition', () => {
    class Other extends StubRecognition {}
    const engine = createWebSpeechEngine({ SpeechRecognition: Other, webkitSpeechRecognition: StubRecognition });
    void engine.listen(new AbortController().signal);
    expect(StubRecognition.last).toBeInstanceOf(Other);
  });

  it('no-speech and aborted are no result; any other error is an error', async () => {
    const engine = createWebSpeechEngine({ SpeechRecognition: StubRecognition });
    const quiet = engine.listen(new AbortController().signal);
    StubRecognition.last!.onerror!({ error: 'no-speech' });
    await expect(quiet).resolves.toEqual({ kind: 'none' });
    const aborted = engine.listen(new AbortController().signal);
    StubRecognition.last!.onerror!({ error: 'aborted' });
    await expect(aborted).resolves.toEqual({ kind: 'none' });
    const failed = engine.listen(new AbortController().signal);
    StubRecognition.last!.onerror!({ error: 'network' });
    await expect(failed).resolves.toEqual({ kind: 'error', reason: 'network' });
  });

  it('an end with nothing heard is no result', async () => {
    const engine = createWebSpeechEngine({ SpeechRecognition: StubRecognition });
    const heard = engine.listen(new AbortController().signal);
    StubRecognition.last!.onend!();
    await expect(heard).resolves.toEqual({ kind: 'none' });
  });

  it('aborting the signal aborts the recognition and resolves none, a late result ignored', async () => {
    const engine = createWebSpeechEngine({ SpeechRecognition: StubRecognition });
    const controller = new AbortController();
    const heard = engine.listen(controller.signal);
    const recognition = StubRecognition.last!;
    controller.abort();
    expect(recognition.abort).toHaveBeenCalledOnce();
    recognition.onresult!({ results: [[{ transcript: 'tarde demais' }]] });
    await expect(heard).resolves.toEqual({ kind: 'none' });
  });
});

describe('9.4-UNIT the fake engine', () => {
  afterEach(() => {
    globalThis.__FAKE_SPEECH__ = undefined;
    globalThis.__fakeSpeech = undefined;
  });

  it('is available unless __FAKE_SPEECH__.available is false', () => {
    const engine = createFakeEngine();
    expect(engine.available()).toBe(true);
    globalThis.__FAKE_SPEECH__ = { available: false };
    expect(engine.available()).toBe(false);
  });

  it('waits for say() or fail() while it listens', async () => {
    const engine = createFakeEngine();
    const control = globalThis.__fakeSpeech!;
    expect(control.listening).toBe(false);
    expect(control.say('nada')).toBe(false);
    const heard = engine.listen(new AbortController().signal);
    expect(control.listening).toBe(true);
    expect(control.say('detalhe da limpeza')).toBe(true);
    await expect(heard).resolves.toEqual({ kind: 'text', text: 'detalhe da limpeza' });
    expect(control.listening).toBe(false);
    const failed = engine.listen(new AbortController().signal);
    control.fail();
    await expect(failed).resolves.toEqual({ kind: 'error', reason: 'network' });
  });

  it('an abort ends the session with no result', async () => {
    const engine = createFakeEngine();
    const controller = new AbortController();
    const heard = engine.listen(controller.signal);
    controller.abort();
    await expect(heard).resolves.toEqual({ kind: 'none' });
    expect(globalThis.__fakeSpeech!.listening).toBe(false);
  });
});
