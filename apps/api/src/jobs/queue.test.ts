import { describe, expect, it, vi } from 'vitest';

/*
 * Review 2026-09-30, A-18: a pg-boss `error` event is one structured log line (`logError`),
 * not a bare `console.error` outside the JSON log. pg-boss is replaced by a stand-in that
 * records the listener `startQueue` registers.
 */

const listeners = new Map<string, (error: unknown) => void>();

vi.mock('pg-boss', () => ({
  PgBoss: class {
    on(event: string, listener: (error: unknown) => void) {
      listeners.set(event, listener);
    }
    async start() {}
  },
}));

const { startQueue } = await import('./queue.ts');

describe('A-18 pg-boss errors in the structured log', () => {
  it('logs an error event as one JSON line with msg "pg-boss error"', async () => {
    await startQueue('postgres://unused');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      listeners.get('error')!(new Error('connection terminated unexpectedly'));
      expect(errors).toHaveBeenCalledTimes(1);
      const line = JSON.parse(String(errors.mock.calls[0]![0])) as Record<string, unknown>;
      expect(line).toMatchObject({ level: 'error', msg: 'pg-boss error', error: 'Error: connection terminated unexpectedly', company_id: null });
    } finally {
      errors.mockRestore();
    }
  });
});
