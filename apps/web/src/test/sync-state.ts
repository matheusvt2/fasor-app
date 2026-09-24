import { vi } from 'vitest';
import type { SyncState } from '../state/sync.tsx';

/*
 * Epic 4 retro E4-A9 (P-3): the one test double of `SyncState`. A member added to the
 * provider's value gets its default here once, instead of breaking every surface test that
 * hand-built the whole object. Tests only; never imported by app code.
 */

export type SyncStateOverrides = Partial<Omit<SyncState, 'counts'>> & { counts?: Partial<SyncState['counts']> };

/** The id a default `generate` answer queues. */
export const FAKE_JOB_ID = '019966b0-0000-7000-8000-0000000000e1';

/** An idle, online, clean `SyncState` with every action a `vi.fn`; `overrides` win, `counts` merge. */
export function makeSyncState(overrides: SyncStateOverrides = {}): SyncState {
  const counts = { pending: 0, sent: 0, dead: 0, sheets_pending: 0, photos_pending: 0, ...overrides.counts };
  return {
    badgeState: 'ok',
    pendingText: '',
    pendingCount: 0,
    online: true,
    running: false,
    outdated: false,
    lastResult: 'ran',
    lastFailure: null,
    unreachable: null,
    lastSyncAt: null,
    lastPushAt: [],
    supersededCount: 0,
    deviceId: 'tablet-1',
    userNames: {},
    summaryRelatorios: [],
    syncNow: vi.fn(async () => 'ran' as const),
    syncRelatorio: vi.fn(async () => 'ran' as const),
    syncProject: vi.fn(async () => 'ran' as const),
    resendDead: vi.fn(async () => {}),
    fetchFile: vi.fn(async () => new Blob()),
    generate: vi.fn(async () => ({ outcome: 'queued' as const, job_id: FAKE_JOB_ID, revision_number: 1 })),
    ...overrides,
    counts,
  };
}
