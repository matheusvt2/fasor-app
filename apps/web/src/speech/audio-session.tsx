import {
  audioCountdownStartText,
  audioElapsedText,
  audioEmptyText,
  audioFieldStatus,
  audioForTarget,
  audioHeardNothing,
  audioMarkOf,
  audioQualityOf,
  isAudioCountdown,
  permissionForPath,
  permissionRefusalText,
  audioPermissionPath,
  toIso,
  type AudioFieldStep,
  type AudioFileRow,
  type AudioLiveWarning,
  type AudioMark,
  type AudioTarget,
} from '@app/domain';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { now } from '../clock.ts';
import { ui } from '../copy/ui.ts';
import { audioRowsOf, commitAudioCapture, type AudioCaptureInput } from '../db/audio-commit.ts';
import { ensureLocalBlob, readLocalBlob } from '../db/file-store.ts';
import { useLiveQuery } from '../db/live.ts';
import type { AppDatabase } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { useAiFeatures } from '../state/ai-features.tsx';
import { relatorioIdOfPath, useCan } from '../state/permissions.tsx';
import { useSession } from '../state/session.tsx';
import { useSyncActions } from '../state/sync-actions.ts';
import { browserRecorderDeps, isMicRefusal, startRecording, type Recording, type RecorderDeps } from './recorder.ts';

/*
 * Stories 31.3 and 31.4 (AD-30): one recording app-wide and what every audio field reads.
 *
 * `AudioRecorderProvider` owns the recording: starting one stops (and saves) any other, going
 * offline does not stop it, a button that goes away mid-recording ends it and keeps nothing. The
 * running state (elapsed, meter, warning) lives in a small external store read with
 * `useSyncExternalStore`, so only the recording field re-renders, at most 8 times a second, and
 * typing is never slowed. A stop measures the samples once, takes the kernel's quality, and
 * either says nothing was heard (no row, no blob, no op) or commits the audio and its Blob in one
 * transaction (`commitAudioCapture`). The screen is kept awake while it records, when the browser
 * can. One polite live region says the start, the stop, the countdown, the refusal, "Não ouvi
 * nada" and an arrival.
 *
 * The provider also reads the open relatório's audio rows once (live), which `useFieldAudio`
 * filters by target for the field's status line, mark and play. With no provider mounted (a
 * surface rendered alone in a unit test) the hooks are inert: no button, no line.
 */

