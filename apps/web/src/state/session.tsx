import {
  councilSchema,
  photoLocationPut,
  registrationOfUserRow,
  registrationPuts,
  type AccountResponse,
  type Registration,
  type UserProfile,
} from '@app/domain';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as authClient from '../api/auth-client.ts';
import { AiFeaturesContext, setAiFeaturesValue } from './ai-features.tsx';
import { now } from '../clock.ts';
import { commitBatch } from '../db/commit.ts';
import { readRecoveryNotice, writeRecoveryNotice } from '../db/prefs.ts';
import { localUser, unsentRegistration, type UnsentRegistration } from '../db/sync-store.ts';
import { databaseExists, databaseName, deleteDatabase, openDatabase, type AppDatabase } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { flushTelemetry } from '../telemetry/flush.ts';
import { configureTelemetry } from '../telemetry/track.ts';
import { clearUserStorage } from './user-storage.ts';
import {
  addPendingWipe,
  clearLastSession,
  readAiFeatures,
  readLastSession,
  readPendingWipes,
  readReAuthRequired,
  removePendingWipe,
  writeAiFeatures,
  writeLastSession,
  writeReAuthRequired,
} from './last-session.ts';

/**
 * Session context (AD-8, AD-9). Boots from the cookie, holds the signed-in user, the
 * online flag and the re-auth flag, and owns the handle to this user's Dexie database.
 *
 * A 401 mid-use raises `reAuthRequired` and nothing else: the database and every store
 * stay exactly as they are. Story 20.11 (2026-11-04) changed the boot: a 401 at boot lands
 * on Login and never shows the local data, while the last-session pointer and the database
 * are kept, so the same user's sign-in reaches the outbox again and an offline cold open
 * still reaches the local data behind the re-auth banner (retro A8). Offline, only a
 * database that exists on the device opens.
 *
 * A confirmed sign-out deletes the user's database (Story 20.11, S2): a pointer put back by
 * hand afterwards finds nothing to open, and nothing written then can reach the server.
 */

export type SessionStatus = 'booting' | 'signed-out' | 'signed-in';

export interface SessionState {
  status: SessionStatus;
  user: UserProfile | null;
  online: boolean;
  reAuthRequired: boolean;
  /**
   * Story 11.8 follow-up: the server's `features.ai` (its `AI_FEATURES` flag). The fresh
   * account read wins, else the cached value, else `true`. While false every entry point of
   * a reading kind `readingNeedsAi` names is hidden.
   */
  aiFeatures: boolean;
  /**
   * AD-8: the cookie survived but the store did not. Set only on the cold-open branch
   * that had no local pointer, was confirmed by the server, and opened a database that
   * did not exist a moment ago.
   */
  recoveryNeeded: boolean;
  database: AppDatabase | null;
  /**
   * Fix batch fxpw G1: whether the boot's server read has settled (a confirmed user attached,
   * unreachable, or no session), or a form sign-in has landed; sign-out leaves it true. The
   * sync engine runs only on a database the server has answered for: until then `database`
   * may be the cached pointer's, which a cookie of another user replaces mid-pull.
   */
  settled: boolean;
  signIn: (email: string, password: string) => Promise<authClient.SignInResult>;
  signOut: () => Promise<void>;
  /**
   * Commits the registration as the user's own `user/{id}/{field}` ops (AD-1): local and
   * immediate, online or not; the sync engine pushes them. Throws only when the device
   * refuses the write.
   */
  saveRegistration: (registration: Registration) => Promise<void>;
  /**
   * Story 11.5 (FR-8): commits Account's "Localização nas fotos" switch as the user's own
   * `user/{id}/photo_location_enabled` op, local and immediate like `saveRegistration`.
   */
  savePhotoLocation: (enabled: boolean) => Promise<void>;
  /** Hides the recovery screen and remembers it in `local_prefs`, so it is one-time. */
  dismissRecovery: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

/**
 * The server's profile with the registration fields this device committed and has not
 * pushed yet laid over it: until the push lands, the device's own values are the newer
 * ones (item 8a of retro A5). Anything that does not parse is ignored.
 */
export function withUnsentRegistration(profile: UserProfile, unsent: UnsentRegistration): UserProfile {
  const next = { ...profile };
  const council = councilSchema.safeParse(unsent.council);
  if (council.success) next.council = council.data;
  if (typeof unsent.registration_number === 'string') next.registrationNumber = unsent.registration_number;
  if (typeof unsent.title === 'string') next.title = unsent.title;
  return next;
}

function readOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/**
 * Story 20.11 (authored, 2026-11-04): how long an online cold open with a cached pointer
 * waits for the server's answer before it shows Home from the pointer. A 401 inside the wait
 * lands on Login with nothing shown; a later one closes the database and lands there too.
 */
export const BOOT_SESSION_WAIT_MS = 3_000;

/** Story 20.11: how long sign-out waits for the usage-event flush and for the database delete. */
export const SIGN_OUT_DELETE_WAIT_MS = 5_000;

/** The boot's server read: a session, a 401, or no answer at all. */
type BootRead = { kind: 'session'; account: AccountResponse } | { kind: 'none' } | { kind: 'unreachable' };

function readBootSession(): Promise<BootRead> {
  return authClient.readSession().then(
    (account): BootRead => (account === null ? { kind: 'none' } : { kind: 'session', account }),
    (): BootRead => ({ kind: 'unreachable' }),
  );
}

function raceBootRead(read: Promise<BootRead>, ms: number): Promise<BootRead | 'waiting'> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('waiting'), ms);
    void read.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

