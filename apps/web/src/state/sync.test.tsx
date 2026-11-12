import 'fake-indexeddb/auto';
import { makeOp } from '@app/domain';
import { COMPANY_ID, USER_ID } from '@app/domain/fixtures/replay-small';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitOps } from '../db/commit.ts';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { announceCommit, COMMIT_SYNC_WINDOW_MS } from '../sync/commit-signal.ts';
import type { EngineStatus, SyncEngine, SyncEngineDeps } from '../sync/engine.ts';
import type { SessionState } from './session.tsx';
import { useSyncActions, type SyncActions } from './sync-actions.ts';
import { requestSyncCycle, SyncProvider, useSync, type SyncState } from './sync.tsx';

/*
 * The sync provider over a real device store and a stand-in engine (the network is the
 * engine's, tested in `sync/engine.test.ts`):
 * - W-4 (full review 2026-09-30): "Sincronizar agora" and "Reenviar" ask the engine for a
 *   fresh cycle, which runs after any cycle in flight, never a plain one that answers `busy`;
 * - W-8: a component that reads only `useSyncActions()` does not re-render when the sync
 *   data changes (a committed keystroke adds an outbox row), while a `useSync()` one does.
 */

let database: AppDatabase | null = null;
/** Fix batch fxpw G1: whether the session's boot read has settled (the engine waits for it). */
let settled = true;
let counter = 0;

/** Fix batch e25x (A5): whether the browser is online, read by the session stand-in on each render. */
let online = false;

vi.mock('./session.tsx', () => ({
  useSession: (): Partial<SessionState> => ({ status: 'signed-in', user: null, online, reAuthRequired: false, database, settled }),
}));

/** Fix batch e25x (A5): what the provider handed the engine, so a test can publish an engine status. */
let engineDeps: SyncEngineDeps | null = null;

const engine = {
  runCycle: vi.fn(async () => 'busy' as const),
  runFreshCycle: vi.fn(async () => 'ran' as const),
  syncRelatorio: vi.fn(async () => 'ran' as const),
  syncProject: vi.fn(async () => 'ran' as const),
  retryUpload: vi.fn(async () => 'ran' as const),
  start: vi.fn(),
  nudge: vi.fn(),
  pushNow: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  status: vi.fn(() => ({ running: true, pushing: false, paused: false, outdated: false, lastResult: null, lastFailure: null, serverAnswers: null, merges: [] })),
} satisfies SyncEngine;

vi.mock('../sync/engine.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sync/engine.ts')>()),
  createSyncEngine: (deps: SyncEngineDeps) => {
    engineDeps = deps;
    return engine;
  },
}));

async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0074-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  database?.close();
  database = null;
  settled = true;
  online = false;
  engineDeps = null;
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

  it('25.3-WEB: the page turning visible again asks the engine for one cycle; turning hidden asks nothing', async () => {
    database = await freshDb();
    render(
      <SyncProvider>
        <></>
      </SyncProvider>,
    );
    await waitFor(() => expect(engine.start).toHaveBeenCalled());
    const turn = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    turn('hidden');
    expect(engine.nudge).not.toHaveBeenCalled();
    turn('visible');
    expect(engine.nudge).toHaveBeenCalledTimes(1);
  });

  it('E19-A2 (R-3): summaryRead is false before the sync states are read, true once they are', async () => {
    database = await freshDb();
    const seen: (boolean | undefined)[] = [];
    function Probe() {
      seen.push(useSync().summaryRead);
      return null;
    }
    render(
      <SyncProvider>
        <Probe />
      </SyncProvider>,
    );
    expect(seen[0]).toBe(false);
    await waitFor(() => expect(seen.at(-1)).toBe(true));
  });

  it('fix batch fxpw G1: the engine is not created before the boot read settles, and starts once it has', async () => {
    database = await freshDb();
    settled = false;
    const view = render(
      <SyncProvider>
        <p>child</p>
      </SyncProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(engine.start).not.toHaveBeenCalled();
    settled = true;
    view.rerender(
      <SyncProvider>
        <p>child</p>
      </SyncProvider>,
    );
    await waitFor(() => expect(engine.start).toHaveBeenCalledTimes(1));
  });
});

const ENGINE_IDLE: EngineStatus = { running: false, pushing: false, paused: false, outdated: false, lastResult: null, lastFailure: null, serverAnswers: null, merges: [] };

/*
 * Fix batch e25x, "e25x A2": a commit announcement asks the engine for a push-only pass (`pushNow`), once per 2 s
 * window, and never a whole cycle; a photo, a reading or the Sync screen (`requestSyncCycle`) still asks a cycle.
 */
describe('e25x A2 the commit nudge is a push-only pass', () => {
  it('commit announcements call the engine pushNow once, 2 s after the first, and never nudge; requestSyncCycle still nudges', async () => {
    database = await freshDb();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(
      <SyncProvider>
        <></>
      </SyncProvider>,
    );
    expect(engine.start).toHaveBeenCalledTimes(1);
    act(() => {
      for (let i = 0; i < 10; i++) {
        announceCommit();
        vi.advanceTimersByTime(100);
      }
      vi.advanceTimersByTime(COMMIT_SYNC_WINDOW_MS - 1_001);
    });
    expect(engine.pushNow).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(engine.pushNow).toHaveBeenCalledTimes(1);
    expect(engine.nudge).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(10 * COMMIT_SYNC_WINDOW_MS);
    });
    expect(engine.pushNow).toHaveBeenCalledTimes(1);
    requestSyncCycle();
    expect(engine.nudge).toHaveBeenCalledTimes(1);
    expect(engine.pushNow).toHaveBeenCalledTimes(1);
  });
});

