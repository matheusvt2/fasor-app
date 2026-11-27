import {
  audioCountdownStartText,
  audioElapsedText,
  audioEmptyText,
  audioFieldStatus,
  audioForTarget,
  audioHeardNothing,
  audioMarkOf,
  audioMovedStatus,
  audioQualityOf,
  heldAudioActions,
  isAudioCountdown,
  permissionForPath,
  permissionRefusalText,
  audioPermissionPath,
  aiRewriteFormer,
  aiRewriteRestore,
  aiRewriteSource,
  aiRewriteWrite,
  relatorioOpEnvelope,
  toIso,
  type AiRewriteFormer,
  type AiWriteResponse,
  type OpDraft,
  type AudioFieldStep,
  type AudioFileRow,
  type AudioLiveWarning,
  type AudioMark,
  type AudioTarget,
  quotaExceededText,
} from '@app/domain';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { now } from '../clock.ts';
import { ui } from '../copy/ui.ts';
import { audioRowsOf, commitAudioCapture, commitAudioDismiss, type AudioCaptureInput } from '../db/audio-commit.ts';
import { commitBatch } from '../db/commit.ts';
import { lastOpIdFor } from '../db/generate-store.ts';
import { toSnapshot } from '../db/snapshot.ts';
import { ensureLocalBlob, readLocalBlob } from '../db/file-store.ts';
import { useLiveQuery } from '../db/live.ts';
import type { AppDatabase } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { useAiFeatures } from '../state/ai-features.tsx';
import { relatorioIdOfPath, useCan } from '../state/permissions.tsx';
import { useSession } from '../state/session.tsx';
import { useSyncActions } from '../state/sync-actions.ts';
import { SyncRequestError } from '../sync/client.ts';
import { browserRecorderDeps, isMicRefusal, startRecording, type Recording, type RecorderDeps } from './recorder.ts';

/*
 * Stories 31.3 and 31.4 (AD-30): one recording app-wide and what every audio field reads.
 *
 * `AudioRecorderProvider` owns the recording: starting one stops (and saves) any other, going
 * offline does not stop it, a button that goes away mid-recording ends it and (e31f) saves it to
 * its target; only the provider going away (sign-out, no one to write the op) keeps nothing. The
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

/** What a field says after a tap that kept nothing: the microphone refused or failed, nothing heard, or (e31f) a recording the device could not keep. */
export type AudioNotice = { key: string; kind: 'refused' | 'failed' | 'empty' | 'unsaved' };

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
  /** e31f: a button that goes away: its recording, if any, ends and is saved to its target. */
  release: (key: string) => void;
  announce: (text: string) => void;
  play: (row: AudioFileRow) => void;
  playing: string | null;
  /** Story 31.6: "Tentar de novo" of a failed audio; rejects when the server refused it. */
  retranscribe: (row: AudioFileRow) => Promise<void>;
  /** Story 31.6: "Dispensar" of a failed audio (the device's one status write). */
  dismiss: (row: AudioFileRow) => Promise<void>;
  /** Story 31.9: a tap on the AI control of a field; absent, the control is not drawn. */
  aiWrite: AiWriteRun | null;
  /** Story 31.9: "Desfazer" of the AI control: puts the field's former values back. */
  aiUndo: AiUndo | null;
}

/** Story 31.9: what one tap on the AI control ended with: the text written and the text the field held before (e31f), or the field left unchanged. */
export type AiWriteOutcome = { kind: 'written'; text: string; former: AiRewriteFormer } | { kind: 'refused' };

/** Security pass 2026-11-26 (A1): the server answered `429 quota_exceeded` (the company's daily ceiling of this paid work). */
export function isQuotaExceeded(error: unknown): boolean {
  return error instanceof SyncRequestError && error.failure.kind === 'http' && error.failure.code === 'quota_exceeded';
}
/** Story 31.9: runs one tap on the AI control of a field (online); rejects on a call that failed. */
export type AiWriteRun = (target: AudioTarget) => Promise<AiWriteOutcome>;
/** Story 31.9: commits "Desfazer"; e31f: puts only the former text back, onto the field as it is now. */
export type AiUndo = (target: AudioTarget, former: AiRewriteFormer) => Promise<void>;

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
  /** Story 31.6: sends "Tentar de novo" (the server's retranscribe route); absent, the tap does nothing. */
  retranscribe?: (row: AudioFileRow) => Promise<void>;
  /** Story 31.6: commits "Dispensar"; absent, the tap does nothing. */
  dismiss?: (row: AudioFileRow) => Promise<void>;
  /** Story 31.9: runs a tap on the AI control; absent, no field draws the control. */
  aiWrite?: AiWriteRun;
  /** Story 31.9: commits the AI control's "Desfazer". */
  aiUndo?: AiUndo;
}

