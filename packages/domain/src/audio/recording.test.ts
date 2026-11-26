import { describe, expect, it } from 'vitest';
import type { AudioQuality, AudioStatus, AudioTarget } from '../schemas/entities.ts';
import {
  AUDIO_QUALITY_THRESHOLDS,
  AUDIO_RECORDING_LIMITS,
  audioCountdownStartText,
  audioCountdownText,
  audioElapsedText,
  audioEmptyText,
  audioFieldStatus,
  audioForTarget,
  audioHeardNothing,
  audioLiveConditions,
  audioLiveWarning,
  audioLiveWarningText,
  audioMarkOf,
  audioMeterLevel,
  audioQualityNote,
  audiosTranscritosText,
  isAudioCountdown,
  sameAudioTarget,
} from './index.ts';

/*
 * Stories 31.3 and 31.4 (AD-30): the recording's limits and live warnings, its elapsed and
 * countdown words, a field's status line, the mark of a text from an audio and which audio of a
 * field shows. Written red first (batch e31b).
 */

const T = AUDIO_QUALITY_THRESHOLDS;
const HOLD = AUDIO_RECORDING_LIMITS.warning_hold_ms;
const calm = { level: 0.2, clipped_share: 0, noise_ratio: 0.05, low_level_ms: 0, clipping_ms: 0, noisy_ms: 0 };
const BLOCK = '019966b0-0031-7000-8000-000000000003';
const GOOD: AudioQuality = { level: 0.2, clipped_share: 0, noise_ratio: 0.05, duration_ms: 4000, speech_ms: 3000, verdict: 'good', reasons: [] };
const POOR: AudioQuality = { ...GOOD, noise_ratio: 0.5, verdict: 'poor', reasons: ['noisy'] };

describe('31.3-UNIT-001 the recording limits', () => {
  it('ends at 3:00, counts down from 2:50 and holds a warning 1.5 s', () => {
    expect(AUDIO_RECORDING_LIMITS).toEqual({ max_ms: 180_000, countdown_from_ms: 170_000, warning_hold_ms: 1_500 });
  });
});

describe('31.3-UNIT-002 audioLiveWarning', () => {
  it('says nothing for a calm window, at zero time held', () => {
    expect(audioLiveWarning(calm)).toBeNull();
    expect(audioLiveWarning({ ...calm, level: 0, low_level_ms: 0 })).toBeNull();
  });

  it('says low level only once it has held longer than the hold, and never on the threshold itself', () => {
    expect(audioLiveWarning({ ...calm, level: T.min_level - 0.001, low_level_ms: HOLD })).toBeNull();
    expect(audioLiveWarning({ ...calm, level: T.min_level - 0.001, low_level_ms: HOLD + 1 })).toBe('low_level');
    expect(audioLiveWarning({ ...calm, level: T.min_level, low_level_ms: HOLD + 1 })).toBeNull();
  });

  it('says clipping one step over its threshold, not on it', () => {
    expect(audioLiveWarning({ ...calm, clipped_share: T.max_clipped_share, clipping_ms: HOLD + 1 })).toBeNull();
    expect(audioLiveWarning({ ...calm, clipped_share: T.max_clipped_share + 0.001, clipping_ms: HOLD + 1 })).toBe('clipping');
  });

  it('says noise one step over its threshold, not on it', () => {
    expect(audioLiveWarning({ ...calm, noise_ratio: T.max_noise_ratio, noisy_ms: HOLD + 1 })).toBeNull();
    expect(audioLiveWarning({ ...calm, noise_ratio: T.max_noise_ratio + 0.001, noisy_ms: HOLD + 1 })).toBe('noisy');
  });

  it('a held time without the condition now says nothing (the device resets it)', () => {
    expect(audioLiveWarning({ ...calm, low_level_ms: 10_000, clipping_ms: 10_000, noisy_ms: 10_000 })).toBeNull();
  });

  it('puts clipping first, then low level, then noise', () => {
    const all = { level: 0.01, clipped_share: 0.5, noise_ratio: 0.9, low_level_ms: HOLD + 1, clipping_ms: HOLD + 1, noisy_ms: HOLD + 1 };
    expect(audioLiveWarning(all)).toBe('clipping');
    expect(audioLiveWarning({ ...all, clipping_ms: 0 })).toBe('low_level');
    expect(audioLiveWarning({ ...all, clipping_ms: 0, low_level_ms: 0 })).toBe('noisy');
  });

  it('names the conditions of an instant by the quality thresholds', () => {
    expect(audioLiveConditions({ level: T.min_level, clipped_share: T.max_clipped_share, noise_ratio: T.max_noise_ratio })).toEqual({ clipping: false, low_level: false, noisy: false });
    expect(audioLiveConditions({ level: 0, clipped_share: 1, noise_ratio: 1 })).toEqual({ clipping: true, low_level: true, noisy: true });
  });

  it('says each warning in the mock words', () => {
    expect(audioLiveWarningText('low_level')).toBe('Fale mais perto do aparelho');
    expect(audioLiveWarningText('clipping')).toBe('Muito alto, afaste um pouco');
    expect(audioLiveWarningText('noisy')).toBe('Muito ruído em volta');
  });
});

