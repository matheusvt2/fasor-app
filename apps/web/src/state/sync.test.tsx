import 'fake-indexeddb/auto';
import { makeOp } from '@app/domain';
import { COMPANY_ID, USER_ID } from '@app/domain/fixtures/replay-small';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitOps } from '../db/commit.ts';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import type { SyncEngine } from '../sync/engine.ts';
import type { SessionState } from './session.tsx';
import { useSyncActions, type SyncActions } from './sync-actions.ts';
import { SyncProvider, useSync, type SyncState } from './sync.tsx';

/*
 * The sync provider over a real device store and a stand-in engine (the network is the
 * engine's, tested in `sync/engine.test.ts`):
 * - W-4 (full review 2026-09-30): "Sincronizar agora" and "Reenviar" ask the engine for a
 *   fresh cycle, which runs after any cycle in flight, never a plain one that answers `busy`;
 * - W-8: a component that reads only `useSyncActions()` does not re-render when the sync
 *   data changes (a committed keystroke adds an outbox row), while a `useSync()` one does.
 */

let database: AppDatabase | null = null;
let counter = 0;

vi.mock('./session.tsx', () => ({
  useSession: (): Partial<SessionState> => ({ status: 'signed-in', user: null, online: false, reAuthRequired: false, database }),
}));

const engine = {
  runCycle: vi.fn(async () => 'busy' as const),
  runFreshCycle: vi.fn(async () => 'ran' as const),
  syncRelatorio: vi.fn(async () => 'ran' as const),
  syncProject: vi.fn(async () => 'ran' as const),
  retryUpload: vi.fn(async () => 'ran' as const),
  start: vi.fn(),
  nudge: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  status: vi.fn(() => ({ running: true, paused: false, outdated: false, lastResult: null, lastFailure: null, merges: [] })),
} satisfies SyncEngine;

vi.mock('../sync/engine.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sync/engine.ts')>()),
  createSyncEngine: () => engine,
}));

async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0074-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
  vi.clearAllMocks();
});

describe('SyncProvider', () => {
  it('W-4: "Sincronizar agora" and "Reenviar" run a fresh cycle, never one that answers busy', async () => {
    database = await freshDb();
    let actions: SyncActions | null = null;
    function Probe() {
      actions = useSyncActions();
      return null;
    }
    render(
      <SyncProvider>
        <Probe />
      </SyncProvider>,
    );
    await waitFor(() => expect(actions).not.toBeNull());
    expect(await actions!.syncNow()).toBe('ran');
    expect(engine.runFreshCycle).toHaveBeenCalledTimes(1);
    await actions!.resendDead();
    expect(engine.runFreshCycle).toHaveBeenCalledTimes(2);
    expect(engine.runCycle).not.toHaveBeenCalled();
  });

  it('W-8: a keystroke commit re-renders the useSync() readers, never a useSyncActions()-only one', async () => {
    const db = await freshDb();
    database = db;
    const renders = { actions: 0, state: 0 };
    let state: SyncState | null = null;
    function ActionsOnly() {
      useSyncActions();
      renders.actions += 1;
      return null;
    }
    function StateReader() {
      state = useSync();
      renders.state += 1;
      return null;
    }
    render(
      <SyncProvider>
        <ActionsOnly />
        <StateReader />
      </SyncProvider>,
    );
    await waitFor(() => expect(state?.outboxRead).toBe(true));
    const settled = { ...renders };
    const newId = (() => {
      let n = 0;
      return () => `019966b0-0075-7000-8000-${(++n).toString(16).padStart(12, '0')}`;
    })();
    const keystroke = makeOp(
      { kind: 'put', scope: 'company', company_id: COMPANY_ID, path: `user/${USER_ID}/title`, value: 'Eng.', actor_id: USER_ID, device_id: 'tablet-a' },
      { newId, now: new Date('2026-09-30T12:00:00.000Z') },
    );
    await act(async () => {
      await commitOps(db, [keystroke], { newId });
    });
    await waitFor(() => expect(state?.counts.pending).toBe(1));
    expect(renders.state).toBeGreaterThan(settled.state);
    expect(renders.actions).toBe(settled.actions);
  });
});
