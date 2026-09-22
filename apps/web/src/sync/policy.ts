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

/** Consecutive slices of at most `size`, in the input order. */
export function batches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
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