const NO_ACTION = () => Promise.resolve();

/** Story 31.9: how many times a tap on the AI control syncs again after a `409 not_caught_up`. */
const AI_WRITE_ROUNDS = 2;

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
export function AudioRecorderCore({
  children,
  deps,
  online,
  relatorioId,
  author,
  commit,
  audio = NO_AUDIO_ROWS,
  player,
  wakeLock = browserWakeLock,
  retranscribe = NO_ACTION,
  dismiss = NO_ACTION,
  aiWrite,
  aiUndo,
}: AudioRecorderCoreProps) {
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
      // e31f: a recording that could not be kept says so on its field, never lost without a word.
      const unsaved = () => {
        store.set({ notice: { key: entry.key, kind: 'unsaved' } });
        say(ui.audio.saveFailed);
      };
      let result;
      try {
        result = await recording.stop();
      } catch {
        unsaved();
        return;
      }
      const quality = audioQualityOf(result.measures);
      if (audioHeardNothing(quality.reasons)) {
        store.set({ notice: { key: entry.key, kind: 'empty' } });
        say(audioEmptyText());
        return;
      }
      if (who === null) {
        unsaved();
        return;
      }
      say(ui.audio.ended(audioElapsedText(result.measures.duration_ms)));
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
        unsaved();
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

  const release = useCallback(
    (key: string) => {
      const entry = current.current;
      if (entry !== null && entry.key === key) void finish(entry, 'save');
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
    () => ({ store, canRecord: deps !== null, online, relatorioId, audio, toggle, release, announce, play, playing, retranscribe, dismiss, aiWrite: aiWrite ?? null, aiUndo: aiUndo ?? null }),
    [store, deps, online, relatorioId, audio, toggle, release, announce, play, playing, retranscribe, dismiss, aiWrite, aiUndo],
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
  const { fetchFile, retranscribeAudio, syncNow, aiWrite: aiWriteRoute } = useSyncActions();
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
  const retranscribe = useCallback(
    async (row: AudioFileRow) => {
      if (retranscribeAudio === undefined) throw new Error('no sync client');
      await retranscribeAudio(row.id);
    },
    [retranscribeAudio],
  );
  const dismiss = useCallback(
    async (row: AudioFileRow) => {
      if (db === null || user === null) return;
      await commitAudioDismiss(db, { id: user.id, companyId: user.companyId }, row, { newId, now });
    },
    [db, user],
  );
  // Story 31.9: a tap on the AI control. The server reads the field from its own store, so this
  // device first sends what it holds (AD-15's barrier, retried after a sync); the answer is written
  // only when the server rewrote the very text this device shows, and still shows.
  const aiWrite = useCallback<AiWriteRun>(
    async (target) => {
      if (db === null || user === null || relatorioId === null || aiWriteRoute === undefined || target.type === 'table') return { kind: 'refused' };
      const options = { now: now() };
      await syncNow().catch(() => undefined);
      const before = aiRewriteSource(await toSnapshot(db, relatorioId), target, options);
      if (before === null) return { kind: 'refused' };
      let answer: AiWriteResponse | null = null;
      for (let attempt = 0; answer === null; attempt++) {
        try {
          answer = await aiWriteRoute(relatorioId, { target, last_op_id: await lastOpIdFor(db, relatorioId) });
        } catch (error) {
          const failure = error instanceof SyncRequestError && error.failure.kind === 'http' ? error.failure : null;
          if (failure?.code !== 'not_caught_up' || attempt >= AI_WRITE_ROUNDS) throw error;
          await syncNow().catch(() => undefined);
        }
      }
      if (answer.outcome !== 'written' || answer.source !== before.text) return { kind: 'refused' };
      const snapshot = await toSnapshot(db, relatorioId);
      if (aiRewriteSource(snapshot, target, options)?.text !== before.text) return { kind: 'refused' };
      const former = aiRewriteFormer(snapshot, target, options);
      const write = aiRewriteWrite(snapshot, target, answer.text, options);
      if (former === null || write === null) return { kind: 'refused' };
      const author = { id: user.id, companyId: user.companyId };
      // An ordinary put by the user (AD-30), named as the AI control's.
      await commitBatch(db, write.puts.map((put): OpDraft => ({ ...relatorioOpEnvelope(author, relatorioId), kind: 'put', path: put.path, value: put.value, meta: { ai_written: true } })), { newId, now });
      return { kind: 'written', text: answer.text, former };
    },
    [db, user, relatorioId, aiWriteRoute, syncNow],
  );
  // e31f: "Desfazer" reads the field as it is now and puts only the former text back onto it, so a
  // verdict, a Não ensaiado mark or a section's config changed after the write is never reverted.
  const aiUndo = useCallback<AiUndo>(
    async (target, former) => {
      if (db === null || user === null || relatorioId === null) return;
      const restore = aiRewriteRestore(await toSnapshot(db, relatorioId), target, former, { now: now() });
      if (restore === null) return;
      const author = { id: user.id, companyId: user.companyId };
      await commitBatch(db, restore.puts.map((put): OpDraft => ({ ...relatorioOpEnvelope(author, relatorioId), kind: 'put', path: put.path, value: put.value })), { newId, now });
    },
    [db, user, relatorioId],
  );
  return (
    <AudioRecorderCore
      deps={resolved}
      online={session.online}
      relatorioId={relatorioId}
      author={author}
      commit={commit}
      audio={audio}
      player={player}
      retranscribe={retranscribe}
      dismiss={dismiss}
      {...(aiWriteRoute === undefined ? {} : { aiWrite, aiUndo })}
    >
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
export function useAudioRecording(target: AudioTarget | null): { recording: boolean; warning: AudioLiveWarning | null; refused: boolean; failed: boolean; unsaved: boolean } {
  const context = use(AudioContext);
  const key = target === null ? '' : audioTargetKey(target);
  const live = useLive(context, key);
  const notice = useNotice(context, key);
  const recording = live?.phase === 'recording' || live?.phase === 'countdown';
  return { recording, warning: recording ? (live?.warning ?? null) : null, refused: notice === 'refused', failed: notice === 'failed', unsaved: notice === 'unsaved' };
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
  const release = context?.release;
  // e31f: a button that goes away ("Concluir" on the point editor, a step change, a layout swap) ends
  // its own recording and saves it to its target, as a tap would; nothing spoken is thrown away.
  useEffect(() => () => release?.(key), [release, key]);
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

/** Story 31.6: an audio of the field that failed or was dismissed, with play and the text as heard. */
export interface HeldAudioState {
  row: AudioFileRow;
  duration: string;
  playing: boolean;
  /** The reason play cannot run (offline with no local copy), or null. */
  playDisabledReason: string | null;
  play: () => void;
}

export interface FieldAudioState {
  /**
   * The status line of the newest audio on its way, "Não ouvi nada" after an empty recording, or
   * (Story 31.5, a measurement table) speech that was no reading; null with none.
   */
  status: { step: AudioFieldStep | 'empty'; text: string } | null;
  /** Story 31.6: the audio the status line speaks of (the ficha's hold line focuses its field by it), or null. */
  statusAudioId: string | null;
  /** The newest transcribed audio of the field, with its mark; null with none. */
  done: { row: AudioFileRow; mark: AudioMark; duration: string } | null;
  /** Story 31.6: the newest failed audio of the field ("Não foi possível transcrever"), or null. */
  failed: HeldAudioState | null;
  /** Story 31.6: the newest dismissed audio, shown while no newer text came from an audio; else null. */
  dismissed: HeldAudioState | null;
  /** Story 31.6: whether "Tentar de novo" can run (signal). */
  online: boolean;
  retranscribe: (row: AudioFileRow) => Promise<void>;
  dismiss: (row: AudioFileRow) => Promise<void>;
  transcriptHeard: string | null;
  /** Play of the done audio: whether it plays now, and the reason it cannot (offline with no local copy). */
  playing: boolean;
  playDisabledReason: string | null;
  play: () => void;
  /** Says a line through the provider's live region. */
  announce: (text: string) => void;
}

const INERT: FieldAudioState = {
  status: null,
  statusAudioId: null,
  done: null,
  failed: null,
  dismissed: null,
  online: false,
  retranscribe: NO_ACTION,
  dismiss: NO_ACTION,
  transcriptHeard: null,
  playing: false,
  playDisabledReason: null,
  play: () => undefined,
  announce: () => undefined,
};

/** The play reason of a row: offline with no local copy it needs a connection. */
function playReason(context: AudioContextValue, row: AudioFileRow): string | null {
  return !context.online && !context.audio.local.has(row.id) ? ui.audio.needsConnection : null;
}

function heldState(context: AudioContextValue, row: AudioFileRow | null): HeldAudioState | null {
  if (row === null) return null;
  const reason = playReason(context, row);
  return {
    row,
    duration: audioElapsedText(row.quality.duration_ms),
    playing: context.playing === row.id,
    playDisabledReason: reason,
    play: () => {
      if (reason === null) context.play(row);
    },
  };
}

/** e31f: one action of a not-done audio where it is listed: why it is disabled (or null), whether it runs, and the tap. */
export interface HeldAudioAction {
  disabledReason: string | null;
  busy: boolean;
  run: () => void;
}

/** e31f: "Tentar de novo" and "Dispensar" of one listed audio; each null where it does not apply. */
export interface HeldAudioControls {
  retry: HeldAudioAction | null;
  dismiss: HeldAudioAction | null;
}

const NO_CONTROLS: HeldAudioControls = { retry: null, dismiss: null };

/**
 * e31f (Matheus, 2026-11-26: "Dispensar na lista de pendências"): the actions of an audio that holds
 * the ficha and the emission, wherever it is listed (the ficha's hold line, the Export dialog's
 * rows), by the kernel's rule (`heldAudioActions`): "Dispensar" on every audio not done, "Tentar de
 * novo" where it applies. Both follow the audio's field permission (AD-29), and "Tentar de novo"
 * needs signal; each is disabled with its reason otherwise. Inert with no provider or no such row.
 */
export function useHeldAudioControls(audioId: string): HeldAudioControls {
  const context = use(AudioContext);
  const row = context?.audio.rows.find((one) => one.id === audioId) ?? null;
  const need = row === null ? 'none' : permissionForPath(audioPermissionPath(row.audio_target), { kind: 'put', value: null });
  const allowed = useCan(need);
  const [busy, setBusy] = useState(false);
  if (context === null || row === null) return NO_CONTROLS;
  const actions = heldAudioActions(row);
  const refusal = allowed || need === 'none' ? null : permissionRefusalText(need);
  const retryReason = refusal ?? (context.online ? null : ui.audio.retryNeedsConnection);
  return {
    retry: !actions.retry
      ? null
      : {
          disabledReason: retryReason,
          busy,
          run: () => {
            if (retryReason !== null || busy) return;
            setBusy(true);
            context
              .retranscribe(row)
              .catch((error: unknown) => context.announce(isQuotaExceeded(error) ? quotaExceededText('transcription') : ui.audio.retryFailed))
              .finally(() => setBusy(false));
          },
        },
    dismiss: !actions.dismiss
      ? null
      : {
          disabledReason: refusal,
          busy: false,
          run: () => {
            if (refusal !== null || busy) return;
            void context.dismiss(row).then(() => context.announce(ui.audio.dismissed));
          },
        },
  };
}

/** Story 31.5: play of one audio by its id (a spoken reading's Suggestion); null when the device does not hold the row. */
export function useAudioPlay(audioId: string | null): HeldAudioState | null {
  const context = use(AudioContext);
  if (context === null || audioId === null) return null;
  return heldState(context, context.audio.rows.find((row) => row.id === audioId) ?? null);
}

/** What one field shows of its audios: the status line, the mark of the newest transcribed one, play. */
export function useFieldAudio(target: AudioTarget | null, currentText: string | null | undefined): FieldAudioState {
  const context = use(AudioContext);
  const key = target === null ? '' : audioTargetKey(target);
  const notice = useNotice(context, key);
  if (context === null || target === null) return INERT;
  const { pending, done, failed, dismissed, moved } = audioForTarget(context.audio.rows, target);
  const status =
    notice === 'empty'
      ? { step: 'empty' as const, text: audioEmptyText() }
      : pending !== null
        ? audioFieldStatus(pending, { online: context.online, uploaded: pending.uploaded_at !== null })
        : moved !== null
          ? audioMovedStatus()
          : null;
  const playDisabledReason = done === null ? null : playReason(context, done);
  return {
    status,
    statusAudioId: notice === 'empty' ? null : (pending?.id ?? null),
    done: done === null ? null : { row: done, mark: audioMarkOf(done, currentText), duration: audioElapsedText(done.quality.duration_ms) },
    failed: heldState(context, failed),
    // A dismissed audio stays reachable from its field until a newer audio's text lands there.
    dismissed: dismissed !== null && (done === null || dismissed.id > done.id) ? heldState(context, dismissed) : null,
    online: context.online,
    retranscribe: context.retranscribe,
    dismiss: context.dismiss,
    transcriptHeard: done?.transcript_heard ?? null,
    playing: done !== null && context.playing === done.id,
    playDisabledReason,
    play: () => {
      if (done !== null && playDisabledReason === null) context.play(done);
    },
    announce: context.announce,
  };
}

/** Story 31.9: the AI control of one field ("Melhorar o texto com IA"), its line and its button. */
export interface AiWriteControlState {
  /** Whether the button is drawn: a runner is mounted, AI features are on, the field holds text and may be written here. */
  shown: boolean;
  /** "Escrevendo": the request runs; the field stays as it was. */
  busy: boolean;
  /** Why the button is disabled ("Precisa de conexão", the role's missing key), or null. */
  disabledReason: string | null;
  /** "Texto melhorado por IA" with "Desfazer": the field still holds the text the control wrote. */
  done: boolean;
  /** "Não foi possível melhorar o texto": the last tap left the field unchanged. */
  failed: boolean;
  /** The sentence of that failure: the plain one, or the kernel's daily ceiling sentence (security pass A1). */
  failedText: string;
  tap: () => void;
  undo: () => void;
}

/** The characters a field shows, compared without spacing (a section text arrives as its plain lines, `audioRichFieldText`). */
function shownText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Story 31.9 (FR-79): one field's AI control. Absent with no runner (no provider), with AI features
 * off, read-only, or on an empty field; offline it stays, disabled, "Precisa de conexão", and nothing
 * is queued. A tap shows "Escrevendo" until the answer: a written text replaces the field's (by an
 * ordinary op of the user's) and the line offers "Desfazer" while the field still holds it; a refused
 * answer or a failed call leaves the field as it was and says so, until the field changes.
 */
export function useAiWriteControl(target: AudioTarget | null, text: string | null | undefined, options: { readOnly?: boolean; disabledReason?: string | null } = {}): AiWriteControlState {
  const context = use(AudioContext);
  const aiOn = useAiFeatures();
  const need = target === null ? 'none' : permissionForPath(audioPermissionPath(target), { kind: 'put', value: null });
  const allowed = useCan(need);
  const [busy, setBusy] = useState(false);
  const [written, setWritten] = useState<{ text: string; target: AudioTarget; former: AiRewriteFormer } | null>(null);
  const [failedOn, setFailedOn] = useState<string | null>(null);
  const [failedText, setFailedText] = useState<string>(ui.aiWrite.failed);
  const shown = shownText(text);
  const run = context?.aiWrite ?? null;
  const undoRun = context?.aiUndo ?? null;
  const online = context?.online ?? false;
  const visible = context !== null && run !== null && aiOn && options.readOnly !== true && target !== null && shown !== '';
  const disabledReason = options.disabledReason ?? (!allowed && need !== 'none' ? permissionRefusalText(need) : online ? null : ui.aiWrite.needsConnection);
  const tap = () => {
    if (!visible || busy || disabledReason !== null || target === null || run === null) return;
    const from = shown;
    setBusy(true);
    setFailedOn(null);
    setFailedText(ui.aiWrite.failed);
    run(target)
      .then((outcome) => {
        if (outcome.kind === 'written') setWritten({ text: outcome.text, target, former: outcome.former });
        else setFailedOn(from);
      })
      .catch((error: unknown) => {
        // Security pass 2026-11-26 (A1): at the company's daily ceiling the line says so, with the kernel's sentence.
        if (isQuotaExceeded(error)) setFailedText(quotaExceededText('ai_write'));
        setFailedOn(from);
      })
      .finally(() => setBusy(false));
  };
  const undo = () => {
    if (written === null || undoRun === null) return;
    const { target: of, former } = written;
    setWritten(null);
    void undoRun(of, former).catch(() => undefined);
  };
  return {
    shown: visible,
    busy,
    disabledReason,
    done: visible && written !== null && shownText(written.text) === shown,
    // The failure line stays while the field holds the text the tap left unchanged.
    failed: visible && failedOn !== null && failedOn === shown,
    failedText,
    tap,
    undo,
  };
}
