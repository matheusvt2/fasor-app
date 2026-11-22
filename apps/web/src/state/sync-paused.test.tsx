import 'fake-indexeddb/auto';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import type { SyncEngine } from '../sync/engine.ts';
import type { SessionState } from './session.tsx';
import { SyncProvider, useSync, type SyncState } from './sync.tsx';

/*
 * e26s (2026-11-22, F2-1, F2-3, F2-5): the sync provider of a paused account, over a stand-in
 * engine and session. "Sincronizar agora" first asks the session to read the account
 * (`recheckAccount`); the badge reads what waits, not "Sem conexão"; Sync status's cause is
 * `paused`; an ended session stays `session`; `pullCompany` reaches the engine's company pull.
 */

let database: AppDatabase | null = null;
let cause: 'paused' | 'expired' | null = null;
const recheckAccount = vi.fn(async () => {});

vi.mock('./session.tsx', () => ({
  useSession: (): Partial<SessionState> => ({
    status: 'signed-in',
    user: null,
    online: true,
    reAuthRequired: cause !== null,
    reAuthCause: cause,
    database,
    settled: true,
    recheckAccount,
  }),
}));

const engine = {
  runCycle: vi.fn(async () => 'paused' as const),
  runFreshCycle: vi.fn(async () => 'paused' as const),
  syncRelatorio: vi.fn(async () => 'paused' as const),
  syncProject: vi.fn(async () => 'paused' as const),
  retryUpload: vi.fn(async () => 'paused' as const),
  pullCompany: vi.fn(async () => 'ran' as const),
  start: vi.fn(),
  nudge: vi.fn(),
  pushNow: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  status: vi.fn(() => ({ running: false, pushing: false, paused: true, outdated: false, lastResult: null, lastFailure: null, serverAnswers: null, merges: [] })),
} satisfies SyncEngine;

vi.mock('../sync/engine.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sync/engine.ts')>()),
  createSyncEngine: () => engine,
}));

let counter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0e26-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
  cause = null;
  vi.clearAllMocks();
});

function renderProvider(): { current: () => SyncState } {
  let state: SyncState | null = null;
  function Probe() {
    state = useSync();
    return null;
  }
  render(
    <SyncProvider>
      <Probe />
    </SyncProvider>,
  );
  return { current: () => state! };
}

describe('e26s-UNIT the sync provider of a paused account', () => {
  it('"Sincronizar agora" reads the account first, then asks the engine; the cause is `paused` and the badge is no "Sem conexão"', async () => {
    database = await freshDb();
    await database.outbox.put({ op_id: 'op-1', status: 'pending', path: 'x/y', client_ts: '2026-11-22T10:00:00.000Z' } as never);
    cause = 'paused';
    const view = renderProvider();
    await waitFor(() => expect(view.current().counts.pending).toBe(1));
    expect(view.current().unreachable).toBe('paused');
    expect(view.current().badgeState).toBe('pending');
    await act(async () => {
      await view.current().syncNow();
    });
    expect(recheckAccount).toHaveBeenCalledTimes(1);
    expect(engine.runFreshCycle).toHaveBeenCalledTimes(1);
    expect(recheckAccount.mock.invocationCallOrder[0]!).toBeLessThan(engine.runFreshCycle.mock.invocationCallOrder[0]!);
  });

  it('an ended session asks no account read on "Sincronizar agora" and stays `session`, "Sem conexão"', async () => {
    database = await freshDb();
    cause = 'expired';
    const view = renderProvider();
    await waitFor(() => expect(view.current().engineReady).toBe(true));
    expect(view.current().unreachable).toBe('session');
    expect(view.current().badgeState).toBe('offline');
    await act(async () => {
      await view.current().syncNow();
    });
    expect(recheckAccount).not.toHaveBeenCalled();
  });

  it('`pullCompany` runs the engine\'s company pull', async () => {
    database = await freshDb();
    const view = renderProvider();
    await waitFor(() => expect(view.current().engineReady).toBe(true));
    await act(async () => {
      await view.current().pullCompany!();
    });
    expect(engine.pullCompany).toHaveBeenCalledTimes(1);
  });
});
