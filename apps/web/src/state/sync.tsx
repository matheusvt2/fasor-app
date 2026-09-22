import {
  pendingSummaryCount,
  pendingSummaryText,
  syncBadgeState,
  syncCounts,
  type LastPushAt,
  type SyncBadgeState,
  type SyncCounts,
  type UserRow,
} from '@app/domain';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { publishReAuth } from '../api/auth-client.ts';
import { useLiveQuery } from '../db/live.ts';
import { COMPANY_STREAM, type OutboxRow, type SyncStateRow } from '../db/schema.ts';
import { deviceId, localUsers, outboxRows, resendDead as resendDeadRows, syncStateRows } from '../db/sync-store.ts';
import { now } from '../clock.ts';
import { newId } from '../ids.ts';
import { createBrowserSyncClient } from '../sync/client.ts';
import { createSyncEngine, type CycleResult, type EngineStatus, type SyncEngine } from '../sync/engine.ts';
import { useSession } from './session.tsx';

/*
 * AD-1, UX-DR10: the sync badge, the counts and the Sync status surface render
 * kernel results (`syncCounts`, `syncBadgeState`, `pendingSummaryText`) over the
 * live outbox; the engine itself lives in `src/sync`. One provider per session,
 * stopped on sign-out.
 */

export interface SyncState {
  counts: SyncCounts;
  badgeState: Exclude<SyncBadgeState, 'conflict'>;
  /** "3 fichas", "1 ficha e 2 fotos", "5 alterações" or '' (kernel). */
  pendingText: string;
  pendingCount: number;
  online: boolean;
  running: boolean;
  outdated: boolean;
  lastResult: CycleResult | null;
  lastSyncAt: string | null;
  lastPushAt: LastPushAt[];
  supersededCount: number;
  deviceId: string | null;
  /** User names known on this device, by user id, for "Último envio". */
  userNames: Readonly<Record<string, string>>;
  syncNow: () => Promise<CycleResult>;
  resendDead: () => Promise<void>;
}

export const SyncContext = createContext<SyncState | null>(null);

const IDLE: EngineStatus = {
  running: false,
  paused: false,
  outdated: false,
  lastResult: null,
  lastFailure: null,
  supersededCount: 0,
};

const NO_ROWS: OutboxRow[] = [];
const NO_STATES: SyncStateRow[] = [];
const NO_USERS: UserRow[] = [];

const browserTimers = {
  setTimeout: (callback: () => void, ms: number) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

export function SyncProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const db = session.database;
  const [status, setStatus] = useState<EngineStatus>(IDLE);
  const [device, setDevice] = useState<string | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const onlineRef = useRef(session.online);
  onlineRef.current = session.online;

  useEffect(() => {
    if (db === null) return;
    const engine = createSyncEngine({
      db,
      client: createBrowserSyncClient(),
      timers: browserTimers,
      random: Math.random,
      now,
      newId,
      isOnline: () => onlineRef.current,
      onReAuth: publishReAuth,
      onOutdated: () => {},
      onChange: setStatus,
    });
    engineRef.current = engine;
    void deviceId(db, newId).then(setDevice, () => setDevice(null));
    engine.start();
    return () => {
      engine.stop();
      engineRef.current = null;
      setStatus(IDLE);
    };
  }, [db]);

  // A 401 pauses the engine (through onReAuth) and signing in again resumes it.
  useEffect(() => {
    const engine = engineRef.current;
    if (engine === null) return;
    if (session.reAuthRequired) engine.pause();
    else engine.resume();
  }, [session.reAuthRequired, db]);

  const rows = useLiveQuery(() => (db === null ? Promise.resolve(NO_ROWS) : outboxRows(db)), [db], NO_ROWS);
  const states = useLiveQuery(() => (db === null ? Promise.resolve(NO_STATES) : syncStateRows(db)), [db], NO_STATES);
  const users = useLiveQuery(() => (db === null ? Promise.resolve(NO_USERS) : localUsers(db)), [db], NO_USERS);

  const counts = useMemo(() => syncCounts(rows), [rows]);
  const company = states.find((s) => s.id === COMPANY_STREAM);
  const userNames = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);

  const syncNow = useCallback(async () => engineRef.current?.runCycle() ?? 'paused', []);
  const resendDead = useCallback(async () => {
    if (db === null) return;
    await resendDeadRows(db);
    await engineRef.current?.runCycle();
  }, [db]);

  const value = useMemo<SyncState>(
    () => ({
      counts,
      badgeState: syncBadgeState(counts, { online: session.online }),
      pendingText: pendingSummaryText(counts),
      pendingCount: pendingSummaryCount(counts),
      online: session.online,
      running: status.running,
      outdated: status.outdated,
      lastResult: status.lastResult,
      lastSyncAt: company?.last_sync_at ?? null,
      lastPushAt: company?.last_push_at ?? [],
      supersededCount: status.supersededCount,
      deviceId: device,
      userNames,
      syncNow,
      resendDead,
    }),
    [counts, session.online, status, company, device, userNames, syncNow, resendDead],
  );

  return <SyncContext value={value}>{children}</SyncContext>;
}

export function useSync(): SyncState {
  const value = useContext(SyncContext);
  if (value === null) throw new Error('useSync must be used inside SyncProvider');
  return value;
}
