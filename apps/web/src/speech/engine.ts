import { createFakeEngine } from './fake-engine.ts';
import { createWebSpeechEngine } from './webspeech-engine.ts';

/*
 * Story 9.4 (FR-40, UX-DR18; epic-9-context Conflict 9): the one speech engine interface.
 * Dictation is online-only and optional: `webspeech` is the browser's Web Speech API in
 * pt-BR, `fake` the test engine Playwright drives, `none` no engine at all. The engine is
 * picked at build time by `VITE_SPEECH_ENGINE` (unset, empty or an unknown name: `none`).
 * No audio and no transcript ever reaches the api. E9-A9: `webspeech` is opt-in, because on
 * Chrome it sends the audio to the browser vendor's service; a default build dictates nothing
 * until Matheus approves vendor audio (Q18).
 */

export type SpeechEngineName = 'webspeech' | 'fake' | 'none';

export type SpeechResult = { kind: 'text'; text: string } | { kind: 'none' } | { kind: 'error'; reason: string };

export interface SpeechEngine {
  readonly name: SpeechEngineName;
  available(): boolean;
  /** One utterance in pt-BR; resolves when heard, stopped (none) or failed. Aborting the signal resolves `none`. */
  listen(signal: AbortSignal): Promise<SpeechResult>;
}

const NONE: SpeechEngine = {
  name: 'none',
  available: () => false,
  listen: () => Promise.resolve({ kind: 'none' }),
};

/** The engine name a build carries: unset, empty or an unknown name reads `none` (E9-A9: `webspeech` is opt-in). */
export function speechEngineName(value: string | undefined = import.meta.env.VITE_SPEECH_ENGINE as string | undefined): SpeechEngineName {
  if (value === undefined || value === '') return 'none';
  return value === 'webspeech' || value === 'fake' || value === 'none' ? value : 'none';
}

export function createSpeechEngine(name: SpeechEngineName): SpeechEngine {
  if (name === 'webspeech') return createWebSpeechEngine();
  if (name === 'fake') return createFakeEngine();
  return NONE;
}
