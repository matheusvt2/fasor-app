import 'fake-indexeddb/auto';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase, type OutboxRow } from '../db/schema.ts';
import { queuedUxEvents } from '../db/ux-events-store.ts';
import { SyncRequestError, type SyncClient } from '../sync/client.ts';
import type { EngineStatus, SyncEngine, SyncEngineDeps } from '../sync/engine.ts';
import { flushTelemetry } from '../telemetry/flush.ts';
import { resetTelemetryForTests, telemetryDatabase, whenTelemetryWritten } from '../telemetry/track.ts';
import type { SessionState } from './session.tsx';
import { useSyncActions, type SyncActions } from './sync-actions.ts';
import { SyncProvider } from './sync.tsx';

/*
 * Epic 18 (Story 18.1): the usage events the SyncProvider queues around what it already
 * exposes: the "Sincronizar agora" wait and the api error code of a refused generate, preview
 * or re-read. The engine and the client are stand-ins; the queue is the real device store.
 * Story 18.4: the observer's own cases (`sync_result`, the wait outcomes) moved beside it
 * (`telemetry/sync-observer.test.ts`), and the `generate` and `preview` waits are the
 * Export dialog's (`surfaces/export/export-dialog.test.tsx`).
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
  preview: vi.fn(async (): Promise<unknown> => ({ job_id: '019966b0-0076-7000-8000-0000000000e1' })),
  rereadPhoto: vi.fn(async (): Promise<void> => undefined),
} as unknown as SyncClient & { preview: ReturnType<typeof vi.fn>; rereadPhoto: ReturnType<typeof vi.fn> };

// E18-A1 (R-V3): the drain itself is `flush.test.ts`'s; here only that a cycle that ran calls it.
vi.mock('../telemetry/flush.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../telemetry/flush.ts')>()),
  flushTelemetry: vi.fn(async () => undefined),
}));

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

async function mount(before?: (db: AppDatabase) => Promise<void>): Promise<{ db: AppDatabase; actions: () => SyncActions }> {
  const user = `019966b0-0076-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  await openDatabase(user).delete();
  const db = openDatabase(user);
  database = db;
  await before?.(db);
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

  it('Story 18.4: the provider hands each engine status change to the observer: a cycle that ran queues its sync_result and drains the queue', async () => {
    const { db } = await mount();
    act(() => deps!.onChange({ ...IDLE, running: true }));
    act(() => deps!.onChange({ ...IDLE, running: false, lastResult: 'ran', lastFailure: { kind: 'http', status: 503 } }));
    await waitFor(() => expect(flushTelemetry).toHaveBeenCalledTimes(1));
    expect(vi.mocked(flushTelemetry).mock.calls[0]![0]).toBe(db);
    expect((await queued(db)).filter((event) => event.name === 'sync_result').map((event) => event.kind)).toEqual(['failed']);
  });

  it('Story 18.4: "Sincronizar agora" ends its wait through the observer: a cycle ended on a network failure is offline', async () => {
    const { db, actions } = await mount();
    act(() => deps!.onChange({ ...IDLE, lastResult: 'ran', lastFailure: { kind: 'network' } }));
    await act(async () => {
      await actions().syncNow();
    });
    expect((await queued(db)).filter((event) => event.name === 'wait').map((event) => [event.kind, event.outcome])).toEqual([['sync', 'offline']]);
  });

  it('a generate the api refuses queues the error code, on its relatório, and no wait (Story 18.4: the press times it)', async () => {
    const { db, actions } = await mount();
    await act(async () => {
      await expect(actions().generate(RELATORIO, { last_op_id: null, file_ids_expected: [] })).rejects.toBeInstanceOf(SyncRequestError);
    });
    const events = (await queued(db)).filter((event) => event.name === 'wait' || event.name === 'error');
    expect(events.map(({ name, kind, outcome, relatorio_id }) => ({ name, kind, outcome, relatorio_id }))).toEqual([
      { name: 'error', kind: 'not_caught_up', outcome: undefined, relatorio_id: RELATORIO },
    ]);
  });
});

/** A dead outbox row: an op the server refused for good with `code`. */
function deadRow(n: number, code: string): OutboxRow {
  const id = `019966b0-0076-7000-8000-0000000001${n.toString(16).padStart(2, '0')}`;
  return {
    op_id: id,
    kind: 'put',
    scope: 'relatorio',
    company_id: '019966b0-0076-7000-8000-0000000000c0',
    project_id: null,
    relatorio_id: RELATORIO,
    path: 'relatorio/setup/parecer',
    value: null,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: '019966b0-0076-7000-8000-0000000000a0',
    device_id: '019966b0-0076-7000-8000-0000000000d0',
    client_ts: `2026-11-03T12:00:0${n}.000Z`,
    status: 'dead',
    error_code: code,
    targets: [`relatorio:${RELATORIO}`],
  } as OutboxRow;
}

