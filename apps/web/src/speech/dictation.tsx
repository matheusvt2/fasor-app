import { dictatedText } from '@app/domain';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { SuggestionField } from '../components/suggestion-field.tsx';
import { ui } from '../copy/ui.ts';
import { createSpeechEngine, speechEngineName, type SpeechEngine } from './engine.ts';

/*
 * Story 9.4 (FR-40, UX-DR18; `components.css` Dictation button): one listening session
 * app-wide. The provider owns the engine and the session: starting one aborts any other, a
 * second tap on the pressed button stops it with no result, going offline aborts it. The
 * button is hidden -- never disabled, no element at all -- when the engine is `none`, the
 * engine says it is unavailable or the device is offline. A heard transcript goes to the
 * caller as component state; nothing is written until the engineer confirms it.
 */

interface Session {
  owner: string;
  controller: AbortController;
}

interface SpeechContextValue {
  engine: SpeechEngine;
  online: boolean;
  /** The Dictation button that listens now, by its id. */
  owner: string | null;
  start: (owner: string, onText: (text: string) => void) => void;
  stop: (owner: string) => void;
}

const SpeechContext = createContext<SpeechContextValue | null>(null);

let buildEngine: SpeechEngine | null = null;

/** The build's engine (`VITE_SPEECH_ENGINE`), made once. */
function defaultEngine(): SpeechEngine {
  buildEngine ??= createSpeechEngine(speechEngineName());
  return buildEngine;
}

export function SpeechEngineProvider({ online, engine: given, children }: { online: boolean; engine?: SpeechEngine; children: ReactNode }) {
  const engine = useMemo(() => given ?? defaultEngine(), [given]);
  const current = useRef<Session | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const start = useCallback(
    (id: string, onText: (text: string) => void) => {
      current.current?.controller.abort();
      const controller = new AbortController();
      const session: Session = { owner: id, controller };
      current.current = session;
      setOwner(id);
      setMessage('');
      const done = () => {
        if (current.current !== session) return;
        current.current = null;
        setOwner(null);
      };
      engine.listen(controller.signal).then(
        (result) => {
          done();
          if (controller.signal.aborted) return;
          if (result.kind === 'text' && result.text.trim() !== '') onText(result.text);
          else if (result.kind === 'error') setMessage(ui.dictation.failed);
        },
        () => {
          done();
          if (!controller.signal.aborted) setMessage(ui.dictation.failed);
        },
      );
    },
    [engine],
  );

  const stop = useCallback((id: string) => {
    if (current.current?.owner === id) current.current.controller.abort();
  }, []);

  // Dictation is online-only: going offline ends the session with no result.
  useEffect(() => {
    if (!online) current.current?.controller.abort();
  }, [online]);

  useEffect(() => () => current.current?.controller.abort(), []);

  const value = useMemo(() => ({ engine, online, owner, start, stop }), [engine, online, owner, start, stop]);
  return (
    <SpeechContext.Provider value={value}>
      {children}
      <p className="visually-hidden" role="status" data-testid="dictation-announcer">
        {message}
      </p>
    </SpeechContext.Provider>
  );
}

/** Whether a Dictation button shows: an engine that is there, and signal. */
export function useSpeechAvailable(): boolean {
  const context = useContext(SpeechContext);
  return context !== null && context.engine.name !== 'none' && context.online && context.engine.available();
}

/** One Dictation button's session: whether it shows, whether it listens, and its toggle. */
export function useDictation(onText: (text: string) => void, onStart?: () => void): { visible: boolean; listening: boolean; toggle: () => void } {
  const context = useContext(SpeechContext);
  const id = useId();
  const latest = useRef({ onText, onStart });
  latest.current = { onText, onStart };
  const visible = useSpeechAvailable();
  const listening = context !== null && context.owner === id;
  const stop = context?.stop;

  // A button that goes away (its surface left) ends its own session.
  useEffect(() => () => stop?.(id), [stop, id]);

  const toggle = () => {
    if (context === null) return;
    if (listening) {
      context.stop(id);
      return;
    }
    latest.current.onStart?.();
    context.start(id, (text) => latest.current.onText(text));
  };
  return { visible, listening, toggle };
}

/**
 * The Dictation button (`70-fotos.html` 419, `60-ficha.html` 384): round, 48 px, outlined,
 * `aria-pressed="true"` while listening with "Ouvindo…" beside it, said by a live region. Null when hidden.
 */
export function DictationButton({ label, onResult, onStart, className }: { label: string; onResult: (text: string) => void; onStart?: () => void; className?: string }) {
  const { visible, listening, toggle } = useDictation(onResult, onStart);
  if (!visible) return null;
  return (
    <span className={className === undefined ? 'dictation' : `dictation ${className}`}>
      <button type="button" className="dictation-btn" aria-pressed={listening} aria-label={label} onClick={toggle}>
        <svg className="ico" aria-hidden="true">
          <use href="/sprite.svg#i-mic" />
        </svg>
      </button>
      {/* The word as the mock draws it (CSS shows it while pressed), and, E9-Q11, a live region
          that always exists and holds the word only while listening, so it is announced. */}
      <span className="listening-word" aria-hidden="true">
        {ui.dictation.listening}
      </span>
      <span className="visually-hidden" aria-live="polite">
        {listening ? ui.dictation.listening : ''}
      </span>
    </span>
  );
}

/**
 * A prose field's dictation: the transcript as the field shows it (`dictatedText`), held
 * until "Usar" or a discard. `offer` takes a raw transcript.
 */
export function useProseDictation(): { pending: string | null; offer: (transcript: string) => void; discard: () => void } {
  const [pending, setPending] = useState<string | null>(null);
  const offer = useCallback((transcript: string) => {
    const text = dictatedText(transcript);
    setPending(text === '' ? null : text);
  }, []);
  const discard = useCallback(() => setPending(null), []);
  return { pending, offer, discard };
}

/** The dictated text under a prose field: a Suggestion field with "Usar". */
export function DictatedSuggestion({ text, onUse }: { text: string; onUse: () => void }) {
  return (
    <div className="dictated-suggestion">
      <SuggestionField label={ui.dictation.resultLabel} onConfirm={onUse} confirmLabel={ui.dictation.use}>
        {text}
      </SuggestionField>
    </div>
  );
}
