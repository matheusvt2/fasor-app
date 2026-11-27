import { AI_ANSWER_USES, type AiAnswerDraft, type AiAnswerUse } from './schema.ts';
import { answerText, sameAnswerValue } from './values.ts';

/*
 * Story 32.2: the rubric's measures (`docs/ai-quality-rubric.md`), as pure functions the report CLI
 * (`apps/api/src/db/ai-answers-read.ts`) counts with. Each returns a closed word or a number, never
 * a piece of the text, so a report built from them carries counts and shares only. Judging the
 * texts with a model is later work (answer 4 of 2026-11-27); these are the counts.
 */

/** The uses whose answers are field reads, judged by exact match and then by kind of error. */
export const FIELD_READ_USES: readonly AiAnswerUse[] = ['plate', 'display', 'panel', 'audio_reading'];

/** The uses whose answers are prose texts, judged by the share of words the user changed. */
export const TEXT_USES: readonly AiAnswerUse[] = ['caption', 'nc_obs', 'audio_text', 'ai_write'];

/**
 * The kinds of error of a field read the user did not keep:
 * - `left_empty`: the model left the field empty and the user filled it;
 * - `invented`: the model gave a value and the user emptied the field (or discarded it with none);
 * - `wrong_unit`: the same digits, another unit;
 * - `wrong_digit`: the digits differ;
 * - `other`: anything else (a word, a spelling, a date read differently).
 */
export const FIELD_ERROR_KINDS = ['left_empty', 'invented', 'wrong_unit', 'wrong_digit', 'other'] as const;
export type FieldErrorKind = (typeof FIELD_ERROR_KINDS)[number];

/** The kinds the guards name (`writtenTextGuard`, the AI control's verdict), read back from a record's reason. */
export const GUARD_REFUSAL_KINDS = ['number', 'unit', 'tag', 'result', 'empty', 'other'] as const;
export type GuardRefusalKind = (typeof GUARD_REFUSAL_KINDS)[number];

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'object' && !Array.isArray(value)) {
    const raw = (value as { raw?: unknown }).raw;
    if (typeof raw === 'string') return raw.trim() === '';
  }
  return false;
}

/** A value's digits and unit, as a field read compares them. */
function partsOf(value: unknown): { digits: string; unit: string | null } {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const { raw, unit } = value as { raw?: unknown; unit?: unknown };
    if (typeof raw === 'string') return { digits: raw.replace(/\D/g, ''), unit: typeof unit === 'string' ? unit.trim().toLowerCase() : null };
  }
  const text = answerText(value);
  const unit = /[0-9]\s*([A-Za-zµΩ°%][A-Za-zµΩ°%/]*)\s*$/.exec(text)?.[1] ?? null;
  return { digits: text.replace(/\D/g, ''), unit: unit === null ? null : unit.toLowerCase() };
}

/**
 * The kind of error of a field read, from what was shown and what the user left; null when it was
 * kept (or nothing can be told: an answer still open, unanswered or withheld).
 */
export function fieldReadError(record: Pick<AiAnswerDraft, 'shown' | 'final_value' | 'outcome' | 'action'>): FieldErrorKind | null {
  if (record.outcome === 'changed') {
    if (record.shown === null) return 'left_empty';
    if (isBlank(record.final_value)) return 'invented';
    if (sameAnswerValue(record.shown, record.final_value)) return null;
    const shown = partsOf(record.shown);
    const final = partsOf(record.final_value);
    if (shown.digits !== '' && shown.digits === final.digits && shown.unit !== final.unit) return 'wrong_unit';
    if (shown.digits !== final.digits && (shown.digits !== '' || final.digits !== '')) return 'wrong_digit';
    return 'other';
  }
  if (record.outcome === 'refused' && record.action === 'discard') return 'invented';
  return null;
}