describe('SyncProvider usage events, E18-A1', () => {
  it('R-V4: an op refused for good after boot queues one error with its code; a row dead at boot queues none', async () => {
    const { db } = await mount(async (fresh) => {
      await fresh.outbox.put(deadRow(1, 'sync_batch_invalid'));
    });
    await act(async () => {
      await db.outbox.put(deadRow(2, 'relatorio_not_found'));
    });
    await waitFor(async () => expect((await queued(db)).filter((event) => event.name === 'error')).toHaveLength(1));
    // A later change of the outbox does not track the same row again.
    await act(async () => {
      await db.outbox.put({ ...deadRow(3, 'internal_error'), status: 'pending', error_code: null });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const errors = (await queued(db)).filter((event) => event.name === 'error');
    expect(errors.map(({ kind, relatorio_id }) => ({ kind, relatorio_id }))).toEqual([{ kind: 'relatorio_not_found', relatorio_id: RELATORIO }]);
  });

  it('R-V5: a preview refused queues its error code, and no wait (Story 18.4: the press times it)', async () => {
    const { db, actions } = await mount();
    await act(async () => {
      await actions().preview!(RELATORIO, { last_op_id: null, file_ids_expected: [] });
    });
    client.preview.mockImplementationOnce(async () => {
      throw new SyncRequestError({ kind: 'http', status: 409, code: 'not_caught_up' });
    });
    await act(async () => {
      await expect(actions().preview!(RELATORIO, { last_op_id: null, file_ids_expected: [] })).rejects.toBeInstanceOf(SyncRequestError);
    });
    client.preview.mockImplementationOnce(async () => {
      throw new SyncRequestError({ kind: 'network' });
    });
    await act(async () => {
      await expect(actions().preview!(RELATORIO, { last_op_id: null, file_ids_expected: [] })).rejects.toBeInstanceOf(SyncRequestError);
    });
    const events = (await queued(db)).filter((event) => event.name === 'wait' || event.name === 'error');
    expect(events.map(({ name, kind, outcome, relatorio_id }) => ({ name, kind, outcome, relatorio_id }))).toEqual([
      { name: 'error', kind: 'not_caught_up', outcome: undefined, relatorio_id: RELATORIO },
    ]);
  });

  it('R-V5: a re-read the api refuses queues its error code; one that goes through queues nothing', async () => {
    const { db, actions } = await mount();
    await act(async () => {
      await actions().rereadPhoto!('019966b0-0076-7000-8000-0000000000f1');
    });
    client.rereadPhoto.mockImplementationOnce(async () => {
      throw new SyncRequestError({ kind: 'http', status: 409, code: 'reading_running' });
    });
    await act(async () => {
      await expect(actions().rereadPhoto!('019966b0-0076-7000-8000-0000000000f1')).rejects.toBeInstanceOf(SyncRequestError);
    });
    const errors = (await queued(db)).filter((event) => event.name === 'error' || event.name === 'wait');
    expect(errors.map(({ name, kind }) => ({ name, kind }))).toEqual([{ name: 'error', kind: 'reading_running' }]);
  });
});
