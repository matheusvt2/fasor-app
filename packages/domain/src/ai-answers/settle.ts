import type { JsonValue } from '../schemas/entities.ts';
import type { AiAnswerSettlement, AiAnswerState, AiWriteRefusalAction } from './schema.ts';
import { answerText, isSystemActor, sameAnswerText, sameAnswerValue } from './values.ts';

/*
 * Story 32.1: how an applied op settles an open AI answer. The api runs this over every op it applies
 * (a device's push, a server batch), in the order it applied them, inside the same transaction, and
 * writes the settlements it returns. Nothing here reaches a device: no status, count or text on any
 * screen derives from it (AD-1 to AD-3 unchanged), and an offline device's ops settle when they
 * arrive, at their own `client_ts`.
 *
 * The rules, by kind of record (a client batch, one `batch_id`, is read as one change):
 *
 * - A Suggestion (a photo reading, a spoken reading): its confirm (the put carrying
 *   `meta.source_suggestion_id`) settles it `kept` when the value is the suggested one, else
 *   `changed` to it; a discard by the user settles it `refused` / `discard`, or `changed` when the
 *   user had typed a value of the field over it (before, or in the same batch); a discard by the
 *   server (a newer reading replaced it) closes it `unanswered` / `superseded`; a status put back to
 *   `pending` (the undo of a confirm) settles it `refused` / `undo`. Once confirmed, every later put
 *   of the field by a user moves its final value (`changed`, or `kept` back at the suggested value).
 * - A field the plate model left empty: the user's put of the field settles it `changed` to that value.
 * - A text from audio: the user's put of the field settles it `kept` (same text) or `changed`; one
 *   nobody edited is `kept` / `untouched` at the emission.
 * - The AI control's proposal: the put of "Usar o texto da IA" (`meta.ai_written`, matched by
 *   `meta.ai_run_id`, or for an older device by the latest open proposal of that field) settles it
 *   `kept`; afterwards a user put that brings the field back to the user's text is "Desfazer"
 *   (`refused` / `undo`), another text is `changed`. "Manter o meu texto" and the text changing
 *   meanwhile are reported by the device (`refusedByDevice`).
 * - A "Conferência por IA" finding: any op on a path it watches settles it `changed` /
 *   `field_changed` (answer 3 of 2026-11-27).
 *
 * The emission of the relatório's revision (`revision/{id}` create) closes every record of that
 * relatório: one never settled closes `unanswered` (a text from audio `kept` / `untouched`), a
 * settled one keeps its outcome and final value.
 */

/** What the rule reads of an applied op. */
export interface SettleOp {
  op_id: string;
  kind: string;
  path: string;
  value: unknown;
  batch_id?: string | null;
  meta?: Record<string, unknown> | null;
  actor_id: string;
  client_ts: string;
  relatorio_id?: string | null;
}

type Step = AiAnswerSettlement;

function settledBy(op: SettleOp): Pick<Step, 'settled_by' | 'settled_at'> {
  return { settled_by: op.actor_id, settled_at: op.client_ts };
}

function json(value: unknown): JsonValue | null {
  return value === undefined ? null : (value as JsonValue);
}

const isPut = (op: SettleOp) => op.kind === 'put';
const metaOf = (op: SettleOp, key: string): unknown => (op.meta === null || op.meta === undefined ? undefined : op.meta[key]);

/** The run an "Usar o texto da IA" put names (`meta.ai_run_id`), or null for an older device. */
export function aiRunIdOf(op: Pick<SettleOp, 'meta'>): string | null {
  const id = op.meta === null || op.meta === undefined ? undefined : op.meta.ai_run_id;
  return typeof id === 'string' ? id : null;
}

/** Whether an op is the put of an accepted AI proposal. */
export function isAiWrittenPut(op: SettleOp): boolean {
  return isPut(op) && metaOf(op, 'ai_written') === true;
}

/** Whether an op emits a relatório's revision, and which relatório. */
export function emittedRelatorio(op: SettleOp): string | null {
  if (op.kind !== 'create' || !op.path.startsWith('revision/')) return null;
  const value = op.value as { relatorio_id?: unknown } | null;
  if (value !== null && typeof value === 'object' && typeof value.relatorio_id === 'string') return value.relatorio_id;
  return op.relatorio_id ?? null;
}

function lastOf(ops: readonly SettleOp[], test: (op: SettleOp) => boolean): SettleOp | undefined {
  for (let i = ops.length - 1; i >= 0; i--) if (test(ops[i]!)) return ops[i];
  return undefined;
}