/** The words of a text, lower-cased, punctuation aside. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}%°]+|[^\p{L}\p{N}%°]+$/gu, ''))
    .filter((word) => word !== '');
}

/**
 * The share of words the user changed, from 0 (the same words) to 1: the word-level edit distance
 * between the text shown and the text left, over the longer of the two.
 */
export function wordChangeShare(shown: unknown, final: unknown): number {
  const a = words(answerText(shown));
  const b = words(answerText(final));
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost));
    }
    previous = current;
  }
  return previous[b.length]! / longest;
}

/** The kinds a guard refusal named, read from the record's reason ("guard: added number 3; dropped unit kV"). */
export function guardRefusalKinds(reason: string | null): GuardRefusalKind[] {
  if (reason === null || !reason.includes('guard')) return [];
  if (/empty text/.test(reason)) return ['empty'];
  const kinds = new Set<GuardRefusalKind>();
  for (const match of reason.matchAll(/\b(?:added|dropped|reordered) (number|unit|tag|result)\b/g)) kinds.add(match[1] as GuardRefusalKind);
  return kinds.size === 0 ? ['other'] : [...kinds];
}

// --- the report ----------------------------------------------------------------------------------

/** What the report reads of a record: no input text and no ids beyond the run's. */
export type AiReportRow = Pick<AiAnswerDraft, 'use' | 'model' | 'prompt_version' | 'run_id' | 'run_usd' | 'outcome' | 'action' | 'shown' | 'final_value' | 'shown_reason'>;

