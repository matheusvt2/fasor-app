import {
  decisionSplit,
  decisionTotal,
  downloadRows,
  mergeInfoText,
  syncDecisionRows,
  mergeRowSecondaryText,
  pendingPhotoRows,
  pendingSheetRows,
  pendingSummaryCount,
  pendingSummaryText,
  queuedReadingRows,
  syncBadgeState,
  syncCounts,
  syncHeadlineText,
  syncSummaryBadges,
  type DownloadRow,
  type PendingPhotoRow,
  type PendingSheetContext,
  type PendingSheetRow,
  type QueuedReadingRow,
  type SyncDecisionRow,
  type SyncSummaryBadge,
  type AuditRequest,
  type AuditResponse,
  type GenerateRequest,
  type GenerateResponse,
  type PreviewResponse,
  type LastPushAt,
  type MergeInfo,
  type MergeInfoContext,
  type RelatorioSummary,
  type SyncBadgeState,
  type FileVariantName,
  type SyncCounts,
  type UserRow,
} from '@app/domain';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { publishReAuth } from '../api/auth-client.ts';
import { useLiveQuery } from '../db/live.ts';
import { COMPANY_STREAM, type OutboxRow, type SyncStateRow } from '../db/schema.ts';
import { heldDecisions, type HeldDecisions } from '../db/decision-store.ts';
import {
  deviceId,
  downloadRowsContext,
  localUsers,
  mergeTextContext,
  outboxRows,
  pendingSheetContext,
  resendDead as resendDeadRows,
  syncStateRows,
  unackedPhotoUploads,
  type DownloadRowsContext,
} from '../db/sync-store.ts';
import { clearUploadError } from '../db/file-store.ts';
import { readingCountRows, type ReadingCountRows } from '../db/suggestion-store.ts';
import { storageHeadroom } from '../device/storage-estimate.ts';
import { now } from '../clock.ts';
import { newId } from '../ids.ts';
import { createBrowserSyncClient, type SyncClient } from '../sync/client.ts';
import type { SyncFailure } from '../sync/client.ts';
import { unreachableCause } from '../sync/policy.ts';
import { createSyncEngine, type CycleResult, type EngineStatus, type SyncEngine } from '../sync/engine.ts';
import { followOnlineEvents } from '../sync/online.ts';
import { useSession } from './session.tsx';
import { SyncActionsContext, type SyncActions } from './sync-actions.ts';

/*
 * AD-1, UX-DR10: the sync badge, the counts and the Sync status surface render
 * kernel results (`syncCounts`, `syncBadgeState`, `pendingSummaryText`) over the
 * live outbox; the engine itself lives in `src/sync`. One provider per session,
 * stopped on sign-out.
 */