/** A Suggestion's record over one batch. */
function stepSuggestion(record: AiAnswerState, now: Step, batch: readonly SettleOp[]): Step {
  const id = record.suggestion_id!;
  const confirm = lastOf(batch, (op) => isPut(op) && metaOf(op, 'source_suggestion_id') === id);
  if (confirm !== undefined) {
    const kept = sameAnswerValue(confirm.value, record.shown);
    return { ...now, outcome: kept ? 'kept' : 'changed', action: kept ? 'confirm' : 'edit', final_value: json(confirm.value), ...settledBy(confirm) };
  }
  const status = lastOf(batch, (op) => isPut(op) && op.path === `suggestion/${id}/status`);
  const typed = lastOf(batch, (op) => isPut(op) && op.path === record.target_path && !isSystemActor(op.actor_id) && metaOf(op, 'source_suggestion_id') === undefined);
  if (status?.value === 'discarded') {
    if (isSystemActor(status.actor_id)) {
      if (now.outcome !== null) return now;
      return { ...now, outcome: 'unanswered', action: 'superseded', ...settledBy(status), settled_by: null, closed_at: status.client_ts };
    }
    if (now.outcome === 'kept' || now.outcome === 'changed') return now;
    // A value the user typed over it, in this batch or since it was suggested (remembered in `final_value`).
    const value = typed !== undefined ? typed.value : now.outcome === null ? now.final_value : null;
    if (value !== null && value !== undefined && !sameAnswerValue(value, record.shown)) {
      return { ...now, outcome: 'changed', action: 'edit', final_value: json(value), ...settledBy(status) };
    }
    return { ...now, outcome: 'refused', action: 'discard', final_value: null, ...settledBy(status) };
  }
  if (status?.value === 'pending' && (now.outcome === 'kept' || now.outcome === 'changed')) {
    return { ...now, outcome: 'refused', action: 'undo', final_value: null, ...settledBy(status) };
  }
  if (typed === undefined) return now;
  if (now.outcome === null) return { ...now, final_value: json(typed.value) };
  if (now.outcome === 'kept' || now.outcome === 'changed') {
    const kept = sameAnswerValue(typed.value, record.shown);
    return { ...now, outcome: kept ? 'kept' : 'changed', action: kept ? now.action : 'edit', final_value: json(typed.value), ...settledBy(typed) };
  }
  return now;
}

/** The user's last put of the record's field in the batch (never the server's own write, never an AI put). */
function userPutOf(record: AiAnswerState, batch: readonly SettleOp[]): SettleOp | undefined {
  return lastOf(batch, (op) => isPut(op) && op.path === record.target_path && !isSystemActor(op.actor_id) && !isAiWrittenPut(op));
}

/** A field the plate model left empty, or a text from audio. */
function stepField(record: AiAnswerState, now: Step, batch: readonly SettleOp[]): Step {
  const put = userPutOf(record, batch);
  if (put === undefined) return now;
  if (record.shown === null) return { ...now, outcome: 'changed', action: 'edit', final_value: json(put.value), ...settledBy(put) };
  const text = answerText(put.value);
  const kept = sameAnswerText(text, record.shown);
  return { ...now, outcome: kept ? 'kept' : 'changed', action: kept ? 'confirm' : 'edit', final_value: text, ...settledBy(put) };
}

/** The AI control's proposal; `accepted` is the batch's "Usar o texto da IA" put of this record, if any. */
function stepAiWrite(record: AiAnswerState, now: Step, batch: readonly SettleOp[], accepted: SettleOp | undefined): Step {
  if (accepted !== undefined && now.outcome === null) {
    const text = answerText(accepted.value);
    const kept = sameAnswerText(text, record.shown);
    return { ...now, outcome: kept ? 'kept' : 'changed', action: kept ? 'confirm' : 'edit', final_value: text, ...settledBy(accepted) };
  }
  if (now.outcome !== 'kept' && now.outcome !== 'changed') return now;
  const put = userPutOf(record, batch);
  if (put === undefined) return now;
  const text = answerText(put.value);
  if (record.input_text !== null && text.trim() === record.input_text.trim()) return { ...now, outcome: 'refused', action: 'undo', final_value: text, ...settledBy(put) };
  const kept = sameAnswerText(text, record.shown);
  return { ...now, outcome: kept ? 'kept' : 'changed', action: kept ? now.action : 'edit', final_value: text, ...settledBy(put) };
}

/** A finding: the first op on a path it watches. */
function stepFinding(record: AiAnswerState, now: Step, batch: readonly SettleOp[]): Step {
  if (now.outcome !== null) return now;
  const watch = record.watch_paths ?? [];
  const touched = batch.find((op) => watch.some((prefix) => op.path === prefix || op.path.startsWith(prefix)));
  if (touched === undefined) return now;
  return { ...now, outcome: 'changed', action: 'field_changed', ...settledBy(touched) };
}

/** The emission: every record of the relatório closes; one never settled is `unanswered` (a text from audio `kept` / `untouched`). */
function close(record: AiAnswerState, now: Step, emission: SettleOp): Step {
  const at = emission.client_ts;
  if (now.outcome !== null) return { ...now, closed_at: at };
  if (record.use === 'audio_text' && record.shown !== null) return { ...now, outcome: 'kept', action: 'untouched', final_value: answerText(record.shown), settled_by: null, settled_at: at, closed_at: at };
  return { ...now, outcome: 'unanswered', action: null, settled_by: null, settled_at: at, closed_at: at };
}

