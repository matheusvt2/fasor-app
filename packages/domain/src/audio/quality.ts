import { AUDIO_QUALITY_REASONS, type AudioQuality, type AudioQualityReason } from '../schemas/entities.ts';

/*
 * Story 31.1 (AD-30, FR-77): a recording is measured on the device by fixed rules and judged here,
 * once. `apps/web` only feeds the numbers; the server never recomputes them, but refuses a create
 * whose stored verdict is not this function's (`audioQualityMatches`). Every threshold lives in the
 * one constant below; a value on a threshold is good.
 */

export const AUDIO_QUALITY_THRESHOLDS = {
  /** The RMS of the voice, 0 to 1 of full scale: below about -30 dBFS the words blur. */
  min_level: 0.03,
  /** The share of clipped samples: above 1 % the voice is distorted. */
  max_clipped_share: 0.01,
  /** The noise floor against the voice (RMS over RMS): above 0.3 (about 10 dB apart) the noise covers it. */
  max_noise_ratio: 0.3,
  /** The shortest recording worth sending, in milliseconds. */
  min_duration_ms: 1000,
  /** The least time with speech, in milliseconds. */
  min_speech_ms: 500,
} as const;

/** The measures of a recording, without the verdict. */
export type AudioQualityMeasures = Pick<AudioQuality, 'level' | 'clipped_share' | 'noise_ratio' | 'duration_ms' | 'speech_ms'>;

export type AudioQualityVerdict = { verdict: 'good' } | { verdict: 'poor'; reasons: AudioQualityReason[] };

/** The verdict on a recording's measures: `poor` with every reason (in `AUDIO_QUALITY_REASONS` order), else `good`. */
export function audioQualityVerdict(measures: AudioQualityMeasures): AudioQualityVerdict {
  const T = AUDIO_QUALITY_THRESHOLDS;
  const failing: Record<AudioQualityReason, boolean> = {
    low_level: measures.level < T.min_level,
    clipping: measures.clipped_share > T.max_clipped_share,
    noisy: measures.noise_ratio > T.max_noise_ratio,
    too_short: measures.duration_ms < T.min_duration_ms,
    no_speech: measures.speech_ms < T.min_speech_ms,
  };
  const reasons = AUDIO_QUALITY_REASONS.filter((reason) => failing[reason]);
  return reasons.length === 0 ? { verdict: 'good' } : { verdict: 'poor', reasons };
}

/** The `quality` a device stores: the measures with the kernel's verdict on them. */
export function audioQualityOf(measures: AudioQualityMeasures): AudioQuality {
  const verdict = audioQualityVerdict(measures);
  return { ...measures, verdict: verdict.verdict, reasons: verdict.verdict === 'poor' ? verdict.reasons : [] };
}

/** True when a stored `quality` carries the verdict and the reasons the kernel gives its measures. */
export function audioQualityMatches(quality: AudioQuality): boolean {
  const expected = audioQualityOf(quality);
  return expected.verdict === quality.verdict && expected.reasons.join() === quality.reasons.join();
}

/**
 * The note a poor recording leaves on its field (FR-77), or null for a good one. Story 31.4: the
 * mock's sentence (`62-audio-estados.html` (d), EXPERIENCE.md › Text from audio) replaces the
 * authored "Confira o texto" of Story 31.1.
 */
export function audioQualityNote(quality: Pick<AudioQuality, 'verdict'>): string | null {
  return quality.verdict === 'poor' ? 'Áudio com ruído, confira o texto' : null;
}
