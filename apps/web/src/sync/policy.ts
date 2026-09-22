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
