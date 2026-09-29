import { SERVER_DEVICE_ID } from '../ids.ts';
import type { Op } from '../ops/op.ts';
import type { OpPath } from '../ops/path.ts';
import type { Cell } from '../schemas/entities.ts';
import { canonicalJson } from '../text/hash.ts';
import type { CellMergeRule, MergeRule } from './rules.ts';

/*
 * Story 10.1 (FR-58, AD-2, epic-10 Conflict 1): the merge of one sheet cell written by two
 * devices, decided inside the fold (`applyOp`), so the device (`materializeEntity`) and the
 * server (`applyOneIn`) compute the same row and a replay stays byte-equal. It decides from
 * the row state and the op alone: `op.prev_op_id` against the cell's head op.
 */

export type { MergeRule } from './rules.ts';

/**
 * A `put` on a `sheet/*` path, from a device (never the server), onto a cell that exists,
 * that did not see the value it lands on: its `prev_op_id` is not the cell's head op, or
 * (Story 10.2, contract 12) its `meta.standing_op_id` (the cell `op_id` the device's row
 * held at commit) is not the cell's current `op_id`. The second check closes the case a
 * `prev_op_id` cannot tell apart: a device whose own put was merged away writes again (or
 * undoes it) before it pulls, chaining on its own head. An op without the stamp (fixtures,
 * server ops) is judged by `prev_op_id` alone. Everything else folds as before.
 */
export function isConcurrent(
  op: Pick<Op, 'kind' | 'path' | 'prev_op_id' | 'device_id'> & { meta?: Op['meta'] },
  cell: Cell | null | undefined,
): cell is Cell {
  if (cell === null || cell === undefined) return false;
  if (op.kind !== 'put' || !op.path.startsWith('sheet/')) return false;
  if (op.device_id === SERVER_DEVICE_ID) return false;
  if ((op.prev_op_id ?? null) !== (cell.merge?.head_op_id ?? cell.op_id)) return true;
  const standing = op.meta?.standing_op_id;
  return standing !== undefined && (standing ?? null) !== cell.op_id;
}

export type MergeOutcome =
  | { kind: 'sequential' }
  | { kind: 'apply' | 'keep'; rule: MergeRule }
  | { kind: 'contradiction' };

export interface MergePolicyInput {
  /** The parsed path of `op` (a `sheet/*` family). */
  path: OpPath;
  /** The cell at the path before `op`; absent when the path holds nothing yet. */
  current: Cell | null | undefined;
  op: Pick<Op, 'kind' | 'path' | 'prev_op_id' | 'device_id' | 'value'> & { meta?: Op['meta'] };
  /** For a checklist observation: the item's result cell, as it stands. */
  result?: Cell | null | undefined;
}

/** Null, absent, a blank string, or an AD-11 number whose state is `empty` (`isCellFilled`'s rule). Module-internal to `merge/`. */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'object' && !Array.isArray(value) && 'state' in value) return (value as { state: unknown }).state === 'empty';
  return false;
}

/** The free-text cells: the latest edit wins and the other version is kept in the info entry. */
function isFreeText(path: OpPath): boolean {
  if (path.family === 'sheet/observations') return true;
  if (path.family === 'sheet/checklist') return path.field === 'observation';
  if (path.family === 'sheet/conclusion') return path.field === 'text';
  return false;
}

/** Whether `deviceId` is the NC side of the item's merged result (`merge.kept` says which side stood). */
function isNcDevice(result: Cell, deviceId: string): boolean {
  const merge = result.merge!;
  return merge.kept ? deviceId !== merge.device_id : deviceId === merge.device_id;
}

/**
 * The rule for one concurrent pair, in the story's order: same value, filled over empty,
 * NC over C, the NC device's observation, latest free text, and anything else a
 * contradiction. A contradiction keeps the `seq`-later op's value on display and (Story
 * 10.2) marks the cell with the side it displaced (`mergeCell`, the one branch).
 */
