import { PgBoss } from 'pg-boss';
import { logError } from '../log.ts';

/** A pg-boss `error` event, as one structured log line (review 2026-09-30, A-18). */
export function logQueueError(error: unknown): void {
  logError('pg-boss error', { error: String(error) });
}

export async function startQueue(databaseUrl: string): Promise<PgBoss> {
  const boss = new PgBoss(databaseUrl);
  boss.on('error', logQueueError);
  await boss.start();
  return boss;
}

/**
 * Creates a queue unless it exists (pg-boss 12 refuses `send` on an unknown queue). Two first
 * sends may race here: a `createQueue` that fails because the other one just won is fine as
 * long as the queue exists afterwards. The generate and reading queues both go through here.
 */
export async function createQueueOnce(boss: PgBoss, name: string, options: Parameters<PgBoss['createQueue']>[1]): Promise<void> {
  if ((await boss.getQueue(name)) !== null) return;
  try {
    await boss.createQueue(name, options);
  } catch (error) {
    if ((await boss.getQueue(name)) === null) throw error;
  }
}