export interface SyncState {
  counts: SyncCounts;
  badgeState: SyncBadgeState;
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
  /**
   * Story 10.1: the merges by rule of this tab session (engine memory; a reload clears
   * them), each with its Sync status row words (`mergeInfoText`, kernel); Story 10.4 adds
   * the secondary line (`mergeRowSecondaryText`).
   */
  merges: readonly { key: string; info: MergeInfo; text: string; secondary?: string }[];
  /**
   * Story 10.4 (FR-60): the rows of the full Sync status surface, each derived by the kernel.
   * Optional in the type only so the test doubles built before them still type-check; the
   * provider always supplies them.
   */
  /** The headline's counts ("3 fichas e 12 fotos aguardando · 2 leituras na fila"). */
  headline: string;
  /** The `.sync-summary` compact badges. */
  summaryBadges: readonly SyncSummaryBadge[];
  /** E10-Q7: how many decisions wait (`decisionTotal`: one per contradicting cell, one per structure case), the Decisões head badge's figure. */
  decisionCount: number;
  /** "Enviando › Fichas": one row per block with unsent ops. */
  pendingSheets?: readonly PendingSheetRow[];
  /** "Enviando › Fotos": the originals still to upload (at most ten) and how many more. */
  uploads?: { rows: readonly PendingPhotoRow[]; more: number };
  /** "Leituras": the photos whose reading is queued or running. */
  readingsQueued?: readonly QueuedReadingRow[];
  /** "Baixando": each relatório stream not pulled to its end. */
  downloads?: readonly DownloadRow[];
  /**
   * "Decisões" (the X/S seam): one row per open decision on this device, the kernel's
   * `syncDecisionRows` over `heldDecisions` (a duplicate TAG held by two relatórios of one
   * project is one row). Their count is `decisionTotal`, which feeds the headline and the badge.
   */
  decisions?: readonly SyncDecisionRow[];
  /**
   * Stories 10.2/10.3: the open decisions of every relatório held on this device (kernel
   * `openDecisions`, read live from IndexedDB), per relatório with the rows they name: the
   * sheet and Sumário Banners read their own relatório's, and the "Decisões" rows resolve
   * through them. Optional in the type only so the older test doubles still type-check.
   */
  heldDecisions?: readonly HeldDecisions[];
  /** False while the device's outbox has not been read yet (the Sync status surface says it is loading). Optional for the older test doubles. */
  outboxRead?: boolean;
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
   * Story 6.2: the upload pill's "Erro — Tentar novamente": clears the file's persisted
   * error and runs "Sincronizar agora". Optional in the type only so the test doubles built
   * before it existed still type-check; the provider always supplies it.
   */
  retryUpload?: (fileId: string) => Promise<void>;
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
  /**
   * Story 7.5: the preview job, asked for by the Export dialog's "Pré-visualizar" once the
   * outbox is drained. Optional in the type only so the test doubles built before it existed
   * still type-check; the provider always supplies it.
   */
  preview?: (relatorioId: string, body: GenerateRequest) => Promise<PreviewResponse>;
  /**
   * Story 8.2: "Tentar novamente" of a failed plate reading (`POST /api/photos/{id}/reread`).
   * The engine's own client again (AD-1). Rejects on any answer but a 2xx. Optional in the
   * type only so the test doubles built before it existed still type-check.
   */
  rereadPhoto?: (photoId: string) => Promise<void>;
  /**
   * Story 13.8: "Conferir antes de emitir" (`POST /api/relatorios/{id}/audit`), asked for by
   * the Export dialog once the outbox is drained. The engine's own client again (AD-1).
   * Optional in the type only so the test doubles built before it existed still type-check.
   */
  audit?: (relatorioId: string, body: AuditRequest) => Promise<AuditResponse>;
}

export const SyncContext = createContext<SyncState | null>(null);

const IDLE: EngineStatus = {
  running: false,
  paused: false,
  outdated: false,
  lastResult: null,
  lastFailure: null,
  merges: [],
};

const NO_ROWS: OutboxRow[] = [];
const NO_STATES: SyncStateRow[] = [];
const NO_USERS: UserRow[] = [];
const NO_SUMMARY: RelatorioSummary[] = [];
const NO_READING: ReadingCountRows = { suggestions: [], photos: [] };
const NO_CONTEXT: MergeInfoContext = { blocks: [], equipment: [], users: [], files: [] };
const NO_SHEET_CONTEXT: PendingSheetContext = { blocks: [], equipment: [], users: [] };
const NO_UPLOADS: Awaited<ReturnType<typeof unackedPhotoUploads>> = [];
const NO_DOWNLOAD_CONTEXT: DownloadRowsContext = { projects: [], clients: [], local: new Map() };
const NO_HELD: HeldDecisions[] = [];

