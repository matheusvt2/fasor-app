import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase, type OutboxRow } from '../../db/schema.ts';
import { SessionExpiredError } from './session-expired.tsx';
import { DeadOpsError, drainForServerJob, JobAborted, wait } from './server-job.ts';

/*
 * Review fixes 2026-10-08 (QW25): the drain "Pré-visualizar" and "Conferir antes de emitir"
 * share: it ends once the outbox and the uploads are empty, and stops on an abort, a session
 * known to be gone and a dead op, before asking anything of the server.
 */

let db: AppDatabase | null = null;
let counter = 0;

async function freshDb(): Promise<AppDatabase> {
  const name = `server-job-${++counter}`;
  const old = openDatabase(name);
  await old.delete();
  return openDatabase(name);
}

function row(status: 'pending' | 'dead' | 'acked', n: number): OutboxRow {
  return { op_id: `019966c2-0000-7000-8000-${n.toString(16).padStart(12, '0')}`, status, error_code: null, path: 'relatorio/setup/local', client_ts: '2026-10-08T12:00:00.000Z', targets: [] } as unknown as OutboxRow;
}

const options = (over: Partial<Parameters<typeof drainForServerJob>[2]> = {}) => ({ maxRounds: 3, retryMs: 5, isSessionExpired: () => false, ...over });

afterEach(async () => {
  await db?.delete();
  db = null;
});

describe('drainForServerJob', () => {
  it('ends once the outbox holds nothing to send, syncing each round', async () => {
    db = await freshDb();
    const store = db;
    await store.outbox.put(row('pending', 1));
    await store.outbox.put(row('acked', 2));
    const syncNow = vi.fn(async () => {
      await store.outbox.update(row('pending', 1).op_id, { status: 'acked' });
      return 'ran' as const;
    });
    await expect(drainForServerJob(store, { syncNow }, options())).resolves.toBeUndefined();
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it('stops on a dead op, held before or found after a round', async () => {
    db = await freshDb();
    const store = db;
    await store.outbox.put(row('dead', 1));
    await expect(drainForServerJob(store, { syncNow: vi.fn(async () => 'ran' as const) }, options())).rejects.toBeInstanceOf(DeadOpsError);
  });

  it('stops on a session known to be gone, before any sync or after one', async () => {
    db = await freshDb();
    const syncNow = vi.fn(async () => 'ran' as const);
    await expect(drainForServerJob(db, { syncNow }, options({ isSessionExpired: () => true }))).rejects.toBeInstanceOf(SessionExpiredError);
    expect(syncNow).not.toHaveBeenCalled();
    let gone = false;
    const goes = vi.fn(async () => {
      gone = true;
      return 'ran' as const;
    });
    await expect(drainForServerJob(db, { syncNow: goes }, options({ isSessionExpired: () => gone }))).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('stops on an abort, between rounds too, and gives up after its rounds', async () => {
    db = await freshDb();
    const store = db;
    await store.outbox.put(row('pending', 1));
    const controller = new AbortController();
    const syncNow = vi.fn(async () => {
      controller.abort();
      return 'ran' as const;
    });
    await expect(drainForServerJob(store, { syncNow }, options({ signal: controller.signal }))).rejects.toBeInstanceOf(JobAborted);
    await expect(drainForServerJob(store, { syncNow: vi.fn(async () => 'ran' as const) }, options())).rejects.toThrow('outbox did not drain');
  });
});

describe('wait', () => {
  it('rejects at once when aborted, and on an abort while it waits', async () => {
    const controller = new AbortController();
    const pending = wait(10_000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(JobAborted);
    await expect(wait(10, controller.signal)).rejects.toBeInstanceOf(JobAborted);
    await expect(wait(1)).resolves.toBeUndefined();
  });
});
