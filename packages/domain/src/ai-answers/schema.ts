import type { JsonValue } from '../schemas/entities.ts';

/*
 * Story 32.1 (Matheus, 2026-11-27): what one AI answer is, as the api's `ai_answers` table keeps it.
 * One row per answered item of every AI use: what went in (the input text, or the file id of a photo
 * or an audio), what the model answered, what the product showed instead and why when it changed it
 * (a guard's fallback, a normalization, a value dropped), the model and prompt version of its run,
 * and then what the user did with it (`settle.ts`). Records are kept forever, as the audio is
 * (answer 1 of 2026-11-27); they hold client text, so they live only in the product's database,
 * per company, and never reach a device, a log line or a usage event.
 */

/**
 * The AI uses in scope, one per kind of answer:
 * - `plate`, `display`, `caption`, `nc_obs`, `panel`: each value a photo reading suggests (the
 *   reading kinds of `reading_runs`), and for the plate and the panel each field the model was
 *   asked for and left empty;
 * - `audio_text`: the text an audio wrote into a prose field (the text as heard and as written);
 * - `audio_reading`: each reading spoken into a measurement table (a pending Suggestion);
 * - `ai_write`: the AI control's proposal (Stories 31.9 and 31.10);
 * - `audit_finding`: each finding of "Conferência por IA".
 */
export const AI_ANSWER_USES = ['plate', 'display', 'caption', 'nc_obs', 'panel', 'audio_text', 'audio_reading', 'ai_write', 'audit_finding'] as const;
export type AiAnswerUse = (typeof AI_ANSWER_USES)[number];

/** The reading kinds whose answers are recorded per suggestion, each its own use. */
export const READING_ANSWER_USES = ['plate', 'display', 'caption', 'nc_obs', 'panel'] as const satisfies readonly AiAnswerUse[];
export type ReadingAnswerUse = (typeof READING_ANSWER_USES)[number];

/** Where the run of an answer is kept: a row of `reading_runs` or `transcription_runs`, or the `audit_run` entity. */
export const AI_ANSWER_RUN_TABLES = ['reading_runs', 'transcription_runs', 'audit_run'] as const;
export type AiAnswerRunTable = (typeof AI_ANSWER_RUN_TABLES)[number];

/**
 * What became of an answer: `kept` as given, `changed` by the user (to `final_value`), `refused` (by
 * the user, or `withheld` by the product before anyone saw it), `unanswered` when the revision was
 * emitted with nobody settling it. Null while it is open.
 */
export const AI_ANSWER_OUTCOMES = ['kept', 'changed', 'refused', 'unanswered'] as const;
export type AiAnswerOutcome = (typeof AI_ANSWER_OUTCOMES)[number];

/**
 * Which action settled it:
 * - `confirm`: a Suggestion confirmed, "Usar o texto da IA";
 * - `edit`: a value or text the user wrote (before confirming, or after);
 * - `untouched`: a text from audio nobody edited before the emission (kept);
 * - `discard`: "Descartar", or a typed value that turned a Suggestion down with no value of its own;
 * - `undo`: "Desfazer" (a confirm undone, the AI text put back to the user's);
 * - `keep_mine`: "Manter o meu texto" (reported by the device, no op is written);
 * - `text_changed`: the field's text changed while the AI wrote (reported by the device);
 * - `withheld`: the product refused the answer before showing it (a guard, a value dropped, nothing heard);
 * - `superseded`: a newer reading of the same photo replaced it before anyone answered;
 * - `field_changed`: the field a "Conferência por IA" finding names changed before the next emission.
 */
export const AI_ANSWER_ACTIONS = ['confirm', 'edit', 'untouched', 'discard', 'undo', 'keep_mine', 'text_changed', 'withheld', 'superseded', 'field_changed'] as const;
export type AiAnswerAction = (typeof AI_ANSWER_ACTIONS)[number];

/** The two answers the device reports for an AI proposal it did not write (Story 31.10). */
export const AI_WRITE_REFUSAL_ACTIONS = ['keep_mine', 'text_changed'] as const satisfies readonly AiAnswerAction[];
export type AiWriteRefusalAction = (typeof AI_WRITE_REFUSAL_ACTIONS)[number];

/** The columns that settle a record; null while it is open. */
export interface AiAnswerSettlement {
  outcome: AiAnswerOutcome | null;
  action: AiAnswerAction | null;
  /** The value the user left (a Suggestion's confirmed value, the field's text); null when none. */
  final_value: JsonValue | null;
  /** The actor of the op that settled it (a user id), or null when the emission or the product did. */
  settled_by: string | null;
  /** The settling op's own time (`client_ts`, so an offline device's ops settle at their time). */
  settled_at: string | null;
  /** When the relatório's revision was emitted (or, for an answer withheld, when it was recorded). */
  closed_at: string | null;
}

/** One record as the builders write it and the api inserts it (the `ai_answers` row). */
export interface AiAnswerDraft extends AiAnswerSettlement {
  id: string;
  company_id: string;
  relatorio_id: string;
  use: AiAnswerUse;
  run_table: AiAnswerRunTable;
  run_id: string;
  /** The target by its ids (photo, audio, block, finding ref, the AI control's field), as a closed object per use. */
  target: Record<string, JsonValue> | null;
  /** The op path the answer lands on (a Suggestion's target, the prose field); null for a finding. */
  target_path: string | null;
  /** A field read: its key (a nameplate field, a table cell); null otherwise. */
  item_key: string | null;
  /** The Suggestion the answer became, when it became one. */
  suggestion_id: string | null;
  /** A finding: the path prefixes whose change counts as acting on it (answer 3 of 2026-11-27). */
  watch_paths: string[] | null;
  /** The input as text (the AI control's field text, the audit's assembled text); null for a photo or an audio (answer 2). */
  input_text: string | null;
  /** The photo or audio the answer was read from (answer 2: its id only, the file itself is kept). */
  input_file_id: string | null;
  /** The answer as the model gave it (`null` for a field it left empty). */
  answer: JsonValue | null;
  /** What the user was given; null when nothing was shown. */
  shown: JsonValue | null;
  /** Why `shown` is not `answer` (a normalization, a guard's reasons, a drop); null when it is the same. */
  shown_reason: string | null;
  /** The provider's confidence, when it gives one (0 to 1). */
  confidence: number | null;
  /** Copied from the run. */
  model: string | null;
  prompt_version: string | null;
  /** The whole run's cost in USD, copied onto each of its records (the report sums it once per run). */
  run_usd: number | null;
  created_at: string;
}

/** What the settle rule reads of a stored record. */
export type AiAnswerState = Pick<
  AiAnswerDraft,
  'id' | 'relatorio_id' | 'use' | 'run_id' | 'target_path' | 'suggestion_id' | 'watch_paths' | 'input_text' | 'shown' | 'created_at' | keyof AiAnswerSettlement
>;

/** A record not settled yet. */
export const OPEN_SETTLEMENT: AiAnswerSettlement = Object.freeze({ outcome: null, action: null, final_value: null, settled_by: null, settled_at: null, closed_at: null });
