import type { AudioFileRow, AudioStatus, AudioTarget } from '../schemas/entities.ts';
import { plural } from '../text/plural.ts';
import { AUDIO_QUALITY_THRESHOLDS, audioQualityNote } from './quality.ts';

/*
 * Stories 31.3 and 31.4 (AD-30): the rules of a recording and of the field it fills, once. The
 * limits, the live warnings, the elapsed and countdown words, the field's status line, the mark
 * of a text that came from an audio and which audio of a field is shown. `apps/web` only feeds
 * the numbers (the running measures, the elapsed time, the field's text) and draws the answer.
 */

/** The longest recording, where the countdown starts, and how long a live condition holds before it is said. */
export const AUDIO_RECORDING_LIMITS = {
  max_ms: 180_000,
  countdown_from_ms: 170_000,
  warning_hold_ms: 1_500,
} as const;

/** A condition said while recording, in the order it wins when several hold. */
export type AudioLiveWarning = 'clipping' | 'low_level' | 'noisy';

/** The running measures of the last moments of a recording (the device's window). */
export interface AudioLiveMeasures {
  /** The RMS of the recent samples, 0 to 1 of full scale. */
  level: number;
  /** The share of recent samples that clipped, 0 to 1. */
  clipped_share: number;
  /** The noise floor against the voice of the recent seconds (RMS over RMS); 0 with no voice. */
  noise_ratio: number;
}

/** The running measures plus how long each condition has held without a break, in milliseconds. */
export interface AudioLiveWindow extends AudioLiveMeasures {
  low_level_ms: number;
  clipping_ms: number;
  noisy_ms: number;
}

/**
 * Which conditions hold in this instant, by the quality thresholds (a value on a threshold is
 * good). The device adds a frame's time to a condition that holds and resets one that does not.
 */
export function audioLiveConditions(measures: AudioLiveMeasures): Record<AudioLiveWarning, boolean> {
  const T = AUDIO_QUALITY_THRESHOLDS;
  return {
    clipping: measures.clipped_share > T.max_clipped_share,
    low_level: measures.level < T.min_level,
    noisy: measures.noise_ratio > T.max_noise_ratio,
  };
}

/** The warning to show now: a condition that holds and has held longer than `warning_hold_ms`; clipping, then low level, then noise. */
export function audioLiveWarning(window: AudioLiveWindow): AudioLiveWarning | null {
  const holds = audioLiveConditions(window);
  const hold = AUDIO_RECORDING_LIMITS.warning_hold_ms;
  if (holds.clipping && window.clipping_ms > hold) return 'clipping';
  if (holds.low_level && window.low_level_ms > hold) return 'low_level';
  if (holds.noisy && window.noisy_ms > hold) return 'noisy';
  return null;
}

// Verbatim from `62-audio-estados.html` (b) and EXPERIENCE.md › Recording warning.
const WARNING_TEXT: Readonly<Record<AudioLiveWarning, string>> = {
  low_level: 'Fale mais perto do aparelho',
  clipping: 'Muito alto, afaste um pouco',
  noisy: 'Muito ruído em volta',
};

/** The one line a live warning shows and the live region says once. */
export function audioLiveWarningText(warning: AudioLiveWarning): string {
  return WARNING_TEXT[warning];
}

/** The bars a level lights on the five-bar meter (0 to 5). */
const METER_STEPS = [0.005, 0.015, 0.03, 0.08, 0.2] as const;

