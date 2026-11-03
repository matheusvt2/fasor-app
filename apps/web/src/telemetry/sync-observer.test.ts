// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { queuedUxEvents } from '../db/ux-events-store.ts';
import { SyncRequestError } from '../sync/client.ts';
import type { EngineStatus } from '../sync/engine.ts';
import { flushTelemetry } from './flush.ts';
import { failureCode, failureOutcome, observeCycle, syncWaitOutcome } from './sync-observer.ts';
import { configureTelemetry, resetTelemetryForTests, whenTelemetryWritten } from './track.ts';

/*
 * Story 18.4 (retro A3): the engine observer moved out of `state/sync.tsx`, with the cases of
 * `state/sync-telemetry.test.tsx` that exercised it (E18-A1 R-V3, R-E2 and the offline row).
 */

// E18-A1 (R-V3): the drain itself is `flush.test.ts`'s; here only that a cycle that ran calls it.
vi.mock('./flush.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./flush.ts')>()),
  flushTelemetry: vi.fn(async () => undefined),
}));

const IDLE: EngineStatus = { running: false, paused: false, outdated: false, lastResult: null, lastFailure: null, serverAnswers: null, merges: [] };
const DEVICE = '019966b0-0077-7000-8000-0000000000dd';

let counter = 0;
let db: AppDatabase;

beforeEach(async () => {
  resetTelemetryForTests();
  db = openDatabase(`019966b0-0077-7000-8000-${(++counter).toString(16).padStart(12, '0')}`);
  await db.open();
  configureTelemetry({ db, deviceId: DEVICE });
});

afterEach(() => {
  configureTelemetry(null);
  db.close();
  vi.clearAllMocks();
});

async function results() {
  await whenTelemetryWritten();
  return (await queuedUxEvents(db)).filter((event) => event.name === 'sync_result').map((event) => event.kind);
}

describe('observeCycle (Epic 18, moved by Story 18.4)', () => {
  it.each([
    ['ran', {}],
    ['failed', { lastFailure: { kind: 'http', status: 503 } }],
    ['unauthorized', { lastFailure: { kind: 'http', status: 401 } }],
    ['contract_outdated', { outdated: true }],
  ] as const)('R-V3: a cycle that ran and ended %s queues its sync_result and drains the queue', async (kind, end) => {
    observeCycle(db, IDLE, { ...IDLE, running: true });
    expect(flushTelemetry).not.toHaveBeenCalled();
    observeCycle(db, { ...IDLE, running: true }, { ...IDLE, ...end, running: false, lastResult: 'ran' } as EngineStatus);
    await vi.waitFor(() => expect(flushTelemetry).toHaveBeenCalledTimes(1));
    expect(vi.mocked(flushTelemetry).mock.calls[0]![0]).toBe(db);
    expect(await results()).toEqual([kind]);
  });

  it('R-V3: a status change that is not the end of a running cycle queues no sync_result and drains nothing', async () => {
    observeCycle(db, IDLE, { ...IDLE, lastResult: 'ran' });
    observeCycle(db, { ...IDLE, lastResult: 'ran' }, { ...IDLE, running: true });
    observeCycle(db, { ...IDLE, running: true }, { ...IDLE, running: false, lastResult: 'busy' } as EngineStatus);
    expect(await results()).toEqual([]);
    expect(flushTelemetry).not.toHaveBeenCalled();
  });

  it('two cycles that find the device offline queue one sync_result offline', async () => {
    observeCycle(db, IDLE, { ...IDLE, lastResult: 'offline' });
    observeCycle(db, { ...IDLE, lastResult: 'offline' }, { ...IDLE, lastResult: 'offline' });
    expect(await results()).toEqual(['offline']);
  });

  it('never throws on a closed database', () => {
    db.close();
    expect(() => observeCycle(db, { ...IDLE, running: true }, { ...IDLE, lastResult: 'ran' })).not.toThrow();
  });
});

describe('failureCode and failureOutcome', () => {
  it('reads the api code of an http failure only', () => {
    expect(failureCode(new SyncRequestError({ kind: 'http', status: 409, code: 'not_caught_up' }))).toBe('not_caught_up');
    expect(failureCode(new SyncRequestError({ kind: 'network' }))).toBeUndefined();
    expect(failureCode(new Error('x'))).toBeUndefined();
  });

  it('no network is offline, a 4xx refused, a 5xx or anything else fail', () => {
    expect(failureOutcome(new SyncRequestError({ kind: 'network' }))).toBe('offline');
    expect(failureOutcome(new SyncRequestError({ kind: 'http', status: 401 }))).toBe('refused');
    expect(failureOutcome(new SyncRequestError({ kind: 'http', status: 409, code: 'not_caught_up' }))).toBe('refused');
    expect(failureOutcome(new SyncRequestError({ kind: 'http', status: 503 }))).toBe('fail');
    expect(failureOutcome(new Error('preview job ended without a file'))).toBe('fail');
  });
});

describe('syncWaitOutcome', () => {
  it('R-E2: a "Sincronizar agora" cycle that ends on a network failure is offline; a 5xx fail; a clean one ok', () => {
    expect(syncWaitOutcome('ran', { lastFailure: { kind: 'network' }, outdated: false })).toBe('offline');
    expect(syncWaitOutcome('ran', { lastFailure: { kind: 'http', status: 503 }, outdated: false })).toBe('fail');
    expect(syncWaitOutcome('ran', { lastFailure: null, outdated: false })).toBe('ok');
  });

  it('a 426 or a paused engine is refused, an offline cycle offline', () => {
    expect(syncWaitOutcome('ran', { lastFailure: null, outdated: true })).toBe('refused');
    expect(syncWaitOutcome('paused', { lastFailure: null, outdated: false })).toBe('refused');
    expect(syncWaitOutcome('offline', { lastFailure: null, outdated: false })).toBe('offline');
  });
});
