import type { SpeechEngine, SpeechResult } from './engine.ts';

/*
 * Story 9.4: the test engine (`VITE_SPEECH_ENGINE=fake`, the `build:e2e` bundle). Playwright
 * cannot speak, so while a Dictation button listens the page waits for
 * `window.__fakeSpeech.say(text)` (heard) or `.fail()` (a recognition error);
 * `window.__fakeSpeech.listening` says whether anything listens. The engine is available
 * unless `globalThis.__FAKE_SPEECH__.available` is false (set by an init script before load).
 */

export interface FakeSpeechControl {
  readonly listening: boolean;
  /** Hands `text` to the listening session; false when nothing listens. */
  say(text: string): boolean;
  /** Fails the listening session; false when nothing listens. */
  fail(reason?: string): boolean;
}

declare global {
  var __fakeSpeech: FakeSpeechControl | undefined;
  var __FAKE_SPEECH__: { available?: boolean } | undefined;
}

export function createFakeEngine(scope: typeof globalThis = globalThis): SpeechEngine {
  let pending: ((result: SpeechResult) => void) | null = null;
  const settle = (result: SpeechResult): boolean => {
    const resolve = pending;
    pending = null;
    resolve?.(result);
    return resolve !== null;
  };
  scope.__fakeSpeech = {
    get listening() {
      return pending !== null;
    },
    say: (text) => settle({ kind: 'text', text }),
    fail: (reason = 'network') => settle({ kind: 'error', reason }),
  };
  return {
    name: 'fake',
    available: () => scope.__FAKE_SPEECH__?.available !== false,
    listen: (signal) =>
      new Promise<SpeechResult>((resolve) => {
        if (signal.aborted) {
          resolve({ kind: 'none' });
          return;
        }
        // One session at a time: an earlier one ends with no result.
        settle({ kind: 'none' });
        const own = (result: SpeechResult) => resolve(result);
        pending = own;
        signal.addEventListener(
          'abort',
          () => {
            if (pending !== own) return;
            pending = null;
            resolve({ kind: 'none' });
          },
          { once: true },
        );
      }),
  };
}