/** Resolves true when `work` settled within `ms`, false when it failed or the wait ran out first. */
function withTimeout(work: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    work.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}

/**
 * Story 20.11: the deletes a sign-out could not finish, retried before any database opens.
 * E20-A1 (R-4b): a pending wipe means a sign-out stopped part way (a tab closed mid-way), so the
 * user's browser-storage keys it clears last go too (`clearUserStorage`).
 */
async function runPendingWipes(): Promise<void> {
  const pending = readPendingWipes();
  if (pending.length > 0) clearUserStorage();
  for (const name of pending) {
    if (await withTimeout(deleteDatabase(name), SIGN_OUT_DELETE_WAIT_MS)) removePendingWipe(name);
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('booting');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [online, setOnline] = useState<boolean>(readOnline);
  const [reAuthRequired, setReAuthRequired] = useState(false);
  const [aiFeatures, setAiFeatures] = useState<boolean>(() => readAiFeatures() ?? true);
  const [recoveryNeeded, setRecoveryNeeded] = useState(false);
  const [database, setDatabase] = useState<AppDatabase | null>(null);
  const [settled, setSettled] = useState(false);
  const databaseRef = useRef<AppDatabase | null>(null);
  const userRef = useRef<UserProfile | null>(null);
  userRef.current = user;

  /**
   * Opening IndexedDB can be refused outright (private mode, blocked site data). That
   * must never hold up the session: the handle stays null, the failure is logged, and
   * the app signs in anyway.
   *
   * Answers whether this open is the one that created the store (AD-8's eviction
   * signal), which only the cold-open branch below acts on; a refused open answers
   * false, because nothing can be said about a store that never opened.
   */
  const attachDatabase = useCallback(async (userId: string): Promise<boolean> => {
    if (databaseRef.current?.name === databaseName(userId)) return databaseRef.current.createdFresh;
    databaseRef.current?.close();
    databaseRef.current = null;
    setDatabase(null);
    try {
      const opened = openDatabase(userId);
      await opened.open();
      databaseRef.current = opened;
      setDatabase(opened);
      return opened.createdFresh;
    } catch (error) {
      console.warn('could not open the device database', error);
      return false;
    }
  }, []);

  /** Hides the screen for good on this database (AD-8's "one-time"). */
  const dismissRecovery = useCallback(() => {
    setRecoveryNeeded(false);
    const db = databaseRef.current;
    if (db !== null) void writeRecoveryNotice(db, 'dismissed').catch(() => {});
  }, []);

  // Cold open (AD-9 as amended by Story 20.11). Databases a sign-out could not delete are
  // deleted first, before anything opens. With a cached pointer, an online device waits up to
  // `BOOT_SESSION_WAIT_MS` for the server: a 401 lands on Login without opening the database
  // (the pointer, the database and its outbox stay for the same user's next sign-in); a
  // confirmed session attaches as before. Offline, unreachable, or slower than the wait, the
  // pointer's database opens behind the banner, as long as that database exists on this
  // device: a pointer put back by hand after a sign-out (S2) finds none and lands on Login.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await runPendingWipes();
      if (cancelled) return;
      const cached = readLastSession();
      const sessionRead = readBootSession();

      let early: BootRead | 'waiting' = 'waiting';
      if (cached !== null && readOnline()) early = await raceBootRead(sessionRead, BOOT_SESSION_WAIT_MS);
      if (cancelled) return;

      let attachedFromCache = false;
      if (cached !== null && (early === 'waiting' || early.kind === 'unreachable')) {
        const exists = await databaseExists(databaseName(cached.id));
        if (cancelled) return;
        if (exists) {
          setUser(cached);
          // A 401 seen before this open still stands until a session is confirmed, so an
          // offline open after it shows the banner too.
          setReAuthRequired(readReAuthRequired());
          await attachDatabase(cached.id);
          if (cancelled) return;
          attachedFromCache = true;
          setStatus('signed-in');
        }
      }

      const read = early === 'waiting' ? await sessionRead : early;
      if (cancelled) return;
      if (read.kind === 'session') {
        writeAiFeatures(read.account.features.ai);
        setAiFeaturesValue(read.account.features.ai);
        setAiFeatures(read.account.features.ai);
      }

      if (read.kind === 'unreachable') {
        // Offline. A cached session whose database is here keeps working; without one there
        // is nothing to show but Login, which will explain that signing in needs a
        // connection. The pointer stays, so AD-8's recovery still runs once online.
        if (!attachedFromCache) {
          setUser(null);
          setStatus('signed-out');
        }
        setSettled(true);
        return;
      }

      if (read.kind === 'none') {
        // The server dropped the session. Without a pointer this is a plain Login. With one,
        // Story 20.11: the device goes to Login and shows none of the local data. The pointer,
        // the remembered 401 and the database stay, so the same user's sign-in reaches the
        // outbox again, and an offline reopen still shows the banner (AD-9).
        if (cached !== null) writeReAuthRequired(true);
        if (attachedFromCache) {
          databaseRef.current?.close();
          databaseRef.current = null;
          setDatabase(null);
        }
        setUser(null);
        setReAuthRequired(false);
        setStatus('signed-out');
        setSettled(true);
        return;
      }

      const fresh = read.account.user;
      writeReAuthRequired(false);
      setReAuthRequired(false);
      const createdFresh = await attachDatabase(fresh.id);
      if (cancelled) return;
      // A registration saved on this device and not pushed yet is newer than what the
      // server just returned: it stays, in the session and in the pointer, until the push.
      const opened = databaseRef.current;
      const unsent = opened === null ? {} : await unsentRegistration(opened, fresh.id).catch(() => ({}));
      if (cancelled) return;
      const confirmed = withUnsentRegistration(fresh, unsent);
      writeLastSession(confirmed);
      setUser(confirmed);
      // AD-8: "session cookie present, database absent". Reaching this line means the
      // server confirmed a session; `createdFresh` means the store did not exist a
      // moment ago. Together that is an evicted origin — never a first sign-in, which
      // always goes through the form and never runs this effect.
      //
      // The screen must survive a reload the user makes before pressing its action, so
      // the condition is recorded in `local_prefs` and every boot reads it back.
      const db = databaseRef.current;
      if (db !== null) {
        if (createdFresh) await writeRecoveryNotice(db, 'pending').catch(() => {});
        const notice = await readRecoveryNotice(db);
        if (cancelled) return;
        setRecoveryNeeded(notice === 'pending');
      }
      setStatus('signed-in');
      setSettled(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [attachDatabase]);

  useEffect(() => {
    const update = () => setOnline(readOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(
    () =>
      authClient.onReAuthRequired(() => {
        writeReAuthRequired(true);
        setReAuthRequired(true);
      }),
    [],
  );

  const doSignIn = useCallback(
    async (email: string, password: string) => {
      const result = await authClient.signIn(email, password);
      if (result.ok) {
        writeAiFeatures(result.features.ai);
        setAiFeaturesValue(result.features.ai);
        setAiFeatures(result.features.ai);
        // The form path never raises the recovery screen: a first sign-in always comes
        // through here, and a fresh database is then exactly what is expected.
        await attachDatabase(result.user.id);
        // Story 20.11: a wipe a sign-out left pending for this user's database ran before
        // this open (IndexedDB queues the open behind the delete); the next boot must not
        // delete the database this sign-in just opened.
        removePendingWipe(databaseName(result.user.id));
        // A re-auth sign-in may find a registration saved here and not pushed yet: it is
        // newer than the profile the server just returned (same rule as the boot).
        const opened = databaseRef.current;
        const unsent = opened === null ? {} : await unsentRegistration(opened, result.user.id).catch(() => ({}));
        const user = withUnsentRegistration(result.user, unsent);
        writeLastSession(user);
        setUser(user);
        writeReAuthRequired(false);
        setReAuthRequired(false);
        setStatus('signed-in');
        setSettled(true);
      }
      return result;
    },
    [attachDatabase],
  );

  /**
   * Throws when the server could not be reached, and then clears nothing: the caller
   * shows the failure and the user stays signed in. Story 20.11: a confirmed sign-out
   * leaves nothing of the user on the device. The usage events still queued are offered to
   * the server first, while the session still authorizes them (best effort); then the
   * server ends the session, the handle is closed, the database is recorded as a pending
   * wipe and deleted, and only then is the pointer cleared. A delete another tab blocks past
   * `SIGN_OUT_DELETE_WAIT_MS` stays recorded and runs at the next boot before any open.
   */
  const doSignOut = useCallback(async () => {
    const before = databaseRef.current;
    if (before !== null) await withTimeout(flushTelemetry(before).catch(() => undefined), SIGN_OUT_DELETE_WAIT_MS);
    await authClient.signOut();
    const db = databaseRef.current;
    const name = db?.name ?? (userRef.current === null ? null : databaseName(userRef.current.id));
    configureTelemetry(null);
    db?.close();
    databaseRef.current = null;
    setDatabase(null);
    if (name !== null) {
      addPendingWipe(name);
      if (await withTimeout(deleteDatabase(name), SIGN_OUT_DELETE_WAIT_MS)) removePendingWipe(name);
    }
    clearLastSession();
    // e20f (QA N3): the relatório ids kept in browser storage go too.
    clearUserStorage();
    setAiFeaturesValue(null);
    setAiFeatures(true);
    setUser(null);
    setReAuthRequired(false);
    setRecoveryNeeded(false);
    setStatus('signed-out');
  }, []);

  const doSaveRegistration = useCallback(
    async (registration: Registration) => {
      const db = databaseRef.current;
      if (db === null || user === null) throw new Error('no device database to commit the registration to');
      // Only the fields that changed from what Account shows (the kernel row, or the
      // profile until the pull brings it) are written; an unchanged save commits nothing.
      const row = await localUser(db, user.id);
      const puts = registrationPuts({
        userId: user.id,
        companyId: user.companyId,
        registration,
        current: row === null ? user : registrationOfUserRow(row),
      });
      if (puts.length > 0) await commitBatch(db, puts, { newId, now });
      // Optimistic, same shape as the server's profile: until the company pull brings the
      // user row, the Account row and the next offline boot read these values.
      const updated: UserProfile = {
        ...user,
        council: registration.council,
        registrationNumber: registration.registrationNumber,
        title: registration.title,
      };
      writeLastSession(updated);
      setUser(updated);
    },
    [user],
  );

  const doSavePhotoLocation = useCallback(
    async (enabled: boolean) => {
      const db = databaseRef.current;
      if (db === null || user === null) throw new Error('no device database to commit the location switch to');
      await commitBatch(db, [photoLocationPut({ userId: user.id, companyId: user.companyId, enabled })], { newId, now });
    },
    [user],
  );

  const value = useMemo<SessionState>(
    () => ({
      status,
      user,
      online,
      reAuthRequired,
      aiFeatures,
      recoveryNeeded,
      database,
      settled,
      signIn: doSignIn,
      signOut: doSignOut,
      saveRegistration: doSaveRegistration,
      savePhotoLocation: doSavePhotoLocation,
      // No dismissal: only a new sign-in clears `reAuthRequired`, so the paused sync
      // engine (state/sync.tsx) never resumes while the session is still gone.
      dismissRecovery,
    }),
    [
      status,
      user,
      online,
      reAuthRequired,
      aiFeatures,
      recoveryNeeded,
      database,
      settled,
      doSignIn,
      doSignOut,
      doSaveRegistration,
      doSavePhotoLocation,
      dismissRecovery,
    ],
  );

  return (
    <SessionContext value={value}>
      <AiFeaturesContext value={aiFeatures}>{children}</AiFeaturesContext>
    </SessionContext>
  );
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