/** One line of the report: an AI use, a model and a prompt version, in counts and shares only. */
export interface AiQualityLine {
  use: AiAnswerUse;
  model: string | null;
  prompt_version: string | null;
  answers: number;
  /** Still open (neither settled nor closed). */
  open: number;
  kept: number;
  changed: number;
  /** Refused by the user ("Descartar", "Desfazer", "Manter o meu texto", the text changed meanwhile). */
  refused: number;
  /** Refused by the product before anyone saw it (a guard, a value dropped, nothing heard). */
  withheld: number;
  unanswered: number;
  /** Each over `answers`, rounded to four places; null when there is no answer. */
  share_kept: number | null;
  share_changed: number | null;
  share_refused: number | null;
  share_withheld: number | null;
  share_unanswered: number | null;
  refused_by: Record<'discard' | 'undo' | 'keep_mine' | 'text_changed', number>;
  /** A field read's kinds of error (`fieldReadError`); zeros for the other uses. */
  errors: Record<FieldErrorKind, number>;
  /** A text's mean share of words changed over its changed answers; null when none was changed or the use is no text. */
  words_changed_mean: number | null;
  /** The kinds the guards named, over the answers whose reason is a guard's. */
  guard_refusals: Record<GuardRefusalKind, number>;
  runs: number;
  /** The runs' cost (each run once), in USD; null when no run reports one. */
  usd: number | null;
  /** `usd` over `kept`; null when nothing was kept or no cost is known. */
  usd_per_kept: number | null;
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;
const share = (count: number, total: number) => (total === 0 ? null : round(count / total, 4));

function emptyLine(use: AiAnswerUse, model: string | null, prompt: string | null): AiQualityLine {
  return {
    use,
    model,
    prompt_version: prompt,
    answers: 0,
    open: 0,
    kept: 0,
    changed: 0,
    refused: 0,
    withheld: 0,
    unanswered: 0,
    share_kept: null,
    share_changed: null,
    share_refused: null,
    share_withheld: null,
    share_unanswered: null,
    refused_by: { discard: 0, undo: 0, keep_mine: 0, text_changed: 0 },
    errors: { left_empty: 0, invented: 0, wrong_unit: 0, wrong_digit: 0, other: 0 },
    words_changed_mean: null,
    guard_refusals: { number: 0, unit: 0, tag: 0, result: 0, empty: 0, other: 0 },
    runs: 0,
    usd: null,
    usd_per_kept: null,
  };
}

/**
 * Story 32.2: the report of the records, one line per AI use, model and prompt version, in that
 * order: how many answers, the share kept, changed, refused (by the user), withheld (by the product)
 * and unanswered, the rubric's kinds of error, the share of words changed, the guard's refusals by
 * kind and the cost per kept answer. Counts and shares only; never a value of a record.
 */
export function aiQualityReport(rows: readonly AiReportRow[]): AiQualityLine[] {
  const lines = new Map<string, AiQualityLine>();
  const words = new Map<string, number[]>();
  const runUsd = new Map<string, Map<string, number | null>>();
  for (const row of rows) {
    const key = JSON.stringify([row.use, row.model, row.prompt_version]);
    let line = lines.get(key);
    if (line === undefined) {
      line = emptyLine(row.use, row.model, row.prompt_version);
      lines.set(key, line);
      words.set(key, []);
      runUsd.set(key, new Map());
    }
    line.answers += 1;
    if (row.outcome === null) line.open += 1;
    else if (row.outcome === 'kept') line.kept += 1;
    else if (row.outcome === 'changed') line.changed += 1;
    else if (row.outcome === 'unanswered') line.unanswered += 1;
    else if (row.action === 'withheld') line.withheld += 1;
    else {
      line.refused += 1;
      if (row.action === 'discard' || row.action === 'undo' || row.action === 'keep_mine' || row.action === 'text_changed') line.refused_by[row.action] += 1;
    }
    if (FIELD_READ_USES.includes(row.use)) {
      const error = fieldReadError(row);
      if (error !== null) line.errors[error] += 1;
    }
    if (TEXT_USES.includes(row.use) && row.outcome === 'changed' && row.shown !== null) words.get(key)!.push(wordChangeShare(row.shown, row.final_value));
    for (const kind of guardRefusalKinds(row.shown_reason)) line.guard_refusals[kind] += 1;
    const runs = runUsd.get(key)!;
    if (!runs.has(row.run_id) || runs.get(row.run_id) === null) runs.set(row.run_id, row.run_usd);
  }
  const out: AiQualityLine[] = [];
  for (const [key, line] of lines) {
    line.share_kept = share(line.kept, line.answers);
    line.share_changed = share(line.changed, line.answers);
    line.share_refused = share(line.refused, line.answers);
    line.share_withheld = share(line.withheld, line.answers);
    line.share_unanswered = share(line.unanswered, line.answers);
    const changedWords = words.get(key)!;
    line.words_changed_mean = changedWords.length === 0 ? null : round(changedWords.reduce((sum, value) => sum + value, 0) / changedWords.length, 4);
    const costs = [...runUsd.get(key)!.values()];
    line.runs = costs.length;
    const known = costs.filter((value): value is number => value !== null);
    line.usd = known.length === 0 ? null : round(known.reduce((sum, value) => sum + value, 0), 6);
    line.usd_per_kept = line.usd === null || line.kept === 0 ? null : round(line.usd / line.kept, 6);
    out.push(line);
  }
  const order = (value: string | null) => value ?? '';
  return out.sort((a, b) => AI_ANSWER_USES.indexOf(a.use) - AI_ANSWER_USES.indexOf(b.use) || order(a.model).localeCompare(order(b.model)) || order(a.prompt_version).localeCompare(order(b.prompt_version)));
}

/**
 * Story 32.2's examples mode: how bad an answer was, for "the worst cases first". A field read with
 * an error or a text changed by more words ranks higher; then a refusal by the user, a withheld
 * answer, one nobody answered; a kept or open answer ranks last (0).
 */
export function aiAnswerSeverity(row: AiReportRow): number {
  if (row.outcome === 'changed') {
    if (FIELD_READ_USES.includes(row.use)) return fieldReadError(row) === 'other' ? 3 : 4;
    if (TEXT_USES.includes(row.use) && row.shown !== null) return 3 + wordChangeShare(row.shown, row.final_value);
    return 3;
  }
  if (row.outcome === 'refused') return row.action === 'withheld' ? 1.5 : 2;
  if (row.outcome === 'unanswered') return 1;
  return 0;
}
