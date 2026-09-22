import type { Registration, UserProfile } from '@app/domain';
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
import { readRecoveryNotice, writeRecoveryNotice } from '../db/prefs.ts';
import { databaseName, openDatabase, type AppDatabase } from '../db/schema.ts';
import { clearLastSession, readLastSession, writeLastSession } from './last-session.ts';

/**
 * Session context (AD-8, AD-9). Boots from the cookie, holds the signed-in user, the
 * online flag and the re-auth flag, and owns the handle to this user's Dexie database.
 *
 * A 401 mid-use raises `reAuthRequired` and nothing else: the database and every store
 * stay exactly as they are.
 */

export type SessionStatus = 'booting' | 'signed-out' | 'signed-in';

export interface SessionState {
  status: SessionStatus;
  user: UserProfile | null;
  online: boolean;
  reAuthRequired: boolean;
  /**
   * AD-8: the cookie survived but the store did not. Set only on the cold-open branch
   * that had no local pointer, was confirmed by the server, and opened a database that
   * did not exist a moment ago.
   */
  recoveryNeeded: boolean;
  database: AppDatabase | null;
  signIn: (email: string, password: string) => Promise<authClient.SignInResult>;
  signOut: () => Promise<void>;
  saveRegistration: (registration: Registration) => Promise<void>;
  dismissReAuth: () => void;
  /** Hides the recovery screen and remembers it in `local_prefs`, so it is one-time. */
  dismissRecovery: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

function readOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('booting');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [online, setOnline] = useState<boolean>(readOnline);
  const [reAuthRequired, setReAuthRequired] = useState(false);
  const [recoveryNeeded, setRecoveryNeeded] = useState(false);
  const [database, setDatabase] = useState<AppDatabase | null>(null);
  const databaseRef = useRef<AppDatabase | null>(null);

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

  // Cold open. The cached pointer decides first, so a tab reopened days later with the
  // network down reaches Home from the cookie and the local database with no sign-in
  // prompt and no network wait; the server read only confirms or expires it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = readLastSession();
      if (cached !== null) {
        setUser(cached);
        await attachDatabase(cached.id);
        if (cancelled) return;
        setStatus('signed-in');
      }

      let fresh: UserProfile | null | 'unreachable';
      try {
        fresh = await authClient.readSession();
      } catch {
        fresh = 'unreachable';
      }
      if (cancelled) return;

      if (fresh === 'unreachable') {
        // Offline. A cached session keeps working; without one there is nothing to show
        // but Login, which will explain that signing in needs a connection.
        if (cached === null) setStatus('signed-out');
        return;
      }

      if (fresh === null) {
        // The server dropped the session. Local data is untouched either way.
        clearLastSession();
        if (cached === null) {
          setUser(null);
          setStatus('signed-out');
          return;
        }
        setReAuthRequired(true);
        return;
      }

      writeLastSession(fresh);
      setUser(fresh);
      const createdFresh = await attachDatabase(fresh.id);
      if (cancelled) return;
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

  useEffect(() => authClient.onReAuthRequired(() => setReAuthRequired(true)), []);

  const doSignIn = useCallback(
    async (email: string, password: string) => {
      const result = await authClient.signIn(email, password);
      if (result.ok) {
        writeLastSession(result.user);
        setUser(result.user);
        // The form path never raises the recovery screen: a first sign-in always comes
        // through here, and a fresh database is then exactly what is expected.
        await attachDatabase(result.user.id);
        setReAuthRequired(false);
        setStatus('signed-in');
      }
      return result;
    },
    [attachDatabase],
  );

  /**
   * Throws when the server could not be reached, and then clears nothing: the caller
   * shows the failure and the user stays signed in. Only a confirmed sign-out drops the
   * local session state, and never the database itself.
   */
  const doSignOut = useCallback(async () => {
    await authClient.signOut();
    clearLastSession();
    // The handle is closed, the database is kept: `Dexie.delete` is never called.
    databaseRef.current?.close();
    databaseRef.current = null;
    setDatabase(null);
    setUser(null);
    setReAuthRequired(false);
    setRecoveryNeeded(false);
    setStatus('signed-out');
  }, []);

  const doSaveRegistration = useCallback(async (registration: Registration) => {
    const updated = await authClient.saveRegistration(registration);
    writeLastSession(updated);
    setUser(updated);
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      status,
      user,
      online,
      reAuthRequired,
      recoveryNeeded,
      database,
      signIn: doSignIn,
      signOut: doSignOut,
      saveRegistration: doSaveRegistration,
      dismissReAuth: () => setReAuthRequired(false),
      dismissRecovery,
    }),
    [
      status,
      user,
      online,
      reAuthRequired,
      recoveryNeeded,
      database,
      doSignIn,
      doSignOut,
      doSaveRegistration,
      dismissRecovery,
    ],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