/** A target's stable key: the same field always gives the same key. */
export function audioTargetKey(target: AudioTarget): string {
  const entries = Object.entries(target as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify(entries);
}

export type AudioPhase = 'idle' | 'starting' | 'recording' | 'countdown';

interface LiveRecording {
  key: string;
  phase: Exclude<AudioPhase, 'idle'>;
  elapsedMs: number;
  meter: number;
  warning: AudioLiveWarning | null;
}

/** What a field says after a tap that kept nothing: the microphone refused or failed, or nothing heard. */
export type AudioNotice = { key: string; kind: 'refused' | 'failed' | 'empty' };

interface StoreState {
  live: LiveRecording | null;
  notice: AudioNotice | null;
}

function createStore() {
  let state: StoreState = { live: null, notice: null };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next: Partial<StoreState>) => {
      state = { ...state, ...next };
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

type Store = ReturnType<typeof createStore>;

/** The relatório's audio rows and which of them this device still holds the bytes of. */
interface AudioRows {
  rows: readonly AudioFileRow[];
  local: ReadonlySet<string>;
}

const NO_AUDIO_ROWS: AudioRows = { rows: [], local: new Set() };

interface AudioContextValue {
  store: Store;
  /** Whether this browser can record at all (MediaRecorder, getUserMedia, Web Audio). */
  canRecord: boolean;
  online: boolean;
  relatorioId: string | null;
  audio: AudioRows;
  toggle: (key: string, target: AudioTarget) => void;
  /** A button that goes away: its recording, if any, ends and keeps nothing. */
  discard: (key: string) => void;
  announce: (text: string) => void;
  play: (row: AudioFileRow) => void;
  playing: string | null;
}

const AudioContext = createContext<AudioContextValue | null>(null);

/** What a stop commits; injected for the unit tests. */
export type AudioCommit = (input: AudioCaptureInput) => Promise<void>;

export interface AudioRecorderCoreProps {
  children: ReactNode;
  /** The browser's parts; null when it cannot record. */
  deps: RecorderDeps | null;
  online: boolean;
  relatorioId: string | null;
  /** The signed-in user (who writes the create op), or null while none. */
  author: { companyId: string; actorId: string } | null;
  commit: AudioCommit;
  /** The relatório's audio rows (live in the app). */
  audio?: AudioRows;
  /** Plays a row's bytes: hands back a stop function, or null when it cannot. */
  player?: (row: AudioFileRow, onEnded: () => void) => Promise<(() => void) | null>;
  wakeLock?: () => Promise<{ release: () => Promise<void> } | null>;
}

interface Current {
  key: string;
  target: AudioTarget;
  relatorioId: string;
  recording: Recording | null;
  /** Set when the recording should end as soon as it has started (a stop tapped meanwhile, or a discard). */
  pendingEnd: 'save' | 'discard' | null;
  saidWarnings: Set<AudioLiveWarning>;
  countdownSaid: boolean;
  wake: { release: () => Promise<void> } | null;
}

async function browserWakeLock(): Promise<{ release: () => Promise<void> } | null> {
  const lock = (globalThis.navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
  if (lock === undefined) return null;
  try {
    return await lock.request('screen');
  } catch {
    return null;
  }
}

/** The provider with every dependency named: the app's `AudioRecorderProvider` and the unit tests both use it. */
export function AudioRecorderCore({ children, deps, online, relatorioId, author, commit, audio = NO_AUDIO_ROWS, player, wakeLock = browserWakeLock }: AudioRecorderCoreProps) {
  const store = useMemo(createStore, []);
  const current = useRef<Current | null>(null);
  const [message, setMessage] = useState<{ text: string; n: number }>({ text: '', n: 0 });
  const announce = useCallback((text: string) => setMessage((before) => ({ text, n: before.n + 1 })), []);
  const latest = useRef({ deps, author, commit, wakeLock, announce });
  latest.current = { deps, author, commit, wakeLock, announce };

  const finish = useCallback(
    async (entry: Current, how: 'save' | 'discard') => {
      if (current.current === entry) current.current = null;
      if (store.get().live?.key === entry.key) store.set({ live: null });
      void entry.wake?.release().catch(() => undefined);
      const recording = entry.recording;
      if (recording === null) {
        entry.pendingEnd = how;
        return;
      }
      if (how === 'discard') {
        recording.cancel();
        return;
      }
      const { announce: say, author: who, commit: save } = latest.current;
      let result;
      try {
        result = await recording.stop();
      } catch {
        return;
      }
      const quality = audioQualityOf(result.measures);
      if (audioHeardNothing(quality.reasons)) {
        store.set({ notice: { key: entry.key, kind: 'empty' } });
        say(audioEmptyText());
        return;
      }
      say(ui.audio.ended(audioElapsedText(result.measures.duration_ms)));
      if (who === null) return;
      try {
        await save({
          companyId: who.companyId,
          actorId: who.actorId,
          relatorioId: entry.relatorioId,
          fileId: newId(),
          target: entry.target,
          quality,
          blob: result.blob,
          mime: result.mime,
        });
      } catch {
        say(ui.audio.saveFailed);
      }
    },
    [store],
  );

  const start = useCallback(
    async (key: string, target: AudioTarget, inRelatorio: string) => {
      const { deps: parts, wakeLock: keepAwake, announce: say } = latest.current;
      if (parts === null) return;
      const other = current.current;
      if (other !== null) await finish(other, 'save');
      const entry: Current = { key, target, relatorioId: inRelatorio, recording: null, pendingEnd: null, saidWarnings: new Set(), countdownSaid: false, wake: null };
      current.current = entry;
      store.set({ live: { key, phase: 'starting', elapsedMs: 0, meter: 0, warning: null }, notice: null });
      let recording: Recording;
      try {
        recording = await startRecording(parts, {
          onTick: (tick) => {
            if (current.current !== entry) return;
            const countdown = isAudioCountdown(tick.elapsedMs);
            if (countdown && !entry.countdownSaid) {
              entry.countdownSaid = true;
              latest.current.announce(audioCountdownStartText());
            }
            store.set({ live: { key, phase: countdown ? 'countdown' : 'recording', elapsedMs: tick.elapsedMs, meter: tick.meter, warning: tick.warning } });
          },
          // At 3:00 the recording ends itself and saves as a tap would.
          onLimit: () => {
            if (current.current === entry) void finish(entry, 'save');
          },
        });
      } catch (error) {
        if (current.current === entry) current.current = null;
        const refused = isMicRefusal(error);
        store.set({ live: null, notice: { key, kind: refused ? 'refused' : 'failed' } });
        say(refused ? ui.audio.refused : ui.audio.failed);
        return;
      }
      entry.recording = recording;
      if (entry.pendingEnd !== null) {
        const how = entry.pendingEnd;
        entry.pendingEnd = null;
        if (how === 'discard') recording.cancel();
        else void finish(entry, 'save');
        return;
      }
      say(ui.audio.started);
      entry.wake = await keepAwake();
      if (current.current !== entry) void entry.wake?.release().catch(() => undefined);
    },
    [finish, store],
  );

  const toggle = useCallback(
    (key: string, target: AudioTarget) => {
      const entry = current.current;
      if (entry !== null && entry.key === key) {
        if (entry.recording === null) return;
        void finish(entry, 'save');
        return;
      }
      if (relatorioId === null) return;
      void start(key, target, relatorioId);
    },
    [finish, start, relatorioId],
  );

  const discard = useCallback(
    (key: string) => {
      const entry = current.current;
      if (entry !== null && entry.key === key) void finish(entry, 'discard');
    },
    [finish],
  );

  // A provider that goes away (sign-out) keeps nothing of a recording.
  useEffect(
    () => () => {
      const entry = current.current;
      if (entry !== null) void finish(entry, 'discard');
    },
    [finish],
  );

  const [playing, setPlaying] = useState<string | null>(null);
  const stopPlaying = useRef<(() => void) | null>(null);
  const play = useCallback(
    (row: AudioFileRow) => {
      stopPlaying.current?.();
      stopPlaying.current = null;
      if (playing === row.id) {
        setPlaying(null);
        return;
      }
      if (player === undefined) return;
      setPlaying(row.id);
      void player(row, () => {
        stopPlaying.current = null;
        setPlaying((now) => (now === row.id ? null : now));
      }).then((stop) => {
        if (stop === null) setPlaying((now) => (now === row.id ? null : now));
        else stopPlaying.current = stop;
      });
    },
    [player, playing],
  );
  useEffect(() => () => stopPlaying.current?.(), []);

  const value = useMemo<AudioContextValue>(
    () => ({ store, canRecord: deps !== null, online, relatorioId, audio, toggle, discard, announce, play, playing }),
    [store, deps, online, relatorioId, audio, toggle, discard, announce, play, playing],
  );
  return (
    <AudioContext value={value}>
      {children}
      <p className="visually-hidden" role="status" aria-live="polite" data-testid="audio-announcer" data-n={message.n}>
        {message.text}
      </p>
    </AudioContext>
  );
}

/** Reads the relatório's audio rows and which ones keep their bytes here (live). */
async function readAudioRows(db: AppDatabase, relatorioId: string): Promise<AudioRows> {
  const rows = await audioRowsOf(db, relatorioId);
  const local = new Set<string>();
  for (const row of rows) {
    if ((await readLocalBlob(db, row.id)) !== null) local.add(row.id);
  }
  return { rows, local };
}

let recorderDeps: RecorderDeps | null | undefined;

/** The app's provider: the session's user and database, the open relatório, the browser's recorder. */
export function AudioRecorderProvider({ children, deps }: { children: ReactNode; deps?: RecorderDeps | null }) {
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const { pathname } = useLocation();
  const relatorioId = relatorioIdOfPath(pathname);
  const { fetchFile } = useSyncActions();
  const resolved = useMemo(() => {
    if (deps !== undefined) return deps;
    recorderDeps ??= browserRecorderDeps();
    return recorderDeps;
  }, [deps]);
  const observed = useLiveQuery(async () => (db === null || relatorioId === null ? null : { db, relatorioId, audio: await readAudioRows(db, relatorioId) }), [db, relatorioId], null);
  const audio = observed !== null && observed.db === db && observed.relatorioId === relatorioId ? observed.audio : NO_AUDIO_ROWS;
  const author = useMemo(() => (user === null ? null : { companyId: user.companyId, actorId: user.id }), [user]);
  const commit = useCallback<AudioCommit>(
    async (input) => {
      if (db === null) throw new Error('no database');
      await commitAudioCapture(db, input, { newId, now });
    },
    [db],
  );
  const player = useCallback(
    async (row: AudioFileRow, onEnded: () => void): Promise<(() => void) | null> => {
      if (db === null) return null;
      const blob = await ensureLocalBlob(db, row.id, 'original', { fetchFile, nowIso: toIso(now()) });
      if (blob === null || typeof URL.createObjectURL !== 'function') return null;
      const url = URL.createObjectURL(blob);
      const element = new Audio(url);
      let done = false;
      const end = () => {
        if (done) return;
        done = true;
        element.pause();
        URL.revokeObjectURL(url);
        onEnded();
      };
      element.addEventListener('ended', end);
      element.addEventListener('error', end);
      try {
        await element.play();
      } catch {
        end();
        return null;
      }
      return end;
    },
    [db, fetchFile],
  );
  return (
    <AudioRecorderCore deps={resolved} online={session.online} relatorioId={relatorioId} author={author} commit={commit} audio={audio} player={player}>
      {children}
    </AudioRecorderCore>
  );
}

const IDLE: LiveRecording | null = null;

/** The running state of one field's recording (null when it is not the one recording). */
function useLive(context: AudioContextValue | null, key: string): LiveRecording | null {
  const store = context?.store;
  const subscribe = useCallback((listener: () => void) => (store === undefined ? () => undefined : store.subscribe(listener)), [store]);
  return useSyncExternalStore(subscribe, () => {
    const live = store?.get().live ?? null;
    return live !== null && live.key === key ? live : IDLE;
  });
}

function useNotice(context: AudioContextValue | null, key: string): AudioNotice['kind'] | null {
  const store = context?.store;
  const subscribe = useCallback((listener: () => void) => (store === undefined ? () => undefined : store.subscribe(listener)), [store]);
  return useSyncExternalStore(subscribe, () => {
    const notice = store?.get().notice ?? null;
    return notice !== null && notice.key === key ? notice.kind : null;
  });
}

/** What the lines under a field read of its recording: the warning and the last tap's refusal or failure. */
export function useAudioRecording(target: AudioTarget | null): { recording: boolean; warning: AudioLiveWarning | null; refused: boolean; failed: boolean } {
  const context = use(AudioContext);
  const key = target === null ? '' : audioTargetKey(target);
  const live = useLive(context, key);
  const notice = useNotice(context, key);
  const recording = live?.phase === 'recording' || live?.phase === 'countdown';
  return { recording, warning: recording ? (live?.warning ?? null) : null, refused: notice === 'refused', failed: notice === 'failed' };
}

export interface AudioButtonState {
  /** Whether the button is drawn at all: the browser records, the server transcribes (AI features on), a provider is mounted. */
  available: boolean;
  phase: AudioPhase;
  elapsedMs: number;
  /** Bars lit on the meter, 0 to 5. */
  level: number;
  warning: AudioLiveWarning | null;
  /** The button's name: "Gravar áudio: …" idle, "Parar a gravação: …" while recording. */
  label: string;
  /** The reason the button is disabled (the role may not write the field, or the field has no row yet), or null. */
  disabledReason: string | null;
  refused: boolean;
  failed: boolean;
  toggle: () => void;
}

/**
 * One field's Audio button. `disabledReason` given by the caller (a photo or a point not saved
 * yet) or the role's missing key draws it disabled with that reason; with no provider, a browser
 * that cannot record, or the server's AI features off (no job would transcribe it) it is absent.
 */
export function useAudioButton(target: AudioTarget | null, options: { label: string; disabledReason?: string | null }): AudioButtonState {
  const context = use(AudioContext);
  const aiOn = useAiFeatures();
  const key = target === null ? '' : audioTargetKey(target);
  const live = useLive(context, key);
  const notice = useNotice(context, key);
  const need = target === null ? 'none' : permissionForPath(audioPermissionPath(target), { kind: 'put', value: null });
  const allowed = useCan(need);
  const discard = context?.discard;
  // A button that goes away (its surface left) ends its own recording and keeps nothing.
  useEffect(() => () => discard?.(key), [discard, key]);
  const phase: AudioPhase = live?.phase ?? 'idle';
  const recording = phase === 'recording' || phase === 'countdown';
  const disabledReason = options.disabledReason ?? (target === null ? null : allowed || need === 'none' ? null : permissionRefusalText(need));
  return {
    available: context !== null && context.canRecord && aiOn,
    phase,
    elapsedMs: live?.elapsedMs ?? 0,
    level: live?.meter ?? 0,
    warning: live?.warning ?? null,
    label: recording ? ui.audio.stop(options.label) : ui.audio.record(options.label),
    disabledReason,
    refused: notice === 'refused',
    failed: notice === 'failed',
    toggle: () => {
      if (context === null || target === null || disabledReason !== null) return;
      context.toggle(key, target);
    },
  };
}

export interface FieldAudioState {
  /** The status line of the newest audio on its way, or "Não ouvi nada" after an empty recording; null with none. */
  status: { step: AudioFieldStep | 'empty'; text: string } | null;
  /** The newest transcribed audio of the field, with its mark; null with none. */
  done: { row: AudioFileRow; mark: AudioMark; duration: string } | null;
  transcriptHeard: string | null;
  /** Play of the done audio: whether it plays now, and the reason it cannot (offline with no local copy). */
  playing: boolean;
  playDisabledReason: string | null;
  play: () => void;
  /** Says a line through the provider's live region. */
  announce: (text: string) => void;
}

const INERT: FieldAudioState = { status: null, done: null, transcriptHeard: null, playing: false, playDisabledReason: null, play: () => undefined, announce: () => undefined };

/** What one field shows of its audios: the status line, the mark of the newest transcribed one, play. */
export function useFieldAudio(target: AudioTarget | null, currentText: string | null | undefined): FieldAudioState {
  const context = use(AudioContext);
  const key = target === null ? '' : audioTargetKey(target);
  const notice = useNotice(context, key);
  if (context === null || target === null) return INERT;
  const { pending, done } = audioForTarget(context.audio.rows, target);
  const status =
    notice === 'empty'
      ? { step: 'empty' as const, text: audioEmptyText() }
      : pending === null
        ? null
        : audioFieldStatus(pending, { online: context.online, uploaded: pending.uploaded_at !== null });
  const playDisabledReason = done !== null && !context.online && !context.audio.local.has(done.id) ? ui.audio.needsConnection : null;
  return {
    status,
    done: done === null ? null : { row: done, mark: audioMarkOf(done, currentText), duration: audioElapsedText(done.quality.duration_ms) },
    transcriptHeard: done?.transcript_heard ?? null,
    playing: done !== null && context.playing === done.id,
    playDisabledReason,
    play: () => {
      if (done !== null && playDisabledReason === null) context.play(done);
    },
    announce: context.announce,
  };
}