/*
 * Fix batch e25x, "e25x A5" (and A10): at the provider, every render's badge state is recorded. The wait of an op
 * counts from when the device became able to send (online, reaching the server, not paused), taken in the very
 * render where it becomes able, so no render after a reconnect, a resume or the server answering again reads
 * `late`; it turns late 60 001 ms later. Only the clocks are fake (`performance`, the late clock, and `Date`, the
 * corrected clock and `client_ts`): Dexie and React keep their timers. The late timer itself is
 * `late-ops.test.tsx`'s; here a re-render reads the count at each step.
 */
describe('e25x A5 no render says "Envio atrasado" before 60 s of being able to send', () => {
  let opCounter = 0;
  const newId = () => `019966b0-0e25-7000-8000-${(++opCounter).toString(16).padStart(12, '0')}`;
  const edit = (value: string) =>
    makeOp(
      { kind: 'put', scope: 'company', company_id: COMPANY_ID, path: `user/${USER_ID}/title`, value, actor_id: USER_ID, device_id: 'tablet-a' },
      { newId, now: new Date() },
    );

  function renderRecording() {
    const seen: SyncState['badgeState'][] = [];
    let latest: SyncState | null = null;
    function Probe() {
      latest = useSync();
      seen.push(latest.badgeState);
      return null;
    }
    const ui = () => (
      <SyncProvider>
        <Probe />
      </SyncProvider>
    );
    const view = render(ui());
    return { seen, latest: (): SyncState | null => latest, rerender: () => view.rerender(ui()) };
  }

  /** Moves both fake clocks, then lets the provider render once more (the count is read in render). */
  function after(view: ReturnType<typeof renderRecording>, ms: number): void {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
    view.rerender();
  }

  it('an op committed offline 10 min ago: the reconnect render and every one after it read no late until 60 001 ms', async () => {
    const db = await freshDb();
    database = db;
    vi.useFakeTimers({ toFake: ['performance', 'Date'] });
    await commitOps(db, [edit('offline A')], { newId });
    const view = renderRecording();
    await waitFor(() => expect(view.latest()?.counts.pending).toBe(1));
    expect(view.seen.at(-1)).toBe('offline');
    // Ten minutes offline, then another edit: the first has waited all that time, but offline.
    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    await act(async () => {
      await commitOps(db, [edit('offline B')], { newId });
    });
    await waitFor(() => expect(view.latest()?.counts.pending).toBe(2));
    expect(view.latest()?.lateCount).toBe(1);
    expect(view.seen.at(-1)).toBe('offline');
    // The device reconnects (guards `canSend`'s `session.online` and the render-time `useCanSendSince`).
    const reconnect = view.seen.length;
    online = true;
    view.rerender();
    expect(view.seen.slice(reconnect)).not.toContain('late');
    expect(view.seen.at(-1)).toBe('pending');
    expect(view.latest()?.lateText).toBe('');
    after(view, 60_000);
    expect(view.seen.slice(reconnect)).not.toContain('late');
    // Guards `late: lateCount` in `syncBadgeState`.
    after(view, 1);
    expect(view.seen.at(-1)).toBe('late');
    expect(view.latest()?.lateCount).toBe(2);
  });

  it('paused (a 401) past 60 s is never late; resumed, it is late only 60 001 ms later', async () => {
    online = true;
    const db = await freshDb();
    database = db;
    vi.useFakeTimers({ toFake: ['performance', 'Date'] });
    await commitOps(db, [edit('paused')], { newId });
    const view = renderRecording();
    await waitFor(() => expect(view.latest()?.counts.pending).toBe(1));
    expect(view.seen.at(-1)).toBe('pending');
    expect(engineDeps).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(10_000);
      engineDeps!.onChange({ ...ENGINE_IDLE, paused: true });
    });
    after(view, 110_000);
    // Two minutes waiting: the count says late, the badge does not (guards `paused: status.paused`).
    expect(view.latest()?.lateCount).toBe(1);
    expect(view.seen).not.toContain('late');
    // Resumed (guards `!status.paused` in `canSend`): the wait starts again now.
    act(() => {
      engineDeps!.onChange({ ...ENGINE_IDLE, paused: false });
    });
    expect(view.seen).not.toContain('late');
    expect(view.seen.at(-1)).toBe('pending');
    after(view, 60_000);
    expect(view.seen).not.toContain('late');
    after(view, 1);
    expect(view.seen.at(-1)).toBe('late');
  });

  it('the server unreachable past 60 s is never late; once it answers, late only 60 001 ms later', async () => {
    online = true;
    const db = await freshDb();
    database = db;
    vi.useFakeTimers({ toFake: ['performance', 'Date'] });
    await commitOps(db, [edit('unreachable')], { newId });
    const view = renderRecording();
    await waitFor(() => expect(view.latest()?.counts.pending).toBe(1));
    act(() => {
      vi.advanceTimersByTime(10_000);
      engineDeps!.onChange({ ...ENGINE_IDLE, lastResult: 'ran', lastFailure: { kind: 'network' } });
    });
    expect(view.latest()?.unreachable).toBe('server');
    after(view, 110_000);
    expect(view.latest()?.lateCount).toBe(1);
    expect(view.seen).not.toContain('late');
    // The server answers again (guards `unreachable === null` in `canSend`).
    act(() => {
      engineDeps!.onChange({ ...ENGINE_IDLE, lastResult: 'ran' });
    });
    expect(view.seen).not.toContain('late');
    expect(view.seen.at(-1)).toBe('pending');
    after(view, 60_000);
    expect(view.seen).not.toContain('late');
    after(view, 1);
    expect(view.seen.at(-1)).toBe('late');
  });
});
