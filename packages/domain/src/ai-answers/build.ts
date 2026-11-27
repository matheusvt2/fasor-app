import type { AuditFinding } from '../audit/schema.ts';
import { audioTargetPath } from '../audio/target.ts';
import type { StructuringOutput } from '../contract/ocr.ts';
import type { NewId } from '../ids.ts';
import { relatorioSectionNumber } from '../relatorio/instantiate.ts';
import type { AudioTarget, JsonValue, SuggestionRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { OPEN_SETTLEMENT, type AiAnswerDraft, type AiAnswerSettlement, type ReadingAnswerUse } from './schema.ts';
import { answerItemKey, sameAnswerValue } from './values.ts';

/*
 * Story 32.1: the records of each AI use, built where the provider answered and written by the api
 * in the same transaction as the run row. Pure: the same answer gives the same rows (ids from
 * `newId`). One row per answered item; an answer the product withheld before showing it (a value
 * dropped, a guard's refusal, nothing heard) is written already settled `refused` / `withheld` and
 * closed, so the report counts it and no op ever has to settle it.
 */

/** What every record of one run shares. */
export interface AnswerRun {
  companyId: string;
  relatorioId: string;
  runId: string;
  model: string | null;
  promptVersion: string | null;
  /** The whole run's cost in USD, or null when the run reports none. */
  usd: number | null;
  /** When the run was recorded (canonical ISO). */
  at: string;
  newId: NewId;
}

type Fields = Pick<
  AiAnswerDraft,
  'use' | 'run_table' | 'target' | 'target_path' | 'item_key' | 'suggestion_id' | 'watch_paths' | 'input_text' | 'input_file_id' | 'answer' | 'shown' | 'shown_reason' | 'confidence'
>;

function draft(run: AnswerRun, fields: Fields, settlement: AiAnswerSettlement = OPEN_SETTLEMENT): AiAnswerDraft {
  return {
    id: run.newId(),
    company_id: run.companyId,
    relatorio_id: run.relatorioId,
    run_id: run.runId,
    model: run.model,
    prompt_version: run.promptVersion,
    run_usd: run.usd,
    created_at: run.at,
    ...fields,
    ...settlement,
  };
}

/** Settled at once: the product refused the answer before anyone saw it. */
function withheld(at: string): AiAnswerSettlement {
  return { outcome: 'refused', action: 'withheld', final_value: null, settled_by: null, settled_at: at, closed_at: at };
}

/** A value the model wrote, kept as JSON (`undefined` reads as null). */
function json(value: unknown): JsonValue | null {
  return value === undefined ? null : (JSON.parse(JSON.stringify(value)) as JsonValue);
}

// --- photo readings ------------------------------------------------------------------------------

export interface ReadingAnswersInput extends AnswerRun {
  use: ReadingAnswerUse;
  photoId: string;
  /** The pending Suggestions the run creates. */
  rows: readonly SuggestionRow[];
  /** Every value that became no Suggestion, with its reason (a field key, or a prose kind's target path). */
  dropped: readonly { key: string; reason: string }[];
  /** The structuring step's own answer (its values, keys and confidences), when the kind has one. */
  output: StructuringOutput | null;
  /** The fields the model was asked for (the plate's, the panel's), each with the path it lands on; null when the kind lists none. */
  asked: readonly { key: string; target_path: string }[] | null;
}

/**
 * The records of one photo reading: one per Suggestion (its key, the value as the model gave it, the
 * value shown and `normalized` when the kernel changed it, the confidence), one per value dropped
 * (withheld, with its reason), and, where the kind lists the fields it asked for, one per field the
 * model left empty (open: the user filling it later is the "left empty" error of the rubric).
 */
export function readingAnswers(input: ReadingAnswersInput): AiAnswerDraft[] {
  const values = new Map((input.output?.values ?? []).map((value) => [value.key, value]));
  const asked = new Map((input.asked ?? []).map((entry) => [entry.key, entry.target_path]));
  const base = { use: input.use, run_table: 'reading_runs' as const, input_text: null, input_file_id: input.photoId, watch_paths: null };
  const seen = new Set<string>();
  const out: AiAnswerDraft[] = [];
  for (const row of input.rows) {
    const key = answerItemKey(row.target_path);
    if (key !== null) seen.add(key);
    const raw = key === null ? undefined : values.get(key);
    const answer = raw === undefined ? json(row.value) : json(raw.value);
    out.push(
      draft(input, {
        ...base,
        target: { photo_id: input.photoId, trust: row.trust, mode: row.mode },
        target_path: row.target_path,
        item_key: key,
        suggestion_id: row.id,
        answer,
        shown: json(row.value),
        shown_reason: sameAnswerValue(answer, row.value) ? null : 'normalized',
        confidence: raw?.confidence ?? null,
      }),
    );
  }
  for (const drop of input.dropped) {
    seen.add(drop.key);
    const raw = values.get(drop.key);
    const path = asked.get(drop.key) ?? (drop.key.includes('/') ? drop.key : null);
    out.push(
      draft(
        input,
        {
          ...base,
          target: { photo_id: input.photoId },
          target_path: path,
          item_key: asked.has(drop.key) ? drop.key : (answerItemKey(path) ?? drop.key),
          suggestion_id: null,
          answer: raw === undefined ? null : json(raw.value),
          shown: null,
          shown_reason: `dropped: ${drop.reason}`,
          confidence: raw?.confidence ?? null,
        },
        withheld(input.at),
      ),
    );
  }
  for (const [key, path] of asked) {
    if (seen.has(key) || values.has(key)) continue;
    out.push(
      draft(input, {
        ...base,
        target: { photo_id: input.photoId },
        target_path: path,
        item_key: key,
        suggestion_id: null,
        answer: null,
        shown: null,
        shown_reason: 'empty',
        confidence: null,
      }),
    );
  }
  return out;
}

// --- audio ---------------------------------------------------------------------------------------

export interface AudioAnswersInput extends AnswerRun {
  audioId: string;
  /** The target the text went to (a table's speech that was no reading goes to OBSERVAÇÕES). */
  target: AudioTarget;
  /** The text as heard (the speech provider's answer). */
  heard: string;
  /** The writing model's text, also when the guard refused it; null when no writing call answered. */
  written: string | null;
  /** The field's puts the run wrote (`audioProseWrite`), or none. */
  puts: readonly { path: string; value: JsonValue }[];
  /** Why the field received the text as heard instead of the written one (the run row's `fallback_reason`). */
  fallback: string | null;
  notAReading: boolean;
  /** The reading spoken into a measurement table, as its pending Suggestion. */
  suggestion: SuggestionRow | null;
}

/**
 * The records of one transcription: the reading spoken into a table (`audio_reading`, one per
 * Suggestion, the text as heard as the answer and the parsed reading shown), and the text written
 * into a prose field (`audio_text`: the text as heard and as written as the answer, the field's
 * text as shown, the guard's reasons when it gave the text as heard instead). An audio with nothing
 * heard is one withheld record. Only the audio's id is the input (answer 2 of 2026-11-27).
 */
export function audioAnswers(input: AudioAnswersInput): AiAnswerDraft[] {
  const base = { run_table: 'transcription_runs' as const, input_text: null, input_file_id: input.audioId, watch_paths: null, confidence: null };
  const out: AiAnswerDraft[] = [];
  if (input.suggestion !== null) {
    out.push(
      draft(input, {
        ...base,
        use: 'audio_reading',
        target: { audio_id: input.audioId, ...input.target },
        target_path: input.suggestion.target_path,
        item_key: answerItemKey(input.suggestion.target_path),
        suggestion_id: input.suggestion.id,
        answer: input.heard,
        shown: json(input.suggestion.value),
        shown_reason: 'parsed from the text as heard',
      }),
    );
  }
  const targetPath = audioTargetPath(input.target);
  const put = input.puts.find((one) => one.path === targetPath) ?? input.puts[0];
  if (put !== undefined) {
    const reasons = [input.notAReading ? 'not_a_reading' : null, input.fallback].filter((reason): reason is string => reason !== null);
    out.push(
      draft(input, {
        ...base,
        use: 'audio_text',
        target: { audio_id: input.audioId, ...input.target },
        target_path: put.path,
        item_key: null,
        suggestion_id: null,
        answer: { heard: input.heard, written: input.written },
        shown: json(put.value),
        shown_reason: reasons.length === 0 ? null : reasons.join('; '),
      }),
    );
  } else if (input.suggestion === null && input.heard === '') {
    out.push(
      draft(
        input,
        {
          ...base,
          use: 'audio_text',
          target: { audio_id: input.audioId, ...input.target },
          target_path: targetPath,
          item_key: null,
          suggestion_id: null,
          answer: { heard: input.heard, written: null },
          shown: null,
          shown_reason: 'no_speech',
        },
        withheld(input.at),
      ),
    );
  }
  return out;
}

// --- the AI control ------------------------------------------------------------------------------

export interface AiWriteAnswersInput extends AnswerRun {
  target: AudioTarget;
  /** The field's text the server rewrote (`aiRewriteSource`). */
  source: string;
  /** The route's answer to the device. */
  answer: { outcome: 'written'; text: string } | { outcome: 'refused'; reason: string };
  /** The model's text, also when the guard refused it; null when the call failed. */
  modelText: string | null;
  /** The guard's reasons (the run row's `fallback_reason`) on a refusal. */
  guard: string | null;
}

/**
 * The record of one tap on the AI control: a proposal (open until "Usar o texto da IA", "Manter o
 * meu texto", the text changing meanwhile, or the emission), or a guard's refusal (withheld, the
 * model's text and the reasons kept, the user given nothing). A call that failed answered nothing,
 * so it has no record (its run row says why).
 */
export function aiWriteAnswers(input: AiWriteAnswersInput): AiAnswerDraft[] {
  const fields = {
    use: 'ai_write' as const,
    run_table: 'transcription_runs' as const,
    target: json(input.target) as Record<string, JsonValue>,
    target_path: audioTargetPath(input.target),
    item_key: null,
    suggestion_id: null,
    watch_paths: null,
    input_text: input.source,
    input_file_id: null,
    confidence: null,
  };
  if (input.answer.outcome === 'written') return [draft(input, { ...fields, answer: input.answer.text, shown: input.answer.text, shown_reason: null })];
  if (input.modelText === null) return [];
  return [draft(input, { ...fields, answer: input.modelText, shown: null, shown_reason: input.guard ?? 'guard' }, withheld(input.at))];
}

// --- Conferência por IA --------------------------------------------------------------------------

/**
 * Answer 3 of 2026-11-27: the paths whose change counts as acting on a finding. A sheet or one of its
 * rows: the sheet and its block; a photo: its caption; section 10: the setup (the parecer) and the
 * points (the restrições); the cover and the revision control: the setup; another section: its
 * section block, or the setup when the relatório prints no block of that section.
 */
export function auditFindingWatch(snapshot: Pick<RelatorioSnapshot, 'blocks'>, finding: Pick<AuditFinding, 'ref' | 'target'>): string[] {
  const [kind, id] = finding.ref.split(':');
  if ((kind === 'sheet' || kind === 'row') && id !== undefined) return [`sheet/${id}/`, `block/${id}/`];
  if (kind === 'photo' && id !== undefined) return [`file/${id}/caption`];
  if (finding.target.kind !== 'section') return ['relatorio/setup/'];
  const rowKey = finding.target.rowKey;
  if (rowKey === 'section_10') return ['relatorio/setup/', 'point/'];
  const number = rowKey.startsWith('section_') ? Number(rowKey.slice('section_'.length)) : null;
  if (number === null) return ['relatorio/setup/'];
  const blocks = snapshot.blocks.filter((block) => block.removed_at === null && relatorioSectionNumber(block.block_type) === number).map((block) => `block/${block.id}/`);
  return blocks.length === 0 ? ['relatorio/setup/'] : blocks;
}

export interface AuditAnswersInput extends AnswerRun {
  /** The assembled text the model read (`auditInput`), the record's input. */
  inputText: string;
  /** The model's findings as it gave them. */
  raw: unknown;
  /** What `validateAuditFindings` kept and dropped of `raw`. */
  kept: readonly AuditFinding[];
  dropped: readonly { index: number; reason: string }[];
  /** The relatório as the run read it, for the paths each finding watches. */
  snapshot: Pick<RelatorioSnapshot, 'blocks'>;
}

/**
 * The records of one "Conferência por IA" run: one per finding kept (open until the field it names
 * changes, `field_changed`, or the emission closes it unanswered), one per finding dropped (withheld,
 * with its reason). The finding's kind is its `item_key`.
 */
export function auditAnswers(input: AuditAnswersInput): AiAnswerDraft[] {
  const items: unknown[] = Array.isArray(input.raw) ? input.raw : [];
  const droppedAt = new Set(input.dropped.map((entry) => entry.index));
  const keptRaw = items.filter((_, index) => !droppedAt.has(index));
  const base = { use: 'audit_finding' as const, run_table: 'audit_run' as const, target_path: null, suggestion_id: null, input_text: input.inputText, input_file_id: null, confidence: null };
  const out: AiAnswerDraft[] = [];
  input.kept.forEach((finding, index) => {
    const raw = json(keptRaw[index] ?? null);
    const rawText = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { text?: unknown }).text : undefined;
    out.push(
      draft(input, {
        ...base,
        target: { ref: finding.ref, kind: finding.kind, label: finding.label },
        item_key: finding.kind,
        watch_paths: auditFindingWatch(input.snapshot, finding),
        answer: raw,
        shown: finding.text,
        shown_reason: rawText === finding.text ? null : 'normalized',
      }),
    );
  });
  for (const entry of input.dropped) {
    const raw = entry.index < 0 ? json(input.raw) : json(items[entry.index] ?? null);
    const kind = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { kind?: unknown }).kind : undefined;
    out.push(
      draft(
        input,
        {
          ...base,
          target: null,
          item_key: typeof kind === 'string' ? kind : null,
          watch_paths: null,
          answer: raw,
          shown: null,
          shown_reason: `dropped: ${entry.reason}`,
        },
        withheld(input.at),
      ),
    );
  }
  return out;
}
