/*
 * AD-8: "never a silent refusal". A browser that refuses a write says so through the
 * error's `name`; the kernel decides what the user is told, so the classification is a
 * pure function over that name and never touches a DOM object.
 */

export type WriteErrorKind = 'quota' | 'unknown';

/**
 * Dexie wraps a failed IndexedDB write in its own error class; the storage refusal
 * reaches the caller as `QuotaExceededError` from the browser and as
 * `QuotaExceededError` or the short `QuotaExceeded` from Dexie.
 */
const QUOTA_NAMES = new Set(['quotaexceedederror', 'quotaexceeded']);

/** The kind of failure a refused write was, from the error's `name` alone. */
export function writeErrorKind(name: string | null | undefined): WriteErrorKind {
  if (typeof name !== 'string') return 'unknown';
  return QUOTA_NAMES.has(name.trim().toLowerCase()) ? 'quota' : 'unknown';
}
