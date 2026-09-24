import {
  pendingSummaryCount,
  pendingSummaryText,
  syncBadgeState,
  syncCounts,
  type GenerateRequest,
  type GenerateResponse,
  type LastPushAt,
  type RelatorioSummary,
  type SyncBadgeState,
  type FileVariantName,
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
import { createBrowserSyncClient, type SyncClient } from '../sync/client.ts';
import type { SyncFailure } from '../sync/client.ts';
import { unreachableCause } from '../sync/policy.ts';
import { createSyncEngine, type CycleResult, type EngineStatus, type SyncEngine } from '../sync/engine.ts';
import { followOnlineEvents } from '../sync/online.ts';
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
  /**
   * Why the server cannot be reached although the browser is online, or null when it
   * answered the last finished cycle: `server` after a network or 5xx failure, `session`
   * while a new sign-in is required. The badge reads `offline` then (kernel), and Sync
   * status says which of the two it is.
   */
  unreachable: 'server' | 'session' | null;
  running: boolean;
  outdated: boolean;
  lastResult: CycleResult | null;
  /**
   * The failure that ended a phase of the last cycle, or null when it ran clean.
   * `runCycle` answers `'ran'` even when both phases ended in a swallowed failure, so
   * this is the only way a caller can tell a cycle that worked from one that did not.
   */
  lastFailure: SyncFailure | null;
  lastSyncAt: string | null;
  lastPushAt: LastPushAt[];
  supersededCount: number;
  deviceId: string | null;
  /** User names known on this device, by user id, for "Último envio". */
  userNames: Readonly<Record<string, string>>;
  /** AD-8: the company's relatórios as the server summarised them, including the ones never pulled. */
  summaryRelatorios: readonly RelatorioSummary[];
  syncNow: () => Promise<CycleResult>;
  /** Starts following one relatório's stream and pulls it now (AD-8, "pulled on open"). */
  syncRelatorio: (relatorioId: string) => Promise<CycleResult>;
  /**
   * Starts following one project's own stream and pulls it now (Epic 4 retro item 17). The
   * provider always supplies it; it is optional in the type only so a test double built
   * before it existed (the tree's, owned by another batch) still type-checks.
   */
  syncProject?: (projectId: string) => Promise<CycleResult>;
  resendDead: () => Promise<void>;
  /**
   * AD-7: the on-demand file read, handed to the surfaces so a tile can fill its
   * thumbnail. It is the engine's own client, so `src/sync` stays the only caller of the
   * network (AD-1); the cycle itself never fetches a file.
   */
  fetchFile: (id: string, variant: FileVariantName) => Promise<Blob>;
  /**
   * AD-15: the generate barrier, asked for by the Export dialog once the outbox is
   * drained. The engine's own client again, so `src/sync` stays the only caller of the
   * network (AD-1).
   */
  generate: (relatorioId: string, body: GenerateRequest) => Promise<GenerateResponse>;
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
const NO_SUMMARY: RelatorioSummary[] = [];

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
  const clientRef = useRef<SyncClient | null>(null);
  // What the engine reads. The events write it directly (`followOnlineEvents`): the
  // session's state re-renders only after every listener of an `online` event has run,
  // the engine's included. The session's value is copied in only when it changes, never
  // on every render, so a render that still carries the old value cannot undo the event.
  const onlineRef = useRef(session.online);
  useEffect(() => {
    onlineRef.current = session.online;
  }, [session.online]);

  useEffect(() => {
    if (db === null) return;
    // Registered before `engine.start()` subscribes its own `online` listener.
    const stopFollowing = followOnlineEvents(onlineRef);
    const client = createBrowserSyncClient();
    clientRef.current = client;
    const engine = createSyncEngine({
      db,
      client,
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
      stopFollowing();
      engineRef.current = null;
      clientRef.current = null;
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
  const syncRelatorio = useCallback(
    async (relatorioId: string) => (await engineRef.current?.syncRelatorio(relatorioId)) ?? 'paused',
    [],
  );
  const syncProject = useCallback(
    async (projectId: string) => (await engineRef.current?.syncProject(projectId)) ?? 'paused',
    [],
  );
  const resendDead = useCallback(async () => {
    if (db === null) return;
    await resendDeadRows(db);
    await engineRef.current?.runCycle();
  }, [db]);

  /** Stable across renders, so a tile's effect does not re-fetch on every parent render. */
  const fetchFile = useCallback(async (id: string, variant: FileVariantName): Promise<Blob> => {
    const client = clientRef.current;
    if (client === null) throw new Error('sync client is not running');
    return client.fetchFile(id, variant);
  }, []);

  const generate = useCallback(async (relatorioId: string, body: GenerateRequest): Promise<GenerateResponse> => {
    const client = clientRef.current;
    if (client === null) throw new Error('sync client is not running');
    return client.generate(relatorioId, body);
  }, []);

  const unreachable = unreachableCause({ reAuthRequired: session.reAuthRequired, lastFailure: status.lastFailure });

  const value = useMemo<SyncState>(
    () => ({
      counts,
      badgeState: syncBadgeState(counts, { online: session.online, reachable: unreachable === null }),
      pendingText: pendingSummaryText(counts),
      pendingCount: pendingSummaryCount(counts),
      online: session.online,
      unreachable,
      running: status.running,
      outdated: status.outdated,
      lastResult: status.lastResult,
      lastFailure: status.lastFailure,
      lastSyncAt: company?.last_sync_at ?? null,
      lastPushAt: company?.last_push_at ?? [],
      supersededCount: status.supersededCount,
      deviceId: device,
      userNames,
      summaryRelatorios: company?.relatorios ?? NO_SUMMARY,
      syncNow,
      syncRelatorio,
      syncProject,
      resendDead,
      fetchFile,
      generate,
    }),
    [counts, session.online, unreachable, status, company, device, userNames, syncNow, syncRelatorio, syncProject, resendDead, fetchFile, generate],
  );

  return <SyncContext value={value}>{children}</SyncContext>;
}

export function useSync(): SyncState {
  const value = useContext(SyncContext);
  if (value === null) throw new Error('useSync must be used inside SyncProvider');
  return value;
}