const browserTimers = {
  setTimeout: (callback: () => void, ms: number) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

const cycleRequests = new Set<() => void>();

/**
 * E6-Q14: new work was committed on this device (a photo captured or imported): the mounted
 * engine runs a cycle now when online, coalesced with one in flight (`SyncEngine.nudge`),
 * so the photo does not wait for the 60 s tick. A no-op with no provider mounted.
 */
export function requestSyncCycle(): void {
  for (const request of cycleRequests) request();
}

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
  // Story 8.1: who auto-confirms a pulled suggestion; read by the engine at pull time.
  const userRef = useRef(session.user);
  useEffect(() => {
    userRef.current = session.user;
  }, [session.user]);
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
      readStorage: storageHeadroom,
      author: () => {
        const user = userRef.current;
        return user === null ? null : { id: user.id, companyId: user.companyId };
      },
    });
    engineRef.current = engine;
    void deviceId(db, newId).then(setDevice, () => setDevice(null));
    engine.start();
    const nudge = () => engine.nudge();
    cycleRequests.add(nudge);
    return () => {
      cycleRequests.delete(nudge);
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

  const loadedRows = useLiveQuery(() => (db === null ? Promise.resolve(NO_ROWS) : outboxRows(db)), [db]);
  const rows = loadedRows ?? NO_ROWS;
  // Matheus, 2026-09-30: the Sync status surface says it is loading until the outbox is read.
  const outboxRead = db === null || loadedRows !== undefined;
  const states = useLiveQuery(() => (db === null ? Promise.resolve(NO_STATES) : syncStateRows(db)), [db], NO_STATES);
  const users = useLiveQuery(() => (db === null ? Promise.resolve(NO_USERS) : localUsers(db)), [db], NO_USERS);

  // Story 8.2: the readings still queued and the suggestions still pending on this device.
  const reading = useLiveQuery(() => (db === null ? Promise.resolve(NO_READING) : readingCountRows(db)), [db], NO_READING);
  // Story 10.4: the photo originals still to upload, counted with the ops and listed.
  const photoUploads = useLiveQuery(() => (db === null ? Promise.resolve(NO_UPLOADS) : unackedPhotoUploads(db)), [db], NO_UPLOADS);
  const counts = useMemo(
    () => syncCounts(rows, reading, status.merges, photoUploads.map((upload) => ({ id: upload.id, error: upload.error }))),
    [rows, reading, status.merges, photoUploads],
  );
  const unreachable = unreachableCause({ reAuthRequired: session.reAuthRequired, lastFailure: status.lastFailure });
  // E10-Q5: a `sent` row reads "Enviando…" only while a push can actually be in flight.
  const requestOpen = status.running && session.online && unreachable === null;
  const sheetContext = useLiveQuery(() => (db === null ? Promise.resolve(NO_SHEET_CONTEXT) : pendingSheetContext(db, rows)), [db, rows], NO_SHEET_CONTEXT);
  const pendingSheets = useMemo(() => pendingSheetRows(rows, sheetContext, { requestOpen }), [rows, sheetContext, requestOpen]);
  const uploads = useMemo(() => pendingPhotoRows(photoUploads), [photoUploads]);
  const readingsQueued = useMemo(() => queuedReadingRows(reading.photos), [reading.photos]);
  // Story 10.1: the rows each merge row names (block, TAG, author, photo), read live.
  const mergeContext = useLiveQuery(
    () => (db === null ? Promise.resolve(NO_CONTEXT) : mergeTextContext(db, status.merges)),
    [db, status.merges],
    NO_CONTEXT,
  );
  const merges = useMemo(
    () =>
      status.merges.map((info) => ({
        key: `${info.op_id}:${info.over_op_id}`,
        info,
        text: mergeInfoText(info, mergeContext),
        secondary: mergeRowSecondaryText(info),
      })),
    [status.merges, mergeContext],
  );
  const company = states.find((s) => s.id === COMPANY_STREAM);
  // Story 10.4: the relatório streams still downloading, named and counted against the summary.
  const downloadingKey = states
    .filter((s) => !s.complete)
    .map((s) => s.id)
    .sort()
    .join(',');
  const downloadContext = useLiveQuery(
    () => (db === null || downloadingKey === '' ? Promise.resolve(NO_DOWNLOAD_CONTEXT) : downloadRowsContext(db, downloadingKey.split(','))),
    [db, downloadingKey],
    NO_DOWNLOAD_CONTEXT,
  );
  const downloads = useMemo(
    () => downloadRows({ states, summaries: company?.relatorios ?? NO_SUMMARY, ...downloadContext }),
    [states, company, downloadContext],
  );
  const userNames = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);
  // Stories 10.2/10.3 (the X/S seam): the open decisions on this device, one source for the
  // "Decisões" rows, the headline's contradiction count and the badge's "Conflito".
  const held = useLiveQuery(() => (db === null ? Promise.resolve(NO_HELD) : heldDecisions(db)), [db], NO_HELD);
  const viewerId = session.user?.id ?? null;
  const decisions = useMemo(
    () => syncDecisionRows(held, { users, viewerActorId: viewerId, viewerDeviceId: device }),
    [held, users, viewerId, device],
  );
  const decisionCount = useMemo(() => decisionTotal(held), [held]);
  // E10-Q4: cells and structure are worded apart; the badge state counts the total.
  const split = useMemo(() => decisionSplit(held), [held]);

  // W-4 (full review 2026-09-30): "Sincronizar agora" and "Reenviar" run a cycle that starts
  // after any cycle in flight, never answer `busy` and leave the work to the 60 s tick.
  const syncNow = useCallback(async () => (await engineRef.current?.runFreshCycle()) ?? 'paused', []);
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
    await engineRef.current?.runFreshCycle();
  }, [db]);

  const retryUpload = useCallback(
    async (fileId: string) => {
      if (db === null) return;
      const engine = engineRef.current;
      if (engine === null) {
        await clearUploadError(db, fileId);
        return;
      }
      // The error is cleared and a cycle that starts after any cycle in flight runs, however
      // long that one takes: a bounded wait here used to leave the retry to the 60 s tick
      // whenever the cycle in flight outlasted it (6.2-E2E-001 under load).
      await engine.retryUpload(fileId);
    },
    [db],
  );

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

  const preview = useCallback(async (relatorioId: string, body: GenerateRequest): Promise<PreviewResponse> => {
    const client = clientRef.current;
    if (client === null || client.preview === undefined) throw new Error('sync client is not running');
    return client.preview(relatorioId, body);
  }, []);

  const rereadPhoto = useCallback(async (photoId: string): Promise<void> => {
    const client = clientRef.current;
    if (client === null) throw new Error('sync client is not running');
    await client.rereadPhoto(photoId);
  }, []);

  const audit = useCallback(async (relatorioId: string, body: AuditRequest): Promise<AuditResponse> => {
    const client = clientRef.current;
    if (client === null || client.audit === undefined) throw new Error('sync client is not running');
    return client.audit(relatorioId, body);
  }, []);

  // W-8: the callbacks alone, stable for the session, for the components that only act.
  const actions = useMemo<SyncActions>(
    () => ({ syncNow, syncRelatorio, syncProject, resendDead, retryUpload, fetchFile, generate, preview, rereadPhoto, audit }),
    [syncNow, syncRelatorio, syncProject, resendDead, retryUpload, fetchFile, generate, preview, rereadPhoto, audit],
  );

  const value = useMemo<SyncState>(
    () => ({
      counts,
      badgeState: syncBadgeState(counts, { online: session.online, reachable: unreachable === null, conflicts: decisionCount }),
      headline: syncHeadlineText({ counts, ...split }),
      summaryBadges: syncSummaryBadges({ counts, ...split }),
      decisionCount,
      pendingSheets,
      uploads,
      readingsQueued,
      downloads,
      decisions,
      heldDecisions: held,
      outboxRead,
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
      merges,
      deviceId: device,
      userNames,
      summaryRelatorios: company?.relatorios ?? NO_SUMMARY,
      syncNow,
      syncRelatorio,
      syncProject,
      resendDead,
      retryUpload,
      fetchFile,
      generate,
      preview,
      rereadPhoto,
      audit,
    }),
    [counts, outboxRead, session.online, unreachable, status, merges, pendingSheets, uploads, readingsQueued, downloads, held, decisions, decisionCount, split, company, device, userNames, syncNow, syncRelatorio, syncProject, resendDead, retryUpload, fetchFile, generate, preview, rereadPhoto, audit],
  );

  return (
    <SyncActionsContext value={actions}>
      <SyncContext value={value}>{children}</SyncContext>
    </SyncActionsContext>
  );
}

/**
 * F-13 (review 2026-10-06): the browser is online and the server answered the last cycle, so
 * a shot goes out now and its reading runs; false outside a `SyncProvider`.
 */
export function useServerReachable(): boolean {
  const value = use(SyncContext);
  return value !== null && value.online && value.unreachable === null;
}

/** The whole sync state, live data and actions. Read with `use`, so `useSyncActions` may fall back to it after a condition. */
export function useSync(): SyncState {
  const value = use(SyncContext);
  if (value === null) throw new Error('useSync must be used inside SyncProvider');
  return value;
}