/** How many of the meter's five bars a running level lights. */
export function audioMeterLevel(level: number): number {
  return METER_STEPS.filter((step) => level >= step).length;
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The elapsed time of a recording: "0:12", "2:50". */
export function audioElapsedText(ms: number): string {
  return clock(ms / 1000);
}

/** True from the countdown on (2:50). */
export function isAudioCountdown(ms: number): boolean {
  return ms >= AUDIO_RECORDING_LIMITS.countdown_from_ms;
}

/** The time left before the recording ends itself, from the countdown: "0:10", "0:08". */
export function audioCountdownText(ms: number): string {
  return clock(Math.ceil((AUDIO_RECORDING_LIMITS.max_ms - ms) / 1000));
}

/** What the live region says once when the countdown starts (EXPERIENCE.md › Recording): "Faltam 10 segundos". */
export function audioCountdownStartText(): string {
  const seconds = (AUDIO_RECORDING_LIMITS.max_ms - AUDIO_RECORDING_LIMITS.countdown_from_ms) / 1000;
  return `Faltam ${plural(seconds, 'segundo', 'segundos')}`;
}

/**
 * The step of a field's status line: while its audio is on its way, and (Story 31.5) `moved`, a
 * measurement table whose newest transcribed speech was no reading and went to OBSERVAÇÕES.
 */
export type AudioFieldStep = 'saved' | 'sending' | 'transcribing' | 'moved';

// Verbatim from `62-audio-estados.html` (c) and (g) and EXPERIENCE.md › Audio waiting.
const STEP_TEXT: Readonly<Record<AudioFieldStep, string>> = {
  saved: 'Áudio guardado, aguardando sinal',
  sending: 'Enviando',
  transcribing: 'Transcrevendo',
  moved: 'Não reconheci uma leitura. O texto foi para Observações.',
};

/** Story 31.5: the line a measurement table shows once its newest transcribed speech was no reading. */
export function audioMovedStatus(): { step: 'moved'; text: string } {
  return { step: 'moved', text: STEP_TEXT.moved };
}

/**
 * The status line of a field whose newest audio is on its way: `queued` reads "saved" offline
 * and "sending" with signal (`uploaded` says whether the server holds the bytes; the line is the
 * same either way until the job takes it), `transcribing` reads "transcribing". A `done`,
 * `failed` or `dismissed` audio has no status line (the mark, or Story 31.6's lines).
 */
export function audioFieldStatus(audio: { audio_status: AudioStatus }, context: { online: boolean; uploaded: boolean }): { step: AudioFieldStep; text: string } | null {
  if (audio.audio_status === 'transcribing') return { step: 'transcribing', text: STEP_TEXT.transcribing };
  if (audio.audio_status !== 'queued') return null;
  const step: AudioFieldStep = context.online ? 'sending' : 'saved';
  return { step, text: STEP_TEXT[step] };
}

/** A recording too short or with no speech, which is not saved (EXPERIENCE.md › Nothing heard). */
export function audioEmptyText(): string {
  return 'Não ouvi nada, grave de novo';
}

/** True when a recording's measures say nothing worth sending was heard: it is not saved. */
export function audioHeardNothing(reasons: readonly string[]): boolean {
  return reasons.includes('too_short') || reasons.includes('no_speech');
}

export interface AudioMark {
  tag: string;
  edited: boolean;
  poor: boolean;
  /** The amber line of a poor recording, or null. */
  note: string | null;
}

/**
 * The mark of a field whose text came from an audio (`62-audio-estados.html` (d)): "Áudio",
 * "Áudio, editado" once the field's text no longer holds the audio's written text (its heard text
 * when nothing was written), compared trimmed; a poor recording adds its note.
 */
export function audioMarkOf(
  audio: Pick<AudioFileRow, 'transcript_written' | 'transcript_heard' | 'quality'>,
  currentFieldText: string | null | undefined,
): AudioMark {
  const said = (audio.transcript_written ?? audio.transcript_heard ?? '').trim();
  const field = (currentFieldText ?? '').trim();
  const edited = said !== '' && !field.includes(said);
  return {
    // Verbatim from `62-audio-estados.html` (d).
    tag: edited ? 'Áudio, editado' : 'Áudio',
    edited,
    poor: audio.quality.verdict === 'poor',
    note: audioQualityNote(audio.quality),
  };
}

/** True when two targets name the same field. */
export function sameAudioTarget(a: AudioTarget, b: AudioTarget): boolean {
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

interface TargetedAudio {
  id: string;
  kind: string;
  removed_at: string | null;
  audio_status: AudioStatus;
  audio_target: AudioTarget;
  not_a_reading?: boolean | undefined;
}

/**
 * Story 31.5 (AD-30): the field an audio's text was written into. A measurement table's speech that
 * was no reading went to its ficha's OBSERVAÇÕES (`not_a_reading`), so that field shows its mark;
 * every other audio's text is in the field it targets.
 */
export function audioWrittenTarget(audio: Pick<TargetedAudio, 'audio_target' | 'not_a_reading'>): AudioTarget {
  const target = audio.audio_target;
  if (target.type === 'table' && audio.not_a_reading === true) return { type: 'sheet_field', block_id: target.block_id, field: 'observations' };
  return target;
}

export interface TargetAudios<T> {
  /** The newest audio still on its way (`queued`, `transcribing`), for the status line. */
  pending: T | null;
  /** The newest `done` audio whose text was written into this field, for the mark. */
  done: T | null;
  /** Story 31.6: the newest `failed` audio of this field, for "Não foi possível transcrever". */
  failed: T | null;
  /** Story 31.6: the newest `dismissed` audio of this field, reachable from it. */
  dismissed: T | null;
  /** Story 31.5: on a measurement table, the newest transcribed speech when it was no reading; else null. */
  moved: T | null;
}

/**
 * The audios of one field the field shows. A field can hold several audios; ids are uuid v7, so the
 * newest is the greatest id. `done` reads the field the text was written into (`audioWrittenTarget`,
 * so OBSERVAÇÕES shows a table's speech that was no reading); the others read the audio's own target.
 */
export function audioForTarget<T extends TargetedAudio>(files: readonly T[], target: AudioTarget): TargetAudios<T> {
  let pending: T | null = null;
  let done: T | null = null;
  let failed: T | null = null;
  let dismissed: T | null = null;
  let lastDone: T | null = null;
  const newer = (held: T | null, file: T) => held === null || file.id > held.id;
  for (const file of files) {
    if (file.kind !== 'audio' || file.removed_at !== null) continue;
    if (file.audio_status === 'done' && sameAudioTarget(audioWrittenTarget(file), target) && newer(done, file)) done = file;
    if (!sameAudioTarget(file.audio_target, target)) continue;
    if (file.audio_status === 'queued' || file.audio_status === 'transcribing') {
      if (newer(pending, file)) pending = file;
    } else if (file.audio_status === 'failed') {
      if (newer(failed, file)) failed = file;
    } else if (file.audio_status === 'dismissed') {
      if (newer(dismissed, file)) dismissed = file;
    } else if (newer(lastDone, file)) lastDone = file;
  }
  const moved = target.type === 'table' && lastDone !== null && lastDone.not_a_reading === true ? lastDone : null;
  return { pending, done, failed, dismissed, moved };
}

/** The arrival toast of a sync that brought audios to `done`: "1 áudio transcrito", "3 áudios transcritos". */
export function audiosTranscritosText(count: number): string {
  // Verbatim from EXPERIENCE.md › Text from audio ("N áudios transcritos").
  return plural(count, 'áudio transcrito', 'áudios transcritos');
}