/** The ops in apply order, a client batch (one `batch_id`) as one group at its first op's place. */
function batchesOf(ops: readonly SettleOp[]): SettleOp[][] {
  const groups: SettleOp[][] = [];
  const byBatch = new Map<string, SettleOp[]>();
  for (const op of ops) {
    const batchId = op.batch_id ?? null;
    if (batchId === null) {
      groups.push([op]);
      continue;
    }
    const group = byBatch.get(batchId);
    if (group !== undefined) group.push(op);
    else {
      const fresh = [op];
      byBatch.set(batchId, fresh);
      groups.push(fresh);
    }
  }
  return groups;
}

function settlementOf(record: AiAnswerState): Step {
  return { outcome: record.outcome, action: record.action, final_value: record.final_value, settled_by: record.settled_by, settled_at: record.settled_at, closed_at: record.closed_at };
}

function changed(a: Step, b: Step): boolean {
  return a.outcome !== b.outcome || a.action !== b.action || a.settled_by !== b.settled_by || a.settled_at !== b.settled_at || a.closed_at !== b.closed_at || !sameAnswerValue(a.final_value, b.final_value);
}

/**
 * The records the applied `ops` settle, by record id, with their new settlement (only the ones that
 * changed). `records` are the open records of the relatórios the ops touch, in creation order; a
 * closed one is never changed. Pure.
 */
export function settleAiAnswers(records: readonly AiAnswerState[], ops: readonly SettleOp[]): Map<string, AiAnswerSettlement> {
  const state = new Map<string, Step>(records.map((record) => [record.id, settlementOf(record)]));
  const byRelatorio = new Map<string, AiAnswerState[]>();
  for (const record of records) {
    const list = byRelatorio.get(record.relatorio_id);
    if (list === undefined) byRelatorio.set(record.relatorio_id, [record]);
    else list.push(record);
  }
  for (const batch of batchesOf(ops)) {
    const relatorios = new Set<string>();
    for (const op of batch) {
      if (op.relatorio_id) relatorios.add(op.relatorio_id);
      const emitted = emittedRelatorio(op);
      if (emitted !== null) relatorios.add(emitted);
    }
    for (const relatorioId of relatorios) {
      const mine = byRelatorio.get(relatorioId) ?? [];
      if (mine.length === 0) continue;
      const scoped = batch.filter((op) => op.relatorio_id === relatorioId || emittedRelatorio(op) === relatorioId);
      // "Usar o texto da IA": the record its run names, else (an older device) the latest open proposal of that field.
      const accepted = new Map<string, SettleOp>();
      for (const op of scoped) {
        if (!isAiWrittenPut(op)) continue;
        const runId = aiRunIdOf(op);
        const candidates = mine.filter((record) => record.use === 'ai_write' && state.get(record.id)!.closed_at === null && (runId === null ? record.target_path === op.path && state.get(record.id)!.outcome === null : record.run_id === runId));
        const target = candidates.at(-1);
        if (target !== undefined && !accepted.has(target.id)) accepted.set(target.id, op);
      }
      const emission = scoped.find((op) => emittedRelatorio(op) === relatorioId);
      for (const record of mine) {
        const before = state.get(record.id)!;
        if (before.closed_at !== null) continue;
        let next = before;
        if (record.suggestion_id !== null) next = stepSuggestion(record, next, scoped);
        else if (record.use === 'ai_write') next = stepAiWrite(record, next, scoped, accepted.get(record.id));
        else if (record.use === 'audit_finding') next = stepFinding(record, next, scoped);
        else if (record.target_path !== null) next = stepField(record, next, scoped);
        if (emission !== undefined && next.closed_at === null) next = close(record, next, emission);
        state.set(record.id, next);
      }
    }
  }
  const out = new Map<string, AiAnswerSettlement>();
  for (const record of records) {
    const next = state.get(record.id)!;
    if (changed(settlementOf(record), next)) out.set(record.id, next);
  }
  return out;
}

/**
 * Story 31.10's report of a proposal the device did not write ("Manter o meu texto", or the text
 * changed while the AI wrote): `refused` with that action, at the report's time and by its user; null
 * when the record is already settled or closed (a report never undoes an answer).
 */
export function refusedByDevice(record: Pick<AiAnswerState, 'use' | keyof AiAnswerSettlement>, action: AiWriteRefusalAction, by: { userId: string; at: string }): AiAnswerSettlement | null {
  if (record.use !== 'ai_write' || record.outcome !== null || record.closed_at !== null) return null;
  return { outcome: 'refused', action, final_value: null, settled_by: by.userId, settled_at: by.at, closed_at: null };
}