describe('31.3-UNIT-003 the meter, the elapsed and the countdown words', () => {
  it('lights 0 to 5 bars with the level', () => {
    expect(audioMeterLevel(0)).toBe(0);
    expect(audioMeterLevel(0.02)).toBe(2);
    expect(audioMeterLevel(0.1)).toBe(4);
    expect(audioMeterLevel(1)).toBe(5);
  });

  it('writes the elapsed time m:ss, rounding down', () => {
    expect(audioElapsedText(0)).toBe('0:00');
    expect(audioElapsedText(12_999)).toBe('0:12');
    expect(audioElapsedText(170_000)).toBe('2:50');
  });

  it('counts down from 2:50 and says the time left', () => {
    expect(isAudioCountdown(169_999)).toBe(false);
    expect(isAudioCountdown(170_000)).toBe(true);
    expect(audioCountdownText(170_000)).toBe('0:10');
    expect(audioCountdownText(172_001)).toBe('0:08');
    expect(audioCountdownText(180_000)).toBe('0:00');
    expect(audioCountdownStartText()).toBe('Faltam 10 segundos');
  });
});

describe('31.3-UNIT-004 audioFieldStatus and the empty recording', () => {
  const at = (audio_status: AudioStatus) => ({ audio_status });
  it('reads a queued audio as saved offline and sending online', () => {
    expect(audioFieldStatus(at('queued'), { online: false, uploaded: false })).toEqual({ step: 'saved', text: 'Áudio guardado, aguardando sinal' });
    expect(audioFieldStatus(at('queued'), { online: true, uploaded: false })).toEqual({ step: 'sending', text: 'Enviando' });
    expect(audioFieldStatus(at('queued'), { online: true, uploaded: true })).toEqual({ step: 'sending', text: 'Enviando' });
  });

  it('reads a transcribing audio as transcribing, and nothing for the others', () => {
    expect(audioFieldStatus(at('transcribing'), { online: false, uploaded: true })).toEqual({ step: 'transcribing', text: 'Transcrevendo' });
    for (const status of ['done', 'failed', 'dismissed'] as const) expect(audioFieldStatus(at(status), { online: true, uploaded: true })).toBeNull();
  });

  it('says nothing was heard, for a too short or speechless recording only', () => {
    expect(audioEmptyText()).toBe('Não ouvi nada, grave de novo');
    expect(audioHeardNothing(['too_short'])).toBe(true);
    expect(audioHeardNothing(['low_level', 'no_speech'])).toBe(true);
    expect(audioHeardNothing(['noisy', 'clipping', 'low_level'])).toBe(false);
  });
});

describe('31.4-UNIT-001 audioMarkOf', () => {
  const audio = { transcript_heard: 'equipamento verificado sem anomalias aparentes', transcript_written: 'Equipamento verificado, sem anomalias aparentes.', quality: GOOD };
  it('reads "Áudio" while the field holds the written text, typed text around it included', () => {
    expect(audioMarkOf(audio, 'Equipamento verificado, sem anomalias aparentes.')).toEqual({ tag: 'Áudio', edited: false, poor: false, note: null });
    expect(audioMarkOf(audio, 'Contatos escurecidos. Equipamento verificado, sem anomalias aparentes.  ').edited).toBe(false);
  });

  it('reads "Áudio, editado" once the written text is changed', () => {
    expect(audioMarkOf(audio, 'Equipamento verificado, com anomalias.')).toMatchObject({ tag: 'Áudio, editado', edited: true });
    expect(audioMarkOf(audio, '').edited).toBe(true);
  });

  it('compares with the heard text when nothing was written', () => {
    const heard = { ...audio, transcript_written: null };
    expect(audioMarkOf(heard, 'equipamento verificado sem anomalias aparentes').edited).toBe(false);
    expect(audioMarkOf(heard, 'outro').edited).toBe(true);
  });

  it('adds the note of a poor recording, the kernel quality note', () => {
    expect(audioMarkOf({ ...audio, quality: POOR }, audio.transcript_written)).toEqual({ tag: 'Áudio', edited: false, poor: true, note: 'Áudio com ruído, confira o texto' });
    expect(audioQualityNote(POOR)).toBe('Áudio com ruído, confira o texto');
    expect(audioQualityNote(GOOD)).toBeNull();
  });
});

describe('31.4-UNIT-002 sameAudioTarget and audioForTarget', () => {
  const item: AudioTarget = { type: 'item', block_id: BLOCK, item_key: 'contatos' };
  const other: AudioTarget = { type: 'item', block_id: BLOCK, item_key: 'isoladores' };
  const row = (id: string, audio_status: AudioStatus, target: AudioTarget = item, removed_at: string | null = null) => ({ id, kind: 'audio', removed_at, audio_status, audio_target: target });

  it('compares targets field by field', () => {
    expect(sameAudioTarget(item, { item_key: 'contatos', block_id: BLOCK, type: 'item' })).toBe(true);
    expect(sameAudioTarget(item, other)).toBe(false);
    expect(sameAudioTarget({ type: 'sheet_field', block_id: BLOCK, field: 'observations' }, { type: 'section', block_id: BLOCK })).toBe(false);
  });

  it('gives the newest pending and the newest done audio of the field, never a removed one or another field', () => {
    const files = [row('01', 'done'), row('03', 'done'), row('02', 'queued'), row('04', 'transcribing'), row('05', 'done', item, '2026-11-26T00:00:00.000Z'), row('06', 'queued', other), row('07', 'failed'), row('08', 'dismissed')];
    const shown = audioForTarget(files, item);
    expect(shown.pending?.id).toBe('04');
    expect(shown.done?.id).toBe('03');
    expect(audioForTarget([], item)).toEqual({ pending: null, done: null, failed: null, dismissed: null, moved: null });
  });
});

describe('31.4-UNIT-003 the arrival toast', () => {
  it('counts the audios transcribed, singular and plural', () => {
    expect(audiosTranscritosText(1)).toBe('1 áudio transcrito');
    expect(audiosTranscritosText(3)).toBe('3 áudios transcritos');
  });
});
