/** AD-8: a warning banner when work has waited in the outbox this long. */
export const UNSYNCED_WARNING_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True when the oldest pending op has waited `days` or more at `now`.
 * `oldestPendingClientTs` is the pending op's `client_ts` (UTC ISO) or null
 * when the outbox is empty.
 */
export function unsyncedForDays(
  oldestPendingClientTs: string | null,
  now: Date,
  days: number = UNSYNCED_WARNING_DAYS,
): boolean {
  if (oldestPendingClientTs === null) return false;
  const oldest = Date.parse(oldestPendingClientTs);
  if (Number.isNaN(oldest)) return false;
  return now.getTime() - oldest >= days * DAY_MS;
}
