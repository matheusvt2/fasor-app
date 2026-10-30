import 'fake-indexeddb/auto';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { queuedUxEvents } from '../db/ux-events-store.ts';
import { SyncRequestError, type SyncClient } from '../sync/client.ts';
import type { EngineStatus, SyncEngine, SyncEngineDeps } from '../sync/engine.ts';
import { resetTelemetryForTests, telemetryDatabase, whenTelemetryWritten } from '../telemetry/track.ts';
import type { SessionState } from './session.tsx';
import { useSyncActions, type SyncActions } from './sync-actions.ts';
import { SyncProvider } from './sync.tsx';

/*
 * Epic 18 (Story 18.1): the usage events the SyncProvider queues around what it already
 * exposes: the "Sincronizar agora" wait, a refused generate's wait and api error code, and
 * the `sync_result` of a cycle that found the device offline (once on the way in). The engine
 * and the client are stand-ins; the queue is the real device store.
 */

let database: AppDatabase | null = null;
let counter = 0;

vi.mock('./session.tsx', () => ({
  useSession: (): Partial<SessionState> => ({ status: 'signed-in', user: null, online: true, reAuthRequired: false, database, settled: true }),
}));

let deps: SyncEngineDeps | null = null;
const engine = {
  runCycle: vi.fn(async () => 'ran' as const),
  runFreshCycle: vi.fn(async () => 'ran' as const),
  syncRelatorio: vi.fn(async () => 'ran' as const),
  syncProject: vi.fn(async () => 'ran' as const),
  retryUpload: vi.fn(async () => 'ran' as const),
  start: vi.fn(),
  nudge: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  status: vi.fn(() => IDLE),
} satisfies SyncEngine;

vi.mock('../sync/engine.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sync/engine.ts')>()),
  createSyncEngine: (given: SyncEngineDeps) => {
    deps = given;
    return engine;
  },
}));

const client = {
  generate: vi.fn(async () => {
    throw new SyncRequestError({ kind: 'http', status: 409, code: 'not_caught_up' });
  }),
} as unknown as SyncClient;

vi.mock('../sync/client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sync/client.ts')>()),
  createBrowserSyncClient: () => client,
}));

const IDLE: EngineStatus = { running: false, paused: false, outdated: false, lastResult: null, lastFailure: null, serverAnswers: null, merges: [] };
const RELATORIO = '019966b0-0076-7000-8000-000000000071';

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
  deps = null;
  resetTelemetryForTests();
  vi.clearAllMocks();
});

async function mount(): Promise<{ db: AppDatabase; actions: () => SyncActions }> {
  const user = `019966b0-0076-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  await openDatabase(user).delete();
  const db = openDatabase(user);
  database = db;
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
  // The provider points the queue at this database once it has read the device id.
  await waitFor(() => expect(telemetryDatabase()).toBe(db));
  return { db, actions: () => actions! };
}

async function queued(db: AppDatabase) {
  await whenTelemetryWritten();
  return queuedUxEvents(db);
}

describe('SyncProvider usage events (Epic 18)', () => {
  it('"Sincronizar agora" queues a sync wait with a whole duration and its outcome; a 426 cycle reads refused', async () => {
    const { db, actions } = await mount();
    await act(async () => {
      await actions().syncNow();
    });
    let waits = (await queued(db)).filter((event) => event.name === 'wait');
    expect(waits).toHaveLength(1);
    expect(waits[0]).toMatchObject({ kind: 'sync', outcome: 'ok' });
    expect(Number.isInteger(waits[0]!.duration_ms)).toBe(true);
    expect(waits[0]!.duration_ms).toBeGreaterThanOrEqual(0);

    act(() => deps!.onChange({ ...IDLE, outdated: true, lastResult: 'ran' }));
    await act(async () => {
      await actions().syncNow();
    });
    waits = (await queued(db)).filter((event) => event.name === 'wait');
    expect(waits.map((event) => event.outcome)).toEqual(['ok', 'refused']);
  });

  it('a generate the api refuses queues a refused generate wait and the error code, on its relatório', async () => {
    const { db, actions } = await mount();
    await act(async () => {
      await expect(actions().generate(RELATORIO, { last_op_id: null, file_ids_expected: [] })).rejects.toBeInstanceOf(SyncRequestError);
    });
    const events = (await queued(db)).filter((event) => event.name === 'wait' || event.name === 'error');
    expect(events.map(({ name, kind, outcome, relatorio_id }) => ({ name, kind, outcome, relatorio_id }))).toEqual([
      { name: 'wait', kind: 'generate', outcome: 'refused', relatorio_id: RELATORIO },
      { name: 'error', kind: 'not_caught_up', outcome: undefined, relatorio_id: RELATORIO },
    ]);
  });

  it('two cycles that find the device offline queue one sync_result offline', async () => {
    const { db } = await mount();
    act(() => deps!.onChange({ ...IDLE, lastResult: 'offline' }));
    act(() => deps!.onChange({ ...IDLE, lastResult: 'offline' }));
    const results = (await queued(db)).filter((event) => event.name === 'sync_result');
    expect(results.map((event) => event.kind)).toEqual(['offline']);
  });
});
