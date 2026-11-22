import { logError } from '../log.ts';

/*
 * Story 26.6: better-auth's `advanced.backgroundTasks.handler`. Without it, `POST
 * /api/auth/request-password-reset` awaits the e-mail send before it answers, so an SES round trip
 * would tell, by the answer's time, whether the address exists. With it, the answer leaves at once
 * and the send runs here. A rejection is logged without the address (the message names nothing
 * but the failure). The api tests await what is still running with `settleEmailTasks()`.
 */

const pending = new Set<Promise<unknown>>();

/** Records one background task; it never rejects past here. */
export function runEmailTask(task: Promise<unknown>): void {
  const tracked: Promise<unknown> = task
    .catch((error: unknown) => {
      logError('background task failed', { error: error instanceof Error ? error.name : 'unknown' });
    })
    .finally(() => pending.delete(tracked));
  pending.add(tracked);
}

/** Awaits every background task started so far (and those they start), for the tests. */
export async function settleEmailTasks(): Promise<void> {
  while (pending.size > 0) await Promise.allSettled([...pending]);
}
