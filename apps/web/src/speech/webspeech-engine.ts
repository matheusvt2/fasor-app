import type { SpeechEngine, SpeechResult } from './engine.ts';

/*
 * Story 9.4: the Web Speech API engine. One recognition per `listen`, pt-BR, final results
 * only, one alternative. "no-speech" and "aborted" are no result; any other error is an
 * error the Dictation button announces. Open question Q1 (spec): on Chrome the audio goes
 * to the browser vendor's recognition service, with no consent text in the POC.
 */

interface RecognitionAlternative {
  transcript: string;
}

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<RecognitionAlternative>>;
}

interface RecognitionErrorEvent {
  error: string;
}

/** The part of `SpeechRecognition` this engine uses (the DOM lib does not type it everywhere). */
export interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

export type RecognitionConstructor = new () => RecognitionLike;

/** `SpeechRecognition`, else the prefixed `webkitSpeechRecognition`, else null. */
export function recognitionConstructor(scope: object = globalThis): RecognitionConstructor | null {
  const holder = scope as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return holder.SpeechRecognition ?? holder.webkitSpeechRecognition ?? null;
}

const NONE: SpeechResult = { kind: 'none' };

export function createWebSpeechEngine(scope: object = globalThis): SpeechEngine {
  return {
    name: 'webspeech',
    available: () => recognitionConstructor(scope) !== null,
    listen: (signal) =>
      new Promise<SpeechResult>((resolve) => {
        const Recognition = recognitionConstructor(scope);
        if (Recognition === null) {
          resolve({ kind: 'error', reason: 'unavailable' });
          return;
        }
        if (signal.aborted) {
          resolve(NONE);
          return;
        }
        const recognition = new Recognition();
        recognition.lang = 'pt-BR';
        recognition.interimResults = false;
        recognition.continuous = false;
        recognition.maxAlternatives = 1;
        let settled = false;
        const finish = (result: SpeechResult) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', onAbort);
          resolve(result);
        };
        const onAbort = () => {
          try {
            recognition.abort();
          } catch {
            // Already stopped.
          }
          finish(NONE);
        };
        recognition.onresult = (event) => {
          const text = event.results[0]?.[0]?.transcript ?? '';
          finish(text.trim() === '' ? NONE : { kind: 'text', text });
        };
        recognition.onerror = (event) => {
          finish(event.error === 'no-speech' || event.error === 'aborted' ? NONE : { kind: 'error', reason: event.error });
        };
        recognition.onend = () => finish(NONE);
        signal.addEventListener('abort', onAbort, { once: true });
        try {
          recognition.start();
        } catch (error) {
          finish({ kind: 'error', reason: error instanceof Error ? error.name : 'start' });
        }
      }),
  };
}
