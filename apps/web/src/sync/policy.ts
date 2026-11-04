import { opSchema, type Op } from '@app/domain';
import type { SyncFailure } from './client.ts';

/*
 * AD-24 retry table and AD-13 cursor rule, as pure functions the engine calls.
 */

export type FailureAction = 'retry' | 'stop' | 'reauth' | 'outdated';

/** Network and 5xx retry; 4xx never, except 401 (re-auth) and 426 (outdated state); a page the device cannot apply stops. */
export function classifyFailure(failure: SyncFailure): FailureAction {
  if (failure.kind === 'network') return 'retry';
  if (failure.kind === 'apply') return 'stop';
  if (failure.status === 401) return 'reauth';
  if (failure.status === 426) return 'outdated';
  if (failure.status >= 500) return 'retry';
  return 'stop';
}

/**
 * What the uploader does with a failed `PUT /api/files/{id}` (AD-7).
 *
 * `defer` is the one rule that differs from the sync table: `409 file_row_missing` says
 * the device's own create op has not been applied yet, which the next cycle fixes by
 * itself — the file stays pending and nothing is recorded as a server failure.
 * `permanent` is a verdict no retry can change (the body does not hash to the row, or the
 * body is over the limit); everything else follows `classifyFailure`.
 */
export type UploadAction = 'retry' | 'defer' | 'permanent' | 'reauth' | 'outdated';

export function classifyUploadFailure(failure: SyncFailure): UploadAction {
  // A 2xx whose body is not the contract shape says nothing about the file: a mangled
  // proxy response must not burn it for the rest of the session.
  if (failure.kind === 'http' && failure.code === 'invalid_response') return 'retry';
  if (failure.kind === 'http' && failure.status === 409) {
    return failure.code === 'file_row_missing' ? 'defer' : 'permanent';
  }
  if (failure.kind === 'http' && failure.status === 413) return 'permanent';
  const action = classifyFailure(failure);
  return action === 'stop' ? 'permanent' : action;
}

/**
 * True when the failure means the server could not be reached or could not serve: the
 * request never completed, or it answered 5xx. A 4xx, a 426 or a page the device could
 * not apply is the server answering, so the device is not cut off from it.
 */
export function isUnreachableFailure(failure: SyncFailure): boolean {
  if (failure.kind === 'network') return true;
  return failure.kind === 'http' && failure.status >= 500;
}

/**
 * Why the server cannot be reached although the browser may be online: `session` while a
 * new sign-in is required, `server` while the last finished cycle ended unreachable, or
 * null when the server answered. `syncBadgeState` gets `reachable: cause === null`.
 */
export function unreachableCause(input: {
  reAuthRequired: boolean;
  lastFailure: SyncFailure | null;
}): 'server' | 'session' | null {
  if (input.reAuthRequired) return 'session';
  if (input.lastFailure !== null && isUnreachableFailure(input.lastFailure)) return 'server';
  return null;
}

export const MAX_ATTEMPTS = 3;
export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_JITTER = 0.25;

/** 1 s, 2 s, 4 s for attempts 1..3, each stretched by 0-25 % of `random()`. */
export function backoffMs(attempt: number, random: () => number): number {
  const base = BACKOFF_BASE_MS * 2 ** (Math.max(1, attempt) - 1);
  return Math.round(base * (1 + BACKOFF_JITTER * Math.min(Math.max(random(), 0), 1)));
}

/** The bytes `{"ops":[` and `]}` add around a push's ops; each op after the first adds one comma. */
export const PUSH_ENVELOPE_BYTES = '{"ops":[]}'.length;

/** The UTF-8 length of an op as the push body serializes it (`JSON.stringify`). */
export function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * Story 20.9 (contract 29): the byte budget of one push: at most `max` bytes of body, each item
 * measuring `of(item)` bytes serialized (`serializedBytes`).
 */
export interface PushByteBudget<T> {
  max: number;
  of: (item: T) => number;
}

/**
 * The pushes of a queue: slices of at most `size`, in the input order, that never split a
 * client batch (ledger 1161, Story 10.1). The ops of one `batch_id` travel together, at the
 * position of the batch's first op, so the server can apply or refuse the batch as one; only
 * a batch that alone holds more than `size` ops is cut, in `size` chunks.
 *
 * Story 20.9 (contract 29): with a byte budget, a push also closes before its serialized body
 * would pass `budget.max` (the server answers a larger one `413 body_too_large`, which no retry
 * changes), so a long offline backlog goes in several pushes under the cap. A client batch is
 * never split for bytes: one that alone is over the budget goes in a push of its own.
 */
export function batches<T extends { batch_id?: string | null }>(items: readonly T[], size: number, budget?: PushByteBudget<T>): T[][] {
  const units: T[][] = [];
  const byBatch = new Map<string, T[]>();
  for (const item of items) {
    const batchId = item.batch_id ?? null;
    const unit = batchId === null ? undefined : byBatch.get(batchId);
    if (unit !== undefined) {
      unit.push(item);
      continue;
    }
    const fresh = [item];
    units.push(fresh);
    if (batchId !== null) byBatch.set(batchId, fresh);
  }
  // Each item costs its bytes plus the comma that separates it from the next one.
  const bytesOf = (unit: readonly T[]) => (budget === undefined ? 0 : unit.reduce((sum, item) => sum + budget.of(item) + 1, 0));
  /**
   * Review: a count slice of a batch over `size` ops, cut again so each push stays under the byte
   * budget (such a batch is split already, so bytes may split it further); an op alone over the
   * budget stays in a push of its own.
   */
  const byBytes = (slice: T[]): T[][] => {
    if (budget === undefined) return [slice];
    const pushes: T[][] = [];
    let pending: T[] = [];
    let pendingBytes = 0;
    for (const item of slice) {
      const cost = budget.of(item) + 1;
      if (pending.length > 0 && PUSH_ENVELOPE_BYTES + pendingBytes + cost > budget.max) {
        pushes.push(pending);
        pending = [];
        pendingBytes = 0;
      }
      pending.push(item);
      pendingBytes += cost;
    }
    if (pending.length > 0) pushes.push(pending);
    return pushes;
  };
  const out: T[][] = [];
  let current: T[] = [];
  let currentBytes = 0;
  for (const unit of units) {
    const unitBytes = bytesOf(unit);
    const overBytes = budget !== undefined && PUSH_ENVELOPE_BYTES + currentBytes + unitBytes > budget.max;
    if (current.length > 0 && (current.length + unit.length > size || overBytes)) {
      out.push(current);
      current = [];
      currentBytes = 0;
    }
    if (unit.length > size) {
      for (let i = 0; i < unit.length; i += size) out.push(...byBytes(unit.slice(i, i + size)));
      continue;
    }
    current.push(...unit);
    currentBytes += unitBytes;
  }
  if (current.length > 0) out.push(current);
  return out;
}

export interface ParsedPull {
  ops: Op[];
  /** Index of the first op this bundle cannot parse; the cursor must stop before it. */
  stoppedAt?: number;
}

/** Validates pulled ops one by one and stops at the first one that fails `opSchema` (which includes `parsePath`) or has no `seq`. */
export function parsePulled(raw: readonly unknown[]): ParsedPull {
  const ops: Op[] = [];
  for (let i = 0; i < raw.length; i++) {
    const parsed = opSchema.safeParse(raw[i]);
    if (!parsed.success || parsed.data.seq === undefined) return { ops, stoppedAt: i };
    ops.push(parsed.data);
  }
  return { ops };
}