export function mergePolicy(input: MergePolicyInput): MergeOutcome {
  const { path, current, op } = input;
  if (!isConcurrent(op, current)) return { kind: 'sequential' };
  const mine = current.value;
  const theirs = op.value;

  const emptyMine = isEmptyValue(mine);
  const emptyTheirs = isEmptyValue(theirs);
  if (canonicalJson(mine) === canonicalJson(theirs) || (emptyMine && emptyTheirs)) return { kind: 'apply', rule: 'same_value' };
  if (emptyMine !== emptyTheirs) return { kind: emptyTheirs ? 'keep' : 'apply', rule: 'filled_over_empty' };

  if (path.family === 'sheet/checklist' && path.field === 'result') {
    const pair = new Set([mine, theirs]);
    if (pair.has('NC') && pair.has('C')) return { kind: theirs === 'NC' ? 'apply' : 'keep', rule: 'nc_over_c' };
  }
  if (path.family === 'sheet/checklist' && path.field === 'observation') {
    const result = input.result;
    if (result !== null && result !== undefined && result.value === 'NC' && result.merge !== undefined) {
      return { kind: isNcDevice(result, op.device_id) ? 'apply' : 'keep', rule: 'nc_observation' };
    }
  }
  if (isFreeText(path)) return { kind: 'apply', rule: 'latest_text' };
  return { kind: 'contradiction' };
}

/** The cell a put writes when nothing merges: the op's value and provenance (AD-12). */
function plainCell(op: Pick<Op, 'value' | 'meta' | 'op_id'>): Cell {
  return { value: op.value, source_suggestion_id: op.meta?.source_suggestion_id ?? null, op_id: op.op_id };
}

export interface MergeCellContext {
  path: OpPath;
  /** For a checklist observation: the item's result cell. */
  result?: Cell | null | undefined;
}

/**
 * The cell `applyOp` writes for a `sheet/*` put.
 * - Sequential: the op's own cell, with no `merge` record; it drops `conflict` unless its
 *   `meta.seen_conflict_op_id` names another one (the "Aplicar" of the Conflict view, which
 *   saw it, resolves this way).
 * - Contradiction (Story 10.2): the op's own cell (the `seq`-later value stands, as in
 *   10.1) plus `conflict`, the cell it displaced. A second contradiction replaces the
 *   record with the cell it displaces (three writers: the oldest side drops out).
 * - A rule merge: the standing value's cell (the op's when it applies, the current one when
 *   it is kept) plus the `merge` record naming the op as the path's head. A kept cell keeps
 *   its `conflict`; an applied one (a same value included) drops it.
 */
export function mergeCell(current: Cell | null | undefined, op: Op, context: MergeCellContext): Cell {
  const outcome = mergePolicy({ path: context.path, current, op, result: context.result });
  if (outcome.kind === 'sequential') {
    // A sequential put clears a `conflict` it saw ("Aplicar"). One stamped with another (or
    // none: the device whose value shows rewrote its cell before pulling the mark) keeps it,
    // so the displaced side is never lost without a decision. An unstamped op clears it.
    const seen = op.meta?.seen_conflict_op_id;
    const conflict = current?.conflict;
    if (conflict !== undefined && seen !== undefined && (seen ?? null) !== conflict.op_id) return { ...plainCell(op), conflict };
    return plainCell(op);
  }
  if (outcome.kind === 'contradiction') {
    const displaced = current!;
    return { ...plainCell(op), conflict: { op_id: displaced.op_id, value: displaced.value, source_suggestion_id: displaced.source_suggestion_id } };
  }
  if (outcome.rule === 'same_value') return plainCell(op);
  const record = { head_op_id: op.op_id, device_id: op.device_id, kept: outcome.kind === 'keep', rule: outcome.rule as CellMergeRule };
  if (outcome.kind === 'apply') return { ...plainCell(op), merge: record };
  const standing = current!;
  return {
    value: standing.value,
    source_suggestion_id: standing.source_suggestion_id,
    op_id: standing.op_id,
    merge: record,
    ...(standing.conflict === undefined ? {} : { conflict: standing.conflict }),
  };
}
